import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {availableParallelism, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {applyMutant, generateMutants, mutantId} from './generateMutants';
import type {
  EquivalentMutant,
  Mutant,
  MutantResult,
  MutationCounts,
  MutationReport,
} from './mutation.types';

const mutationDirectory = import.meta.dir;
const packageDirectory = resolve(mutationDirectory, '../..');
const repositoryDirectory = resolve(packageDirectory, '../..');
const equivalentPath = join(mutationDirectory, 'equivalentMutants.json');
const resultsPath = join(mutationDirectory, 'RESULTS.md');
const reportPath = join(
  repositoryDirectory,
  'test-results/mutation/report.json',
);

/** The files held to zero unexplained survivors. */
const defaultTargets = [
  'src/core/core.ts',
  'src/core/ownership.ts',
  'src/snapshot/snapshot.ts',
  'src/collections/collections.ts',
  'src/utils/persist/persist.ts',
  'src/utils/history/history.ts',
  'src/utils/equality/equality.ts',
];

const usage = `Usage: bun run test:mutation [files...] [options]

Mutates each file, one change at a time, in a temporary copy of the package,
and runs the unit tests against every change. A change no test notices must be
listed in tests/mutation/equivalentMutants.json with a reason, or the run fails.

  files              Source files to mutate, relative to packages/classy-store.
                     Default: the seven files named in runMutation.ts.
  --concurrency <n>  Test processes to run at once. Default: CPU count minus 2.
  --sample <n>       Run a random sample of n mutants instead of all of them.
  --seed <n>         Seed for --sample. Default: 1.
  --list             Print the mutants without running anything.
`;

type Options = {
  targets: string[];
  concurrency: number;
  sample?: number;
  seed: number;
  list: boolean;
};

type TestRun = {
  passed: boolean;
  timedOut: boolean;
  output: string;
  durationMs: number;
};

function readOptions(argv: string[]): Options {
  const options: Options = {
    targets: [],
    concurrency: Math.max(1, availableParallelism() - 2),
    seed: 1,
    list: false,
  };
  const numberAfter = (flag: string, index: number): number => {
    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${flag} needs a positive whole number`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] as string;
    if (argument === '--help') {
      console.log(usage);
      process.exit(0);
    } else if (argument === '--list') {
      options.list = true;
    } else if (argument === '--concurrency') {
      options.concurrency = numberAfter(argument, index++);
    } else if (argument === '--sample') {
      options.sample = numberAfter(argument, index++);
    } else if (argument === '--seed') {
      options.seed = numberAfter(argument, index++);
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option ${argument}\n\n${usage}`);
    } else {
      options.targets.push(argument.replace(/^packages\/classy-store\//, ''));
    }
  }
  if (!options.targets.length) options.targets = [...defaultTargets];
  for (const target of options.targets) {
    if (!existsSync(join(packageDirectory, target))) {
      throw new Error(`No such file in packages/classy-store: ${target}`);
    }
  }
  return options;
}

/** Deterministic PRNG (mulberry32), so a sample replays from its seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleOf<T>(items: T[], size: number, seed: number): T[] {
  const next = random(seed);
  const picked = items.map((item, index) => ({item, index, order: next()}));
  picked.sort((a, b) => a.order - b.order);
  return picked
    .slice(0, size)
    .sort((a, b) => a.index - b.index)
    .map(({item}) => item);
}

/** Tests most likely to notice a change in this file. They run first, and a failure ends the run for that mutant. */
function nearTests(file: string): string[] {
  const [, area, group] = file.split('/');
  if (area === 'core' || area === 'snapshot')
    return ['src/core', 'src/snapshot'];
  if (area === 'utils' && group) return [`src/utils/${group}`];
  return [`src/${area}`];
}

/** A copy of the package's sources that a mutant can be written into without touching the checkout. */
function createSandbox(root: string, index: number): string {
  const directory = join(root, `sandbox-${index}`);
  mkdirSync(directory);
  cpSync(join(packageDirectory, 'src'), join(directory, 'src'), {
    recursive: true,
  });
  for (const file of [
    'bunfig.toml',
    'happydom.ts',
    'package.json',
    'tsconfig.json',
  ]) {
    cpSync(join(packageDirectory, file), join(directory, file));
  }
  symlinkSync(
    join(packageDirectory, 'node_modules'),
    join(directory, 'node_modules'),
    'dir',
  );
  return directory;
}

async function runTests(
  directory: string,
  paths: string[],
  timeoutMs: number,
): Promise<TestRun> {
  const started = performance.now();
  const child = Bun.spawn([process.execPath, 'test', ...paths, '--bail'], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0'},
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  return {
    passed: exitCode === 0 && !timedOut,
    timedOut,
    output: stderr + stdout,
    durationMs: performance.now() - started,
  };
}

/** The first failing test named in Bun's output. */
function failingTest(output: string): string | undefined {
  return /^\(fail\) (.*?)(?: \[[\d.]+ms\])?$/m.exec(output)?.[1];
}

async function runMutant(
  sandbox: string,
  mutant: Mutant,
  source: string,
  timeoutMs: number,
): Promise<MutantResult> {
  const path = join(sandbox, mutant.file);
  const started = performance.now();
  writeFileSync(path, applyMutant(source, mutant));
  try {
    let run = await runTests(sandbox, nearTests(mutant.file), timeoutMs);
    if (run.passed) run = await runTests(sandbox, ['src'], timeoutMs);
    return {
      ...mutant,
      status: run.timedOut ? 'timeout' : run.passed ? 'survived' : 'killed',
      killedBy: run.passed ? undefined : failingTest(run.output),
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    writeFileSync(path, source);
  }
}

function emptyCounts(): MutationCounts {
  return {mutants: 0, killed: 0, timeout: 0, equivalent: 0, unexplained: 0};
}

function countBy(
  results: MutantResult[],
  explained: Set<string>,
  groupOf: (result: MutantResult) => string,
): Map<string, MutationCounts> {
  const groups = new Map<string, MutationCounts>();
  for (const result of results) {
    const group = groupOf(result);
    const counts = groups.get(group) ?? emptyCounts();
    groups.set(group, counts);
    counts.mutants++;
    if (result.status === 'killed') counts.killed++;
    else if (result.status === 'timeout') counts.timeout++;
    else if (explained.has(result.id)) counts.equivalent++;
    else counts.unexplained++;
  }
  return groups;
}

function table(
  heading: string,
  groups: Map<string, MutationCounts>,
  total?: MutationCounts,
): string {
  const row = (name: string, counts: MutationCounts) =>
    `| ${name} | ${counts.mutants} | ${counts.killed} | ${counts.timeout} | ${counts.equivalent} | ${counts.unexplained} |`;
  const lines = [
    `| ${heading} | Mutants | Killed | Timed out | Equivalent | Unexplained |`,
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...[...groups].map(([name, counts]) => row(name, counts)),
  ];
  if (total) lines.push(row('Total', total));
  return lines.join('\n');
}

function writeResults(
  byFile: Map<string, MutationCounts>,
  byMutator: Map<string, MutationCounts>,
  totals: MutationCounts,
): void {
  const sortedMutators = new Map(
    [...byMutator].sort(([a], [b]) => a.localeCompare(b)),
  );
  const fileRows = new Map(
    [...byFile].map(([file, counts]) => [`\`${file}\``, counts]),
  );
  writeFileSync(
    resultsPath,
    `# Mutation results

Written by \`bun run test:mutation\` after a run of every target file. Do not
edit it by hand. See the [guide](./README.md) for the rules and for how a
surviving mutant is handled.

Bun ${Bun.version}. Tests: \`bun test src\`.

${table('File', fileRows, totals)}

## By rule

${table('Rule', sortedMutators)}
`,
  );
  Bun.spawnSync(
    [
      join(repositoryDirectory, 'node_modules/.bin/biome'),
      'format',
      '--write',
      resultsPath,
    ],
    {cwd: repositoryDirectory},
  );
}

async function main(): Promise<number> {
  const options = readOptions(process.argv.slice(2));
  const sources = new Map(
    options.targets.map((target) => [
      target,
      readFileSync(join(packageDirectory, target), 'utf8'),
    ]),
  );
  const generated = options.targets.flatMap((target) =>
    generateMutants(target, sources.get(target) as string),
  );
  const mutants =
    options.sample === undefined
      ? generated
      : sampleOf(generated, options.sample, options.seed);

  if (options.list) {
    for (const mutant of mutants) console.log(`${mutant.line}: ${mutant.id}`);
    console.log(`${mutants.length} mutants`);
    return 0;
  }

  const equivalents: EquivalentMutant[] = existsSync(equivalentPath)
    ? JSON.parse(readFileSync(equivalentPath, 'utf8'))
    : [];
  const explained = new Set(equivalents.map(mutantId));

  const concurrency = Math.min(options.concurrency, mutants.length || 1);
  const sandboxRoot = mkdtempSync(join(tmpdir(), 'classy-store-mutation-'));
  const removeSandboxes = () =>
    rmSync(sandboxRoot, {recursive: true, force: true});
  process.on('SIGINT', () => {
    removeSandboxes();
    process.exit(130);
  });

  try {
    const sandboxes = Array.from({length: concurrency}, (_, index) =>
      createSandbox(sandboxRoot, index),
    );

    // The unmodified tests must pass in every copy, at this concurrency,
    // before a failure can be blamed on a mutant.
    console.log(
      `${mutants.length} mutants in ${options.targets.length} files, ${concurrency} at a time. Checking the unmodified tests...`,
    );
    const baselines = await Promise.all(
      sandboxes.map((sandbox) => runTests(sandbox, ['src'], 300_000)),
    );
    const failedBaseline = baselines.find((run) => !run.passed);
    if (failedBaseline) {
      console.error(failedBaseline.output.split('\n').slice(-40).join('\n'));
      console.error(
        '\nThe unmodified tests failed in a sandbox. Nothing was mutated.',
      );
      return 2;
    }
    const baselineMs = Math.round(
      Math.max(...baselines.map((run) => run.durationMs)),
    );
    const timeoutMs = Math.max(30_000, baselineMs * 4);
    console.log(
      `Unmodified tests pass in ${baselineMs} ms. A mutant times out after ${timeoutMs} ms.`,
    );

    const results: MutantResult[] = [];
    let next = 0;
    let lastProgress = performance.now();
    await Promise.all(
      sandboxes.map(async (sandbox) => {
        while (next < mutants.length) {
          const mutant = mutants[next++] as Mutant;
          results.push(
            await runMutant(
              sandbox,
              mutant,
              sources.get(mutant.file) as string,
              timeoutMs,
            ),
          );
          if (performance.now() - lastProgress > 15_000) {
            lastProgress = performance.now();
            const survived = results.filter(
              (result) => result.status === 'survived',
            ).length;
            console.log(
              `${results.length}/${mutants.length} done, ${survived} survived so far`,
            );
          }
        }
      }),
    );
    results.sort(
      (a, b) =>
        options.targets.indexOf(a.file) - options.targets.indexOf(b.file) ||
        a.start - b.start ||
        a.id.localeCompare(b.id),
    );

    const unexplained: EquivalentMutant[] = results
      .filter(
        (result) => result.status === 'survived' && !explained.has(result.id),
      )
      .map(({file, scope, mutator, original, replacement, occurrence}) => ({
        file,
        scope,
        mutator,
        original,
        replacement,
        occurrence,
        reason: '',
      }));

    // An entry is only checked when every mutant of its file ran.
    const statusById = new Map(
      results.map((result) => [result.id, result.status]),
    );
    const stale =
      options.sample === undefined
        ? equivalents
            .filter((entry) => options.targets.includes(entry.file))
            .flatMap((entry) => {
              const status = statusById.get(mutantId(entry));
              if (status === 'survived') return [];
              return [
                {
                  entry,
                  problem: status
                    ? 'a test now notices this mutant'
                    : 'no such mutant: the code changed, so this needs another look',
                },
              ];
            })
        : [];

    const byFile = countBy(results, explained, (result) => result.file);
    const byMutator = countBy(results, explained, (result) => result.mutator);
    const totals = [...byFile.values()].reduce((sum, counts) => {
      for (const key of Object.keys(sum) as (keyof MutationCounts)[]) {
        sum[key] += counts[key];
      }
      return sum;
    }, emptyCounts());

    const report: MutationReport = {
      bun: Bun.version,
      concurrency,
      baselineMs,
      timeoutMs,
      targets: options.targets,
      sampled: options.sample !== undefined,
      totals,
      unexplained,
      stale,
      results,
    };
    mkdirSync(dirname(reportPath), {recursive: true});
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const isFullRun =
      options.sample === undefined &&
      defaultTargets.every((target) => options.targets.includes(target)) &&
      options.targets.length === defaultTargets.length;
    if (isFullRun) writeResults(byFile, byMutator, totals);

    console.log(`\n${table('File', byFile, totals)}\n`);
    for (const result of results) {
      if (result.status === 'survived' && !explained.has(result.id)) {
        console.log(`SURVIVED ${result.line}: ${result.id}`);
      }
    }
    for (const {entry, problem} of stale) {
      console.log(`STALE ${mutantId(entry)}\n      ${problem}`);
    }
    console.log(`\nFull report: ${reportPath}`);
    if (unexplained.length || stale.length) {
      console.log(
        `${unexplained.length} unexplained survivors, ${stale.length} stale entries in equivalentMutants.json.`,
      );
      return 1;
    }
    console.log('Every surviving mutant is explained.');
    return 0;
  } finally {
    removeSandboxes();
  }
}

process.exit(await main());

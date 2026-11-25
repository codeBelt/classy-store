import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import type {Budgets, SizeBaseline, Sizes} from './size.types';

const sizeDirectory = import.meta.dir;
const packageDirectory = resolve(sizeDirectory, '../..');
const repositoryDirectory = resolve(packageDirectory, '../..');
const baselinePath = join(sizeDirectory, 'baseline.json');
const budgetsPath = join(sizeDirectory, 'budgets.json');
const reportPath = join(repositoryDirectory, 'test-results/size/size.json');

const usage = `Usage: bun run size [--update-baseline]

Bundles each published entry point the way an application would: together with
the main entry, which every application needs, with the proxy-compare
dependency inside and the framework left out. Reports the minified and gzipped
size in bytes, and how much each entry adds to the main entry.

Fails when the main entry is larger than its budget in tests/size/budgets.json,
when another entry adds more than its budget, when a budget is above its
ceiling, or when an entry has no budget or no ceiling.

  --update-baseline  Record the measured sizes in tests/size/baseline.json.
`;

type Manifest = {
  exports: Record<string, string | {import?: {default?: string}}>;
  peerDependencies: Record<string, string>;
};

const manifest: Manifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);

/** The entry every application imports. The others are measured together with it. */
const mainEntry = '.';

/** Every entry point with an ES module build, by its export name. */
const entries = Object.entries(manifest.exports).flatMap(([name, target]) => {
  const file = typeof target === 'string' ? undefined : target.import?.default;
  return file ? [{name, file: join(packageDirectory, file)}] : [];
});

/** A framework and anything under it, such as `react` and `react/jsx-runtime`. */
const peerPattern = new RegExp(
  `^(${Object.keys(manifest.peerDependencies)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|')})(/.*)?$`,
);

/** One module that keeps every export of the given files alive. */
function combine(name: string, files: string[]): string {
  if (files.length === 1) return files[0] as string;
  const path = join(
    dirname(reportPath),
    `entry${name.replace(/[^a-z]+/g, '-')}.mjs`,
  );
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(
    path,
    files
      .map(
        (file, index) =>
          `export * as part${index} from ${JSON.stringify(file)};`,
      )
      .join('\n'),
  );
  return path;
}

async function measure(
  file: string,
): Promise<{minified: number; gzip: number}> {
  const build = await Bun.build({
    entrypoints: [file],
    target: 'browser',
    format: 'esm',
    minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [
      {
        name: 'frameworks-stay-outside',
        setup(builder) {
          builder.onResolve({filter: peerPattern}, ({path}) => ({
            path,
            external: true,
          }));
        },
      },
    ],
  });
  if (!build.success || build.outputs.length !== 1) {
    throw new Error(
      `Could not bundle ${file}:\n${build.logs.map(String).join('\n')}`,
    );
  }
  const bytes = new Uint8Array(await (build.outputs[0] as Blob).arrayBuffer());
  return {
    minified: bytes.length,
    gzip: Bun.gzipSync(bytes, {level: 9}).length,
  };
}

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function writeFormatted(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  Bun.spawnSync(
    [
      join(repositoryDirectory, 'node_modules/.bin/biome'),
      'format',
      '--write',
      path,
    ],
    {cwd: repositoryDirectory},
  );
}

const signed = (bytes: number) => (bytes > 0 ? `+${bytes}` : String(bytes));

const isBytes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Every way the measured sizes break `budgets.json`. The main entry is held to
 * its whole size and every other entry to what it adds. Each entry needs a
 * budget and a ceiling, and a budget may not be above its ceiling.
 */
export function checkSizes(sizes: Sizes, budgets: Budgets): string[] {
  const problems: string[] = [];
  for (const [name, size] of Object.entries(sizes)) {
    const entry = budgets[name];
    const budget = entry?.budget;
    const ceiling = entry?.ceiling;
    if (!isBytes(budget)) {
      problems.push(`${name} has no budget in tests/size/budgets.json`);
    }
    if (!isBytes(ceiling)) {
      problems.push(`${name} has no ceiling in tests/size/budgets.json`);
    }
    if (isBytes(budget) && isBytes(ceiling) && budget > ceiling) {
      problems.push(
        `${name} has a budget of ${budget}, ${budget - ceiling} above its ceiling of ${ceiling}`,
      );
    }
    if (!isBytes(budget)) continue;
    const isMain = name === mainEntry;
    const measured = isMain ? size.gzip : size.added;
    if (measured > budget) {
      problems.push(
        isMain
          ? `${name} is ${measured} bytes gzipped, ${measured - budget} over its budget of ${budget}`
          : `${name} adds ${measured} bytes gzipped to the main entry, ${measured - budget} over its budget of ${budget}`,
      );
    }
  }
  for (const name of Object.keys(budgets)) {
    if (!(name in sizes)) {
      problems.push(`budgets.json names ${name}, which is not an entry point`);
    }
  }
  return problems;
}

async function main(): Promise<number> {
  const flags = process.argv.slice(2);
  if (flags.includes('--help')) {
    console.log(usage);
    return 0;
  }
  const unknown = flags.find((flag) => flag !== '--update-baseline');
  if (unknown) {
    console.error(`Unknown option ${unknown}\n\n${usage}`);
    return 2;
  }
  const missing = entries.find(({file}) => !existsSync(file));
  if (missing) {
    console.error(`${missing.file} is missing. Run \`bun run build\` first.`);
    return 2;
  }

  const main = entries.find(({name}) => name === mainEntry);
  if (!main) {
    console.error(`package.json has no "${mainEntry}" export.`);
    return 2;
  }
  const mainSize = await measure(main.file);
  const sizes: Sizes = {};
  for (const {name, file} of entries) {
    const size =
      name === mainEntry
        ? mainSize
        : await measure(combine(name, [main.file, file]));
    sizes[name] = {...size, added: size.gzip - mainSize.gzip};
  }

  mkdirSync(dirname(reportPath), {recursive: true});
  writeFileSync(
    reportPath,
    `${JSON.stringify({bun: Bun.version, entries: sizes}, null, 2)}\n`,
  );
  if (flags.includes('--update-baseline')) {
    const baseline: SizeBaseline = {bun: Bun.version, entries: sizes};
    writeFormatted(baselinePath, baseline);
  }

  const baseline = readJson<SizeBaseline>(baselinePath);
  const budgets = readJson<Budgets>(budgetsPath);

  console.log(
    '| Entry | Minified | Gzipped | Adds to main | Against baseline | Budget | Ceiling |',
  );
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [name, size] of Object.entries(sizes)) {
    const isMain = name === mainEntry;
    const before = baseline?.entries[name];
    const entry = budgets?.[name];
    console.log(
      `| \`${name}\` | ${size.minified} | ${size.gzip} | ${isMain ? '' : size.added} | ${before ? signed(size.gzip - before.gzip) : 'none'} | ${entry?.budget ?? 'none'} | ${entry?.ceiling ?? 'none'} |`,
    );
  }
  const problems = budgets ? checkSizes(sizes, budgets) : [];

  console.log(
    `\nBun ${Bun.version}. Sizes are in bytes; every entry is measured together with the main one. Report: ${reportPath}`,
  );
  if (!budgets) console.log('No budgets.json yet, so nothing was enforced.');
  for (const problem of problems) console.error(`FAIL ${problem}`);
  return problems.length ? 1 : 0;
}

if (import.meta.main) process.exit(await main());

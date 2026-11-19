// Records the React benchmark's baseline from several runs, and compares later
// runs with it.
//
//   bun packages/classy-store/tests/performance/baseline.ts record <run.json>...
//   bun packages/classy-store/tests/performance/baseline.ts compare [run.json...]
//
// A run file is what `bun run benchmark:react` writes. `compare` reads
// test-results/react-performance.json when no file is given.
import {readFileSync, writeFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {join, resolve} from 'node:path';

type Run = {
  metadata: Record<string, unknown>;
  results: {
    configuration: {size: number; workload: string; mode: string};
    compiler: string;
    summary: Record<string, {medianMs: number}>;
  }[];
};

type Range = {medianMs: number; minMs: number; maxMs: number};
type Cases = Record<string, Record<string, Range>>;
type Baseline = {
  recorded: string;
  runs: number;
  machine: string;
  metadata: Record<string, unknown>;
  cases: Cases;
};

const directory = import.meta.dir;
const repositoryDirectory = resolve(directory, '../../../..');
const baselinePath = join(directory, 'baseline.json');
const lastRunPath = join(
  repositoryDirectory,
  'test-results/react-performance.json',
);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

const readRun = (path: string): Run => JSON.parse(readFileSync(path, 'utf8'));

/** For every case and operation: the median over the runs of each run's median, with the lowest and highest run. */
function summarise(runs: Run[]): Cases {
  const samples = new Map<string, Map<string, number[]>>();
  for (const run of runs) {
    for (const {configuration, compiler, summary} of run.results) {
      const key = `${configuration.workload} ${configuration.size}, ${configuration.mode}, compiler ${compiler}`;
      const operations = samples.get(key) ?? new Map<string, number[]>();
      samples.set(key, operations);
      for (const [operation, {medianMs}] of Object.entries(summary)) {
        operations.set(operation, [
          ...(operations.get(operation) ?? []),
          medianMs,
        ]);
      }
    }
  }
  const cases: Cases = {};
  for (const [key, operations] of samples) {
    cases[key] = {};
    for (const [operation, values] of operations) {
      (cases[key] as Record<string, Range>)[operation] = {
        medianMs: round(median(values)),
        minMs: round(Math.min(...values)),
        maxMs: round(Math.max(...values)),
      };
    }
  }
  return cases;
}

function record(paths: string[]): number {
  if (!paths.length) {
    console.error('record needs at least one run file');
    return 2;
  }
  const runs = paths.map(readRun);
  const {createdAt, dist, label, notes, ...metadata} = (runs[0] as Run)
    .metadata;
  const baseline: Baseline = {
    recorded: String(createdAt).slice(0, 10),
    runs: runs.length,
    machine: cpus()[0]?.model ?? 'unknown',
    metadata,
    cases: summarise(runs),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  Bun.spawnSync(
    [
      join(repositoryDirectory, 'node_modules/.bin/biome'),
      'format',
      '--write',
      baselinePath,
    ],
    {cwd: repositoryDirectory},
  );
  console.log(
    `Recorded ${Object.keys(baseline.cases).length} cases from ${runs.length} runs in ${baselinePath}`,
  );
  return 0;
}

/**
 * How far outside the baseline's spread a figure must be to count. The browser
 * clock ticks in tenths of a millisecond, so five runs often agree exactly and
 * the spread is zero; a later run one tick away is not a change.
 */
const tolerance = (before: Range) => Math.max(0.1, before.medianMs * 0.05);

function compare(paths: string[]): number {
  const baseline: Baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const current = summarise(
    (paths.length ? paths : [lastRunPath]).map(readRun),
  );
  let same = 0;
  const changed: string[] = [];
  for (const [key, operations] of Object.entries(current)) {
    for (const [operation, now] of Object.entries(operations)) {
      const before = baseline.cases[key]?.[operation];
      if (!before) {
        changed.push(
          `| ${key} | ${operation} | none | ${now.medianMs} | new |`,
        );
      } else if (now.minMs > before.maxMs + tolerance(before)) {
        changed.push(
          `| ${key} | ${operation} | ${before.medianMs} (${before.minMs} to ${before.maxMs}) | ${now.medianMs} | slower |`,
        );
      } else if (now.maxMs < before.minMs - tolerance(before)) {
        changed.push(
          `| ${key} | ${operation} | ${before.medianMs} (${before.minMs} to ${before.maxMs}) | ${now.medianMs} | faster |`,
        );
      } else {
        same++;
      }
    }
  }
  console.log(
    `Against the baseline of ${baseline.recorded} (${baseline.runs} runs): ${same} figures inside its spread, ${changed.length} outside. Milliseconds.`,
  );
  if (changed.length) {
    console.log('\n| Case | Operation | Baseline | Now | |');
    console.log('| --- | --- | ---: | ---: | --- |');
    for (const row of changed) console.log(row);
  }
  // Timings are observations to report, never a reason to fail a run.
  return 0;
}

const [command, ...paths] = process.argv.slice(2);
if (command === 'record') process.exit(record(paths));
if (command === 'compare') process.exit(compare(paths));
console.error(
  'Usage: baseline.ts record <run.json>... | compare [run.json...]',
);
process.exit(2);

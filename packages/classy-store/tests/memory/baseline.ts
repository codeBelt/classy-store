// Records the React memory suite's baseline, and compares later runs with it.
//
//   bun packages/classy-store/tests/memory/baseline.ts record <report.json>...
//   bun packages/classy-store/tests/memory/baseline.ts compare [report.json...]
//
// A report is the `report.json` that `bun run test:react:memory` writes.
// `compare` reads test-results/react-memory/report.json when none is given.
// The figures are counts of live objects after a forced collection, so they
// are expected to be the same on every run.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

type Counts = Record<string, number>;
type Report = {
  metadata: Record<string, unknown>;
  failures: string[];
  results: {
    scenario: string;
    mode: string;
    compiler: string;
    snapshots: Record<string, {counts: Counts}>;
  }[];
};

/** Live objects at each checkpoint the suite compares. */
const checkpoints = ['first', 'second', 'cleanup'] as const;
type Cases = Record<string, Record<string, Counts>>;
type Baseline = {
  recorded: string;
  runs: number;
  metadata: Record<string, unknown>;
  cases: Cases;
};

const directory = import.meta.dir;
const repositoryDirectory = resolve(directory, '../../../..');
const baselinePath = join(directory, 'baseline.json');
const lastReportPath = join(
  repositoryDirectory,
  'test-results/react-memory/report.json',
);

const readReport = (path: string): Report =>
  JSON.parse(readFileSync(path, 'utf8'));

/** The highest count seen for each case, checkpoint and kind of object. */
function summarise(reports: Report[]): Cases {
  const cases: Cases = {};
  for (const report of reports) {
    for (const {scenario, mode, compiler, snapshots} of report.results) {
      const key = `${scenario}, ${mode}, compiler ${compiler}`;
      cases[key] ??= {};
      const entry = cases[key] as Record<string, Counts>;
      for (const checkpoint of checkpoints) {
        const counts = snapshots[checkpoint]?.counts;
        if (!counts) continue;
        entry[checkpoint] ??= {};
        const highest = entry[checkpoint] as Counts;
        for (const [kind, count] of Object.entries(counts)) {
          highest[kind] = Math.max(highest[kind] ?? 0, count);
        }
      }
    }
  }
  return cases;
}

function record(paths: string[]): number {
  if (!paths.length) {
    console.error('record needs at least one report');
    return 2;
  }
  const reports = paths.map(readReport);
  const failed = reports.find((report) => report.failures.length);
  if (failed) {
    console.error(`A report has failures: ${failed.failures.join('; ')}`);
    return 1;
  }
  const {createdAt, dist, label, ...metadata} = (reports[0] as Report).metadata;
  const baseline: Baseline = {
    recorded: String(createdAt).slice(0, 10),
    runs: reports.length,
    metadata,
    cases: summarise(reports),
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
    `Recorded ${Object.keys(baseline.cases).length} cases from ${reports.length} runs in ${baselinePath}`,
  );
  return 0;
}

function compare(paths: string[]): number {
  const baseline: Baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const current = summarise(
    (paths.length ? paths : [lastReportPath]).map(readReport),
  );
  const grown: string[] = [];
  let checked = 0;
  for (const [key, entry] of Object.entries(current)) {
    for (const [checkpoint, counts] of Object.entries(entry)) {
      for (const [kind, count] of Object.entries(counts)) {
        checked++;
        const before = baseline.cases[key]?.[checkpoint]?.[kind];
        if (before === undefined || count > before) {
          grown.push(
            `${key}: ${kind} at ${checkpoint} is ${count}, baseline ${before ?? 'none'}`,
          );
        }
      }
    }
  }
  console.log(
    `Against the baseline of ${baseline.recorded}: ${checked} counts checked, ${grown.length} higher.`,
  );
  for (const line of grown) console.error(`FAIL ${line}`);
  return grown.length ? 1 : 0;
}

const [command, ...paths] = process.argv.slice(2);
if (command === 'record') process.exit(record(paths));
if (command === 'compare') process.exit(compare(paths));
console.error(
  'Usage: baseline.ts record <report.json>... | compare [report.json...]',
);
process.exit(2);

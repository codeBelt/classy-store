// Per-operation timings of the core, run against the built library.
//
// Plain JavaScript on purpose: the same file runs under Bun (JavaScriptCore)
// and Node (V8), and the two engines do not agree on what is fast.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {arch, cpus, platform, release} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  batch,
  createClassyStore,
  snapshot,
  subscribe,
} from '../../dist/index.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const benchmarkDirectory = dirname(scriptPath);
const repositoryDirectory = resolve(benchmarkDirectory, '../../../..');
const baselinePath = join(benchmarkDirectory, 'baseline.json');
const limitsPath = join(benchmarkDirectory, 'limits.json');

const bunVersion = globalThis.Bun?.version;
const runtime = bunVersion ? 'bun' : 'node';
const runtimeVersion = bunVersion ?? process.versions.node;
const engine = bunVersion ? 'JavaScriptCore' : `V8 ${process.versions.v8}`;
const reportPath = join(
  repositoryDirectory,
  `test-results/benchmark/core-${runtime}.json`,
);

const usage = `Usage: bun run benchmark:core [options]        (JavaScriptCore)
       bun run benchmark:core:node [options]   (V8)

Times single operations of the core in nanoseconds. Each run is a fresh
process; the figure for a metric is the median over the runs, and its spread is
the lowest and highest run.

  --runs <n>          Fresh processes to run. Default: 5.
  --only <names>      Only the metrics named, separated by commas. A name that
                      is a metric's exact name selects that metric; any other
                      text selects every metric whose name contains it. The
                      Proxy metric a selected ratio is divided by runs as well.
  --update-baseline   Record this engine's figures in tests/benchmark/baseline.json.
  --check             Fail when a ratio is above its limit in tests/benchmark/limits.json.
`;

/** Time one sample should take, long enough for the clock to be exact. */
const sampleMs = 20;
const warmupMs = 100;
const samplesPerRun = 21;

const rowCount = 1000;

class Counter {
  count = 0;
  label = 'a';
  nested = {deep: {value: 0}};
  rows = [];

  get double() {
    return this.count * 2;
  }

  get total() {
    let sum = 0;
    for (const row of this.rows) sum += row.value;
    return sum;
  }

  increment() {
    this.count++;
  }
}

const makeRows = () =>
  Array.from({length: rowCount}, (_, index) => ({
    id: index,
    value: index,
    done: false,
  }));

const noop = () => {};

/**
 * Each metric builds its state once, then returns a function that performs the
 * operation `iterations` times and returns something derived from the results,
 * so the engine cannot discard the work.
 *
 * @type {{name: string, about: string, setup: () => (iterations: number) => number}[]}
 */
const metrics = [
  {
    name: 'raw.read',
    about: 'Read a field of a plain object',
    setup() {
      const object = {count: 1};
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += object.count;
        return sum;
      };
    },
  },
  {
    name: 'proxy.read',
    about: 'Read a field through a Proxy that only forwards',
    setup() {
      const proxy = new Proxy(
        {count: 1},
        {get: (target, key, receiver) => Reflect.get(target, key, receiver)},
      );
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += proxy.count;
        return sum;
      };
    },
  },
  {
    name: 'store.read',
    about: 'Read a field of a store',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += store.count;
        return sum;
      };
    },
  },
  {
    name: 'store.read.nested',
    about: 'Read a field three objects deep',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          sum += store.nested.deep.value;
        }
        return sum;
      };
    },
  },
  {
    name: 'snapshot.read',
    about: 'Read a field of a snapshot',
    setup() {
      const frozen = snapshot(createClassyStore(new Counter()));
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += frozen.count;
        return sum;
      };
    },
  },
  {
    name: 'raw.write',
    about: 'Write a field of a plain object',
    setup() {
      const object = {count: 0};
      return (iterations) => {
        for (let index = 0; index < iterations; index++) object.count = index;
        return object.count;
      };
    },
  },
  {
    name: 'proxy.write',
    about: 'Write a field through a Proxy that only forwards',
    setup() {
      const proxy = new Proxy(
        {count: 0},
        {
          set: (target, key, value, receiver) =>
            Reflect.set(target, key, value, receiver),
        },
      );
      return (iterations) => {
        for (let index = 0; index < iterations; index++) proxy.count = index;
        return proxy.count;
      };
    },
  },
  {
    name: 'store.write',
    about: 'Write a field of a store nobody subscribes to',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) store.count = index;
        return store.count;
      };
    },
  },
  {
    name: 'store.write.same',
    about: 'Write the value a field already holds',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) store.count = 0;
        return store.count;
      };
    },
  },
  {
    name: 'store.write.sync',
    about: 'Write a field with one {sync: true} subscriber',
    setup() {
      const store = createClassyStore(new Counter());
      let calls = 0;
      subscribe(
        store,
        () => {
          calls++;
        },
        {sync: true},
      );
      return (iterations) => {
        for (let index = 0; index < iterations; index++) store.count = index;
        return calls;
      };
    },
  },
  {
    name: 'store.write.batched',
    about: 'Write a field with one ordinary subscriber',
    setup() {
      const store = createClassyStore(new Counter());
      let calls = 0;
      subscribe(store, () => {
        calls++;
      });
      return (iterations) => {
        for (let index = 0; index < iterations; index++) store.count = index;
        return calls;
      };
    },
  },
  {
    name: 'store.write.nested',
    about: 'Write a field three objects deep',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) {
          store.nested.deep.value = index;
        }
        return store.nested.deep.value;
      };
    },
  },
  {
    name: 'store.method',
    about: 'Call a store method that writes one field',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) store.increment();
        return store.count;
      };
    },
  },
  {
    name: 'store.batch10',
    about: 'One batch() of ten writes',
    setup() {
      const store = createClassyStore(new Counter());
      let next = 0;
      const tenWrites = () => {
        for (let write = 0; write < 10; write++) store.count = next++;
      };
      return (iterations) => {
        for (let index = 0; index < iterations; index++) batch(tenWrites);
        return store.count;
      };
    },
  },
  {
    name: 'array.pushPop',
    about: 'Push one row onto a store array and pop it again',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) {
          store.rows.push({id: index, value: index, done: false});
          store.rows.pop();
        }
        return store.rows.length;
      };
    },
  },
  {
    name: 'snapshot.cached',
    about: 'Take a snapshot when nothing changed',
    setup() {
      const store = createClassyStore(new Counter());
      snapshot(store);
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          sum += snapshot(store).count;
        }
        return sum;
      };
    },
  },
  {
    name: 'snapshot.afterWrite',
    about: `Write one of ${rowCount} rows, then take a snapshot`,
    setup() {
      const counter = new Counter();
      counter.rows = makeRows();
      const store = createClassyStore(counter);
      snapshot(store);
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          const row = store.rows[index % rowCount];
          row.value = index;
          sum += snapshot(store).rows.length;
        }
        return sum;
      };
    },
  },
  {
    name: 'snapshot.first',
    about: `Create a store of ${rowCount} rows and take its first snapshot`,
    setup() {
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          sum += snapshot(createClassyStore({rows: makeRows()})).rows.length;
        }
        return sum;
      };
    },
  },
  {
    name: 'getter.cached',
    about: 'Read a getter whose inputs did not change',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += store.double;
        return sum;
      };
    },
  },
  {
    name: 'getter.recompute',
    about: 'Write the input of a getter, then read it',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          store.count = index;
          sum += store.double;
        }
        return sum;
      };
    },
  },
  {
    name: 'getter.rows.recompute',
    about: `Write one of ${rowCount} rows, then read a getter that sums them`,
    setup() {
      const counter = new Counter();
      counter.rows = makeRows();
      const store = createClassyStore(counter);
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          store.rows[index % rowCount].value = index;
          sum += store.total;
        }
        return sum;
      };
    },
  },
  {
    name: 'create.small',
    about: 'Create a store from a small class instance',
    setup() {
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          sum += createClassyStore(new Counter()).count;
        }
        return sum;
      };
    },
  },
  {
    name: 'create.rows',
    about: `Create a store of ${rowCount} rows`,
    setup() {
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          sum += createClassyStore({rows: makeRows()}).rows.length;
        }
        return sum;
      };
    },
  },
  {
    name: 'subscribe',
    about: 'Subscribe to a store and unsubscribe again',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        for (let index = 0; index < iterations; index++) {
          subscribe(store, noop)();
        }
        return iterations;
      };
    },
  },
];

/**
 * What the library costs on top of the least a Proxy can cost. A ratio is
 * taken inside one process, so it holds on a slower machine and in CI.
 *
 * @type {{name: string, of: string, over: string}[]}
 */
const ratios = [
  {name: 'read', of: 'store.read', over: 'proxy.read'},
  {name: 'write', of: 'store.write', over: 'proxy.write'},
  {name: 'getter', of: 'getter.cached', over: 'proxy.read'},
  {name: 'snapshot', of: 'snapshot.cached', over: 'proxy.read'},
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const turn = () => new Promise((done) => setTimeout(done, 0));

let sink = 0;

/** Nanoseconds per operation: the median of the samples of one process. */
async function measure(metric) {
  const run = metric.setup();
  const time = (iterations) => {
    const started = performance.now();
    sink = (sink + run(iterations)) % 1e9;
    return performance.now() - started;
  };

  let iterations = 1;
  for (;;) {
    const elapsed = time(iterations);
    if (elapsed >= sampleMs) break;
    iterations = Math.ceil(
      iterations * Math.min(100, Math.max(2, (sampleMs * 1.2) / elapsed)),
    );
  }
  for (
    const until = performance.now() + warmupMs;
    performance.now() < until;
  ) {
    time(iterations);
  }

  const samples = [];
  for (let sample = 0; sample < samplesPerRun; sample++) {
    // Let queued notifications run outside the timed part.
    await turn();
    samples.push((time(iterations) * 1e6) / iterations);
  }
  return median(samples);
}

/**
 * The metrics `--only` selects, or a message when one of its names selects
 * nothing. A name that is a metric's exact name selects that metric alone, so
 * `store.read` does not also run `store.read.nested`; any other text selects
 * by containment, as `snapshot` does. A ratio needs both its operands, so the
 * metric a selected one is divided by is added.
 *
 * @param {string | undefined} only
 * @returns {{names: Set<string>} | {error: string}}
 */
function selectMetrics(only) {
  const all = metrics.map((metric) => metric.name);
  if (!only) return {names: new Set(all)};
  const names = new Set();
  for (const item of only.split(',').map((text) => text.trim())) {
    const matched = all.includes(item)
      ? [item]
      : all.filter((name) => item && name.includes(item));
    if (!matched.length) return {error: `--only: no metric matches "${item}"`};
    for (const name of matched) names.add(name);
  }
  for (const ratio of ratios) {
    if (names.has(ratio.of)) names.add(ratio.over);
  }
  return {names};
}

async function runChild(names) {
  const results = {};
  for (const metric of metrics) {
    if (!names.has(metric.name)) continue;
    results[metric.name] = await measure(metric);
  }
  console.log(JSON.stringify({results, sink}));
}

const round = (value) =>
  value >= 100 ? Math.round(value) : Number(value.toPrecision(3));

/** The median over the runs, with the lowest and highest run. */
function summarise(values) {
  return {
    ns: round(median(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
  };
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function writeFormatted(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  spawnSync(
    join(repositoryDirectory, 'node_modules/.bin/biome'),
    ['format', '--write', path],
    {cwd: repositoryDirectory},
  );
}

/** Two sets of runs differ when their ranges do not touch. */
function verdict(current, before) {
  if (!before) return '';
  if (current.min > before.max) return 'slower';
  if (current.max < before.min) return 'faster';
  return 'same';
}

const percent = (current, before) =>
  before ? `${(((current - before) / before) * 100).toFixed(1)}%` : '';

function main() {
  const flags = process.argv.slice(2);
  const optionValue = (flag) => {
    const index = flags.indexOf(flag);
    return index === -1 ? undefined : flags[index + 1];
  };
  if (flags.includes('--help')) {
    console.log(usage);
    return 0;
  }
  const only = optionValue('--only');
  const selected = selectMetrics(only);
  if ('error' in selected) {
    console.error(`${selected.error}\n\n${usage}`);
    return 2;
  }
  if (flags.includes('--child')) {
    return runChild(selected.names).then(() => 0);
  }

  const runs = Number(optionValue('--runs') ?? 5);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error(`--runs needs a positive whole number\n\n${usage}`);
    return 2;
  }

  /** @type {Record<string, number[]>} */
  const perMetric = {};
  /** @type {Record<string, number[]>} */
  const perRatio = {};
  for (let run = 0; run < runs; run++) {
    const child = spawnSync(
      process.execPath,
      [scriptPath, '--child', ...(only ? ['--only', only] : [])],
      {encoding: 'utf8'},
    );
    if (child.status !== 0) {
      console.error(child.stderr || child.stdout);
      return 2;
    }
    const {results} = JSON.parse(child.stdout.trim().split('\n').at(-1));
    for (const [name, value] of Object.entries(results)) {
      perMetric[name] ??= [];
      perMetric[name].push(value);
    }
    for (const ratio of ratios) {
      if (results[ratio.of] && results[ratio.over]) {
        perRatio[ratio.name] ??= [];
        perRatio[ratio.name].push(results[ratio.of] / results[ratio.over]);
      }
    }
    console.error(`run ${run + 1} of ${runs} done`);
  }

  const measured = {
    version: runtimeVersion,
    engine,
    runs,
    metrics: Object.fromEntries(
      Object.entries(perMetric).map(([name, values]) => [
        name,
        summarise(values),
      ]),
    ),
    ratios: Object.fromEntries(
      Object.entries(perRatio).map(([name, values]) => [
        name,
        summarise(values),
      ]),
    ),
  };
  const machine = {
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    os: `${platform()} ${release()} ${arch()}`,
  };

  mkdirSync(dirname(reportPath), {recursive: true});
  writeFileSync(
    reportPath,
    `${JSON.stringify({machine, [runtime]: measured, raw: perMetric}, null, 2)}\n`,
  );

  const baseline = readJson(baselinePath);
  const before = baseline?.[runtime];
  if (flags.includes('--update-baseline')) {
    writeFormatted(baselinePath, {...baseline, machine, [runtime]: measured});
  }

  console.log(
    `${runtime} ${runtimeVersion} (${engine}), ${machine.cpu}, ${runs} runs. Nanoseconds per operation.\n`,
  );
  console.log('| Metric | Median | Lowest | Highest | Baseline | Change | |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [name, now] of Object.entries(measured.metrics)) {
    const then = before?.metrics[name];
    console.log(
      `| ${name} | ${now.ns} | ${now.min} | ${now.max} | ${then?.ns ?? ''} | ${percent(now.ns, then?.ns)} | ${verdict(now, then)} |`,
    );
  }

  const limits = readJson(limitsPath)?.[runtime];
  const problems = [];
  console.log('\n| Ratio | Median | Lowest | Highest | Baseline | Limit | |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const ratio of ratios) {
    const now = measured.ratios[ratio.name];
    if (!now) continue;
    const then = before?.ratios[ratio.name];
    const limit = limits?.[ratio.name];
    console.log(
      `| ${ratio.name}: ${ratio.of} / ${ratio.over} | ${now.ns} | ${now.min} | ${now.max} | ${then?.ns ?? ''} | ${limit ?? ''} | ${verdict(now, then)} |`,
    );
    if (limit !== undefined && now.ns > limit) {
      problems.push(
        `${ratio.name} is ${now.ns} times ${ratio.over}, above its limit of ${limit}`,
      );
    }
  }
  console.log(`\nReport: ${reportPath}`);

  if (!flags.includes('--check')) return 0;
  if (!limits) {
    console.error(
      `FAIL no limits for ${runtime} in tests/benchmark/limits.json`,
    );
    return 1;
  }
  for (const problem of problems) console.error(`FAIL ${problem}`);
  return problems.length ? 1 : 0;
}

process.exit(await main());

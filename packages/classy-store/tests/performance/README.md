# React performance at scale

From the repository root, run `bun run benchmark:react`. Install Chromium first
with `cd packages/classy-store && bunx playwright install chromium` if needed.
The benchmark uses the built public library entrypoints, the installed React
version, and a local browser server. It writes JSON to
`test-results/react-performance.json` (ignored by Git).

See [the initial before/after results](./RESULTS.md) for the snapshot-target cache
optimization and its remaining costs.

The matrix mounts 200 and 1,000 controlled inputs or list rows. Each workload
runs with selectors and auto-tracking, with React Compiler off and on. Both
variants use React's **production profiling build**; the library is uncompiled.
The shared compiler helper rejects skipped components and requires memo slots
and the compiler runtime import. Compilation records are saved with the results.

For each case the runner opens five fresh pages, records mount time, warms up
each operation five times, and records twenty iterations per operation:

- Change one consumer's value.
- Write ten different values in one synchronous batch.
- Change an unread property or assign an unchanged value.
- Change a parent prop used by every consumer.
- For forms, type ten actual browser keystrokes into the middle of an input.

Each operation checks exact consumer/root commit counts. No-op and unrelated
writes must commit zero consumers; a single changed value commits one; a burst
commits ten consumers in one root commit. The input check verifies final text,
caret position, and one consumer commit per keystroke. After unmount, mutations
must trigger neither selectors nor consumer effects. Console/page errors fail.

## Measurements and limits

JSON includes raw samples, medians/p95s, consumer commits, root commits,
selector calls, Profiler rendering durations, dependency versions, browser/OS,
and a configurable build label. Effects count consumer commits because Compiler
can memoize expressions inside a component body. Selector calls are counted
separately: a component avoiding a render does not mean its selector did no work.

Operation duration covers synchronous notification, snapshot work, rendering,
and commit inside `flushSync`. It excludes browser layout/paint after the task.
Input latency runs from capture of the browser `input` event to the consumer's
layout effect, **not** from hardware input to painted pixels. Mount includes
store construction and React root creation. Profiling and counters add overhead
to both variants. These are instrumented microbenchmarks, not application SLAs.

Timing results are observations, **never CI pass/fail thresholds**. Run timing
comparisons sequentially on an otherwise idle machine with the same browser,
runtime, sizes, and sample settings. Cases use a fixed order; thermal state,
JIT, garbage collection, timer resolution, and scheduling introduce noise.
Use repeated runs and raw samples before interpreting small differences. The
suite does not measure retained heap or establish absence of memory leaks.

CI runs the full case matrix with one page and three iterations per operation.
Only compilation, behavior, and exact commit budgets gate that smoke run;
machine-dependent timing values do not.

The normal compiler matrix has additional deterministic scale regressions at
256 fields and 512 rows on React 18.0, 18.3, and 19, before and after compilation.
It covers local/parent rerenders, memoized reads, multiple writes, and removal/
remount. Source regressions also assert that hundreds of readers scan a shared
frozen list only once and keep their dependencies and readonly targets isolated.

## Reproducing a comparison

Preserve the baseline `dist` directory before rebuilding the changed library.
Both runs resolve React and proxy-compare from this checkout so only the library
build changes. Run the script directly when supplying an existing build:

```sh
BENCHMARK_DIST=/absolute/path/to/baseline/dist \
BENCHMARK_LABEL=baseline-commit \
BENCHMARK_OUTPUT=/tmp/react-baseline.json \
bun packages/classy-store/tests/performance/runPerformance.ts

BENCHMARK_LABEL=optimized \
BENCHMARK_OUTPUT=/tmp/react-optimized.json \
bun run benchmark:react
```

Optional settings: `BENCHMARK_SIZES=200,1000`, `BENCHMARK_SAMPLES=5`, and
`BENCHMARK_ITERATIONS=20`. Sizes must be at least ten for the burst workload.
No new runtime dependency or public React API is required.

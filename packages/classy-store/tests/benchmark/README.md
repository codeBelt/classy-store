# Core benchmark

Times single operations of the core (a read, a write, a snapshot, a getter) in
nanoseconds, against the built library. The React benchmark in
[`../performance`](../performance/README.md) measures commits in a browser; this
one measures the store alone.

```bash
bun run benchmark:core                       # Bun, JavaScriptCore
bun run benchmark:core:node                  # Node, V8
bun run benchmark:core --runs 9              # more runs, a tighter spread
bun run benchmark:core --only snapshot       # only the metrics named so
bun run benchmark:core --only store.read,store.method   # a list of metrics
bun run benchmark:core --update-baseline     # record this engine's figures
bun run benchmark:core --check               # fail when a ratio is over its limit
```

`--only` takes one name or several, separated by commas. A name that is a
metric's exact name selects that metric alone; any other text selects every
metric whose name contains it. When a selected metric is the top of a ratio,
the Proxy metric it is divided by runs as well, so the ratio is still
reported. A run of a few metrics takes a fraction of the time of a full one.

Run it on a quiet machine. Both engines matter: they do not agree on what is
fast, and most applications run on V8.

## Rows beyond the core

Most rows time the main entry. Two time a reactive collection, because a
lookup there runs a loop over the members:

- `collection.has.primitive`: `has()` of the last of 1,000 numbers in a
  `reactiveSet` held by a store.
- `collection.has.object`: the same with 1,000 objects, found by the raw
  object.

## How it measures

- Each run is a fresh process, so one run's compiled code and heap do not carry
  into the next. Five runs by default.
- In a run, each metric is sized so that one sample takes about 20 ms, warmed
  up for 100 ms, and sampled 21 times. The run's figure is the median sample.
- The reported figure is the median of the runs. "Lowest" and "Highest" are the
  lowest and highest run, and the gap between them is the spread.
- Two results are the "same" when their ranges overlap, and "slower" or
  "faster" when they do not. A difference inside the spread is noise.

## Ratios

A ratio is a store operation divided by the same operation on a Proxy that only
forwards, which is the least any Proxy-based store can cost. Both are timed in
one process, so a ratio holds on a slower machine and in CI where a time in
nanoseconds does not. `limits.json` holds the limit for each ratio and engine,
and `--check` enforces it. `CONSTRAINTS.md` at the repository root says where
the limits come from.

A forwarding Proxy is about ten times slower on V8 than on JavaScriptCore, so
the same library gives different ratios on the two engines, and each engine has
its own limits.

## Files

- [`baseline.json`](./baseline.json) holds the figures later changes are
  compared with, per engine, and the machine they were taken on.
- `test-results/benchmark/core-<engine>.json` (ignored by Git) holds the last
  run, with the figure of every single run.

Bun loads the CommonJS build of the shared runtime and Node the ES module
build, as each does for an application that imports the package.

# React scale results — 2026-10-20

Baseline: commit `5912dd4`. Optimized: guarded shared snapshot-target cache.
Both builds used the same benchmark consumer and dependencies. Measurements
were collected sequentially after other test processes finished.

Environment: React 19.3.1, React Compiler 1.0.0, Chromium 156.0.8078.4,
Bun 1.3.14, macOS Darwin 25.6.0 arm64. Both variants use production profiling.
Each case used five fresh pages, five warmup operations, and twenty measured
iterations per operation per page. See [methodology](./README.md) for limits.

## 1,000 consumers

Values are median milliseconds, baseline → optimized. Parent updates change
a prop used by every consumer; single-value updates change only one consumer.

| Workload | Subscription | Compiler | Mount | Parent update | Single update | Ten writes |
|---|---|---|---:|---:|---:|---:|
| form | selector | off | 24.9 → 25.1 | 3.6 → 3.5 | 0.5 → 0.5 | 1.4 → 1.4 |
| form | selector | on | 25.6 → 26.0 | 3.8 → 3.7 | 0.5 → 0.5 | 1.4 → 1.4 |
| form | tracked | off | 114.9 → 29.3 | 87.1 → 5.2 | 0.7 → 0.7 | 3.3 → 2.1 |
| form | tracked | on | 115.2 → 31.3 | 87.3 → 5.7 | 0.7 → 0.7 | 3.2 → 2.2 |
| list | selector | off | 17.1 → 16.9 | 3.8 → 4.0 | 0.5 → 0.5 | 1.4 → 1.4 |
| list | selector | on | 17.1 → 17.3 | 3.9 → 4.0 | 0.5 → 0.5 | 1.4 → 1.4 |
| list | tracked | off | 105.5 → 21.5 | 86.7 → 5.6 | 0.7 → 0.7 | 3.1 → 2.1 |
| list | tracked | on | 107.4 → 22.9 | 86.7 → 6.3 | 0.7 → 0.7 | 3.1 → 2.2 |

## 200 consumers

| Workload | Subscription | Compiler | Mount | Parent update |
|---|---|---|---:|---:|
| form | selector | off | 9.0 → 8.7 | 0.8 → 0.7 |
| form | selector | on | 9.8 → 9.6 | 0.8 → 0.7 |
| form | tracked | off | 14.8 → 10.4 | 4.9 → 1.0 |
| form | tracked | on | 15.0 → 11.0 | 4.9 → 1.0 |
| list | selector | off | 8.1 → 7.9 | 0.8 → 0.8 |
| list | selector | on | 8.7 → 8.9 | 0.8 → 0.8 |
| list | tracked | off | 13.6 → 10.3 | 4.8 → 1.1 |
| list | tracked | on | 13.6 → 10.3 | 4.9 → 1.2 |

## Interpretation

The removed bottleneck was repeated descriptor scanning and copying of frozen
snapshot arrays for every auto-tracked consumer. Sharing guarded copies reduced
the large auto-tracked mount and parent-update costs. Selector paths are unchanged.
The deterministic source regression verifies one array descriptor scan across
1,000 independent readers instead of relying on these machine-dependent timings.

Single-consumer updates did not materially improve: all subscribers still check
the new snapshot, even when only one consumer commits. At 1,000 fields, median
input-event-to-layout-effect time was 0.5 → 0.5 ms for selectors and 0.7 → 0.8 ms
for auto-tracking, with Compiler either off or on. These instrumented measurements
do not establish an input-latency improvement or measure paint. Small differences
are sensitive to timer resolution and scheduling.

Compiler does not remove the store notification work. These specific workloads
force relevant parent props to change, so they do not demonstrate every benefit
of Compiler memoization. Existing compiler regressions separately cover skipped
reads and memoized children.

Every measured case passed exact commit budgets, no-op/unread update filtering,
unmount checks, and (for forms) real typing/caret assertions. Five compiled
components each reported successful compilation with memo slots. The cache keeps
per-consumer proxies and reads separate, rejects reflective mutations of shared
copies, and leaves mutable computed results uncached. Normal subscriptions retain
their existing microtask batching; React notifications remain synchronous.

Timing data is observational and is not a CI threshold. CI runs a reduced-sample
version of the same matrix to check compilation, behavior, and commit counts.
The runner writes raw timings, metrics, and compilation records to JSON for
future comparisons. This run does not measure heap retention or prove leak freedom.

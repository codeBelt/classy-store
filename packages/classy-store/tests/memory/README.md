# React memory retention

From the repository root, run:

```sh
bun run test:react:memory
```

Install Chromium first with `cd packages/classy-store && bunx playwright install
chromium` if needed. The command builds the library, then runs a local browser
harness against the built public entrypoints. Snapshots and `report.json` are
written to `test-results/react-memory/`, which Git ignores. Raw snapshots can be
large; use a separate output directory for each comparison you want to retain.

The matrix runs five scenarios with primitive selectors, object selectors, and
auto-tracking, with React Compiler off and on: **30 combinations**. Primitive
selectors return the displayed text; object selectors return its containing row
snapshot, exercising object identity and retained selections. Both builds use
production React. The Compiler-on build compiles the consumer components; the
library stays uncompiled. The compiler helper
requires successful component compilation, memo slots, and a runtime import,
and the report records which functions were compiled.

## Scenarios

| Scenario | Work performed each cycle | Expected ownership |
| --- | --- | --- |
| `mount` | Unmount the React root and mount a new scoped store. | Previous mounts release their stores and data. |
| `reset` | Change the scoped component's key within the existing root. | Retired component instances release their stores and data. |
| `replace` | Replace the collection while carrying its previous last row into the new first slot. | The live collection keeps that shared row; older generations must not form an accumulating history through tracking caches. |
| `truncate` | Populate and read live row proxies, then set array length to zero. Refill with varying lengths. | Removed indices release child proxies; shrinking refills cannot hide stale high-index caches. |
| `detached` | Keep one row proxy, replace its store's collection, then unmount. | The held row and its collection marker intentionally survive; its former store must be collectible. |

The first four scenarios finish each measurement batch with a mounted consumer.
The runner checks displayed values as well as memory. The detached scenario
checks that the number of deliberately held row proxies equals completed cycles.
Final cleanup unmounts everything and releases those explicit references.

## Measurement and assertions

Every combination opens a fresh page. The runner first holds one collection
marker as a positive control, verifies that the heap parser finds it, releases
it, and verifies its disappearance. It then captures heaps after one batch and
after a second equal batch, followed by complete cleanup. Defaults are 25 cycles
per batch and 64 rows per collection.

React cleanup and browser tasks settle before collection. The Chrome DevTools
Protocol requests garbage collection twice, across separate browser tasks,
before each full V8 heap snapshot. Constructor names are preserved in the
browser bundle. `MemoryStoreMarker` and `MemoryCollectionMarker` are opaque
objects shared between mutable state and its snapshots, so their counts identify
store and collection generations rather than copies made by snapshotting.

The parser derives node offsets and type labels from snapshot metadata. It
counts exact object instances, excluding identically named constructor functions,
strings, and native nodes. Reports also include `TrackingReadMap` instance counts,
node self-size totals, CDP heap usage, runtime/browser versions, and the build
path and label. Self size is neither retained size nor browser process memory.

Pass/fail checks use object counts:

- Both measurement batches must expose at least one mounted store marker, with
  at most two stores. Mounts and resets allow two collection generations for
  React's current and alternate trees. Rolling replacements allow two for
  selectors (the current and deliberately shared prior generation) and three
  for auto-tracking (also the previous committed effect's reads).
- Truncation must leave zero collection markers, including the initial data
  snapshotted before the mutable array first became tracked.
- Detached cases must retain no former store markers. Their collection markers
  must equal the number of deliberately held rows until cleanup.
- Full cleanup must leave zero store markers, collection markers, and tracking
  read maps in every case.
- Browser errors, failed positive controls, stale output, and failed compilation
  also fail the run.

Heap bytes and live-phase `TrackingReadMap` counts are diagnostic measurements,
not CI thresholds. The parser does not present an ordinary edge walk as proof of strong
retention: V8 WeakMap ephemeron edges need special interpretation. Load the raw
`.heapsnapshot` files in Chrome DevTools Memory to inspect retaining paths when a
marker count is unexpected.

These are controlled Chromium experiments with the installed React version.
They provide evidence for the tested ownership patterns, not proof that every
application or browser is leak-free. Forced collection also does not describe
normal browser GC timing or peak allocation rates.

## Reproducing a comparison

Preserve a baseline `dist` directory before rebuilding. Run the harness directly
when targeting an existing build, so the root command does not rebuild it:

```sh
MEMORY_DIST=/absolute/path/to/baseline/dist \
MEMORY_LABEL=baseline \
MEMORY_OUTPUT=/tmp/classy-memory-baseline \
MEMORY_OBSERVE_ONLY=1 \
bun packages/classy-store/tests/memory/runMemory.ts

MEMORY_LABEL=fixed \
MEMORY_OUTPUT=/tmp/classy-memory-fixed \
bun run test:react:memory
```

`MEMORY_OBSERVE_ONLY=1` records retention-bound failures without failing the
process, which is useful for a known leaking baseline. It still checks controls,
compilation, and rendered behavior. Do not use this option for CI validation.

Optional settings are `MEMORY_CYCLES=25`, `MEMORY_SIZE=64`, and
`MEMORY_SCENARIOS=mount,reset,replace,truncate,detached`. Cycle counts must be
positive integers; size must be at least two. Compiler and subscription modes
always run every variant. CI runs all 30 combinations with six cycles per batch
and 24 rows. Keep build, browser, and workload settings identical when comparing
before and after reports.

The normal `bun run test` command also runs the synthetic heap-parser tests.
Run them alone with:

```sh
bun test packages/classy-store/tests/memory/heapSnapshot.test.ts
```

`bun run typecheck` includes the complete memory harness.

## Runtime requirement

React auto-tracking now uses native **`WeakRef`** (ES2021) to publish committed
reads without retaining obsolete snapshots from abandoned renders. Applications
using auto-tracking need a runtime with `WeakRef` support. TypeScript compilation
does not supply this runtime feature, and a strong-reference shim would defeat
the memory guarantee. The harness uses the installed Playwright Chromium, which
supports it. This requirement is separate from the supported React version range.

# React memory retention results

Measured on 2026-10-20 against the pre-memory-fix build at `583c532` and the
working-tree fixes. Both builds used the same production consumer fixtures,
React 19.3.1, React Compiler 1.0.0, Chromium 156.0.8078.4, Bun 1.3.14, and
macOS/Darwin 25.6.0 arm64. Collections contained 64 rows; heap snapshots followed
25 and 50 cycles. Each run covered all 30 scenario/mode/compiler combinations.

These are **live constructor-instance counts after forced GC**, not heap-byte
estimates. See [the methodology](./README.md) for controls and reproduction.
Arrows below compare the two checkpoints within one run.

| Workload / retained object | Before: 25 → 50 cycles | After: 25 → 50 cycles |
| --- | ---: | ---: |
| Repeated mounts: stores / collection generations | 1 / 1 → 1 / 1 | 1 / 1 → 1 / 1 |
| Keyed resets: stores / collection generations | 1 / 1 → 1 / 1 | 1 / 1 → 1 / 1 |
| Rolling replacement, auto-tracking: collection generations | 26 → 51 | 3 → 3 |
| Rolling replacement, stable object selector: collection generations | 3 → 3 | 2 → 2 |
| Rolling replacement, primitive selector, Compiler off: collection generations | 3 → 3 | 2 → 2 |
| Rolling replacement, primitive selector, Compiler on: collection generations | 2 → 2 | 2 → 2 |
| Truncation and shrinking refills: collection generations | 26 → 51 | 0 → 0 |
| Held detached rows: former stores | 25 → 50 | 0 → 0 |

Except where explicitly separated, results were identical with Compiler off
and on, and across all applicable selector modes. Detached rows deliberately
retain their own collection markers: 25 then 50 in both builds. Those references
are released during cleanup. Every cleanup snapshot in both builds contained
zero store markers, collection markers, and tracking read maps. The defects
therefore required live owners or detached references; unmount-only tests would
not have revealed them.

## What changed

- Removed child proxies no longer retain their former parents. Native array
  truncation also evicts cached indices, including partial truncations rejected
  by a non-configurable slot. Failed writes/deletes preserve valid connections.
- Render read maps and their commit queues use weak references. A structurally
  shared child can no longer anchor an accumulating chain of old snapshot roots.
- Stable subscription and selector callbacks are constructed outside the hook's
  render scope. This removes initial results retained through shared closure
  contexts while preserving memoization and hydration behavior.
- Transitioning a raw object into versioned snapshot tracking discards its
  obsolete untracked clone. It also fixes stale snapshot reads when a fresh
  store subsequently uses that raw object.

Intermediate snapshots isolated the causes: weak read maps alone reduced
tracked replacement from growing history to five generations; callback
isolation reduced that to three. After the core truncation fix, one initial
generation remained through `untrackedCache`; cache eviction reduced it to zero.
Retainer inspection checked both ordinary strong paths and WeakMap key/value
conditions rather than treating every heap edge as a strong reference.

The remaining replacement generations have live owners: the current collection,
the deliberately shared prior row, and in auto-tracked mode the prior committed
React effect's reads. Counts stayed constant when the cycle count doubled.
Prepared hydration stores intentionally retain their initial snapshot; this
experiment uses client-only stores and does not attempt to remove that contract.

## Regression and independent QA coverage

- 495 source/parser tests passed, including deterministic removed-child,
  failed-write, snapshot-cache, and committed-read regressions.
- React 18.0.0, 18.3.1, and 19.3.1: 18 tests before compilation and 41 after
  compilation per version, 177 successful executions. All 17 fixture components
  produced actual Compiler memoization. Tests include StrictMode mounts, keyed
  resets, store switches, collection replacement, truncation, and cleanup.
- Independent QA repeated all 30 heap configurations with 24 rows and 6/12
  cycles. It confirmed the same bounded counts, zero truncated generations,
  zero detached former stores, and complete cleanup.
- The existing Chromium/Firefox/WebKit suite passed 85 tests with eight existing
  clipboard skips. The 16-case performance smoke preserved exact commit budgets
  and real-input behavior. Timing samples from that smoke are not a performance
  comparison; they ran alongside other validation.

Raw local evidence from this run is under `/tmp/classy-memory-baseline-final`,
`/tmp/classy-memory-fixed-complete`, and
`/tmp/classy-memory-independent-complete-qa`. Each directory contains
`report.json` and the corresponding `.heapsnapshot` files. These machine-local
artifacts are not committed; use the documented commands to regenerate them.

The evidence covers these ownership patterns in the tested Chromium runtime.
It does not prove every application is leak-free or describe normal GC timing.
Auto-tracked consumers now require native `WeakRef` support (ES2021).

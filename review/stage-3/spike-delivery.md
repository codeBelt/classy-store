# Stage 3 spikes: subscriber delivery and transactions

Stage 3 of the pre-1.0 review, 2026-11-19. Nothing here is decided and no
library source was changed. Every spike ran in a throwaway worktree at
`216b3d1`, was measured against the same worktree unmodified, and is saved as
a patch in the appendix. The appendix also holds the reproduction scripts, so
this report can be picked up with an empty scratchpad.

Subject: `notifyMutation`, `settleTransaction`, `transactional`, `batch`,
`deliver` and `subscribe` in `packages/classy-store/src/core/core.ts`. Stage 1
findings 18 to 24 and 43, stage 2 defect 20, and entries M28 to M32 of
`review/stage-3/merged.md`.

## Summary

| Item                             | Result                                                                                                                                                               | Recommendation                                                              | Label                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| D1. One delivery queue           | Removes stage 1 findings 18 to 22 on both paths. 16 tests change, none a regression. Main entry 3,824 bytes, 163 more and 74 over its budget                         | Do it                                                                       | Before 1.0                                    |
| D2. A subscriber's error         | Throwing to the writer hides a method's own error and its return value; 12 tests pin today's isolation. A handler for a rejected promise costs 25 bytes and one test | Keep `console.error`. Add the rejection handler. Do not throw to the writer | The rule: before 1.0. The handler: can follow |
| D3. A setter is a transaction    | Eight lines, 5 bytes. The two tests that pin finding 43 change                                                                                                       | Do it                                                                       | Before 1.0                                    |
| D4. `batch()` and promises       | A type refuses a callback that returns a promise for 0 bytes; it also refuses a harmless shape and a generic wrapper. A runtime check costs 50 to 85 bytes           | Take the type. Keep a runtime check for a development build                 | The type: before 1.0. The check: can follow   |
| D5. The default of `subscribe()` | Batched gives 1 call per turn in every case measured. Synchronous gives 2 for two direct writes and for `Object.assign`, and 4 around an `await`                     | Keep the batched default. State it at the top of the reference              | No change                                     |
| The combination                  | D1, D3, the rejection handler and the type. 19 tests change, none a regression. Main entry 3,850 bytes, 189 more and 100 over its budget                             | As above                                                                    |                                               |

Three things the owner should know before the detail:

1. **The size budget of the main entry has to move, or D1 has to lose its
   message.** 89 bytes were free. The queue itself costs 33. The bound of 100
   rounds with a message that says what happened costs 75 to 130 more.
2. **D1 changes when subscribers of another store are called.** A write made
   inside a synchronous subscriber is delivered after the round that is
   running, to every store. Stage 1 pinned the opposite, and no document
   promises either.
3. **D1 makes a direct write with a synchronous subscriber slower** by about
   85 nanoseconds on Bun and 30 on Node, and makes every other write
   faster. A variant that avoids the slowdown costs 30 more bytes.

## Baseline

The unmodified worktree at `216b3d1`, measured on 2026-11-19 on an Apple M1
Max while other agents were running. Bun 1.4.4, Node 24.21.0.

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes. It needs a
  build first; in a fresh worktree it fails on
  `@codebelt/classy-store/utils` until `bun run build` has run.
- `bun run size`: main entry 3,661 bytes gzipped against a budget of 3,750.
  The other entries are in the table under "The combination".
- `bun run benchmark:core` and `benchmark:core:node`: in each table below,
  next to the spike. The baseline build was timed twice, once before the
  spikes and once after the combination, and a table shows both when it has
  them. A difference from the first run that the second run does not confirm
  is noise.
- Reproductions: every finding the spikes aim at reproduces. The output is in
  each entry's "before" column.

Each build was copied aside before it was timed, so that the worktree could
be rebuilt for the next spike. The benchmark script and its inputs were the
same for every build.

## D1. One delivery queue

**Question.** Can one queue remove stage 1 findings 18 to 22 in both delivery
paths, and what does it cost? Behind it: stage 1 findings 18 to 22, MobX 5,
Signals 8, Vue 9, Svelte 11, Valtio V6, Zustand and Jotai 9, merged entry M28
and contradiction 12.

**What was changed.** `core.ts` only, 72 lines added and 36 removed
(`d1.patch`).

- `notifyMutation` no longer calls subscribers itself. It bumps the versions,
  adds each owner that has subscribers to `pendingSync` or `pendingBatched`,
  queues the microtask if none is queued, and calls `flushSync()` when no
  transaction is open.
- `flushSync()` returns at once when a delivery is already running. That one
  flag is what turns a write made by a subscriber into a queued write.
- `drain()` replaces `deliver()` and serves both paths. It works in rounds: it
  copies the subscribers of every pending node, clears the set, and calls
  them. A write made during a round fills the set again and is served by the
  next round. After 100 rounds it clears the set and reports an error.
- `subscribe()` gives each subscription the node version it last saw. The
  subscription skips a call when it has been removed, or when the version has
  not moved since its last call or since it was created. This is MobX 5's
  third step, and it costs 12 bytes.
- The microtask path drains every round inside one microtask.

**Reproductions**, from `repro.ts` in the appendix, before and after:

| Finding                                                     | Unmodified                                                  | D1                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 18. Sync subscriber that writes on every call               | 3,040 calls, then a `RangeError` to `console.error`         | 100 calls, count 101, one named error to `console.error`     |
| 19. Batched subscriber that writes on every call            | 5,000 calls, where the script stops it; a due timer waits   | 100 calls, count 101, one named error; the timer then runs   |
| 20. Second subscriber removed by the first, both kinds      | `first, second`                                             | `first`                                                      |
| 20. Root subscriber removed by a nested one, both kinds     | `user, root`                                                | `user`                                                       |
| 21. Batched, added after a write, another one existed       | `early, late`                                               | `early`                                                      |
| 21. Sync, added inside `batch()` after a write              | `early, late`                                               | `early`                                                      |
| 21. Batched, added during delivery after a re-entrant write | the new one is called for the write made before it existed  | first called for the next write                              |
| 22. Re-entrant write, sync                                  | `first:1, first:2, second:2, second:2`, same snapshot twice | `first:1, second:2, first:2`                                 |
| 22. Re-entrant write, batched                               | `first:1, second:2, first:2, second:2`, same snapshot twice | `first:1, second:2, first:2`                                 |
| A sync subscriber writes to a second store                  | the second store's subscriber runs inside the write         | it runs after the first store's round                        |
| Two stores whose subscribers write to each other            | 1,502 writes each, two `RangeError`s                        | 51 and 50 writes, one named error; delivery works afterwards |
| `console.error` replaced by a function that throws          | the writer gets that error; the next write is delivered     | the same                                                     |

The order after D1 for a re-entrant write, `first:1, second:2, first:2`, is
the order MobX and Preact give (MobX 5, Signals 8).

The error reads: "@codebelt/classy-store: delivery stopped after 100 rounds,
because a subscriber of Ping writes to the store every time it is called".
`Ping` is the class of the node that was still pending. A plain object gives
`Object`.

**Tests.** 1,325 pass and 16 fail, of 1,341. None is a regression. All 16 are
in two files.

`src/core/core.characterisation.notifications.test.ts`, 15 tests:

| Test                                                                                                                                                                     | Class                 | Why                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| subscribing or unsubscribing between a write and its delivery > a batched subscriber added after a write is told about it when its node already had a batched subscriber | Fixes                 | Finding 21                                                                                   |
| … > a sync subscriber added inside a batch after a write is told about it when its node already had a sync subscriber                                                    | Fixes                 | Finding 21                                                                                   |
| a write made inside a sync subscriber > is delivered at once, inside the delivery that is still running                                                                  | Fixes                 | Pins the nested delivery that causes 18 and 22                                               |
| … > a subscriber that runs after the writing one is called twice with the same snapshot                                                                                  | Fixes                 | Finding 22                                                                                   |
| … > a subscriber that runs before the writing one sees each state in turn                                                                                                | Fixes                 | It still sees each state in turn. Only the nesting of the calls changed                      |
| … > a write to a second store notifies that store before the first store has finished its own delivery                                                                   | Incidental            | The queue is one for all stores. See "What it changes", point 2                              |
| … > writes grouped by batch() inside the subscriber are delivered once, when that batch ends                                                                             | Fixes                 | Delivered once, after the round. The duplicate call to the reader is gone (22)               |
| … > when the subscriber writes on every call > recurses until the stack overflows, and reports the overflow instead of throwing it to the writer                         | Fixes                 | Finding 18                                                                                   |
| a write made inside a batched subscriber > is delivered by a microtask of its own, after the delivery that is running                                                    | Fixes, and incidental | The duplicate call is gone (22). The second round now runs before a microtask queued earlier |
| … > a subscriber that runs after the writing one is called again with an unchanged snapshot                                                                              | Fixes                 | Finding 22                                                                                   |
| a subscriber that throws > a throw inside a nested delivery is reported once for each delivery, and both deliveries finish                                               | Fixes                 | There is no nested delivery. The thrower is called and reported once                         |
| unsubscribing during delivery > a sync subscriber removed by an earlier one is still called once in the delivery that is running                                         | Fixes                 | Finding 20                                                                                   |
| … > a batched subscriber removed by an earlier one is still called once in the delivery that is running                                                                  | Fixes                 | Finding 20                                                                                   |
| … > a root sync subscriber removed by a nested one is still called once in the delivery that is running                                                                  | Fixes                 | Finding 20                                                                                   |
| … > a root batched subscriber removed by a nested one is still called once in the delivery that is running                                                               | Fixes                 | Finding 20                                                                                   |

`src/core/core.deliveryTurns.test.ts`, 1 test:

| Test                                                                                                                                                           | Class      | Why                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| several writes in one turn, answered by a write from the subscriber > are delivered once, and the answering write after a microtask that was queued in between | Incidental | The answering write is delivered in the same microtask, before the other one |

Every adapter, `persist`, `withHistory`, `devtools` and `subscribeKey` test
passes unchanged.

**Typecheck.** Passes.

**Size**, gzipped bytes of the main entry, budget 3,750. Every other entry
grows by the same amount, because each is measured together with the main
one; none of their own budgets is touched.

| Variant                                                            |  Size | Against 3,661 | Against the budget |
| ------------------------------------------------------------------ | ----: | ------------: | -----------------: |
| Unmodified                                                         | 3,661 |             0 |           89 under |
| D1 without the bound (`d1-nobound`)                                | 3,694 |           +33 |           56 under |
| D1 without the last-seen version, long message, no class name      | 3,779 |          +118 |            29 over |
| D1, short message, no class name (`d1-shortmsg`)                   | 3,769 |          +108 |            19 over |
| D1, long message, no class name (`d1-noname`)                      | 3,791 |          +130 |            41 over |
| **D1 as spiked**: long message with the class name                 | 3,824 |          +163 |            74 over |
| D1 with one microtask per batched round (`d1-microtask-per-round`) | 3,854 |          +193 |           104 over |

The queue, the removed-subscriber check and the last-seen version together
cost 33 bytes. The bound costs 75 to 130 more, and most of that is the text
of the message.

**Timings.** Bun 1.4.4, nanoseconds per operation, median of five runs with the lowest and highest run:

| Metric                |                base |                  d1 | Spike against base |
| --------------------- | ------------------: | ------------------: | ------------------ |
| `store.write`         |    171 (166 to 177) |    140 (137 to 141) | faster             |
| `store.write.same`    | 35.2 (34.9 to 36.3) | 35.2 (35.2 to 35.6) | same               |
| `store.write.sync`    |    181 (180 to 193) |    270 (263 to 273) | slower             |
| `store.write.batched` |    183 (180 to 198) |    156 (147 to 160) | faster             |
| `store.write.nested`  |    322 (319 to 340) |    243 (233 to 246) | faster             |
| `store.method`        |    245 (241 to 262) |    240 (232 to 249) | same               |
| `store.batch10`       | 1523 (1506 to 1601) | 1481 (1421 to 1527) | same               |
| `array.pushPop`       | 1817 (1769 to 2048) | 1825 (1717 to 2331) | same               |
| `store.read`          | 31.7 (31.6 to 32.5) | 31.9 (31.5 to 32.4) | same               |
| `snapshot.cached`     | 15.7 (15.1 to 16.2) |   15.7 (15 to 16.6) | same               |
| `getter.cached`       | 72.3 (59.6 to 80.8) |     72 (68 to 73.7) | same               |
| `subscribe`           |   46.6 (46 to 47.8) |   46.6 (44.5 to 50) | same               |
| Ratio: read           |   15.6 (14 to 16.1) | 15.6 (13.9 to 16.1) | same               |
| Ratio: write          | 2.69 (2.63 to 2.75) |  2.21 (2.2 to 2.23) | faster             |
| Ratio: getter         | 33.3 (28.7 to 40.1) | 34.6 (29.9 to 37.2) | same               |
| Ratio: snapshot       | 7.66 (7.13 to 7.79) | 7.44 (6.66 to 7.95) | same               |

Node 24.21.0, nanoseconds per operation, median of five runs with the lowest and highest run:

| Metric                |                base |                  d1 | Spike against base |
| --------------------- | ------------------: | ------------------: | ------------------ |
| `store.write`         |    217 (206 to 226) |    165 (164 to 166) | faster             |
| `store.write.same`    |   58.4 (56.8 to 62) |   58 (57.3 to 58.1) | same               |
| `store.write.sync`    |    264 (249 to 283) |    280 (277 to 292) | same               |
| `store.write.batched` |    220 (216 to 236) |    163 (163 to 165) | faster             |
| `store.write.nested`  |    515 (504 to 526) |    314 (311 to 317) | faster             |
| `store.method`        |    298 (292 to 308) |    282 (279 to 288) | faster             |
| `store.batch10`       | 1700 (1674 to 1755) | 1551 (1542 to 1571) | faster             |
| `array.pushPop`       | 3875 (3533 to 4083) | 3552 (3275 to 3633) | same               |
| `store.read`          | 47.7 (47.3 to 49.8) | 47.7 (47.4 to 48.9) | same               |
| `snapshot.cached`     | 32.2 (31.6 to 33.3) |   29.3 (26 to 31.4) | faster             |
| `getter.cached`       | 82.7 (81.9 to 84.8) | 84.1 (81.7 to 84.8) | same               |
| `subscribe`           | 58.2 (55.9 to 58.7) |   56.9 (56.3 to 60) | same               |
| Ratio: read           |    2.03 (2 to 2.11) | 2.05 (2.03 to 2.08) | same               |
| Ratio: write          |  1.4 (1.14 to 1.43) | 1.06 (1.05 to 1.06) | faster             |
| Ratio: getter         | 3.49 (3.34 to 3.66) | 3.59 (3.48 to 3.64) | same               |
| Ratio: snapshot       | 1.35 (1.31 to 1.44) | 1.25 (1.11 to 1.34) | same               |

**What it changes for a user.**

1. A subscriber is not called again for a state it has already been told
   about, is not called after it was removed, and is not told about a write
   made before it subscribed. These are findings 20 to 22.
2. A write made inside a synchronous subscriber is no longer delivered inside
   that write. Its subscribers are called when the round that is running
   ends, still before the outermost write returns. This holds across stores:
   after `second.value = 1` inside a subscriber of `first`, the subscribers of
   `second` have not run yet when that line returns. Reads are current at
   once, as inside a transaction. A framework binding of `second` updates a
   few calls later in the same stack.
3. A write made inside a batched subscriber is delivered in the same
   microtask, after the round that is running. Today it gets a later
   microtask, behind any microtask queued in between.
4. A subscriber that writes on every call is stopped after 100 rounds. The
   store keeps the 100 writes. Subscribers that were waiting are not called
   for them, and are called at the next write.
5. A subscriber that corrects state is still called for its own write, once,
   as in MobX and Preact. It must stop writing once the state is right, which
   `if (store.copy !== store.source)` does.

The reference says nothing about a removed or late subscriber, re-entrant
writes or the order across stores, so no documented sentence changes. Stage 1
pinned all of it. The decision document should mark these as **unspecified**:
the order of calls when a subscriber writes, and the microtask in which a
batched subscriber hears of a write made by another batched subscriber. It
should mark these as **guaranteed**: a removed subscriber is not called, a
subscriber is not told about a write made before it subscribed, and a write
made during delivery is delivered after the current round and before the
outermost write returns.

**Three choices inside D1 for the owner.**

- **Does a subscriber hear of its own write?** As spiked, yes (MobX,
  Preact). Vue's rule is that it does not. I ran that as
  `d1-own-writes-skipped`, a change of five lines: 17 tests fail, the 16
  above and "a write made inside a batched subscriber > a subscriber that
  writes on each call is served in back-to-back microtasks, ahead of a timer
  that was already due", because the subscriber is no longer called for its
  own write and stops at 2. A lone subscriber that always writes then never
  loops; the bound still stops two that write to each other. I would not take
  it. A batched subscriber that writes also misses what synchronous
  subscribers wrote in answer, because those run inside its call.
- **One microtask for every batched round, or one each?** As spiked, one for
  all, as Vue's scheduler and Svelte do. `d1-microtask-per-round` keeps
  today's rule. It passes the `deliveryTurns` test, so 15 tests fail instead
  of 16, and it costs 30 bytes more and a second counter. I would take one
  microtask for all: it is the same rule as the synchronous path.
- **The message.** A class name costs 33 bytes and says `Object` for a plain
  object. The long sentence costs 22 bytes over the short one. If a
  development build is approved (M72), the sentence can live there and
  production can carry a short code, which is where the 75 bytes go.

**Recommendation: do it. Before 1.0.** It is the only change here that
removes a stack overflow and a hung event loop, and four libraries reach the
same design. It adds no API. I label it before 1.0 because the order of calls
that stage 1 pinned changes, and because what a removed or late subscriber
gets should be in the 1.0 spec as guaranteed.

**Cost for stage 4.**

- Files: `core.ts`. The four adapters can drop their `active` flags
  afterwards (adapters A2), which I did not spike.
- Tests: rewrite the 16 tests above to the new behaviour. Add tests for: the
  bound on each path, with the store usable afterwards; a loop across two
  stores; `console.error` that throws during a round, then a write that is
  delivered; a subscriber added during a round after a re-entrant write; a
  transaction opened and closed inside a subscriber.
- Mutation run: `core.ts` is a target file, so every new branch needs a test
  that kills its mutants. The `try` and `finally` around `drain()` is one:
  without it a throwing `console.error` stops all synchronous delivery for
  good, which is the bug Legend-State had in 2.1.15 (Legend-State 1).
- `CONSTRAINTS.md`: the budget of the main entry has to move, from 3,750 to at
  least 3,769 with the short message or 3,824 as spiked, plus headroom. No
  other number moves.
- Risk: medium. Every adapter relies on synchronous delivery, and delivery
  stays synchronous. I did not run the browser or framework suites.

## D2. Where a subscriber's error goes

**Question.** Should a subscriber's error stay isolated and logged, or reach
the writer, and what should happen to a rejected promise? Behind it: stage 1
finding 23, Signals 8, Legend-State 1, Vue 9, Valtio V6, merged entry M28.

**The options.** "Ran" means I ran it, with `probe-d2.ts` in the appendix:
three synchronous subscribers, of which the first two throw.

| Option                                                    | The writer                                                                                                                                       | The other subscribers | Where the error lands                                                                                                                                                 | Who does it                           | Evidence                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| A. Catch each one and call `console.error`                | Is not told. A method's return value and a method's own error survive                                                                            | All run               | `console.error`, once per failing subscriber                                                                                                                          | Ours today. MobX logs in the same way | Ran                      |
| B. Run them all, then throw the first error to the writer | `store.count = 1`, a method call or `batch()` throws after the state has changed. A method's return value is lost, and its own error is replaced | All run               | The writer's `catch`. The second error is dropped. On the microtask path there is no writer: it is an uncaught exception, which ends a Node or Bun process by default | Preact, Legend-State 3, Vue           | Ran, `d2-rethrow.patch`  |
| C. `reportError()` where it exists, else `console.error`  | Is not told                                                                                                                                      | All run               | In a browser, the window's `error` event, which error monitoring listens to. Bun has `reportError` and exits with code 1 when nothing handles it. Node 24 has none    | React 19, for errors nothing caught   | Checked the two runtimes |
| D. One reporter the application can replace               | Is not told, by default                                                                                                                          | All run               | Wherever the application points it                                                                                                                                    | MobX `onReactionError`                | Not spiked               |

What the probe printed for the synchronous path:

| Case                         | A, today                                            | B, `d2-rethrow`                                                |
| ---------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Direct write                 | returns; third subscriber called; two errors logged | throws "first subscriber failed"; third called; nothing logged |
| Method that returns `'done'` | returns `'done'`                                    | throws "first subscriber failed"; the count is 2               |
| Method that throws           | throws "the method failed"                          | throws "first subscriber failed"                               |
| `batch()`                    | returns `'done'`                                    | throws "first subscriber failed"                               |
| Batched subscribers          | two errors logged                                   | `uncaughtException: first subscriber failed`                   |

**Option B, the spike.** `core.ts`, 11 lines added and 6 removed. It also
moves the scheduling of the microtask in front of synchronous delivery, or a
throw would cancel the batched notification of the same write. Main entry
3,672 bytes gzipped, 11 more. 1,329 tests pass and 12 fail. All 12 pin that
the writer is not told, which is what B changes on purpose, so I class them
**incidental**: the docs promise neither behaviour.

- `src/core/core.test.ts`: createClassyStore() — core reactivity > listener
  error isolation > calls remaining sync listeners even if an earlier one
  throws
- `src/core/core.characterisation.getters.test.ts`: a getter that writes to
  the store while it runs > reports a circular dependency to a sync
  subscriber that reads the getter during its write
- `src/core/core.characterisation.notifications.test.ts`, ten tests:
  - a write made inside a sync subscriber > when the subscriber writes on
    every call > recurses until the stack overflows, and reports the overflow
    instead of throwing it to the writer
  - a subscriber that throws > a sync subscriber that throws leaves the write
    applied and in the snapshot
  - … > a sync subscriber that throws on a nested node does not stop the
    subscribers further up
  - … > a sync subscriber that throws stays subscribed, and later writes are
    delivered and reported again
  - … > each subscriber that throws is reported on its own, in delivery
    order, with the value it threw
  - … > a subscriber that throws when a store method returns does not change
    what the method returns
  - … > a subscriber that throws when a batch ends does not change what
    batch() returns
  - … > a transaction whose subscriber threw is closed: the next direct write
    notifies at once
  - … > a sync subscriber that throws does not cancel the batched
    notification of the same write
  - … > a throw inside a nested delivery is reported once for each delivery,
    and both deliveries finish

The batched tests pass under B only because Bun's test runner does not fail
a test for an error thrown in a microtask.

**A rejected promise (finding 23), the spike.** `subscribe()` takes
`() => void`, so TypeScript accepts an `async` callback, and such a callback
fails by rejecting. Today nothing handles the rejection. I ran both runtimes:
an unhandled rejection ends a Node 24 or a Bun 1.4 process with exit code 1,
and the message does not mention the store. In a browser it is logged as
"Uncaught (in promise)".

`d2-rejection.patch`: `core.ts`, 5 lines added and 1 removed. When a callback
returns a promise, the subscription attaches `console.error` to its
rejection.

| Measure                           | Unmodified                           | `d2-rejection`                              |
| --------------------------------- | ------------------------------------ | ------------------------------------------- |
| An `async` subscriber that throws | `unhandledRejection`, nothing logged | one `console.error`, no unhandled rejection |
| Tests                             | 1,341 pass                           | 1,340 pass, 1 fails                         |
| Typecheck                         | passes                               | passes                                      |
| Main entry, gzipped               | 3,661                                | 3,686, 25 more                              |

The failing test is a **fix**: `core.characterisation.notifications.test.ts`,
a subscriber that throws > the rejection of an async subscriber is neither
awaited nor reported. The check is `instanceof Promise`, so a promise from
another realm or a hand-made thenable is not covered.

**Timings of `d2-rejection`.** Not measured yet.

**What it changes for a user.** Under A plus the rejection handler, nothing
for a subscriber that throws. An `async` subscriber that fails is logged and
no longer ends a server process. Under B, every write that has a failing
subscriber throws, after the write.

**Recommendation.**

- **Keep A. Do not take B.** With B a broken view makes an unrelated
  `store.count = 1` throw after the count has changed, hides a method's own
  error and loses its return value. Every adapter is a synchronous
  subscriber, so the code that fails is usually not the code that wrote. Four
  stage 2 reports say the same. Label: **before 1.0**, as a line in the spec:
  a subscriber's error is caught, the other subscribers run, and the writer
  is never told. Changing that later would be breaking.
- **Take the rejection handler. Can follow 1.0.** It is 25 bytes and makes
  the two ways a callback can fail land in one place. If D1 is taken, it is
  two more lines in the function D1 already rewrites.
- **Do not take C.** It ends a Bun process and only logs on Node, so one
  subscriber error would behave three ways.
- **D can follow 1.0.** It is an addition. It belongs with the development
  build (M72), which also wants one place where messages leave the library.
- The error of D1's bound should go the same way as a subscriber's error.
  Under A that is `console.error`, as spiked. Preact and Svelte throw it at
  the writer, which is option B again.

**Cost for stage 4.** For the rejection handler: `core.ts`, rewrite one test,
add one for a batched `async` subscriber, 25 bytes on the main entry. For A:
one paragraph in `API_REFERENCE.md` under `subscribe`. Risk low.

## D3. A setter is a transaction

**Question.** Does opening the transaction around a class setter remove the
half-applied state, and does anything depend on the two notifications? Behind
it: stage 1 finding 43, MobX 4, Svelte 10, Valtio V7, merged entry M29.

**What was changed.** `core.ts`, 8 lines added and 2 removed (`d3.patch`).
The accessor branch of the `set` trap now raises `transactionDepth` around
`Reflect.set` and calls `settleTransaction()` in a `finally`, as
`transactional` does for a method.

**Reproduction.** A `full` setter that writes `first` and `last`, with a
synchronous subscriber that reads `full`:

| Unmodified                       | D3             |
| -------------------------------- | -------------- |
| `Grace Lovelace`, `Grace Hopper` | `Grace Hopper` |

**Tests.** 1,339 pass and 2 fail. Both are in
`src/core/core.characterisation.getters.test.ts` and both are **fixes**: they
pin finding 43.

- a property with both a getter and a setter > notifies a sync subscriber
  once per write inside the setter, where a method notifies once
- a property with both a getter and a setter > shows a sync subscriber the
  half-applied state between the two writes

**Typecheck.** Passes.

**Size.** Main entry 3,666 bytes gzipped, 5 more than 3,661, inside the
budget of 3,750.

**Timings.** Not measured yet.

**What it changes for a user.** A setter that writes several fields notifies
a synchronous subscriber once, with the final state. A setter that throws
part-way still notifies once for the writes it made, as a method does. A
batched subscriber sees no change: it already heard once.

**Recommendation: do it. Before 1.0.** It is a bug fix of eight lines with no
conflict in any report. It could ship after 1.0 without breaking a consumer,
but the reference lists when synchronous subscribers are notified ("once per
direct write, and once per store method or array operation"), and a setter
joins that list. That sentence should be right in the 1.0 spec.

**Cost for stage 4.** `core.ts`; rewrite the two tests; one sentence in
`API_REFERENCE.md` and one in `TUTORIAL.md`. Risk low. No number in
`CONSTRAINTS.md` moves. Merged dependency 18 applies: if DevTools entries are
later named after methods (M57), a setter needs a name too.

## D4. `batch()` and promises

**Question.** Can `batch()` refuse the callback whose writes it cannot group,
by its type or when it runs, and what does each refusal cost? Behind it:
stage 2 defect 20, Legend-State 3, Solid 8, merged entry M30 and item 11 of
the merged report's doubts.

**What happens today**, from `probe-d4.ts` in the appendix. One synchronous
subscriber; the callback writes `a` and `b`.

| Callback given to `batch()`                            | Today                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| A plain function                                       | 1 call                                                        |
| An `async` function with an `await` between the writes | 1 call when `batch()` returns, 1 more for each write after it |
| An `async` function that never awaits                  | 1 call. It works, by luck                                     |
| A plain function that writes, then returns `save()`    | 1 call. It works, and by design                               |

Only the second row is the mistake. The type sees rows 2, 3 and 4 as the
same thing, a function that returns a promise.

**An `async` method today.** It is a transaction up to its first `await`,
because the transaction closes when the method returns its promise. Each
write after the `await` is a direct write. Measured with `counts.ts`: an
`async` method that writes two fields, awaits, and writes two more calls a
synchronous subscriber 3 times (once for the first pair, once per later
write) and a batched one 2 times. Nothing reports it. This is by design, and
MobX has the same rule (MobX 6). The reference states it for `batch()` and
the tutorial for methods; the cure is `batch()` around the writes after the
`await`.

### Spike 1: a type that refuses a promise (`d4-type.patch`)

`core.ts`, 6 lines added and 2 removed. The parameter becomes
`run: () => Synchronous<T>`, where `Synchronous<T>` is `never` when `T` is a
promise and `T` otherwise.

- **Tests:** 1,341 pass. No runtime change.
- **Size:** 3,661 bytes, unchanged.
- **Typecheck:** 3 errors in two test files, all **fixes**: they pin that
  `batch(async …)` compiles.
  - `src/core/core.transactions.test.ts(381)`: the `batch()` test "covers
    only the synchronous part of an async callback"
  - `src/types.exports.test.ts(37)` and `(39)`: the test "the core entry
    exports its functions with stable signatures", which asserts the old
    signature and that `batch(async () => 'done')` is a `Promise<string>`
- **What the type accepts**, from `spikeBatchTypes.test.ts` in the appendix:

  | Call                                                       | Result                                                  |
  | ---------------------------------------------------------- | ------------------------------------------------------- |
  | `batch(() => store.count)`, `() => {}`, an object, a tuple | Accepted; the return type is passed through             |
  | A callback that returns `any` or `unknown`                 | Accepted                                                |
  | `batch(async () => { … })`                                 | Refused                                                 |
  | `batch(() => { store.loading = true; return save(); })`    | Refused, although it groups everything it should        |
  | `batch(() => (flag ? save() : 'cached'))`                  | Refused                                                 |
  | `batch(() => { store.loading = true; void save(); })`      | Accepted                                                |
  | `function grouped<T>(run: () => T) { return batch(run); }` | Refused: a wrapper generic over the result needs a cast |

- **The message.** With `never` the compiler says "Type 'Promise\<void\>' is
  not assignable to type 'never'". If the true branch is a string literal
  type, it says "Type 'Promise\<void\>' is not assignable to type '"batch()
  groups only synchronous writes, so its callback must not return a
  promise"'". Inference is the same. `batch()` then needs `return run() as T`
  inside. I ran both forms through the package's `tsc`; the combination below
  uses the second.

### Spike 2: a runtime check, two forms

| Form                                                                         | Patch                     | Lines  | Main entry, gzipped                             | Tests              |
| ---------------------------------------------------------------------------- | ------------------------- | ------ | ----------------------------------------------- | ------------------ |
| After the call: throw a `TypeError` when `run()` returned a promise          | `d4-runtime-after.patch`  | +8, −1 | 3,746, 85 more                                  | 1,339 pass, 2 fail |
| Before the call: throw a `TypeError` when `run` is a native `async` function | `d4-runtime-before.patch` | +10    | 3,744, 83 more; 3,711 with a one-clause message | 1,339 pass, 2 fail |

The two failing tests are the same for both and are **fixes**:
`core.transactions.test.ts`, batch() > covers only the synchronous part of an
async callback; and `types.exports.test.ts`, public entry point types > the
core entry exports its functions with stable signatures, which calls
`batch(async () => 'done')`.

What each does, from `probe-d4.ts`:

| Callback                                            | After the call                                                            | Before the call                       |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| A plain function                                    | returns                                                                   | returns                               |
| `async`, with an `await` between the writes         | throws, but the first write is applied and the second still happens later | throws; nothing is written            |
| `async`, never awaits                               | throws; both writes are applied                                           | throws; nothing is written            |
| A plain function that writes, then returns `save()` | throws; both writes are applied and the promise is lost                   | returns the promise; one notification |

The check before the call is `run[Symbol.toStringTag] === 'AsyncFunction'`.
It refuses before anything is written and lets the fourth row through. It
does not see an `async` function that a build step has turned into a
generator, which is what a compile target below ES2017 does. The check after
the call cannot undo what ran and drops the promise, so a later rejection is
unhandled.

**Timings of the check before the call.** Not measured yet.

**What it changes for a user.** With the type: `batch(async …)` and
`batch(() => save())` stop compiling. The second is rewritten as
`batch(() => { store.loading = true; }); const pending = save();`. A generic
wrapper around `batch()` needs a cast. With a runtime check: a JavaScript
caller gets a `TypeError` where today they get split notifications.

**Recommendation.**

- **Take the type, with the worded message. Before 1.0.** It costs no bytes
  and stops the mistake where it is made. The merged report doubts it as too
  broad, and it is broad: it refuses the fourth row. I still recommend it,
  because the choice is not symmetric. Accepting promises again after 1.0 is
  a compatible change; refusing them after 1.0 is a breaking one. The
  reference's "Returns whatever `run` returns" stays true for every callback
  that is accepted.
- **Do not take a runtime check in the one build we have.** It is 50 to 85
  bytes in an entry that is already over its budget with D1, for a caller the
  type has already stopped. If a development build is approved (M72), put the
  check before the call there. **Can follow 1.0.**
- **Never the check after the call.** It throws after the writes and loses
  the promise.
- **State the `async` method rule** in the reference under
  `createClassyStore`, next to the sentence on transactions. Docs only.

**Cost for stage 4.** The type: `core.ts`, 7 lines; rewrite the two type
assertions and turn the `async` runtime test into a `@ts-expect-error` type
test plus a JavaScript-style call; the `batch` section of `API_REFERENCE.md`
and the tutorial. No number in `CONSTRAINTS.md` moves. Risk low.

## D5. Should `subscribe()` stay batched by default

**Question.** API question 1, merged entry M31 and contradiction 7. No spike.
What does a user get under each default once D1 is in?

**The counts**, from `counts.ts` in the appendix. One subscriber of each kind
on the same store. D1 changes none of these numbers. D3 changes the setter
row.

| Case                                               | `{sync: true}`, today | `{sync: true}`, with D1 and D3 | Batched, today and with D1 and D3 |
| -------------------------------------------------- | --------------------: | -----------------------------: | --------------------------------: |
| Two direct writes                                  |                     2 |                              2 |                                 1 |
| A method that writes two fields                    |                     1 |                              1 |                                 1 |
| `Object.assign(store, {a, b})`                     |                     2 |                              2 |                                 1 |
| A setter that writes two fields                    |                     2 |                              1 |                                 1 |
| An in-place `sort` of 100 rows                     |                     1 |                              1 |                                 1 |
| Two direct writes inside `batch()`                 |                     1 |                              1 |                                 1 |
| An `async` method: two writes, `await`, two writes |                     3 |                              3 |                                 2 |
| Two direct writes, `await`, two direct writes      |                     4 |                              4 |                                 2 |

**If the default stays batched.** A callback runs once per turn, however the
writes were made, and never sees a half-applied state. It runs after the
code that wrote has finished its synchronous work, so it cannot make a write
throw or slow it down. The price is that the callback is late by one
microtask: a test has to wait before it asserts, and a user coming from
MobX, Preact, Legend-State, Zustand or Jotai expects the call to have
happened when the write returns. `Object.assign` and two direct writes cost
one call.

**If the default becomes synchronous.** A callback runs before the write
returns, and a test needs no wait. D1 makes this safe to offer: a subscriber
that writes is queued and bounded, which was MobX Q1's condition. What a user
then gets:

- One call per direct write. `Object.assign(store, {a, b})` is two calls and
  the first sees half of the change, unless the caller wraps it in `batch()`.
  A direct write has no unit that groups two fields, which is the stage 2
  report's reason for the microtask.
- The subscriber's cost is paid inside every direct write. Stage 2 defect 8
  measured it: 2,000 row writes with a synchronous subscriber that takes a
  snapshot took 639 milliseconds, against 3.8 inside `batch()`. Today only
  the adapters carry that risk, and they need synchronous delivery. A
  synchronous default hands it to every caller of `subscribe()`.
- `persist`, `withHistory`, `devtools` and `subscribeKey` all subscribe
  batched today, and each wants one call per turn. They would have to ask for
  it, so the option would turn around, to something like `{batched: true}`.
  That is a rename of a public option on top of the changed default.

**Recommendation: keep the batched default. No change, so no label.** The
counts show what the microtask buys: every row is 1 or one per turn. No
stage 2 report proposes the change. If the owner wants a synchronous default,
it has to be decided before 1.0, and it needs D1 first. What should change is
the documentation: say at the top of the `subscribe` section that the
callback runs in a microtask, and that `{sync: true}` runs it before the
write returns (Zustand and Jotai Q1). Docs only.

## The combination I would recommend

**What is in it.** D1 as spiked, D3, the rejection handler of D2, and the
type of D4 with the worded message. `core.ts` only, 93 lines added and 41
removed (`combo.patch`). No runtime check for `batch()`, no change to where a
thrown error goes, no change to the default of `subscribe()`.

**Tests.** 1,322 pass and 19 fail. No regression, and no test fails that did
not fail under one of the parts alone:

- the 16 tests listed under D1 (13 fixes, 2 incidental, 1 that is both);
- the 2 tests listed under D3, both fixes;
- the 1 test listed under D2 for the rejected promise, a fix.

**Typecheck.** 3 errors, the same three lines as under D4's type: the two
test files that pin `batch(async …)` as valid. The library source has none.

**Reproductions.** `repro.ts` prints the D1 results for findings 18 to 22,
"Grace Hopper" once for finding 43, and one `console.error` with no
unhandled rejection for finding 23. Stage 2 defect 20 is unchanged when the
script runs, as it must be: the type is its only guard, and Bun does not
check types when it runs a file.

**Size**, gzipped bytes:

| Entry            | Unmodified | Combination | Adds to main, before and after | Budget for what it adds |
| ---------------- | ---------: | ----------: | ------------------------------ | ----------------------: |
| `.`              |      3,661 |       3,850 |                                |     3,750 for the entry |
| `./utils`        |      6,347 |       6,537 | 2,686 and 2,687                |                   2,750 |
| `./collections`  |      4,388 |       4,575 | 727 and 725                    |                     750 |
| `./react`        |      5,323 |       5,507 | 1,662 and 1,657                |                   1,700 |
| `./react/server` |      3,814 |       3,998 | 153 and 148                    |                     175 |
| `./vue`          |      3,941 |       4,131 | 280 and 281                    |                     300 |
| `./svelte`       |      3,843 |       4,032 | 182 and 182                    |                     200 |
| `./angular`      |      3,932 |       4,124 | 271 and 274                    |                     300 |
| `./solid`        |      3,973 |       4,160 | 312 and 310                    |                     335 |

The main entry grows by 189 bytes and is 100 over its budget. Every other
entry stays inside its own budget. Where the 189 go: 33 for the queue, the
removed-subscriber check and the last-seen version; 130 for the bound and its
message; 25 for the rejection handler; 5 for the setter; 0 for the type. The
parts were measured alone, so they do not add up exactly.

**Timings from the core benchmark.** Not measured yet.

**Timings the core benchmark does not have.** Its method and batch metrics
run with no subscriber. `withSubscriber.mjs` in the appendix times four paths
with a `{sync: true}` subscriber attached, as every adapter attaches one.
Nanoseconds per operation, the lowest and highest of three runs each, taken
while the core benchmark was running on the same machine:

| Path                                   | Engine | Unmodified     | D1             | D1 with the fast first round | Combination    |
| -------------------------------------- | ------ | -------------- | -------------- | ---------------------------- | -------------- |
| A method call, one subscriber          | Bun    | 391 to 400     | 330 to 333     | 333 to 345                   | 325 to 332     |
| A method call, one subscriber          | Node   | 432 to 436     | 412 to 415     | 417 to 425                   | 412 to 422     |
| A batch of ten writes, one subscriber  | Bun    | 1,642 to 1,777 | 1,560 to 1,578 | 1,548 to 1,559               | 1,546 to 1,584 |
| A batch of ten writes, one subscriber  | Node   | 1,799 to 1,818 | 1,763 to 1,785 | 1,747 to 1,797               | 1,747 to 1,820 |
| A setter of two fields, one subscriber | Bun    | 434 to 441     | 556 to 591     | 552 to 562                   | 484 to 508     |
| A setter of two fields, one subscriber | Node   | 637 to 647     | 711 to 714     | 695 to 711                   | 592 to 601     |
| A direct write, five subscribers       | Bun    | 211 to 216     | 286 to 298     | 274 to 282                   | 283 to 299     |
| A direct write, five subscribers       | Node   | 352 to 354     | 405 to 408     | 399 to 411                   | 408 to 415     |

**What the timings say.**

- A write that no synchronous subscriber hears gets faster, because
  `notifyMutation` makes one pass over the owners where it made three and
  builds no list when nobody listens. That is the write the enforced ratio
  measures.
- A method call with a subscriber gets faster on Bun and is the same on Node.
- A direct write with a synchronous subscriber gets slower: about 85
  nanoseconds on Bun and 30 on Node with one subscriber. The cost is the
  pending set, which the write now always goes through, plus about 13
  nanoseconds per subscriber on Bun for the last-seen check. An adapter's
  subscriber takes a snapshot, which costs far more than that.
- `d1-fast.patch` gives the first round the owners directly and skips the set
  when nothing is waiting. It restores the one-subscriber direct write on Bun
  (181 nanoseconds, the same as unmodified) for 30 more bytes and a second
  source for a round. It fails the same 16 tests as D1 and prints the same
  reproductions. I would not take it unless the 85 nanoseconds matter: one
  path is easier to hold in the head than two.

**Numbers in `CONSTRAINTS.md` that would move.** One: the size budget of the
main entry, from 3,750 to 3,850 plus headroom. Stage 1 rounded up by two to
three percent, which gives about 3,950. With the short message and no class
name the combination would measure about 3,795. The cost ratios stay inside
their limits on both engines.

**Order for stage 4**, one change per commit: D3 first (eight lines, two
tests), then D1, then the rejection handler, then the type of D4. D1 and the
rejection handler touch the same function, so the handler goes second.

## Verified and not verified

**Ran**, in the throwaway worktree at `216b3d1`, on Bun 1.4.4 and Node
24.21.0:

- The unit suite, the package typecheck and the size script on the unmodified
  worktree and on `d1`, `d3`, `d2-rejection`, `d4-type`, `d1-fast` and
  `combo`.
- The unit suite and the size script, without the typecheck, on the variants:
  `d1-noname`, `d1-shortmsg` (size only), `d1-nobound` (size only), D1
  without the last-seen version, `d1-microtask-per-round`,
  `d1-own-writes-skipped`, `d2-rethrow`, `d4-runtime-after`,
  `d4-runtime-before`, and the combination with the short message (size
  only).
- The core benchmark on both engines, five runs each, for the builds named in
  the tables.
- `repro.ts` before and after D1, D3 and the combination; `probe-d1.ts`,
  `probe-d2.ts`, `probe-d3.ts`, `probe-d4.ts` and `counts.ts` on the
  unmodified source and on the spikes they concern; `withSubscriber.mjs`
  three times per build.
- The two forms of the D4 type through the package's own `tsc` 7.0.2, on a
  file outside the package.
- That `reportError` exists in Bun and not in Node 24, and that an unhandled
  rejection and an error thrown in a microtask each end a Node and a Bun
  process with exit code 1.
- One `grep` in the installed `react-dom` 19.3.1 for `reportError`.

**Read, not run:** the stage 2 findings the brief names, and merged entries
M28 to M32 with the contradictions and doubts that touch them. What other
libraries do is taken from those reports.

**Reasoning, with no run behind it:**

- That under `d1-own-writes-skipped` a batched subscriber misses what
  synchronous subscribers wrote in answer to its write.
- That a browser logs an unhandled rejection as "Uncaught (in promise)" and
  hands a `reportError` call to the window's `error` event.
- That a build step which turns `async` functions into generators hides them
  from the check before the call.
- The split of the 189 bytes between the parts. Each part was measured alone.
- Which behaviours the decision document should mark guaranteed or
  unspecified.

**Not run, as the common brief says:** the browser suite, the React, Vue,
Svelte, Angular, Solid and Next.js suites, the mutation run, `bun run lint`
on the spikes, and the root `bun run typecheck` that covers the examples and
the docs site. I searched the examples, the docs site and the library source
for a call of `batch()` that the D4 type would refuse and found none outside
the two test files. No spike was checked against `tests/mutation`: the new
branches in `core.ts` will need tests that kill their mutants.

**Timings** were taken while other agents ran benchmarks on the same
machine, and while I ran test suites between them. The stage 1 baseline file
is 5 to 10 percent faster than today's run of the same code, raw reads
included, so compare a spike only with the base runs beside it.

**One mistake to report.** I ran `git stash` once in the throwaway worktree.
The stash list is shared with the main repository. It held only my entry; I
popped it at once, the list is empty again, and the main checkout was not
touched.

## Not done

Everything in the brief was done except what is listed here. A later agent
can start from the appendix: apply a patch to `216b3d1`, and change the
import path at the top of each script to the source it wants to test.

1. **The adapters' `active` flags** (adapters A2). With D1 the core skips a
   removed subscriber, so the flags in `vue.ts`, `svelte.ts`, `solid.ts` and
   `angular.ts` can go. Not spiked: the bytes saved per adapter entry are not
   measured, and the framework suites would have to run.
2. **The framework and browser suites on the combination.** Every adapter
   relies on synchronous delivery. The unit tests of all five adapters pass,
   which is not the same as React 18 and 19, the Compiler, Next.js, Vue,
   Svelte, Angular and Solid in a browser.
3. **A development build** (M72) decides where the message of D1's bound and
   the runtime check of D4 live. Not costed here.
4. **A replaceable error reporter** (D2, option D). Not spiked.
5. **`reportError` in a browser** (D2, option C). Checked on Bun and Node
   only.
6. **The mutation run** on `core.ts` with the combination applied.

## Appendix: patches and scripts

Each patch applies to `216b3d1` with `git apply`, unless its heading says it is a change against another patch.

### `d1.patch`: one delivery queue

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..aa00017 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -219,39 +219,33 @@ export function getInternal(proxy: object): StoreInternal {
  * children keep their old version, so the snapshot cache returns the same frozen ref.
  */
 function notifyMutation(internal: StoreInternal): void {
-  const owners = internal.ancestors();
   // Invalidate every path before any synchronous subscriber reads a snapshot.
-  for (const node of owners) node.version++;
-  if (transactionDepth) {
-    // Inside a store method or array operation: tell synchronous subscribers
-    // once, when the outermost call returns.
-    for (const node of owners) {
-      if (node.syncListeners.size) pendingSync.add(node);
-    }
-  } else {
-    deliver(owners, 'syncListeners');
+  for (const node of internal.ancestors()) {
+    node.version++;
+    if (node.syncListeners.size) pendingSync.add(node);
+    if (node.batchedListeners.size) pendingBatched.add(node);
   }
-  for (const node of owners) {
-    if (!node.batchedListeners.size) continue;
-    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
-    pendingNotifications.add(node);
+  if (pendingBatched.size && !batchedScheduled) {
+    batchedScheduled = true;
+    queueMicrotask(flushBatched);
   }
+  // Inside a store method, an array operation or `batch()`, synchronous
+  // subscribers are told once, when the outermost call returns.
+  if (!transactionDepth) flushSync();
 }
 
-const pendingNotifications = new Set<StoreInternal>();
+const pendingSync = new Set<StoreInternal>();
+const pendingBatched = new Set<StoreInternal>();
+let batchedScheduled = false;
+let deliveringSync = false;
 
 // ── Transactions ──────────────────────────────────────────────────────────────
 
 let transactionDepth = 0;
-const pendingSync = new Set<StoreInternal>();
 
 /** Close one transaction level; the outermost one notifies sync subscribers. */
 function settleTransaction(): void {
-  if (--transactionDepth === 0 && pendingSync.size) {
-    const owners = new Set(pendingSync);
-    pendingSync.clear();
-    deliver(owners, 'syncListeners');
-  }
+  if (--transactionDepth === 0) flushSync();
 }
 
 /**
@@ -305,24 +299,59 @@ export function batch<T>(run: () => T): T {
   }
 }
 
-function flushNotifications(): void {
-  const owners = new Set(pendingNotifications);
-  pendingNotifications.clear();
-  deliver(owners, 'batchedListeners');
+/**
+ * Call the synchronous subscribers of every node written so far. A write made
+ * by one of them is queued, and delivered when the round that is running ends.
+ */
+function flushSync(): void {
+  if (deliveringSync) return;
+  deliveringSync = true;
+  try {
+    drain(pendingSync, 'syncListeners');
+  } finally {
+    deliveringSync = false;
+  }
 }
 
-function deliver(
-  owners: Set<StoreInternal>,
+function flushBatched(): void {
+  try {
+    drain(pendingBatched, 'batchedListeners');
+  } finally {
+    batchedScheduled = false;
+  }
+}
+
+/** Rounds of delivery one write may cause before it is taken for a loop. */
+const maxRounds = 100;
+
+function drain(
+  pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
-  // Copy first: a listener may subscribe or unsubscribe during delivery.
-  const listeners: (() => void)[] = [];
-  for (const node of owners) listeners.push(...node[kind]);
-  for (const listener of listeners) {
-    try {
-      listener();
-    } catch (error) {
-      console.error(error);
+  for (let round = 0; pending.size; round++) {
+    if (round === maxRounds) {
+      const names = Array.from(
+        pending,
+        (node) => node.target.constructor?.name || 'Object',
+      );
+      pending.clear();
+      console.error(
+        new Error(
+          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+        ),
+      );
+      return;
+    }
+    // Copy first: a listener may subscribe or unsubscribe during delivery.
+    const listeners: (() => void)[] = [];
+    for (const node of pending) listeners.push(...node[kind]);
+    pending.clear();
+    for (const listener of listeners) {
+      try {
+        listener();
+      } catch (error) {
+        console.error(error);
+      }
     }
   }
 }
@@ -591,8 +620,15 @@ export function subscribe(
   const listeners = options?.sync
     ? internal.syncListeners
     : internal.batchedListeners;
+  // The state this subscription has been told about, or was created in.
+  let seen = internal.version;
   // One entry per call: registering a callback twice gives two subscriptions.
-  const listener = () => callback();
+  const listener = () => {
+    // Removed since the round began, or already called for this state.
+    if (!listeners.has(listener) || seen === internal.version) return;
+    seen = internal.version;
+    callback();
+  };
   listeners.add(listener);
   return () => {
     if (listeners.delete(listener)) internal.suspendIfDetached();
```

### `d1-shortmsg`: a shorter message, as a change against `d1.patch`

```diff
@@ -321,23 +321,16 @@
   }
 }
 
-/** Rounds of delivery one write may cause before it is taken for a loop. */
-const maxRounds = 100;
-
 function drain(
   pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
   for (let round = 0; pending.size; round++) {
-    if (round === maxRounds) {
-      const names = Array.from(
-        pending,
-        (node) => node.target.constructor?.name || 'Object',
-      );
+    if (round === 100) {
       pending.clear();
       console.error(
         new Error(
-          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+          '@codebelt/classy-store: a subscriber writes to the store on every call; delivery stopped after 100 rounds',
         ),
       );
       return;
```

### `d1-noname`: no class name in the message, as a change against `d1.patch`

```diff
@@ -330,14 +330,10 @@
 ): void {
   for (let round = 0; pending.size; round++) {
     if (round === maxRounds) {
-      const names = Array.from(
-        pending,
-        (node) => node.target.constructor?.name || 'Object',
-      );
       pending.clear();
       console.error(
         new Error(
-          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber writes to the store every time it is called`,
         ),
       );
       return;
```

### `d1-nobound`: no bound, as a change against `d1.patch`

```diff
@@ -320,28 +320,12 @@
     batchedScheduled = false;
   }
 }
-
-/** Rounds of delivery one write may cause before it is taken for a loop. */
-const maxRounds = 100;
 
 function drain(
   pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
-  for (let round = 0; pending.size; round++) {
-    if (round === maxRounds) {
-      const names = Array.from(
-        pending,
-        (node) => node.target.constructor?.name || 'Object',
-      );
-      pending.clear();
-      console.error(
-        new Error(
-          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
-        ),
-      );
-      return;
-    }
+  while (pending.size) {
     // Copy first: a listener may subscribe or unsubscribe during delivery.
     const listeners: (() => void)[] = [];
     for (const node of pending) listeners.push(...node[kind]);
```

### D1 without the last-seen version, as a change against `d1-noname`

```diff
@@ -616,14 +616,10 @@
   const listeners = options?.sync
     ? internal.syncListeners
     : internal.batchedListeners;
-  // The state this subscription has been told about, or was created in.
-  let seen = internal.version;
   // One entry per call: registering a callback twice gives two subscriptions.
   const listener = () => {
-    // Removed since the round began, or already called for this state.
-    if (!listeners.has(listener) || seen === internal.version) return;
-    seen = internal.version;
-    callback();
+    // Removed since the round began.
+    if (listeners.has(listener)) callback();
   };
   listeners.add(listener);
   return () => {
```

### `d1-own-writes-skipped`: a subscriber does not hear of its own writes, as a change against `d1.patch`

```diff
@@ -626,8 +626,12 @@
   const listener = () => {
     // Removed since the round began, or already called for this state.
     if (!listeners.has(listener) || seen === internal.version) return;
-    seen = internal.version;
-    callback();
+    try {
+      callback();
+    } finally {
+      // Its own writes are not news to it.
+      seen = internal.version;
+    }
   };
   listeners.add(listener);
   return () => {
```

### `d1-microtask-per-round`: one microtask per batched round, as a change against `d1.patch`

```diff
@@ -313,45 +313,58 @@
   }
 }
 
+let batchedRounds = 0;
+
+/** One round per microtask: a write made by a batched subscriber waits its turn behind the microtasks already queued. */
 function flushBatched(): void {
-  try {
-    drain(pendingBatched, 'batchedListeners');
+  batchedScheduled = false;
+  try {
+    deliverRound(pendingBatched, 'batchedListeners');
   } finally {
-    batchedScheduled = false;
+    if (!pendingBatched.size) batchedRounds = 0;
+    else if (++batchedRounds === maxRounds) {
+      batchedRounds = 0;
+      reportLoop(pendingBatched);
+    }
   }
 }
 
 /** Rounds of delivery one write may cause before it is taken for a loop. */
 const maxRounds = 100;
 
-function drain(
+function reportLoop(pending: Set<StoreInternal>): void {
+  const names = Array.from(
+    pending,
+    (node) => node.target.constructor?.name || 'Object',
+  );
+  pending.clear();
+  console.error(
+    new Error(
+      `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+    ),
+  );
+}
+
+function drain(pending: Set<StoreInternal>, kind: 'syncListeners'): void {
+  for (let round = 0; pending.size; round++) {
+    if (round === maxRounds) return reportLoop(pending);
+    deliverRound(pending, kind);
+  }
+}
+
+function deliverRound(
   pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
-  for (let round = 0; pending.size; round++) {
-    if (round === maxRounds) {
-      const names = Array.from(
-        pending,
-        (node) => node.target.constructor?.name || 'Object',
-      );
-      pending.clear();
-      console.error(
-        new Error(
-          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
-        ),
-      );
-      return;
-    }
-    // Copy first: a listener may subscribe or unsubscribe during delivery.
-    const listeners: (() => void)[] = [];
-    for (const node of pending) listeners.push(...node[kind]);
-    pending.clear();
-    for (const listener of listeners) {
-      try {
-        listener();
-      } catch (error) {
-        console.error(error);
-      }
+  // Copy first: a listener may subscribe or unsubscribe during delivery.
+  const listeners: (() => void)[] = [];
+  for (const node of pending) listeners.push(...node[kind]);
+  pending.clear();
+  for (const listener of listeners) {
+    try {
+      listener();
+    } catch (error) {
+      console.error(error);
     }
   }
 }
```

### `d1-fast`: the first round reads the owners directly, as a change against `d1.patch`

```diff
@@ -219,19 +219,25 @@
  * children keep their old version, so the snapshot cache returns the same frozen ref.
  */
 function notifyMutation(internal: StoreInternal): void {
+  const owners = internal.ancestors();
+  // Synchronous subscribers wait while a store method, an array operation or
+  // `batch()` is open, and while another delivery is running.
+  const waits = transactionDepth || deliveringSync;
+  let heard = false;
   // Invalidate every path before any synchronous subscriber reads a snapshot.
-  for (const node of internal.ancestors()) {
+  for (const node of owners) {
     node.version++;
-    if (node.syncListeners.size) pendingSync.add(node);
+    if (node.syncListeners.size) {
+      if (waits) pendingSync.add(node);
+      else heard = true;
+    }
     if (node.batchedListeners.size) pendingBatched.add(node);
   }
   if (pendingBatched.size && !batchedScheduled) {
     batchedScheduled = true;
     queueMicrotask(flushBatched);
   }
-  // Inside a store method, an array operation or `batch()`, synchronous
-  // subscribers are told once, when the outermost call returns.
-  if (!transactionDepth) flushSync();
+  if (heard) flushSync(owners);
 }
 
 const pendingSync = new Set<StoreInternal>();
@@ -300,14 +306,15 @@
 }
 
 /**
- * Call the synchronous subscribers of every node written so far. A write made
- * by one of them is queued, and delivered when the round that is running ends.
+ * Call the synchronous subscribers of the nodes just written, then of every
+ * node written meanwhile. A write made by a subscriber is queued, and
+ * delivered when the round that is running ends.
  */
-function flushSync(): void {
+function flushSync(first: Iterable<StoreInternal> = pendingSync): void {
   if (deliveringSync) return;
   deliveringSync = true;
   try {
-    drain(pendingSync, 'syncListeners');
+    drain(pendingSync, 'syncListeners', first);
   } finally {
     deliveringSync = false;
   }
@@ -327,8 +334,9 @@
 function drain(
   pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
+  first: Iterable<StoreInternal> = pending,
 ): void {
-  for (let round = 0; pending.size; round++) {
+  for (let round = 0; round === 0 || pending.size; round++) {
     if (round === maxRounds) {
       const names = Array.from(
         pending,
@@ -344,7 +352,7 @@
     }
     // Copy first: a listener may subscribe or unsubscribe during delivery.
     const listeners: (() => void)[] = [];
-    for (const node of pending) listeners.push(...node[kind]);
+    for (const node of round ? pending : first) listeners.push(...node[kind]);
     pending.clear();
     for (const listener of listeners) {
       try {
```

### `d2-rethrow.patch`: throw the first subscriber error to the writer

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..da12e57 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -222,6 +222,11 @@ function notifyMutation(internal: StoreInternal): void {
   const owners = internal.ancestors();
   // Invalidate every path before any synchronous subscriber reads a snapshot.
   for (const node of owners) node.version++;
+  for (const node of owners) {
+    if (!node.batchedListeners.size) continue;
+    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
+    pendingNotifications.add(node);
+  }
   if (transactionDepth) {
     // Inside a store method or array operation: tell synchronous subscribers
     // once, when the outermost call returns.
@@ -231,11 +236,6 @@ function notifyMutation(internal: StoreInternal): void {
   } else {
     deliver(owners, 'syncListeners');
   }
-  for (const node of owners) {
-    if (!node.batchedListeners.size) continue;
-    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
-    pendingNotifications.add(node);
-  }
 }
 
 const pendingNotifications = new Set<StoreInternal>();
@@ -318,13 +318,18 @@ function deliver(
   // Copy first: a listener may subscribe or unsubscribe during delivery.
   const listeners: (() => void)[] = [];
   for (const node of owners) listeners.push(...node[kind]);
+  let failed = false;
+  let firstError: unknown;
   for (const listener of listeners) {
     try {
       listener();
     } catch (error) {
-      console.error(error);
+      if (!failed) firstError = error;
+      failed = true;
     }
   }
+  // Every subscriber has run. The writer gets the first error.
+  if (failed) throw firstError;
 }
 
 /**
```

### `d2-rejection.patch`: report a subscriber's rejected promise

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..62cbfdf 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -592,7 +592,11 @@ export function subscribe(
     ? internal.syncListeners
     : internal.batchedListeners;
   // One entry per call: registering a callback twice gives two subscriptions.
-  const listener = () => callback();
+  const listener = () => {
+    const result: unknown = callback();
+    // An `async` callback fails by rejecting. Report it as a throw is reported.
+    if (result instanceof Promise) result.catch(console.error);
+  };
   listeners.add(listener);
   return () => {
     if (listeners.delete(listener)) internal.suspendIfDetached();
```

### `d3.patch`: a setter is a transaction

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..bc9d2fe 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -413,8 +413,14 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
-        // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        // mutations invalidate their actual owners, and run the call as a
+        // transaction, so that synchronous subscribers hear of it once.
+        transactionDepth++;
+        try {
+          return Reflect.set(_target, prop, value, receiver);
+        } finally {
+          settleTransaction();
+        }
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
```

### `d4-type.patch`: a type that refuses a promise

````diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..6257ace 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -276,6 +276,9 @@ function transactional(
   };
 }
 
+/** What the callback of `batch()` may return: anything but a promise. */
+type Synchronous<T> = T extends PromiseLike<unknown> ? never : T;
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
@@ -286,7 +289,8 @@ function transactional(
  * Only the synchronous part of `run` is covered. A write made after an `await`
  * happens once `batch()` has already returned, and notifies on its own.
  *
- * @param run - Performs the writes. Its return value is passed through.
+ * @param run - Performs the writes. Its return value is passed through. It
+ * must not return a promise: an `async` function is refused by the types.
  * @returns Whatever `run` returns.
  *
  * @example
@@ -296,7 +300,7 @@ function transactional(
  * });
  * ```
  */
-export function batch<T>(run: () => T): T {
+export function batch<T>(run: () => Synchronous<T>): T {
   transactionDepth++;
   try {
     return run();
````

### `d4-runtime-after.patch`: throw when `run()` returned a promise

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..14d0184 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -299,7 +299,14 @@ function transactional(
 export function batch<T>(run: () => T): T {
   transactionDepth++;
   try {
-    return run();
+    const result = run();
+    // The transaction ends here, so a write after an `await` is outside it.
+    if (result instanceof Promise) {
+      throw new TypeError(
+        '@codebelt/classy-store: batch() was given a function that returned a promise; it groups only writes made before the function returns',
+      );
+    }
+    return result;
   } finally {
     settleTransaction();
   }
```

### `d4-runtime-before.patch`: refuse a native `async` function before it runs

````diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..91881e4 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -297,6 +297,16 @@ function transactional(
  * ```
  */
 export function batch<T>(run: () => T): T {
+  // Refused before it runs: the transaction ends when `run` returns, so its
+  // writes after an `await` would notify one by one.
+  if (
+    (run as {[Symbol.toStringTag]?: string})[Symbol.toStringTag] ===
+    'AsyncFunction'
+  ) {
+    throw new TypeError(
+      '@codebelt/classy-store: batch() cannot take an async function; it groups only writes made before the function returns',
+    );
+  }
   transactionDepth++;
   try {
     return run();
````

### `combo.patch`: the combination

````diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..8a6af1c 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -219,39 +219,33 @@ export function getInternal(proxy: object): StoreInternal {
  * children keep their old version, so the snapshot cache returns the same frozen ref.
  */
 function notifyMutation(internal: StoreInternal): void {
-  const owners = internal.ancestors();
   // Invalidate every path before any synchronous subscriber reads a snapshot.
-  for (const node of owners) node.version++;
-  if (transactionDepth) {
-    // Inside a store method or array operation: tell synchronous subscribers
-    // once, when the outermost call returns.
-    for (const node of owners) {
-      if (node.syncListeners.size) pendingSync.add(node);
-    }
-  } else {
-    deliver(owners, 'syncListeners');
+  for (const node of internal.ancestors()) {
+    node.version++;
+    if (node.syncListeners.size) pendingSync.add(node);
+    if (node.batchedListeners.size) pendingBatched.add(node);
   }
-  for (const node of owners) {
-    if (!node.batchedListeners.size) continue;
-    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
-    pendingNotifications.add(node);
+  if (pendingBatched.size && !batchedScheduled) {
+    batchedScheduled = true;
+    queueMicrotask(flushBatched);
   }
+  // Inside a store method, an array operation or `batch()`, synchronous
+  // subscribers are told once, when the outermost call returns.
+  if (!transactionDepth) flushSync();
 }
 
-const pendingNotifications = new Set<StoreInternal>();
+const pendingSync = new Set<StoreInternal>();
+const pendingBatched = new Set<StoreInternal>();
+let batchedScheduled = false;
+let deliveringSync = false;
 
 // ── Transactions ──────────────────────────────────────────────────────────────
 
 let transactionDepth = 0;
-const pendingSync = new Set<StoreInternal>();
 
 /** Close one transaction level; the outermost one notifies sync subscribers. */
 function settleTransaction(): void {
-  if (--transactionDepth === 0 && pendingSync.size) {
-    const owners = new Set(pendingSync);
-    pendingSync.clear();
-    deliver(owners, 'syncListeners');
-  }
+  if (--transactionDepth === 0) flushSync();
 }
 
 /**
@@ -276,6 +270,12 @@ function transactional(
   };
 }
 
+/** What the callback of `batch()` may return: anything but a promise. */
+type Synchronous<T> =
+  T extends PromiseLike<unknown>
+    ? 'batch() groups only synchronous writes, so its callback must not return a promise'
+    : T;
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
@@ -286,7 +286,8 @@ function transactional(
  * Only the synchronous part of `run` is covered. A write made after an `await`
  * happens once `batch()` has already returned, and notifies on its own.
  *
- * @param run - Performs the writes. Its return value is passed through.
+ * @param run - Performs the writes. Its return value is passed through. It
+ * must not return a promise: an `async` function is refused by the types.
  * @returns Whatever `run` returns.
  *
  * @example
@@ -296,33 +297,69 @@ function transactional(
  * });
  * ```
  */
-export function batch<T>(run: () => T): T {
+export function batch<T>(run: () => Synchronous<T>): T {
   transactionDepth++;
   try {
-    return run();
+    // The cast is sound: `Synchronous<T>` is `T` for every `T` it accepts.
+    return run() as T;
   } finally {
     settleTransaction();
   }
 }
 
-function flushNotifications(): void {
-  const owners = new Set(pendingNotifications);
-  pendingNotifications.clear();
-  deliver(owners, 'batchedListeners');
+/**
+ * Call the synchronous subscribers of every node written so far. A write made
+ * by one of them is queued, and delivered when the round that is running ends.
+ */
+function flushSync(): void {
+  if (deliveringSync) return;
+  deliveringSync = true;
+  try {
+    drain(pendingSync, 'syncListeners');
+  } finally {
+    deliveringSync = false;
+  }
 }
 
-function deliver(
-  owners: Set<StoreInternal>,
+function flushBatched(): void {
+  try {
+    drain(pendingBatched, 'batchedListeners');
+  } finally {
+    batchedScheduled = false;
+  }
+}
+
+/** Rounds of delivery one write may cause before it is taken for a loop. */
+const maxRounds = 100;
+
+function drain(
+  pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
-  // Copy first: a listener may subscribe or unsubscribe during delivery.
-  const listeners: (() => void)[] = [];
-  for (const node of owners) listeners.push(...node[kind]);
-  for (const listener of listeners) {
-    try {
-      listener();
-    } catch (error) {
-      console.error(error);
+  for (let round = 0; pending.size; round++) {
+    if (round === maxRounds) {
+      const names = Array.from(
+        pending,
+        (node) => node.target.constructor?.name || 'Object',
+      );
+      pending.clear();
+      console.error(
+        new Error(
+          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+        ),
+      );
+      return;
+    }
+    // Copy first: a listener may subscribe or unsubscribe during delivery.
+    const listeners: (() => void)[] = [];
+    for (const node of pending) listeners.push(...node[kind]);
+    pending.clear();
+    for (const listener of listeners) {
+      try {
+        listener();
+      } catch (error) {
+        console.error(error);
+      }
     }
   }
 }
@@ -413,8 +450,14 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
-        // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        // mutations invalidate their actual owners, and run the call as a
+        // transaction, so that synchronous subscribers hear of it once.
+        transactionDepth++;
+        try {
+          return Reflect.set(_target, prop, value, receiver);
+        } finally {
+          settleTransaction();
+        }
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
@@ -591,8 +634,17 @@ export function subscribe(
   const listeners = options?.sync
     ? internal.syncListeners
     : internal.batchedListeners;
+  // The state this subscription has been told about, or was created in.
+  let seen = internal.version;
   // One entry per call: registering a callback twice gives two subscriptions.
-  const listener = () => callback();
+  const listener = () => {
+    // Removed since the round began, or already called for this state.
+    if (!listeners.has(listener) || seen === internal.version) return;
+    seen = internal.version;
+    const result: unknown = callback();
+    // An `async` callback fails by rejecting. Report it as a throw is reported.
+    if (result instanceof Promise) result.catch(console.error);
+  };
   listeners.add(listener);
   return () => {
     if (listeners.delete(listener)) internal.suspendIfDetached();
````

### `repro.ts`: the reproductions

```ts
// Reproductions for stage 1 findings 18 to 23 and 43, and stage 2 defect 20.
// Run with `bun repro/repro.ts` from the scratch folder. It imports the
// worktree's source, so it shows whatever spike is applied there.
import {
  batch,
  createClassyStore,
  snapshot,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const reported: string[] = [];
const realError = console.error;
console.error = (...parts: unknown[]) => {
  const first = parts[0];
  reported.push(
    first instanceof Error
      ? `${first.constructor.name}: ${first.message}`
      : String(first),
  );
};
const takeReported = () => {
  const counts = new Map<string, number>();
  for (const line of reported) counts.set(line, (counts.get(line) ?? 0) + 1);
  reported.length = 0;
  return [...counts].map(([line, count]) => `${count}x ${line}`);
};
const say = (label: string, value: unknown) =>
  console.log(`${label}: ${JSON.stringify(value)}`);
const kinds = [
  {kind: 'sync', options: {sync: true}},
  {kind: 'batched', options: undefined},
] as const;

// ── 18: a sync subscriber that writes on every call ──────────────────────────
{
  const store = createClassyStore({count: 0});
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
      store.count++;
    },
    {sync: true},
  );
  let thrown = 'nothing';
  try {
    store.count = 1;
  } catch (error) {
    thrown = String(error);
  }
  say('18 sync, always writes', {
    calls,
    count: store.count,
    writerThrew: thrown,
    reported: takeReported(),
  });
}

// ── 19: a batched subscriber that writes on every call ───────────────────────
{
  const store = createClassyStore({count: 0});
  let calls = 0;
  let seenByTimer = -1;
  subscribe(store, () => {
    calls++;
    // The stop at 5,000 is the reproduction's, so that it ends on a library
    // with no bound.
    if (store.count < 5000) store.count++;
  });
  setTimeout(() => {
    seenByTimer = store.count;
  }, 0);
  store.count = 1;
  await flush();
  await flush();
  say('19 batched, always writes (stops itself at 5000)', {
    calls,
    count: store.count,
    seenByTimerThatWasDue: seenByTimer,
    reported: takeReported(),
  });
}

// ── 20: a subscriber removed during delivery ─────────────────────────────────
for (const {kind, options} of kinds) {
  const store = createClassyStore({count: 0, user: {name: 'a'}});
  const calls: string[] = [];
  let stopSecond = () => {};
  subscribe(
    store,
    () => {
      calls.push('first');
      stopSecond();
    },
    options,
  );
  stopSecond = subscribe(store, () => calls.push('second'), options);
  store.count = 1;
  await flush();
  say(`20 ${kind}, second removed by first`, calls);

  const calls2: string[] = [];
  const store2 = createClassyStore({user: {name: 'a'}});
  const stopRoot = subscribe(store2, () => calls2.push('root'), options);
  subscribe(
    store2.user,
    () => {
      calls2.push('user');
      stopRoot();
    },
    options,
  );
  store2.user.name = 'b';
  await flush();
  say(`20 ${kind}, root removed by nested`, calls2);
}

// ── 21: a subscriber added after a write ─────────────────────────────────────
{
  const lone = createClassyStore({count: 0});
  const loneCalls: string[] = [];
  lone.count = 1;
  subscribe(lone, () => loneCalls.push('late'));
  await flush();
  say('21 batched, added after the write, no other subscriber', loneCalls);

  const store = createClassyStore({count: 0});
  const calls: string[] = [];
  subscribe(store, () => calls.push('early'));
  store.count = 1;
  subscribe(store, () => calls.push('late'));
  await flush();
  say('21 batched, added after the write, another existed', calls);

  const inBatch = createClassyStore({count: 0});
  const batchCalls: string[] = [];
  subscribe(inBatch, () => batchCalls.push('early'), {sync: true});
  batch(() => {
    inBatch.count = 1;
    subscribe(inBatch, () => batchCalls.push('late'), {sync: true});
  });
  say('21 sync, added inside batch() after the write', batchCalls);

  // Added during delivery, by a subscriber that has just written.
  for (const {kind, options} of kinds) {
    const during = createClassyStore({count: 0});
    const duringCalls: string[] = [];
    let added = false;
    subscribe(
      during,
      () => {
        duringCalls.push(`first:${during.count}`);
        if (added) return;
        added = true;
        during.count = 2;
        subscribe(
          during,
          () => duringCalls.push(`added:${during.count}`),
          options,
        );
      },
      options,
    );
    during.count = 1;
    await flush();
    during.count = 3;
    await flush();
    say(
      `21 ${kind}, added during delivery after a re-entrant write`,
      duringCalls,
    );
  }
}

// ── 22: a re-entrant write ───────────────────────────────────────────────────
for (const {kind, options} of kinds) {
  const store = createClassyStore({count: 0});
  const calls: string[] = [];
  const snapshots: unknown[] = [];
  subscribe(
    store,
    () => {
      calls.push(`first:${store.count}`);
      if (store.count === 1) store.count = 2;
    },
    options,
  );
  subscribe(
    store,
    () => {
      calls.push(`second:${store.count}`);
      snapshots.push(snapshot(store));
    },
    options,
  );
  store.count = 1;
  await flush();
  say(`22 ${kind}, re-entrant write`, {
    calls,
    secondGotTheSameSnapshotTwice:
      snapshots.length > 1 && snapshots[0] === snapshots[1],
  });
}
{
  const first = createClassyStore({value: 0});
  const second = createClassyStore({value: 0});
  const calls: string[] = [];
  subscribe(
    first,
    () => {
      calls.push('first store: forwarder enters');
      second.value = first.value;
      calls.push('first store: forwarder leaves');
    },
    {sync: true},
  );
  subscribe(first, () => calls.push('first store: next'), {sync: true});
  subscribe(second, () => calls.push(`second store: sees ${second.value}`), {
    sync: true,
  });
  first.value = 1;
  say('22 sync, a subscriber writes to a second store', calls);
}

// ── 23: a subscriber that throws, and one that returns a rejected promise ────
{
  const store = createClassyStore({count: 0});
  const calls: string[] = [];
  subscribe(
    store,
    () => {
      throw new Error('first subscriber failed');
    },
    {sync: true},
  );
  subscribe(store, () => calls.push('second'), {sync: true});
  let thrown = 'nothing';
  try {
    store.count = 1;
  } catch (error) {
    thrown = String(error);
  }
  say('23 sync, first subscriber throws', {
    secondCalled: calls.length,
    writerThrew: thrown,
    count: store.count,
    reported: takeReported(),
  });

  const unhandled: string[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(String(reason));
  };
  process.on('unhandledRejection', onUnhandled);
  const asyncStore = createClassyStore({count: 0});
  subscribe(
    asyncStore,
    async () => {
      throw new Error('async subscriber failed');
    },
    {sync: true},
  );
  asyncStore.count = 1;
  await flush();
  await flush();
  process.off('unhandledRejection', onUnhandled);
  say('23 sync, async subscriber rejects', {
    reported: takeReported(),
    unhandledRejections: unhandled,
  });
}

// ── 43: a setter that writes two fields ──────────────────────────────────────
{
  class Person {
    first = 'Ada';
    last = 'Lovelace';
    get full() {
      return `${this.first} ${this.last}`;
    }
    set full(value: string) {
      const [first, last] = value.split(' ');
      this.first = first as string;
      this.last = last as string;
    }
  }
  const store = createClassyStore(new Person());
  const seen: string[] = [];
  subscribe(store, () => seen.push(snapshot(store).full), {sync: true});
  store.full = 'Grace Hopper';
  say('43 sync, a setter that writes two fields', seen);
}

// ── stage 2 defect 20: batch() with an async function ────────────────────────
{
  const store = createClassyStore({a: 0, b: 0});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  let result: unknown;
  let thrown = 'nothing';
  try {
    result = batch(async () => {
      store.a = 1;
      await Promise.resolve();
      store.a = 2;
      store.b = 2;
    });
  } catch (error) {
    thrown = String(error);
  }
  const whenReturned = calls;
  await result;
  await flush();
  say('defect 20, batch(async)', {
    returnedAPromise: result instanceof Promise,
    callsWhenBatchReturned: whenReturned,
    callsAfterThePromiseSettled: calls,
    batchThrew: thrown,
    reported: takeReported(),
  });
}

console.error = realError;
```

### `probe-d1.ts`: three more cases for D1

```ts
// Extra probes for D1: a console.error that throws, a loop across two stores,
// and a subscriber that throws inside a round.
import {
  createClassyStore,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const realError = console.error;

// 1. console.error throws (some test setups do this on purpose).
{
  const store = createClassyStore({count: 0});
  const calls: string[] = [];
  subscribe(
    store,
    () => {
      throw new Error('subscriber failed');
    },
    {sync: true},
  );
  subscribe(store, () => calls.push(`second:${store.count}`), {sync: true});
  console.error = () => {
    throw new Error('console.error is not allowed here');
  };
  let thrown = 'nothing';
  try {
    store.count = 1;
  } catch (error) {
    thrown = String(error);
  }
  console.error = realError;
  store.count = 2;
  console.log(
    '1. console.error throws:',
    JSON.stringify({writerGot: thrown, secondCalls: calls}),
  );
}

// 2. Two stores whose subscribers write to each other.
{
  const reported: string[] = [];
  console.error = (error: unknown) =>
    void reported.push(String((error as Error).message ?? error).slice(0, 140));
  class Ping {
    n = 0;
  }
  class Pong {
    n = 0;
  }
  const ping = createClassyStore(new Ping());
  const pong = createClassyStore(new Pong());
  subscribe(
    ping,
    () => {
      pong.n++;
    },
    {sync: true},
  );
  subscribe(
    pong,
    () => {
      ping.n++;
    },
    {sync: true},
  );
  let thrown = 'nothing';
  try {
    ping.n = 1;
  } catch (error) {
    thrown = String(error).slice(0, 80);
  }
  console.error = realError;
  console.log(
    '2. ping-pong across two stores:',
    JSON.stringify({
      ping: ping.n,
      pong: pong.n,
      writerGot: thrown,
      reported: [...new Set(reported)],
      reports: reported.length,
    }),
  );
  // Delivery works again afterwards.
  const after: number[] = [];
  const quiet = createClassyStore({n: 0});
  subscribe(quiet, () => after.push(quiet.n), {sync: true});
  quiet.n = 5;
  console.log('   another store afterwards:', JSON.stringify(after));
}

// 3. A batched loop does not starve a timer for ever.
{
  const reported: string[] = [];
  console.error = (error: unknown) =>
    void reported.push(String((error as Error).message ?? error).slice(0, 60));
  const store = createClassyStore({n: 0});
  let calls = 0;
  subscribe(store, () => {
    calls++;
    if (calls < 100000) store.n++;
  });
  let timerSaw = -1;
  setTimeout(() => {
    timerSaw = store.n;
  }, 0);
  store.n = 1;
  await flush();
  console.error = realError;
  console.log(
    '3. batched subscriber that always writes:',
    JSON.stringify({calls, timerSaw, reports: reported.length}),
  );
}
```

### `probe-d2.ts`: what a subscriber's error does

```ts
// What a subscriber's error does to the writer and to the other subscribers.
// Run on the unmodified source and on each D2 spike.
import {
  batch,
  createClassyStore,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const reported: string[] = [];
const realError = console.error;
console.error = (error: unknown) =>
  void reported.push(String((error as Error)?.message ?? error));
const uncaught: string[] = [];
process.on(
  'uncaughtException',
  (error) => void uncaught.push(`uncaughtException: ${error.message}`),
);
process.on(
  'unhandledRejection',
  (error) =>
    void uncaught.push(`unhandledRejection: ${(error as Error).message}`),
);
const attempt = (run: () => unknown) => {
  try {
    return `returned ${JSON.stringify(run())}`;
  } catch (error) {
    return `threw "${(error as Error).message}"`;
  }
};
const take = (list: string[]) => JSON.stringify(list.splice(0));

class Counter {
  count = 0;
  increment() {
    this.count++;
    return 'done';
  }
  failAfterWriting() {
    this.count++;
    throw new Error('the method failed');
  }
}
const make = (options?: {sync: true}) => {
  const store = createClassyStore(new Counter());
  const calls: string[] = [];
  subscribe(
    store,
    () => {
      throw new Error('first subscriber failed');
    },
    options,
  );
  subscribe(
    store,
    () => {
      throw new Error('second subscriber failed');
    },
    options,
  );
  subscribe(store, () => calls.push(`third:${store.count}`), options);
  return {store, calls};
};

{
  const {store, calls} = make({sync: true});
  console.log(
    'direct write          :',
    attempt(() => {
      store.count = 1;
      return store.count;
    }),
    '| others',
    take(calls),
    '| console.error',
    take(reported),
  );
  console.log(
    'method                :',
    attempt(() => store.increment()),
    '| count',
    store.count,
    '| others',
    take(calls),
    '| console.error',
    take(reported),
  );
  console.log(
    'method that throws    :',
    attempt(() => store.failAfterWriting()),
    '| count',
    store.count,
    '| others',
    take(calls),
    '| console.error',
    take(reported),
  );
  console.log(
    'batch()               :',
    attempt(() =>
      batch(() => {
        store.count = 10;
        return 'done';
      }),
    ),
    '| others',
    take(calls),
    '| console.error',
    take(reported),
  );
  console.log(
    'write after the errors:',
    attempt(() => {
      store.count = 11;
      return store.count;
    }),
    '| others',
    take(calls),
  );
  reported.length = 0;
}
{
  const {store, calls} = make();
  const result = attempt(() => {
    store.count = 1;
    return store.count;
  });
  await flush();
  await flush();
  console.log(
    'batched subscribers   :',
    result,
    '| others',
    take(calls),
    '| console.error',
    take(reported),
    '| process',
    take(uncaught),
  );
}
{
  const store = createClassyStore(new Counter());
  subscribe(
    store,
    async () => {
      throw new Error('async subscriber failed');
    },
    {sync: true},
  );
  subscribe(store, async () => {
    throw new Error('async batched subscriber failed');
  });
  const result = attempt(() => {
    store.count = 1;
    return store.count;
  });
  await flush();
  await flush();
  console.log(
    'async subscribers     :',
    result,
    '| console.error',
    take(reported),
    '| process',
    take(uncaught),
  );
}
console.error = realError;
```

### `probe-d3.ts`: a setter that throws

```ts
// D3: a setter that throws part-way, and a setter that writes one field.
import {
  createClassyStore,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

class Person {
  first = 'Ada';
  last = 'Lovelace';
  set full(value: string) {
    const [first, last] = value.split(' ');
    this.first = first as string;
    if (!last) throw new Error('no last name');
    this.last = last;
  }
  set firstOnly(value: string) {
    this.first = value;
  }
}
const store = createClassyStore(new Person());
const seen: string[] = [];
subscribe(store, () => seen.push(`${store.first} ${store.last}`), {sync: true});
let thrown = 'nothing';
try {
  store.full = 'Grace';
} catch (error) {
  thrown = (error as Error).message;
}
console.log(
  'setter that throws after one write:',
  JSON.stringify({thrown, seen: seen.splice(0)}),
);
store.firstOnly = 'Mary';
console.log('setter that writes one field:', JSON.stringify(seen.splice(0)));
store.firstOnly = 'Mary';
console.log(
  'setter that writes the value it already holds:',
  JSON.stringify(seen.splice(0)),
);
```

### `probe-d4.ts`: what `batch()` does with each kind of callback

```ts
// What batch() does with each kind of callback. Run on the unmodified source and on each D4 spike.
import {
  batch,
  createClassyStore,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const save = () => Promise.resolve('saved');
const cases: [string, (store: {a: number; b: number}) => unknown][] = [
  [
    'a plain function',
    (store) =>
      batch(() => {
        store.a = 1;
        store.b = 1;
        return 'done';
      }),
  ],
  [
    'an async function that awaits',
    (store) =>
      (batch as (run: () => unknown) => unknown)(async () => {
        store.a = 1;
        await save();
        store.b = 1;
      }),
  ],
  [
    'an async function that never awaits',
    (store) =>
      (batch as (run: () => unknown) => unknown)(async () => {
        store.a = 1;
        store.b = 1;
      }),
  ],
  [
    'a plain function that returns a promise after its writes',
    (store) =>
      (batch as (run: () => unknown) => unknown)(() => {
        store.a = 1;
        store.b = 1;
        return save();
      }),
  ],
];
for (const [label, run] of cases) {
  const store = createClassyStore({a: 0, b: 0});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  let outcome: string;
  try {
    const result = run(store);
    outcome =
      result instanceof Promise
        ? 'returned a promise'
        : `returned ${JSON.stringify(result)}`;
  } catch (error) {
    outcome = `threw ${(error as Error).name}`;
  }
  const atReturn = calls;
  await flush();
  console.log(
    `${label}: ${outcome} | writes applied a=${store.a} b=${store.b} | sync calls at return ${atReturn}, after settling ${calls}`,
  );
}
```

### `counts.ts`: the counts of D5

```ts
// D5: how many times a subscriber is called, by kind, for the cases the brief names.
import {
  batch,
  createClassyStore,
  subscribe,
} from '../wt/packages/classy-store/src/index.ts';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class Form {
  a = 0;
  b = 0;
  rows = Array.from({length: 100}, (_, index) => ({id: 99 - index}));
  setBoth(value: number) {
    this.a = value;
    this.b = value;
  }
  get pair() {
    return `${this.a}/${this.b}`;
  }
  set pair(value: string) {
    const [a, b] = value.split('/').map(Number);
    this.a = a as number;
    this.b = b as number;
  }
  async load() {
    this.a = 1; // before the await: inside the method's transaction
    this.b = 1;
    await Promise.resolve();
    this.a = 2; // after the await: two direct writes
    this.b = 2;
  }
}

const cases: [string, (store: Form) => unknown][] = [
  [
    'two direct writes',
    (store) => {
      store.a = 1;
      store.b = 1;
    },
  ],
  ['a method that writes two fields', (store) => store.setBoth(1)],
  [
    'Object.assign(store, {a, b})',
    (store) => Object.assign(store, {a: 1, b: 1}),
  ],
  [
    'a setter that writes two fields',
    (store) => {
      store.pair = '1/1';
    },
  ],
  [
    'an in-place sort of 100 rows',
    (store) => store.rows.sort((left, right) => left.id - right.id),
  ],
  [
    'two direct writes inside batch()',
    (store) =>
      batch(() => {
        store.a = 1;
        store.b = 1;
      }),
  ],
  [
    'an async method: two writes, an await, two writes',
    (store) => store.load(),
  ],
  [
    'two direct writes, an await, two direct writes',
    async (store) => {
      store.a = 1;
      store.b = 1;
      await Promise.resolve();
      store.a = 2;
      store.b = 2;
    },
  ],
];

console.log('| Case | `{sync: true}` | Batched (the default) |');
console.log('| --- | ---: | ---: |');
for (const [label, run] of cases) {
  const store = createClassyStore(new Form());
  let sync = 0;
  let batched = 0;
  subscribe(store, () => sync++, {sync: true});
  subscribe(store, () => batched++);
  await run(store);
  await flush();
  console.log(`| ${label} | ${sync} | ${batched} |`);
}
```

### `spikeBatchTypes.test.ts`: what the D4 type accepts, placed in `packages/classy-store/src/` for the typecheck

```ts
// SPIKE, not for commit: which calls of batch() the D4 type accepts.
import {expectTypeOf, test} from 'bun:test';
import {batch, createClassyStore} from './index';

const store = createClassyStore({count: 0, loading: false});
declare function save(): Promise<string>;
declare const anything: any;
declare const unknownValue: unknown;

test('what the type accepts', () => {
  // 1. Accepted, and the return type is passed through.
  expectTypeOf(batch(() => store.count)).toEqualTypeOf<number>();
  expectTypeOf(batch(() => {})).toEqualTypeOf<void>();
  expectTypeOf(batch(() => ({a: 1}))).toEqualTypeOf<{a: number}>();
  expectTypeOf(batch(() => anything)).toEqualTypeOf<any>();
  expectTypeOf(batch(() => unknownValue)).toEqualTypeOf<unknown>();
  expectTypeOf(batch(() => [1, 'a'] as const)).toEqualTypeOf<
    readonly [1, 'a']
  >();

  // 2. Refused: an async function.
  // @ts-expect-error
  batch(async () => {
    store.count = 1;
  });
  // 3. Refused: a function that returns a promise after its writes.
  // @ts-expect-error
  batch(() => {
    store.loading = true;
    return save();
  });
  // 4. Refused: sometimes a promise.
  // @ts-expect-error
  batch(() => (store.loading ? save() : 'cached'));
  // 5. A promise the caller does not return is fine.
  batch(() => {
    store.loading = true;
    void save();
  });
  // 6. A function passed by reference.
  const increment = () => store.count++;
  expectTypeOf(batch(increment)).toEqualTypeOf<number>();
  const load = async () => 'x';
  // @ts-expect-error
  batch(load);
});

// 7. A wrapper that is generic over the return type.
export function grouped<T>(run: () => T): T {
  return batch(run);
}
```

### `typeProbe.ts`: the two forms of the D4 type, for `tsc --noEmit --strict`

```ts
type Synchronous<T> = T extends PromiseLike<unknown> ? never : T;
declare function batchNever<T>(run: () => Synchronous<T>): T;

type SynchronousSaid<T> =
  T extends PromiseLike<unknown>
    ? 'batch() groups only synchronous writes, so its callback must not return a promise'
    : T;
declare function batchSaid<T>(run: () => SynchronousSaid<T>): T;

declare const store: {count: number};
declare function save(): Promise<string>;

batchNever(async () => {
  store.count = 1;
});
batchSaid(async () => {
  store.count = 1;
});
batchSaid(() => save());
const fine: number = batchSaid(() => store.count);
const alsoFine: void = batchSaid(() => {});
export function grouped<T>(run: () => T): T {
  return batchSaid(run);
}
export function groupedWithCast<T>(run: () => T): T {
  return batchSaid(run as () => SynchronousSaid<T>);
}
```

### `withSubscriber.mjs`: timings with a synchronous subscriber attached

```js
// Paths the core benchmark does not time: a method call, a batch and a setter
// while one {sync: true} subscriber is attached, as every adapter attaches.
// Usage: <bun|node> withSubscriber.mjs <path to a build's dist/index.mjs>
const {batch, createClassyStore, subscribe} = await import(process.argv[2]);

class Counter {
  count = 0;
  other = 0;
  increment() {
    this.count++;
  }
  set both(value) {
    this.count = value;
    this.other = value;
  }
}
const metrics = {
  'method, one sync subscriber': () => {
    const store = createClassyStore(new Counter());
    subscribe(store, () => {}, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.increment();
    };
  },
  'batch of ten writes, one sync subscriber': () => {
    const store = createClassyStore(new Counter());
    subscribe(store, () => {}, {sync: true});
    let next = 0;
    const ten = () => {
      for (let w = 0; w < 10; w++) store.count = next++;
    };
    return (n) => {
      for (let i = 0; i < n; i++) batch(ten);
    };
  },
  'setter that writes two fields, one sync subscriber': () => {
    const store = createClassyStore(new Counter());
    subscribe(store, () => {}, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.both = i;
    };
  },
  'direct write, five sync subscribers': () => {
    const store = createClassyStore(new Counter());
    for (let s = 0; s < 5; s++) subscribe(store, () => {}, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.count = i;
    };
  },
};
const out = {};
for (const [name, setup] of Object.entries(metrics)) {
  const run = setup();
  let iterations = 1000;
  for (;;) {
    const start = performance.now();
    run(iterations);
    if (performance.now() - start > 20) break;
    iterations *= 2;
  }
  const until = performance.now() + 100;
  while (performance.now() < until) run(iterations);
  const samples = [];
  for (let s = 0; s < 21; s++) {
    const start = performance.now();
    run(iterations);
    samples.push(((performance.now() - start) * 1e6) / iterations);
  }
  samples.sort((a, b) => a - b);
  out[name] = Math.round(samples[10]);
}
console.log(JSON.stringify(out));
```

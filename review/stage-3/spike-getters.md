# Stage 3 spikes: getter memoization

Seven spikes on getter memoization, for stage 3 of the pre-1.0 review. All of
it is throwaway code, run in a worktree at `release/1.0` (`57404c3`). Nothing
in the repository was changed apart from this file.

The report stands on its own. Every patch, every list of failing tests, every
number and every script is in an appendix, because the scratch folder may be
cleared.

## Summary

**Recommendation.** Take one combination. Its patch is in appendix E under
"The combination".

- One kind of getter dependency (G3c). It contains the stamp (G1), "record
  each property once" (G2) and the fix for a getter over a missing property
  (stage 1 finding 32).
- The dependency on a getter that threw (the first half of G4), on both
  layers.
- The two fixes to the snapshot layer (G5).
- A snapshot getter that writes to `this` is refused (G7a).

Measured against the unmodified worktree:

| Measure             | Today       | Combination                                                                                        |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Lines               |             | 182 added, 144 removed, in `core.ts`, `core.types.ts` and `snapshot.ts`                            |
| Tests               | 1,341 pass  | 1,325 pass, 16 fail. 15 pin a stage 1 finding the change removes. 1 pins behaviour nobody promised |
| Typecheck           | passes      | passes                                                                                             |
| Main entry, gzipped | 3,661 bytes | 3,826 bytes. The budget is 3,750, so it fails by 76                                                |
| (being measured)    |

**The three results that matter most.**

1. **The stamp is safe for a subtree that has left the store.** This was the
   open question of the merged report (dependency 6), and it is now tested,
   not read. Four hand-written cases and a differential fuzz of 300 seeds
   give no stale read: 180,112 getter reads compared with a plain mirror,
   55,058 of them on a node outside the store. The stamp rests on one line of
   `ownership.ts`: `resume()` bumps a node's version when a child changed
   while the node was suspended. With that line removed, two of the four
   cases go stale and 70 seeds fail. The stamp also holds under the two
   simplifications of `ownership.ts` that stage 3 is weighing. See G1.
2. **A nested getter must be revalidated by its value and by the version of
   the node that value is.** The value alone gives a stale result, as the
   Signals report said, and the repository's 1,341 tests do not notice: the
   wrong design fails only the tests the right one fails. Stage 4 needs the
   test first. One kind of dependency (G3c) is the smallest of the correct
   designs, 77 bytes smaller than the three kinds with the fix bolted on, and
   costs nothing that Bun can measure. On Node a write followed by a getter
   read costs 5 to 8 percent more. See G3.
3. **Recording a dependency on a getter that threw is not a one-line fix.**
   Two getters can then record each other, which happens as soon as one of
   them catches the other's cycle error. Any validation that follows
   dependencies then recurses without end. The Signals sketch `spike-one`
   does exactly that: it returns a number that depends on how deep the stack
   was when it overflowed. The same happens on a snapshot today. The fix is a
   frame that covers validation as well as the run. See G3, G4 and G5.

**Not recommended.**

- **Recording reads outside the getter's own node (G6).** It works on the
  live store, costs 124 bytes and 14 to 18 percent on a getter over 1,000
  rows, and cannot work on a snapshot, which is what every adapter reads.
  Document the limit and the pattern that works today: hold the other store
  as a field.
- **Caching a thrown error (the second half of G4).** It costs 73 bytes and
  changes seven pinned behaviours for one gain: a getter that throws does not
  run again on the next read. It can follow 1.0.

**One decision for the owner.** Whether a getter that writes should also
throw on the live store (G7b). I lean yes, before 1.0. It costs 51 bytes and
four pinned tests. No getter in the examples, the docs or the library source
writes to a store.

**What every spike measured, in one table.** "Fixes", "incidental" and
"regression" are the three classes of the common brief.

| Spike                                                          | Lines           | Tests failing          |           Main entry | Recommendation         |
| -------------------------------------------------------------- | --------------- | ---------------------- | -------------------: | ---------------------- |
| Unmodified                                                     |                 | 0                      |                3,661 |                        |
| M: a missing property is a value                               | +10 −7          | 5 fixes                |                3,678 | Do, inside G3c         |
| G1: the stamp                                                  | +17 −4          | 5 fixes, 1 incidental  |                3,703 | Do, inside G3c         |
| G1e: the stamp as a global write counter                       | +21 −4          | the same 6             |                3,708 | Do not                 |
| G2: record once per run                                        | +13 −1          | 0                      |                3,685 | Do, inside G3c         |
| G3b: refresh, compare value and node version, three kinds kept | +69 −18         | 7 fixes, 1 incidental  |                3,781 | Do not: G3c is smaller |
| G3c: one kind of dependency                                    | +91 −103        | the same 8             |                3,704 | Do                     |
| Signals sketch `spike-refresh` (value only)                    | +31 −7          | the same 8             |                3,716 | Do not: stale results  |
| Signals sketch `spike-one`                                     | +93 −115        | 9                      |                3,711 | Do not: no guard       |
| G4: errors cached with their dependencies, both layers         | +104 −33        | 2 fixes, 4 incidental  |                3,817 | First half only        |
| G5: snapshot memo map and cycle error                          | +38 −14         | 5 fixes                |                3,748 | Do                     |
| G6: reads outside the own node, on G3c                         | +63 −6 over G3c | 3 more fixes           |                3,828 | Do not: document       |
| G7a: a write in a snapshot getter throws                       | +12 −1          | 1 fix                  |                3,739 | Do                     |
| G7b: on the live store too                                     | +24 −1          | 1 fix, 4 incidental    |                3,771 | Owner's decision       |
| **The combination**                                            | +182 −144       | 15 fixes, 1 incidental |                3,826 | Do                     |
| The combination with errors cached                             | +244 −161       | 15 fixes, 8 incidental | 73 more than without | Do not now             |
| The combination with G7b                                       | +194 −144       | 15 fixes, 5 incidental |                3,877 | Owner's decision       |

No spike has a regression. No spike changes a signature or a public type.

## How the spikes were run

- **Baseline.** The worktree at `57404c3`, unmodified: 1,341 tests pass, the
  package typecheck passes, the main entry is 3,661 bytes gzipped. In a fresh
  worktree the typecheck fails until `bun run build` has run once, because
  one test helper imports the built package.
- **One variant per spike.** Each is a set of whole files copied over the
  unmodified source, so a spike is measured alone. G3b, G3c and G6 build on
  the earlier ones and say so.
- **Per spike:** `bun run test`, the package typecheck, `bun run size`, and
  the reproductions of appendix D. Then both benchmarks and the extra
  measures of the brief, run on a copy of the spike's built `dist`, so the
  worktree could move on while a benchmark ran.
- **The two Signals sketches** were applied unchanged, as the brief asks.
  Their base files are identical to today's source, so they needed no
  rebasing.
- **Noise.** Other agents were running benchmarks on the same machine. A
  difference inside the spread of the runs is called "same" below. On Bun the
  spread of `getter.cached` is wide: the unmodified build gave medians of
  58.6, 69.5 and 74 nanoseconds in three sets of runs on one day. On Node it is narrow, so the Node figures decide the small
  questions.
- **One figure of my script is not to be trusted:** the `field` column of
  `single` in appendix B. It moves by 15 percent with whatever ran before it
  in the process. The benchmark's `store.read`, which is the same read in a
  fresh process, is the same for every spike.

## G1. A stamp on each cached getter

- **Question.** Can a clean read of a getter cost the same whatever is below
  it? Is the node's own version safe as the stamp, in particular for a
  subtree that is detached or suspended? Stage 2 defect 2, Signals 1, MobX 3
  (step 2), merged entries M18 and M23, contradictions 14 and 16, dependency
  6.
- **What was changed.** `core.ts` (`evaluateComputed`, `areDepsValid`) and
  `core.types.ts`: 17 lines added, 4 removed. It is the Signals agent's
  `spike-stamp`, unchanged. Each cache entry keeps the node's version at the
  moment it was last found valid, taken before the body runs. A read at the
  same version returns at once.

### Result

- **Tests:** 6 fail.
  - 5 **fixes**: they pin stage 1 finding 32, a getter over a missing
    property that runs on every read. Four are in
    `core.characterisation.getters.test.ts` and `core.fuzz.findings.test.ts`;
    the fifth is the randomized differential test, which expects the defect
    through a flag.
  - 1 **incidental**: "Object.defineProperty on a store: an existing property
    > a redefined value is read at once, by the store and by a live getter,
    while the cached snapshot and its getter stay behind". Today the live
    getter sees a value that `Object.defineProperty` wrote without a
    notification, because a value dependency reads the raw object again on
    every read. With the stamp it stays behind until the next write, as the
    snapshot does. The traps report's T3 (a) makes a definition a write, and
    with it the live getter is right again: I applied its patch on top of the
    combination and reproduction R11 gives `[2,14]` as today.
- **The stamp alone fixes only half of finding 32** (contradiction 14,
  settled). Probe P8: read, read, write an unrelated field, read.

  |                                                                     | Runs after two reads | Runs after the unrelated write |
  | ------------------------------------------------------------------- | -------------------: | -----------------------------: |
  | Today                                                               |                    2 |                              3 |
  | Stamp alone (G1)                                                    |                    1 |                              2 |
  | Missing property recorded as a value (M), with or without the stamp |                    1 |                              1 |

  So Svelte 4, Vue 8 and MobX 10 are right: it needs the marker. With the
  stamp alone the repository's fuzz cannot be made green by flipping its
  flag. With M it passes 600 seeds, ten times its default. M alone is 10
  lines and 17 bytes.
- **Typecheck:** passes. **Size:** 3,703 bytes, 42 more.
- **Timings.** Nanoseconds for the benchmark rows, with the lowest and
  highest run; microseconds for the ladder.

  |                                                  |          Bun, today |             Bun, G1 |         Node, today |            Node, G1 |
  | ------------------------------------------------ | ------------------: | ------------------: | ------------------: | ------------------: |
  | `getter.cached`                                  | 69.5 (62.5 to 78.1) | 54.7 (49.4 to 55.8) | 81.9 (81.2 to 84.1) | 59.7 (59.6 to 61.1) |
  | Ratio to a forwarding Proxy                      |                34.3 |                25.7 |                3.64 |                2.71 |
  | `getter.recompute`                               |    506 (413 to 524) |    447 (359 to 529) |    386 (385 to 400) |    380 (380 to 382) |
  | Ladder, depth 8: first read                      |                 316 |                 164 |                 286 |                 191 |
  | Ladder, depth 8: clean read                      |                6.38 |                0.71 |                10.3 |                0.33 |
  | Ladder, depth 16: clean read                     |               1,148 |                0.13 |               2,377 |                0.21 |
  | Ladder, depth 20: first read                     |              23,338 |                17.1 |              32,312 |                18.0 |
  | Ladder, depth 20: clean read                     |              17,755 |                0.08 |              32,816 |                0.13 |
  | Ladder, depth 20: after an unrelated write       |              17,853 |                 3.0 |              32,610 |                1.33 |
  | Ladder, depth 20: after the bottom field changed |              26,780 |                11.0 |              48,982 |                15.5 |
  | 1,000 rows, `this.rows[i]` in a loop: clean read |                31.7 |                0.13 |                18.4 |                0.13 |
  | The same, after an unrelated write               |                32.1 |                31.0 |                18.3 |                17.8 |
  | One getter over three fields: clean read, ns     |                85.1 |                48.7 |                 112 |                65.2 |

  The first read of the ladder is as slow as a clean read today, because each
  getter validates the ones below it while it is being computed. The stamp
  removes both. It does not help the loop getter after an unrelated write:
  that is G2.

### Is the stamp safe for a detached or suspended subtree?

Yes. This is the part the Signals report only read.

- **Four hand-written cases** (R12 in appendix D): a getter on a node that
  left the store, with writes below it through proxies that were kept; a
  child shared with an owner that is still in the store, written through
  that owner; a child that is observed and so cannot suspend, under a parent
  that can; and nested getters over a list that is replaced and put back
  while outside. The stamp gives the expected values in all four.
- **A differential fuzz** (`fuzz-detached.mjs`, appendix F). Groups with five
  getters each leave the store, are written to through kept proxies, are
  subscribed to and unsubscribed from, and come back. Every getter read is
  compared with a plain mirror. 300 seeds of 400 steps: 180,112 reads
  compared, 55,058 on a group outside the store, 34,796 writes to a group
  outside the store. No failure on today's source, on G1, on G3c or on the
  combination.
- **The test can fail.** With the version bump in `resume()` removed
  (`ownership.ts:131`), cases two and three of R12 give `[1,1,4]` for
  `[1,2,4]` and `[1,1,3,4,4]` for `[1,2,3,4,4]` under the stamp, and are
  right without it. The fuzz fails 70 seeds of 300 with the stamp and 64
  without, because snapshots need the same bump. So the stamp depends on
  that one line, which stage 1 finding 72 already lists as needed and which
  16 tests pin.
- **Why it holds.** Every trap and `getInternal` call `resumeScope()` first.
  A suspended node whose child changed gets its version bumped there, before
  the stamp is compared.
- **Under the simplifications stage 3 is weighing for `ownership.ts`**
  (merged entry M14). I ran the stamp with `resumeScope()` reduced to
  `this.resume()`, with no walk to a detached parent, and again with
  suspension switched off. Both give 0 failures of 300 seeds and the right
  values in R12. The tests that fail are the union of what each change fails
  alone: 5 and 9 for the two ownership changes, and no test fails that
  neither fails alone.

### The node's version or a global write counter?

Contradiction 16. MobX 3 proposes one module-level counter. I ran it as G1e:
the same six tests fail, the fuzz passes, and it is 5 bytes larger. It gives
up the gain for getters on nested nodes, because a write anywhere makes every
getter validate again. Probe P9: 1,000 rows with a getter each, one row is
written, all 1,000 getters are read.

|                                  |     Bun |     Node |
| -------------------------------- | ------: | -------: |
| Today                            | 81.5 µs | 100.1 µs |
| Stamp is the node's version (G1) | 44.0 µs |  55.8 µs |
| Stamp is a global counter (G1e)  | 80.7 µs | 104.1 µs |

The node's version is the right stamp.

### What it changes for a user

A live getter no longer notices a write made through the raw object, or a
silent `Object.defineProperty`, until the next write through the store. That
is how snapshots behave today (stage 1 finding 11). Reproduction R10 goes
from `[2,10,10]` to `[2,2,10]`. No test pins the raw-object case.

### Recommendation

**Do it, as part of G3c. Can follow 1.0.** It changes no API and no
documented behaviour. Take the node's version, not a counter. Take M with it,
which is what closes finding 32. M alone changes a documented sentence: the
API reference says "A live getter that reads an absent field recomputes on
subsequent reads". That makes M **Before 1.0** by the rule, though no
consumer can be broken by a getter that runs less often.

### Cost for stage 4

`core.ts` and `core.types.ts`, about 20 lines for the stamp and 10 for M.
Tests to write first: the four R12 cases, and getter reads on kept groups in
the repository's fuzz. Flip the fuzz flag
`A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE` and rewrite the four tests
of finding 32. Risk low. Numbers: 59 bytes on the main entry for both. The
cached-getter ratio falls from 3.64 to 2.71 on Node, so its limit of 5.3
could be tightened.

## G2. Record each property once per run

- **Question.** Does a getter that reads `this.rows[i]` in a loop have to pay
  for every read? Stage 1 finding 3, stage 2 defect 3, Signals 3, merged
  entry M20.
- **What was changed.** `core.ts`: 13 lines added, 1 removed. The tracker
  frame gets a set of the properties already recorded. `recordDep` and
  `recordComputedDep` skip a property that is in it. The first read is the
  one kept, which is the strictest choice when a getter writes between two
  reads.

### Result

- **Tests:** none fail. **Typecheck:** passes. **Size:** 3,685 bytes, 24
  more.
- **Timings,** 1,000 rows, microseconds per read:

  |                                                | Bun, today | Bun, G2 | Node, today | Node, G2 |
  | ---------------------------------------------- | ---------: | ------: | ----------: | -------: |
  | `this.rows[i]` in a loop: first read           |        900 |     903 |         953 |    1,406 |
  | Clean read                                     |       31.7 |    0.17 |        18.4 |     0.29 |
  | After an unrelated write                       |       32.1 |    0.17 |        18.3 |     0.17 |
  | After a row changed                            |        261 |     250 |         410 |      391 |
  | `this.rows` read once into a local: clean read |       0.13 |    0.13 |        0.13 |     0.17 |
  | After a row changed                            |        144 |     143 |         295 |      291 |

  The loop reads `rows` 2,001 times, 1,001 in the condition and 1,000 in the
  body, and today each read is one entry in the list. With G2 it is one
  entry. A read that recomputes is not faster: its cost is the 2,001 reads
  through the proxy, not the recording. The loop form stays about 1.4 to 1.8
  times the hoisted form when it recomputes.
- **Benchmark.** `getter.cached`: same on Bun; 77.8 against 81.9 on Node.
  `getter.recompute` on Node: 403 (402 to 403) against 386 (385 to 400), 4
  percent more, which is the set made for each run. On Bun it is inside the
  spread. `getter.rows.recompute`: same on both.

### What it changes for a user

Nothing.

### Recommendation

**Do it, inside G3c. Can follow 1.0.**

### Cost for stage 4

`core.ts`, about 12 lines. One test: the loop getter records one dependency,
seen as a clean read that costs the same as the hoisted form, or through a
count of trap calls as `equality.arrayScan.test.ts` does. Risk low. 24 bytes.

## G3. How a nested getter is revalidated

- **Question.** When getter `c` reads getter `b`, how should `c` decide
  whether it is still valid? And can the three kinds of dependency become
  one, at what cost? MobX 3 (step 1), Signals 2 and its section "Could our
  three kinds of dependency become one?", merged entries M19 and M27,
  contradiction 1, dependency 9.
- **The designs, on the same cases.**
  - **Today.** A dependency on a getter is valid only if that getter's whole
    list is valid. Its value is never asked.
  - **(a) Value only.** Refresh the nested getter through its own memo and
    compare the value. MobX 3 step 1; the Signals sketch `spike-refresh`.
  - **(b) G3b: value and node version, three kinds kept.** On top of G1 and
    G2: 69 lines added, 18 removed. The `computed` kind gains the getter and
    the version of the node its value is.
  - **(c) G3c: one kind.** 91 lines added, 103 removed. An entry is
    `{prop, value, version, getter?}`: what the property gave, the version of
    the node that value is or -1, and the getter when the property is one.
    `recordComputedDep`, `activeTracker`, the `kind` field and the
    `parent`, `target` and `internal` fields go. It contains G1, G2 and M.
  - **The Signals sketch `spike-one`**, unchanged: one kind, keyed by
    property in a `Map`, each dependency read again through a descriptor
    lookup.

### Result

|                                                                         | Today | (a) value only | (b) G3b | (c) G3c  | `spike-one`                                            |
| ----------------------------------------------------------------------- | ----- | -------------- | ------- | -------- | ------------------------------------------------------ |
| R1, the cutoff: runs of `label` after `a` goes 1 to 3                   | 2     | 1              | 1       | 1        | 1                                                      |
| R2: `firstPrice` after `rows[0].price = 2`                              | 2     | **1, stale**   | 2       | 2        | 2                                                      |
| Fuzz for nodes outside the store, seeds failing of 300                  | 0     | **300**        | 0       | 0        | 0                                                      |
| R13: a getter that catches a cycle error, read after an unrelated write | 0     | 0              | 0       | 0        | **a number in the thousands, after thousands of runs** |
| Repository tests failing                                                | 0     | 8              | 8       | 8        | 9                                                      |
| Lines                                                                   |       | +31 −7         | +69 −18 | +91 −103 | +93 −115                                               |
| Main entry, bytes                                                       | 3,661 | 3,716          | 3,781   | 3,704    | 3,711                                                  |

- **Tests.** (b) and (c) fail the same 8: the 6 of G1, and 2 **fixes** that
  pin the missing cutoff: "nested getters, three levels deep, on the live
  store > re-runs every level from the top even when the innermost result is
  unchanged" and "> skips the outermost level when the middle getter was
  re-read first and gave the same result". Typecheck passes for both.
- **(a) is wrong, and the suite does not see it.** `spike-refresh` fails the
  same 8 tests as the correct designs and no other. No test in the
  repository reads, through a second getter, a node that a first getter
  returned and that was then written to. My fuzz has that (`firstV` reads
  `first`, which returns `this.rows[0]`) and every seed fails on it.
- **`spike-one` has no guard.** It records a dependency on a getter that
  threw, which is the first half of G4, and validates by reading
  dependencies again. When a getter catches another's cycle error, the two
  record each other, and validation recurses until the stack overflows. Its
  own `catch` swallows the `RangeError` somewhere down the stack, so the
  read returns a number that depends on the depth of the stack, 5,234 in the
  run of appendix D, where the right answer is 0. G3b and G3c push the getter's frame
  before they validate, so the same getter asked for again is reported as a
  cycle. Reproduction R13.
- **Validation never runs a getter the current path no longer reads.** Probe
  P1: `pick` reads `enabled`, then `heavy`. After `enabled` goes false and
  `heavy` would throw, `pick` gives 0 and `heavy` has not run, on today's
  source, G3b and the combination. Dependencies are checked in the order they
  were first read, and the first difference stops the walk.

### The cost the Signals report measured

It found 206 against 300 nanoseconds, 45 percent more, for a write to
another field followed by a getter read. Measured here, nanoseconds, best of
seven rounds:

|                                                      |       Bun: today |  G3b |  G3c | `spike-one` |      Node: today |  G3b |  G3c | `spike-one` |
| ---------------------------------------------------- | ---------------: | ---: | ---: | ----------: | ---------------: | ---: | ---: | ----------: |
| One getter over three fields: clean read             |             85.1 | 50.8 | 50.4 |        46.3 |              112 | 66.8 | 66.2 |        66.1 |
| Write another field, then read                       |              274 |  241 |  254 |         312 |              312 |  318 |  340 |         365 |
| Write a field it reads, then read                    |              445 |  405 |  407 |         414 |              490 |  533 |  525 |         532 |
| A getter that reads another getter: clean read       |              106 | 49.8 | 50.5 |        47.6 |              153 | 68.6 | 69.6 |        70.3 |
| Write another field, then read                       |              283 |  268 |  281 |         371 |              357 |  351 |  370 |         442 |
| Write a field the inner getter reads, then read      |              593 |  550 |  542 |         583 |              786 |  876 |  754 |         799 |
| Ladder, depth 20, after the bottom field changed, µs |           26,780 | 8.71 | 9.58 |        10.2 |           48,982 | 13.0 | 13.2 |        13.3 |
| `getter.cached`, benchmark                           |             69.5 | 46.3 | 50.3 |        46.8 |             81.9 | 61.2 | 62.1 |        61.2 |
| `getter.recompute`, benchmark                        | 506 (413 to 524) |  372 |  441 |         406 | 386 (385 to 400) |  404 |  416 |         416 |

- The cost of `spike-one` is real but smaller than reported: 14 percent on
  Bun and 17 on Node for one getter, 31 and 24 percent for a getter that
  reads another.
- G3c removes most of it. It stores the getter in the entry, so a miss on
  the stamp does not look a descriptor up, and it checks a child by its
  stored version as today's code does. On Bun nothing is outside the spread.
  On Node a write followed by a read costs 8 to 9 percent more than today.
- The combination checks a plain value on the raw object without a lookup in
  the child map. That brings the Node figures to within 5 percent of today:
  see "The combination".
- About half of the Node cost in `getter.recompute` is G2's set (403 against
  386), which every design here has.

### Is the simpler code worth it?

Yes.

- It is the smallest correct design: 3,704 bytes against 3,781 for G3b, and
  12 lines fewer than today where G3b is 51 more.
- One shape of entry and one loop. "A dependency is what a property of my
  node gave me, and the version of the node it gave" is the whole rule. The
  three sources of a value, a getter, a child and a plain value, are still
  three branches in the loop, so nothing is hidden.
- The branch that stage 1 finding 64 lists as dead goes, and so does the
  question of whether the first half of G4 makes it live.
- A dependency on the set of keys, which the `has` and `ownKeys` traps of
  the traps report need, is one more entry of the same shape.
- It costs nothing measurable on Bun and 5 to 8 percent on Node for a write
  followed by a getter read, on an operation of 400 nanoseconds of which the
  write is 190.

### What it changes for a user

- A getter runs less often: an outer getter is not run again when an inner
  one recomputes to the same value.
- A sentence in `ARCHITECTURE.md` stops being true: "Dependency validation
  follows those cached dependencies without executing a raw getter just to
  check whether it changed". Under (b) and (c), checking an outer getter runs
  an inner one whose own dependencies changed.

### Recommendation

**Do (c), G3c. Can follow 1.0,** apart from M inside it, which is covered
under G1. Do not take (a). Do not take `spike-one` as written.

### Cost for stage 4

`core.ts`, the section "Dependency tracking for computed getters" and the two
places in the `get` trap that record, and `core.types.ts`: about 100 lines
rewritten. Tests to write first, all green on today's code:

- a getter that returns a child node, read by another getter (R2);
- a getter that returns a child array, iterated by another getter (P3);
- the same on a snapshot (P7);
- a dependency that the current path no longer reads is not run (P1);
- a getter that catches a cycle error, read again after an unrelated write
  (R13);
- the fuzz for nodes outside the store, with `firstV`.

Then the two cutoff tests are rewritten. Risk medium: it is the part of
`core.ts` the plan calls hardest to reason about, and `core.ts` is a target
of the mutation run, so its list of unkillable mutants has to be redone for
this section. Numbers: 43 bytes on the main entry; the benchmark baseline for
`getter.cached` and `getter.recompute` moves.

## G4. A getter that throws

- **Question.** Should a thrown error be cached with the dependencies read
  before the throw, and how does a getter that catches another's error
  recover? Stage 1 finding 36 (last case) and 64, MobX 2, Signals 4, merged
  entry M22.
- **What was changed.** Two halves, measured together and apart.
  - **The dependency.** A getter that reads another getter records it
    whether it returns or throws, on both layers.
  - **The cache.** A thrown error is kept with the dependencies read before
    it and thrown again, without running the body, until one of them
    changes. An error that recorded no dependency is never kept.
  - Alone on today's source (the G4 patch): `core.ts`, `core.types.ts` and
    `snapshot.ts`, 104 lines added, 33 removed.

### Result

- **Tests,** both halves: 6 fail.
  - 2 **fixes**, finding 36: "a getter that catches the error of another
    getter > keeps its fallback on the live store after the other getter
    recovers" and "> keeps its fallback on later snapshots after the other
    getter recovers".
  - 4 **incidental**, all from the cache: "a getter that throws > runs its
    body and throws a new error on every read", "> keeps throwing after a
    write to a field it never read", "> passes its error through a getter
    that reads it, which is not cached either" and "> throws on every read of
    a snapshot, while a snapshot taken after the fix returns". Each pins that
    the body runs again.
- **Tests,** the dependency without the cache, as the combination has it:
  of these six, only the 2 fixes fail.
- **Typecheck:** passes. **Size:** 3,817 bytes for both halves alone, 156
  more. In the combination the dependency costs about 30 bytes and the cache
  73 more.
- **Timings:** same as today. `getter.cached` 64.7 (58.1 to 81.2) on Bun and
  81.0 (80.7 to 81.4) on Node.
- **Reproductions.**

  |                                                                                      | Today                   | Dependency only         | With the cache               |
  | ------------------------------------------------------------------------------------ | ----------------------- | ----------------------- | ---------------------------- |
  | R4: `safe` catches `strict`; after `ready = true`                                    | `fallback`, for good    | `ready`                 | `ready`                      |
  | R4: runs of `strict` and `safe` after two reads, an unrelated write and a third read | 1 and 1                 | 3 and 2                 | 1 and 1                      |
  | R5: `strict` read twice while it throws                                              | 2 runs, 2 error objects | 2 runs, 2 error objects | 1 run, the same error object |
  | R5b: a getter that throws before it reads anything                                   | not cached              | not cached              | not cached                   |
  | R6: a cycle that a write breaks                                                      | recovers                | recovers                | recovers                     |
  | R6: message when `a` is read after `b` found the cycle                               | `a → b → a`             | `a → b → a`             | `b → a → b`                  |

- **The rule from the Signals report holds.** An error that recorded no
  dependency is not kept (R5b). The cycle that Preact and the polyfill get
  stuck on recovers (R6), because the dependency on the getter that closes
  the cycle is recorded before the error leaves.
- **The dependency is not a one-line `finally`.** See result 3 of the
  summary and R13. With the walk of today's code it needs a flag on the
  entry being walked. With G3b or G3c it needs the frame that covers
  validation. The combination has the second.
- **The cache also keeps a cycle error,** so a later read of another getter
  on the cycle throws the first path found. Three pinned tests notice:
  "getters that read each other in a cycle > throw a plain Error that names
  the path, starting from the getter that was read", "> throw a new error on
  every read" and "> throw only while the state closes the cycle".

### What it changes for a user

- The dependency: a getter that catches another getter's error leaves its
  fallback when that getter recovers. While the inner getter throws, the
  outer one runs again after each write to the store, and the inner one twice
  per such read. A clean read is still cached.
- The cache: a getter that throws gives the same error object until a
  dependency changes, and its body does not run in between.

### Recommendation

**Do the dependency. Can follow 1.0.** It is a bug fix with no change to the
API or the docs. **Do not cache the error now. Can follow 1.0.** It costs 73
bytes and seven pinned behaviours, and its one gain is that the body of a
getter that throws is not run again. Nothing a consumer could rely on changes
when it is added later.

### Cost for stage 4

The dependency: a few lines in the `get` trap and in `areDepsValid`, and in
`snapshot.ts` the tracking proxy and `areMemoizedDepsValid`. Tests first:
R13 on both layers, R5b, R6. Then rewrite the two tests of finding 36. Risk
low once G3c is in. About 30 bytes.

## G5. The snapshot layer

- **Question.** Why does the snapshot layer lose nested memoization, and can
  a getter cycle on a snapshot give the live layer's error? Stage 1 findings
  37 and 38, stage 2 defect 7, Signals 5 and 6, merged entries M24 and M25.
- **What was changed.** `snapshot.ts`, 38 lines added, 14 removed.
  - The memo map of a target is made before any getter runs. Today a nested
    getter makes it, and the outer getter then replaces it with a new one.
    The Signals `spike-memo` reads the map again afterwards; this is the
    same fix one step earlier.
  - A stack of the snapshot getters being evaluated, by snapshot and name.
    The same getter on the same snapshot, asked for again before it
    answered, throws the live layer's error with the path. The frame covers
    the check of the previous dependencies as well as the run.
  - In the combination, the text of the error is one function exported from
    `core.ts`, so it is in the bundle once.

### Result

- **Tests:** 5 fail, all **fixes**.
  - Finding 37: "nested getters, three levels deep, on snapshots > re-runs
    the two inner getters, not the outermost, on the next snapshot after an
    unrelated write", "> runs nothing on the snapshot after that one",
    "> gives an inner getter result a new identity on the next snapshot when
    the outer getter was read first", and "> skips the outer levels when a
    memoized inner getter recomputes to the same result", whose setup counts
    the extra runs.
  - Finding 38: "getters that read each other in a cycle > overflow the
    stack on a snapshot instead of reporting the cycle".
- **Typecheck:** passes. **Size:** 3,748 bytes alone, 87 more.
- **Timings:** same. No row of the benchmark reads a getter on a snapshot. A
  chain of 20 getters read on a new snapshot after an unrelated write: 5.83
  microseconds today and 6.67 with G5 on Bun, 12.6 and 11.8 on Node.
- **Reproductions.**

  |                                                           | Today                                                                                     | G5                                                        |
  | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
  | R7: runs of `a`, `b`, `c` after the second snapshot read  | 2, 2, 1                                                                                   | 1, 1, 1                                                   |
  | R6: `a` and `b` read each other, on a snapshot            | `RangeError: Maximum call stack size exceeded`                                            | `Error: … circular computed getter dependency: b → a → b` |
  | R13: a getter that catches the cycle error, on a snapshot | a number that depends on the depth of the stack: 931, then 3,603 in the run of appendix D | 0, then 0                                                 |

- **Finding 37 is not only performance.** The third test above shows it: an
  inner getter that builds an array gives a new array on the next snapshot
  although nothing it reads changed. A selector that returns it then sees a
  change, so a component renders again for nothing. That last step is
  reasoning; the new array is the pinned test.
- **Finding 38 is worse than a `RangeError`.** In R13 the getter's own
  `catch` swallows the overflow, so the read returns a number that depends
  on the depth of the stack.

### What it changes for a user

A getter cycle on a snapshot throws a named error. A nested getter's result
keeps its identity across snapshots from the first read on.

### Recommendation

**Do it. Can follow 1.0.**

### Cost for stage 4

`snapshot.ts`, about 30 lines, and one exported function in `core.ts`. Tests
first: R13 on a snapshot. Then rewrite the five tests. Risk low.
`snapshot.ts` is a target of the mutation run. About 70 bytes in the
combination.

## G6. A getter that reads outside its own node

- **Question.** What would recording those reads take, what would it cost,
  and is documenting the limit the better answer? Stage 1 findings 36 and
  40, the note under finding 28, MobX 1, Vue 8, merged entry M21.
- **The cases today** (R9 in appendix D).

  | A getter reads                                                    | Live store, after what it read changed             |
  | ----------------------------------------------------------------- | -------------------------------------------------- |
  | Another store, through a variable                                 | stale until one of its own fields changes          |
  | Its own child, through a reference kept outside the getter        | stale; for good if it reads nothing through `this` |
  | A static, or its own class by name when the class is the store    | stale: the read goes past the Proxy                |
  | A getter on a nested node that reads the root through a variable  | stale until one of its own fields changes          |
  | A nested node through a local taken from `this` inside the getter | right                                              |

  The last case, which the brief names, is not a defect: reading
  `this.child` records the child's version, and every write below the child
  moves it. On a snapshot the first read computes afresh, so it disagrees
  with the live store; the result is then kept for that snapshot and reused
  for later ones, so it goes stale too. The pinned test at
  `core.characterisation.getters.test.ts:808` shows that for another store.
- **What was changed.** On top of G3c, in `core.ts` and `core.types.ts`: 63
  lines added, 6 removed.
  - The frame keeps a set of the nodes that a recorded dependency already
    covers: the own node's children handed out in this run, and theirs.
  - A read on any other node records that node's version, once per node.
  - Those entries are checked after the own ones, with `resumeScope()` first.
  - An entry that has them cannot use the own node's version as its stamp,
    since a write to another store does not move it. It is stamped with a
    global write counter.

### Result

- **Tests:** the 8 of G3c, and 3 more, all **fixes** of finding 36: "getters
  that reach beyond their own fields > a getter that reads another store
  keeps its result after that store changes", "> a getter that reads a child
  through a held reference keeps its result after the child changes", and
  "a getter that reads a getter of another store > keeps its result after
  the other store changes and its getter has recomputed".
- **One pinned finding does not flip:** "the same holds on snapshots,
  including the snapshot after an unrelated write"
  (`core.characterisation.getters.test.ts:808`). The snapshot layer is still
  stale. Today the live store is stale and a first snapshot is fresh. With
  G6 it is the other way round.
- **Typecheck:** passes. **Size:** 3,828 bytes, 124 more than G3c.
- **Timings.** A set lookup for every read on a node below the own one.

  |                                                  | Bun: G3c |      G6 | Node: G3c |      G6 |
  | ------------------------------------------------ | -------: | ------: | --------: | ------: |
  | `getter.rows.recompute`, benchmark, ns           |  151,907 | 179,247 |   266,262 | 305,720 |
  | 1,000 rows in a loop, after a row changed, µs    |      234 |     269 |       402 |     463 |
  | 1,000 rows from a local, after a row changed, µs |      136 |     155 |       299 |     342 |
  | `getter.cached`, benchmark, ns                   |     50.3 |    53.3 |      62.1 |    62.3 |

  14 to 18 percent on every recomputation of a getter over a list.
- **A static cannot be recorded** at all: a class is not a store.

### Why the snapshot layer cannot follow

- A snapshot getter's result is cached per snapshot, and a snapshot is
  frozen. If the result could change when another store changes, the same
  snapshot would give two answers, which is what a snapshot exists to
  prevent.
- A new snapshot is made only when this store changes, and an adapter is told
  only then. A component that reads such a getter would not render again
  when the other store changes, whatever the live layer records.

### What works today

Hold the other store as a field. A store embedded by its proxy is a child:
its writes bubble to the holder, the getter records a dependency on it, and
the holder's subscribers are told. Reproduction R14: `[20,20]` before and
`[30,30]` after on the live store and the snapshot, with one notification on
the holder.

### Recommendation

**Do not record. Document the limit. Before 1.0,** because it states what a
getter may read. The docs say "keep getters pure" in four places and name
time and external variables. They should say:

- a getter may read `this` and what it reaches from `this`;
- another store is an external variable, unless it is held as a field;
- a reference to a node kept outside the getter is one too.

A development warning for a read on a node that no dependency covers is the
set of G6 without the recording. It belongs with the development build
(merged entries M72 and M73) and **can follow 1.0**.

### Cost for stage 4

Docs only: `TUTORIAL.md` ("Keep computed getters pure"), `PATTERNS.md`,
`ARCHITECTURE.md`, the package README, and a line in the API reference under
"Getters". The three pinned tests of finding 36 stay as they are and lose
their `FINDING:` mark. If the owner prefers the recording: 63 lines, 124
bytes, 14 to 18 percent on list getters, and the docs still have to state
the snapshot limit.

## G7. A getter that writes

- **Question.** What happens today on each layer, and what are the options?
  Stage 1 finding 39, Signals 7, MobX 6, Solid 8, Svelte 11, merged entry
  M26, contradiction 11.
- **Today** (R8 and `probe-writes.mjs`).

  | The getter                                            | Live store                                                                                                   | Snapshot                                                              |
  | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
  | writes a field of `this` that it reads                | writes, notifies, and runs again on every read                                                               | the write is dropped without a word; the getter returns the old value |
  | writes a field of `this` that it does not read        | writes and notifies once, then cached                                                                        | dropped without a word                                                |
  | fills a cache field on first read, `this.cache ??= …` | works                                                                                                        | returns `undefined`                                                   |
  | writes to a child, `this.child.n = 1`                 | writes and notifies                                                                                          | `TypeError`, the child is frozen                                      |
  | sorts a child array in place                          | writes and notifies                                                                                          | `TypeError`                                                           |
  | is read by a sync subscriber during its own write     | "circular computed getter dependency", pinned at `core.characterisation.getters.test.ts:1375`, not run by me |                                                                       |

  So a write to a child already throws on a snapshot. Only a write to `this`
  is lost, because inside a snapshot getter `this` is a Proxy over an empty
  object with no `set` trap. The write lands on that empty object.
- **What was changed.**
  - **G7a.** `snapshot.ts`, 12 lines added, 1 removed: `set`,
    `defineProperty` and `deleteProperty` traps on that Proxy that refuse.
    Measured alone with a message that names the getter and the field. In
    the combination the traps return `false`, which a getter, being strict
    code, sees as the engine's `TypeError`.
  - **G7b.** `core.ts`, 12 more lines: the `set` and `deleteProperty` traps
    of a store throw while any getter is running.

### Result

- **G7a.** 1 test fails, a **fix**: "a getter that writes to the store while
  it runs > drops the write on a snapshot: no error, no notification,
  snapshot and store unchanged". Typecheck passes. 3,739 bytes with the
  message, 78 more; 20 bytes in the combination, where the traps return
  `false`.
- **G7b.** 4 more fail, all in the same block, all **incidental**: they pin
  finding 39 on the live store. "> never settles when it pushes to an array
  it reads", "> re-runs, writes and notifies on every read when it writes a
  field it reads", "> reports a circular dependency to a sync subscriber
  that reads the getter during its write", and "> writes and notifies once
  per recomputation when it writes a field it does not read". Typecheck
  passes. 51 bytes on top of the combination, most of it the message.
- **Timings:** not measured for G7b. It adds one length check to every
  write.
- **Who writes in a getter today.** I scanned 288 getters in 261 files: the
  examples, the docs, the demo stores of the site and the library source.
  None writes to a store. The two that call `sort` sort a copy. The only
  getters that write are the three fixtures of the tests above.
- **With the stamp,** a getter that writes behaves as today on the live
  store. The stamp is taken before the body runs, so the entry is checked
  again on the next read. R8 gives the same lines for G1 and G3c as for
  today.

### The options

1. **Leave both layers, and document.** Finding 39 stays.
2. **G7a.** A write to `this` in a snapshot getter throws, as a write to a
   child does today. The layers still differ, but nothing is lost in
   silence.
3. **G7a and G7b.** A getter that writes throws on both layers, with a
   message that names the getter and the field on the live store.
4. **A development warning** from the `set` trap, as MobX, Solid and the
   Signals report propose. It needs the development build.

### What it changes for a user

- G7a: a getter that assigns to `this` throws a `TypeError` when it is read
  on a snapshot, which is where every adapter reads it. Today it returns a
  wrong value there.
- G7b: the same getter throws on the live store too. A getter that fills a
  cache field on its first read stops working, as the Svelte report notes.
  On our library that getter already returns `undefined` through every
  adapter.

### Recommendation

**Do G7a. Can follow 1.0:** it turns a silent wrong answer into the error
the same getter already gets for a child.

**G7b is the owner's decision, and it is Before 1.0,** because it makes
something that runs today throw. I lean yes. Every adapter reads snapshots,
so with G7a a getter that writes already fails wherever a component reads
it. G7b makes the live store say the same thing, with a better message, and
closes finding 39 with one rule: a getter must not write. An error is
stricter than Preact, the TC39 polyfill and Vue, which is the other side of
contradiction 11. If the owner prefers the warning, take G7a now and option
4 with the development build.

One gap in the G7b spike: a getter that runs on a snapshot and writes to a
live store is not refused, because the snapshot layer keeps its own stack.

### Cost for stage 4

G7a: `snapshot.ts`, 6 lines, one test rewritten. G7b: `core.ts`, 12 lines,
four tests rewritten, a sentence in the tutorial and the API reference, and
a decision on the gap above. Risk low.

## The combination

- **What it is.** G3c with the check of a plain value made on the raw
  object, the dependency half of G4, G5 and G7a. `core.ts` 101 lines added
  and 97 removed, `core.types.ts` 13 and 23, `snapshot.ts` 68 and 24.
- **Tests:** 16 fail, listed in appendix C.
  - 5 pin finding 32 (G1 and M).
  - 2 pin the missing cutoff (G3).
  - 2 pin finding 36, the getter that catches an error (G4).
  - 5 pin findings 37 and 38 (G5).
  - 1 pins finding 39 on a snapshot (G7a).
  - 1 is incidental: the `defineProperty` test described under G1.
- **Fuzz.** The repository's differential fuzz passes 600 seeds with the
  finding-32 flag flipped. The fuzz for nodes outside the store passes 300
  seeds.
- **Typecheck:** passes.
- **Size,** bytes gzipped:

  | Entry                 | Today | Combination | Budget |
  | --------------------- | ----: | ----------: | -----: |
  | `.`                   | 3,661 |       3,826 |  3,750 |
  | `./utils` adds        | 2,686 |       2,686 |  2,750 |
  | `./collections` adds  |   727 |         722 |    750 |
  | `./react` adds        | 1,662 |       1,662 |  1,700 |
  | `./react/server` adds |   153 |         149 |    175 |
  | `./vue` adds          |   280 |         284 |    300 |
  | `./svelte` adds       |   182 |         185 |    200 |
  | `./angular` adds      |   271 |         279 |    300 |
  | `./solid` adds        |   312 |         312 |    335 |

  Only the main entry fails its budget, by 76 bytes. Roughly: G3c 43, G5
  70, the dependency of G4 30, G7a 20.
  (being measured)

### With the traps report

- **T3 (a), a definition is a write.** Its patch applies on top of the
  combination without a conflict. 32 tests fail, which is the union of the
  two sets, and none that neither fails alone. R11 is right again.
- **A redefined getter** (stage 1 finding 44). With T3 (a) a getter that
  read another getter is still stale after that getter is redefined as data
  (probe P5: `[3,100,3,101]`), as today, because the cache is kept by name.
  Clearing the node's getter cache in the `defineProperty` and
  `deleteProperty` traps fixes it: P5 gives `[3,100,101,101]`, and three
  more pinned tests flip, the one of finding 44 and two of finding 30. One
  line each. It should be limited to a property that is or was an accessor.
- **`has` and `ownKeys` traps.** Under G3c the `has` trap can call the same
  `recordDep` with the value the property has, or the missing marker. A
  dependency on the set of keys is one more entry.

## The order for stage 4

Each step is one commit with the suite green. Every step from 2 on touches
`core.ts` or `snapshot.ts`, which are targets of the mutation run, so each
needs that run and its list of unkillable mutants brought up to date.

0. **The size budget of the main entry, decided first.** `bun run size` is a
   gate in CI, and step 3 already takes the main entry past 3,750 bytes.
1. **Tests that pass today and guard the rewrite:** R2, P1, P3, P7, the four
   cases of R12, R13 on the live store, R5b, R6, and the fuzz for nodes
   outside the store.
2. **G5:** the snapshot memo map, then the snapshot cycle error.
3. **G7a.**
4. **M:** a missing property is a value. Flip the fuzz flag. Change the
   sentence in the API reference.
5. **G1:** the stamp. One test changes, the `defineProperty` one. If T3 (a)
   of the traps report is in by then, it has been rewritten there already,
   and with both changes a live getter sees a definition as it sees a write
   (R11).
6. **G2:** record once.
7. **G3c:** one kind of entry, the frame that covers validation, the
   refresh with value and node version. The two cutoff tests are rewritten.
   Update the paragraph "Nested getter support" in `ARCHITECTURE.md`.
8. **The dependency of G4,** on both layers.
9. **Docs for G6,** and G7b if approved.
10. **The benchmark baseline,** taken again, and the cached-getter limits if
    the owner wants them tighter.

Steps 2 and 3 are independent of the rest. Steps 5 to 7 can be one commit
if the owner prefers the rewrite in one piece: G3c contains the other two.
Done apart, each is small enough to bisect.

`CONSTRAINTS.md` numbers this moves:

- **Size of the main entry:** 3,750 does not hold. The combination needs
  3,826, and 3,877 with G7b. Merged dependency 21 asks for the budget to be
  set once for the whole set of approved changes; these are the getter
  figures for that sum.
- **Cached getter cost:** it falls. The limits of 41 on Bun and 5.3 on Node
  could be tightened after the baseline is taken again.
- **Mutation:** the lists of unkillable mutants for `core.ts` and
  `snapshot.ts` have to be redone for the rewritten functions. The dead
  branch of finding 64 goes.

## Verified and not verified

**Run, with the output in the appendices:**

- `bun run test`, the package typecheck and `bun run size` for every spike
  in the summary table.
- Both benchmarks for the unmodified build, G1, G2, G3b, G3c, `spike-one`,
  G4, G5 and G6, three runs each, and five runs for the combination with
  the unmodified build before and after it.
- The extra measures of the brief for the same builds, on both engines.
- The reproductions R1 to R15 on every spike, and the probes P1 to P9.
- The fuzz for nodes outside the store on today's source, G1, G1e, G3b,
  G3c, G6, `spike-refresh`, `spike-one` and the combination, and on G1 and
  the combination with three changes to `ownership.ts`.
- The repository's fuzz at 600 seeds, with its flag flipped, on G1 with M,
  on M alone and on the combination.
- The traps report's T3 (a) patch on top of the combination: tests,
  R11 and P5.

**Read, not run:**

- The claim that a development warning for G6 is the covered set without the
  recording.
- The scan for getters that write is a text scan of getter bodies for
  assignments to `this` and for the mutating methods of arrays, maps and
  sets. A getter that writes through a helper function would be missed.

**Reasoning:**

- Why the snapshot layer cannot record another store.
- That error caching and the stamp can follow 1.0 without breaking a
  consumer.

**Not run, as the common brief says:** the browser, framework, React
compatibility, Next.js and mutation suites, and `bun run test:coverage`. The
rewritten code has branches the suite may not reach yet, so stage 4 must
check the 100 percent rule.

**One thing I did wrong.** At about 09:37 I stopped my own benchmark with a
command that matches by process name. The traps agent had a benchmark running
at that moment. If one of its runs failed then, that was me.

What is not done is listed in the last section of this file, after the
appendices.

## Appendix A: the benchmark, per spike

`bun run benchmark:core` and `bun run benchmark:core:node`, run on a copy of
each spike's built `dist`. Nanoseconds per operation: the median over the
runs, with the lowest and highest run in brackets. The last four rows are the
ratios that `CONSTRAINTS.md` limits. The single spikes ran three fresh
processes each, one spike after another, between 06:16 and 07:10 on a machine
that other agents were using. The combination ran five, with the unmodified
build before and after it.

### Single spikes on Bun 1.4.4 (JavaScriptCore), three runs

| Metric                  |                      Base |                        G1 |                        G2 |                       G3b |                       G3c |               `spike-one` |                        G4 |                        G5 |                        G6 |
| ----------------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: |
| `proxy.read`            |       1.98 (1.98 to 2.03) |       2.17 (2.01 to 2.24) |        2.17 (1.9 to 2.17) |        1.98 (1.9 to 2.17) |       1.94 (1.94 to 2.17) |       2.01 (1.94 to 2.17) |       1.98 (1.94 to 2.17) |       2.48 (1.98 to 2.48) |       1.98 (1.94 to 2.17) |
| `store.read`            |       31.5 (30.6 to 32.1) |       31.7 (30.9 to 31.7) |       32.1 (31.7 to 32.9) |       32.1 (31.8 to 32.2) |         31.1 (31 to 32.1) |         32 (31.9 to 33.1) |       32.1 (31.5 to 32.2) |         31.8 (31.2 to 32) |       31.5 (31.3 to 32.4) |
| `store.read.nested`     |          106 (104 to 109) |          104 (104 to 106) |          107 (106 to 107) |          107 (106 to 107) |          106 (106 to 108) |          108 (107 to 109) |          106 (104 to 107) |          107 (106 to 107) |          107 (105 to 109) |
| `proxy.write`           |       61.5 (61.4 to 63.5) |         61.6 (61 to 61.7) |           60.3 (60 to 61) |       59.9 (59.9 to 59.9) |       59.9 (59.8 to 59.9) |       60.2 (60.1 to 61.6) |       59.8 (59.8 to 60.6) |       60.4 (59.9 to 60.6) |         59.9 (59.9 to 60) |
| `store.write`           |          159 (158 to 163) |          158 (158 to 160) |          156 (155 to 156) |          156 (155 to 158) |          155 (155 to 156) |          156 (156 to 160) |          156 (156 to 178) |          156 (155 to 159) |          156 (156 to 160) |
| `store.method`          |          239 (230 to 245) |          232 (229 to 236) |          226 (225 to 233) |          228 (225 to 231) |          227 (227 to 227) |          228 (227 to 235) |          226 (226 to 228) |          227 (226 to 231) |          228 (227 to 230) |
| `snapshot.cached`       |       14.6 (14.3 to 15.7) |       15.2 (13.3 to 15.6) |       15.7 (15.5 to 15.9) |       15.1 (15.1 to 15.4) |       15.5 (15.4 to 15.8) |       16.1 (15.8 to 16.7) |       15.8 (15.4 to 16.3) |       15.7 (15.3 to 16.1) |       15.6 (15.5 to 15.7) |
| `snapshot.afterWrite`   | 130668 (129864 to 135162) | 127443 (124535 to 128959) | 125748 (125302 to 125762) | 126352 (126140 to 126589) | 124703 (123295 to 124965) | 125688 (125030 to 125753) | 126079 (124019 to 126267) | 126001 (125510 to 127316) | 126307 (124958 to 126924) |
| `getter.cached`         |       69.5 (62.5 to 78.1) |       54.7 (49.4 to 55.8) |       62.4 (55.5 to 69.8) |       46.3 (46.1 to 47.3) |       50.3 (47.4 to 50.4) |       46.8 (46.3 to 49.8) |       64.7 (58.1 to 81.2) |       64.3 (56.5 to 64.9) |       53.3 (52.4 to 55.7) |
| `getter.recompute`      |          506 (413 to 524) |          447 (359 to 529) |          441 (417 to 441) |          372 (342 to 379) |          441 (378 to 462) |          406 (392 to 447) |          438 (402 to 488) |          360 (335 to 455) |          456 (421 to 573) |
| `getter.rows.recompute` | 154569 (150690 to 174945) | 140791 (138804 to 148066) | 155842 (154102 to 160435) | 149705 (140201 to 150689) |  151907 (50093 to 157180) | 147428 (145461 to 147845) | 147995 (146946 to 151646) | 151016 (146135 to 153810) | 179247 (176155 to 183969) |

| Metric   |                Base |                  G1 |                  G2 |                 G3b |                 G3c |         `spike-one` |                  G4 |                  G5 |                  G6 |
| -------- | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: |
| read     | 15.9 (15.4 to 15.9) | 14.6 (14.2 to 15.4) | 14.8 (14.6 to 17.3) | 16.2 (14.6 to 16.9) |     16 (14.8 to 16) | 16.4 (14.7 to 16.5) | 16.3 (14.5 to 16.5) | 12.9 (12.6 to 16.1) | 15.8 (14.5 to 16.7) |
| write    | 2.58 (2.57 to 2.59) |  2.59 (2.57 to 2.6) | 2.58 (2.56 to 2.59) |  2.6 (2.59 to 2.64) |  2.59 (2.59 to 2.6) |    2.6 (2.6 to 2.6) |  2.6 (2.57 to 2.97) |  2.6 (2.57 to 2.63) |  2.61 (2.6 to 2.66) |
| getter   | 34.3 (31.6 to 39.4) | 25.7 (22.1 to 27.2) | 29.2 (28.7 to 32.1) | 23.9 (21.2 to 24.3) | 24.4 (23.2 to 25.9) | 24.1 (21.3 to 24.8) | 32.7 (26.8 to 41.8) | 25.9 (22.8 to 32.8) |   26.9 (25.6 to 27) |
| snapshot |  7.38 (7.2 to 7.74) | 7.18 (5.94 to 7.55) |  7.3 (7.13 to 8.27) | 7.65 (6.97 to 8.09) | 7.93 (7.14 to 8.12) | 8.12 (7.41 to 8.34) |    7.96 (7.49 to 8) | 6.49 (6.32 to 7.76) |  7.94 (7.2 to 7.98) |

### The combination on Bun 1.4.4 (JavaScriptCore), five runs

| Metric                  |                      Base |               Combination |
| ----------------------- | ------------------------: | ------------------------: |
| `proxy.read`            |          2.08 (2 to 2.31) |        2.3 (2.04 to 2.94) |
| `store.read`            |         32 (31.4 to 32.3) |       32.2 (32.1 to 32.8) |
| `store.read.nested`     |          108 (107 to 109) |          109 (108 to 110) |
| `proxy.write`           |       63.2 (62.3 to 63.7) |       63.3 (63.1 to 64.8) |
| `store.write`           |          170 (166 to 177) |          169 (169 to 180) |
| `store.method`          |          251 (245 to 258) |          248 (246 to 255) |
| `snapshot.cached`       |       15.2 (14.9 to 16.1) |         15.5 (15.4 to 16) |
| `snapshot.afterWrite`   | 134798 (133334 to 137475) | 135080 (131306 to 136250) |
| `getter.cached`         |         74 (58.4 to 84.2) |         56.9 (48 to 63.9) |
| `getter.recompute`      |          482 (355 to 504) |          550 (348 to 665) |
| `getter.rows.recompute` | 154806 (148466 to 160994) | 152540 (149156 to 156766) |

| Metric   |                Base |         Combination |
| -------- | ------------------: | ------------------: |
| read     |   15.4 (13.6 to 16) | 14.3 (10.9 to 15.8) |
| write    | 2.69 (2.63 to 2.82) | 2.68 (2.67 to 2.79) |
| getter   |   35.3 (27.6 to 42) | 26.4 (16.3 to 29.8) |
| snapshot | 7.37 (6.45 to 8.06) | 6.97 (5.26 to 7.78) |

### Single spikes on Node (V8), three runs

| Metric                  |                      Base |                        G1 |                        G2 |                       G3b |                       G3c |               `spike-one` |                        G4 |                        G5 |                        G6 |
| ----------------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: |
| `proxy.read`            |         22.8 (22.5 to 23) |         22.1 (22 to 22.4) |             22 (22 to 22) |           22 (22 to 22.7) |       22.6 (22.5 to 22.7) |             22 (22 to 22) |           22 (22 to 22.7) |             22 (22 to 23) |             22 (22 to 22) |
| `store.read`            |         46.7 (46.7 to 47) |       45.5 (45.2 to 46.8) |         44.8 (44 to 44.8) |       44.8 (44.1 to 45.8) |         45.1 (45 to 45.7) |       45.3 (44.6 to 45.3) |           44.1 (44 to 46) |       44.1 (44.1 to 45.9) |       44.9 (44.8 to 45.8) |
| `store.read.nested`     |          141 (137 to 141) |          134 (132 to 135) |          133 (132 to 134) |          135 (135 to 136) |          138 (137 to 139) |          135 (135 to 136) |          134 (134 to 135) |          134 (134 to 134) |          134 (134 to 135) |
| `proxy.write`           |          151 (150 to 153) |          150 (149 to 172) |          147 (146 to 148) |          147 (147 to 147) |          150 (149 to 151) |          147 (146 to 147) |          146 (146 to 147) |          147 (147 to 147) |          147 (146 to 210) |
| `store.write`           |          205 (204 to 213) |          201 (197 to 204) |          199 (196 to 202) |          201 (199 to 204) |          197 (197 to 205) |          199 (195 to 202) |          201 (194 to 204) |          201 (195 to 204) |          197 (194 to 201) |
| `store.method`          |          285 (284 to 288) |          282 (280 to 287) |          277 (275 to 277) |          274 (273 to 280) |          284 (279 to 287) |          276 (274 to 285) |          275 (273 to 280) |          275 (275 to 281) |          281 (276 to 289) |
| `snapshot.cached`       |       30.5 (30.2 to 31.7) |       30.3 (25.4 to 30.3) |       29.9 (27.6 to 32.4) |       29.9 (29.7 to 30.5) |       30.6 (29.2 to 32.1) |       30.4 (29.7 to 30.7) |       29.8 (24.3 to 33.5) |       29.9 (25.2 to 30.4) |       29.8 (27.8 to 31.5) |
| `snapshot.afterWrite`   |    62286 (59517 to 65368) |    61427 (60162 to 63171) |    61050 (56212 to 63635) |    56884 (56483 to 63448) |    64027 (60631 to 64227) |    60527 (60360 to 60858) |    59961 (56189 to 62276) |    57508 (57455 to 59654) |    60589 (57184 to 60828) |
| `getter.cached`         |       81.9 (81.2 to 84.1) |       59.7 (59.6 to 61.1) |       77.8 (77.8 to 78.1) |       61.2 (61.1 to 61.4) |       62.1 (61.8 to 62.2) |       61.2 (60.9 to 61.4) |         81 (80.7 to 81.4) |         78 (77.6 to 78.2) |       62.3 (62.1 to 62.6) |
| `getter.recompute`      |          386 (385 to 400) |          380 (380 to 382) |          403 (402 to 403) |          404 (403 to 410) |          416 (416 to 417) |          416 (411 to 420) |          384 (377 to 396) |          375 (371 to 383) |          426 (424 to 435) |
| `getter.rows.recompute` | 259143 (256578 to 271608) | 253226 (247162 to 261869) | 249058 (245021 to 254108) | 248548 (246561 to 249436) | 266262 (262959 to 268319) | 251223 (247689 to 251773) | 248703 (243763 to 260054) | 246421 (245201 to 248865) | 305720 (305718 to 306938) |

| Metric   |                Base |                  G1 |                  G2 |                 G3b |                 G3c |         `spike-one` |                  G4 |                  G5 |                   G6 |
| -------- | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | -------------------: |
| read     | 2.06 (2.03 to 2.08) | 2.07 (2.01 to 2.12) |    2.03 (2 to 2.04) |    2 (1.97 to 2.08) |    2 (1.98 to 2.02) | 2.05 (2.02 to 2.06) |    2 (1.94 to 2.09) |    2 (1.92 to 2.08) |  2.04 (2.03 to 2.08) |
| write    | 1.37 (1.35 to 1.39) | 1.32 (1.19 to 1.35) | 1.35 (1.34 to 1.38) | 1.37 (1.36 to 1.39) | 1.32 (1.32 to 1.35) | 1.36 (1.33 to 1.38) | 1.37 (1.32 to 1.39) | 1.37 (1.33 to 1.39) | 1.33 (0.956 to 1.35) |
| getter   | 3.64 (3.53 to 3.69) |  2.71 (2.7 to 2.73) | 3.53 (3.53 to 3.54) | 2.78 (2.69 to 2.78) | 2.74 (2.74 to 2.75) | 2.78 (2.76 to 2.78) | 3.68 (3.56 to 3.69) | 3.54 (3.38 to 3.55) |  2.83 (2.82 to 2.84) |
| snapshot | 1.36 (1.31 to 1.39) | 1.35 (1.15 to 1.37) | 1.36 (1.25 to 1.47) | 1.35 (1.34 to 1.36) | 1.35 (1.29 to 1.43) | 1.38 (1.35 to 1.39) |  1.31 (1.1 to 1.52) |  1.3 (1.14 to 1.38) |  1.35 (1.26 to 1.43) |

### The combination on Node (V8), five runs

| Metric                  |                      Base |
| ----------------------- | ------------------------: |
| `proxy.read`            |       23.3 (23.2 to 23.4) |
| `store.read`            |         48.7 (46.8 to 50) |
| `store.read.nested`     |          142 (141 to 143) |
| `proxy.write`           |          156 (155 to 156) |
| `store.write`           |          216 (213 to 219) |
| `store.method`          |          300 (293 to 319) |
| `snapshot.cached`       |       31.9 (31.5 to 34.8) |
| `snapshot.afterWrite`   |    61563 (60689 to 66343) |
| `getter.cached`         |       83.7 (81.5 to 86.8) |
| `getter.recompute`      |          402 (398 to 408) |
| `getter.rows.recompute` | 264478 (259653 to 276894) |

| Metric   |                Base |
| -------- | ------------------: |
| read     |     2.1 (2 to 2.15) |
| write    | 1.38 (1.37 to 1.41) |
| getter   |  3.58 (3.5 to 3.72) |
| snapshot |  1.36 (1.35 to 1.5) |

## Appendix B: the extra measures, per spike

Output of `measure.mjs` (appendix F), run on the same copies of `dist`.
`ladder`, `rows` and `snapshotChain afterUnrelated` are microseconds per read,
the median of up to 400 reads. `single`, `nested`, `children` and
`snapshotChain same` are nanoseconds per operation, the best of seven rounds
of 300,000. The clock on this machine ticks in steps of about 0.04
microseconds, so a figure near 0.1 microseconds means "too fast to time".

- `ladder8`, `ladder16`, `ladder20`: the diamond ladder. `clean` is a read
  when nothing changed, `unrelated` a read after a write to a field no getter
  reads, `dirty` a read after the bottom field changed.
- `rows.loop` and `rows.hoisted`: a getter over 1,000 rows that reads
  `this.rows[i]` in a loop, and one that reads `this.rows` once into a local.
- `single`: one getter over three fields. `unrelated` is a write to another
  field followed by a read; `dirty` is a write to a field it reads followed
  by a read; `writeOnly` is the write alone.
- `nested`: a getter that reads one other getter.
- `children`: a getter over a child object and a child array of 20 rows.
- `snapshotChain`: a chain of 20 getters read on a snapshot.

### On Bun

```text
-- Base
ladder8        first 316 | clean 6.38 | unrelated 6.67 | dirty 13.1 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 2469 | clean 1148 | unrelated 1148 | dirty 1866 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 23338 | clean 17755 | unrelated 17853 | dirty 26780 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 900 | clean 31.7 | unrelated 32.1 | dirty 261
rows.hoisted   first 318 | clean 0.125 | unrelated 0.125 | dirty 144
single         field 37.7 | clean 85.1 | writeOnly 171 | unrelated 274 | dirty 445
nested         clean 106 | unrelated 283 | dirty 593
children       clean 80.8 | unrelated 259
snapshotChain  afterUnrelated 5.83 | same 5.06
-- G1
ladder8        first 164 | clean 0.708 | unrelated 1.5 | dirty 4.08 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 36.5 | clean 0.125 | unrelated 2.67 | dirty 9.04 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 17.1 | clean 0.083 | unrelated 3 | dirty 11 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 973 | clean 0.125 | unrelated 31 | dirty 298
rows.hoisted   first 318 | clean 0.083 | unrelated 0.084 | dirty 144
single         field 35.2 | clean 48.7 | writeOnly 167 | unrelated 253 | dirty 406
nested         clean 54.6 | unrelated 265 | dirty 522
children       clean 59.1 | unrelated 261
snapshotChain  afterUnrelated 5.67 | same 6.01
-- G2
ladder8        first 317 | clean 6.38 | unrelated 6.67 | dirty 13.6 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 2522 | clean 1114 | unrelated 1120 | dirty 1853 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 23365 | clean 18051 | unrelated 17965 | dirty 26664 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 903 | clean 0.167 | unrelated 0.167 | dirty 250
rows.hoisted   first 289 | clean 0.125 | unrelated 0.125 | dirty 143
single         field 34.3 | clean 81.8 | writeOnly 161 | unrelated 247 | dirty 417
nested         clean 99.1 | unrelated 267 | dirty 569
children       clean 76.8 | unrelated 240
snapshotChain  afterUnrelated 5.29 | same 5.11
-- G3b
ladder8        first 198 | clean 0.708 | unrelated 3.12 | dirty 4.54 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 45 | clean 0.166 | unrelated 3.12 | dirty 7.75 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 20.9 | clean 0.083 | unrelated 3.29 | dirty 8.71 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 828 | clean 0.125 | unrelated 0.167 | dirty 232
rows.hoisted   first 271 | clean 0.083 | unrelated 0.125 | dirty 140
single         field 31.8 | clean 50.8 | writeOnly 157 | unrelated 241 | dirty 405
nested         clean 49.8 | unrelated 268 | dirty 550
children       clean 56.4 | unrelated 257
snapshotChain  afterUnrelated 5.37 | same 5.08
-- G3c
ladder8        first 175 | clean 0.584 | unrelated 2.79 | dirty 4.04 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 40.1 | clean 0.125 | unrelated 3.21 | dirty 7.92 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 23.1 | clean 0.083 | unrelated 3.37 | dirty 9.58 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 907 | clean 0.125 | unrelated 0.167 | dirty 234
rows.hoisted   first 290 | clean 0.083 | unrelated 0.125 | dirty 136
single         field 31.7 | clean 50.4 | writeOnly 159 | unrelated 254 | dirty 407
nested         clean 50.5 | unrelated 281 | dirty 542
children       clean 55.1 | unrelated 256
snapshotChain  afterUnrelated 5.42 | same 5.49
-- spike-one
ladder8        first 171 | clean 0.709 | unrelated 3.88 | dirty 4.83 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 36.5 | clean 0.166 | unrelated 4.08 | dirty 8.79 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 27.8 | clean 0.083 | unrelated 4.87 | dirty 10.2 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 807 | clean 0.125 | unrelated 0.209 | dirty 235
rows.hoisted   first 291 | clean 0.083 | unrelated 0.125 | dirty 137
single         field 32.1 | clean 46.3 | writeOnly 156 | unrelated 312 | dirty 414
nested         clean 47.6 | unrelated 371 | dirty 583
children       clean 52.4 | unrelated 261
snapshotChain  afterUnrelated 5.33 | same 4.96
-- G4
ladder8        first 330 | clean 6.92 | unrelated 7.21 | dirty 14.1 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 2582 | clean 1312 | unrelated 1313 | dirty 2142 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 23987 | clean 20159 | unrelated 20041 | dirty 29934 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 913 | clean 30.7 | unrelated 31 | dirty 278
rows.hoisted   first 305 | clean 0.125 | unrelated 0.125 | dirty 147
single         field 37 | clean 94.9 | writeOnly 168 | unrelated 281 | dirty 433
nested         clean 124 | unrelated 295 | dirty 574
children       clean 82.2 | unrelated 243
snapshotChain  afterUnrelated 5.67 | same 6.29
-- G5
ladder8        first 309 | clean 6.29 | unrelated 6.62 | dirty 13 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 2418 | clean 1119 | unrelated 1105 | dirty 1826 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 20952 | clean 17428 | unrelated 17465 | dirty 26147 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 941 | clean 31.2 | unrelated 31 | dirty 276
rows.hoisted   first 310 | clean 0.125 | unrelated 0.125 | dirty 143
single         field 37 | clean 85.1 | writeOnly 173 | unrelated 276 | dirty 439
nested         clean 104 | unrelated 280 | dirty 578
children       clean 80.4 | unrelated 251
snapshotChain  afterUnrelated 6.67 | same 6.04
-- G6
ladder8        first 208 | clean 0.584 | unrelated 2.96 | dirty 4.5 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 42.9 | clean 0.125 | unrelated 3.5 | dirty 8.58 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 30.9 | clean 0.083 | unrelated 3.08 | dirty 10.1 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 990 | clean 0.125 | unrelated 0.167 | dirty 269
rows.hoisted   first 301 | clean 0.083 | unrelated 0.125 | dirty 155
single         field 31.7 | clean 49.9 | writeOnly 156 | unrelated 244 | dirty 407
nested         clean 49.6 | unrelated 275 | dirty 554
children       clean 54.6 | unrelated 247
snapshotChain  afterUnrelated 5.29 | same 5.28
-- Base
ladder8        first 384 | clean 6.38 | unrelated 6.71 | dirty 13.2 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 2489 | clean 1169 | unrelated 1186 | dirty 1929 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 24276 | clean 18585 | unrelated 18492 | dirty 27876 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 1071 | clean 32.7 | unrelated 32.8 | dirty 271
rows.hoisted   first 336 | clean 0.125 | unrelated 0.125 | dirty 149
single         field 38.8 | clean 86.7 | writeOnly 185 | unrelated 289 | dirty 459
nested         clean 108 | unrelated 293 | dirty 611
children       clean 82.6 | unrelated 272
snapshotChain  afterUnrelated 5.79 | same 5.21
```

### On Node

```text
-- Base
ladder8        first 286 | clean 10.3 | unrelated 10.3 | dirty 19.9 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 3742 | clean 2377 | unrelated 2364 | dirty 3566 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 32312 | clean 32816 | unrelated 32610 | dirty 48982 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 953 | clean 18.4 | unrelated 18.3 | dirty 410
rows.hoisted   first 395 | clean 0.125 | unrelated 0.125 | dirty 295
single         field 45.9 | clean 112 | writeOnly 191 | unrelated 312 | dirty 490
nested         clean 153 | unrelated 357 | dirty 786
children       clean 96.4 | unrelated 303
snapshotChain  afterUnrelated 12.6 | same 29.3
-- G1
ladder8        first 191 | clean 0.333 | unrelated 1.21 | dirty 5.46 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 34.2 | clean 0.208 | unrelated 2.12 | dirty 14.2 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 18 | clean 0.125 | unrelated 1.33 | dirty 15.5 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 870 | clean 0.125 | unrelated 17.8 | dirty 401
rows.hoisted   first 371 | clean 0.125 | unrelated 0.125 | dirty 299
single         field 50.4 | clean 65.2 | writeOnly 186 | unrelated 304 | dirty 473
nested         clean 67.9 | unrelated 344 | dirty 823
children       clean 66.9 | unrelated 282
snapshotChain  afterUnrelated 11.1 | same 27.4
-- G2
ladder8        first 309 | clean 11 | unrelated 11 | dirty 21.5 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 3606 | clean 2112 | unrelated 2111 | dirty 3228 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 32098 | clean 32368 | unrelated 32238 | dirty 48652 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 1406 | clean 0.292 | unrelated 0.167 | dirty 391
rows.hoisted   first 374 | clean 0.167 | unrelated 0.167 | dirty 291
single         field 45.9 | clean 113 | writeOnly 194 | unrelated 303 | dirty 529
nested         clean 148 | unrelated 347 | dirty 827
children       clean 93.2 | unrelated 289
snapshotChain  afterUnrelated 11.4 | same 27.4
-- G3b
ladder8        first 217 | clean 0.333 | unrelated 1.88 | dirty 7.33 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 40.8 | clean 0.208 | unrelated 5.21 | dirty 10.2 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 16.3 | clean 0.125 | unrelated 2.08 | dirty 13 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 845 | clean 0.125 | unrelated 0.25 | dirty 398
rows.hoisted   first 363 | clean 0.125 | unrelated 0.166 | dirty 295
single         field 50.3 | clean 66.8 | writeOnly 191 | unrelated 318 | dirty 533
nested         clean 68.6 | unrelated 351 | dirty 876
children       clean 66.8 | unrelated 295
snapshotChain  afterUnrelated 11.3 | same 27.3
-- G3c
ladder8        first 212 | clean 0.292 | unrelated 1.92 | dirty 7.25 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 23.8 | clean 0.167 | unrelated 1.96 | dirty 10.4 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 17.9 | clean 0.125 | unrelated 2.12 | dirty 13.2 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 917 | clean 0.166 | unrelated 0.167 | dirty 402
rows.hoisted   first 376 | clean 0.125 | unrelated 0.167 | dirty 299
single         field 52.2 | clean 66.2 | writeOnly 191 | unrelated 340 | dirty 525
nested         clean 69.6 | unrelated 370 | dirty 754
children       clean 68.5 | unrelated 295
snapshotChain  afterUnrelated 11.8 | same 33.6
-- spike-one
ladder8        first 191 | clean 0.333 | unrelated 3.29 | dirty 5.96 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 32.5 | clean 0.167 | unrelated 4.58 | dirty 10.6 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 15.7 | clean 0.125 | unrelated 4.25 | dirty 13.3 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 757 | clean 0.125 | unrelated 0.375 | dirty 396
rows.hoisted   first 406 | clean 0.125 | unrelated 0.167 | dirty 292
single         field 52.1 | clean 66.1 | writeOnly 188 | unrelated 365 | dirty 532
nested         clean 70.3 | unrelated 442 | dirty 799
children       clean 68.6 | unrelated 316
snapshotChain  afterUnrelated 11.3 | same 28.7
-- G4
ladder8        first 318 | clean 9.62 | unrelated 10 | dirty 18.8 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 4044 | clean 2111 | unrelated 2129 | dirty 3250 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 31853 | clean 32271 | unrelated 32149 | dirty 48239 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 1386 | clean 18 | unrelated 17.8 | dirty 397
rows.hoisted   first 366 | clean 0.125 | unrelated 0.125 | dirty 283
single         field 44.5 | clean 111 | writeOnly 185 | unrelated 304 | dirty 474
nested         clean 148 | unrelated 344 | dirty 755
children       clean 94.5 | unrelated 293
snapshotChain  afterUnrelated 11 | same 26.7
-- G5
ladder8        first 279 | clean 9.58 | unrelated 9.83 | dirty 19 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 3522 | clean 2021 | unrelated 2035 | dirty 3089 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 30875 | clean 31199 | unrelated 31172 | dirty 47709 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 982 | clean 17.7 | unrelated 17.7 | dirty 401
rows.hoisted   first 370 | clean 0.166 | unrelated 0.167 | dirty 297
single         field 44.9 | clean 109 | writeOnly 191 | unrelated 302 | dirty 500
nested         clean 147 | unrelated 353 | dirty 792
children       clean 92.2 | unrelated 296
snapshotChain  afterUnrelated 11.8 | same 33.6
-- G6
ladder8        first 243 | clean 0.292 | unrelated 1.83 | dirty 7.58 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 27.1 | clean 0.167 | unrelated 1.96 | dirty 10.8 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 75.8 | clean 0.125 | unrelated 2.38 | dirty 13.5 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 1059 | clean 0.166 | unrelated 0.167 | dirty 463
rows.hoisted   first 673 | clean 0.125 | unrelated 0.167 | dirty 342
single         field 49.8 | clean 65.7 | writeOnly 185 | unrelated 328 | dirty 547
nested         clean 67.2 | unrelated 362 | dirty 786
children       clean 66.7 | unrelated 288
snapshotChain  afterUnrelated 11.2 | same 27.3
-- Base
ladder8        first 330 | clean 9.46 | unrelated 9.38 | dirty 18.7 | bodies 15 first, 0 clean, 0 unrelated, 15 per dirty read
ladder16       first 3721 | clean 2323 | unrelated 2304 | dirty 3542 | bodies 31 first, 0 clean, 0 unrelated, 31 per dirty read
ladder20       first 34015 | clean 34955 | unrelated 34847 | dirty 52329 | bodies 39 first, 0 clean, 0 unrelated, 39 per dirty read
rows.loop      first 1623 | clean 19.3 | unrelated 19.2 | dirty 423
rows.hoisted   first 400 | clean 0.125 | unrelated 0.125 | dirty 315
single         field 46.6 | clean 115 | writeOnly 196 | unrelated 316 | dirty 499
nested         clean 154 | unrelated 357 | dirty 794
children       clean 94.1 | unrelated 301
snapshotChain  afterUnrelated 12.1 | same 29.1
```

## Appendix C: the tests each spike makes fail

From `bun run test` in the worktree, 1,341 tests at the baseline. Every other
test passes. The classes are given in the section of each spike.

### M: a missing property is a value: 5 failing

```text
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### G1: the stamp: 6 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### G1e: the stamp as a global write counter: 6 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### G2: record once: 0 failing

None.

### G1 and G2 together: 6 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### G3b: refresh, compare value and node version: 8 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### G3c: one kind of dependency: 8 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### The Signals sketch `spike-refresh`: 8 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### The Signals sketch `spike-one`: 9 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### G4: errors cached with their dependencies: 6 failing

```text
a getter that catches the error of another getter > keeps its fallback on later snapshots after the other getter recovers
a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
a getter that throws > keeps throwing after a write to a field it never read
a getter that throws > passes its error through a getter that reads it, which is not cached either
a getter that throws > runs its body and throws a new error on every read
a getter that throws > throws on every read of a snapshot, while a snapshot taken after the fix returns
```

### G5: the snapshot layer: 5 failing

```text
getters that read each other in a cycle > overflow the stack on a snapshot instead of reporting the cycle
nested getters, three levels deep, on snapshots > gives an inner getter result a new identity on the next snapshot when the outer getter was read first
nested getters, three levels deep, on snapshots > re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write
nested getters, three levels deep, on snapshots > runs nothing on the snapshot after that one
nested getters, three levels deep, on snapshots > skips the outer levels when a memoized inner getter recomputes to the same result
```

### G6: reads outside the own node, on G3c: 11 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that reads a getter of another store > keeps its result after the other store changes and its getter has recomputed
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
getters that reach beyond their own fields > a getter that reads a child through a held reference keeps its result after the child changes
getters that reach beyond their own fields > a getter that reads another store keeps its result after that store changes
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### G7a: a write in a snapshot getter throws: 1 failing

```text
a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
```

### G7b: a write in a getter throws on both layers: 5 failing

```text
a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
a getter that writes to the store while it runs > never settles when it pushes to an array it reads
a getter that writes to the store while it runs > re-runs, writes and notifies on every read when it writes a field it reads
a getter that writes to the store while it runs > reports a circular dependency to a sync subscriber that reads the getter during its write
a getter that writes to the store while it runs > writes and notifies once per recomputation when it writes a field it does not read
```

### The combination: 16 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that catches the error of another getter > keeps its fallback on later snapshots after the other getter recovers
a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
getters that read each other in a cycle > overflow the stack on a snapshot instead of reporting the cycle
nested getters, three levels deep, on snapshots > gives an inner getter result a new identity on the next snapshot when the outer getter was read first
nested getters, three levels deep, on snapshots > re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write
nested getters, three levels deep, on snapshots > runs nothing on the snapshot after that one
nested getters, three levels deep, on snapshots > skips the outer levels when a memoized inner getter recomputes to the same result
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### The combination with G7b: 20 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that catches the error of another getter > keeps its fallback on later snapshots after the other getter recovers
a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
a getter that writes to the store while it runs > never settles when it pushes to an array it reads
a getter that writes to the store while it runs > re-runs, writes and notifies on every read when it writes a field it reads
a getter that writes to the store while it runs > reports a circular dependency to a sync subscriber that reads the getter during its write
a getter that writes to the store while it runs > writes and notifies once per recomputation when it writes a field it does not read
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
getters that read each other in a cycle > overflow the stack on a snapshot instead of reporting the cycle
nested getters, three levels deep, on snapshots > gives an inner getter result a new identity on the next snapshot when the outer getter was read first
nested getters, three levels deep, on snapshots > re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write
nested getters, three levels deep, on snapshots > runs nothing on the snapshot after that one
nested getters, three levels deep, on snapshots > skips the outer levels when a memoized inner getter recomputes to the same result
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

### The combination with errors cached: 23 failing

```text
Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
a getter that catches the error of another getter > keeps its fallback on later snapshots after the other getter recovers
a getter that catches the error of another getter > keeps its fallback on the live store after the other getter recovers
a getter that reads a property the store does not have > returns a new object on every read when it builds one
a getter that reads a property the store does not have > runs on every read again after the property is deleted
a getter that reads a property the store does not have > runs on every read while the property is missing
a getter that throws > keeps throwing after a write to a field it never read
a getter that throws > passes its error through a getter that reads it, which is not cached either
a getter that throws > runs its body and throws a new error on every read
a getter that throws > throws on every read of a snapshot, while a snapshot taken after the fix returns
a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
getters that read each other in a cycle > overflow the stack on a snapshot instead of reporting the cycle
getters that read each other in a cycle > throw a new error on every read
getters that read each other in a cycle > throw a plain Error that names the path, starting from the getter that was read
getters that read each other in a cycle > throw only while the state closes the cycle
nested getters, three levels deep, on snapshots > gives an inner getter result a new identity on the next snapshot when the outer getter was read first
nested getters, three levels deep, on snapshots > re-runs the two inner getters, not the outermost, on the next snapshot after an unrelated write
nested getters, three levels deep, on snapshots > runs nothing on the snapshot after that one
nested getters, three levels deep, on snapshots > skips the outer levels when a memoized inner getter recomputes to the same result
nested getters, three levels deep, on the live store > re-runs every level from the top even when the innermost result is unchanged
nested getters, three levels deep, on the live store > skips the outermost level when the middle getter was re-read first and gave the same result
```

## Appendix D: the reproductions, before and after

Output of `repro.mjs` (appendix F) on the unmodified source, then the lines
that differ for each spike. The numbers after `R13 ... snapshot` on the
unmodified source depend on how deep the stack was when it overflowed, so
they differ from run to run.

### Unmodified

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":2}
R2 getter returns a live node      [1,1] | [2,2] | [2,7] | [9,9]
R3 missing property                same object twice false | after write 5 | after delete {"fallback":true} | runs 4
R4 catches an error, live          ["fallback","fallback","fallback"] | {"strict":1,"safe":1} | {"strict":1,"safe":1} | {"strict":1,"safe":1}
R4 catches an error, snapshot      ["fallback","fallback"] | {"strict":1,"safe":1}
R5 throws, live                    same error object false | runs after 2 reads 2 | after unrelated write 3 | after ready: ready | runs 4
R5 throws, snapshot                same error object false | runs after 2 reads 2 | after ready: ready
R5b throws with no dependency      after ready: ready | runs 3
R6 cycle, live                     threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R6 cycle, snapshot                 threw RangeError: Maximum call stack size exceeded. | threw RangeError: Maximum call stack size exceeded. | after looped = false: 1,0 | after looped = true: threw RangeError: Maximum call stack size exceeded.
R7 snapshot nested memo            {"a":1,"b":1,"c":1} | {"a":2,"b":2,"c":1} | {"a":2,"b":2,"c":1}
R8 writes what it reads, live      [1,2,3] | runs 3 | n 3 | sync calls 3
R8 writes another field, live      [0,0,0] | runs 1 | hits 1 | sync calls 1
R8 writes what it reads, snapshot  [0,0] | runs 1 | store n 0 | snapshot n 0
R9 another store                   [20,20] | fresh snapshot 30
R9 own child, outside reference    [10,10] | [10,20]
R9 a static                        [2,2]
R9 nested node through a local     [10,20]
R9 nested getter reads the root    [6,6] | fresh snapshot 15
R10 raw write                      [2,10,10] | snapshot 10
R11 defineProperty                 [2,14]
R12 detached subtree               [3,3,12,31,60,150,150] | expect [3,3,12,31,60,150,150]
R12 shared child, suspended owner  [1,2,4] | expect [1,2,4]
R12 observed child, suspended owner [1,2,3,4,4] | expect [1,2,3,4,4]
R12 nested getters, suspended      ["total 3","total 7","total 100","total 55"] | expect ["total 3","total 7","total 100","total 55"]
R13 catches a cycle error, live    [0,0,0,1,0] | {"a":2,"b":2} | 0
R13 catches a cycle error, snapshot [931,3603,1] | {"a":4538,"b":4538}
R14 another store held as a field  [20,20] | [30,30] | sync calls on the holder 1
R15 snapshot with a throwing getter threw RangeError: not ready | threw RangeError: not ready
```

### M: a missing property is a value

```text
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R13 catches a cycle error, snapshot [935,3608,1] | {"a":4547,"b":4546}
```

### G1: the stamp

```text
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [933,3600,1] | {"a":4537,"b":4536}
```

### G1e: the stamp as a global write counter

```text
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [936,3564,1] | {"a":4504,"b":4503}
```

### G2: record once

```text
R13 catches a cycle error, snapshot [933,3603,1] | {"a":4540,"b":4540}
```

### G1 and G2 together

```text
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [934,3610,1] | {"a":4547,"b":4547}
```

### G3b: refresh, compare value and node version

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [930,3598,1] | {"a":4532,"b":4532}
```

### G3c: one kind of dependency

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [936,3607,1] | {"a":4547,"b":4546}
```

### The Signals sketch `spike-refresh`

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R2 getter returns a live node      [1,1] | [1,1] | [1,1] | [9,9]
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [931,3599,1] | {"a":4534,"b":4534}
```

### The Signals sketch `spike-one`

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R4 catches an error, live          ["fallback","fallback","ready"] | {"strict":1,"safe":1} | {"strict":3,"safe":2} | {"strict":4,"safe":3}
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, live    [0,0,5234,1,0] | {"a":5237,"b":5237} | 0
R13 catches a cycle error, snapshot [1131,3642,1] | {"a":4777,"b":4776}
```

### G4: errors cached with their dependencies

```text
R4 catches an error, live          ["fallback","fallback","ready"] | {"strict":1,"safe":1} | {"strict":1,"safe":1} | {"strict":2,"safe":2}
R4 catches an error, snapshot      ["fallback","ready"] | {"strict":2,"safe":2}
R5 throws, live                    same error object true | runs after 2 reads 1 | after unrelated write 1 | after ready: ready | runs 2
R5 throws, snapshot                same error object true | runs after 2 reads 1 | after ready: ready
R13 catches a cycle error, live    [0,0,0,1,0] | {"a":4,"b":4} | 0
R13 catches a cycle error, snapshot [1057,3088,1] | {"a":4148,"b":4147}
```

### G5: the snapshot layer

```text
R6 cycle, snapshot                 threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R7 snapshot nested memo            {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1}
R13 catches a cycle error, snapshot [0,0,1] | {"a":2,"b":2}
```

### G6: reads outside the own node, on G3c

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R9 another store                   [20,30] | fresh snapshot 30
R9 own child, outside reference    [10,10] | [20,20]
R9 nested getter reads the root    [6,15] | fresh snapshot 15
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, snapshot [934,3606,1] | {"a":4544,"b":4544}
```

### G7a: a write in a snapshot getter throws

```text
R8 writes what it reads, snapshot  ["threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\" on a snapshot. A getter must not write.","threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\" on a snapshot. A getter must not write."] | runs 2 | store n 0 | snapshot n 0
R13 catches a cycle error, snapshot [929,3525,1] | {"a":4458,"b":4457}
```

### G7b: a write in a getter throws on both layers

```text
R8 writes what it reads, live      ["threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write."] | runs 3 | n 0 | sync calls 0
R8 writes another field, live      ["threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write."] | runs 3 | hits 0 | sync calls 0
R8 writes what it reads, snapshot  ["threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\" on a snapshot. A getter must not write.","threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\" on a snapshot. A getter must not write."] | runs 2 | store n 0 | snapshot n 0
R13 catches a cycle error, snapshot [931,3528,1] | {"a":4463,"b":4462}
```

### The combination

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R4 catches an error, live          ["fallback","fallback","ready"] | {"strict":1,"safe":1} | {"strict":3,"safe":2} | {"strict":4,"safe":3}
R4 catches an error, snapshot      ["fallback","ready"] | {"strict":2,"safe":2}
R6 cycle, snapshot                 threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R7 snapshot nested memo            {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1}
R8 writes what it reads, snapshot  ["threw TypeError: Proxy object's 'set' trap returned falsy value for property 'n'","threw TypeError: Proxy object's 'set' trap returned falsy value for property 'n'"] | runs 2 | store n 0 | snapshot n 0
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, live    [0,0,0,1,0] | {"a":3,"b":2} | 0
R13 catches a cycle error, snapshot [0,0,1] | {"a":3,"b":2}
```

### The combination with G7b

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R4 catches an error, live          ["fallback","fallback","ready"] | {"strict":1,"safe":1} | {"strict":3,"safe":2} | {"strict":4,"safe":3}
R4 catches an error, snapshot      ["fallback","ready"] | {"strict":2,"safe":2}
R6 cycle, snapshot                 threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R7 snapshot nested memo            {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1}
R8 writes what it reads, live      ["threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write."] | runs 3 | n 0 | sync calls 0
R8 writes another field, live      ["threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write.","threw Error: @codebelt/classy-store: getter \"counted\" wrote \"hits\". A getter must not write."] | runs 3 | hits 0 | sync calls 0
R8 writes what it reads, snapshot  ["threw TypeError: Proxy object's 'set' trap returned falsy value for property 'n'","threw TypeError: Proxy object's 'set' trap returned falsy value for property 'n'"] | runs 2 | store n 0 | snapshot n 0
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, live    [0,0,0,1,0] | {"a":3,"b":2} | 0
R13 catches a cycle error, snapshot [0,0,1] | {"a":3,"b":2}
```

### The combination with errors cached

```text
R1 cutoff, a 1 -> 3                odd | {"parity":2,"label":1}
R3 missing property                same object twice true | after write 5 | after delete {"fallback":true} | runs 3
R4 catches an error, live          ["fallback","fallback","ready"] | {"strict":1,"safe":1} | {"strict":1,"safe":1} | {"strict":2,"safe":2}
R4 catches an error, snapshot      ["fallback","ready"] | {"strict":2,"safe":2}
R5 throws, live                    same error object true | runs after 2 reads 1 | after unrelated write 1 | after ready: ready | runs 2
R5 throws, snapshot                same error object true | runs after 2 reads 1 | after ready: ready
R6 cycle, live                     threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R6 cycle, snapshot                 threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b | after looped = false: 1,0 | after looped = true: threw Error: @codebelt/classy-store: circular computed getter dependency: b → a → b
R7 snapshot nested memo            {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1} | {"a":1,"b":1,"c":1}
R8 writes what it reads, snapshot  ["threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write.","threw TypeError: @codebelt/classy-store: getter \"bump\" wrote \"n\". A getter must not write."] | runs 1 | store n 0 | snapshot n 0
R10 raw write                      [2,2,10] | snapshot 10
R11 defineProperty                 [2,2]
R13 catches a cycle error, live    [0,0,0,1,0] | {"a":3,"b":2} | 0
R13 catches a cycle error, snapshot [0,0,1] | {"a":3,"b":2}
```

### `probe-order.mjs` on unmodified

```text
P1 a dependency no longer on the path        [100,0] | {"heavy":1,"pick":2}
P2 refresh records nothing further up        [2,{"inner":2,"mid":2,"outer":2}] | [2,{"inner":4,"mid":4,"outer":4}] | [6,{"inner":4,"mid":4,"outer":5}]
P3 getter returns a child array              [3,11,111,110,160,0] | "expect [3,11,111,110,160,0]"
P4 getter returns a node of another store    ["a0","a0","b1"]
P5 a getter redefined as data                [3,100,3,101]
P6 subclass getter with super                ["t3","t5","t9","t9"] | {"base":3,"derived":3}
P7 snapshot: getter returns a node           [1,2] | "expect [1,2]"
P8 missing property                          "runs after two reads 2" | "same object false" | "runs after an unrelated write 3" | "same object false" | "after the property is written: 5, runs 4"
P9 one row written, 1,000 row getters read   "84.3 microseconds, best of 200" | true
```

### `probe-order.mjs` on the combination

```text
P1 a dependency no longer on the path        [100,0] | {"heavy":1,"pick":2}
P2 refresh records nothing further up        [2,{"inner":2,"mid":1,"outer":1}] | [2,{"inner":4,"mid":1,"outer":1}] | [6,{"inner":4,"mid":1,"outer":2}]
P3 getter returns a child array              [3,11,111,110,160,0] | "expect [3,11,111,110,160,0]"
P4 getter returns a node of another store    ["a0","a0","b1"]
P5 a getter redefined as data                [3,100,3,101]
P6 subclass getter with super                ["t3","t5","t9","t9"] | {"base":3,"derived":3}
P7 snapshot: getter returns a node           [1,2] | "expect [1,2]"
P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 1" | "same object true" | "after the property is written: 5, runs 2"
P9 one row written, 1,000 row getters read   "49.1 microseconds, best of 200" | true
```

### Probes P8 and P9 on the variants of G1, run under Bun

```text
Unmodified: P8 missing property                          "runs after two reads 2" | "same object false" | "runs after an unrelated write 3" | "same object false" | "after the property is written: 5, runs 4"
M: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 1" | "same object true" | "after the property is written: 5, runs 2"
G1: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 2" | "same object false" | "after the property is written: 5, runs 3"
G1e: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 2" | "same object false" | "after the property is written: 5, runs 3"
G1 with M: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 1" | "same object true" | "after the property is written: 5, runs 2"
G3b: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 2" | "same object false" | "after the property is written: 5, runs 3"
Combination: P8 missing property                          "runs after two reads 1" | "same object true" | "runs after an unrelated write 1" | "same object true" | "after the property is written: 5, runs 2"
Unmodified: P9 one row written, 1,000 row getters read   "84.3 microseconds, best of 200" | true
M: P9 one row written, 1,000 row getters read   "82.4 microseconds, best of 200" | true
G1: P9 one row written, 1,000 row getters read   "45.6 microseconds, best of 200" | true
G1e: P9 one row written, 1,000 row getters read   "82.0 microseconds, best of 200" | true
G1 with M: P9 one row written, 1,000 row getters read   "48.1 microseconds, best of 200" | true
G3b: P9 one row written, 1,000 row getters read   "49.7 microseconds, best of 200" | true
Combination: P9 one row written, 1,000 row getters read   "49.1 microseconds, best of 200" | true
```

### `probe-writes.mjs` on unmodified

```text
sorted    live: [1,2,3], same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Attempted to assign to readonly property.", same result twice true
touched   live: 1, same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Attempted to assign to readonly property.", same result twice true
assigned  live: 1, same result twice true, sync calls after two reads 1 | snapshot: 0, same result twice true
lazy      live: ["made once"], same result twice true, sync calls after two reads 1 | snapshot: undefined, same result twice true
```

### `probe-writes.mjs` on the combination

```text
sorted    live: [1,2,3], same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Attempted to assign to readonly property.", same result twice true
touched   live: 1, same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Attempted to assign to readonly property.", same result twice true
assigned  live: 1, same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Proxy object's 'set' trap returned falsy value for property 'n'", same result twice true
lazy      live: ["made once"], same result twice true, sync calls after two reads 1 | snapshot: "threw TypeError: Proxy object's 'set' trap returned falsy value for property 'cache'", same result twice true
```

### `fuzz-detached.mjs`, 300 seeds of 400 steps

| Build                                          | Seeds failing | First failure                                                                            |
| ---------------------------------------------- | ------------: | ---------------------------------------------------------------------------------------- |
| Unmodified                                     |      0 of 300 |                                                                                          |
| G1                                             |      0 of 300 |                                                                                          |
| G1e                                            |      0 of 300 |                                                                                          |
| G3c                                            |      0 of 300 |                                                                                          |
| The combination                                |      0 of 300 |                                                                                          |
| Signals sketch `spike-refresh`                 |    300 of 300 | seed 1 step 12 after "write a row": group 1 (attached) firstV is 2, the mirror says 30   |
| G1, no walk to a detached parent               |      0 of 300 |                                                                                          |
| The combination, no walk to a detached parent  |      0 of 300 |                                                                                          |
| G1, suspension switched off                    |      0 of 300 |                                                                                          |
| The combination, suspension switched off       |      0 of 300 |                                                                                          |
| Unmodified, no version bump in `resume()`      |     64 of 300 | seed 1 step 153 after "push a row": snapshot of group 17 sum is 105, the mirror says 147 |
| G1, no version bump in `resume()`              |     70 of 300 | seed 1 step 153 after "push a row": snapshot of group 17 sum is 105, the mirror says 147 |
| The combination, no version bump in `resume()` |     70 of 300 |                                                                                          |

## Appendix E: the patches

Each is `git diff` in the worktree at `57404c3`, and applies there with
`git apply`. G6 is given against G3c, and one form of G7b against the
combination; apply the patch it builds on first. Every other patch is against
the unmodified source. The two Signals sketches are in the appendix of
`review/stage-2/signals.md`, and T3 (a) is in `review/stage-3/spike-traps.md`;
they are not repeated.

The combination with errors cached is kept in the form it was measured in. It
differs from the final combination in three ways that are not the cache: a
thrown dependency is marked by a version of -2 instead of a marker value, the
three write traps of G7a throw a message of their own, and a plain value is
checked through the child map.

### M: a missing property is a value

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..656266f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -68,6 +68,9 @@ const trackerStack: {
   deps: DepEntry[];
 }[] = [];
 
+/** SPIKE M: stands for "the property did not exist". */
+const MISSING = Symbol('missing');
+
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
   return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
@@ -141,12 +144,12 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
-      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
-        return false;
+      // SPIKE M: a property that does not exist is a value like any other,
+      // so a getter that read it stays valid while it stays missing.
+      const current = Reflect.has(dep.target, dep.prop)
+        ? Reflect.get(dep.target, dep.prop)
+        : MISSING;
+      if (!Object.is(current, dep.value)) return false;
     }
   }
   return true;
@@ -495,7 +498,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       // An inherited data property becomes an edge on its first proxy read.
       const child =
         internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
-      recordDep(internal, prop, value);
+      recordDep(internal, prop, getterDesc ? value : MISSING);
       return child ? child.proxy : value;
     },
 
```

### G1: the stamp

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..65af56b 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -138,7 +138,11 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
       if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
+      // SPIKE G1: validate a nested getter once per version of its node.
+      if (cached.stamp !== dep.internal.version) {
+        if (!areDepsValid(cached.deps)) return false; // nested deps changed
+        cached.stamp = dep.internal.version;
+      }
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
       // Check that the property still exists — if it was deleted and
@@ -164,8 +168,13 @@ function evaluateComputed(
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
+  if (cached) {
+    // SPIKE G1: nothing under this node was written since the last check.
+    if (cached.stamp === internal.version) return cached.value;
+    if (areDepsValid(cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
   }
 
   // Cycle detection: if this (internal, prop) pair is already being
@@ -187,8 +196,10 @@ function evaluateComputed(
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
   try {
+    // SPIKE G1: taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..a0aabce 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -30,4 +30,6 @@ export type DepEntry =
 export type ComputedEntry = {
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE G1: the owning node's version when this entry was last found valid. */
+  stamp: number;
 };
```

### G1e: the stamp as a global write counter

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..3e055c6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -68,6 +68,9 @@ const trackerStack: {
   deps: DepEntry[];
 }[] = [];
 
+/** SPIKE G1e: counts every write to any store. The stamp, instead of the node's version. */
+let epoch = 0;
+
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
   return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
@@ -138,7 +141,11 @@ function areDepsValid(deps: DepEntry[]): boolean {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
       if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
+      // SPIKE G1: validate a nested getter once per version of its node.
+      if (cached.stamp !== epoch) {
+        if (!areDepsValid(cached.deps)) return false; // nested deps changed
+        cached.stamp = epoch;
+      }
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
       // Check that the property still exists — if it was deleted and
@@ -164,8 +171,13 @@ function evaluateComputed(
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
+  if (cached) {
+    // SPIKE G1: nothing under this node was written since the last check.
+    if (cached.stamp === epoch) return cached.value;
+    if (areDepsValid(cached.deps)) {
+      cached.stamp = epoch;
+      return cached.value;
+    }
   }
 
   // Cycle detection: if this (internal, prop) pair is already being
@@ -187,8 +199,10 @@ function evaluateComputed(
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
   try {
+    // SPIKE G1: taken before the body runs, so a getter that writes is checked again.
+    const stamp = epoch;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
@@ -220,6 +234,7 @@ export function getInternal(proxy: object): StoreInternal {
  */
 function notifyMutation(internal: StoreInternal): void {
   const owners = internal.ancestors();
+  epoch++;
   // Invalidate every path before any synchronous subscriber reads a snapshot.
   for (const node of owners) node.version++;
   if (transactionDepth) {
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..a0aabce 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -30,4 +30,6 @@ export type DepEntry =
 export type ComputedEntry = {
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE G1: the owning node's version when this entry was last found valid. */
+  stamp: number;
 };
```

### G2: record each property once per run

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..7e56cc5 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -66,6 +66,8 @@ const trackerStack: {
   internal: StoreInternal;
   prop: string | symbol;
   deps: DepEntry[];
+  /** SPIKE G2: properties already recorded in this run. */
+  seen: Set<string | symbol>;
 }[] = [];
 
 /** Returns the tracker currently recording deps, or `null` if none is active. */
@@ -89,6 +91,9 @@ function recordDep(
   // Child-proxy reads don't need explicit tracking because child mutations
   // bubble up via version numbers on the parent's childInternals.
   if (tracker.internal !== internal) return;
+  // SPIKE G2: the first read of a property in a run is the one that counts.
+  if (tracker.seen.has(prop)) return;
+  tracker.seen.add(prop);
 
   const childInternal = internal.childInternals.get(prop);
   if (childInternal) {
@@ -117,6 +122,8 @@ function recordComputedDep(
   const tracker = activeTracker();
   if (!tracker) return;
   if (tracker.internal !== internal) return;
+  if (tracker.seen.has(prop)) return;
+  tracker.seen.add(prop);
 
   tracker.deps.push({kind: 'computed', internal, prop, value});
 }
@@ -184,7 +191,12 @@ function evaluateComputed(
   }
 
   // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
+  const frame = {
+    internal,
+    prop,
+    deps: [] as DepEntry[],
+    seen: new Set<string | symbol>(),
+  };
   trackerStack.push(frame);
   try {
     const value = getterFn.call(receiver);
```

### G3b: refresh, compare value and node version (includes G1 and G2)

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..640a78b 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -65,9 +65,21 @@ export function identityOf(value: unknown): unknown {
 const trackerStack: {
   internal: StoreInternal;
   prop: string | symbol;
-  deps: DepEntry[];
+  /** SPIKE G3b: absent while the entry is only being validated. */
+  deps?: DepEntry[];
+  /** SPIKE G2: properties already recorded in this run. */
+  seen?: Set<string | symbol>;
 }[] = [];
 
+/** SPIKE G3b: the version of the store node a value is, or -1 when it is not one. */
+function versionOf(value: unknown): number {
+  if (typeof value !== 'object' || value === null) return -1;
+  const node = internalsMap.get(value);
+  if (!node) return -1;
+  node.resumeScope();
+  return node.version;
+}
+
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
   return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
@@ -88,7 +100,10 @@ function recordDep(
   // Only record deps for reads on the SAME proxy that owns the getter.
   // Child-proxy reads don't need explicit tracking because child mutations
   // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
+  if (tracker.internal !== internal || !tracker.deps || !tracker.seen) return;
+  // SPIKE G2: the first read of a property in a run is the one that counts.
+  if (tracker.seen.has(prop)) return;
+  tracker.seen.add(prop);
 
   const childInternal = internal.childInternals.get(prop);
   if (childInternal) {
@@ -112,13 +127,23 @@ function recordDep(
 function recordComputedDep(
   internal: StoreInternal,
   prop: string | symbol,
+  getter: () => unknown,
   value: unknown,
 ): void {
   const tracker = activeTracker();
   if (!tracker) return;
-  if (tracker.internal !== internal) return;
-
-  tracker.deps.push({kind: 'computed', internal, prop, value});
+  if (tracker.internal !== internal || !tracker.deps || !tracker.seen) return;
+  if (tracker.seen.has(prop)) return;
+  tracker.seen.add(prop);
+
+  tracker.deps.push({
+    kind: 'computed',
+    internal,
+    prop,
+    value,
+    getter,
+    version: versionOf(value),
+  });
 }
 
 /**
@@ -135,11 +160,22 @@ function areDepsValid(deps: DepEntry[]): boolean {
         return false;
       if (dep.internal.version !== dep.version) return false;
     } else if (dep.kind === 'computed') {
-      // Validate through the computed cache — never re-execute the raw getter.
-      const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+      // SPIKE G3b: bring the nested getter up to date through its own memo,
+      // then ask whether what it gives changed: the value, and the version of
+      // the store node that value is. A getter can return a live node.
+      let current: unknown;
+      try {
+        current = evaluateComputed(
+          dep.internal,
+          dep.prop,
+          dep.getter,
+          dep.internal.proxy,
+        );
+      } catch {
+        return false; // a dependency that throws counts as changed
+      }
+      if (!Object.is(current, dep.value)) return false;
+      if (versionOf(current) !== dep.version) return false;
     } else {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
@@ -164,12 +200,11 @@ function evaluateComputed(
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
-  }
+  // SPIKE G1: nothing under this node was written since the last check.
+  if (cached && cached.stamp === internal.version) return cached.value;
 
   // Cycle detection: if this (internal, prop) pair is already being
-  // evaluated higher in the stack, the getter chain is recursive.
+  // validated or run higher in the stack, the getter chain is recursive.
   for (const existing of trackerStack) {
     if (existing.internal === internal && existing.prop === prop) {
       const cycle = trackerStack
@@ -183,12 +218,22 @@ function evaluateComputed(
     }
   }
 
-  // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
+  // SPIKE G3b: one frame covers validation and the run. While it validates
+  // it records nothing, so reads made to refresh a dependency are not taken
+  // for dependencies of whichever getter is running further up.
+  const frame: (typeof trackerStack)[number] = {internal, prop};
   trackerStack.push(frame);
   try {
+    if (cached && areDepsValid(cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
+    frame.deps = [];
+    frame.seen = new Set();
+    // SPIKE G1: taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
@@ -472,7 +517,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         );
         // Record as a computed dependency for any parent getter currently tracking.
         // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
+        recordComputedDep(internal, prop, getterDesc.get, value);
         return value;
       }
 
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..68a2496 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -24,10 +24,16 @@ export type DepEntry =
       internal: StoreInternal;
       prop: string | symbol;
       value: unknown;
+      /** SPIKE G3b: the getter, to refresh it without a descriptor lookup. */
+      getter: () => unknown;
+      /** SPIKE G3b: the version of the store node `value` is, or -1. */
+      version: number;
     };
 
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE G1: the owning node's version when this entry was last found valid. */
+  stamp: number;
 };
```

### G3c: one kind of dependency (includes G1, G2 and M)

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0dabe32 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -58,96 +58,79 @@ export function identityOf(value: unknown): unknown {
 // ── Dependency tracking for computed getters ──────────────────────────────────
 
 /**
- * Stack of active dependency trackers. Each entry records which properties
- * a getter reads during evaluation. A stack (not a single variable) is needed
- * because getter A can read getter B, which pushes a second tracker.
+ * Getters being evaluated, outermost first. A frame covers the validation of
+ * the cached entry and, if that fails, the run of the body. `seen` is absent
+ * while the frame only validates, so nothing is recorded then.
  */
 const trackerStack: {
   internal: StoreInternal;
   prop: string | symbol;
   deps: DepEntry[];
+  seen?: Set<string | symbol>;
 }[] = [];
 
-/** Returns the tracker currently recording deps, or `null` if none is active. */
-function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+/** Stands for "the property did not exist". */
+const MISSING = Symbol('missing');
+
+/** The version of the store node a value is, or -1 when it is not one. */
+function versionOf(value: unknown): number {
+  if (typeof value !== 'object' || value === null) return -1;
+  const node = internalsMap.get(value);
+  if (!node) return -1;
+  node.resumeScope();
+  return node.version;
 }
 
 /**
- * Record a dependency on the active tracker (if any).
- * Called from the GET trap whenever a non-getter, non-method property is read.
+ * Record what a property of the running getter's own node gave. The first read
+ * of a property in a run is the one that counts. Reads on any other node are
+ * not recorded: a child's subtree is covered by the version of the child.
  */
 function recordDep(
   internal: StoreInternal,
   prop: string | symbol,
   value: unknown,
+  version: number,
+  getter?: () => unknown,
 ): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-
-  // Only record deps for reads on the SAME proxy that owns the getter.
-  // Child-proxy reads don't need explicit tracking because child mutations
-  // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
-  const childInternal = internal.childInternals.get(prop);
-  if (childInternal) {
-    tracker.deps.push({
-      kind: 'version',
-      internal: childInternal,
-      version: childInternal.version,
-      parent: internal,
-      prop,
-    });
-  } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
-  }
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (tracker.internal !== internal || !tracker.seen || tracker.seen.has(prop))
+    return;
+  tracker.seen.add(prop);
+  tracker.deps.push({prop, value, version, getter});
 }
 
-/**
- * Record a computed getter dependency on the active tracker (if any).
- * Unlike `recordDep`, this creates a `'computed'` dep entry that validates
- * through the computed cache rather than re-executing the raw getter.
- */
-function recordComputedDep(
-  internal: StoreInternal,
-  prop: string | symbol,
-  value: unknown,
-): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-  if (tracker.internal !== internal) return;
-
-  tracker.deps.push({kind: 'computed', internal, prop, value});
-}
-
-/**
- * Check whether all dependencies from a previous computation are still valid.
- */
-function areDepsValid(deps: DepEntry[]): boolean {
+/** Read every dependency again; any difference, or a throw, means "recompute". */
+function areDepsValid(internal: StoreInternal, deps: DepEntry[]): boolean {
   for (const dep of deps) {
-    if (dep.kind === 'version') {
-      // Verify the parent property still references the same child object.
-      // If the property was replaced entirely (e.g., store.items = newArray),
-      // the old child internal is detached and its version never changes.
-      // This check catches that case.
-      if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
+    let current: unknown;
+    let version: number;
+    if (dep.getter) {
+      // Bring the nested getter up to date through its own memo.
+      try {
+        current = evaluateComputed(
+          internal,
+          dep.prop,
+          dep.getter,
+          internal.proxy,
+        );
+      } catch {
         return false;
-      if (dep.internal.version !== dep.version) return false;
-    } else if (dep.kind === 'computed') {
-      // Validate through the computed cache — never re-execute the raw getter.
-      const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+      }
+      version = versionOf(current);
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
-      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
-        return false;
+      const child = internal.childInternals.get(dep.prop);
+      if (child) {
+        current = child.proxy;
+        version = child.version;
+      } else {
+        current = Reflect.has(internal.target, dep.prop)
+          ? Reflect.get(internal.target, dep.prop)
+          : MISSING;
+        version = versionOf(current);
+      }
     }
+    if (!Object.is(current, dep.value) || version !== dep.version) return false;
   }
   return true;
 }
@@ -164,12 +147,11 @@ function evaluateComputed(
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
-  }
+  // Nothing under this node was written since the entry was last found valid.
+  if (cached && cached.stamp === internal.version) return cached.value;
 
-  // Cycle detection: if this (internal, prop) pair is already being
-  // evaluated higher in the stack, the getter chain is recursive.
+  // Cycle detection: if this (internal, prop) pair is already being validated
+  // or run higher in the stack, the getter chain is recursive.
   for (const existing of trackerStack) {
     if (existing.internal === internal && existing.prop === prop) {
       const cycle = trackerStack
@@ -183,12 +165,18 @@ function evaluateComputed(
     }
   }
 
-  // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
+  const frame: (typeof trackerStack)[number] = {internal, prop, deps: []};
   trackerStack.push(frame);
   try {
+    if (cached && areDepsValid(internal, cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
+    frame.seen = new Set();
+    // Taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
@@ -470,9 +458,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
           getterDesc.get,
           receiver,
         );
-        // Record as a computed dependency for any parent getter currently tracking.
-        // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
+        // Record it for any getter that is running further up.
+        if (trackerStack.length)
+          recordDep(internal, prop, value, versionOf(value), getterDesc.get);
         return value;
       }
 
@@ -495,7 +483,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       // An inherited data property becomes an edge on its first proxy read.
       const child =
         internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
-      recordDep(internal, prop, value);
+      if (trackerStack.length) {
+        if (child) recordDep(internal, prop, child.proxy, child.version);
+        else
+          recordDep(
+            internal,
+            prop,
+            getterDesc ? value : MISSING,
+            versionOf(value),
+          );
+      }
       return child ? child.proxy : value;
     },
 
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..2112c7b 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -1,33 +1,24 @@
-import type {StoreInternal} from './ownership';
-
 // ── Computed getter memoization types ─────────────────────────────────────────
 
 /**
- * A single dependency recorded during getter execution.
- * - `version`: dependency is a tracked sub-tree — compare `internal.version`.
- * - `value`: dependency is a primitive — compare via `Object.is`.
+ * SPIKE G3c: one kind of dependency. What a property of the getter's own node
+ * gave when the getter first read it: a plain value, a child's proxy, or
+ * another getter's result.
  */
-export type DepEntry =
-  | {
-      kind: 'version';
-      internal: StoreInternal;
-      version: number;
-      /** Parent target — used to detect when the property is replaced entirely. */
-      parent: StoreInternal;
-      /** Property name on the parent. */
-      prop: string | symbol;
-    }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
-  | {
-      /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
-      kind: 'computed';
-      internal: StoreInternal;
-      prop: string | symbol;
-      value: unknown;
-    };
+export type DepEntry = {
+  prop: string | symbol;
+  value: unknown;
+  /** The version of the store node `value` is, or -1 when it is not one. */
+  version: number;
+  /** Set when the property is a getter: how to bring it up to date. */
+  getter?: () => unknown;
+};
 
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
   value: unknown;
+  /** One entry per property read, in the order of the first read. */
   deps: DepEntry[];
+  /** The owning node's version when this entry was last found valid. */
+  stamp: number;
 };
```

### G4: errors cached with their dependencies, both layers

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..6a05cf2 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -113,12 +113,13 @@ function recordComputedDep(
   internal: StoreInternal,
   prop: string | symbol,
   value: unknown,
+  threw: boolean,
 ): void {
   const tracker = activeTracker();
   if (!tracker) return;
   if (tracker.internal !== internal) return;
 
-  tracker.deps.push({kind: 'computed', internal, prop, value});
+  tracker.deps.push({kind: 'computed', internal, prop, value, threw});
 }
 
 /**
@@ -137,9 +138,19 @@ function areDepsValid(deps: DepEntry[]): boolean {
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+      // SPIKE G4: no entry means the getter threw without reading anything.
+      // An entry that is already being walked further up means two getters
+      // recorded each other, which happens once one of them caught the
+      // other's cycle error: recompute, and let the run report the cycle.
+      if (!cached || cached.checking) return false;
+      cached.checking = true;
+      try {
+        if (!areDepsValid(cached.deps)) return false; // nested deps changed
+      } finally {
+        cached.checking = false;
+      }
+      if (cached.threw !== dep.threw || !Object.is(cached.value, dep.value))
+        return false; // what it gave changed
     } else {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
@@ -165,6 +176,8 @@ function evaluateComputed(
 ): unknown {
   const cached = internal.computedCache.get(prop);
   if (cached && areDepsValid(cached.deps)) {
+    // SPIKE G4: the same error again, without running the body.
+    if (cached.threw) throw cached.value;
     return cached.value;
   }
 
@@ -188,8 +201,20 @@ function evaluateComputed(
   trackerStack.push(frame);
   try {
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, threw: false});
     return value;
+  } catch (error) {
+    // SPIKE G4: keep the error with what was read before it, so that it is
+    // thrown again without running the body until one of those changes. An
+    // error that read nothing has nothing that could ever clear it.
+    if (frame.deps.length) {
+      internal.computedCache.set(prop, {
+        value: error,
+        deps: frame.deps,
+        threw: true,
+      });
+    }
+    throw error;
   } finally {
     trackerStack.pop();
   }
@@ -464,15 +489,17 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
-        const value = evaluateComputed(
-          internal,
-          prop,
-          getterDesc.get,
-          receiver,
-        );
-        // Record as a computed dependency for any parent getter currently tracking.
-        // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
+        // SPIKE G4: record it for a getter running further up whether it
+        // returns or throws, so a getter that catches the error is re-run
+        // once this one stops throwing.
+        let value: unknown;
+        try {
+          value = evaluateComputed(internal, prop, getterDesc.get, receiver);
+        } catch (error) {
+          recordComputedDep(internal, prop, error, true);
+          throw error;
+        }
+        recordComputedDep(internal, prop, value, false);
         return value;
       }
 
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..a236d21 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -23,11 +23,19 @@ export type DepEntry =
       kind: 'computed';
       internal: StoreInternal;
       prop: string | symbol;
+      /** What the getter returned, or what it threw. */
       value: unknown;
+      /** SPIKE G4: the getter threw `value`. */
+      threw: boolean;
     };
 
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
+  /** What the getter returned, or what it threw. */
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE G4: the getter threw `value`; a valid entry throws it again. */
+  threw: boolean;
+  /** SPIKE G4: set while this entry's dependencies are being walked. */
+  checking?: boolean;
 };
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..1630fac 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -18,7 +18,7 @@ const snapshotCache = new WeakMap<object, [version: number, snap: object]>();
  */
 const snapshotGetterCache = new WeakMap<
   object,
-  Map<string | symbol, unknown>
+  Map<string | symbol, GetterMemoEntry>
 >();
 
 // A mutable restore needs the user's own descriptor, or the inherited getter
@@ -39,7 +39,13 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  prop: string | symbol;
+  /** What the read gave, or what it threw. */
+  value: unknown;
+  /** SPIKE G4: the read threw `value`. */
+  threw: boolean;
+};
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -47,7 +53,13 @@ type GetterDep = {prop: string | symbol; value: unknown};
  * we check if the deps are still reference-equal (via structural sharing)
  * and return the cached result if so -- avoiding re-execution of the getter.
  */
-type GetterMemoEntry = {deps: GetterDep[]; result: unknown};
+type GetterMemoEntry = {
+  deps: GetterDep[];
+  /** What the getter returned, or what it threw. */
+  result: unknown;
+  /** SPIKE G4: the getter threw `result`. */
+  threw: boolean;
+};
 
 /**
  * Cross-snapshot getter memoization cache.
@@ -72,7 +84,7 @@ const crossSnapshotMemo = new WeakMap<
 function computeWithTracking(
   snap: object,
   getterFn: () => unknown,
-): {deps: GetterDep[]; result: unknown} {
+): GetterMemoEntry {
   const deps: GetterDep[] = [];
   const readProps = new Set<string | symbol>();
 
@@ -81,18 +93,35 @@ function computeWithTracking(
     get(_dummyTarget, prop, _receiver) {
       // Delegate to the real snapshot (receiver = snap so installed getters
       // run with `this = snap`, triggering their own memoization chain).
-      const value = Reflect.get(snap, prop, snap);
+      // SPIKE G4: a read that throws is a dependency too.
+      const read = readSnapshotProperty(snap, prop);
       if (!readProps.has(prop)) {
         readProps.add(prop);
-        deps.push({prop, value});
+        deps.push({prop, ...read});
       }
-      return value;
+      if (read.threw) throw read.value;
+      return read.value;
     },
   };
 
   const tracked = new Proxy({}, handler);
-  const result = getterFn.call(tracked);
-  return {deps, result};
+  try {
+    return {deps, result: getterFn.call(tracked), threw: false};
+  } catch (error) {
+    return {deps, result: error, threw: true};
+  }
+}
+
+/** SPIKE G4: what reading a property gives: a value, or the error it threw. */
+function readSnapshotProperty(
+  snap: object,
+  prop: string | symbol,
+): {value: unknown; threw: boolean} {
+  try {
+    return {value: Reflect.get(snap, prop, snap), threw: false};
+  } catch (error) {
+    return {value: error, threw: true};
+  }
 }
 
 /**
@@ -103,8 +132,9 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    const current = readSnapshotProperty(currentSnap, dep.prop);
+    if (current.threw !== dep.threw || !Object.is(current.value, dep.value))
+      return false;
   }
   return true;
 }
@@ -126,28 +156,33 @@ function evaluateSnapshotGetter(
 ): unknown {
   // ── Per-snapshot fast path ──
   const perSnapCache = snapshotGetterCache.get(currentSnap);
-  if (perSnapCache?.has(key)) return perSnapCache.get(key);
+  const settled = perSnapCache?.get(key);
+  if (settled) {
+    if (settled.threw) throw settled.result;
+    return settled.result;
+  }
 
   // ── Cross-snapshot memo ──
   let memoMap = crossSnapshotMemo.get(target);
   const prev = memoMap?.get(key);
 
-  let result: unknown;
+  let entry: GetterMemoEntry;
 
   if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
     // Dependencies unchanged → reuse previous result.
-    result = prev.result;
+    entry = prev;
   } else {
     // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
-    result = computation.result;
+    entry = computeWithTracking(currentSnap, getterFn);
+    // SPIKE G4: an error that read nothing is never kept.
+    if (entry.threw && !entry.deps.length) throw entry.result;
 
     // Save cross-snapshot memo.
     if (!memoMap) {
       memoMap = new Map();
       crossSnapshotMemo.set(target, memoMap);
     }
-    memoMap.set(key, {deps: computation.deps, result});
+    memoMap.set(key, entry);
   }
 
   // Save per-snapshot cache.
@@ -156,9 +191,10 @@ function evaluateSnapshotGetter(
     cache = new Map();
     snapshotGetterCache.set(currentSnap, cache);
   }
-  cache.set(key, result);
+  cache.set(key, entry);
 
-  return result;
+  if (entry.threw) throw entry.result;
+  return entry.result;
 }
 
 // ── Internal helpers ──────────────────────────────────────────────────────────
```

### G5: the snapshot layer

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..cfd0260 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -61,6 +61,9 @@ const crossSnapshotMemo = new WeakMap<
   Map<string | symbol, GetterMemoEntry>
 >();
 
+/** SPIKE G5: snapshot getters being evaluated, outermost first. */
+const evaluating: {snap: object; key: string | symbol}[] = [];
+
 /**
  * Run a getter against the snapshot with dependency tracking.
  *
@@ -128,26 +131,47 @@ function evaluateSnapshotGetter(
   const perSnapCache = snapshotGetterCache.get(currentSnap);
   if (perSnapCache?.has(key)) return perSnapCache.get(key);
 
+  // SPIKE G5: the same getter on the same snapshot, asked for again before it
+  // answered, would recurse for ever. Report it as the live store does.
+  const start = evaluating.findIndex(
+    (frame) => frame.snap === currentSnap && frame.key === key,
+  );
+  if (start !== -1) {
+    const cycle = evaluating
+      .slice(start)
+      .map((frame) => String(frame.key))
+      .concat(String(key))
+      .join(' → ');
+    throw new Error(
+      `@codebelt/classy-store: circular computed getter dependency: ${cycle}`,
+    );
+  }
+
   // ── Cross-snapshot memo ──
+  // SPIKE G5: one map per target, made before any getter runs, so a nested
+  // getter fills the same map instead of one that is then replaced.
   let memoMap = crossSnapshotMemo.get(target);
-  const prev = memoMap?.get(key);
+  if (!memoMap) {
+    memoMap = new Map();
+    crossSnapshotMemo.set(target, memoMap);
+  }
+  const prev = memoMap.get(key);
 
   let result: unknown;
 
-  if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
-    // Dependencies unchanged → reuse previous result.
-    result = prev.result;
-  } else {
-    // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
-    result = computation.result;
-
-    // Save cross-snapshot memo.
-    if (!memoMap) {
-      memoMap = new Map();
-      crossSnapshotMemo.set(target, memoMap);
+  evaluating.push({snap: currentSnap, key});
+  try {
+    if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
+      // Dependencies unchanged → reuse previous result.
+      result = prev.result;
+    } else {
+      // Compute fresh with dep tracking.
+      const computation = computeWithTracking(currentSnap, getterFn);
+      result = computation.result;
+      memoMap.set(key, {deps: computation.deps, result});
     }
-    memoMap.set(key, {deps: computation.deps, result});
+  } finally {
+    evaluating.pop();
   }
 
   // Save per-snapshot cache.
```

### G6: reads outside the own node, against G3c

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -67,8 +67,34 @@
   prop: string | symbol;
   deps: DepEntry[];
   seen?: Set<string | symbol>;
+  /**
+   * SPIKE G6: nodes whose reads need no entry of their own, because a
+   * dependency recorded in this run already covers their subtree.
+   */
+  covered?: Set<StoreInternal>;
+  /** SPIKE G6: other nodes read in this run, with the version each had. */
+  foreign?: Map<StoreInternal, number>;
 }[] = [];
 
+/** SPIKE G6: counts every write to any store. */
+let epoch = 0;
+
+/**
+ * SPIKE G6: note a read on `internal` that handed out `child`. A read on a
+ * node that no recorded dependency covers becomes a dependency on that node's
+ * version, which covers everything below it.
+ */
+function noteRead(internal: StoreInternal, child?: StoreInternal): void {
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (!tracker.seen) return;
+  const covered = (tracker.covered ??= new Set());
+  if (tracker.internal !== internal && !covered.has(internal)) {
+    (tracker.foreign ??= new Map()).set(internal, internal.version);
+    covered.add(internal);
+  }
+  if (child) covered.add(child);
+}
+
 /** Stands for "the property did not exist". */
 const MISSING = Symbol('missing');
 
@@ -131,6 +157,15 @@
       }
     }
     if (!Object.is(current, dep.value) || version !== dep.version) return false;
+  }
+  return true;
+}
+
+/** SPIKE G6: whether every node read outside the own subtree is unchanged. */
+function areForeignValid(foreign: Map<StoreInternal, number>): boolean {
+  for (const [node, version] of foreign) {
+    node.resumeScope();
+    if (node.version !== version) return false;
   }
   return true;
 }
@@ -148,7 +183,8 @@
 ): unknown {
   const cached = internal.computedCache.get(prop);
   // Nothing under this node was written since the entry was last found valid.
-  if (cached && cached.stamp === internal.version) return cached.value;
+  if (cached && cached.stamp === (cached.foreign ? epoch : internal.version))
+    return cached.value;
 
   // Cycle detection: if this (internal, prop) pair is already being validated
   // or run higher in the stack, the getter chain is recursive.
@@ -168,15 +204,25 @@
   const frame: (typeof trackerStack)[number] = {internal, prop, deps: []};
   trackerStack.push(frame);
   try {
-    if (cached && areDepsValid(internal, cached.deps)) {
-      cached.stamp = internal.version;
+    if (
+      cached &&
+      areDepsValid(internal, cached.deps) &&
+      (!cached.foreign || areForeignValid(cached.foreign))
+    ) {
+      cached.stamp = cached.foreign ? epoch : internal.version;
       return cached.value;
     }
     frame.seen = new Set();
     // Taken before the body runs, so a getter that writes is checked again.
     const stamp = internal.version;
+    const epochBefore = epoch;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
+    internal.computedCache.set(prop, {
+      value,
+      deps: frame.deps,
+      stamp: frame.foreign ? epochBefore : stamp,
+      foreign: frame.foreign,
+    });
     return value;
   } finally {
     trackerStack.pop();
@@ -208,6 +254,7 @@
  */
 function notifyMutation(internal: StoreInternal): void {
   const owners = internal.ancestors();
+  epoch++;
   // Invalidate every path before any synchronous subscriber reads a snapshot.
   for (const node of owners) node.version++;
   if (transactionDepth) {
@@ -459,8 +506,10 @@
           receiver,
         );
         // Record it for any getter that is running further up.
-        if (trackerStack.length)
+        if (trackerStack.length) {
           recordDep(internal, prop, value, versionOf(value), getterDesc.get);
+          noteRead(internal);
+        }
         return value;
       }
 
@@ -492,6 +541,7 @@
             getterDesc ? value : MISSING,
             versionOf(value),
           );
+        noteRead(internal, child);
       }
       return child ? child.proxy : value;
     },
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -1,3 +1,5 @@
+import type {StoreInternal} from './ownership';
+
 // ── Computed getter memoization types ─────────────────────────────────────────
 
 /**
@@ -19,6 +21,11 @@
   value: unknown;
   /** One entry per property read, in the order of the first read. */
   deps: DepEntry[];
-  /** The owning node's version when this entry was last found valid. */
+  /**
+   * The owning node's version when this entry was last found valid. SPIKE G6:
+   * with `foreign` set, the count of writes to any store instead.
+   */
   stamp: number;
+  /** SPIKE G6: nodes read outside the getter's own subtree, with their versions. */
+  foreign?: Map<StoreInternal, number>;
 };
```

### G7a: a write in a snapshot getter throws

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..0cc6876 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -71,6 +71,7 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
+  key: string | symbol,
   getterFn: () => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
@@ -88,7 +89,17 @@ function computeWithTracking(
       }
       return value;
     },
+    // SPIKE G7: a snapshot is frozen. Without these traps a write lands on the
+    // empty target and is lost without a word.
+    set: refuse,
+    defineProperty: refuse,
+    deleteProperty: refuse,
   };
+  function refuse(_dummyTarget: object, prop: string | symbol): never {
+    throw new TypeError(
+      `@codebelt/classy-store: getter "${String(key)}" wrote "${String(prop)}" on a snapshot. A getter must not write.`,
+    );
+  }
 
   const tracked = new Proxy({}, handler);
   const result = getterFn.call(tracked);
@@ -139,7 +150,7 @@ function evaluateSnapshotGetter(
     result = prev.result;
   } else {
     // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
+    const computation = computeWithTracking(currentSnap, key, getterFn);
     result = computation.result;
 
     // Save cross-snapshot memo.
```

### G7b: a write in a getter throws on both layers

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..d5767b2 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -195,6 +195,16 @@ function evaluateComputed(
   }
 }
 
+/** SPIKE G7: a getter that is running must not write to any store. */
+function refuseWriteInGetter(prop: string | symbol): void {
+  const tracker = activeTracker();
+  if (tracker) {
+    throw new Error(
+      `@codebelt/classy-store: getter "${String(tracker.prop)}" wrote "${String(prop)}". A getter must not write.`,
+    );
+  }
+}
+
 // ── Public helpers ────────────────────────────────────────────────────────────
 
 /**
@@ -404,6 +414,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
+      refuseWriteInGetter(prop);
       internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
@@ -513,6 +524,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     deleteProperty(_target, prop) {
+      refuseWriteInGetter(prop);
       internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..0cc6876 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -71,6 +71,7 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
+  key: string | symbol,
   getterFn: () => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
@@ -88,7 +89,17 @@ function computeWithTracking(
       }
       return value;
     },
+    // SPIKE G7: a snapshot is frozen. Without these traps a write lands on the
+    // empty target and is lost without a word.
+    set: refuse,
+    defineProperty: refuse,
+    deleteProperty: refuse,
   };
+  function refuse(_dummyTarget: object, prop: string | symbol): never {
+    throw new TypeError(
+      `@codebelt/classy-store: getter "${String(key)}" wrote "${String(prop)}" on a snapshot. A getter must not write.`,
+    );
+  }
 
   const tracked = new Proxy({}, handler);
   const result = getterFn.call(tracked);
@@ -139,7 +150,7 @@ function evaluateSnapshotGetter(
     result = prev.result;
   } else {
     // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
+    const computation = computeWithTracking(currentSnap, key, getterFn);
     result = computation.result;
 
     // Save cross-snapshot memo.
```

### The combination: G3c, the dependency half of G4, G5 and G7a

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..b7ea8e3 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -58,96 +58,95 @@ export function identityOf(value: unknown): unknown {
 // ── Dependency tracking for computed getters ──────────────────────────────────
 
 /**
- * Stack of active dependency trackers. Each entry records which properties
- * a getter reads during evaluation. A stack (not a single variable) is needed
- * because getter A can read getter B, which pushes a second tracker.
+ * Getters being evaluated, outermost first. A frame covers the validation of
+ * the cached entry and, if that fails, the run of the body. `seen` is absent
+ * while the frame only validates, so nothing is recorded then.
  */
 const trackerStack: {
   internal: StoreInternal;
   prop: string | symbol;
   deps: DepEntry[];
+  seen?: Set<string | symbol>;
 }[] = [];
 
-/** Returns the tracker currently recording deps, or `null` if none is active. */
-function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
-}
+/** Recorded for a property that did not exist. */
+const MISSING = Symbol('missing');
 
 /**
- * Record a dependency on the active tracker (if any).
- * Called from the GET trap whenever a non-getter, non-method property is read.
+ * Recorded for a getter that threw. No read ever gives it, so the getter that
+ * recorded it runs again the next time it is checked.
  */
-function recordDep(
-  internal: StoreInternal,
-  prop: string | symbol,
-  value: unknown,
-): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-
-  // Only record deps for reads on the SAME proxy that owns the getter.
-  // Child-proxy reads don't need explicit tracking because child mutations
-  // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
-  const childInternal = internal.childInternals.get(prop);
-  if (childInternal) {
-    tracker.deps.push({
-      kind: 'version',
-      internal: childInternal,
-      version: childInternal.version,
-      parent: internal,
-      prop,
-    });
-  } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
-  }
+const THREW = Symbol('threw');
+
+/** @internal The error both layers throw for getters that read each other in a circle. */
+export function cycleError(path: (string | symbol)[]): Error {
+  return new Error(
+    `@codebelt/classy-store: circular computed getter dependency: ${path.map(String).join(' → ')}`,
+  );
+}
+
+/** The version of the store node a value is, or -1 when it is not one. */
+function versionOf(value: unknown): number {
+  if (typeof value !== 'object' || value === null) return -1;
+  const node = internalsMap.get(value);
+  if (!node) return -1;
+  node.resumeScope();
+  return node.version;
 }
 
 /**
- * Record a computed getter dependency on the active tracker (if any).
- * Unlike `recordDep`, this creates a `'computed'` dep entry that validates
- * through the computed cache rather than re-executing the raw getter.
+ * Record what a property of the running getter's own node gave. The first read
+ * of a property in a run is the one that counts. Reads on any other node are
+ * not recorded: a child's subtree is covered by the version of the child.
  */
-function recordComputedDep(
+function recordDep(
   internal: StoreInternal,
   prop: string | symbol,
   value: unknown,
+  version: number,
+  getter?: () => unknown,
 ): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-  if (tracker.internal !== internal) return;
-
-  tracker.deps.push({kind: 'computed', internal, prop, value});
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (tracker.internal !== internal || !tracker.seen || tracker.seen.has(prop))
+    return;
+  tracker.seen.add(prop);
+  tracker.deps.push({prop, value, version, getter});
 }
 
-/**
- * Check whether all dependencies from a previous computation are still valid.
- */
-function areDepsValid(deps: DepEntry[]): boolean {
+/** Read every dependency again, in the order it was first read. */
+function areDepsValid(internal: StoreInternal, deps: DepEntry[]): boolean {
   for (const dep of deps) {
-    if (dep.kind === 'version') {
-      // Verify the parent property still references the same child object.
-      // If the property was replaced entirely (e.g., store.items = newArray),
-      // the old child internal is detached and its version never changes.
-      // This check catches that case.
-      if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
+    let current: unknown;
+    let version: number;
+    if (dep.getter) {
+      // Bring the nested getter up to date through its own memo. One that
+      // throws counts as changed.
+      try {
+        current = evaluateComputed(
+          internal,
+          dep.prop,
+          dep.getter,
+          internal.proxy,
+        );
+      } catch {
         return false;
-      if (dep.internal.version !== dep.version) return false;
-    } else if (dep.kind === 'computed') {
-      // Validate through the computed cache — never re-execute the raw getter.
-      const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+      }
+      version = versionOf(current);
+    } else if (dep.version < 0) {
+      // A plain value. Whatever replaces it, a child included, reads
+      // differently on the raw object, so the raw object is enough.
+      current = Reflect.has(internal.target, dep.prop)
+        ? Reflect.get(internal.target, dep.prop)
+        : MISSING;
+      version = -1;
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
-      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
-        return false;
+      // A child: the same node, and nothing written below it.
+      const child = internal.childInternals.get(dep.prop);
+      if (!child) return false;
+      current = child.proxy;
+      version = child.version;
     }
+    if (!Object.is(current, dep.value) || version !== dep.version) return false;
   }
   return true;
 }
@@ -164,31 +163,33 @@ function evaluateComputed(
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
-  }
-
-  // Cycle detection: if this (internal, prop) pair is already being
-  // evaluated higher in the stack, the getter chain is recursive.
-  for (const existing of trackerStack) {
-    if (existing.internal === internal && existing.prop === prop) {
-      const cycle = trackerStack
-        .slice(trackerStack.indexOf(existing))
-        .map((f) => String(f.prop))
-        .concat(String(prop))
-        .join(' → ');
-      throw new Error(
-        `@codebelt/classy-store: circular computed getter dependency: ${cycle}`,
-      );
-    }
+  // Nothing under this node was written since the entry was last found valid.
+  if (cached && cached.stamp === internal.version) return cached.value;
+
+  // The same getter, asked for again before it answered, would recurse for
+  // ever, whether it is being validated or run.
+  const start = trackerStack.findIndex(
+    (frame) => frame.internal === internal && frame.prop === prop,
+  );
+  if (start !== -1) {
+    throw cycleError([
+      ...trackerStack.slice(start).map((frame) => frame.prop),
+      prop,
+    ]);
   }
 
-  // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
+  const frame: (typeof trackerStack)[number] = {internal, prop, deps: []};
   trackerStack.push(frame);
   try {
+    if (cached && areDepsValid(internal, cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
+    frame.seen = new Set();
+    // Taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
@@ -464,16 +465,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
-        const value = evaluateComputed(
-          internal,
-          prop,
-          getterDesc.get,
-          receiver,
-        );
-        // Record as a computed dependency for any parent getter currently tracking.
-        // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
-        return value;
+        // Record it for a getter running further up whether it returns or
+        // throws, so a getter that catches the error is run again later.
+        let value: unknown = THREW;
+        try {
+          value = evaluateComputed(internal, prop, getterDesc.get, receiver);
+          return value;
+        } finally {
+          if (trackerStack.length)
+            recordDep(internal, prop, value, versionOf(value), getterDesc.get);
+        }
       }
 
       const value = Reflect.get(_target, prop);
@@ -495,7 +496,10 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       // An inherited data property becomes an edge on its first proxy read.
       const child =
         internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
-      recordDep(internal, prop, value);
+      if (trackerStack.length) {
+        if (child) recordDep(internal, prop, child.proxy, child.version);
+        else recordDep(internal, prop, getterDesc ? value : MISSING, -1);
+      }
       return child ? child.proxy : value;
     },
 
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..492f8ab 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -1,33 +1,23 @@
-import type {StoreInternal} from './ownership';
-
 // ── Computed getter memoization types ─────────────────────────────────────────
 
 /**
- * A single dependency recorded during getter execution.
- * - `version`: dependency is a tracked sub-tree — compare `internal.version`.
- * - `value`: dependency is a primitive — compare via `Object.is`.
+ * What a property of the getter's own node gave when the getter first read it:
+ * a plain value, a child's proxy, or another getter's result.
  */
-export type DepEntry =
-  | {
-      kind: 'version';
-      internal: StoreInternal;
-      version: number;
-      /** Parent target — used to detect when the property is replaced entirely. */
-      parent: StoreInternal;
-      /** Property name on the parent. */
-      prop: string | symbol;
-    }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
-  | {
-      /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
-      kind: 'computed';
-      internal: StoreInternal;
-      prop: string | symbol;
-      value: unknown;
-    };
+export type DepEntry = {
+  prop: string | symbol;
+  value: unknown;
+  /** The version of the store node `value` is, or -1 when it is not one. */
+  version: number;
+  /** Set when the property is a getter: how to bring it up to date. */
+  getter?: () => unknown;
+};
 
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
   value: unknown;
+  /** One entry per property read, in the order of the first read. */
   deps: DepEntry[];
+  /** The owning node's version when this entry was last found valid. */
+  stamp: number;
 };
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..14469c2 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,5 @@
 import {markToTrack} from 'proxy-compare';
-import {getInternal, registerSnapshot} from '../core/core';
+import {cycleError, getInternal, registerSnapshot} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -49,6 +49,18 @@ type GetterDep = {prop: string | symbol; value: unknown};
  */
 type GetterMemoEntry = {deps: GetterDep[]; result: unknown};
 
+/** Snapshot getters being evaluated, outermost first. */
+const evaluating: {snap: object; key: string | symbol}[] = [];
+
+/**
+ * Recorded for a read that threw. No read ever gives it, so the getter that
+ * recorded it runs again on the next snapshot.
+ */
+const THREW = Symbol('threw');
+
+/** A snapshot is frozen: a getter that writes to `this` is refused. */
+const refuse = () => false;
+
 /**
  * Cross-snapshot getter memoization cache.
  * Keyed by raw class instance (target), maps each getter name to its last
@@ -81,13 +93,23 @@ function computeWithTracking(
     get(_dummyTarget, prop, _receiver) {
       // Delegate to the real snapshot (receiver = snap so installed getters
       // run with `this = snap`, triggering their own memoization chain).
-      const value = Reflect.get(snap, prop, snap);
-      if (!readProps.has(prop)) {
-        readProps.add(prop);
-        deps.push({prop, value});
+      // A read that throws is recorded too, so a getter that catches the
+      // error is run again later.
+      let value: unknown = THREW;
+      try {
+        value = Reflect.get(snap, prop, snap);
+        return value;
+      } finally {
+        if (!readProps.has(prop)) {
+          readProps.add(prop);
+          deps.push({prop, value});
+        }
       }
-      return value;
     },
+    // Without these a write would land on the empty target and be lost.
+    set: refuse,
+    defineProperty: refuse,
+    deleteProperty: refuse,
   };
 
   const tracked = new Proxy({}, handler);
@@ -102,11 +124,16 @@ function computeWithTracking(
  * this invokes the getter (which is itself memoized), then compares.
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
-  for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+  try {
+    for (const dep of deps) {
+      const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
+      if (!Object.is(currentValue, dep.value)) return false;
+    }
+    return true;
+  } catch {
+    // A dependency that throws counts as changed.
+    return false;
   }
-  return true;
 }
 
 /**
@@ -128,26 +155,43 @@ function evaluateSnapshotGetter(
   const perSnapCache = snapshotGetterCache.get(currentSnap);
   if (perSnapCache?.has(key)) return perSnapCache.get(key);
 
+  // The same getter on the same snapshot, asked for again before it answered,
+  // would recurse for ever. Report it as the live store does.
+  const start = evaluating.findIndex(
+    (frame) => frame.snap === currentSnap && frame.key === key,
+  );
+  if (start !== -1) {
+    throw cycleError([
+      ...evaluating.slice(start).map((frame) => frame.key),
+      key,
+    ]);
+  }
+
   // ── Cross-snapshot memo ──
+  // One map per target, made before any getter runs, so that a nested getter
+  // fills this map and not one that is then replaced.
   let memoMap = crossSnapshotMemo.get(target);
-  const prev = memoMap?.get(key);
+  if (!memoMap) {
+    memoMap = new Map();
+    crossSnapshotMemo.set(target, memoMap);
+  }
+  const prev = memoMap.get(key);
 
   let result: unknown;
 
-  if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
-    // Dependencies unchanged → reuse previous result.
-    result = prev.result;
-  } else {
-    // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
-    result = computation.result;
-
-    // Save cross-snapshot memo.
-    if (!memoMap) {
-      memoMap = new Map();
-      crossSnapshotMemo.set(target, memoMap);
+  evaluating.push({snap: currentSnap, key});
+  try {
+    if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
+      // Dependencies unchanged → reuse previous result.
+      result = prev.result;
+    } else {
+      // Compute fresh with dep tracking.
+      const computation = computeWithTracking(currentSnap, getterFn);
+      result = computation.result;
+      memoMap.set(key, computation);
     }
-    memoMap.set(key, {deps: computation.deps, result});
+  } finally {
+    evaluating.pop();
   }
 
   // Save per-snapshot cache.
```

### G7b, against the combination

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -193,6 +193,16 @@
     return value;
   } finally {
     trackerStack.pop();
+  }
+}
+
+/** SPIKE G7b: a getter that is running must not write to any store. */
+function refuseWriteInGetter(prop: string | symbol): void {
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (tracker) {
+    throw new Error(
+      `@codebelt/classy-store: getter "${String(tracker.prop)}" wrote "${String(prop)}". A getter must not write.`,
+    );
   }
 }
 
@@ -405,6 +415,7 @@
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
+      refuseWriteInGetter(prop);
       internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
@@ -517,6 +528,7 @@
     },
 
     deleteProperty(_target, prop) {
+      refuseWriteInGetter(prop);
       internal.resumeScope();
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
```

### The combination with errors cached, in its earlier form

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..efa50e1 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -58,96 +58,101 @@ export function identityOf(value: unknown): unknown {
 // ── Dependency tracking for computed getters ──────────────────────────────────
 
 /**
- * Stack of active dependency trackers. Each entry records which properties
- * a getter reads during evaluation. A stack (not a single variable) is needed
- * because getter A can read getter B, which pushes a second tracker.
+ * Getters being evaluated, outermost first. A frame covers the validation of
+ * the cached entry and, if that fails, the run of the body. `seen` is absent
+ * while the frame only validates, so nothing is recorded then.
  */
 const trackerStack: {
   internal: StoreInternal;
   prop: string | symbol;
   deps: DepEntry[];
+  seen?: Set<string | symbol>;
 }[] = [];
 
-/** Returns the tracker currently recording deps, or `null` if none is active. */
-function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+/** Stands for "the property did not exist". */
+const MISSING = Symbol('missing');
+
+/** The version recorded for a getter that threw. */
+const THREW = -2;
+
+/** @internal The error both layers throw for getters that read each other in a circle. */
+export function cycleError(path: (string | symbol)[]): Error {
+  return new Error(
+    `@codebelt/classy-store: circular computed getter dependency: ${path.map(String).join(' → ')}`,
+  );
+}
+
+/** The version of the store node a value is, or -1 when it is not one. */
+function versionOf(value: unknown): number {
+  if (typeof value !== 'object' || value === null) return -1;
+  const node = internalsMap.get(value);
+  if (!node) return -1;
+  node.resumeScope();
+  return node.version;
 }
 
 /**
- * Record a dependency on the active tracker (if any).
- * Called from the GET trap whenever a non-getter, non-method property is read.
+ * Record what a property of the running getter's own node gave. The first read
+ * of a property in a run is the one that counts. Reads on any other node are
+ * not recorded: a child's subtree is covered by the version of the child.
  */
 function recordDep(
   internal: StoreInternal,
   prop: string | symbol,
   value: unknown,
+  version: number,
+  getter?: () => unknown,
 ): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-
-  // Only record deps for reads on the SAME proxy that owns the getter.
-  // Child-proxy reads don't need explicit tracking because child mutations
-  // bubble up via version numbers on the parent's childInternals.
-  if (tracker.internal !== internal) return;
-
-  const childInternal = internal.childInternals.get(prop);
-  if (childInternal) {
-    tracker.deps.push({
-      kind: 'version',
-      internal: childInternal,
-      version: childInternal.version,
-      parent: internal,
-      prop,
-    });
-  } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
-  }
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (tracker.internal !== internal || !tracker.seen || tracker.seen.has(prop))
+    return;
+  tracker.seen.add(prop);
+  tracker.deps.push({prop, value, version, getter});
 }
 
+/** What `probe` found: the getter's value, or the error it threw. */
+let probed: unknown;
+
 /**
- * Record a computed getter dependency on the active tracker (if any).
- * Unlike `recordDep`, this creates a `'computed'` dep entry that validates
- * through the computed cache rather than re-executing the raw getter.
+ * Bring a getter up to date through its own memo. Leaves its value or its
+ * error in `probed`, and returns the version to compare it by.
  */
-function recordComputedDep(
+function probe(
   internal: StoreInternal,
   prop: string | symbol,
-  value: unknown,
-): void {
-  const tracker = activeTracker();
-  if (!tracker) return;
-  if (tracker.internal !== internal) return;
-
-  tracker.deps.push({kind: 'computed', internal, prop, value});
+  getter: () => unknown,
+  receiver: object,
+): number {
+  try {
+    probed = evaluateComputed(internal, prop, getter, receiver);
+    return versionOf(probed);
+  } catch (error) {
+    probed = error;
+    return THREW;
+  }
 }
 
-/**
- * Check whether all dependencies from a previous computation are still valid.
- */
-function areDepsValid(deps: DepEntry[]): boolean {
+/** Read every dependency again, in the order it was first read. */
+function areDepsValid(internal: StoreInternal, deps: DepEntry[]): boolean {
   for (const dep of deps) {
-    if (dep.kind === 'version') {
-      // Verify the parent property still references the same child object.
-      // If the property was replaced entirely (e.g., store.items = newArray),
-      // the old child internal is detached and its version never changes.
-      // This check catches that case.
-      if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
-        return false;
-      if (dep.internal.version !== dep.version) return false;
-    } else if (dep.kind === 'computed') {
-      // Validate through the computed cache — never re-execute the raw getter.
-      const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+    let current: unknown;
+    let version: number;
+    if (dep.getter) {
+      version = probe(internal, dep.prop, dep.getter, internal.proxy);
+      current = probed;
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
-      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
-        return false;
+      const child = internal.childInternals.get(dep.prop);
+      if (child) {
+        current = child.proxy;
+        version = child.version;
+      } else {
+        current = Reflect.has(internal.target, dep.prop)
+          ? Reflect.get(internal.target, dep.prop)
+          : MISSING;
+        version = versionOf(current);
+      }
     }
+    if (!Object.is(current, dep.value) || version !== dep.version) return false;
   }
   return true;
 }
@@ -163,36 +168,48 @@ function evaluateComputed(
   getterFn: () => unknown,
   receiver: object,
 ): unknown {
-  const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
-  }
-
-  // Cycle detection: if this (internal, prop) pair is already being
-  // evaluated higher in the stack, the getter chain is recursive.
-  for (const existing of trackerStack) {
-    if (existing.internal === internal && existing.prop === prop) {
-      const cycle = trackerStack
-        .slice(trackerStack.indexOf(existing))
-        .map((f) => String(f.prop))
-        .concat(String(prop))
-        .join(' → ');
-      throw new Error(
-        `@codebelt/classy-store: circular computed getter dependency: ${cycle}`,
-      );
+  let entry = internal.computedCache.get(prop);
+  // Equal: nothing under this node was written since the entry was last valid.
+  if (!entry || entry.stamp !== internal.version) {
+    // The same getter, asked for again before it answered, would recurse for
+    // ever, whether it is being validated or run.
+    const start = trackerStack.findIndex(
+      (frame) => frame.internal === internal && frame.prop === prop,
+    );
+    if (start !== -1) {
+      throw cycleError([
+        ...trackerStack.slice(start).map((frame) => frame.prop),
+        prop,
+      ]);
+    }
+    const frame: (typeof trackerStack)[number] = {internal, prop, deps: []};
+    trackerStack.push(frame);
+    try {
+      if (entry && areDepsValid(internal, entry.deps)) {
+        entry.stamp = internal.version;
+      } else {
+        frame.seen = new Set();
+        // Taken before the body runs, so a getter that writes is checked again.
+        const stamp = internal.version;
+        let value: unknown;
+        let threw = false;
+        try {
+          value = getterFn.call(receiver);
+        } catch (error) {
+          // An error that read nothing has nothing that could ever clear it.
+          if (!frame.deps.length) throw error;
+          value = error;
+          threw = true;
+        }
+        entry = {value, threw, deps: frame.deps, stamp};
+        internal.computedCache.set(prop, entry);
+      }
+    } finally {
+      trackerStack.pop();
     }
   }
-
-  // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
-  trackerStack.push(frame);
-  try {
-    const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
-    return value;
-  } finally {
-    trackerStack.pop();
-  }
+  if (entry.threw) throw entry.value;
+  return entry.value;
 }
 
 // ── Public helpers ────────────────────────────────────────────────────────────
@@ -464,15 +481,14 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const getterDesc = findPropertyDescriptor(_target, prop);
       if (getterDesc?.get) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
-        const value = evaluateComputed(
-          internal,
-          prop,
-          getterDesc.get,
-          receiver,
-        );
-        // Record as a computed dependency for any parent getter currently tracking.
-        // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
-        recordComputedDep(internal, prop, value);
+        if (!trackerStack.length)
+          return evaluateComputed(internal, prop, getterDesc.get, receiver);
+        // A getter is running further up: record what this one gave it,
+        // whether a value or an error, so it is re-run when that changes.
+        const version = probe(internal, prop, getterDesc.get, receiver);
+        const value = probed;
+        recordDep(internal, prop, value, version, getterDesc.get);
+        if (version === THREW) throw value;
         return value;
       }
 
@@ -495,7 +511,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       // An inherited data property becomes an edge on its first proxy read.
       const child =
         internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
-      recordDep(internal, prop, value);
+      if (trackerStack.length) {
+        if (child) recordDep(internal, prop, child.proxy, child.version);
+        else
+          recordDep(
+            internal,
+            prop,
+            getterDesc ? value : MISSING,
+            versionOf(value),
+          );
+      }
       return child ? child.proxy : value;
     },
 
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..0e2478b 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -1,33 +1,30 @@
-import type {StoreInternal} from './ownership';
-
 // ── Computed getter memoization types ─────────────────────────────────────────
 
 /**
- * A single dependency recorded during getter execution.
- * - `version`: dependency is a tracked sub-tree — compare `internal.version`.
- * - `value`: dependency is a primitive — compare via `Object.is`.
+ * What a property of the getter's own node gave when the getter first read it:
+ * a plain value, a child's proxy, another getter's result, or the error
+ * another getter threw.
  */
-export type DepEntry =
-  | {
-      kind: 'version';
-      internal: StoreInternal;
-      version: number;
-      /** Parent target — used to detect when the property is replaced entirely. */
-      parent: StoreInternal;
-      /** Property name on the parent. */
-      prop: string | symbol;
-    }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
-  | {
-      /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
-      kind: 'computed';
-      internal: StoreInternal;
-      prop: string | symbol;
-      value: unknown;
-    };
+export type DepEntry = {
+  prop: string | symbol;
+  value: unknown;
+  /**
+   * The version of the store node `value` is; -1 when it is not one; -2 when
+   * `value` is an error that a getter threw.
+   */
+  version: number;
+  /** Set when the property is a getter: how to bring it up to date. */
+  getter?: () => unknown;
+};
 
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
+  /** What the getter returned, or what it threw. */
   value: unknown;
+  /** The getter threw `value`: a valid entry throws it again. */
+  threw: boolean;
+  /** One entry per property read, in the order of the first read. */
   deps: DepEntry[];
+  /** The owning node's version when this entry was last found valid. */
+  stamp: number;
 };
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..5680fe2 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,5 @@
 import {markToTrack} from 'proxy-compare';
-import {getInternal, registerSnapshot} from '../core/core';
+import {cycleError, getInternal, registerSnapshot} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -18,7 +18,7 @@ const snapshotCache = new WeakMap<object, [version: number, snap: object]>();
  */
 const snapshotGetterCache = new WeakMap<
   object,
-  Map<string | symbol, unknown>
+  Map<string | symbol, GetterMemoEntry>
 >();
 
 // A mutable restore needs the user's own descriptor, or the inherited getter
@@ -39,7 +39,13 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  prop: string | symbol;
+  /** What the read gave, or what it threw. */
+  value: unknown;
+  /** The read threw `value`. */
+  threw: boolean;
+};
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -47,7 +53,28 @@ type GetterDep = {prop: string | symbol; value: unknown};
  * we check if the deps are still reference-equal (via structural sharing)
  * and return the cached result if so -- avoiding re-execution of the getter.
  */
-type GetterMemoEntry = {deps: GetterDep[]; result: unknown};
+type GetterMemoEntry = {
+  deps: GetterDep[];
+  /** What the getter returned, or what it threw. */
+  result: unknown;
+  /** The getter threw `result`. */
+  threw: boolean;
+};
+
+/** Snapshot getters being evaluated, outermost first. */
+const evaluating: {snap: object; key: string | symbol}[] = [];
+
+/** What reading a property gives: a value, or the error it threw. */
+function readProperty(
+  snap: object,
+  prop: string | symbol,
+): {value: unknown; threw: boolean} {
+  try {
+    return {value: Reflect.get(snap, prop, snap), threw: false};
+  } catch (error) {
+    return {value: error, threw: true};
+  }
+}
 
 /**
  * Cross-snapshot getter memoization cache.
@@ -71,28 +98,44 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
+  key: string | symbol,
   getterFn: () => unknown,
-): {deps: GetterDep[]; result: unknown} {
+): GetterMemoEntry {
   const deps: GetterDep[] = [];
   const readProps = new Set<string | symbol>();
+  // A snapshot is frozen. Without a trap a write would land on the empty
+  // target below and be lost without a word.
+  const refuse = (_dummyTarget: object, prop: string | symbol): never => {
+    throw new TypeError(
+      `@codebelt/classy-store: getter "${String(key)}" wrote "${String(prop)}". A getter must not write.`,
+    );
+  };
 
   // Use an empty non-frozen target — we delegate everything to `snap`.
   const handler: ProxyHandler<object> = {
     get(_dummyTarget, prop, _receiver) {
       // Delegate to the real snapshot (receiver = snap so installed getters
       // run with `this = snap`, triggering their own memoization chain).
-      const value = Reflect.get(snap, prop, snap);
+      // A read that throws is a dependency too.
+      const read = readProperty(snap, prop);
       if (!readProps.has(prop)) {
         readProps.add(prop);
-        deps.push({prop, value});
+        deps.push({prop, ...read});
       }
-      return value;
+      if (read.threw) throw read.value;
+      return read.value;
     },
+    set: refuse,
+    defineProperty: refuse,
+    deleteProperty: refuse,
   };
 
   const tracked = new Proxy({}, handler);
-  const result = getterFn.call(tracked);
-  return {deps, result};
+  try {
+    return {deps, result: getterFn.call(tracked), threw: false};
+  } catch (error) {
+    return {deps, result: error, threw: true};
+  }
 }
 
 /**
@@ -103,8 +146,9 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    const current = readProperty(currentSnap, dep.prop);
+    if (current.threw !== dep.threw || !Object.is(current.value, dep.value))
+      return false;
   }
   return true;
 }
@@ -125,40 +169,57 @@ function evaluateSnapshotGetter(
   getterFn: () => unknown,
 ): unknown {
   // ── Per-snapshot fast path ──
-  const perSnapCache = snapshotGetterCache.get(currentSnap);
-  if (perSnapCache?.has(key)) return perSnapCache.get(key);
-
-  // ── Cross-snapshot memo ──
-  let memoMap = crossSnapshotMemo.get(target);
-  const prev = memoMap?.get(key);
-
-  let result: unknown;
+  let cache = snapshotGetterCache.get(currentSnap);
+  let entry = cache?.get(key);
 
-  if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
-    // Dependencies unchanged → reuse previous result.
-    result = prev.result;
-  } else {
-    // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
-    result = computation.result;
+  if (!entry) {
+    // The same getter on the same snapshot, asked for again before it
+    // answered, would recurse for ever. Report it as the live store does.
+    const start = evaluating.findIndex(
+      (frame) => frame.snap === currentSnap && frame.key === key,
+    );
+    if (start !== -1) {
+      throw cycleError([
+        ...evaluating.slice(start).map((frame) => frame.key),
+        key,
+      ]);
+    }
 
-    // Save cross-snapshot memo.
+    // ── Cross-snapshot memo ──
+    // One map per target, made before any getter runs, so that a nested
+    // getter fills this map and not one that is then replaced.
+    let memoMap = crossSnapshotMemo.get(target);
     if (!memoMap) {
       memoMap = new Map();
       crossSnapshotMemo.set(target, memoMap);
     }
-    memoMap.set(key, {deps: computation.deps, result});
-  }
+    evaluating.push({snap: currentSnap, key});
+    try {
+      const prev = memoMap.get(key);
+      if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
+        // Dependencies unchanged → reuse previous result.
+        entry = prev;
+      } else {
+        // Compute fresh with dep tracking.
+        entry = computeWithTracking(currentSnap, key, getterFn);
+        // An error that read nothing has nothing that could ever clear it.
+        if (entry.threw && !entry.deps.length) throw entry.result;
+        memoMap.set(key, entry);
+      }
+    } finally {
+      evaluating.pop();
+    }
 
-  // Save per-snapshot cache.
-  let cache = snapshotGetterCache.get(currentSnap);
-  if (!cache) {
-    cache = new Map();
-    snapshotGetterCache.set(currentSnap, cache);
+    // Save per-snapshot cache.
+    if (!cache) {
+      cache = new Map();
+      snapshotGetterCache.set(currentSnap, cache);
+    }
+    cache.set(key, entry);
   }
-  cache.set(key, result);
 
-  return result;
+  if (entry.threw) throw entry.result;
+  return entry.result;
 }
 
 // ── Internal helpers ──────────────────────────────────────────────────────────
```

### Test condition: `resumeScope()` without the walk to a detached parent

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..4c0e180 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -145,14 +145,8 @@ export class StoreInternal {
 
   /** A caller can still read, mutate, or subscribe to a detached subtree. */
   resumeScope(): void {
-    if (!this.detachedVersions) return;
-    let scope: StoreInternal = this;
-    let parent = scope.detachedParent?.deref();
-    while (parent?.detachedVersions) {
-      scope = parent;
-      parent = scope.detachedParent?.deref();
-    }
-    scope.resume();
+    // SPIKE: no walk to a detached parent (stage 1 finding 72).
+    this.resume();
   }
 
   /** This node and every container that currently owns it, up to each root. */
```

### Test condition: suspension switched off

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..0480665 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -87,7 +87,9 @@ export class StoreInternal {
   }
 
   private canSuspend(): boolean {
+    // SPIKE: never suspend a detached subtree.
     return (
+      false &&
       !this.detachedVersions &&
       !this.parents.size &&
       !this.isStoreRoot &&
```

### Test condition: no version bump in `resume()`

```diff
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..c8790e3 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -128,7 +128,7 @@ export class StoreInternal {
       if (versions) {
         for (const [child, previous] of versions) {
           if (child.version !== previous) {
-            node.version++;
+            // MUTANT: the version is not bumped on resume.
             break;
           }
         }
```

## Appendix F: the scripts

Each takes the library entry in `LIB`: `packages/classy-store/src/index.ts`
under Bun, or a built `dist/index.mjs` under either engine.

### `repro.mjs`: the reproductions R1 to R15

```js
// Behaviour reproductions for the getter spikes. One line per case, so the
// output of two builds can be compared with diff.
const lib = process.env.LIB;
if (!lib) throw new Error('set LIB to the library entry');
const {createClassyStore, snapshot, subscribe} = await import(lib);

const say = (name, ...parts) =>
  console.log(
    `${name.padEnd(34)} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' | ')}`,
  );
const attempt = (run) => {
  try {
    return run();
  } catch (error) {
    return `threw ${error.constructor.name}: ${String(error.message).slice(0, 90)}`;
  }
};

// R1. The cutoff (MobX 3, Signals 2): label reads parity, which reads a.
{
  const runs = {parity: 0, label: 0};
  class Model {
    a = 1;
    get parity() {
      runs.parity++;
      return this.a % 2;
    }
    get label() {
      runs.label++;
      return this.parity ? 'odd' : 'even';
    }
  }
  const store = createClassyStore(new Model());
  store.label;
  store.a = 3;
  const value = store.label;
  say('R1 cutoff, a 1 -> 3', value, runs);
}

// R2. A getter that returns a live node, read by another getter (Signals 2).
{
  class Table {
    rows = [{price: 1}];
    get first() {
      return this.rows[0];
    }
    get firstPrice() {
      return this.first.price;
    }
    get list() {
      return this.rows;
    }
    get sum() {
      let total = 0;
      for (const row of this.list) total += row.price;
      return total;
    }
  }
  const store = createClassyStore(new Table());
  const before = [store.firstPrice, store.sum];
  store.rows[0].price = 2;
  const afterEdit = [store.firstPrice, store.sum];
  store.rows.push({price: 5});
  const afterPush = [store.firstPrice, store.sum];
  store.rows = [{price: 9}];
  say('R2 getter returns a live node', before, afterEdit, afterPush, [
    store.firstPrice,
    store.sum,
  ]);
}

// R3. Stage 1 finding 32: a getter over a missing property.
{
  let runs = 0;
  class Model {
    get missing() {
      runs++;
      return this.later ?? {fallback: true};
    }
  }
  const store = createClassyStore(new Model());
  const first = store.missing;
  const same = first === store.missing;
  store.later = 5;
  const afterWrite = store.missing;
  delete store.later;
  say(
    'R3 missing property',
    `same object twice ${same}`,
    `after write ${afterWrite}`,
    `after delete ${JSON.stringify(store.missing)}`,
    `runs ${runs}`,
  );
}

// R4. Stage 1 finding 36: a getter that catches another getter's error.
{
  const runs = {strict: 0, safe: 0};
  class Model {
    ready = false;
    other = 0;
    get strict() {
      runs.strict++;
      if (!this.ready) throw new RangeError('not ready');
      return 'ready';
    }
    get safe() {
      runs.safe++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const store = createClassyStore(new Model());
  const first = store.safe;
  const again = store.safe;
  const afterFirst = {...runs};
  store.other = 1;
  store.safe;
  const afterUnrelated = {...runs};
  store.ready = true;
  say(
    'R4 catches an error, live',
    [first, again, store.safe],
    afterFirst,
    afterUnrelated,
    runs,
  );

  const snapRuns = {strict: 0, safe: 0};
  class SnapModel {
    ready = false;
    get strict() {
      snapRuns.strict++;
      if (!this.ready) throw new RangeError('not ready');
      return 'ready';
    }
    get safe() {
      snapRuns.safe++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const second = createClassyStore(new SnapModel());
  const snapFirst = snapshot(second).safe;
  second.ready = true;
  say(
    'R4 catches an error, snapshot',
    [snapFirst, snapshot(second).safe],
    snapRuns,
  );
}

// R5. A getter that throws, read twice with nothing changed, then recovered.
{
  let runs = 0;
  class Model {
    ready = false;
    other = 0;
    get strict() {
      runs++;
      if (!this.ready) throw new RangeError(`not ready (run ${runs})`);
      return 'ready';
    }
  }
  const store = createClassyStore(new Model());
  const errors = [];
  for (let i = 0; i < 2; i++) {
    try {
      store.strict;
    } catch (error) {
      errors.push(error);
    }
  }
  const sameError = errors[0] === errors[1];
  const runsWhileThrowing = runs;
  store.other = 1;
  attempt(() => store.strict);
  const runsAfterUnrelated = runs;
  store.ready = true;
  say(
    'R5 throws, live',
    `same error object ${sameError}`,
    `runs after 2 reads ${runsWhileThrowing}`,
    `after unrelated write ${runsAfterUnrelated}`,
    `after ready: ${attempt(() => store.strict)}`,
    `runs ${runs}`,
  );

  let snapRuns = 0;
  class SnapModel {
    ready = false;
    get strict() {
      snapRuns++;
      if (!this.ready) throw new RangeError(`not ready (run ${snapRuns})`);
      return 'ready';
    }
  }
  const second = createClassyStore(new SnapModel());
  const frozen = snapshot(second);
  const snapErrors = [];
  for (let i = 0; i < 2; i++) {
    try {
      frozen.strict;
    } catch (error) {
      snapErrors.push(error);
    }
  }
  second.ready = true;
  say(
    'R5 throws, snapshot',
    `same error object ${snapErrors[0] === snapErrors[1]}`,
    `runs after 2 reads ${snapRuns}`,
    `after ready: ${attempt(() => snapshot(second).strict)}`,
  );
}

// R5b. A getter that throws before it reads anything: never cached.
{
  let runs = 0;
  const outside = {ready: false};
  class Model {
    get strict() {
      runs++;
      if (!outside.ready) throw new RangeError('not ready');
      return 'ready';
    }
  }
  const store = createClassyStore(new Model());
  attempt(() => store.strict);
  attempt(() => store.strict);
  outside.ready = true;
  say(
    'R5b throws with no dependency',
    `after ready: ${attempt(() => store.strict)}`,
    `runs ${runs}`,
  );
}

// R6. A cycle that a write breaks (Signals 4): a = looped ? b : 0, b = a + 1.
{
  class Model {
    looped = true;
    get a() {
      return this.looped ? this.b : 0;
    }
    get b() {
      return this.a + 1;
    }
  }
  const store = createClassyStore(new Model());
  const first = attempt(() => store.b);
  const second = attempt(() => store.a);
  store.looped = false;
  const live = [attempt(() => store.b), attempt(() => store.a)];
  store.looped = true;
  const back = attempt(() => store.b);
  say(
    'R6 cycle, live',
    first,
    second,
    `after looped = false: ${live}`,
    `after looped = true: ${back}`,
  );

  const snapStore = createClassyStore(new Model());
  const snapFirst = attempt(() => snapshot(snapStore).b);
  const snapSecond = attempt(() => snapshot(snapStore).a);
  snapStore.looped = false;
  const snapAfter = [
    attempt(() => snapshot(snapStore).b),
    attempt(() => snapshot(snapStore).a),
  ];
  snapStore.looped = true;
  say(
    'R6 cycle, snapshot',
    snapFirst,
    snapSecond,
    `after looped = false: ${snapAfter}`,
    `after looped = true: ${attempt(() => snapshot(snapStore).b)}`,
  );
}

// R7. Stage 1 finding 37: nested memoization on snapshots.
{
  const runs = {a: 0, b: 0, c: 0};
  class Model {
    n = 1;
    unrelated = 0;
    get a() {
      runs.a++;
      return this.n + 1;
    }
    get b() {
      runs.b++;
      return this.a + 1;
    }
    get c() {
      runs.c++;
      return this.b + 1;
    }
  }
  const store = createClassyStore(new Model());
  snapshot(store).c;
  const first = {...runs};
  store.unrelated = 1;
  snapshot(store).c;
  const second = {...runs};
  store.unrelated = 2;
  snapshot(store).c;
  say('R7 snapshot nested memo', first, second, runs);
}

// R8. Stage 1 finding 39: a getter that writes.
{
  let runs = 0;
  let calls = 0;
  class Model {
    n = 0;
    get bump() {
      runs++;
      this.n = this.n + 1;
      return this.n;
    }
  }
  const store = createClassyStore(new Model());
  subscribe(store, () => void calls++, {sync: true});
  const values = [
    attempt(() => store.bump),
    attempt(() => store.bump),
    attempt(() => store.bump),
  ];
  say(
    'R8 writes what it reads, live',
    values,
    `runs ${runs}`,
    `n ${store.n}`,
    `sync calls ${calls}`,
  );

  let otherRuns = 0;
  let otherCalls = 0;
  class Other {
    n = 0;
    hits = 0;
    get counted() {
      otherRuns++;
      this.hits = otherRuns;
      return this.n * 2;
    }
  }
  const second = createClassyStore(new Other());
  subscribe(second, () => void otherCalls++, {sync: true});
  const otherValues = [
    attempt(() => second.counted),
    attempt(() => second.counted),
    attempt(() => second.counted),
  ];
  say(
    'R8 writes another field, live',
    otherValues,
    `runs ${otherRuns}`,
    `hits ${second.hits}`,
    `sync calls ${otherCalls}`,
  );

  let snapRuns = 0;
  class SnapModel {
    n = 0;
    get bump() {
      snapRuns++;
      this.n = this.n + 1;
      return this.n;
    }
  }
  const third = createClassyStore(new SnapModel());
  const frozen = snapshot(third);
  const snapValues = [attempt(() => frozen.bump), attempt(() => frozen.bump)];
  say(
    'R8 writes what it reads, snapshot',
    snapValues,
    `runs ${snapRuns}`,
    `store n ${third.n}`,
    `snapshot n ${frozen.n}`,
  );
}

// R9. Stage 1 finding 36: reads outside the getter's own node.
{
  const other = createClassyStore({rate: 2});
  class Model {
    n = 10;
    get scaled() {
      return this.n * other.rate;
    }
  }
  const store = createClassyStore(new Model());
  const before = store.scaled;
  other.rate = 3;
  const live = store.scaled;
  say(
    'R9 another store',
    [before, live],
    `fresh snapshot ${snapshot(store).scaled}`,
  );
}
{
  class Model {
    child = {n: 1};
    get viaOutside() {
      return outsideChild.n * 10;
    }
    get viaThis() {
      return this.child.n * 10;
    }
  }
  const store = createClassyStore(new Model());
  const outsideChild = store.child;
  const before = [store.viaOutside, store.viaThis];
  store.child.n = 2;
  say('R9 own child, outside reference', before, [
    store.viaOutside,
    store.viaThis,
  ]);
}
{
  class Model {
    static rate = 2;
    n = 1;
    get scaled() {
      return this.n * Model.rate;
    }
  }
  const store = createClassyStore(new Model());
  const before = store.scaled;
  Model.rate = 3;
  say('R9 a static', [before, store.scaled]);
}
{
  // A nested node read through a local variable taken from `this` inside the
  // getter: covered, because reading `this.child` records the child's version.
  class Model {
    child = {deep: {n: 1}};
    get viaLocal() {
      const deep = this.child.deep;
      return deep.n * 10;
    }
  }
  const store = createClassyStore(new Model());
  const before = store.viaLocal;
  store.child.deep.n = 2;
  say('R9 nested node through a local', [before, store.viaLocal]);
}
{
  // A getter on a nested node that reads its parent through a closure.
  const root = createClassyStore({rate: 2, line: null});
  root.line = {
    qty: 3,
    get cost() {
      return this.qty * root.rate;
    },
  };
  const before = root.line.cost;
  root.rate = 5;
  say(
    'R9 nested getter reads the root',
    [before, root.line.cost],
    `fresh snapshot ${snapshot(root).line.cost}`,
  );
}

// R10. Stage 1 finding 11: a write through the raw object.
{
  const raw = {
    n: 1,
    get double() {
      return this.n * 2;
    },
  };
  const store = createClassyStore(raw);
  const before = store.double;
  raw.n = 5;
  const afterRaw = store.double;
  store.n = 5;
  store.other = 1;
  say(
    'R10 raw write',
    [before, afterRaw, store.double],
    `snapshot ${snapshot(store).double}`,
  );
}

// R11. Object.defineProperty through the store (stage 1 finding 1).
{
  const store = createClassyStore({
    n: 1,
    get double() {
      return this.n * 2;
    },
  });
  const before = store.double;
  Object.defineProperty(store, 'n', {
    value: 7,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  say('R11 defineProperty', [before, store.double]);
}

// R12. The stamp and a detached, suspended subtree.
{
  const store = createClassyStore({
    slot: {
      n: 1,
      child: {x: 1, leaf: {y: 1}},
      get sum() {
        return this.n + this.child.x + this.child.leaf.y;
      },
    },
  });
  const slot = store.slot;
  const child = slot.child;
  const leaf = child.leaf;
  const results = [slot.sum];
  delete store.slot; // nobody observes it: suspended
  results.push(slot.sum);
  leaf.y = 10; // write below, through a retained proxy
  results.push(slot.sum);
  child.x = 20;
  results.push(slot.sum);
  slot.n = 30;
  results.push(slot.sum);
  store.slot = slot; // back in
  leaf.y = 100;
  results.push(slot.sum, store.slot.sum);
  say('R12 detached subtree', results, 'expect [3,3,12,31,60,150,150]');
}
{
  // A child that is shared with a live owner, written through that owner
  // while the getter's node is suspended.
  const shared = {x: 1};
  const store = createClassyStore({
    keep: shared,
    slot: {
      shared,
      get value() {
        return this.shared.x;
      },
    },
  });
  const slot = store.slot;
  const results = [slot.value];
  delete store.slot;
  store.keep.x = 2;
  results.push(slot.value);
  store.keep.x = 3;
  store.keep.x = 4;
  results.push(slot.value);
  say('R12 shared child, suspended owner', results, 'expect [1,2,4]');
}
{
  // The child itself is observed, so it cannot suspend; its parent can.
  const store = createClassyStore({
    slot: {
      child: {x: 1},
      get value() {
        return this.child.x;
      },
    },
  });
  const slot = store.slot;
  const child = slot.child;
  const stop = subscribe(child, () => {});
  const results = [slot.value];
  delete store.slot;
  child.x = 2;
  results.push(slot.value);
  stop();
  child.x = 3;
  results.push(slot.value);
  child.x = 4;
  results.push(slot.value, slot.value);
  say('R12 observed child, suspended owner', results, 'expect [1,2,3,4,4]');
}
{
  // Nested getters on a suspended node.
  const store = createClassyStore({
    slot: {
      rows: [{p: 1}, {p: 2}],
      get total() {
        let sum = 0;
        for (const row of this.rows) sum += row.p;
        return sum;
      },
      get label() {
        return `total ${this.total}`;
      },
    },
  });
  const slot = store.slot;
  const row = slot.rows[0];
  const results = [slot.label];
  delete store.slot;
  row.p = 5;
  results.push(slot.label);
  const rows = slot.rows;
  slot.rows = [{p: 100}];
  rows[1].p = 50; // the old list, now out of the slot too
  results.push(slot.label);
  slot.rows = rows;
  results.push(slot.label);
  say(
    'R12 nested getters, suspended',
    results,
    'expect ["total 3","total 7","total 100","total 55"]',
  );
}

// R13. A getter that catches a cycle error: the two getters record each other.
{
  const runs = {a: 0, b: 0};
  class Model {
    looped = true;
    other = 0;
    get a() {
      runs.a++;
      try {
        return this.looped ? this.b : 0;
      } catch {
        return -1;
      }
    }
    get b() {
      runs.b++;
      return this.a + 1;
    }
  }
  const store = createClassyStore(new Model());
  const first = attempt(() => store.b);
  const again = attempt(() => store.b);
  store.other = 1;
  let depth = 0;
  const afterUnrelated = attempt(() => store.b);
  store.looped = false;
  say(
    'R13 catches a cycle error, live',
    [
      first,
      again,
      afterUnrelated,
      attempt(() => store.b),
      attempt(() => store.a),
    ],
    runs,
    depth,
  );

  const snapRuns = {a: 0, b: 0};
  class SnapModel {
    looped = true;
    other = 0;
    get a() {
      snapRuns.a++;
      try {
        return this.looped ? this.b : 0;
      } catch {
        return -1;
      }
    }
    get b() {
      snapRuns.b++;
      return this.a + 1;
    }
  }
  const second = createClassyStore(new SnapModel());
  const snapFirst = attempt(() => snapshot(second).b);
  second.other = 1;
  const snapUnrelated = attempt(() => snapshot(second).b);
  second.looped = false;
  say(
    'R13 catches a cycle error, snapshot',
    [snapFirst, snapUnrelated, attempt(() => snapshot(second).b)],
    snapRuns,
  );
}

// R14. The supported way to read another store from a getter: hold it as a field.
{
  const other = createClassyStore({rate: 2});
  class Model {
    n = 10;
    other = other;
    get scaled() {
      return this.n * this.other.rate;
    }
  }
  const store = createClassyStore(new Model());
  let calls = 0;
  subscribe(store, () => void calls++, {sync: true});
  const before = [store.scaled, snapshot(store).scaled];
  other.rate = 3;
  say(
    'R14 another store held as a field',
    before,
    [store.scaled, snapshot(store).scaled],
    `sync calls on the holder ${calls}`,
  );
}

// R15. A getter that throws on a snapshot: spread and JSON (stage 1, line 1228).
{
  class Model {
    ready = false;
    get strict() {
      if (!this.ready) throw new RangeError('not ready');
      return 'ready';
    }
  }
  const store = createClassyStore(new Model());
  const frozen = snapshot(store);
  say(
    'R15 snapshot with a throwing getter',
    attempt(() => Object.keys({...frozen}).join()),
    attempt(() => JSON.stringify(frozen)),
  );
}
```

### `probe-order.mjs`: the probes P1 to P9

```js
// Cases that only the refresh designs could get wrong.
const {createClassyStore, snapshot} = await import(process.env.LIB);
const say = (name, ...parts) =>
  console.log(name.padEnd(44), parts.map((p) => JSON.stringify(p)).join(' | '));

// P1. A dependency that the current path no longer reads must not be run
// while the outer getter is validated.
{
  const runs = {heavy: 0, pick: 0};
  class Model {
    enabled = true;
    n = 1;
    get heavy() {
      runs.heavy++;
      if (this.n > 5) throw new Error('heavy must not run now');
      return this.n * 100;
    }
    get pick() {
      runs.pick++;
      return this.enabled ? this.heavy : 0;
    }
  }
  const store = createClassyStore(new Model());
  const first = store.pick;
  store.enabled = false;
  store.n = 9; // heavy would throw if it ran
  let second;
  try {
    second = store.pick;
  } catch (error) {
    second = `threw ${error.message}`;
  }
  say('P1 a dependency no longer on the path', [first, second], runs);
}

// P2. Reads made while a dependency is refreshed are not taken for
// dependencies of the getter being validated or of one running further up.
{
  const runs = {inner: 0, mid: 0, outer: 0};
  class Model {
    a = 1;
    b = 1;
    c = 1;
    get inner() {
      runs.inner++;
      return this.a > 0;
    }
    get mid() {
      runs.mid++;
      return this.inner ? this.b : -1;
    }
    get outer() {
      runs.outer++;
      return this.mid + this.c;
    }
  }
  const store = createClassyStore(new Model());
  store.outer;
  store.a = 2; // inner re-runs to the same value; mid and outer stay
  const afterA = [store.outer, {...runs}];
  store.a = 3;
  store.outer;
  store.a = 4;
  const afterMore = [store.outer, {...runs}];
  store.c = 5; // only outer
  say('P2 refresh records nothing further up', afterA, afterMore, [
    store.outer,
    {...runs},
  ]);
}

// P3. A getter that returns a child array, iterated by another getter.
{
  class Model {
    rows = [{p: 1}, {p: 2}];
    filter = 0;
    get visible() {
      return this.filter
        ? this.rows.filter((row) => row.p > this.filter)
        : this.rows;
    }
    get total() {
      let sum = 0;
      for (const row of this.visible) sum += row.p;
      return sum;
    }
  }
  const store = createClassyStore(new Model());
  const results = [store.total];
  store.rows[1].p = 10;
  results.push(store.total);
  store.rows.push({p: 100});
  results.push(store.total);
  store.filter = 5;
  results.push(store.total);
  store.rows[0].p = 50;
  results.push(store.total);
  store.rows = [];
  results.push(store.total);
  say(
    'P3 getter returns a child array',
    results,
    'expect [3,11,111,110,160,0]',
  );
}

// P4. A getter that returns a node of another store, read by another getter.
{
  const other = createClassyStore({item: {name: 'a'}});
  class Model {
    n = 0;
    get current() {
      return other.item;
    }
    get label() {
      return `${this.current.name}${this.n}`;
    }
  }
  const store = createClassyStore(new Model());
  const results = [store.label];
  other.item.name = 'b';
  results.push(store.label);
  store.n = 1;
  results.push(store.label);
  say('P4 getter returns a node of another store', results);
}

// P5. A deleted own getter, and a getter redefined as data (stage 1 finding 44).
{
  const store = createClassyStore({
    n: 1,
    get base() {
      return this.n * 2;
    },
    get top() {
      return this.base + 1;
    },
  });
  const results = [store.top];
  Object.defineProperty(store, 'base', {
    value: 100,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  results.push(store.base, store.top);
  store.n = 2;
  results.push(store.top);
  say('P5 a getter redefined as data', results);
}

// P6. A subclass getter that calls super.
{
  const runs = {base: 0, derived: 0};
  class Base {
    n = 1;
    get total() {
      runs.base++;
      return this.n * 2;
    }
  }
  class Derived extends Base {
    extra = 1;
    get total() {
      runs.derived++;
      return super.total + this.extra;
    }
    get label() {
      return `t${this.total}`;
    }
  }
  const store = createClassyStore(new Derived());
  const results = [store.label];
  store.n = 2;
  results.push(store.label);
  store.extra = 5;
  results.push(store.label, store.label);
  say('P6 subclass getter with super', results, runs);
}

// P7. The same on snapshots, where a getter is read after writes.
{
  class Model {
    rows = [{p: 1}];
    get first() {
      return this.rows[0];
    }
    get firstP() {
      return this.first.p;
    }
  }
  const store = createClassyStore(new Model());
  const results = [snapshot(store).firstP];
  store.rows[0].p = 2;
  results.push(snapshot(store).firstP);
  say('P7 snapshot: getter returns a node', results, 'expect [1,2]');
}

// P8. Contradiction 14 of the merged report: a getter over a missing
// property, read, read again, then read after a write to an unrelated field.
{
  let runs = 0;
  class Model {
    other = 0;
    get missing() {
      runs++;
      return this.later ?? {fallback: true};
    }
  }
  const store = createClassyStore(new Model());
  const first = store.missing;
  const second = store.missing;
  const afterTwoReads = runs;
  store.other = 1;
  const third = store.missing;
  const afterUnrelated = runs;
  store.later = 5;
  const fourth = store.missing;
  say(
    'P8 missing property',
    `runs after two reads ${afterTwoReads}`,
    `same object ${first === second}`,
    `runs after an unrelated write ${afterUnrelated}`,
    `same object ${second === third}`,
    `after the property is written: ${fourth}, runs ${runs}`,
  );
}

// P9. Contradiction 16: 1,000 rows, each with a getter of its own. One row is
// written, then every row's getter is read.
{
  const store = createClassyStore({
    rows: Array.from({length: 1000}, (_, id) => ({
      id,
      a: 1,
      b: 2,
      get sum() {
        return this.a + this.b;
      },
    })),
  });
  const rows = Array.from({length: 1000}, (_, index) => store.rows[index]);
  let sink = 0;
  for (const row of rows) sink += row.sum;
  let best = Infinity;
  for (let round = 0; round < 200; round++) {
    rows[round % 1000].a = round + 2;
    const start = performance.now();
    for (let index = 0; index < 1000; index++) sink += rows[index].sum;
    best = Math.min(best, performance.now() - start);
  }
  say(
    'P9 one row written, 1,000 row getters read',
    `${(best * 1000).toFixed(1)} microseconds, best of 200`,
    sink > 0,
  );
}
```

### `probe-writes.mjs`: what a getter that writes does

```js
// What a getter that writes does today, by where the write lands.
const {createClassyStore, snapshot, subscribe} = await import(process.env.LIB);
const attempt = (run) => {
  try {
    return run();
  } catch (error) {
    return `threw ${error.constructor.name}: ${String(error.message).slice(0, 80)}`;
  }
};
class Model {
  items = [3, 1, 2];
  child = {n: 0};
  n = 0;
  get sorted() {
    return this.items.sort();
  }
  get touched() {
    this.child.n = 1;
    return this.child.n;
  }
  get assigned() {
    this.n = 1;
    return this.n;
  }
  get lazy() {
    this.cache ??= ['made once'];
    return this.cache;
  }
}
for (const key of ['sorted', 'touched', 'assigned', 'lazy']) {
  const live = createClassyStore(new Model());
  let calls = 0;
  subscribe(live, () => void calls++, {sync: true});
  const a = attempt(() => live[key]);
  const b = attempt(() => live[key]);
  const frozen = snapshot(createClassyStore(new Model()));
  const c = attempt(() => frozen[key]);
  const d = attempt(() => frozen[key]);
  console.log(
    `${key.padEnd(9)} live: ${JSON.stringify(a)}, same result twice ${a === b}, sync calls after two reads ${calls} | snapshot: ${JSON.stringify(c)}, same result twice ${c === d}`,
  );
}
```

### `fuzz-detached.mjs`: the differential fuzz for nodes outside the store

```js
// Differential fuzz for getters on nodes that leave the store, are edited
// while nobody observes them, and come back. Every getter read is compared
// with a fresh computation on a plain mirror that no store code touches.
// Usage: LIB=<entry> bun fuzz-detached.mjs [seeds] [steps]
const lib = process.env.LIB;
if (!lib) throw new Error('set LIB to the library entry');
const {createClassyStore, snapshot, subscribe} = await import(lib);

const SEEDS = Number(process.argv[2] ?? 300);
const STEPS = Number(process.argv[3] ?? 400);

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

let checks = 0;
let detachedChecks = 0;
let suspendedWrites = 0;

function run(seed) {
  const next = random(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const chance = (p) => next() < p;
  let ids = 0;

  // The mirror: plain data, updated beside every store write.
  const mirror = {groups: new Map(), rows: new Map(), slots: []};
  // Proxies kept by "user code".
  const kept = {
    groups: new Map(),
    rows: new Map(),
    inner: new Map(),
    deep: new Map(),
    lists: [],
  };
  const stops = [];

  const newRow = () => {
    const id = ++ids;
    mirror.rows.set(id, {v: id});
    return {raw: {id, v: id}, id};
  };
  const makeGroup = () => {
    const id = ++ids;
    const rows = [newRow(), newRow()];
    mirror.groups.set(id, {n: 0, rows: rows.map((r) => r.id), x: 1, y: 1});
    return {
      id,
      n: 0,
      rows: rows.map((r) => r.raw),
      inner: {x: 1, deep: {y: 1}},
      get sum() {
        let total = this.n;
        for (const row of this.rows) total += row.v;
        return total + this.inner.x + this.inner.deep.y;
      },
      get label() {
        return `g${this.id}:${this.sum}`;
      },
      get first() {
        return this.rows[0];
      },
      get firstV() {
        const first = this.first;
        return first ? first.v : -1;
      },
      get loop() {
        let total = 0;
        for (let i = 0; i < this.rows.length; i++) total += this.rows[i].v;
        return total;
      },
    };
  };
  const expected = (id) => {
    const g = mirror.groups.get(id);
    const values = g.rows.map((rowId) => mirror.rows.get(rowId).v);
    const loop = values.reduce((a, b) => a + b, 0);
    const sum = g.n + loop + g.x + g.y;
    return {
      sum,
      label: `g${id}:${sum}`,
      firstV: values.length ? values[0] : -1,
      loop,
    };
  };

  const root = createClassyStore({slots: [], tick: 0});
  const keep = (group) => {
    const id = group.id;
    kept.groups.set(id, group);
    kept.inner.set(id, group.inner);
    kept.deep.set(id, group.inner.deep);
    for (const row of group.rows) kept.rows.set(row.id, row);
  };
  for (let i = 0; i < 3; i++) {
    root.slots.push(makeGroup());
    const group = root.slots[root.slots.length - 1];
    mirror.slots.push(group.id);
    keep(group);
  }

  const attached = (id) => mirror.slots.includes(id);
  const check = (step, what) => {
    const id = pick([...kept.groups.keys()]);
    const group = kept.groups.get(id);
    const want = expected(id);
    const keys = ['sum', 'label', 'firstV', 'loop'].filter(() => chance(0.6));
    for (const key of keys) {
      const got = group[key];
      checks++;
      if (!attached(id)) detachedChecks++;
      if (got !== want[key]) {
        throw new Error(
          `seed ${seed} step ${step} after "${what}": group ${id} (${attached(id) ? 'attached' : 'detached'}) ${key} is ${got}, the mirror says ${want[key]}`,
        );
      }
    }
    if (chance(0.15)) {
      const frozen = snapshot(group);
      for (const key of ['sum', 'label', 'firstV', 'loop']) {
        checks++;
        if (frozen[key] !== want[key]) {
          throw new Error(
            `seed ${seed} step ${step} after "${what}": snapshot of group ${id} ${key} is ${frozen[key]}, the mirror says ${want[key]}`,
          );
        }
      }
    }
  };

  for (let step = 0; step < STEPS; step++) {
    const groupIds = [...kept.groups.keys()];
    const id = pick(groupIds);
    const group = kept.groups.get(id);
    const g = mirror.groups.get(id);
    const roll = next();
    let what;
    if (!attached(id) && roll < 0.75) suspendedWrites++;
    if (roll < 0.12) {
      what = 'write n';
      group.n = ++g.n;
    } else if (roll < 0.3) {
      what = 'write a row';
      const rowId = pick([...kept.rows.keys()]);
      const value = Math.floor(next() * 100);
      kept.rows.get(rowId).v = value;
      mirror.rows.get(rowId).v = value;
    } else if (roll < 0.38) {
      what = 'write inner.x';
      kept.inner.get(id).x = ++g.x;
    } else if (roll < 0.46) {
      what = 'write inner.deep.y';
      kept.deep.get(id).y = ++g.y;
    } else if (roll < 0.54) {
      what = 'push a row';
      if (chance(0.5)) {
        const row = newRow();
        group.rows.push(row.raw);
        g.rows.push(row.id);
        kept.rows.set(row.id, group.rows[group.rows.length - 1]);
      } else {
        const rowId = pick([...kept.rows.keys()]);
        group.rows.push(kept.rows.get(rowId));
        g.rows.push(rowId);
      }
    } else if (roll < 0.6) {
      what = 'remove a row';
      if (g.rows.length) {
        if (chance(0.5)) {
          group.rows.pop();
          g.rows.pop();
        } else {
          group.rows.shift();
          g.rows.shift();
        }
      }
    } else if (roll < 0.66) {
      what = 'replace rows';
      kept.lists.push({list: group.rows, ids: g.rows});
      const rowIds = [...kept.rows.keys()]
        .filter(() => chance(0.3))
        .slice(0, 4);
      group.rows = rowIds.map((rowId) => kept.rows.get(rowId));
      g.rows = [...rowIds];
    } else if (roll < 0.7) {
      what = 'edit a list that was replaced';
      if (kept.lists.length) {
        const old = pick(kept.lists);
        const row = newRow();
        old.list.push(row.raw);
        old.ids.push(row.id);
        kept.rows.set(row.id, old.list[old.list.length - 1]);
      }
    } else if (roll < 0.74) {
      what = 'put a replaced list back';
      if (kept.lists.length) {
        const old = kept.lists.splice(
          Math.floor(next() * kept.lists.length),
          1,
        )[0];
        kept.lists.push({list: group.rows, ids: g.rows});
        group.rows = old.list;
        g.rows = old.ids;
      }
    } else if (roll < 0.82) {
      if (attached(id)) {
        what = 'detach the group';
        const index = mirror.slots.indexOf(id);
        if (chance(0.5)) root.slots.splice(index, 1);
        else root.slots = root.slots.filter((_, i) => i !== index);
        mirror.slots.splice(index, 1);
      } else {
        what = 'reattach the group';
        root.slots.push(group);
        mirror.slots.push(id);
      }
    } else if (roll < 0.86) {
      what = 'add a group';
      root.slots.push(makeGroup());
      const added = root.slots[root.slots.length - 1];
      mirror.slots.push(added.id);
      keep(added);
    } else if (roll < 0.93) {
      what = 'subscribe';
      const target = pick([
        group,
        kept.inner.get(id),
        kept.deep.get(id),
        group.rows,
        kept.rows.get(pick([...kept.rows.keys()])),
      ]);
      stops.push(
        subscribe(target, () => {}, chance(0.5) ? {sync: true} : undefined),
      );
    } else if (roll < 0.97) {
      what = 'unsubscribe';
      if (stops.length) stops.splice(Math.floor(next() * stops.length), 1)[0]();
    } else {
      what = 'snapshot the root';
      snapshot(root);
      root.tick++;
    }
    if (chance(0.5)) check(step, what);
  }
}

let failed = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  try {
    run(seed);
  } catch (error) {
    failed++;
    if (failed <= 5) console.log(String(error.message ?? error).slice(0, 300));
  }
}
console.log(
  `${SEEDS} seeds of ${STEPS} steps: ${failed} failed. ${checks} getter reads compared, ${detachedChecks} of them on a group outside the store; ${suspendedWrites} writes made to a group outside the store.`,
);
```

### `measure.mjs`: the extra measures

```js
// Timings for the getter spikes. Plain JavaScript so it runs on Bun and Node.
// LIB names the library entry to load: the worktree source on Bun, the built
// dist on Node.
const lib = process.env.LIB;
if (!lib) throw new Error('set LIB to the library entry');
const {createClassyStore, snapshot} = await import(lib);

let sink = 0;

/** Microseconds per call: the median of up to `max` calls within a budget. */
function micros(run, before, max = 400, budgetMs = 120) {
  const samples = [];
  const until = performance.now() + budgetMs;
  for (let i = 0; i < max; i++) {
    before?.();
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
    if (i >= 2 && performance.now() > until) break;
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] * 1000;
}

/** Nanoseconds per op: best of `rounds` rounds of `count` ops. */
function nanos(run, count = 300_000, rounds = 7) {
  let fastest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    run(count);
    fastest = Math.min(fastest, performance.now() - start);
  }
  return (fastest * 1e6) / count;
}

const out = {};

// 1. The diamond ladder: two getters per level, each reading both below.
function ladder(depth) {
  const runs = {count: 0};
  const target = {base: 1, unrelated: 0};
  for (let level = 0; level < depth; level++) {
    for (const side of ['l', 'r']) {
      Object.defineProperty(target, `${side}${level}`, {
        enumerable: true,
        configurable: true,
        get() {
          runs.count++;
          return level === 0
            ? this.base
            : this[`l${level - 1}`] + this[`r${level - 1}`];
        },
      });
    }
  }
  const store = createClassyStore(target);
  const top = `l${depth - 1}`;
  return {store, top, runs};
}
for (const depth of [8, 16, 20]) {
  const {store, top, runs} = ladder(depth);
  const first = micros(() => void store[top], undefined, 1);
  const firstRuns = runs.count;
  const clean = micros(() => void store[top]);
  const cleanRuns = runs.count - firstRuns;
  const unrelated = micros(
    () => void store[top],
    () => void store.unrelated++,
  );
  const unrelatedRuns = runs.count - firstRuns - cleanRuns;
  let next = 1;
  let reads = 0;
  const before = runs.count;
  const dirty = micros(
    () => {
      reads++;
      sink += store[top];
    },
    () => {
      store.base = ++next;
    },
  );
  out[`ladder${depth}`] = {
    first,
    clean,
    unrelated,
    dirty,
    bodies: `${firstRuns} first, ${cleanRuns} clean, ${unrelatedRuns} unrelated, ${(runs.count - before) / reads} per dirty read`,
  };
}

// 2. A getter over 1,000 rows: this.rows[i] in a loop against a local.
{
  class Table {
    rows = Array.from({length: 1000}, (_, i) => ({price: i}));
    other = 0;
    get loop() {
      let sum = 0;
      for (let i = 0; i < this.rows.length; i++) sum += this.rows[i].price;
      return sum;
    }
    get hoisted() {
      const rows = this.rows;
      let sum = 0;
      for (let i = 0; i < rows.length; i++) sum += rows[i].price;
      return sum;
    }
  }
  for (const key of ['loop', 'hoisted']) {
    const store = createClassyStore(new Table());
    const first = micros(() => void store[key], undefined, 1);
    const clean = micros(() => void store[key], undefined, 2000, 200);
    const unrelated = micros(
      () => void store[key],
      () => void store.other++,
      2000,
      200,
    );
    let n = 0;
    const dirty = micros(
      () => void store[key],
      () => {
        store.rows[n++ % 1000].price = n;
      },
      300,
      300,
    );
    out[`rows.${key}`] = {first, clean, unrelated, dirty};
  }
}

// 3. One getter over three fields.
{
  class Cart {
    price = 10;
    quantity = 2;
    discount = 1;
    other = 0;
    get total() {
      return this.price * this.quantity - this.discount;
    }
  }
  const store = createClassyStore(new Cart());
  const field = nanos((count) => {
    for (let i = 0; i < count; i++) sink += store.price;
  });
  const clean = nanos((count) => {
    for (let i = 0; i < count; i++) sink += store.total;
  });
  const writeOnly = nanos((count) => {
    for (let i = 0; i < count; i++) store.other = i + 1;
  });
  const unrelated = nanos((count) => {
    for (let i = 0; i < count; i++) {
      store.other = i;
      sink += store.total;
    }
  });
  const dirty = nanos((count) => {
    for (let i = 0; i < count; i++) {
      store.price = i;
      sink += store.total;
    }
  });
  out.single = {field, clean, writeOnly, unrelated, dirty};
}

// 4. A getter that reads another getter: the everyday nested case.
{
  class Order {
    price = 10;
    quantity = 2;
    taxRate = 0.1;
    other = 0;
    get subtotal() {
      return this.price * this.quantity;
    }
    get total() {
      return this.subtotal * (1 + this.taxRate);
    }
  }
  const store = createClassyStore(new Order());
  const clean = nanos((count) => {
    for (let i = 0; i < count; i++) sink += store.total;
  });
  const unrelated = nanos((count) => {
    for (let i = 0; i < count; i++) {
      store.other = i;
      sink += store.total;
    }
  });
  const dirty = nanos((count) => {
    for (let i = 0; i < count; i++) {
      store.price = i;
      sink += store.total;
    }
  });
  out.nested = {clean, unrelated, dirty};
}

// 5. A getter over a child object and a child array (version dependencies).
{
  class Page {
    filter = {text: 'a', limit: 5};
    items = Array.from({length: 20}, (_, i) => ({name: `a${i}`}));
    other = 0;
    get visible() {
      const {text, limit} = this.filter;
      const found = [];
      for (const item of this.items) {
        if (found.length < limit && item.name.startsWith(text))
          found.push(item);
      }
      return found.length;
    }
  }
  const store = createClassyStore(new Page());
  const clean = nanos((count) => {
    for (let i = 0; i < count; i++) sink += store.visible;
  });
  const unrelated = nanos((count) => {
    for (let i = 0; i < count; i++) {
      store.other = i;
      sink += store.visible;
    }
  });
  out.children = {clean, unrelated};
}

// 6. Snapshot getters: a chain of 20, read on a fresh snapshot after an
// unrelated write, and a getter read on the same snapshot again.
{
  const target = {base: 1, unrelated: 0};
  for (let level = 0; level < 20; level++) {
    Object.defineProperty(target, `g${level}`, {
      enumerable: true,
      configurable: true,
      get() {
        return level === 0 ? this.base : this[`g${level - 1}`] + 1;
      },
    });
  }
  const store = createClassyStore(target);
  snapshot(store).g19;
  const afterUnrelated = micros(
    () => {
      sink += snapshot(store).g19;
    },
    () => void store.unrelated++,
    2000,
    200,
  );
  const frozen = snapshot(store);
  const same = nanos((count) => {
    for (let i = 0; i < count; i++) sink += frozen.g19;
  });
  out.snapshotChain = {afterUnrelated, same};
}

const fix = (value) =>
  typeof value === 'number'
    ? value >= 100
      ? Math.round(value)
      : Number(value.toPrecision(3))
    : value;
for (const [name, row] of Object.entries(out)) {
  console.log(
    name.padEnd(14),
    Object.entries(row)
      .map(([key, value]) => `${key} ${fix(value)}`)
      .join(' | '),
  );
}
if (sink === -1) console.log(sink);
```

## Not done

Everything in the brief was run. What a later agent could still do, with an
empty scratch folder and the appendices:

1. **Benchmark G7b and the combination with errors cached.** Only tests and
   size were measured for those two.
2. **Limit the cache clearing of "With the traps report"** to accessors, and
   measure it. I only ran the unconditional form.
3. **Close the gap of G7b:** a snapshot getter that writes to a live store.
4. **Bring the main entry down.** I did not try to make the combination
   smaller beyond sharing the cycle error and returning `false` from the
   three traps.
5. **Run the suites the common brief excludes** against the combination.

To run anything again: make a worktree at `57404c3`, apply a patch from
appendix E with `git apply`, and run the scripts of appendix F with `LIB`
set to `packages/classy-store/src/index.ts` under Bun.

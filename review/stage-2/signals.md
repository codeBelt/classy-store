# Stage 2: Preact Signals and the TC39 Signals proposal

Read-only comparison of our getter memoization and our batching with Preact
Signals and with the reference polyfill of the TC39 Signals proposal, for
stage 3 of the pre-1.0 review. Nothing in the repository was changed apart
from this file.

This report builds on `review/stage-2/mobx.md`, findings 1 to 5, and does not
repeat them. Where it agrees with that report it says so in a line. Where it
corrects it (finding 2 below), it shows the reproduction.

## The libraries and what was read

- **Preact Signals:** `@preact/signals-core` 1.14.5. Source at
  `github.com/preactjs/signals`, tag `@preact/signals-core@1.14.5`, commit
  `30a797e962c76cc2e623e84f4194a00b9f0c5c8f` (2026-10-27). Read in full:
  `packages/core/src/index.ts` (1,173 lines).
- **TC39 Signals polyfill:** `signal-polyfill` 0.2.3. Source at
  `github.com/proposal-signals/signal-polyfill`, tag `v0.2.3`, commit
  `958ad56b92e321b84673a42c3d16109f72209017` (2026-11-16). Read in full:
  `src/graph.ts`, `src/computed.ts`, `src/signal.ts`, `src/wrapper.ts`.
- **What ran:** the published packages at those versions, in a scratch
  folder, on Bun 1.4.4.
- **Our side:** `release/1.0` at `ac38f2f`. Scripts import
  `packages/classy-store/src/index.ts` by absolute path. The spikes in finding
  1, 2, 3 and 6 ran on copies of `src/` in the scratch folder; their diffs are
  in the appendix.
- **Our source read closely:** `core/core.ts` (`activeTracker`, `recordDep`,
  `recordComputedDep`, `areDepsValid`, `evaluateComputed`, the `get` trap,
  `notifyMutation`, `settleTransaction`, `transactional`, `batch`, `deliver`),
  `core/core.types.ts`, and in `snapshot/snapshot.ts` `computeWithTracking`,
  `areMemoizedDepsValid`, `evaluateSnapshotGetter`, `installMemoizedGetters`.

## How they differ, in short

Both libraries are push-pull graphs with version numbers.

1. **Every source is its own node with a version.** A write bumps that
   source's version and a global counter (Preact `globalVersion`,
   `index.ts:161`, `:469-470`; the polyfill's `epoch`, `graph.ts:26`,
   `signal.ts` `signalValueChanged`). A computed records each source it read
   and the version it saw.
2. **Push marks, pull recomputes.** A write marks observed computeds as
   possibly stale (Preact `_notify`, `index.ts:737-749`; polyfill
   `consumerMarkDirty`, `graph.ts:330-334`). A read of a computed first asks
   "has anything at all changed since I was last clean?" with the global
   counter, then polls its sources in recorded order, refreshing each nested
   computed and comparing its version (Preact `needsToRecompute`,
   `index.ts:504-530`; polyfill `consumerPollProducersForChange`,
   `graph.ts:390-415`). A nested computed whose value came out equal keeps its
   version, so the outer one does not recompute.
3. **Unobserved computeds still work.** Neither library needs an observer for
   memoization: the global counter gives a clean read in O(1) without any
   subscription.

We have no per-source nodes. A getter records three kinds of dependency
(`core.types.ts:9-27`): the version of a child node, the value of a primitive
field, and another getter's value. Every read re-walks that list, and a
dependency on another getter is checked by re-walking that getter's list
recursively (`core.ts:137-142`).

So the signal libraries have nothing to say about snapshots, structural
sharing or ownership. They are directly comparable on three things: what a
clean read costs, how a nested getter is revalidated, and how batching and
delivery work.

## Findings

Each reproduction is an excerpt from the output of a script in the appendix,
where every script and its whole output are given. Times are microseconds
unless marked, from single runs on a laptop that was doing other work; read
them for shape, not for the last digit.

### 1. A clean read costs time that doubles per level; a global stamp makes it constant

**What they do.** Preact keeps `_globalVersion` on each computed and returns
at once when the global counter has not moved since the computed was last
found clean (`Computed.prototype._refresh`, `index.ts:661-664`). The counter
is taken before the body runs, so a body that writes is checked again next
time. When the computed is observed, a cheaper check comes first: tracking
and not marked outdated means clean (`index.ts:656-658`). The polyfill does
the same with `lastCleanEpoch` (`producerUpdateValueVersion`,
`graph.ts:277-298`), but stamps after the body has run (`graph.ts:297`).

**What we do.** `evaluateComputed` calls `areDepsValid` on every read
(`core.ts:166-169`), and a dependency on a getter re-walks that getter's list
(`core.ts:141`). A getter reached by two paths is walked twice, its
dependencies four times, and so on.

**Difference in behaviour.** Script 01, the ladder from the MobX report's
script 07: two getters per level, each reading both getters of the level
below. No body runs on a clean read in any library. Excerpt:

```text
                  clean read of the top        read after an unrelated write
depth | ours live | Preact | polyfill | ours live | Preact | polyfill
    8 |     10.28 |   0.07 |     0.08 |      7.27 |   0.42 |     0.70
   16 |   1540.32 |   0.04 |     0.06 |   1111.15 |   0.68 |     1.11
   20 |  16548.01 |   0.04 |     0.04 |  16424.39 |   0.68 |     0.92
  200 |   not run |   0.05 |     0.05 |   not run |  11.58 |     9.55
```

A spike (`spike-stamp`, appendix) adds a `stamp` to `ComputedEntry`: the
node's own version when the entry was last found valid, taken before the body
runs. A read whose node version equals the stamp returns at once, and a
nested entry found valid is stamped too, so each getter is walked at most
once per version. Script 01 against the spike, from the previous run of this
task:

```text
depth | clean read | read after an unrelated write | read after base changed
   20 |       0.06 |                          1.40 |                  11.86
  200 |       0.09 |                         21.46 |                 832.34
```

The clean read and the read after an unrelated write become constant and
linear. The everyday case improves too (script 10, one getter over three
fields, nanoseconds per read, best of five rounds):

```text
base:        getter, clean   61 ns | write to another field + getter  206 ns | write to a field it reads + getter  316 ns
spike-stamp: getter, clean   46 ns | write to another field + getter  238 ns | write to a field it reads + getter  321 ns
```

All ports 02 to 08 give the same output on the spike as on the base. The
"read after base changed" column is still quadratic on this spike (832 at
200), because a stale nested entry still makes the outer one recompute, which
re-validates the chain below; finding 2 removes that.

**Proposal: adopt.** This is step 2 of MobX finding 3, with two details the
signal libraries settle:

- The node's own `version` is enough as the stamp; no new global counter is
  needed. A write anywhere under a node bumps that node's version
  (`notifyMutation`, `core.ts:222-224`), so for a getter on the root it is a
  per-store counter. Preact needs a global counter only because its sources
  are not in one tree.
- Take the stamp before the body runs, as Preact does, not after, as the
  polyfill does. Script 06 shows the polyfill's choice: a computed that writes
  the signal it reads stays at its first value (`values [1,1,1] | runs 1`),
  where Preact and our live layer re-run.

It also removes stage 1 finding 32 on the live store as a side effect: a
getter over a missing property is no longer recomputed on every read (probe,
appendix: `returns the same object twice: false` on the base, `true` on all
three spikes), and it still sees the property once it is written (`5`).

**Kind.** Performance.

**Cost.** `core.ts` (`evaluateComputed`, `areDepsValid`) and `core.types.ts`,
about ten lines. Not breaking. The one edge, already named in the MobX
report: a primitive written through the raw object is noticed only after the
next write through a proxy, which is how snapshots behave today (stage 1
finding 11). Risk low. Measure with `bun run benchmark:core`.

### 2. Revalidate a nested getter by refreshing it, but compare its node version as well as its value

**What they do.** `needsToRecompute` (`index.ts:504-530`) walks the sources in
recorded order. For each one it compares the version it saw; if that matches
it calls `_refresh()` on the source, which recomputes it if needed, and
compares the version again. A computed whose new value is equal keeps its
version (`index.ts:679-687`; polyfill `producerRecomputeValue`,
`computed.ts:124-140`, with `equals`), so the outer computed stays valid.
Values held by signals are plain values: a computed returning the same object
means nothing below it changed.

**What we do.** A dependency on a getter is valid only if that getter's whole
list is valid (`core.ts:141`); whether its value changed is never asked. Our
snapshot layer already does it the other way: it reads the getter through its
own memo and compares the value (`areMemoizedDepsValid`, `snapshot.ts:104-110`).

**Difference in behaviour.** Script 02, a cutoff: `parity = a % 2` and
`label` reads `parity`. After `a` goes from 1 to 3, the run counts:

```text
ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":2}
Preact         a 1 -> 3, unobserved    {"b":2,"c":2,"d":2,"parity":2,"label":1}
polyfill       a 1 -> 3, unwatched     {"b":2,"c":2,"d":2,"parity":2,"label":1}
```

MobX finding 3, step 1, proposes exactly the signal libraries' rule: refresh
the nested getter, compare the value. A spike of that rule
(`spike-refresh`, appendix) fixes the cutoff above, and breaks this case
(`probe-first.ts`):

```ts
class Table {
  rows = [{price: 1}];
  get first() {
    return this.rows[0];
  }
  get firstPrice() {
    return this.first.price;
  }
}
const store = createClassyStore(new Table());
store.firstPrice; // 1
store.rows[0].price = 2;
store.firstPrice; // base: 2, spike-refresh: 1, spike-one: 2
```

`first` returns the same store proxy before and after, so the value compare
says "unchanged". `firstPrice` read `.price` on a child of the root, which
`recordDep` does not record (`core.ts:91`). The only thing that catches it
today is the recursive walk into `first`'s list, which holds a version
dependency on `rows`. Our getters can return live store nodes; a signal never
can. So value equality is not enough for us.

**Proposal: adapt.** Refresh the nested getter through its own memo and
compare both its value and, when the value is a store node, that node's
version. The `spike-one` spike (finding 9) does this with a `versionOf(value)`
lookup in `internalsMap`, and gives `2` above, `label` 1 in the cutoff, and
the error recovery of finding 4. On top of finding 1 it brings "read after
base changed" from quadratic to linear (script 01: 183.61 at depth 200
against 832.34 with the stamp alone, and 25,660 at depth 20 on the base).
While refreshing, push a frame that records nothing, so reads made during
validation are not taken for the running getter's dependencies. Preact gets
the same effect another way: `needsToRecompute` calls `_refresh()` on a
source directly instead of reading `.value`, so nothing is recorded, and
`_refresh` sets its own context only when it recomputes
(`index.ts:674-693`).

**Kind.** Performance, bug (the cutoff), and a correction to MobX finding 3.

**Cost.** `core.ts` (`areDepsValid`), `core.types.ts`. Not breaking. Changes
the pinned run counts at `core.characterisation.getters.test.ts:133`. Risk
medium: the probe above must become a test before the change, and so must a
getter returning a child array that a later getter iterates.

### 3. A getter that reads the same field in a loop records it once per read

**What they do.** Preact records a source once per run: `addDependency` reuses
the node already attached to the signal for this context, and a second read
in the same run records nothing (`index.ts:208-256`, the checks on
`node._target !== evalContext` and `node._version === -1`). The polyfill
records every read, by position (`producerAccessed`, `graph.ts:214-260`), and
pays for it in polling.

**What we do.** `recordDep` pushes an entry on every read
(`core.ts:93-104`). `this.rows` read inside the loop condition and the body
of a 1,000-row loop gives 2,000 version entries, each re-checked on every
read. The snapshot layer dedupes already (`readProps`, `snapshot.ts:77`,
`:85-88`).

**Difference in behaviour.** Script 09, the same total computed two ways:

```text
1000 rows                      first read  | clean read  | read after an unrelated write
ours live, loop                 1204.38 us |    26.80 us |    25.96 us
ours live, hoisted               330.33 us |     0.12 us |     0.14 us
Preact, loop                     327.46 us |     0.16 us |     0.12 us
polyfill, loop                   576.67 us |     0.12 us |    12.46 us
polyfill, loop: recorded sources 2001
```

The stamp of finding 1 fixes the clean read (0.24) but not the read after an
unrelated write (27.60). `spike-one`, which keys the list by property, gives
0.26 and 0.39. Writing `this.rows[i]` in a loop is the obvious way to write a
getter, and stage 1 finding 3's "200 nanoseconds per row" baseline is this
shape.

**Proposal: adopt.** Record a property once per run. A `Set` of recorded
properties on the tracker frame, as `computeWithTracking` has, is the
smallest change. The first read is the one that counts.

**Kind.** Performance.

**Cost.** `core.ts` (`recordDep`, the tracker frame). Not breaking. Risk low.

### 4. A computed that throws: both libraries cache the error, record the dependency first, and get stuck on a cycle

**What they do.** Both cache a thrown error as the computed's result with the
dependencies read before the throw (Preact `index.ts:688-692`, flag
`HAS_ERROR`; polyfill `ERRORED`, `computed.ts:126-129`) and rethrow the same
object on each read until a dependency changes. Both record the outer
computed's dependency on the inner one before rethrowing: Preact calls
`addDependency` before `_refresh` (`index.ts:751-765`); the polyfill calls
`producerAccessed` before `throw node.error` (`computed.ts:48-59`).

**What we do.** As the MobX report's finding 2 describes: nothing is cached on
a throw (`core.ts:189-195`) and the dependency on the inner getter is recorded
only after it returned (`core.ts:467-475`).

**Difference in behaviour.** Script 04. `safe` catches the error of `strict`,
which throws until `ready` is set:

```text
ours live      after ready = true: safe  fallback | runs {"strict":5,"safe":1,"outer":1}
Preact         after ready = true: safe  ready | runs {"strict":2,"safe":2,"outer":1}
polyfill       after ready = true: safe  ready | runs {"strict":2,"safe":2,"outer":1}
Preact         strict, read again        threw not ready | runs {"strict":1,...} | same error object: true
ours live      strict, read again        threw not ready | runs {"strict":2,...} | same error object: false
```

That agrees with MobX. What the signal libraries add is a counter-example to
caching blindly. Script 03 breaks a cycle with a write: `a = looped ? b : 0`,
`b = a + 1`:

```text
ours live      after looped = false: b       returned 1
Preact         after looped = false: b       threw Error: Cycle detected
Preact         after another round trip: b   threw Error: Cycle detected
polyfill       after looped = false: b       threw Error: Detected cycle in computations.
polyfill       sources of b                  0
```

In both libraries the cycle error is thrown when `b` reads `a`, before `b`
has recorded `a` (Preact checks `RUNNING` at `index.ts:753`, before
`addDependency`; the polyfill throws inside `producerUpdateValueVersion`,
before `producerAccessed`). So `b` caches an error with no sources, and no
write can ever clear it. Our live layer recovers because it caches nothing.

**Proposal: adopt MobX finding 2, with one rule from this case.** Record the
dependency on a getter in a `finally` (or before evaluating it), as both
libraries do, so the catching getter recovers. If errors are cached too, do
not cache one when the getter recorded no dependency, and record the
dependency on the getter that closes a cycle before throwing the cycle error.
On `spike-one`, which records the dependency in a `finally` but caches no
error, `safe` recovers (`ready | runs {"strict":6,"safe":2,"outer":1}`) and
`strict` re-runs more often while it throws (10 runs against 7 at the end of
script 04), since validation now refreshes it. Caching the error removes
those runs.

**Kind.** Bug.

**Cost.** As in the MobX report: `core.ts` and `snapshot.ts`, not breaking,
changes the pinned tests at `core.characterisation.getters.test.ts:1161` and
`:1270-1300`. Add a test for the broken cycle above, which today passes and
would fail under a naive error cache.

### 5. Cycle detection: our live message is the best of the three; the snapshot layer has none

**What they do.** Preact sets a `RUNNING` flag on a computed while it runs and
throws `Error('Cycle detected')` when it is read again (`index.ts:753-754`,
and for effects `:925-928`). The polyfill puts a `COMPUTING` sentinel in the
value slot and throws `Error('Detected cycle in computations.')`
(`computed.ts:111-115`). Neither names the computeds involved.

**What we do.** `evaluateComputed` scans the tracker stack and throws an
error that names the path (`core.ts:171-184`): `circular computed getter
dependency: a → b → a`. The snapshot layer has no check
(`evaluateSnapshotGetter`, `snapshot.ts:121-162`).

**Difference in behaviour.** Script 03:

```text
ours live      a <-> b        threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
ours snapshot  a <-> b        threw RangeError: Maximum call stack size exceeded.
Preact         a <-> b        threw Error: Cycle detected
polyfill       a <-> b        threw Error: Detected cycle in computations.
```

**Proposal: adopt for the snapshot layer.** Keep the live message. Give
`evaluateSnapshotGetter` the same check, with a module-level set of
`(target, key)` pairs being computed, so stage 1 finding 38 gives the same
error on both layers. The O(1) flag of the signal libraries is not worth
copying for the live layer: our scan is over the depth of nested getters,
which is small.

**Kind.** Diagnostics.

**Cost.** `snapshot.ts`, about ten lines. Not breaking. Changes the pinned
test for finding 38. Risk low.

### 6. The snapshot layer loses nested memoization once, on a target's first getter

**What they do.** Nothing comparable; this is a defect in our snapshot layer
that the 20-level chain in script 02 made visible.

**What we do.** `evaluateSnapshotGetter` reads `memoMap` for the target before
running the getter (`snapshot.ts:132`). While the getter runs, nested getters
create the map for the same target and fill it. Afterwards, if `memoMap` was
undefined at the start, a fresh map replaces the one the nested getters filled
(`snapshot.ts:146-149`).

**Difference in behaviour.** Script 02, a chain of 20 getters, each reading
the one below. Total body runs:

```text
ours snapshot  first snapshot read             total 60
ours snapshot  after an unrelated write        total 79   (19 levels re-ran)
ours snapshot  after base 2 -> 3               total 99
ours snapshot  after another unrelated write   total 99   (none re-ran)
```

So stage 1 finding 37 happens once per class instance, after its first
snapshot getter read, not on every snapshot. A one-line spike
(`spike-memo`, appendix) re-reads the map after the computation; the totals
become 60, 60, 80, 80, as Preact and the polyfill give for the live chain.

**Proposal: adopt.** Re-read `crossSnapshotMemo.get(target)` after
`computeWithTracking` returns.

**Kind.** Bug (performance only; results are correct).

**Cost.** One line in `snapshot.ts`. Not breaking. Changes the pinned test for
finding 37. Risk low.

### 7. A computed that writes

**What they do.** Neither library forbids it in a computed. Preact runs it and
re-runs on every read when it writes what it reads; once an effect reads that
computed, the write inside the effect's batch trips the cycle guard
(`Cycle detected`, from `index.ts:463-464`). The polyfill lets a `Computed`
write (`consumerAllowSignalWrites = true`, `wrapper.ts:95`) but forbids reads
and writes inside a `Watcher` notification (`wrapper.ts:73`,
`graph.ts:214-221`). In production the read error has an empty message,
because the text is behind Angular's `ngDevMode` flag.

**What we do.** On the live store the write goes through the `set` trap and
notifies; on a snapshot it is dropped (stage 1 finding 39).

**Difference in behaviour.** Script 06:

```text
ours live      writes what it reads            values [1,2,3] | runs 3 | n 3 | subscriber calls 3
Preact         writes what it reads            values [1,2,3] | runs 3 | n 3
Preact         the same, read by an effect     threw Error: Cycle detected
polyfill       writes what it reads            values [1,1,1] | runs 1 | n 1
```

Our live behaviour matches Preact's.

**Proposal: adapt, as a development warning only.** Neither library treats a
write in a computed as an error, so making it one would be stricter than the
field. A development-only `console.warn` from the `set` trap when
`trackerStack` is not empty, naming the getter, would catch the snapshot case,
where the write is lost in silence. Belongs with MobX finding 7 (a
development build).

**Kind.** Diagnostics.

**Cost.** `core.ts`, a few lines behind the development flag. Not breaking.

### 8. Effects and subscribers: Preact confirms MobX's delivery model, and throws to the writer

**What they do.** A Preact write starts a batch, marks targets, and runs
queued effects in `endBatch` when the outermost batch closes
(`index.ts:41-81`). Effects are queued, not called from the write, so a
re-entrant write is picked up by the running loop. `endBatch` skips a
disposed effect (`index.ts:62`) and an effect whose sources did not change.
A loop is bounded: after 100 iterations a write throws `Cycle detected`
(`index.ts:463-464`). An effect that throws does not stop the others; the
first error is rethrown to the writer once all have run (`index.ts:63-69`,
`:77-79`). The polyfill has no effect at all: a `Watcher`'s `notify` is
synchronous and may neither read nor write, and scheduling is left to the
user.

**What we do.** `deliver` is called from inside the write (`core.ts:232`),
recursively on a re-entrant write, from a copy of the listener list
(`core.ts:318-327`), and logs a thrown error with `console.error`.

**Difference in behaviour.** Script 07:

```text
ours sync      always writes          no error at the write | calls 3017 | console.error: ["Maximum call stack size exceeded."]
Preact effect  always writes, after a write   threw Error: Cycle detected at the write | runs 102 | m 101
ours sync      second removed by first        ["first","second"]
Preact         second removed by first        ["first"]
ours sync      re-entrant write               ["first:1","first:2","second:2","second:2"]
Preact         re-entrant write               ["first:1","second:2","first:2"]
ours sync      first subscriber throws        no error at the write | second called 1 | console.error: ["first subscriber failed"]
Preact         first effect throws            threw Error: first effect failed at the write | n 1 | second ran 1
```

Preact gives the same results as MobX on loops, removal and re-entrancy, so
MobX finding 5 now has two libraries behind it. On errors the two differ:
MobX logs, Preact throws to the writer.

**Proposal: adopt MobX finding 5; keep `console.error` for subscriber
errors.** Throwing from a write because a component's subscriber failed
would turn one broken view into a failed store method, and every adapter
subscribes synchronously. For the loop bound, Preact's 100 rounds is the same
number as MobX; the error should name the store, which neither library's
message does.

**Kind.** Bug, diagnostics.

**Cost.** As in the MobX report.

### 9. Batching and glitch freedom match; one Preact refinement is not worth taking

**What they do.** Preact's `batch` defers effects to the end of the outermost
batch, lets reads inside it see the new values, and still runs effects when
the callback throws (`index.ts:95-107`). Since 1.14 it also records each
signal's value at its first write in a batch and, if the value is back to it
at the end, fast-forwards the targets' versions so nothing re-runs
(`recordBatchSnapshot` and `reconcileBatchSnapshots`, `index.ts:163-206`).
Reads are pull-based, so a computed never sees half of a change; effects see
a consistent state at the end of a batch.

**What we do.** `batch` and store methods share one transaction counter
(`core.ts:245-306`); versions bump on every write so reads inside are
current, and sync subscribers are told once when the outermost call returns
or throws. Getters are pull-based on both layers.

**Difference in behaviour.** Scripts 02 and 08. No library showed a glitch:
in the diamond every `b/c` pair `d` saw was consistent (`2/2 4/6 12/22 22/42`
for us). Batching gives the same results:

```text
ours sync      batch(), total read inside          saw [-14,28]
Preact         batch(), total read inside          saw [-14,28]
ours sync      batch() that throws                 threw stop | price 7 | subscriber saw [7]
Preact         batch() that throws                 threw stop | price 7 | effect saw [7]
ours sync      set and set back in a batch         subscriber calls 1 | same snapshot object: false | equal content: true
Preact         set and set back in a batch         effect runs after the first 0 | computed runs after the first 0
```

**Proposal: keep `batch()` as it is; reject the set-and-set-back refinement.**
Preact can do it because a signal holds one value. We would need the value of
every written field at its first write in the batch, and the nodes' versions
would still have moved, so the snapshot would be rebuilt anyway. The case is
rare and the cost is one extra notification with equal content, which
selectors already absorb.

**Kind.** API design.

**Cost.** None.

## Could our three kinds of dependency become one?

Partly tested: the `spike-one` diff in the appendix does it, and ports 01 to
10 and the probe ran against it. The repository's test suites were not run
against it.

**What it does.** A dependency is `{value, version}` keyed by property name on
the getter's own node, in first-read order. `value` is what the read gave: the
child's proxy for an object edge, the getter's result for a getter, the raw
value for a primitive, and a `MISSING` or `THREW` sentinel. `version` is the
version of the store node `value` is, or -1. Validation re-reads each property
through one function, `currentOf` (`childInternals` for an edge, the memoized
getter for an accessor, `Reflect.get` otherwise), with a frame on the tracker
stack that records nothing, and compares `Object.is(value)` and the version.
The `stamp` of finding 1 sits in front of it. This is the signal libraries'
one rule ("a source is unchanged when its version is the one I saw"), with a
store node's version standing in for a signal's.

**What it gave.** All three kinds collapse into one entry type and one
validation loop; `recordComputedDep` goes, and the `parent`/`prop` check for a
replaced child falls out of comparing the proxy. Measured:

- Script 01, ladder at depth 200: clean read 0.13, after an unrelated write
  70.53, after base changed 183.61 (Preact: 0.05, 11.58, 21.88). Linear, and
  about six to eight times Preact.
- Script 09: 0.26 clean and 0.39 after an unrelated write, against 26.80 and
  25.96 on the base.
- Script 10, the everyday case: clean getter 48 ns against 61, but a write to
  another field followed by the getter 300 ns against 206, because a miss on
  the stamp now re-reads each dependency through a descriptor lookup instead
  of comparing a stored version.
- Behaviour: the cutoff of finding 2, the probe of finding 2, the error
  recovery of finding 4, and stage 1 finding 32 are fixed; nothing else in
  ports 02 to 08 changed.

**What it would take.** `core.ts` (`recordDep`, `areDepsValid`,
`evaluateComputed`, the `get` trap, the tracker frame) and `core.types.ts`,
about 150 lines of diff. Not breaking. Three things to settle first:

1. The slower "write then read" path. Keeping a fast path for an edge (compare
   the stored child version first, as the base does) should recover most of
   it; not measured.
2. The snapshot layer keeps its own `{prop, value}` list, which is already
   this model without versions (snapshot values are frozen, so value equality
   is enough there). The two layers could then share the comparison rule but
   not the code.
3. It does not widen what a getter can see. Reads on another node (MobX
   finding 1) are still not recorded; a single kind makes it easier to add
   "the version of a foreign node" as one more entry of the same shape.

My recommendation, reasoning from these measurements: take findings 1, 3 and
the `finally` of finding 4 first, as small separate changes, and then decide
on the single kind with the benchmark in hand. Finding 2 needs either the
single kind or a version check bolted on to the `computed` kind; the single
kind is the cleaner of the two.

## Stage 1 findings that have a counterpart

| #   | What the signal libraries do there                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | No snapshots; no counterpart.                                                                                                                                                                |
| 3   | A 1,000-row sum recomputes in about 330 us in Preact and in our hoisted form; our loop form costs 1,200 us and 27 us per clean read because of duplicate dependencies (finding 3).           |
| 13  | Not tested. A Preact computed depends on signals, not on an object that refers to itself.                                                                                                    |
| 18  | Preact throws `Cycle detected` at the writer after 100 rounds; the polyfill forbids writes in a `Watcher` callback (finding 8).                                                              |
| 19  | Preact effects are synchronous; the same bound covers them. The polyfill leaves scheduling to the user, and its README's microtask effect does not re-run a computed that writes its source. |
| 20  | Preact skips a disposed effect at the call (finding 8).                                                                                                                                      |
| 21  | A Preact effect created after a write runs once with the current value and never hears the earlier write (script 08: `late saw [7]`).                                                        |
| 22  | Queued: `["first:1","second:2","first:2"]` (finding 8).                                                                                                                                      |
| 23  | No counterpart; an effect's return value is used only as a cleanup function.                                                                                                                 |
| 24  | No counterpart: no nested owners.                                                                                                                                                            |
| 32  | No counterpart: a missing signal cannot be read. The stamp of finding 1 removes it on our live store.                                                                                        |
| 36  | Both libraries recover the getter that catches another's error, and cache the thrown error (finding 4). Reads on another object: both track every signal read, like MobX.                    |
| 37  | No snapshot layer; on our side the cause is one line (finding 6).                                                                                                                            |
| 38  | Both throw a generic cycle error; we overflow the stack on snapshots (finding 5).                                                                                                            |
| 39  | Both allow a write in a computed; Preact re-runs like our live layer (finding 7).                                                                                                            |
| 40  | Neither freezes or copies a computed's result. Reasoning from reading.                                                                                                                       |
| 41  | No counterpart: a computed is a function, not a getter with `this`.                                                                                                                          |
| 42  | No counterpart.                                                                                                                                                                              |
| 43  | No setters; `batch` is the counterpart, and it behaves like ours (finding 9).                                                                                                                |
| 44  | No counterpart: a computed is an object, not a name.                                                                                                                                         |
| 64  | `areDepsValid`'s `if (!cached) return false` becomes reachable with the `finally` of finding 4, as the MobX report noted; `spike-one` removes the whole branch.                              |

## The eight API questions, from the signal libraries' point of view

1. **Synchronous notification by default?** Preact: yes, effects run
   synchronously when the outermost batch closes, which is our sync mode.
   The polyfill: notification is synchronous but may do nothing except
   schedule; running work is the caller's job, typically in a microtask. Both
   point the same way as our adapters: synchronous delivery, grouped by a
   transaction.
2. **Writes outside a method; `batch()`?** Preact allows writes anywhere,
   warns about none, and exports `batch`, which is the only grouping it has.
   That supports keeping `batch()` in the API. The polyfill has no batch: a
   `Watcher` callback that schedules a microtask groups writes by
   construction.
3. **Snapshot getters as enumerable own accessors?** No position.
4. **Arrow-function methods and `#private` fields?** No position.
5. **Native `Map` and `Set`?** No position.
6. **Opt-in or opt-out for nested class instances?** No position.
7. **Entry points and adapter names?** No position.
8. **Development diagnostics.** Both have weaker messages than ours for
   cycles (finding 5). What they have that we lack: a bound on update loops
   (finding 8), and the polyfill's ban on reads and writes during
   notification. Its production build shows the cost of hiding messages
   behind a development flag: the error is empty. If we add a development
   build, keep the error text in production and drop only the extra checks.

## What was verified by running code, and what was only read

Verified by running, on Bun 1.4.4 with the published packages:

- Every reproduction quoted above. Scripts 02 to 08 were re-run in this pass
  and gave the same output as the first run, except the number of calls
  before the stack overflowed in script 07 (3,017 against 3,025), which
  depends on the stack.
- Scripts 01, 09 and 10 on the base were re-run; the figures quoted are from
  the re-run.
- The spikes: `spike-stamp`, `spike-refresh` and `spike-one` against scripts
  01, 09, 10 and the probe (from the previous run of this task), and against
  scripts 02 to 06 and 08 (this pass); `spike-memo` against script 02.

Only read:

- Every claim about the libraries' code paths, with the lines cited.
- That a stamp on our node version is safe for detached subtrees. A
  suspended subtree's version is reconciled on resume (`ownership.ts`), which
  `get` calls first (`core.ts:462`), so the stamp should see it; not tested.
- The repository's test suites were not run against any spike.
- Finding 40's line in the table.

## Appendix: ported tests and their output

All files are in
`<scratch>/stage-2-signals/run/`.
`ours.ts` re-exports `batch`, `createClassyStore`, `snapshot` and `subscribe`
from the repository's `packages/classy-store/src/index.ts`; in each spike
folder it re-exports them from that folder's `src/index.ts`.
`polyfill-effect.ts` is the effect from the polyfill's README with a flush
counter added.

### Helper: `ours.ts`

```ts
// Our library, read from the repository's source. Nothing is installed there.
export {
  batch,
  createClassyStore,
  snapshot,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
```

### Helper: `polyfill-effect.ts`

```ts
// The proposal has no effect. This is the example from the polyfill's README
// (signal-polyfill 0.2.3, "Creating a simple effect"), with one addition: the
// number of flushes is counted so a test can stop a runaway loop.
import {Signal} from 'signal-polyfill';

export const flushes = {count: 0, limit: Number.POSITIVE_INFINITY};
let needsEnqueue = true;

const watcher = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask(processPending);
  }
});

function processPending() {
  needsEnqueue = true;
  if (++flushes.count > flushes.limit) return;
  for (const pending of watcher.getPending()) pending.get();
  watcher.watch();
}

export function effect(callback: () => void): () => void {
  const computed = new Signal.Computed(() => {
    callback();
  });
  watcher.watch(computed);
  computed.get();
  return () => watcher.unwatch(computed);
}
```

### Script 01: `01-ladder.ts`

```ts
// A ladder of computeds: two per level, each reading both of the level below.
// Same shape as script 07 of the MobX report, so the figures can be compared.
// "Clean read" is a read of the top when nothing changed: no body runs.
import {computed, effect, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore} from './ours';

type Ladder = {
  read: () => number;
  setBase: (value: number) => void;
  touchUnrelated: () => void;
  runs: {count: number};
  observe?: () => () => void;
};

function oursLadder(depth: number): Ladder {
  const runs = {count: 0};
  const target: Record<string, unknown> = {base: 1, unrelated: 0};
  for (let level = 0; level < depth; level++) {
    for (const side of ['l', 'r']) {
      Object.defineProperty(target, `${side}${level}`, {
        enumerable: true,
        configurable: true,
        get(this: Record<string, number>) {
          runs.count++;
          return level === 0
            ? this.base
            : this[`l${level - 1}`] + this[`r${level - 1}`];
        },
      });
    }
  }
  const store = createClassyStore(target) as Record<string, number>;
  const top = `l${depth - 1}`;
  return {
    read: () => store[top],
    setBase: (value) => {
      store.base = value;
    },
    touchUnrelated: () => {
      store.unrelated++;
    },
    runs,
  };
}

function preactLadder(depth: number): Ladder {
  const runs = {count: 0};
  const base = signal(1);
  const unrelated = signal(0);
  let below = [base, base] as {value: number}[];
  for (let level = 0; level < depth; level++) {
    const [l, r] = below;
    const make = () =>
      computed(() => {
        runs.count++;
        return level === 0 ? base.value : l.value + r.value;
      });
    below = [make(), make()];
  }
  const top = below[0];
  return {
    read: () => top.value,
    setBase: (value) => {
      base.value = value;
    },
    touchUnrelated: () => {
      unrelated.value++;
    },
    runs,
    observe: () => effect(() => void top.value),
  };
}

function polyfillLadder(depth: number): Ladder {
  const runs = {count: 0};
  const base = new Signal.State(1);
  const unrelated = new Signal.State(0);
  let below = [base, base] as {get(): number}[];
  for (let level = 0; level < depth; level++) {
    const [l, r] = below;
    const make = () =>
      new Signal.Computed(() => {
        runs.count++;
        return level === 0 ? base.get() : l.get() + r.get();
      });
    below = [make(), make()];
  }
  const top = below[0] as Signal.Computed<number>;
  return {
    read: () => top.get(),
    setBase: (value) => base.set(value),
    touchUnrelated: () => unrelated.set(unrelated.get() + 1),
    runs,
    observe: () => {
      const watcher = new Signal.subtle.Watcher(() => {});
      watcher.watch(top);
      return () => watcher.unwatch(top);
    },
  };
}

/** Microseconds per call, averaged over `times` calls. */
function micros(times: number, run: () => void, before?: () => void): string {
  let total = 0;
  for (let i = 0; i < times; i++) {
    before?.();
    const start = performance.now();
    run();
    total += performance.now() - start;
  }
  return ((total / times) * 1000).toFixed(2).padStart(10);
}

function measure(
  name: string,
  make: (depth: number) => Ladder,
  depths: number[],
  observed: boolean,
) {
  console.log(`\n${name}${observed ? ', observed' : ''}`);
  console.log(
    'depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)',
  );
  for (const depth of depths) {
    const ladder = make(depth);
    const stop = observed ? ladder.observe?.() : undefined;
    const times =
      depth >= 16 && name === 'ours, live' && !process.env.SPIKE ? 3 : 200;
    const first = observed ? '         -' : micros(1, ladder.read);
    const firstRuns = ladder.runs.count;
    const clean = micros(times, ladder.read);
    const cleanRuns = ladder.runs.count - firstRuns;
    const unrelated = micros(times, ladder.read, ladder.touchUnrelated);
    const unrelatedRuns = ladder.runs.count - firstRuns - cleanRuns;
    let next = 1;
    const before = ladder.runs.count;
    const dirty = micros(times, ladder.read, () => ladder.setBase(++next));
    const dirtyRuns = (ladder.runs.count - before) / times;
    stop?.();
    console.log(
      String(depth).padStart(5),
      '|',
      first,
      '|',
      clean,
      '|',
      unrelated.padStart(29),
      '|',
      dirty.padStart(23),
      '|',
      `${firstRuns}, ${cleanRuns}, ${unrelatedRuns}, ${dirtyRuns} per read`,
    );
  }
}

const spike = process.env.SPIKE === '1';
measure(
  'ours, live',
  oursLadder,
  spike ? [4, 8, 12, 16, 18, 20, 200] : [4, 8, 12, 16, 18, 20],
  false,
);
if (spike) process.exit(0);
measure('Preact Signals', preactLadder, [4, 8, 12, 16, 18, 20, 200], false);
measure('Preact Signals', preactLadder, [4, 8, 12, 16, 18, 20, 200], true);
measure('signal-polyfill', polyfillLadder, [4, 8, 12, 16, 18, 20, 200], false);
measure('signal-polyfill', polyfillLadder, [4, 8, 12, 16, 18, 20, 200], true);
```

Output on the base, this pass:

```text

ours, live
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     220.33 |       3.27 |                          1.60 |                    4.57 | 7, 0, 0, 7 per read
    8 |      59.04 |      10.28 |                          7.27 |                   12.21 | 15, 0, 0, 15 per read
   12 |     379.96 |      79.32 |                         65.94 |                  105.05 | 23, 0, 0, 23 per read
   16 |    2258.54 |    1540.32 |                       1111.15 |                 1658.15 | 31, 0, 0, 31 per read
   18 |    7086.46 |    4707.40 |                       4136.67 |                 6480.60 | 35, 0, 0, 35 per read
   20 |   16926.46 |   16548.01 |                      16424.39 |                25660.64 | 39, 0, 0, 39 per read

Preact Signals
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     143.25 |       0.43 |                          0.94 |                    1.97 | 7, 0, 0, 7 per read
    8 |      16.75 |       0.07 |                          0.42 |                    1.38 | 15, 0, 0, 15 per read
   12 |       7.25 |       0.04 |                          0.60 |                    1.69 | 23, 0, 0, 23 per read
   16 |       3.04 |       0.04 |                          0.68 |                    2.13 | 31, 0, 0, 31 per read
   18 |       4.37 |       0.04 |                          0.61 |                    2.09 | 35, 0, 0, 35 per read
   20 |       2.79 |       0.04 |                          0.68 |                    2.23 | 39, 0, 0, 39 per read
  200 |     156.54 |       0.05 |                         11.58 |                   21.88 | 399, 0, 0, 399 per read

Preact Signals, observed
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |          - |       0.03 |                          0.04 |                    0.04 | 7, 0, 0, 7 per read
    8 |          - |       0.04 |                          0.04 |                    0.04 | 15, 0, 0, 15 per read
   12 |          - |       0.04 |                          0.04 |                    0.04 | 23, 0, 0, 23 per read
   16 |          - |       0.05 |                          0.04 |                    0.04 | 31, 0, 0, 31 per read
   18 |          - |       0.04 |                          0.04 |                    0.04 | 35, 0, 0, 35 per read
   20 |          - |       0.05 |                          0.05 |                    0.05 | 39, 0, 0, 39 per read
  200 |          - |       0.04 |                          0.04 |                    0.04 | 399, 0, 0, 399 per read

signal-polyfill
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     184.75 |       0.59 |                          1.25 |                    2.75 | 7, 0, 0, 7 per read
    8 |      49.62 |       0.08 |                          0.70 |                    1.78 | 15, 0, 0, 15 per read
   12 |      28.29 |       0.05 |                          0.83 |                    1.95 | 23, 0, 0, 23 per read
   16 |      18.79 |       0.06 |                          1.11 |                    4.76 | 31, 0, 0, 31 per read
   18 |      32.17 |       0.05 |                          1.05 |                    2.94 | 35, 0, 0, 35 per read
   20 |      32.00 |       0.04 |                          0.92 |                    3.99 | 39, 0, 0, 39 per read
  200 |     170.88 |       0.05 |                          9.55 |                   35.67 | 399, 0, 0, 399 per read

signal-polyfill, observed
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |          - |       0.84 |                          1.30 |                    2.75 | 0, 7, 0, 7 per read
    8 |          - |       0.28 |                          1.12 |                    2.60 | 0, 15, 0, 15 per read
   12 |          - |       0.25 |                          0.93 |                    3.19 | 0, 23, 0, 23 per read
   16 |          - |       0.15 |                          1.17 |                    4.06 | 0, 31, 0, 31 per read
   18 |          - |       0.16 |                          1.33 |                    4.55 | 0, 35, 0, 35 per read
   20 |          - |       0.18 |                          1.53 |                    5.31 | 0, 39, 0, 39 per read
  200 |          - |       0.70 |                         15.55 |                   35.93 | 0, 399, 0, 399 per read
```

### Script 02: `02-diamond.ts`

```ts
// A diamond (b and c over a, d over both), an equal-value cutoff, and a chain
// twenty levels deep. Ported from "nested getters, three levels deep" in
// core.characterisation.getters.test.ts (:81 live, :201 snapshots), widened.
import {
  batch as preactBatch,
  computed,
  effect,
  signal,
} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {batch, createClassyStore, snapshot, subscribe} from './ours';
import {effect as polyfillEffect} from './polyfill-effect';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── ours ──
{
  const runs = {b: 0, c: 0, d: 0, parity: 0, label: 0};
  const pairs: string[] = [];
  class Diamond {
    a = 1;
    get b() {
      runs.b++;
      return this.a + 1;
    }
    get c() {
      runs.c++;
      return this.a * 2;
    }
    get d() {
      runs.d++;
      pairs.push(`${this.b}/${this.c}`);
      return this.b + this.c;
    }
    get parity() {
      runs.parity++;
      return this.a % 2;
    }
    get label() {
      runs.label++;
      return this.parity ? 'odd' : 'even';
    }
    setTwice() {
      this.a = 10;
      this.a = 11;
    }
  }
  const store = createClassyStore(new Diamond());
  const seen: number[] = [];
  subscribe(store, () => seen.push(store.d), {sync: true});
  store.d;
  store.label;
  console.log('ours live      first read             ', JSON.stringify(runs));
  store.a = 3;
  store.label;
  console.log(
    'ours live      a 1 -> 3, d and label  ',
    JSON.stringify(runs),
    '| subscriber saw d =',
    seen,
  );
  store.setTwice();
  batch(() => {
    store.a = 20;
    store.a = 21;
  });
  console.log(
    'ours live      a method and a batch() ',
    JSON.stringify(runs),
    '| subscriber saw d =',
    seen,
  );
  console.log('ours live      b/c pairs seen by d    ', pairs.join(' '));

  const snapRuns = {...runs};
  const before = snapshot(store);
  before.d;
  before.label;
  store.a = 23;
  const after = snapshot(store);
  after.d;
  after.label;
  console.log(
    'ours snapshot  a 21 -> 23, d and label ',
    JSON.stringify(
      Object.fromEntries(
        Object.entries(runs).map(([key, value]) => [
          key,
          value - snapRuns[key as keyof typeof runs],
        ]),
      ),
    ),
    '(runs since the line above, two snapshots)',
  );
}

// ── Preact Signals ──
{
  const runs = {b: 0, c: 0, d: 0, parity: 0, label: 0};
  const pairs: string[] = [];
  const a = signal(1);
  const b = computed(() => (runs.b++, a.value + 1));
  const c = computed(() => (runs.c++, a.value * 2));
  const d = computed(() => {
    runs.d++;
    pairs.push(`${b.value}/${c.value}`);
    return b.value + c.value;
  });
  const parity = computed(() => (runs.parity++, a.value % 2));
  const label = computed(() => (runs.label++, parity.value ? 'odd' : 'even'));
  const seen: number[] = [];
  d.value;
  label.value;
  console.log('Preact         first read             ', JSON.stringify(runs));
  a.value = 3;
  d.value;
  label.value;
  console.log('Preact         a 1 -> 3, unobserved   ', JSON.stringify(runs));
  const stop = effect(() => void seen.push(d.value));
  const stopLabel = effect(() => void label.value);
  a.value = 5;
  console.log(
    'Preact         a 3 -> 5, in effects   ',
    JSON.stringify(runs),
    '| effect saw d =',
    seen,
  );
  preactBatch(() => {
    a.value = 20;
    a.value = 21;
  });
  console.log(
    'Preact         a batch()              ',
    JSON.stringify(runs),
    '| effect saw d =',
    seen,
  );
  console.log('Preact         b/c pairs seen by d    ', pairs.join(' '));
  stop();
  stopLabel();
}

// ── signal-polyfill ──
{
  const runs = {b: 0, c: 0, d: 0, parity: 0, label: 0};
  const pairs: string[] = [];
  const a = new Signal.State(1);
  const b = new Signal.Computed(() => (runs.b++, a.get() + 1));
  const c = new Signal.Computed(() => (runs.c++, a.get() * 2));
  const d = new Signal.Computed(() => {
    runs.d++;
    pairs.push(`${b.get()}/${c.get()}`);
    return b.get() + c.get();
  });
  const parity = new Signal.Computed(() => (runs.parity++, a.get() % 2));
  const label = new Signal.Computed(
    () => (runs.label++, parity.get() ? 'odd' : 'even'),
  );
  d.get();
  label.get();
  console.log('polyfill       first read             ', JSON.stringify(runs));
  a.set(3);
  d.get();
  label.get();
  console.log('polyfill       a 1 -> 3, unwatched    ', JSON.stringify(runs));
  const seen: number[] = [];
  const stop = polyfillEffect(() => void seen.push(d.get()));
  const stopLabel = polyfillEffect(() => void label.get());
  a.set(5);
  a.set(7);
  await tick();
  console.log(
    'polyfill       a 3 -> 5 -> 7, README effect',
    JSON.stringify(runs),
    '| effect saw d =',
    seen,
  );
  console.log('polyfill       b/c pairs seen by d    ', pairs.join(' '));
  stop();
  stopLabel();
}

// ── a chain twenty levels deep: how often does each level run? ──
{
  const depth = 20;
  const count = (list: number[]) =>
    `min ${Math.min(...list)}, max ${Math.max(...list)}, total ${list.reduce((sum, n) => sum + n, 0)}`;

  const oursRuns = new Array<number>(depth).fill(0);
  const target: Record<string, unknown> = {base: 1, other: 0};
  for (let level = 0; level < depth; level++) {
    Object.defineProperty(target, `g${level}`, {
      enumerable: true,
      configurable: true,
      get(this: Record<string, number>) {
        oursRuns[level]++;
        return level === 0 ? this.base : this[`g${level - 1}`] + 1;
      },
    });
  }
  const store = createClassyStore(target) as Record<string, number>;
  const report = (name: string, runsList: number[], value: number) =>
    console.log(
      name.padEnd(46),
      `top = ${value} | per level: ${count(runsList)}`,
    );
  report('ours live      chain of 20, first read', oursRuns, store.g19);
  report('ours live      read again', oursRuns, store.g19);
  store.other = 1;
  report('ours live      after an unrelated write', oursRuns, store.g19);
  store.base = 2;
  report('ours live      after base 1 -> 2', oursRuns, store.g19);
  report('ours snapshot  first snapshot read', oursRuns, snapshot(store).g19);
  store.other = 2;
  report(
    'ours snapshot  after an unrelated write',
    oursRuns,
    snapshot(store).g19,
  );
  store.base = 3;
  report('ours snapshot  after base 2 -> 3', oursRuns, snapshot(store).g19);
  store.other = 3;
  report(
    'ours snapshot  after another unrelated write',
    oursRuns,
    snapshot(store).g19,
  );

  const preactRuns = new Array<number>(depth).fill(0);
  const base = signal(1);
  const other = signal(0);
  let previous: {value: number} = base;
  for (let level = 0; level < depth; level++) {
    const below = previous;
    previous = computed(
      () => (preactRuns[level]++, level === 0 ? base.value : below.value + 1),
    );
  }
  const top = previous;
  report('Preact         chain of 20, first read', preactRuns, top.value);
  report('Preact         read again', preactRuns, top.value);
  other.value = 1;
  report('Preact         after an unrelated write', preactRuns, top.value);
  base.value = 2;
  report('Preact         after base 1 -> 2', preactRuns, top.value);

  const polyRuns = new Array<number>(depth).fill(0);
  const pBase = new Signal.State(1);
  const pOther = new Signal.State(0);
  let pPrevious: {get(): number} = pBase;
  for (let level = 0; level < depth; level++) {
    const below = pPrevious;
    pPrevious = new Signal.Computed(
      () => (polyRuns[level]++, level === 0 ? pBase.get() : below.get() + 1),
    );
  }
  const pTop = pPrevious;
  report('polyfill       chain of 20, first read', polyRuns, pTop.get());
  report('polyfill       read again', polyRuns, pTop.get());
  pOther.set(1);
  report('polyfill       after an unrelated write', polyRuns, pTop.get());
  pBase.set(2);
  report('polyfill       after base 1 -> 2', polyRuns, pTop.get());
}
```

Output on the base, this pass:

```text
ours live      first read              {"b":1,"c":1,"d":1,"parity":1,"label":1}
ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":2} | subscriber saw d = [
  10
]
ours live      a method and a batch()  {"b":4,"c":4,"d":4,"parity":2,"label":2} | subscriber saw d = [
  10, 34, 64
]
ours live      b/c pairs seen by d     2/2 4/6 12/22 22/42
ours snapshot  a 21 -> 23, d and label  {"b":3,"c":3,"d":3,"parity":2,"label":1} (runs since the line above, two snapshots)
Preact         first read              {"b":1,"c":1,"d":1,"parity":1,"label":1}
Preact         a 1 -> 3, unobserved    {"b":2,"c":2,"d":2,"parity":2,"label":1}
Preact         a 3 -> 5, in effects    {"b":3,"c":3,"d":3,"parity":3,"label":1} | effect saw d = [
  10, 16
]
Preact         a batch()               {"b":4,"c":4,"d":4,"parity":4,"label":1} | effect saw d = [
  10, 16, 64
]
Preact         b/c pairs seen by d     2/2 4/6 6/10 22/42
polyfill       first read              {"b":1,"c":1,"d":1,"parity":1,"label":1}
polyfill       a 1 -> 3, unwatched     {"b":2,"c":2,"d":2,"parity":2,"label":1}
polyfill       a 3 -> 5 -> 7, README effect {"b":3,"c":3,"d":3,"parity":3,"label":1} | effect saw d = [
  10, 22
]
polyfill       b/c pairs seen by d     2/2 4/6 8/14
ours live      chain of 20, first read         top = 20 | per level: min 1, max 1, total 20
ours live      read again                      top = 20 | per level: min 1, max 1, total 20
ours live      after an unrelated write        top = 20 | per level: min 1, max 1, total 20
ours live      after base 1 -> 2               top = 21 | per level: min 2, max 2, total 40
ours snapshot  first snapshot read             top = 21 | per level: min 3, max 3, total 60
ours snapshot  after an unrelated write        top = 21 | per level: min 3, max 4, total 79
ours snapshot  after base 2 -> 3               top = 22 | per level: min 4, max 5, total 99
ours snapshot  after another unrelated write   top = 22 | per level: min 4, max 5, total 99
Preact         chain of 20, first read         top = 20 | per level: min 1, max 1, total 20
Preact         read again                      top = 20 | per level: min 1, max 1, total 20
Preact         after an unrelated write        top = 20 | per level: min 1, max 1, total 20
Preact         after base 1 -> 2               top = 21 | per level: min 2, max 2, total 40
polyfill       chain of 20, first read         top = 20 | per level: min 1, max 1, total 20
polyfill       read again                      top = 20 | per level: min 1, max 1, total 20
polyfill       after an unrelated write        top = 20 | per level: min 1, max 1, total 20
polyfill       after base 1 -> 2               top = 21 | per level: min 2, max 2, total 40
```

### Script 03: `03-cycles.ts`

```ts
// Cycles between computeds. Ported from "getters that read each other in a
// cycle" in core.characterisation.getters.test.ts (:1049), plus a cycle that
// a later write breaks, to see whether the error outlives the cycle.
import {computed, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore, snapshot} from './ours';

const attempt = (run: () => unknown): string => {
  try {
    return `returned ${JSON.stringify(run())}`;
  } catch (error) {
    const e = error as Error;
    return `threw ${e.constructor.name}: ${e.message.slice(0, 90)}`;
  }
};
const line = (name: string, text: string) => console.log(name.padEnd(44), text);

// ── a plain cycle: a reads b, b reads a ──
{
  class Loop {
    get a(): number {
      return this.b + 1;
    }
    get b(): number {
      return this.a + 1;
    }
    get self(): number {
      return this.self + 1;
    }
  }
  const store = createClassyStore(new Loop());
  line(
    'ours live      a <-> b',
    attempt(() => store.a),
  );
  line(
    'ours live      a <-> b, read again',
    attempt(() => store.a),
  );
  line(
    'ours live      self',
    attempt(() => store.self),
  );
  line(
    'ours snapshot  a <-> b',
    attempt(() => snapshot(store).a),
  );

  const a: {value: number} = computed(() => b.value + 1);
  const b: {value: number} = computed(() => a.value + 1);
  const self: {value: number} = computed(() => self.value + 1);
  line(
    'Preact         a <-> b',
    attempt(() => a.value),
  );
  line(
    'Preact         a <-> b, read again',
    attempt(() => a.value),
  );
  line(
    'Preact         self',
    attempt(() => self.value),
  );

  const pa: Signal.Computed<number> = new Signal.Computed(() => pb.get() + 1);
  const pb: Signal.Computed<number> = new Signal.Computed(() => pa.get() + 1);
  const pself: Signal.Computed<number> = new Signal.Computed(
    () => pself.get() + 1,
  );
  line(
    'polyfill       a <-> b',
    attempt(() => pa.get()),
  );
  line(
    'polyfill       a <-> b, read again',
    attempt(() => pa.get()),
  );
  line(
    'polyfill       self',
    attempt(() => pself.get()),
  );
}

// ── a cycle that a write breaks: a = looped ? b : 0, b = a + 1 ──
console.log();
{
  class Breakable {
    looped = true;
    get a(): number {
      return this.looped ? this.b : 0;
    }
    get b(): number {
      return this.a + 1;
    }
  }
  const store = createClassyStore(new Breakable());
  line(
    'ours live      while looped: a',
    attempt(() => store.a),
  );
  store.looped = false;
  line(
    'ours live      after looped = false: a',
    attempt(() => store.a),
  );
  line(
    'ours live      after looped = false: b',
    attempt(() => store.b),
  );
  store.looped = true;
  line(
    'ours snapshot  while looped: a',
    attempt(() => snapshot(store).a),
  );
  store.looped = false;
  line(
    'ours snapshot  after looped = false: b',
    attempt(() => snapshot(store).b),
  );

  const looped = signal(true);
  const a: {value: number} = computed(() => (looped.value ? b.value : 0));
  const b: {value: number} = computed(() => a.value + 1);
  line(
    'Preact         while looped: a',
    attempt(() => a.value),
  );
  looped.value = false;
  line(
    'Preact         after looped = false: a',
    attempt(() => a.value),
  );
  line(
    'Preact         after looped = false: b',
    attempt(() => b.value),
  );
  looped.value = true;
  looped.value = false;
  line(
    'Preact         after another round trip: b',
    attempt(() => b.value),
  );

  const pLooped = new Signal.State(true);
  const pa: Signal.Computed<number> = new Signal.Computed(() =>
    pLooped.get() ? pb.get() : 0,
  );
  const pb: Signal.Computed<number> = new Signal.Computed(() => pa.get() + 1);
  line(
    'polyfill       while looped: a',
    attempt(() => pa.get()),
  );
  pLooped.set(false);
  line(
    'polyfill       after looped = false: a',
    attempt(() => pa.get()),
  );
  line(
    'polyfill       after looped = false: b',
    attempt(() => pb.get()),
  );
  line(
    'polyfill       sources of b',
    JSON.stringify(Signal.subtle.introspectSources(pb).length),
  );
}
```

Output on the base, this pass:

```text
ours live      a <-> b                       threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
ours live      a <-> b, read again           threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
ours live      self                          threw Error: @codebelt/classy-store: circular computed getter dependency: self → self
ours snapshot  a <-> b                       threw RangeError: Maximum call stack size exceeded.
Preact         a <-> b                       threw Error: Cycle detected
Preact         a <-> b, read again           threw Error: Cycle detected
Preact         self                          threw Error: Cycle detected
polyfill       a <-> b                       threw Error: Detected cycle in computations.
polyfill       a <-> b, read again           threw Error: Detected cycle in computations.
polyfill       self                          threw Error: Detected cycle in computations.

ours live      while looped: a               threw Error: @codebelt/classy-store: circular computed getter dependency: a → b → a
ours live      after looped = false: a       returned 0
ours live      after looped = false: b       returned 1
ours snapshot  while looped: a               threw RangeError: Maximum call stack size exceeded.
ours snapshot  after looped = false: b       returned 1
Preact         while looped: a               threw Error: Cycle detected
Preact         after looped = false: a       returned 0
Preact         after looped = false: b       threw Error: Cycle detected
Preact         after another round trip: b   threw Error: Cycle detected
polyfill       while looped: a               threw Error: Detected cycle in computations.
polyfill       after looped = false: a       returned 0
polyfill       after looped = false: b       threw Error: Detected cycle in computations.
polyfill       sources of b                  0
```

### Script 04: `04-errors.ts`

```ts
// A computed that throws and then recovers, and one that catches another's
// error. Ported from "a getter that throws" (:1160) and "a getter that catches
// the error of another getter" (:1270) in core.characterisation.getters.test.ts.
import {computed, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore, snapshot} from './ours';

const line = (name: string, text: string) => console.log(name.padEnd(40), text);

type Subject = {
  name: string;
  strict: () => string;
  safe: () => string;
  outer: () => string;
  setReady: (value: boolean) => void;
  touchOther: () => void;
  runs: {strict: number; safe: number; outer: number};
};

function exercise({
  name,
  strict,
  safe,
  outer,
  setReady,
  touchOther,
  runs,
}: Subject) {
  const errors: unknown[] = [];
  const read = (run: () => string) => {
    try {
      return run();
    } catch (error) {
      errors.push(error);
      return `threw ${(error as Error).message}`;
    }
  };
  line(
    `${name} strict, first read`,
    `${read(strict)} | runs ${JSON.stringify(runs)}`,
  );
  line(
    `${name} strict, read again`,
    `${read(strict)} | runs ${JSON.stringify(runs)} | same error object: ${errors[0] === errors[1]}`,
  );
  line(
    `${name} outer (reads strict)`,
    `${read(outer)} | runs ${JSON.stringify(runs)} | same error object: ${errors[0] === errors[2]}`,
  );
  line(
    `${name} safe (catches strict)`,
    `${read(safe)} | runs ${JSON.stringify(runs)}`,
  );
  touchOther();
  line(
    `${name} after an unrelated write`,
    `${read(strict)} | runs ${JSON.stringify(runs)} | same error object: ${errors[0] === errors[3]}`,
  );
  setReady(true);
  line(
    `${name} after ready = true: safe`,
    `${read(safe)} | runs ${JSON.stringify(runs)}`,
  );
  line(
    `${name} after ready = true: outer`,
    `${read(outer)} | strict: ${read(strict)} | runs ${JSON.stringify(runs)}`,
  );
  setReady(false);
  line(
    `${name} after ready = false: safe`,
    `${read(safe)} | outer: ${read(outer)} | runs ${JSON.stringify(runs)}`,
  );
  console.log();
}

// ── ours, live and snapshot ──
function ours(viaSnapshot: boolean) {
  const runs = {strict: 0, safe: 0, outer: 0};
  class Loader {
    ready = false;
    other = 0;
    get strict(): string {
      runs.strict++;
      if (!this.ready) throw new RangeError('not ready');
      return 'ready';
    }
    get outer(): string {
      runs.outer++;
      return `outer:${this.strict}`;
    }
    get safe(): string {
      runs.safe++;
      try {
        return this.strict;
      } catch {
        return 'fallback';
      }
    }
  }
  const store = createClassyStore(new Loader());
  const view = () => (viaSnapshot ? snapshot(store) : store);
  exercise({
    name: viaSnapshot ? 'ours snapshot ' : 'ours live     ',
    strict: () => view().strict,
    safe: () => view().safe,
    outer: () => view().outer,
    setReady: (value) => {
      store.ready = value;
    },
    touchOther: () => {
      store.other++;
    },
    runs,
  });
}
ours(false);
ours(true);

// ── Preact Signals ──
{
  const runs = {strict: 0, safe: 0, outer: 0};
  const ready = signal(false);
  const other = signal(0);
  const strict = computed(() => {
    runs.strict++;
    if (!ready.value) throw new RangeError('not ready');
    return 'ready';
  });
  const outer = computed(() => (runs.outer++, `outer:${strict.value}`));
  const safe = computed(() => {
    runs.safe++;
    try {
      return strict.value;
    } catch {
      return 'fallback';
    }
  });
  exercise({
    name: 'Preact        ',
    strict: () => strict.value,
    safe: () => safe.value,
    outer: () => outer.value,
    setReady: (value) => {
      ready.value = value;
    },
    touchOther: () => {
      other.value++;
    },
    runs,
  });
}

// ── signal-polyfill ──
{
  const runs = {strict: 0, safe: 0, outer: 0};
  const ready = new Signal.State(false);
  const other = new Signal.State(0);
  const strict = new Signal.Computed(() => {
    runs.strict++;
    if (!ready.get()) throw new RangeError('not ready');
    return 'ready';
  });
  const outer = new Signal.Computed(
    () => (runs.outer++, `outer:${strict.get()}`),
  );
  const safe = new Signal.Computed(() => {
    runs.safe++;
    try {
      return strict.get();
    } catch {
      return 'fallback';
    }
  });
  exercise({
    name: 'polyfill      ',
    strict: () => strict.get(),
    safe: () => safe.get(),
    outer: () => outer.get(),
    setReady: (value) => ready.set(value),
    touchOther: () => other.set(other.get() + 1),
    runs,
  });
}
```

Output on the base, this pass:

```text
ours live      strict, first read        threw not ready | runs {"strict":1,"safe":0,"outer":0}
ours live      strict, read again        threw not ready | runs {"strict":2,"safe":0,"outer":0} | same error object: false
ours live      outer (reads strict)      threw not ready | runs {"strict":3,"safe":0,"outer":1} | same error object: false
ours live      safe (catches strict)     fallback | runs {"strict":4,"safe":1,"outer":1}
ours live      after an unrelated write  threw not ready | runs {"strict":5,"safe":1,"outer":1} | same error object: false
ours live      after ready = true: safe  fallback | runs {"strict":5,"safe":1,"outer":1}
ours live      after ready = true: outer outer:ready | strict: ready | runs {"strict":6,"safe":1,"outer":2}
ours live      after ready = false: safe fallback | outer: threw not ready | runs {"strict":7,"safe":1,"outer":3}

ours snapshot  strict, first read        threw not ready | runs {"strict":1,"safe":0,"outer":0}
ours snapshot  strict, read again        threw not ready | runs {"strict":2,"safe":0,"outer":0} | same error object: false
ours snapshot  outer (reads strict)      threw not ready | runs {"strict":3,"safe":0,"outer":1} | same error object: false
ours snapshot  safe (catches strict)     fallback | runs {"strict":4,"safe":1,"outer":1}
ours snapshot  after an unrelated write  threw not ready | runs {"strict":5,"safe":1,"outer":1} | same error object: false
ours snapshot  after ready = true: safe  fallback | runs {"strict":5,"safe":1,"outer":1}
ours snapshot  after ready = true: outer outer:ready | strict: ready | runs {"strict":6,"safe":1,"outer":2}
ours snapshot  after ready = false: safe fallback | outer: threw not ready | runs {"strict":7,"safe":1,"outer":2}

Preact         strict, first read        threw not ready | runs {"strict":1,"safe":0,"outer":0}
Preact         strict, read again        threw not ready | runs {"strict":1,"safe":0,"outer":0} | same error object: true
Preact         outer (reads strict)      threw not ready | runs {"strict":1,"safe":0,"outer":1} | same error object: true
Preact         safe (catches strict)     fallback | runs {"strict":1,"safe":1,"outer":1}
Preact         after an unrelated write  threw not ready | runs {"strict":1,"safe":1,"outer":1} | same error object: true
Preact         after ready = true: safe  ready | runs {"strict":2,"safe":2,"outer":1}
Preact         after ready = true: outer outer:ready | strict: ready | runs {"strict":2,"safe":2,"outer":2}
Preact         after ready = false: safe fallback | outer: threw not ready | runs {"strict":3,"safe":3,"outer":3}

polyfill       strict, first read        threw not ready | runs {"strict":1,"safe":0,"outer":0}
polyfill       strict, read again        threw not ready | runs {"strict":1,"safe":0,"outer":0} | same error object: true
polyfill       outer (reads strict)      threw not ready | runs {"strict":1,"safe":0,"outer":1} | same error object: true
polyfill       safe (catches strict)     fallback | runs {"strict":1,"safe":1,"outer":1}
polyfill       after an unrelated write  threw not ready | runs {"strict":1,"safe":1,"outer":1} | same error object: true
polyfill       after ready = true: safe  ready | runs {"strict":2,"safe":2,"outer":1}
polyfill       after ready = true: outer outer:ready | strict: ready | runs {"strict":2,"safe":2,"outer":2}
polyfill       after ready = false: safe fallback | outer: threw not ready | runs {"strict":3,"safe":3,"outer":3}

```

### Script 05: `05-dynamic-deps.ts`

```ts
// A dependency that is read on one run and not on the next. Written for this
// comparison: I found no test of ours for this case by name.
import {computed, effect, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore, snapshot, subscribe} from './ours';

const line = (name: string, text: string) => console.log(name.padEnd(34), text);

type Subject = {
  name: string;
  pick: () => string;
  set: (key: 'useA' | 'a' | 'b', value: boolean | string) => void;
  runs: {pick: number};
};

function exercise({name, pick, set, runs}: Subject) {
  const steps: string[] = [];
  const step = (label: string) =>
    steps.push(`${label}: ${pick()} (${runs.pick})`);
  step('start');
  set('b', 'B2');
  step('b changed, not read');
  set('useA', false);
  step('switched to b');
  set('a', 'A2');
  step('a changed, no longer read');
  set('b', 'B3');
  step('b changed, read');
  set('useA', true);
  step('switched back');
  line(name, steps.join(' | '));
}

function ours(viaSnapshot: boolean) {
  const runs = {pick: 0};
  class Picker {
    useA = true;
    a = 'A1';
    b = 'B1';
    get pick() {
      runs.pick++;
      return this.useA ? this.a : this.b;
    }
  }
  const store = createClassyStore(new Picker());
  exercise({
    name: viaSnapshot ? 'ours snapshot' : 'ours live',
    pick: () => (viaSnapshot ? snapshot(store) : store).pick,
    set: (key, value) => {
      (store as Record<string, unknown>)[key] = value;
    },
    runs,
  });
}
ours(false);
ours(true);

{
  const runs = {pick: 0};
  const state = {useA: signal(true), a: signal('A1'), b: signal('B1')};
  const pick = computed(
    () => (runs.pick++, state.useA.value ? state.a.value : state.b.value),
  );
  exercise({
    name: 'Preact, unobserved',
    pick: () => pick.value,
    set: (key, value) => {
      (state[key] as {value: unknown}).value = value;
    },
    runs,
  });
}
{
  const runs = {pick: 0};
  const state = {useA: signal(true), a: signal('A1'), b: signal('B1')};
  const pick = computed(
    () => (runs.pick++, state.useA.value ? state.a.value : state.b.value),
  );
  let effectRuns = 0;
  const stop = effect(() => {
    effectRuns++;
    pick.value;
  });
  exercise({
    name: 'Preact, in an effect',
    pick: () => pick.value,
    set: (key, value) => {
      (state[key] as {value: unknown}).value = value;
    },
    runs,
  });
  line(
    'Preact, in an effect',
    `effect ran ${effectRuns} times for 5 writes, 2 of them to a field pick did not read at the time`,
  );
  stop();
}
{
  const runs = {pick: 0};
  const state = {
    useA: new Signal.State(true),
    a: new Signal.State('A1'),
    b: new Signal.State('B1'),
  };
  const pick = new Signal.Computed(
    () => (runs.pick++, state.useA.get() ? state.a.get() : state.b.get()),
  );
  exercise({
    name: 'polyfill, unwatched',
    pick: () => pick.get(),
    set: (key, value) => (state[key] as Signal.State<unknown>).set(value),
    runs,
  });
  line(
    'polyfill, unwatched',
    `sources after the last run: ${Signal.subtle.introspectSources(pick).length}`,
  );
}

// What a subscriber hears: ours is told about every write to the store,
// whether or not anything it reads depends on the field.
{
  class Picker {
    useA = true;
    a = 'A1';
    b = 'B1';
    get pick() {
      return this.useA ? this.a : this.b;
    }
  }
  const store = createClassyStore(new Picker());
  let calls = 0;
  subscribe(store, () => void calls++, {sync: true});
  store.b = 'B2';
  store.useA = false;
  store.a = 'A2';
  line(
    'ours, sync subscriber',
    `called ${calls} times for 3 writes, 2 of them to a field pick does not read at the time`,
  );
}
```

Output on the base, this pass:

```text
ours live                          start: A1 (1) | b changed, not read: A1 (1) | switched to b: B2 (2) | a changed, no longer read: B2 (2) | b changed, read: B3 (3) | switched back: A2 (4)
ours snapshot                      start: A1 (1) | b changed, not read: A1 (1) | switched to b: B2 (2) | a changed, no longer read: B2 (2) | b changed, read: B3 (3) | switched back: A2 (4)
Preact, unobserved                 start: A1 (1) | b changed, not read: A1 (1) | switched to b: B2 (2) | a changed, no longer read: B2 (2) | b changed, read: B3 (3) | switched back: A2 (4)
Preact, in an effect               start: A1 (1) | b changed, not read: A1 (1) | switched to b: B2 (2) | a changed, no longer read: B2 (2) | b changed, read: B3 (3) | switched back: A2 (4)
Preact, in an effect               effect ran 4 times for 5 writes, 2 of them to a field pick did not read at the time
polyfill, unwatched                start: A1 (1) | b changed, not read: A1 (1) | switched to b: B2 (2) | a changed, no longer read: B2 (2) | b changed, read: B3 (3) | switched back: A2 (4)
polyfill, unwatched                sources after the last run: 2
ours, sync subscriber              called 3 times for 3 writes, 2 of them to a field pick does not read at the time
```

### Script 06: `06-computed-writes.ts`

```ts
// A computed that writes. Ported from "a getter that writes to the store
// while it runs" in core.characterisation.getters.test.ts (:1325).
import {computed, effect, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore, snapshot, subscribe} from './ours';

const line = (name: string, text: string) => console.log(name.padEnd(46), text);
const attempt = (run: () => unknown): string => {
  try {
    return JSON.stringify(run());
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
};

// ── writes a field it does not read ──
{
  const runs = {doubled: 0};
  class Counter {
    count = 1;
    reads = 0;
    get doubled() {
      runs.doubled++;
      this.reads = runs.doubled;
      return this.count * 2;
    }
  }
  const store = createClassyStore(new Counter());
  let calls = 0;
  subscribe(store, () => void calls++, {sync: true});
  const values = [store.doubled, store.doubled, store.doubled];
  line(
    'ours live      writes another field',
    `values ${JSON.stringify(values)} | runs ${runs.doubled} | reads field ${store.reads} | subscriber calls ${calls}`,
  );
  const snap = snapshot(store);
  const before = runs.doubled;
  line(
    'ours snapshot  writes another field',
    `${attempt(() => [snap.doubled, snap.doubled])} | runs ${runs.doubled - before}, and the body wrote ${runs.doubled} | reads field on the snapshot ${snap.reads}, on the store ${store.reads}`,
  );
}
{
  const runs = {doubled: 0};
  const count = signal(1);
  const reads = signal(0);
  const doubled = computed(() => {
    runs.doubled++;
    reads.value = runs.doubled;
    return count.value * 2;
  });
  let effectRuns = 0;
  const stop = effect(() => void (reads.value, effectRuns++));
  const values = [doubled.value, doubled.value, doubled.value];
  line(
    'Preact         writes another signal',
    `values ${JSON.stringify(values)} | runs ${runs.doubled} | reads signal ${reads.value} | effect runs ${effectRuns}`,
  );
  stop();
}
{
  const runs = {doubled: 0};
  const count = new Signal.State(1);
  const reads = new Signal.State(0);
  const doubled = new Signal.Computed(() => {
    runs.doubled++;
    reads.set(runs.doubled);
    return count.get() * 2;
  });
  const values = [doubled.get(), doubled.get(), doubled.get()];
  line(
    'polyfill       writes another signal',
    `values ${JSON.stringify(values)} | runs ${runs.doubled} | reads signal ${reads.get()}`,
  );
}

// ── writes the field it reads ──
console.log();
{
  const runs = {next: 0};
  class Ticker {
    n = 0;
    get next() {
      runs.next++;
      this.n = this.n + 1;
      return this.n;
    }
  }
  const store = createClassyStore(new Ticker());
  let calls = 0;
  subscribe(store, () => void calls++, {sync: true});
  const values = [store.next, store.next, store.next];
  line(
    'ours live      writes what it reads',
    `values ${JSON.stringify(values)} | runs ${runs.next} | n ${store.n} | subscriber calls ${calls}`,
  );
  const store2 = createClassyStore(new Ticker());
  const snap = snapshot(store2);
  line(
    'ours snapshot  writes what it reads',
    `${attempt(() => [snap.next, snap.next])} | n on the snapshot ${snap.n}, on the store ${store2.n}`,
  );
}
{
  const runs = {next: 0};
  const n = signal(0);
  const next = computed(() => {
    runs.next++;
    n.value = n.value + 1;
    return n.value;
  });
  const values = [next.value, next.value, next.value];
  line(
    'Preact         writes what it reads',
    `values ${JSON.stringify(values)} | runs ${runs.next} | n ${n.value}`,
  );
  line(
    'Preact         the same, read by an effect',
    attempt(() => {
      const stop = effect(() => void next.value);
      stop();
      return `no error | runs ${runs.next} | n ${n.value}`;
    }),
  );
}
{
  const runs = {next: 0};
  const n = new Signal.State(0);
  const next = new Signal.Computed(() => {
    runs.next++;
    n.set(n.get() + 1);
    return n.get();
  });
  const values = [next.get(), next.get(), next.get()];
  line(
    'polyfill       writes what it reads',
    `values ${JSON.stringify(values)} | runs ${runs.next} | n ${n.get()}`,
  );
  const watcher = new Signal.subtle.Watcher(() => {});
  watcher.watch(next);
  line(
    'polyfill       the same, watched',
    attempt(() => [next.get(), next.get()]) +
      ` | runs ${runs.next} | n ${n.get()}`,
  );
}
```

Output on the base, this pass:

```text
ours live      writes another field            values [2,2,2] | runs 1 | reads field 1 | subscriber calls 1
ours snapshot  writes another field            [2,2] | runs 1, and the body wrote 2 | reads field on the snapshot 1, on the store 1
Preact         writes another signal           values [2,2,2] | runs 1 | reads signal 1 | effect runs 2
polyfill       writes another signal           values [2,2,2] | runs 1 | reads signal 1

ours live      writes what it reads            values [1,2,3] | runs 3 | n 3 | subscriber calls 3
ours snapshot  writes what it reads            [0,0] | n on the snapshot 0, on the store 0
Preact         writes what it reads            values [1,2,3] | runs 3 | n 3
Preact         the same, read by an effect     threw Error: Cycle detected
polyfill       writes what it reads            values [1,1,1] | runs 1 | n 1
polyfill       the same, watched               [1,1] | runs 1 | n 1
```

### Script 07: `07-effect-writes.ts`

```ts
// A subscriber that writes to what it reads, and what happens to the others.
// Ported from "a write made inside a sync subscriber" (:501), "a subscriber
// that throws" (:833) and "unsubscribing during delivery" (:1148) in
// core.characterisation.notifications.test.ts.
import {effect, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore, subscribe} from './ours';
import {flushes, effect as polyfillEffect} from './polyfill-effect';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const line = (name: string, text: string) => console.log(name.padEnd(48), text);
const attempt = (run: () => unknown): string => {
  try {
    const value = run();
    return value === undefined ? 'no error' : String(value);
  } catch (error) {
    return `threw ${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
};
const consoleErrors: string[] = [];
const realError = console.error;
console.error = (...args: unknown[]) =>
  void consoleErrors.push(
    String((args[0] as Error)?.message ?? args[0]).slice(0, 60),
  );

// ── a subscriber that writes until a limit: converges ──
{
  const store = createClassyStore({n: 0});
  const seen: number[] = [];
  subscribe(
    store,
    () => {
      seen.push(store.n);
      if (store.n < 3) store.n++;
    },
    {sync: true},
  );
  store.n = 1;
  line(
    'ours sync      writes until n is 3',
    `seen ${JSON.stringify(seen)} | n ${store.n}`,
  );

  const n = signal(0);
  const pSeen: number[] = [];
  const stop = effect(() => {
    pSeen.push(n.value);
    if (n.value > 0 && n.value < 3) n.value++;
  });
  n.value = 1;
  line(
    'Preact effect  writes until n is 3',
    `seen ${JSON.stringify(pSeen)} | n ${n.value}`,
  );
  stop();
}

// ── a subscriber that always writes ──
{
  const store = createClassyStore({n: 0});
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
      store.n++;
    },
    {sync: true},
  );
  line(
    'ours sync      always writes',
    `${attempt(() => {
      store.n = 1;
    })} at the write | calls ${calls} | n ${store.n} | console.error: ${JSON.stringify(consoleErrors)}`,
  );
  consoleErrors.length = 0;

  const n = signal(0);
  let runs = 0;
  line(
    'Preact effect  always writes, at creation',
    `${attempt(() => {
      effect(() => {
        runs++;
        n.value = n.value + 1;
      });
    })} | runs ${runs} | n ${n.value}`,
  );

  const m = signal(0);
  let mRuns = 0;
  const stop = effect(() => {
    mRuns++;
    if (m.value > 0) m.value = m.value + 1;
  });
  line(
    'Preact effect  always writes, after a write',
    `${attempt(() => {
      m.value = 1;
    })} at the write | runs ${mRuns} | m ${m.value}`,
  );
  line(
    'Preact effect  the next write',
    `${attempt(() => {
      m.value = 1000;
    })} | runs ${mRuns} | m ${m.value}`,
  );
  stop();
}

// ── the polyfill: a Watcher may not read or write ──
{
  const state = new Signal.State(0);
  const other = new Signal.State(0);
  const derived = new Signal.Computed(() => state.get() * 2);
  let secondCalled = 0;
  const writing = new Signal.subtle.Watcher(() => other.set(1));
  const second = new Signal.subtle.Watcher(() => void secondCalled++);
  writing.watch(derived);
  second.watch(derived);
  derived.get();
  line(
    'polyfill       Watcher that writes',
    `${attempt(() => state.set(1))} at the write | state ${state.get()} | second watcher called ${secondCalled}`,
  );
  writing.unwatch(derived);
  second.unwatch(derived);

  const reading = new Signal.subtle.Watcher(() => void derived.get());
  reading.watch(derived);
  derived.get();
  line(
    'polyfill       Watcher that reads',
    `${attempt(() => state.set(2))} at the write | state ${state.get()}`,
  );
  reading.unwatch(derived);

  // The README effect runs in a microtask, so a write inside it is allowed.
  const n = new Signal.State(0);
  let runs = 0;
  const stop = polyfillEffect(() => {
    runs++;
    n.set(n.get() + 1);
  });
  await tick();
  line(
    'polyfill       README effect, writes what it reads',
    `runs ${runs} | n ${n.get()} | microtask flushes ${flushes.count}`,
  );
  stop();
}

// ── a subscriber that throws: who hears about it, and does the next one run? ──
console.log();
{
  const store = createClassyStore({n: 0});
  let second = 0;
  subscribe(
    store,
    () => {
      throw new Error('first subscriber failed');
    },
    {sync: true},
  );
  subscribe(store, () => void second++, {sync: true});
  line(
    'ours sync      first subscriber throws',
    `${attempt(() => {
      store.n = 1;
    })} at the write | second called ${second} | console.error: ${JSON.stringify(consoleErrors)}`,
  );
  consoleErrors.length = 0;

  const n = signal(0);
  let pSecond = 0;
  const stopA = effect(() => {
    if (n.value > 0) throw new Error('first effect failed');
  });
  const stopB = effect(() => void (n.value, pSecond++));
  line(
    'Preact         first effect throws',
    `${attempt(() => {
      n.value = 1;
    })} at the write | n ${n.value} | second ran ${pSecond - 1} | console.error: ${JSON.stringify(consoleErrors)}`,
  );
  line(
    'Preact         the next write',
    `${attempt(() => {
      n.value = 2;
    })} at the write | second ran ${pSecond - 1}`,
  );
  stopA();
  stopB();
}

// ── a subscriber removed by an earlier one, and a re-entrant write ──
console.log();
{
  const store = createClassyStore({n: 0});
  const calls: string[] = [];
  const stopSecond: {run?: () => void} = {};
  subscribe(
    store,
    () => {
      calls.push('first');
      stopSecond.run?.();
    },
    {sync: true},
  );
  stopSecond.run = subscribe(store, () => void calls.push('second'), {
    sync: true,
  });
  store.n = 1;
  line('ours sync      second removed by first', JSON.stringify(calls));

  const n = signal(0);
  const pCalls: string[] = [];
  const pStop: {run?: () => void} = {};
  effect(() => {
    pCalls.push('first');
    if (n.value > 0) pStop.run?.();
  });
  pStop.run = effect(() => void (n.value, pCalls.push('second')));
  pCalls.length = 0;
  n.value = 1;
  line('Preact         second removed by first', JSON.stringify(pCalls));
}
{
  const store = createClassyStore({n: 0});
  const calls: string[] = [];
  subscribe(
    store,
    () => {
      calls.push(`first:${store.n}`);
      if (store.n === 1) store.n = 2;
    },
    {sync: true},
  );
  subscribe(store, () => void calls.push(`second:${store.n}`), {sync: true});
  store.n = 1;
  line('ours sync      re-entrant write', JSON.stringify(calls));

  const n = signal(0);
  const pCalls: string[] = [];
  effect(() => {
    pCalls.push(`first:${n.value}`);
    if (n.value === 1) n.value = 2;
  });
  effect(() => void pCalls.push(`second:${n.value}`));
  pCalls.length = 0;
  n.value = 1;
  line('Preact         re-entrant write', JSON.stringify(pCalls));
}
console.error = realError;
```

Output on the base, this pass:

```text
ours sync      writes until n is 3               seen [1,2,3] | n 3
Preact effect  writes until n is 3               seen [0,1,2,3] | n 3
ours sync      always writes                     no error at the write | calls 3017 | n 3018 | console.error: ["Maximum call stack size exceeded."]
Preact effect  always writes, at creation        threw Error: Cycle detected | runs 102 | n 101
Preact effect  always writes, after a write      threw Error: Cycle detected at the write | runs 102 | m 101
Preact effect  the next write                    threw Error: Cycle detected | runs 203 | m 1100
polyfill       Watcher that writes               threw Error: Writes to signals not permitted during Watcher callback at the write | state 1 | second watcher called 0
polyfill       Watcher that reads                threw Error:  at the write | state 2
polyfill       README effect, writes what it reads runs 1 | n 1 | microtask flushes 0

ours sync      first subscriber throws           no error at the write | second called 1 | console.error: ["first subscriber failed"]
Preact         first effect throws               threw Error: first effect failed at the write | n 1 | second ran 1 | console.error: []
Preact         the next write                    threw Error: first effect failed at the write | second ran 2

ours sync      second removed by first           ["first","second"]
Preact         second removed by first           ["first"]
ours sync      re-entrant write                  ["first:1","first:2","second:2","second:2"]
Preact         re-entrant write                  ["first:1","second:2","first:2"]
```

### Script 08: `08-batching.ts`

```ts
// Batching, and when subscribers run. Ported from "transactions" (:10) and
// "batch()" (:237) in core.transactions.test.ts, and "subscribing or
// unsubscribing between a write and its delivery" (:414) in
// core.characterisation.notifications.test.ts.
import {
  action,
  batch as preactBatch,
  computed,
  createModel,
  effect,
  signal,
} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {batch, createClassyStore, snapshot, subscribe} from './ours';

const line = (name: string, text: string) => console.log(name.padEnd(50), text);
const attempt = (run: () => unknown): string => {
  try {
    run();
    return 'no error';
  } catch (error) {
    return `threw ${(error as Error).message}`;
  }
};

class Cart {
  price = 10;
  quantity = 1;
  get total() {
    return this.price * this.quantity;
  }
  restock() {
    this.price = 20;
    this.quantity = 3;
  }
}

// ── three ways to write two fields ──
{
  const store = createClassyStore(new Cart());
  const seen: number[] = [];
  subscribe(store, () => void seen.push(store.total), {sync: true});
  store.price = 5;
  store.quantity = 2;
  const direct = seen.splice(0);
  batch(() => {
    store.price = 7;
    seen.push(-store.total);
    store.quantity = 4;
  });
  const batched = seen.splice(0);
  store.restock();
  line(
    'ours sync      two direct writes',
    `subscriber saw total ${JSON.stringify(direct)}`,
  );
  line(
    'ours sync      batch(), total read inside',
    `saw ${JSON.stringify(batched)} (negative: read inside the batch)`,
  );
  line('ours sync      a method', `saw ${JSON.stringify(seen)}`);

  const price = signal(10);
  const quantity = signal(1);
  const total = computed(() => price.value * quantity.value);
  const pSeen: number[] = [];
  effect(() => void pSeen.push(total.value));
  pSeen.length = 0;
  price.value = 5;
  quantity.value = 2;
  const pDirect = pSeen.splice(0);
  preactBatch(() => {
    price.value = 7;
    pSeen.push(-total.value);
    quantity.value = 4;
  });
  const pBatched = pSeen.splice(0);
  const restock = action(() => {
    price.value = 20;
    quantity.value = 3;
  });
  restock();
  line(
    'Preact         two direct writes',
    `effect saw total ${JSON.stringify(pDirect)}`,
  );
  line(
    'Preact         batch(), total read inside',
    `saw ${JSON.stringify(pBatched)} (negative: read inside the batch)`,
  );
  line('Preact         an action', `saw ${JSON.stringify(pSeen)}`);

  // createModel wraps every method of the model as an action.
  const CartModel = createModel(() => {
    const p = signal(10);
    const q = signal(1);
    return {
      p,
      q,
      total: computed(() => p.value * q.value),
      restock() {
        p.value = 20;
        q.value = 3;
      },
    };
  });
  const model = new CartModel();
  const mSeen: number[] = [];
  effect(() => void mSeen.push(model.total.value));
  mSeen.length = 0;
  model.restock();
  line('Preact         a createModel method', `saw ${JSON.stringify(mSeen)}`);

  const sPrice = new Signal.State(10);
  const sQuantity = new Signal.State(1);
  const sTotal = new Signal.Computed(() => sPrice.get() * sQuantity.get());
  let notified = 0;
  const watcher = new Signal.subtle.Watcher(() => void notified++);
  watcher.watch(sTotal);
  sTotal.get();
  sPrice.set(5);
  sQuantity.set(2);
  const afterTwo = notified;
  watcher.watch();
  sPrice.set(6);
  const afterRearm = notified;
  const read = sTotal.get();
  watcher.watch();
  sPrice.set(7);
  line(
    'polyfill       two direct writes',
    `Watcher notified ${afterTwo} time | after watch() alone, a write notified ${afterRearm - afterTwo} | after a read (${read}) and watch(), a write notified ${notified - afterRearm}`,
  );
}

// ── a write that is undone inside the same batch ──
console.log();
{
  const store = createClassyStore(new Cart());
  let calls = 0;
  subscribe(store, () => void calls++, {sync: true});
  const before = snapshot(store);
  batch(() => {
    store.price = 99;
    store.price = 10;
  });
  const after = snapshot(store);
  line(
    'ours sync      set and set back in a batch',
    `subscriber calls ${calls} | same snapshot object: ${before === after} | equal content: ${JSON.stringify(before) === JSON.stringify(after)}`,
  );

  const price = signal(10);
  let runs = 0;
  let doubledRuns = 0;
  const doubled = computed(() => (doubledRuns++, price.value * 2));
  effect(() => void (doubled.value, runs++));
  preactBatch(() => {
    price.value = 99;
    price.value = 10;
  });
  line(
    'Preact         set and set back in a batch',
    `effect runs after the first ${runs - 1} | computed runs after the first ${doubledRuns - 1}`,
  );
  price.value = 99;
  price.value = 10;
  line(
    'Preact         the same without a batch',
    `effect runs after the first ${runs - 1} | computed runs after the first ${doubledRuns - 1}`,
  );
}

// ── a batch that throws ──
console.log();
{
  const store = createClassyStore(new Cart());
  const seen: number[] = [];
  subscribe(store, () => void seen.push(store.total), {sync: true});
  const result = attempt(() =>
    batch(() => {
      store.price = 7;
      throw new Error('stop');
    }),
  );
  line(
    'ours sync      batch() that throws',
    `${result} | price ${store.price} | subscriber saw ${JSON.stringify(seen)}`,
  );

  const price = signal(10);
  const pSeen: number[] = [];
  effect(() => void pSeen.push(price.value));
  pSeen.length = 0;
  const pResult = attempt(() =>
    preactBatch(() => {
      price.value = 7;
      throw new Error('stop');
    }),
  );
  line(
    'Preact         batch() that throws',
    `${pResult} | price ${price.value} | effect saw ${JSON.stringify(pSeen)}`,
  );
}

// ── a subscriber added inside a batch, after a write ──
console.log();
{
  const store = createClassyStore(new Cart());
  let early = 0;
  let late = 0;
  subscribe(store, () => void early++, {sync: true});
  batch(() => {
    store.price = 7;
    subscribe(store, () => void late++, {sync: true});
  });
  line(
    'ours sync      subscriber added after the write',
    `early calls ${early} | late calls ${late}`,
  );

  const price = signal(10);
  const earlySeen: number[] = [];
  const lateSeen: number[] = [];
  effect(() => void earlySeen.push(price.value));
  preactBatch(() => {
    price.value = 7;
    effect(() => void lateSeen.push(price.value));
  });
  line(
    'Preact         effect added after the write',
    `early saw ${JSON.stringify(earlySeen)} | late saw ${JSON.stringify(lateSeen)}`,
  );
  const subSeen: number[] = [];
  preactBatch(() => {
    price.value = 8;
    price.subscribe((value) => void subSeen.push(value));
  });
  line(
    'Preact         signal.subscribe() added after',
    `saw ${JSON.stringify(subSeen)}`,
  );
}
```

Output on the base, this pass:

```text
ours sync      two direct writes                   subscriber saw total [5,10]
ours sync      batch(), total read inside          saw [-14,28] (negative: read inside the batch)
ours sync      a method                            saw [60]
Preact         two direct writes                   effect saw total [5,10]
Preact         batch(), total read inside          saw [-14,28] (negative: read inside the batch)
Preact         an action                           saw [60]
Preact         a createModel method                saw [60]
polyfill       two direct writes                   Watcher notified 1 time | after watch() alone, a write notified 0 | after a read (12) and watch(), a write notified 1

ours sync      set and set back in a batch         subscriber calls 1 | same snapshot object: false | equal content: true
Preact         set and set back in a batch         effect runs after the first 0 | computed runs after the first 0
Preact         the same without a batch            effect runs after the first 2 | computed runs after the first 2

ours sync      batch() that throws                 threw stop | price 7 | subscriber saw [7]
Preact         batch() that throws                 threw stop | price 7 | effect saw [7]

ours sync      subscriber added after the write    early calls 1 | late calls 1
Preact         effect added after the write        early saw [10,7] | late saw [7]
Preact         signal.subscribe() added after      saw [8]
```

### Script 09: `09-reads-per-dependency.ts`

```ts
// A measurement, not a port: what a clean read costs when the body reads the
// same field many times. `loop` reads `this.rows` on every pass; `hoisted`
// reads it once. Both give the same total.
import {computed, signal} from '@preact/signals-core';
import {Signal} from 'signal-polyfill';
import {createClassyStore} from './ours';

const ROWS = 1000;
const makeRows = () => Array.from({length: ROWS}, (_, i) => ({price: i}));

function micros(times: number, run: () => void, before?: () => void): string {
  let total = 0;
  for (let i = 0; i < times; i++) {
    before?.();
    const start = performance.now();
    run();
    total += performance.now() - start;
  }
  return `${((total / times) * 1000).toFixed(2)} us`.padStart(11);
}
const line = (name: string, ...cells: string[]) =>
  console.log(name.padEnd(30), cells.join(' | '));

console.log(
  `${ROWS} rows                      first read  | clean read  | read after an unrelated write`,
);
{
  class Table {
    rows = makeRows();
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
  const store = createClassyStore(new Table());
  for (const key of ['loop', 'hoisted'] as const) {
    line(
      `ours live, ${key}`,
      micros(1, () => void store[key]),
      micros(2000, () => void store[key]),
      micros(
        2000,
        () => void store[key],
        () => void store.other++,
      ),
    );
  }
}
{
  const rows = signal(makeRows());
  const other = signal(0);
  const loop = computed(() => {
    let sum = 0;
    for (let i = 0; i < rows.value.length; i++) sum += rows.value[i].price;
    return sum;
  });
  line(
    'Preact, loop',
    micros(1, () => void loop.value),
    micros(2000, () => void loop.value),
    micros(
      2000,
      () => void loop.value,
      () => void other.value++,
    ),
  );
}
{
  const rows = new Signal.State(makeRows());
  const other = new Signal.State(0);
  const loop = new Signal.Computed(() => {
    let sum = 0;
    for (let i = 0; i < rows.get().length; i++) sum += rows.get()[i].price;
    return sum;
  });
  line(
    'polyfill, loop',
    micros(1, () => void loop.get()),
    micros(2000, () => void loop.get()),
    micros(
      2000,
      () => void loop.get(),
      () => other.set(other.get() + 1),
    ),
  );
  console.log(
    'polyfill, loop: recorded sources',
    Signal.subtle.introspectSources(loop).length,
  );
}
```

Output on the base, this pass:

```text
1000 rows                      first read  | clean read  | read after an unrelated write
ours live, loop                 1204.38 us |    26.80 us |    25.96 us
ours live, hoisted               330.33 us |     0.12 us |     0.14 us
Preact, loop                     327.46 us |     0.16 us |     0.12 us
polyfill, loop                   576.67 us |     0.12 us |    12.46 us
polyfill, loop: recorded sources 2001
```

### Script 10: `10-single-getter.ts`

```ts
// A measurement, not a port: the everyday case. One getter over three fields,
// read when nothing changed, after an unrelated write, and after a write to a
// field it reads. Nanoseconds per read, best of five rounds of 500,000 reads.
import {createClassyStore} from './ours';

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
const READS = 500_000;
let sink = 0;

function best(run: () => void): string {
  let fastest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    run();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return `${((fastest * 1e6) / READS).toFixed(0)} ns`.padStart(7);
}

const field = best(() => {
  for (let i = 0; i < READS; i++) sink += store.price;
});
const clean = best(() => {
  for (let i = 0; i < READS; i++) sink += store.total;
});
const unrelated = best(() => {
  for (let i = 0; i < READS; i++) {
    store.other = i;
    sink += store.total;
  }
});
const writeOnly = best(() => {
  for (let i = 0; i < READS; i++) store.other = i + 1;
});
const dirty = best(() => {
  for (let i = 0; i < READS; i++) {
    store.price = i;
    sink += store.total;
  }
});
console.log(
  `field read ${field} | getter, clean ${clean} | write alone ${writeOnly} | write to another field + getter ${unrelated} | write to a field it reads + getter ${dirty}`,
  sink > 0 ? '' : '',
);
```

Output on the base, this pass:

```text
field read   24 ns | getter, clean   61 ns | write alone  141 ns | write to another field + getter  206 ns | write to a field it reads + getter  316 ns 
```

### Probe: `probe-first.ts`

```ts
// A getter that returns a store node, read by another getter.
import {createClassyStore} from './ours';

class Table {
  rows = [{price: 1}];
  get first() {
    return this.rows[0];
  }
  get firstPrice() {
    return this.first.price;
  }
  get missing() {
    return (this as unknown as {later?: number}).later ?? {fallback: true};
  }
}
const store = createClassyStore(new Table());
const before = store.firstPrice;
store.rows[0].price = 2;
console.log(
  'firstPrice before and after the row changed:',
  before,
  store.firstPrice,
);
const a = store.missing;
console.log(
  'a getter over a missing property returns the same object twice:',
  a === store.missing,
);
(store as unknown as {later?: number}).later = 5;
console.log('and sees the property once it exists:', store.missing);
```

Output on `spike-base`:

```text
firstPrice before and after the row changed: 1 2
a getter over a missing property returns the same object twice: false
and sees the property once it exists: 5
```

Output on `spike-refresh`:

```text
firstPrice before and after the row changed: 1 1
a getter over a missing property returns the same object twice: true
and sees the property once it exists: 5
```

Output on `spike-one`:

```text
firstPrice before and after the row changed: 1 2
a getter over a missing property returns the same object twice: true
and sees the property once it exists: 5
```

### Spike outputs

`01-ladder.spike-stamp` (previous run of this task):

```text

ours, live
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     173.75 |       0.84 |                          2.07 |                    3.94 | 7, 0, 0, 7 per read
    8 |      29.46 |       0.21 |                          1.64 |                    5.68 | 15, 0, 0, 15 per read
   12 |      25.92 |       0.09 |                          0.76 |                    6.52 | 23, 0, 0, 23 per read
   16 |      13.54 |       0.08 |                          0.99 |                   10.60 | 31, 0, 0, 31 per read
   18 |      10.00 |       0.06 |                          1.06 |                   13.57 | 35, 0, 0, 35 per read
   20 |      16.00 |       0.06 |                          1.40 |                   11.86 | 39, 0, 0, 39 per read
  200 |     437.12 |       0.09 |                         21.46 |                  832.34 | 399, 0, 0, 399 per read
```

`01-ladder.spike-refresh` (previous run of this task):

```text

ours, live
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     168.33 |       0.88 |                          3.81 |                    4.22 | 7, 0, 0, 7 per read
    8 |      24.79 |       0.23 |                          4.36 |                    4.76 | 15, 0, 0, 15 per read
   12 |      25.46 |       0.09 |                          5.60 |                    5.76 | 23, 0, 0, 23 per read
   16 |      19.08 |       0.09 |                          4.19 |                   11.10 | 31, 0, 0, 31 per read
   18 |      24.54 |       0.06 |                          4.53 |                    8.75 | 35, 0, 0, 35 per read
   20 |      23.13 |       0.06 |                          5.02 |                   12.42 | 39, 0, 0, 39 per read
  200 |     451.42 |       0.12 |                         73.55 |                  169.47 | 399, 0, 0, 399 per read
```

`01-ladder.spike-one` (previous run of this task):

```text

ours, live
depth | first read | clean read | read after an unrelated write | read after base changed | bodies run: first, clean, unrelated, base   (times in microseconds)
    4 |     181.08 |       1.01 |                          3.60 |                    4.63 | 7, 0, 0, 7 per read
    8 |      23.79 |       0.21 |                          2.41 |                    5.22 | 15, 0, 0, 15 per read
   12 |      24.87 |       0.09 |                          3.77 |                   10.18 | 23, 0, 0, 23 per read
   16 |      18.63 |       0.10 |                          3.91 |                    8.44 | 31, 0, 0, 31 per read
   18 |      28.79 |       0.07 |                          6.68 |                    9.65 | 35, 0, 0, 35 per read
   20 |      17.46 |       0.07 |                          4.25 |                   12.00 | 39, 0, 0, 39 per read
  200 |     380.79 |       0.13 |                         70.53 |                  183.61 | 399, 0, 0, 399 per read
```

`09.spike-stamp` (previous run of this task):

```text
1000 rows                      first read  | clean read  | read after an unrelated write
ours live, loop                 1309.33 us |     0.24 us |    27.60 us
ours live, hoisted               368.04 us |     0.12 us |     0.15 us
```

`09.spike-refresh` (previous run of this task):

```text
1000 rows                      first read  | clean read  | read after an unrelated write
ours live, loop                 1263.00 us |     0.27 us |    27.56 us
ours live, hoisted               368.42 us |     0.11 us |     0.14 us
```

`09.spike-one` (previous run of this task):

```text
1000 rows                      first read  | clean read  | read after an unrelated write
ours live, loop                 1237.08 us |     0.26 us |     0.39 us
ours live, hoisted               356.88 us |     0.13 us |     0.19 us
```

`10.spike-base` (previous run of this task):

```text
field read   23 ns | getter, clean   68 ns | write alone  138 ns | write to another field + getter  214 ns | write to a field it reads + getter  314 ns
```

`10.spike-stamp` (previous run of this task):

```text
field read   23 ns | getter, clean   46 ns | write alone  145 ns | write to another field + getter  238 ns | write to a field it reads + getter  321 ns
```

`10.spike-refresh` (previous run of this task):

```text
field read   24 ns | getter, clean   46 ns | write alone  150 ns | write to another field + getter  241 ns | write to a field it reads + getter  328 ns
```

`10.spike-one` (previous run of this task):

```text
field read   23 ns | getter, clean   48 ns | write alone  146 ns | write to another field + getter  300 ns | write to a field it reads + getter  380 ns
```

Ports 02 to 08 on `spike-refresh`, lines that differ from the base (`<` base, `>` spike); `spike-stamp` gave no difference:

```text
< ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":2} | subscriber saw d = [
> ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":1} | subscriber saw d = [
< ours live      a method and a batch()  {"b":4,"c":4,"d":4,"parity":2,"label":2} | subscriber saw d = [
> ours live      a method and a batch()  {"b":4,"c":4,"d":4,"parity":2,"label":1} | subscriber saw d = [
< ours live      after ready = false: safe fallback | outer: threw not ready | runs {"strict":7,"safe":1,"outer":3}
> ours live      after ready = false: safe fallback | outer: threw not ready | runs {"strict":8,"safe":1,"outer":3}
```

Ports 02 to 08 on `spike-one`, lines that differ from the base (`<` base, `>` spike); `spike-stamp` gave no difference:

```text
< ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":2} | subscriber saw d = [
> ours live      a 1 -> 3, d and label   {"b":2,"c":2,"d":2,"parity":2,"label":1} | subscriber saw d = [
< ours live      a method and a batch()  {"b":4,"c":4,"d":4,"parity":2,"label":2} | subscriber saw d = [
> ours live      a method and a batch()  {"b":4,"c":4,"d":4,"parity":2,"label":1} | subscriber saw d = [
< ours live      after ready = true: safe  fallback | runs {"strict":5,"safe":1,"outer":1}
< ours live      after ready = true: outer outer:ready | strict: ready | runs {"strict":6,"safe":1,"outer":2}
< ours live      after ready = false: safe fallback | outer: threw not ready | runs {"strict":7,"safe":1,"outer":3}
> ours live      after ready = true: safe  ready | runs {"strict":6,"safe":2,"outer":1}
> ours live      after ready = true: outer outer:ready | strict: ready | runs {"strict":6,"safe":2,"outer":2}
> ours live      after ready = false: safe fallback | outer: threw not ready | runs {"strict":10,"safe":3,"outer":3}
```

### Spike diffs

`spike-stamp`

```diff
--- core.types.ts
+++ core.types.ts (spike-stamp)
@@ -30,4 +30,6 @@
 export type ComputedEntry = {
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE: the owning node's version when this entry was last found valid. */
+  stamp: number;
 };
--- core.ts
+++ core.ts (spike-stamp)
@@ -138,7 +138,11 @@
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
       if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
+      // SPIKE: validate a nested getter once per version of its node.
+      if (cached.stamp !== dep.internal.version) {
+        if (!areDepsValid(cached.deps)) return false; // nested deps changed
+        cached.stamp = dep.internal.version;
+      }
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
       // Check that the property still exists — if it was deleted and
@@ -164,8 +168,13 @@
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
+  if (cached) {
+    // SPIKE: nothing under this node was written since the last check.
+    if (cached.stamp === internal.version) return cached.value;
+    if (areDepsValid(cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
   }
 
   // Cycle detection: if this (internal, prop) pair is already being
@@ -187,8 +196,10 @@
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
   try {
+    // SPIKE: taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
```

`spike-refresh`

```diff
--- core.types.ts
+++ core.types.ts (spike-refresh)
@@ -30,4 +30,6 @@
 export type ComputedEntry = {
   value: unknown;
   deps: DepEntry[];
+  /** SPIKE: the owning node's version when this entry was last found valid. */
+  stamp: number;
 };
--- core.ts
+++ core.ts (spike-refresh)
@@ -68,6 +68,13 @@
   deps: DepEntry[];
 }[] = [];
 
+/** SPIKE: a frame that records nothing, pushed while a dependency is refreshed. */
+const VALIDATING = {
+  internal: null as unknown as StoreInternal,
+  prop: Symbol('validating'),
+  deps: [] as DepEntry[],
+};
+
 /** Returns the tracker currently recording deps, or `null` if none is active. */
 function activeTracker() {
   return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
@@ -136,10 +143,18 @@
       if (dep.internal.version !== dep.version) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
-      const cached = dep.internal.computedCache.get(dep.prop);
-      if (!cached) return false; // no cache → must recompute
-      if (!areDepsValid(cached.deps)) return false; // nested deps changed
-      if (!Object.is(cached.value, dep.value)) return false; // value changed
+      // SPIKE: bring the nested getter up to date through its own memo, then
+      // ask whether its value changed. A frame that owns no node keeps the
+      // reads made here out of whichever getter is running further up.
+      trackerStack.push(VALIDATING);
+      try {
+        const current = Reflect.get(dep.internal.proxy, dep.prop);
+        if (!Object.is(current, dep.value)) return false;
+      } catch {
+        return false; // a dependency that throws counts as changed
+      } finally {
+        trackerStack.pop();
+      }
     } else {
       // Check that the property still exists — if it was deleted and
       // dep.value was `undefined`, Object.is(undefined, undefined) would
@@ -164,8 +179,13 @@
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
+  if (cached) {
+    // SPIKE: nothing under this node was written since the last check.
+    if (cached.stamp === internal.version) return cached.value;
+    if (areDepsValid(cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
   }
 
   // Cycle detection: if this (internal, prop) pair is already being
@@ -187,8 +207,10 @@
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
   try {
+    // SPIKE: taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
```

`spike-one`

```diff
--- core.types.ts
+++ core.types.ts (spike-one)
@@ -1,33 +1,18 @@
 import type {StoreInternal} from './ownership';
 
-// ── Computed getter memoization types ─────────────────────────────────────────
+// SPIKE: one kind of dependency. Every entry says what a property of the
+// getter's own node gave when it was read: a plain value, a child's proxy, or
+// another getter's result. `version` is the version of the store node that
+// value is, or -1 when it is not one.
+export type DepEntry = {value: unknown; version: number};
 
-/**
- * A single dependency recorded during getter execution.
- * - `version`: dependency is a tracked sub-tree — compare `internal.version`.
- * - `value`: dependency is a primitive — compare via `Object.is`.
- */
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
-
 /** Cached result of a memoized computed getter, together with its dependencies. */
 export type ComputedEntry = {
   value: unknown;
-  deps: DepEntry[];
+  /** One entry per property read, in the order of the first read. */
+  deps: Map<string | symbol, DepEntry>;
+  /** The owning node's version when this entry was last found valid. */
+  stamp: number;
 };
+
+export type {StoreInternal};
--- core.ts
+++ core.ts (spike-one)
@@ -63,93 +63,72 @@
  * because getter A can read getter B, which pushes a second tracker.
  */
 const trackerStack: {
-  internal: StoreInternal;
+  internal: StoreInternal | null;
   prop: string | symbol;
-  deps: DepEntry[];
+  deps: Map<string | symbol, DepEntry>;
 }[] = [];
 
-/** Returns the tracker currently recording deps, or `null` if none is active. */
-function activeTracker() {
-  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
+/** A frame that records nothing, pushed while dependencies are re-read. */
+const VALIDATING = {
+  internal: null,
+  prop: Symbol('validating'),
+  deps: new Map<string | symbol, DepEntry>(),
+};
+
+/** Stands for "the property did not exist" and for "the getter threw". */
+const MISSING = Symbol('missing');
+const THREW = Symbol('threw');
+
+/** The version of the store node a value is, or -1 when it is not one. */
+function versionOf(value: unknown): number {
+  if (typeof value !== 'object' || value === null) return -1;
+  return internalsMap.get(value)?.version ?? -1;
 }
 
 /**
- * Record a dependency on the active tracker (if any).
- * Called from the GET trap whenever a non-getter, non-method property is read.
+ * Record what a property of the running getter's own node gave. The first read
+ * of a property in a run is the one that counts.
  */
 function recordDep(
   internal: StoreInternal,
   prop: string | symbol,
   value: unknown,
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
+  if (trackerStack.length === 0) return;
+  const tracker = trackerStack[trackerStack.length - 1];
+  if (tracker.internal !== internal || tracker.deps.has(prop)) return;
+  tracker.deps.set(prop, {value, version: versionOf(value)});
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
+/** What reading `prop` gives now, without the method binding of the `get` trap. */
+function currentOf(internal: StoreInternal, prop: string | symbol): unknown {
+  const child = internal.childInternals.get(prop);
+  if (child) return child.proxy;
+  const descriptor = findPropertyDescriptor(internal.target, prop);
+  if (!descriptor) return MISSING;
+  if (descriptor.get)
+    return evaluateComputed(internal, prop, descriptor.get, internal.proxy);
+  return Reflect.get(internal.target, prop);
 }
 
-/**
- * Check whether all dependencies from a previous computation are still valid.
- */
-function areDepsValid(deps: DepEntry[]): boolean {
-  for (const dep of deps) {
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
-    } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
-      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
+/** Re-read every dependency; any difference, or a throw, means "recompute". */
+function areDepsValid(
+  internal: StoreInternal,
+  deps: Map<string | symbol, DepEntry>,
+): boolean {
+  trackerStack.push(VALIDATING);
+  try {
+    for (const [prop, dep] of deps) {
+      const current = currentOf(internal, prop);
+      if (!Object.is(current, dep.value) || versionOf(current) !== dep.version)
         return false;
     }
+    return true;
+  } catch {
+    return false;
+  } finally {
+    trackerStack.pop();
   }
-  return true;
 }
 
 /**
@@ -164,16 +143,20 @@
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
-  if (cached && areDepsValid(cached.deps)) {
-    return cached.value;
+  if (cached) {
+    // Nothing under this node was written since the last check.
+    if (cached.stamp === internal.version) return cached.value;
+    if (areDepsValid(internal, cached.deps)) {
+      cached.stamp = internal.version;
+      return cached.value;
+    }
   }
 
-  // Cycle detection: if this (internal, prop) pair is already being
-  // evaluated higher in the stack, the getter chain is recursive.
   for (const existing of trackerStack) {
     if (existing.internal === internal && existing.prop === prop) {
       const cycle = trackerStack
         .slice(trackerStack.indexOf(existing))
+        .filter((f) => f.internal)
         .map((f) => String(f.prop))
         .concat(String(prop))
         .join(' → ');
@@ -183,15 +166,32 @@
     }
   }
 
-  // Push a new tracker frame for this getter evaluation.
-  const frame = {internal, prop, deps: [] as DepEntry[]};
+  const frame = {internal, prop, deps: new Map<string | symbol, DepEntry>()};
   trackerStack.push(frame);
   try {
+    // Taken before the body runs, so a getter that writes is checked again.
+    const stamp = internal.version;
     const value = getterFn.call(receiver);
-    internal.computedCache.set(prop, {value, deps: frame.deps});
+    internal.computedCache.set(prop, {value, deps: frame.deps, stamp});
     return value;
   } finally {
     trackerStack.pop();
+  }
+}
+
+/** Read a getter for the `get` trap: recorded whether it returns or throws. */
+function readGetter(
+  internal: StoreInternal,
+  prop: string | symbol,
+  getterFn: () => unknown,
+  receiver: object,
+): unknown {
+  let value: unknown = THREW;
+  try {
+    value = evaluateComputed(internal, prop, getterFn, receiver);
+    return value;
+  } finally {
+    recordDep(internal, prop, value);
   }
 }
 
@@ -462,19 +462,8 @@
       internal.resumeScope();
       // 1. Check for getters on the prototype chain (computed values).
       const getterDesc = findPropertyDescriptor(_target, prop);
-      if (getterDesc?.get) {
-        // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
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
-      }
+      if (getterDesc?.get)
+        return readGetter(internal, prop, getterDesc.get, receiver);
 
       const value = Reflect.get(_target, prop);
 
@@ -495,7 +484,11 @@
       // An inherited data property becomes an edge on its first proxy read.
       const child =
         internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
-      recordDep(internal, prop, value);
+      recordDep(
+        internal,
+        prop,
+        child ? child.proxy : getterDesc ? value : MISSING,
+      );
       return child ? child.proxy : value;
     },
 
```

`spike-memo`

```diff
--- spike-base/src/snapshot/snapshot.ts	2026-11-16 20:33:32
+++ spike-memo/src/snapshot/snapshot.ts	2026-11-19 04:36:57
@@ -142,6 +142,8 @@
     const computation = computeWithTracking(currentSnap, getterFn);
     result = computation.result;
 
+    // SPIKE: a nested getter may have created the map while this one ran.
+    memoMap = crossSnapshotMemo.get(target);
     // Save cross-snapshot memo.
     if (!memoMap) {
       memoMap = new Map();
```

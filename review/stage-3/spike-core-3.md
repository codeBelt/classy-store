# Spike: three core fixes the second adversarial review asks for

Brief: `review/stage-3/briefs/spike-core-3.md`. Each spike answers one
objection of `review/stage-3/adversarial-2-core.md`. Worktrees are detached at
`57404c3` under `<scratch>/stage-3-spike-core-3/`; scripts import the
TypeScript source (`bun <script> <worktree>`).

## Summary

- **G1, objection 3: do it, before 1.0.** While a snapshot getter's body
  runs, the live node behind the snapshot is pushed on the stack half B of F4
  reads, so any write to that node throws as on the live store. A base-class
  arrow method, `store.x++` through a module-level reference and a store
  method called by the getter now throw on a snapshot, with nothing written
  and nobody told; on the F4 build all three wrote and notified. A write to
  a child or to another store still goes through, on both layers alike. The
  same 20 tests fail as on the F4 build; +42 bytes; no timing difference
  outside the spread (a steady 4% on Bun's recomputed snapshot getter,
  inside it).
- **G2, objection 5: take the lazy form with a cap (form c), can follow
  1.0.** Of the two forms the brief named, (a) bounds the table but makes a
  read of a key a class-instance store lacks slower than today on Node, and
  (b) leaves class prototypes unbounded and needs an exception for
  `__proto__`, which the brief's premise missed (without it, `Object.prototype`
  becomes a node of the store). Form (c), "record a key absent everywhere
  only while the table holds fewer than 256 keys", bounds every table and
  keeps every figure of the lazy form. 0 test failures on every form; (c)
  costs 15 bytes over the lazy form.
- **G3, objection 4: do it, with decision 30, before 1.0.** Before a node is
  restored in place, one check asks whether every write there would be
  allowed; if not, the node is replaced at its parent by a copy, as today.
  The root cannot be replaced, so the undo throws before it writes and the
  history does not move. All seven locked-container rows that threw
  part-way on the K1 build now return with the recorded values and one
  notification; the frozen root throws cleanly (today it throws part-way
  and moves the history). K1's six cycle rows and the four `moved.ts` rows
  are unchanged; the same 36 tests fail. +211 bytes on `./utils`; the
  1,000-row undo is inside the spread, its medians 5 to 8% higher.

## G1. A snapshot getter must not reach the live store either (objection 3)

**Question.** Decision 10 and guarantee rule 4 say a getter that writes to
the object it is computed on throws, on the store and on a snapshot. F4 of
`spike-core-2.md` made the snapshot tracker's traps throw (half A) and made a
node's traps throw while a getter of that node is on the live evaluation
stack (half B). A snapshot getter that writes without going through `this`
(a base-class arrow method, `store.x++` through a module-level reference)
reaches the live store's traps while no live getter is on the stack, so it
writes and notifies (`adversarial-2-core.md`, objection 3; stage 1 finding
39, M26).

**Build.** `wt-g1`: `f4ab-on-combination-full.patch` of `spike-core-2.md`
(checked byte for byte to be the getter combination of `spike-getters.md`,
appendix E, then `f4a-delta.patch` and `f4b-delta.patch`), then
`spike-classes__base-class.patch` (C1) as F4 used it. This is "the F4
build". `g1-delta.patch` on top.

**What was changed.** `core.ts` 18 lines added; `snapshot.ts` 21 added and 6
removed (most of it passing the node down to where the getter body runs).

- `core.ts` exports `runSnapshotGetter(internal, run)`. It pushes a frame for
  the live node onto the same `trackerStack` that half B reads, with a
  private symbol as the key, runs the body, and pops the frame.
- `snapshot.ts`: `installMemoizedGetters` receives the node of the object it
  snapshots and passes it to `evaluateSnapshotGetter`, which runs the body
  through `runSnapshotGetter`. Only a run of the body is covered; a memo
  check is not (it only reads).
- The frame has no `seen` set, so `recordDep` records nothing into it, and
  its key never equals a real key, so it never matches the cycle check. Half
  B's existing check, `if (trackerStack.length) refuseOwnWrite(...)`, now
  finds the node and throws. The write path gains no new test.

**Result: the reproductions.** `snapgetter.ts` of the review:

| Case                                    | F4 build                              | G1                                                  |
| --------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| literal store, getter calls own method  | throws (half A), `liveHits 0, sync 0` | the same                                            |
| base class, getter calls an arrow field | **`0`, `liveHits 1, syncCalls 1`**    | throws "cannot write to its own store (hits)", 0, 0 |

`f4-writes.ts`, the nine rows of F4: every cell on both layers is the same on
the F4 build and on G1 (the table in `spike-core-2.md`, F4, columns "A,
snapshot" and "A and B, live").

`g1-rows.ts`, the three rows the brief asks for and three more. Each cell:
what the getter gives, the live field after it, the synchronous
notifications sent while it ran.

| The getter                                               | F4, live                 | F4, snapshot                   | G1, live     | G1, snapshot                        |
| -------------------------------------------------------- | ------------------------ | ------------------------------ | ------------ | ----------------------------------- |
| base-class arrow method writes its own field             | throws, 0, 0             | **returns, field 1, sync 1**   | throws, 0, 0 | **throws "own store (hits)", 0, 0** |
| write through a module-level reference, `store.hits++`   | throws, 0, 0             | **returns, field 1, sync 1**   | throws, 0, 0 | **throws "own store (hits)", 0, 0** |
| object-literal shorthand method called as `this.touch()` | throws, 0, 0             | throws "snapshot (hits)", 0, 0 | throws, 0, 0 | the same                            |
| the class method read from the store, `store.touch()`    | throws, 0, 0             | **returns, field 1, sync 1**   | throws, 0, 0 | **throws "own store (hits)", 0, 0** |
| a child written through the store, `store.child.x++`     | returns, field 1, sync 1 | returns, field 1, sync 1       | the same     | the same                            |
| another store written, `other.n++`                       | returns, 1, 1            | returns, 1, 1                  | the same     | the same                            |

The fourth row is the path decision 1 creates for the third: under decision
1 a shorthand method is a wrapper bound to the live node, so `this.touch()`
in a snapshot getter reaches the live `set` trap exactly as `store.touch()`
does here. Decision 1 is not in this build; that the wrapper takes the same
path is reasoning from `rule-f1.patch`, not run.

**What still gets through.** A write to a child of the node (here
`store.child.x++`, and equally `this.child.x = 1` on the live store) and a
write to another store. On both layers alike: the layers now agree on every
row except F4's own child rows (`this.child.x`, `this.list.push`), where the
snapshot throws because the child snapshot is frozen and the live store lets
the write through. Closing that needs the parent walk F4 did not build.

- **Tests.** The F4 build fails 20: F4's 19 (16 of the getter combination,
  3 incidental of half B) and "main entry point types > the entry exports six
  values and no others", which C1's `ClassyStore` export breaks. G1 fails the
  same 20, no more and no fewer. No test reaches the live store from a
  snapshot getter.
- **Typecheck.** One error on both builds, the same: `types.index.test.ts`,
  the export list C1 changes. Biome passes on the two files.
- **Size of `.`.** F4 build 3,916 bytes; G1 3,958, **+42**. (`./utils` adds
  2,685 and 2,690 to the main entry.)
- **Timings.** The two builds back to back, four rounds of five fresh
  processes per engine, in two passes with the order swapped. Three rows were
  added to the benchmark copy (`snapgetter.cached`: a getter read on one
  snapshot; `snapgetter.memo`: write a field the getter does not read, take
  a snapshot, read it, so the memo answers; `snapgetter.recompute`: write
  its input, take a snapshot, read it, so the body runs). Nanoseconds,
  lowest to highest single run of the twenty:

  | Row                    | Bun, F4      | Bun, G1      | Node, F4     | Node, G1     |
  | ---------------------- | ------------ | ------------ | ------------ | ------------ |
  | `snapgetter.cached`    | 3.43 to 7.98 | 3.62 to 6.17 | 12.2 to 12.7 | 12.3 to 12.6 |
  | `snapgetter.memo`      | 1237 to 1325 | 1246 to 1342 | 3596 to 5048 | 3808 to 5299 |
  | `snapgetter.recompute` | 1374 to 1515 | 1438 to 1556 | 3828 to 7502 | 4027 to 5772 |
  | `store.write`          | 151 to 159   | 152 to 163   | 208 to 227   | 206 to 214   |
  | `store.write.nested`   | 303 to 323   | 302 to 374   | 495 to 512   | 496 to 510   |

  Every range touches the other build's, so by the rule of this stage there
  is no difference. One pattern is worth saying: on Bun the four medians of
  `snapgetter.recompute` are 1,474 to 1,518 on G1 against 1,411 to 1,436 on
  F4, about 4% (60 ns) in every round. That is the closure and the frame
  per body run. If stage 4 wants it back, `computeWithTracking` can push and
  pop the frame itself (two exported functions instead of one taking a
  closure); not built. The other write rows (`store.write.same`, `.sync`,
  `.batched`) are inside each other's range too.

**What it changes for a user.** A snapshot getter that writes the live node
behind its snapshot, by any path, now throws the same `TypeError` the live
store throws ("a getter cannot write to its own store (field)"), and the
store is not written and nobody is told. On the F4 build those writes went
through and notified; the unmodified library was not run with these rows. A
snapshot getter that writes a child or another store
still works, as on the live store.

**Recommendation.** **Do it**, with decision 10 and F4 half B. Without it
rule 4 is false for the base class C1 that decision 1 and the docs
recommend, and for every getter that writes through a store reference. The
rule then reads: "a getter must not write to the node it is computed on,
through `this` or any other path; on a snapshot that node is the live node
the snapshot was taken from". The child gap stays **unspecified**, as F4
proposed. **Before 1.0**: it adds a throw, and adding one after 1.0 would
break a consumer.

**Cost for stage 4.** `core.ts` one exported function (or two), `snapshot.ts`
one parameter through three functions. Tests to write first: the four rows
above that change, on both layers, plus the child and other-store rows as
"allowed"; the same rows again once decision 1 lands, for its wrapper. 42
bytes on the main entry with the message it shares with half B.

## G2. The table per prototype must not grow with keys that do not exist (objection 5)

**Question.** Decision 12 takes `f2-holder-lazy.patch` of `spike-core-2.md`
("the lazy form"). Its table per prototype records every key looked up and
not found, for good, and `Object.prototype`'s table is shared by every plain
object of every store. A dictionary read by keys it does not have grows it:
88 MB for a million keys (`adversarial-2-core.md`, objection 5). Which form
bounds the table and keeps the lazy form's gains?

**Builds.** `wt-g2` at `57404c3` with the lazy form, then one of:

- **(a)** `g2a-on-lazy.patch`, `core.ts` +7 −4: a key is recorded only when
  the chain has it, as accessor or data; a key absent everywhere is looked
  up again at every read.
- **(b)** `g2b-on-lazy.patch`, +4: no table for `Object.prototype` and
  `Array.prototype`. One correction to the brief's premise:
  `Object.prototype` does have an accessor, `__proto__`. Without an
  exception for it, `store.cache.__proto__` is read as inherited data and
  `linkChild` makes `Object.prototype` itself a node of the store: the read
  returns a store proxy around it (`g2-proto.ts`: `isObjectPrototype
  false`). The patch answers `__proto__` with `Object.prototype` as its
  holder, which gives today's answer.
- **(a) and (b)** together, `g2ab-on-lazy.patch`, +11 −4.
- **(c)**, a form the brief did not name, `g2c-on-lazy.patch`, +5 −2: the
  lazy form as it is, except that a key absent everywhere is recorded only
  while the table holds fewer than 256 keys. A key the chain has is always
  recorded.

**Result: memory and meaning.** `table-growth.ts` (a million fresh absent
keys read and written on a nested plain dictionary), and `g2-edges.ts` (200,000
absent keys read on three kinds of object):

| Heap growth                                   | Today  | Lazy        | (a)    | (b)         | (a) and (b) | (c)    |
| --------------------------------------------- | ------ | ----------- | ------ | ----------- | ----------- | ------ |
| plain dictionary, 1,000,000 keys              | 0.2 MB | **88.4 MB** | 0.2 MB | 0.2 MB      | 0.2 MB      | 0.2 MB |
| class instance read as `store[key]`, 200,000  | 0.1 MB | **21.6 MB** | 0.1 MB | **21.6 MB** | 0.1 MB      | 0.1 MB |
| array read as `store.list[key]`, 200,000      | 0 MB   | **20.4 MB** | 0 MB   | 0 MB        | 0 MB        | 0.1 MB |
| plain dictionary, `store.cache[key]`, 200,000 | 0 MB   | **22.9 MB** | 0 MB   | 0 MB        | 0 MB        | 0.1 MB |

(b) alone leaves every class prototype's table unbounded: a store whose
class instance is read by keys it lacks (an index kept on the instance) still
grows it.

`table.ts` and `f2-lazy.ts` give the lazy form's answers on every form: a
getter redefined on the class runs its new body (300, 300); a getter replaced
by data is `true` before a write and `data` after; a getter deleted is `1`
then `undefined`. `g2-edges.ts`'s other rows are the same on all forms and
today: `__proto__` is `Object.prototype`, `toString` works, a class getter is
memoized on both layers, and a getter added to the class after a read that
found nothing is seen (`undefined`, then 4 and 4).

- **Tests.** 1,341 pass on the lazy form and on each of (a), (b), (a) and
  (b), and (c).
- **Typecheck and Biome.** Pass on every form.
- **Size of `.`.** Today 3,661; lazy 3,826; (a) 3,829 (+3 on lazy); (b)
  3,854 (+28); (a) and (b) 3,857 (+31); (c) 3,841 (+15).

**Timings.** Saved builds back to back, two rounds per pass, five fresh
processes per build, engine and filter; (a) and (b) were in two passes, (c)
and (a)+(b) in two others. Two rows were added to the benchmark copy:
`store.read.absent` reads `store.cache.missing` on a nested plain object,
`store.read.absent.class` reads `store.missing` on the benchmark's class
instance. Each cell is the lowest to the highest single run over the
passes the build was in, in nanoseconds.

| Bun                       | Today        | Lazy         | (a)              | (b)              | (a) and (b)      | (c)          |
| ------------------------- | ------------ | ------------ | ---------------- | ---------------- | ---------------- | ------------ |
| `store.read`              | 31.1 to 32.1 | 11.2 to 16.4 | 11.2 to 11.5     | 11.2 to 11.7     | 11.3 to 11.4     | 11.3 to 11.4 |
| `store.read.nested`       | 105 to 115   | 40.5 to 47.8 | 40.4 to 48.7     | 40.5 to 47.4     | 40.6 to 47.3     | 40.6 to 47.1 |
| `store.method`            | 210 to 247   | 174 to 192   | 173 to 190       | 173 to 185       | 175 to 185       | 175 to 186   |
| `getter.cached`           | 56.4 to 59.3 | 33.6 to 34.7 | 33.8 to 34.7     | 34.0 to 34.6     | 34.2 to 34.7     | 33.9 to 34.6 |
| `store.read.absent`       | 65.6 to 67.6 | 38.2 to 42.7 | **39.5 to 40.9** | **28.8 to 29.3** | **28.9 to 29.4** | 38.6 to 39.3 |
| `store.read.absent.class` | 36.8 to 40.1 | 19.9 to 21.5 | **30.8 to 32.5** | 23.1 to 24.1     | **33.9 to 36.2** | 20.3 to 21.0 |

| Node                      | Today        | Lazy         | (a)            | (b)              | (a) and (b)      | (c)          |
| ------------------------- | ------------ | ------------ | -------------- | ---------------- | ---------------- | ------------ |
| `store.read`              | 45.9 to 49.0 | 36.5 to 39.5 | 36.5 to 38.8   | 36.5 to 50.2     | 36.6 to 39.8     | 37.1 to 38.9 |
| `store.read.nested`       | 137 to 174   | 112 to 115   | 112 to 116     | 112 to 129       | 112 to 116       | 112 to 116   |
| `store.method`            | 287 to 313   | 269 to 300   | 269 to 312     | 270 to 279       | 270 to 281       | 270 to 283   |
| `getter.cached`           | 83.1 to 86.4 | 74.0 to 76.7 | 72.5 to 74.6   | 73.9 to 76.9     | 73.0 to 74.6     | 74.0 to 75.2 |
| `store.read.absent`       | 121 to 136   | 101 to 106   | **123 to 127** | **89.3 to 99.1** | **89.5 to 91.3** | 101 to 102   |
| `store.read.absent.class` | 97.1 to 100  | 66.7 to 80.6 | **107 to 116** | 66.2 to 75.0     | **107 to 129**   | 66.4 to 68.6 |

The `store.read.absent.class` row of (a) comes from the second pass only,
the one it was added in.

- Every form keeps the lazy form's gains on `store.read`, the nested read,
  `store.method` and `getter.cached`: all ranges touch the lazy form's.
- **(a)** pays at every read of a key absent everywhere: the walk to the end
  of the chain each time. On Node that is back at today's cost for a nested
  dictionary (123 to 127 against today's 121 to 136) and **slower than
  today** for a class instance (107 to 116 against 97.1 to 100; ranges
  apart). On Bun the nested dictionary stays inside the lazy form's range
  and the class instance falls between the lazy form and today.
- **(b)** is the fastest on a plain object or array (no table lookup at
  all), keeps the lazy form's figure for a class instance, but bounds
  nothing on a class prototype.
- **(a) and (b)** is bounded everywhere and fastest on plain objects, and
  carries (a)'s loss on a class instance.
- **(c)** keeps every figure of the lazy form, including both absent-key
  rows, and is bounded everywhere. Its caveat: the benchmark reads one
  absent key, which the table records while it is small. Once 256 absent
  keys of one prototype are recorded, every further new absent key is
  looked up each time, at (a)'s cost. For a dictionary read by an endless
  stream of new keys that is about today's cost on Node for a nested
  dictionary, up to 10% above today's for a class instance, and still below
  today's on Bun (reasoned from (a)'s rows; (c) was not timed with more
  than 256 keys recorded). For code that reads a handful of absent keys again and
  again (an optional field, `toJSON`, `then` checks by promise libraries)
  the lazy form's gain stays.

**What it changes for a user.** Nothing in ordinary code, on any form: no
test changes. Against the lazy form, all forms stop the leak. (a) and (a)
with (b) make a read of a key a class-instance store lacks slower than today
on Node. A getter added to a prototype after a read that found nothing was
seen on every form (the lazy form included), because such a read is answered
as data through `Reflect.get`.

**Recommendation.** **Take decision 12 in the lazy form with (c).** It is
the only form that keeps every measured gain and bounds the table, for 15
bytes. If the owner prefers no magic number, (a) is the plain answer the
brief named, for 3 bytes, at the cost above for absent keys on Node. Do not
take (b) alone: it leaves class prototypes unbounded, and it needs the
`__proto__` exception, which is easy to miss. Decision 12 should add to
"What it assumes": "the table records a key the prototype chain has; a key
absent everywhere is recorded only while the table holds fewer than 256
keys, so reads of keys an object lacks cannot grow it without bound". **Can
follow 1.0**, as decision 12 is labelled: no behaviour a user sees changes.

**Cost for stage 4.** `core.ts`, `accessorHolder()` only: two lines on the
lazy form. Tests first: `table-growth.ts` as a test (a million absent keys on
a nested dictionary and 200,000 on a class instance leave the table's size
under the cap; the table can be reached through a test-only export or by
heap growth), and a read of an absent key that is later added as a getter
on the prototype. 15 bytes on the main entry over decision 12's 165.

## G3. An undo into a container that cannot be written (objection 4)

**Question.** Decision 30 restores a nested object in place. When the
container was frozen, sealed or made non-extensible through the store after
the entry was recorded (decision 5 keeps its children as children, decision
2 keeps the freeze silent), the restore's write is refused part-way: the
store is half restored, the one synchronous notification carries the half
state, and the history has moved (`adversarial-2-core.md`, objection 4).
Stage 1 finding 8, M36, M60.

**Build.** `wt-g3`: `k1-combined-fixed.patch` of `spike-combos.md` (C1, P7,
P8, V4, N3 and K1's guard), "the K1 build". `g3-on-k1.patch` on top.

**What was changed.** `cloneSnapshot.ts` 44 lines added, `history.ts` 5
added, nothing removed.

- `canRestoreInPlace(live, state)` asks, before a node is written in place,
  whether every write the restore would make there is allowed: no read-only
  key whose value differs, no non-configurable key to delete, no key to add
  when the node is not extensible, and for an array no read-only `length`
  that has to change. It reads one descriptor per key that differs, not per
  key. An array is checked by index; a first draft that used `Object.keys`
  on the list made the 1,000-row undo 55% slower (417 to 490 µs against 264
  to 292, ranges apart).
- `restoreValue`: when the check fails, the branch is replaced at its parent
  by `cloneSnapshotValue`, which is what today's restore does for every
  branch. The parent's own check has already covered the key it writes,
  because that key differs.
- `applyState`: the root cannot be replaced, so when the root fails the
  check it throws a `TypeError` before anything is written.
- `withHistory`'s `restore()` puts the pointer back when the apply throws.

The check is narrower than "not extensible": a sealed container whose undo
only changes a value is still restored in place, because that write is
allowed.

**Result: the rows.** `g3-rows.ts`: one entry writes `title` and something in
`config`, then the container (or the root) is locked through the store, then
`undo()`. "Today" is the unmodified library. Every row returns on G3 except
the frozen root, and every row that returns notifies once and leaves
`canUndo false, canRedo true`.

| Container, locked after the entry             | Today                                              | K1 build                                                    | G3                                                                                                               |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| frozen, a value differs (`undo-frozen.ts`)    | returns, replaced, 2 notifications                 | **throws `set` trap falsy (x)**, `title` back, `x` 2, moved | returns, `x` 1, replaced by a copy (not frozen)                                                                  |
| sealed, the undo re-adds a key                | returns, replaced                                  | **throws (y)**, half restored, moved                        | returns, `y` 1, replaced                                                                                         |
| sealed, a value differs                       | returns, replaced                                  | returns, in place                                           | returns, **in place**, same object                                                                               |
| sealed, the undo deletes a key                | returns, replaced                                  | **throws "Unable to delete property"**, moved               | returns, `y` gone, replaced                                                                                      |
| non-extensible, the undo re-adds a key        | returns, replaced                                  | **throws (y)**, moved                                       | returns, `y` 1, replaced                                                                                         |
| one read-only key that differs (`x`), `z` too | returns, `[1, 1]`, replaced                        | **throws (x)**, `[2, 2]`, moved                             | returns, `[1, 1]`, replaced                                                                                      |
| frozen, its child `inner.v` differs           | returns, both replaced                             | **throws (inner)**: `inner.v` already back, `title` back    | returns, `inner.v` 1, **the container is replaced, and the child with it** (a copy)                              |
| frozen array, an element differs              | returns, replaced                                  | **throws (0)**, moved                                       | returns, `[1, 2]`, replaced                                                                                      |
| frozen, not changed by the entry              | returns, untouched, still frozen                   | the same                                                    | the same                                                                                                         |
| frozen root                                   | **throws (title), nothing written, history moved** | the same                                                    | **throws "the store refuses the restore", nothing written, history not moved** (`canUndo true`), no notification |

In the frozen-child row the child is a live node and could have been
restored in place, but the check is made on the container before its
children, and the container's `inner` key differs and is read-only, so the
container goes as a whole, as today. Redo after each row that returns gives
the recorded values back. The frozen root throws today too, and today the
history moves before the throw; G3 fixes that as well.

- **K1's rows.** `repro/k1.ts`, the six stores with a cycle, undo, redo and a
  DevTools jump: the same output on the K1 build and on G3, apart from the
  timing figures it prints. `moved.ts` of the addendum, its four rows: the
  same output, byte for byte.
- **Tests.** The K1 build fails 36 (its 29 and N3's 7, classed in
  `spike-combos.md`); G3 fails the same 36. No test locks a container
  between an entry and its undo.
- **Typecheck.** The K1 build's two errors (the export list C1 changes and
  P7's option list), no new one. A first form had a cast TypeScript
  refused; the patch is the corrected form.
- **Size.** Main entry 3,800 on both. `./utils` adds 3,209 on the K1 build
  and **3,420 on G3, +211**. That is large for 49 lines: the long built-in
  names (`getOwnPropertyDescriptor`, `isExtensible`, `hasOwn`) survive
  minification, and the array path is half of it. A form without the
  array path was 3,362 (+153) and slow (above).
- **Timings.** V4's `bench-undo.ts`, the 1,000-row undo and its snapshot on
  Bun, three rounds of three fresh processes per build, back to back, while
  another agent ran benchmarks. Microseconds, the nine medians, lowest to
  highest, then the lowest and highest single sample:

  | Rows       | K1 build                    | G3                          |
  | ---------- | --------------------------- | --------------------------- |
  | plain      | 266 to 318 (262.6 to 366.1) | 287 to 316 (281.9 to 389.9) |
  | base class | 303 to 335 (295.3 to 402.1) | 320 to 351 (317.1 to 388.6) |

  The ranges touch, so by this stage's rule there is no difference. The
  medians sit about 5 to 8% higher on G3 in most rounds: the check walks the
  changed list once more before the restore walks it. The source was timed
  through Bun's TypeScript loader, as V4 did; Node was not run.

**What it changes for a user.** An undo, redo or DevTools jump into a
container that was frozen, sealed, made non-extensible or given a read-only
key after the entry works again, as it does today: the container comes back
as a new, unlocked copy, so a reference to the old container no longer
points into the store, and its lock is gone. A container that would accept
every write is still restored in place, as decision 30 says. An undo on a
frozen root throws a `TypeError` with nothing changed and the history where
it was, where today it throws part-way with the history moved.

**Recommendation.** **Do it, as part of decision 30.** Decision 30 should
say: "a container that would refuse one of the restore's writes (a key to
add on an object that is not extensible, a read-only key that differs, a
key that cannot be deleted) is replaced at its parent by a copy, as today;
the root cannot be replaced, so the restore throws before it writes and the
history does not move". Whether the copy keeps the lock (refreeze it) is a
question nobody has asked; this spike leaves it unlocked, as today.
**Before 1.0**, with decision 30, which it repairs.

**Cost for stage 4.** `cloneSnapshot.ts` one function and two call sites,
`history.ts` four lines. Tests first: the ten rows above, each asserting
the return or the throw, the values, whether the container is the same
object, one notification, and `canUndo`/`canRedo`; the same for a DevTools
jump on the frozen root (not run here). 211 bytes on `./utils`, which is
already over its budget on every decision-30 build.

## Verified and not verified

- **Ran**, on worktrees at `57404c3` under `<scratch>/stage-3-spike-core-3/`
  (`wt-base` unmodified, `wt-g1`, `wt-g2`, `wt-g3`): the unit suite, the
  package typecheck, `bun run size` and Biome on every build named above;
  the reviewers' `snapgetter.ts`, `table-growth.ts`, `undo-frozen.ts`,
  `f4-writes.ts`, `f2-lazy.ts`, `table.ts`, `k1.ts`, `moved.ts` and
  `bench-undo.ts`, and my scripts in the appendix. Test failures were
  compared by name with `diff` against the base build of each spike.
- **Timings.** The core benchmark from saved copies of `dist`, each with its
  own `package.json`, builds back to back, while another agent ran
  benchmarks on the machine. I state a difference only where ranges do not
  touch. The rows I added (`snapgetter.*`, `store.read.absent`,
  `store.read.absent.class`) exist only in the benchmark copies; the scripts
  that add them are in the appendix. `bench-undo.ts` was run on Bun only,
  from the TypeScript source, as V4 ran it.
- **Reasoned, not run.** That decision 1's method wrapper takes the same
  path as `store.touch()` in G1 (decision 1 is not in the F4 build). That
  (c) costs what (a) costs for an absent key once its cap is reached. That a
  DevTools jump on a frozen root gets the same refusal as an undo (both
  call `applyState`; only undo was run).
- **Not done.** G1 was not built on decision 1 or on the other core
  decisions; G2 was not built on the getter combination (`evaluateComputed`
  differs there, as `spike-core-2.md` says of F2); G3 was not timed on Node.
  The browser, framework and mutation suites, the coverage run and
  `check:floor` were not run; the new code has no tests, so the 100% line
  and function floor would fail until stage 4 writes them.
- **A slip to record.** In `wt-g1` I made one local commit on the detached
  worktree (to keep the F4 base apart) and undid it at once with
  `git reset` in that worktree. Nothing was pushed, no branch was touched,
  and the main checkout was not touched; the dangling commit object will be
  collected by git.

## Appendix: patches

Each applies with `git apply` on the build its title names, at `57404c3`. The paths inside are the repository's.

### `g1-delta.patch`: G1, on the F4 build (`f4ab-on-combination-full.patch`, then `spike-classes__base-class.patch`)

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 1e066a6..015b101 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -98,6 +98,24 @@ function refuseOwnWrite(internal: StoreInternal, prop: string | symbol): void {
       );
 }
 
+/** Marks a frame of a snapshot getter: it records nothing and never cycles. */
+const SNAPSHOT_GETTER = Symbol('snapshot getter');
+
+/**
+ * @internal Run a snapshot getter's body with the live node behind the
+ * snapshot counted as having a getter on the stack, so a write to that node
+ * that does not go through the snapshot (an arrow method, a store reference)
+ * is refused as on the live store.
+ */
+export function runSnapshotGetter<T>(internal: StoreInternal, run: () => T): T {
+  trackerStack.push({internal, prop: SNAPSHOT_GETTER, deps: []});
+  try {
+    return run();
+  } finally {
+    trackerStack.pop();
+  }
+}
+
 /** The version of the store node a value is, or -1 when it is not one. */
 function versionOf(value: unknown): number {
   if (typeof value !== 'object' || value === null) return -1;
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index eb31cd5..cf83170 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,10 @@
 import {markToTrack} from 'proxy-compare';
-import {cycleError, getInternal, registerSnapshot} from '../core/core';
+import {
+  cycleError,
+  getInternal,
+  registerSnapshot,
+  runSnapshotGetter,
+} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -90,6 +95,7 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
+  internal: StoreInternal,
   getterFn: () => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
@@ -120,7 +126,7 @@ function computeWithTracking(
   };
 
   const tracked = new Proxy({}, handler);
-  const result = getterFn.call(tracked);
+  const result = runSnapshotGetter(internal, () => getterFn.call(tracked));
   return {deps, result};
 }
 
@@ -155,6 +161,7 @@ function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
 function evaluateSnapshotGetter(
   currentSnap: object,
   target: object,
+  internal: StoreInternal,
   key: string | symbol,
   getterFn: () => unknown,
 ): unknown {
@@ -193,7 +200,7 @@ function evaluateSnapshotGetter(
       result = prev.result;
     } else {
       // Compute fresh with dep tracking.
-      const computation = computeWithTracking(currentSnap, getterFn);
+      const computation = computeWithTracking(currentSnap, internal, getterFn);
       result = computation.result;
       memoMap.set(key, computation);
     }
@@ -244,7 +251,11 @@ function snapshotValue(
 }
 
 /** Install the nearest accessor for each key without invoking user code. */
-function installMemoizedGetters(snap: object, target: object): void {
+function installMemoizedGetters(
+  snap: object,
+  target: object,
+  internal: StoreInternal,
+): void {
   const seen = new Set<string | symbol>();
   let proto: object | null = target;
   while (proto && proto !== Object.prototype) {
@@ -256,7 +267,7 @@ function installMemoizedGetters(snap: object, target: object): void {
       const getter = descriptor.get;
       function memoizedGetter(this: object) {
         return getter
-          ? evaluateSnapshotGetter(this, target, key, getter)
+          ? evaluateSnapshotGetter(this, target, internal, key, getter)
           : undefined;
       }
       const own = proto === target;
@@ -326,7 +337,11 @@ function createSnapshotRecursive<T extends object>(
     }
 
     // Install lazy-memoizing getters with cross-snapshot caching.
-    installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
+    installMemoizedGetters(
+      snap as Record<string | symbol, unknown>,
+      target,
+      internal,
+    );
   }
 
   markSnapshotForTracking(snap);
```

### `g2a-on-lazy.patch`: G2 form (a), on `f2-holder-lazy.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index d29cbcc..1de0e55 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -27,15 +27,18 @@ function accessorHolder(
   }
   let holder = table.get(prop);
   if (holder === undefined) {
-    holder = null;
+    // SPIKE G2 (a): a key is recorded only where the chain has it. A key that
+    // is absent everywhere is looked up again at each read, so reads of keys
+    // a dictionary does not have do not grow the table.
     for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
       const desc = Object.getOwnPropertyDescriptor(at, prop);
       if (desc) {
-        if (!('value' in desc)) holder = at;
-        break;
+        holder = 'value' in desc ? null : at;
+        table.set(prop, holder);
+        return holder;
       }
     }
-    table.set(prop, holder);
+    return null;
   }
   return holder;
 }
```

### `g2b-on-lazy.patch`: G2 form (b), on `f2-holder-lazy.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index d29cbcc..3bb2816 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -19,7 +19,11 @@ function accessorHolder(
   proto: object | null,
   prop: string | symbol,
 ): object | null | undefined {
+  // SPIKE G2 (b): no table for the two prototypes every plain object and
+  // array shares. Neither has an accessor a store reads as a getter.
   if (proto === null) return null;
+  if (proto === Object.prototype || proto === Array.prototype)
+    return prop === '__proto__' ? Object.prototype : null;
   let table = accessorHolders.get(proto);
   if (!table) {
     table = new Map();
```

### `g2ab-on-lazy.patch`: G2 forms (a) and (b) together, on `f2-holder-lazy.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index d29cbcc..d3c7edd 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -19,7 +19,11 @@ function accessorHolder(
   proto: object | null,
   prop: string | symbol,
 ): object | null | undefined {
+  // SPIKE G2 (b): no table for the two prototypes every plain object and
+  // array shares. Neither has an accessor a store reads as a getter.
   if (proto === null) return null;
+  if (proto === Object.prototype || proto === Array.prototype)
+    return prop === '__proto__' ? Object.prototype : null;
   let table = accessorHolders.get(proto);
   if (!table) {
     table = new Map();
@@ -27,15 +31,18 @@ function accessorHolder(
   }
   let holder = table.get(prop);
   if (holder === undefined) {
-    holder = null;
+    // SPIKE G2 (a): a key is recorded only where the chain has it. A key that
+    // is absent everywhere is looked up again at each read, so reads of keys
+    // a dictionary does not have do not grow the table.
     for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
       const desc = Object.getOwnPropertyDescriptor(at, prop);
       if (desc) {
-        if (!('value' in desc)) holder = at;
-        break;
+        holder = 'value' in desc ? null : at;
+        table.set(prop, holder);
+        return holder;
       }
     }
-    table.set(prop, holder);
+    return null;
   }
   return holder;
 }
```

### `g2c-on-lazy.patch`: G2 form (c), a cap on recorded misses, on `f2-holder-lazy.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index d29cbcc..cf17456 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -28,14 +28,17 @@ function accessorHolder(
   let holder = table.get(prop);
   if (holder === undefined) {
     holder = null;
-    for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
+    let at: object | null = proto;
+    for (; at; at = Object.getPrototypeOf(at)) {
       const desc = Object.getOwnPropertyDescriptor(at, prop);
       if (desc) {
         if (!('value' in desc)) holder = at;
         break;
       }
     }
-    table.set(prop, holder);
+    // SPIKE G2 (c): a key absent everywhere is recorded only while the table
+    // is small, so a dictionary read by keys it lacks cannot grow it.
+    if (holder || at || table.size < 256) table.set(prop, holder);
   }
   return holder;
 }
```

### `g3-on-k1.patch`: G3, on `k1-combined-fixed.patch`

```diff
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index 05cdc14..726acba 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -66,6 +66,42 @@ export function isDataKey(store: object, key: string): boolean {
   );
 }
 
+/**
+ * Whether `live` accepts every write a restore in place to `state` makes:
+ * no read-only key it would change, no key it cannot delete, and no key to
+ * add when it is not extensible. A container that would refuse one is
+ * replaced at its parent instead, so a restore never stops part-way.
+ */
+function canRestoreInPlace(live: object, state: object): boolean {
+  const current = snapshot(live) as Record<string, unknown>;
+  const recorded = state as Record<string, unknown>;
+  const refuses = (key: string | number, write: boolean) => {
+    const descriptor = Object.getOwnPropertyDescriptor(live, key);
+    if (!descriptor) return write && !Object.isExtensible(live);
+    return write ? descriptor.writable === false : !descriptor.configurable;
+  };
+  if (Array.isArray(live)) {
+    const now = current as unknown as unknown[];
+    const then = state as unknown[];
+    // Indices, not `Object.keys`: a long list is checked without a string
+    // per row, and only an element that differs costs a descriptor.
+    for (let i = 0; i < then.length; i++)
+      if (!(i < now.length && Object.is(now[i], then[i])) && refuses(i, true))
+        return false;
+    for (let i = then.length; i < now.length; i++)
+      if (refuses(i, false)) return false;
+    return now.length === then.length || !refuses('length', true);
+  }
+  for (const key of Object.keys(recorded)) {
+    const same =
+      Object.hasOwn(current, key) && Object.is(current[key], recorded[key]);
+    if (!same && refuses(key, true)) return false;
+  }
+  for (const key of Object.keys(current))
+    if (!Object.hasOwn(recorded, key) && refuses(key, false)) return false;
+  return true;
+}
+
 /**
  * A recorded value as it goes back into the store. A snapshot of a node that
  * still exists goes back as that node, changed in place to match: a nested
@@ -83,6 +119,9 @@ function restoreValue(
   // already being written: nothing below it to write.
   if (snapshot(live) === state || clones.get(state as object) === live)
     return live;
+  // SPIKE G3: a container that would refuse a write is replaced, as today.
+  if (!canRestoreInPlace(live, state as object))
+    return cloneSnapshotValue(state, clones, untrusted);
   clones.set(state as object, live);
   if (Array.isArray(live)) {
     const recorded = state as unknown[];
@@ -134,6 +173,11 @@ export function applyState(
   state: Record<string, unknown>,
   untrusted?: boolean,
 ): void {
+  // SPIKE G3: the root cannot be replaced. Refuse before anything is written.
+  if (!canRestoreInPlace(store, state))
+    throw new TypeError(
+      '@codebelt/classy-store: the store refuses the restore',
+    );
   const clones = new WeakMap<object, object>();
   // The recorded root stands for the store: a field that refers back to it
   // is restored as the store.
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index 4b1bfc9..d275d14 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -102,10 +102,15 @@ export function withHistory<T extends object>(
 
   /** Move to another entry without recording the move itself. */
   function restore(target: number): void {
+    const previous = pointer;
     pointer = target;
     try {
       // One transaction: a synchronous subscriber hears once per step.
       batch(() => applySnapshot(history[pointer]));
+    } catch (error) {
+      // SPIKE G3: a refused restore leaves the history where it was.
+      pointer = previous;
+      throw error;
     } finally {
       // The restore's own notification finds this revision and records nothing.
       recordedVersion = getVersion(proxyStore);
```

## Appendix: scripts

The reviewers' scripts used as they are (`snapgetter.ts`, `table-growth.ts`, `undo-frozen.ts` of `adversarial-2-core.md`; `f4-writes.ts`, `f2-lazy.ts` of `spike-core-2.md`; `table.ts` of `adversarial-core.md`; `k1.ts`, `bench-undo.ts` and `moved.ts` of `spike-combos.md`) are in their reports and not repeated. Mine take the worktree as the first argument (`bun <script> <worktree>`); the benchmark helpers run on saved builds under `<scratch>/stage-3-spike-core-3/builds/<name>/`, each with its own `package.json` and a `node_modules` link.

### `g1-rows.ts`

```ts
// G1: writes from a getter that do not go through `this`, on both layers.
// Each row: what the getter returns or throws, then the live field and the
// sync notifications the live store sent while the getter ran.
const wt = process.argv[2];
const mod = await import(`${wt}/packages/classy-store/src/index.ts`);
const {createClassyStore, snapshot, subscribe, ClassyStore} = mod;
const show = (f: () => unknown) => {
  try {
    return `returns ${JSON.stringify(f())}`;
  } catch (e) {
    return `throws ${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};
type Row = {name: string; make: () => {store: any; field: () => unknown}};
const other = createClassyStore({n: 0});
const rows: Row[] = [
  {
    name: 'base-class arrow method writes its own field',
    make: () => {
      class C extends (ClassyStore as any) {
        count = 0;
        hits = 0;
        touch = () => {
          this.hits++;
        };
        get v() {
          this.touch();
          return this.count;
        }
      }
      const store = new C() as any;
      return {store, field: () => store.hits};
    },
  },
  {
    name: 'write through a module-level reference (`store.hits++`)',
    make: () => {
      const ref: {s?: any} = {};
      const store = createClassyStore({
        count: 0,
        hits: 0,
        get v() {
          ref.s.hits++;
          return this.count;
        },
      });
      ref.s = store;
      return {store, field: () => store.hits};
    },
  },
  {
    name: 'object-literal shorthand method called by the getter',
    make: () => {
      const store = createClassyStore({
        count: 0,
        hits: 0,
        touch() {
          this.hits++;
        },
        get v() {
          this.touch();
          return this.count;
        },
      });
      return {store, field: () => store.hits};
    },
  },
  {
    name: 'the store method, read from the store, called by the getter',
    make: () => {
      const ref: {s?: any} = {};
      class C {
        count = 0;
        hits = 0;
        touch() {
          this.hits++;
        }
        get v() {
          ref.s.touch();
          return this.count;
        }
      }
      const store = createClassyStore(new C());
      ref.s = store;
      return {store, field: () => store.hits};
    },
  },
  {
    name: 'a child written through a module-level reference',
    make: () => {
      const ref: {s?: any} = {};
      const store = createClassyStore({
        child: {x: 0},
        get v() {
          ref.s.child.x++;
          return 1;
        },
      });
      ref.s = store;
      return {store, field: () => store.child.x};
    },
  },
  {
    name: 'another store written (`other.n++`)',
    make: () => {
      other.n = 0;
      const store = createClassyStore({
        get v() {
          other.n++;
          return 1;
        },
      });
      return {store, field: () => other.n};
    },
  },
];
for (const row of rows) {
  const out: string[] = [];
  for (const layer of ['live', 'snapshot'] as const) {
    const {store, field} = row.make();
    let calls = 0;
    subscribe(store, () => calls++, {sync: true});
    let otherCalls = 0;
    const unsub = subscribe(other, () => otherCalls++, {sync: true});
    const r = show(() => (layer === 'live' ? store.v : snapshot(store).v));
    unsub();
    out.push(`${r}; field ${field()}, sync ${calls + otherCalls}`);
  }
  console.log(`| ${row.name} | ${out[0]} | ${out[1]} |`);
}
```

### `g2-edges.ts`

```ts
// G2: where else the table can grow, and reads the two forms change.
const wt = process.argv[2];
const {createClassyStore, snapshot} = await import(
  `${wt}/packages/classy-store/src/index.ts`
);
const N = 200000;
const grow = (label: string, read: (key: string) => unknown) => {
  Bun.gc(true);
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < N; i++)
    read(`k${i}-${Math.random().toString(36).slice(2)}`);
  Bun.gc(true);
  const mb = +((process.memoryUsage().heapUsed - before) / 1e6).toFixed(1);
  console.log(`${label}: ${mb} MB for ${N} absent keys`);
};
class Index {
  byId: Record<string, number> = {};
  get size() {
    return Object.keys(this.byId).length;
  }
}
const cls = createClassyStore(new Index()) as any;
grow('class instance as the dictionary, `store[key]`', (k) => cls[k]);
const list = createClassyStore({list: [1, 2, 3]}) as any;
grow('array read by absent keys, `store.list[key]`', (k) => list.list[k]);
const plain = createClassyStore({cache: {} as Record<string, number>}) as any;
grow('plain dictionary, `store.cache[key]`', (k) => plain.cache[k]);
// Reads the forms touch.
console.log(
  '__proto__ of a nested plain object is Object.prototype:',
  plain.cache.__proto__ === Object.prototype,
);
console.log(
  'toString on a plain store is callable:',
  typeof plain.cache.toString === 'function' && plain.cache.toString(),
);
console.log(
  'class getter still memoized, live:',
  cls.size,
  'snapshot:',
  snapshot(cls).size,
);
class Later {
  n = 2;
}
const later = createClassyStore(new Later()) as any;
const first = later.twice;
Object.defineProperty(Later.prototype, 'twice', {
  get(this: Later) {
    return this.n * 2;
  },
  configurable: true,
});
console.log(
  'getter added to the class after a read that found nothing:',
  first,
  later.twice,
  snapshot(later).twice,
);
```

### `g2-proto.ts`

```ts
// G2 (b) without its `__proto__` exception: what `store.x.__proto__` gives.
const wt = process.argv[2];
const {createClassyStore} = await import(
  `${wt}/packages/classy-store/src/index.ts`
);
const s = createClassyStore({cache: {a: 1}}) as any;
const p = s.cache.__proto__;
console.log(
  JSON.stringify({isObjectPrototype: p === Object.prototype, type: typeof p}),
);
try {
  p.injected = 1;
  console.log(
    'write through it reached Object.prototype:',
    ({} as any).injected,
  );
} catch (e) {
  console.log('write threw', String(e));
}
delete (Object.prototype as any).injected;
```

### `g3-rows.ts`

```ts
// G3: an undo into a container that cannot be written, one row per kind.
// Each row: one entry writes `title` and something in `config`, then the
// container (or the root) is locked through the store, then `undo()`.
const wt = process.argv[2];
const {createClassyStore, subscribe} = await import(
  `${wt}/packages/classy-store/src/index.ts`
);
const {withHistory} = await import(
  `${wt}/packages/classy-store/src/utils/index.ts`
);
const flush = () => new Promise((r) => setTimeout(r, 0));

type Row = {
  name: string;
  initial: () => Record<string, unknown>;
  write: (s: any) => void;
  lock: (s: any) => void;
  show: (s: any) => unknown;
};
const rows: Row[] = [
  {
    name: 'frozen container, a value differs',
    initial: () => ({title: 'a', config: {x: 1}}),
    write: (s) => {
      s.config.x = 2;
    },
    lock: (s) => Object.freeze(s.config),
    show: (s) => s.config.x,
  },
  {
    name: 'sealed container, undo re-adds a key',
    initial: () => ({title: 'a', config: {x: 1, y: 1}}),
    write: (s) => {
      delete s.config.y;
    },
    lock: (s) => Object.seal(s.config),
    show: (s) => s.config.y,
  },
  {
    name: 'sealed container, a value differs',
    initial: () => ({title: 'a', config: {x: 1}}),
    write: (s) => {
      s.config.x = 2;
    },
    lock: (s) => Object.seal(s.config),
    show: (s) => s.config.x,
  },
  {
    name: 'sealed container, undo deletes a key',
    initial: () => ({title: 'a', config: {x: 1} as Record<string, number>}),
    write: (s) => {
      s.config.y = 2;
    },
    lock: (s) => Object.seal(s.config),
    show: (s) => s.config.y,
  },
  {
    name: 'non-extensible container, undo re-adds a key',
    initial: () => ({title: 'a', config: {x: 1, y: 1}}),
    write: (s) => {
      delete s.config.y;
    },
    lock: (s) => Object.preventExtensions(s.config),
    show: (s) => s.config.y,
  },
  {
    name: 'one read-only key that differs',
    initial: () => ({title: 'a', config: {x: 1, z: 1}}),
    write: (s) => {
      s.config.x = 2;
      s.config.z = 2;
    },
    lock: (s) => Object.defineProperty(s.config, 'x', {writable: false}),
    show: (s) => [s.config.x, s.config.z],
  },
  {
    name: 'frozen container whose child differs',
    initial: () => ({title: 'a', config: {inner: {v: 1}}}),
    write: (s) => {
      s.config.inner.v = 2;
    },
    lock: (s) => Object.freeze(s.config),
    show: (s) => s.config.inner.v,
  },
  {
    name: 'frozen array, an element differs',
    initial: () => ({title: 'a', config: [1, 2]}),
    write: (s) => {
      s.config[0] = 9;
    },
    lock: (s) => Object.freeze(s.config),
    show: (s) => [...s.config],
  },
  {
    name: 'frozen container, unchanged by the entry',
    initial: () => ({title: 'a', config: {x: 1}}),
    write: () => {},
    lock: (s) => Object.freeze(s.config),
    show: (s) => s.config.x,
  },
  {
    name: 'frozen root',
    initial: () => ({title: 'a', config: {x: 1}}),
    write: (s) => {
      s.config.x = 2;
    },
    lock: (s) => Object.freeze(s),
    show: (s) => s.config.x,
  },
];

for (const row of rows) {
  const s = createClassyStore(row.initial());
  const h = withHistory(s);
  await flush();
  s.title = 'b';
  row.write(s);
  await flush();
  row.lock(s);
  await flush();
  const container = s.config;
  const inner = s.config?.inner;
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  let r: string;
  try {
    h.undo();
    r = 'returns';
  } catch (e) {
    r = `throws ${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  const facts = {
    title: s.title,
    value: row.show(s),
    sameContainer: s.config === container,
    ...(inner ? {sameChild: s.config.inner === inner} : {}),
    frozenAfter: Object.isFrozen(s.config),
    canUndo: h.canUndo,
    canRedo: h.canRedo,
    syncCalls: calls,
  };
  let redo = '';
  if (r === 'returns') {
    try {
      h.redo();
      redo = `redo returns, title ${s.title}, value ${JSON.stringify(row.show(s))}`;
    } catch (e) {
      redo = `redo throws ${(e as Error).message}`;
    }
  }
  console.log(`| ${row.name} | ${r} | ${JSON.stringify(facts)} | ${redo} |`);
}
```

### `add-bench-rows.py`

```python
# add-bench-rows.py <runCoreBenchmark.mjs>: adds snapshot-getter rows and an absent-key read.
import sys
p = sys.argv[1]
s = open(p).read()
anchor = "  {\n    name: 'getter.rows.recompute',"
rows = """  {
    name: 'snapgetter.cached',
    about: 'Read a getter on a snapshot taken once',
    setup() {
      const store = createClassyStore(new Counter());
      const snap = snapshot(store);
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) sum += snap.double;
        return sum;
      };
    },
  },
  {
    name: 'snapgetter.memo',
    about: 'Write a field the getter does not read, snapshot, read the getter',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          store.label = String(index & 7);
          sum += snapshot(store).double;
        }
        return sum;
      };
    },
  },
  {
    name: 'snapgetter.recompute',
    about: 'Write the input of a getter, snapshot, read the getter',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++) {
          store.count = index;
          sum += snapshot(store).double;
        }
        return sum;
      };
    },
  },
  {
    name: 'store.read.absent',
    about: 'Read a key a nested plain object does not have',
    setup() {
      const store = createClassyStore({cache: {a: 1}});
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++)
          sum += store.cache.missing === undefined ? 1 : 0;
        return sum;
      };
    },
  },
"""
assert anchor in s and 'snapgetter.cached' not in s
s = s.replace(anchor, rows + anchor, 1)
open(p, 'w').write(s)
```

### `add-bench-class-absent.py`

```python
# add-bench-class-absent.py <runCoreBenchmark.mjs>: a read of a key a class instance does not have.
import sys
p = sys.argv[1]
s = open(p).read()
anchor = "  {\n    name: 'getter.rows.recompute',"
row = """  {
    name: 'store.read.absent.class',
    about: 'Read a key a class-instance store does not have',
    setup() {
      const store = createClassyStore(new Counter());
      return (iterations) => {
        let sum = 0;
        for (let index = 0; index < iterations; index++)
          sum += store.missing === undefined ? 1 : 0;
        return sum;
      };
    },
  },
"""
assert anchor in s and 'store.read.absent.class' not in s
open(p, 'w').write(s.replace(anchor, row + anchor, 1))
```

### `bench.sh`

```bash
#!/bin/bash
# bench.sh <rounds> "<only> ..." <outfile> <build>...: five fresh processes per
# build, engine and filter, the builds back to back in each round.
D=$(cd "$(dirname "$0")/.." && pwd)
rounds=$1; onlys=$2; out=$3; shift 3
for round in $(seq 1 $rounds); do
  for b in "$@"; do
    cd $D/builds/$b
    for eng in bun node; do
      for only in $onlys; do
        $eng packages/classy-store/tests/benchmark/runCoreBenchmark.mjs --runs 5 --only "$only" 2>&1 \
          | grep -E '^\| [a-z]' | grep -v '^| Metric\|^| Ratio' \
          | sed "s/^/$round $b $eng /" >> $out
      done
    done
  done
done
echo finished >> $out
```

### `summarize.py`

```python
# summarize.py <bench output>: per engine, metric and build, the medians of each round and the lowest and highest run.
import sys, collections
d = collections.defaultdict(lambda: {'med': [], 'lo': [], 'hi': []})
order = []
for line in open(sys.argv[1]):
    if '|' not in line: continue
    head, *cells = line.split('|')
    rnd, build, eng = head.split()
    metric = cells[0].strip()
    med, lo, hi = (float(c) for c in cells[1:4])
    k = (eng, metric, build)
    if k not in d: order.append(k)
    d[k]['med'].append(med); d[k]['lo'].append(lo); d[k]['hi'].append(hi)
for k in sorted(order, key=lambda k: (k[0], k[1])):
    v = d[k]
    print(f"{k[0]:5} {k[1]:22} {k[2]:6} med {', '.join(f'{m:g}' for m in v['med']):24} range {min(v['lo']):g} to {max(v['hi']):g}")
```

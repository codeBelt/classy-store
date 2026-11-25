# Stage 3 spikes: snapshots

Status: **in progress.** This file is written as the work goes, so that a
cut-off loses nothing. Sections marked "(pending)" are not done yet.

- Worktree: a detached copy of `release/1.0` at `74966f1`, in the scratch
  folder `<scratch>/stage-3-spike-snapshots/wt`. The library source at
  `74966f1` is identical to `57404c3`, the commit the first-wave patches were
  made against. Nothing here is committed anywhere.
- Patches: `<scratch>/stage-3-spike-snapshots/patches/`, and in the appendix
  of this file.

## Baseline

The unmodified worktree, measured before any spike, on Bun 1.4.5 and Node
24.21.0:

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes, after one
  `bun run build`.
- `bun run size`: main entry 3,661 bytes gzipped (budget 3,750); `./utils`
  adds 2,686, `./collections` 727, `./react` 1,662, `./react/server` 153,
  `./vue` 280, `./svelte` 182, `./angular` 271, `./solid` 312.

## N1. Rebuild only what changed

(pending)

## N2. How a snapshot carries class getters

- **Question.** API question 3: should a class getter stay an enumerable own
  accessor of every snapshot? Stage 1 findings 31, 41, 51 and 70; Valtio V4
  and V5, Immer question 3, MobX question 3; M33 and M34, contradiction 25.
- **Today.** `installMemoizedGetters()` walks the prototype chain for every
  snapshot of every object and defines one own accessor per getter, each with
  a new closure. An inherited getter is defined enumerable.

### The two forms

- **Form B, own and not enumerable** (`n2b-own-not-enumerable.patch`): one
  line of `snapshot.ts`. Everything else stays.
- **Form A, one derived prototype per class** (`n2a-one-loop.patch`): 122
  lines added, 58 removed, in five files.
  - `snapshot.ts`: `snapshotPrototype(proto)` makes, once per class
    prototype, an object that inherits from it and carries one memoizing
    accessor per getter of the class and its parents. A snapshot is created
    from that object. A class with no getter gets no derived object, and a
    plain object keeps `Object.prototype`.
  - The accessor is shared by every snapshot of the class, so it finds the
    raw object from `this`, through the map `core.ts` already keeps from a
    snapshot to its source (`snapshotSource()`, 5 lines).
  - The accessor asks the class at the time of the read
    (`Reflect.get(classPrototype, key, tracker)`), so a getter redefined on
    the class after the first snapshot is the one that runs, as today.
  - `cloneSnapshot.ts`: a mutable copy for undo or restore is made from the
    class prototype, not from the derived one. Without that, each undo would
    add one more layer to the prototype chain.
  - `snapshotTargetCache.ts` (React): proxy-compare reads a getter with a
    copy of the frozen snapshot as `this`. The copy is registered as standing
    for its snapshot, so a tracked read and a plain read share one cached
    result. Without it a getter read in a component would run on every read.
  - An own accessor, from an object literal, stays an own accessor of the
    snapshot with the flags it has in the source, under both forms.
  - The patch also writes own accessors in the place the store lists them
    (one loop over the own keys). That removes stage 1 finding 70 and is not
    needed for the form: with two loops the patch is 114 lines added, 51
    removed, and 27 bytes larger.

### What a snapshot looks like from outside

`repro/n2.ts`: a class `Cart extends Base` with three fields, eight getters,
one setter without a getter and one method. Rows that are the same in all
three columns are left out: `instanceof Cart` and `instanceof Base` are true,
`constructor === Cart`, the method is there, the snapshot is frozen, the
getter values and their memoization are the same, and so is what
proxy-compare reports as changed.

| Asked of a snapshot                                        | Today                               | Form B         | Form A              |
| ---------------------------------------------------------- | ----------------------------------- | -------------- | ------------------- |
| `Object.keys`, `for...in`, spread                          | 3 fields and 9 accessors            | The 3 fields   | The 3 fields        |
| `JSON.stringify`                                           | Runs every getter, carries each     | Data only      | Data only           |
| `structuredClone`                                          | Getter results as data (finding 51) | Data only      | Data only           |
| `Reflect.ownKeys`                                          | 12 keys                             | 12 keys        | The 3 fields        |
| `Object.hasOwn(snapshot, 'total')`                         | `true`                              | `true`         | `false`             |
| `'total' in snapshot`                                      | `true`                              | `true`         | `true`              |
| `Object.getPrototypeOf(snapshot) === Cart.prototype`       | `true`                              | `true`         | **`false`**         |
| The same for a class with no getter                        | `true`                              | `true`         | `true`              |
| A setter with no getter: own key, listed by `Object.keys`  | Yes, yes                            | Yes, no        | No, no              |
| `shallowEqual(snapshot, new PointWithGetter())`            | `false`: the keys differ            | `true`         | `false`: prototypes |
| `shallowEqual(snapshot, new PointWithoutGetter())`         | `true`                              | `true`         | `true`              |
| `Object.keys` of the tracking proxy the React hook returns | 12 keys                             | 3              | 3                   |
| Getter redefined on the class, then a new snapshot         | The new getter                      | The new getter | The new getter      |
| Getter added to the class after the first snapshot         | Memoized                            | Memoized       | Runs on every read  |
| Clone for undo: prototype, own keys                        | The class, 3                        | The class, 3   | The class, 3        |

An object literal with a getter, `{count: 2, get double() {…}}`, is the same
under all three: `double` is an own enumerable accessor of the snapshot, as
it is of the store, and `Object.keys`, spread and `JSON.stringify` carry it.
Today and under form B the snapshot lists it after the data fields
(`count, nested, double` where the store says `count, double, nested`). The
one-loop patch of form A lists it where the store does.

### What a getter sees as `this`

Neither form changes this by itself: the getter still runs on a Proxy over an
empty object (findings 31 and 41). So I ran each form with the snapshot half
of the traps report's variant S1 on top (the frozen snapshot is the tracker's
target, with `has` and `ownKeys` traps). `repro/n2-this.ts`, a class with
fields `a` and `b` and twelve getters:

| Asked inside a snapshot getter                   | Store           | Today              | Today with S1 | Form B with S1 | Form A with S1 |
| ------------------------------------------------ | --------------- | ------------------ | ------------- | -------------- | -------------- |
| `Object.keys(this).length`                       | 2               | 0                  | 14            | 2              | 2              |
| `'b' in this`                                    | `true`          | `false`            | `true`        | `true`         | `true`         |
| `this instanceof Dict`                           | `true`          | `false`            | `true`        | `true`         | `true`         |
| A getter that returns `this`                     | The store       | The tracker        | The snapshot  | The snapshot   | The snapshot   |
| `Object.entries(this).length`                    | 2               | 0                  | `RangeError`  | 2              | 2              |
| `Reflect.ownKeys(this).length`                   | 2               | 0                  | 14            | **14**         | 2              |
| `for...in` count                                 | 2               | 0                  | 14            | 2              | 2              |
| Keys of `{...this}`                              | `a,b`           | none               | `RangeError`  | `a,b`          | `a,b`          |
| `Object.getOwnPropertyDescriptor(this, 'a')`     | 1               | `undefined`        | 1             | 1              | 1              |
| `Object.getPrototypeOf(this) === Dict.prototype` | `true`          | `false`            | `true`        | `true`         | **`false`**    |
| `JSON.stringify(this)`                           | `{"a":1,"b":2}` | `{}`               | `TypeError`   | The store's    | The store's    |
| A getter that writes a field of `this`           | Writes          | Dropped in silence | `TypeError`   | `TypeError`    | `TypeError`    |

So the traps report's reasoning holds, and is now run: with form A, S1
matches the store in every row but the prototype identity; with form B it
matches except that `Reflect.ownKeys(this)` lists the getters. S1 alone on
today's shape replaces a wrong answer with a stack overflow, as that report
said. Its variant S2 is then not needed: that saves the 86 bytes S2 costs
over S1.

### Result

| Measure             | Form B              | Form A                                | Form A with S1        |
| ------------------- | ------------------- | ------------------------------------- | --------------------- |
| Lines               | 1 changed           | 122 added, 58 removed                 | 157 added, 63 removed |
| Tests               | 1,333 pass, 8 fail  | 1,332 pass, 9 fail                    | 1,327 pass, 14 fail   |
| Typecheck           | Passes              | Passes                                | Passes                |
| Main entry, gzipped | 3,662 bytes, 1 more | 3,801 bytes, 140 more, 51 over budget | 3,900 bytes, 239 more |

S1's snapshot half costs 99 bytes on top of form A here. The traps report
gives 86 for it on top of its live part, where the two share code.

**The 8 tests both forms fail pin the shape that is being changed**, so each
is expected to flip (**fixes**, if question 3 is answered "change it"):

- `snapshot.test.ts`: "snapshot() > leaf types > exposes class getters as
  enumerable own properties".
- `snapshot.restoredGetters.test.ts`: "a nested object rebuilt by undo >
  still takes a class getter from its class, and lists it in a snapshot as
  before". Only its key list fails; the getter still works after undo.
- `core.characterisation.getters.test.ts`: "a getter that throws > makes
  spreading and JSON.stringify of the snapshot throw, but not Object.keys";
  "a getter on an object literal passed to createClassyStore > is an own
  enumerable key of the store, where a class getter is not" (its last line
  expects the getter in the JSON of a class snapshot); "a getter with a
  symbol key > is an inherited key of the store and an own enumerable
  accessor of the snapshot"; "static getters > on a class store are computed
  on its snapshot, which is an object and not a class" (spreading that
  snapshot no longer throws).
- `core.characterisation.invariants.test.ts`: "assigning **proto** or
  calling Object.setPrototypeOf on a store > a getter read before a
  prototype swap keeps its old result until a dependency changes" (its key
  list); "what reflection on a store hands out for a nested object >
  structuredClone of a snapshot is a plain, unfrozen copy with getter
  results as data and no class" (finding 51).

**The ninth, form A's one loop only**, pins finding 70 and is a fix:
`snapshot.ownKeys.test.ts`, "the own keys of a snapshot > list a getter
declared before a data field after that field".

**With S1 on top, either form: 5 more.** Four are the fixes the traps report
lists for findings 31 and 41. One is incidental: "a getter that writes to
the store while it runs > drops the write on a snapshot", which now gets a
`TypeError`. The getters report's G7a makes the same change on purpose.

No test asks for `Object.getPrototypeOf(snapshot) === Class.prototype`. No
regression in either form.

**Cost of a snapshot**, nanoseconds, the fastest of 75 samples in five fresh
processes per build. The machine had a load average of 35 to 44 on 10 cores
while this ran, so the fastest sample is the figure to read; the medians are
in appendix B. Measured on form A with two loops.

| Case                                                          | Bun: today | Form B | Form A | Node: today | Form B | Form A |
| ------------------------------------------------------------- | ---------: | -----: | -----: | ----------: | -----: | -----: |
| Class, 0 getters: write a field, take a snapshot              |        761 |    761 |    572 |       1,816 |  1,855 |  1,332 |
| Class, 8 getters: the same                                    |      2,063 |  2,572 |    477 |       5,761 |  6,980 |  1,333 |
| The same, then read one getter                                |      2,455 |  2,376 |    889 |       7,403 |  6,271 |  1,935 |
| The same, then read all eight                                 |      2,518 |  2,898 |  1,377 |       8,982 |  9,344 |  2,966 |
| A cached getter read on one snapshot                          |        7.0 |     11 |    2.8 |        23.6 |   23.5 |   12.5 |
| Object literal, 2 own getters: write, snapshot                |      1,047 |    980 |    729 |       2,900 |  2,985 |  2,494 |
| 1,000 rows of a class with 8 getters: first snapshot, per row |      2,870 |  2,489 |  1,242 |       7,933 |  7,964 |  3,071 |
| 1,000 rows of a class with 0 getters: the same                |      1,640 |  1,417 |  1,150 |       3,042 |  3,491 |  2,820 |

- A snapshot of a class with eight getters costs four times less under form
  A on both engines, and no longer depends on the number of getters. Today
  each getter adds about 160 nanoseconds per snapshot on Bun, as the Valtio
  report measured, and about 500 on Node.
- A class with no getter is a quarter faster too: the second walk over the
  prototype chain is gone.
- Form B costs what today costs. Its differences from today are inside the
  spread.

**Memory held by snapshots** (`repro/mem-n2.mjs`, Node with `--expose-gc`,
10,000 rows): a row snapshot of the class with eight getters holds 2,649
bytes today, 2,681 under form B and **160 under form A**. With no getter it
is about 200 in all three. Today each snapshot carries eight closures and
eight accessor slots of its own.

### What it breaks or changes for a user

Both forms:

- `Object.keys(snapshot)`, `for...in`, spread, `JSON.stringify` and
  `structuredClone` give the data fields, as they do for the store. Code that
  spreads a snapshot into component props, or serialises one, no longer gets
  the computed values and has to name them. `TUTORIAL.md` documents today's
  behaviour, so this is a change to documented behaviour.
- **The DevTools panel loses computed values.** `devtools()` sends
  `snapshot(store)` and the extension serialises it. `DEVTOOLS_TUTORIAL.md`
  says the panel shows "the computed `doubled` getter". If that is wanted,
  `devtools()` has to add getter values to what it sends. No test pins it.
- The types do not change, and cannot say this: `Snapshot<T>` maps every key
  of `T`, so `{...snap}.total` still type-checks and is `undefined`. The same
  is true of spreading any class instance in TypeScript.
- `persist`, `withHistory` and `devtools` already skip getters by name, and
  their tests pass unchanged.

Form A only:

- `Object.getPrototypeOf(snapshot)` is the derived object, not
  `Class.prototype`, for a class that has a getter. `instanceof` and
  `constructor` are unchanged. The reference says snapshots "keep the class
  prototype"; that sentence becomes "are instances of the class".
- `shallowEqual(snapshot, plainInstance)` is `false` for such a class. Today
  it is also `false`, because the snapshot has more keys.
- A getter added to a class after its first snapshot works and is not
  memoized. No test or doc does that.

### Against `pinned.md` and the decisions made since

`review/stage-3/pinned.md` says which snapshot and getter behaviours the docs
promise and which stage 1 only pinned. Read against its "Getters" and
"Snapshots" tables:

- **No row it labels guaranteed changes under either form.** The tests
  behind these rows pass on both: a snapshot runs no getter when it is taken
  and nothing again on the same snapshot; getters on collections stay
  memoized across an unrelated write; an object-literal getter is memoized
  and spread and JSON read its result; an overriding getter that calls
  `super` runs the base body; an own data property hides a prototype getter;
  a `Symbol.toStringTag` getter is memoized; undo puts back an own getter
  and leaves a class getter to its class (only the key list in that test
  flips).
- **One documented row changes, under both forms:** "Getters appear in a
  snapshot's keys, spread and JSON" (`TUTORIAL.md`). That is the change
  itself.
- **Rows it labels unspecified, and what they become:**
  - "A throwing getter makes spread and `JSON.stringify` of a snapshot
    throw": they no longer run a getter, so they do not throw.
  - "`structuredClone` of a snapshot gives a plain copy with getter values":
    the copy has the data fields only. `pinned.md` proposes to guarantee
    that a snapshot clones as data, which both forms keep. Today a getter
    that returns something that cannot be cloned makes the whole clone
    throw.
  - "A snapshot lists every data field before any getter" (finding 70):
    class getters are no longer listed; form A's one loop lists an own
    getter where the store does.
  - "Static getters of a class that is itself the store": spreading that
    snapshot no longer throws.
- **Defects 31 and 41** (`this` inside a snapshot getter) are fixed by S1
  with either form, as the table above shows.
- **Not in its tables:** the sentence of the API reference that a
  `PROXYABLE` class's snapshots "keep the class prototype". Form A changes
  it; no test checks it.

**Stored functions (the traps report's T1, strict form, now decided):** a
method is a function on the prototype chain, and a function held in a field
or a list is data. Neither form touches that. A snapshot never wraps a
function, and form A's derived prototype carries accessors only, so methods
are still inherited from the class. Run: `t1-strict.patch` with form A on
top fails 19 tests, exactly the 10 of T1 strict and the 9 of form A, and
`repro/n2.ts` prints the same as for form A alone.

### Recommendation

**Change the shape, and take form A. Before 1.0.**

- Both forms give the visible behaviour that every compared library has, and
  flip the same eight tests. If only that were wanted, form B is one line.
- Form A is the only one that also removes the cost: four times faster
  snapshots and sixteen times less memory for a class with eight getters, on
  the path every write in every adapter takes. It also makes
  `Reflect.ownKeys` agree with the store, lets the traps report's S1 match
  the store with no filtering, and drops the own key that a class setter
  gets today (own-code review, `s08`).
- Its price is 140 bytes and one sentence of the reference. The prototype
  identity is the only thing form B keeps that form A does not, and nothing
  in the tests, the docs' examples or the library reads it.
- If the owner would rather keep getter values in a spread, the fallback is
  today's shape with the traps report's S2, and a sentence that a snapshot
  has more keys than its store.

### Cost for stage 4

Five files; `snapshot.ts` is a mutation target. Tests first: the rows of the
two tables above as tests, including a tracked read through the React hook
that shares the cached result, three undo rounds that leave the prototype
chain one deep, and a getter redefined on the class. Rewrite the nine tests.
Docs: the paragraph in `TUTORIAL.md`, one sentence in `API_REFERENCE.md`,
point 3 of "Snapshot prototype" in `ARCHITECTURE.md`, and the DevTools
tutorial. Decide what `devtools()` sends. Medium risk, most of it in the
React path. **Size:** the main entry needs 140 bytes more, which is over
today's budget by 51 by itself.

## N3. A cycle in the data

- **Question.** What does a snapshot do with a store that refers to itself,
  and can it keep the cycle? Stage 1 findings 8 and 13; Valtio V3, Svelte 9,
  Solid 10, Immer 11; M36, dependency 12.
- **Today.** The live side handles a cycle: `store.self = store` succeeds,
  notifies once, and reads back at any depth. `pinned.md` proposes to
  guarantee that. `snapshot()` then throws "circular reference detected in
  snapshot" for every node on the cycle until the cycle is broken, which
  `TUTORIAL.md` documents. So the write works and every adapter's next read
  throws. `withHistory(store)` throws when it is attached to such a store.

### What was changed

`n3-cycles.patch`, 59 lines added, 30 removed, five files.

- `snapshot.ts`: the set of objects being built becomes a map from the raw
  object to its unfinished snapshot. A second visit returns that snapshot.
  An object is entered in the map before its children are visited, filled,
  and frozen when it is complete. An array is now filled by index, because
  it has to exist before its elements are visited.
- The map belongs to one `snapshot()` call, not to the shared cache, as the
  Valtio report asked. If a build throws part-way, every node that call
  built is dropped from the cache, so no cached node can keep a reference to
  an unfinished one.
- `useClassyStore.ts`: `isChanged` gets a `WeakMap` as its fourth argument,
  proxy-compare's own guard for data with a cycle.
- `history.ts` and `cloneSnapshot.ts`, 2 lines: a restore is told that the
  recorded root stands for the store itself. Without it an undo replaces
  `store.self` by a deep copy of the whole state.

### Reproduction

`repro/n3.ts`, on the spike. On the unmodified library each `snapshot()` in
these rows throws.

| Case                                                                       | Result                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `store.self = store`: `snapshot(store).self === snapshot(store)`           | `true`, and every reachable object frozen                                                                      |
| A write, then a new snapshot                                               | New root, `self` is the new root, a sibling object keeps its snapshot, the old snapshot still points to itself |
| `snapshot(store.self)`                                                     | The root snapshot                                                                                              |
| A ring of two, a list that holds itself, two stores that hold each other   | All kept, all frozen                                                                                           |
| Getters on the snapshot, also one that reads through the cycle             | Right                                                                                                          |
| `shallowEqual`, `structuredClone`, `subscribeKey`, `cloneSnapshotValue`    | Work; the clones keep the cycle                                                                                |
| `JSON.stringify(snapshot)`                                                 | `TypeError`, as for the store itself                                                                           |
| `persist` with every field                                                 | Stores nothing; `onError` gets `write: TypeError: JSON.stringify cannot serialize cyclic structures`           |
| `persist` with `properties` that leave the cyclic field out                | Stores                                                                                                         |
| `withHistory`: undo, redo                                                  | `store.self === store` after both                                                                              |
| The same without the two lines in `history.ts` and `cloneSnapshot.ts`      | **`store.self` is a copy of the state**                                                                        |
| `isChanged` without the guard, after an unrelated write                    | **`RangeError`, stack overflow**                                                                               |
| The real hook, rendered (`spikeCycle.test.tsx`)                            | Renders for a write read through the cycle, not for another                                                    |
| A build that throws part-way, then a good one (`repro/n3-failed-build.ts`) | The next snapshot is whole and frozen                                                                          |
| The same without dropping what the failed call built                       | **A cached child points to an unfinished, unfrozen root**                                                      |

**What a cycle costs.** A tree of 1,000 children, each with a `parent`
field that holds the root:

| Measure after one child is written         | With parent pointers | Without |
| ------------------------------------------ | -------------------- | ------- |
| Children that get a new snapshot           | 1,000 of 1,000       | 1       |
| Write and snapshot, Bun, on a busy machine | 2,188 microseconds   | 145     |

This is not a weakness of the spike. A child's snapshot holds the root's
snapshot, the root's snapshot is a new object after any write, so every
child's snapshot has to be new. Everything on a cycle changes together. A
selector that returns a row then sees a change on every write to any row
(the second test of `spikeCycle.test.tsx`), and stage 1 finding 13 is the
same fact for a getter.

### Result

- **Tests:** 1,334 pass, 7 fail. All seven assert the throw:
  - `snapshot.test.ts`, "snapshot() > special structures": "throws a clear
    error when the store contains a circular reference", "throws on a
    self-referencing array (tracked sub-tree)", "throws on a circular
    reference inside an untracked nested plain object".
  - `core.characterisation.identity.test.ts`, "reference cycles": "a
    self-reference assigned later makes snapshot() throw, and deleting it
    makes snapshot() work again", "a subtree outside the cycle can still be
    snapshotted on its own", "two objects that reference each other read
    each other back, and snapshot() throws for every node on the path to
    them", "two stores that reference each other notify each other and
    cannot be snapshotted until one lets go".
  - The throw is documented, so these are **fixes** only if the decision is
    to keep cycles. The live-side halves of those tests still hold.
- **Typecheck:** passes.
- **Size:** main entry 3,652 bytes, 9 fewer: the error text goes. `./utils`
  adds 2,707 (21 more, budget 2,750). `./react` adds 1,692 (30 more, budget
  1,700): the guard, and the array helper it shares now being two functions.
- **The guard's cost on data without a cycle** (`repro/bench-guard.mjs`):
  for a component that read 1,000 rows, an `isChanged` after an unrelated
  write takes 28 nanoseconds without the guard and 42 with it on Bun, 41 and
  70 on Node. When a row it read changed, the two are the same inside the
  spread (48 microseconds on Bun, 14 on Node).
- **Timings of the snapshot itself:** under "The combination".

### What it breaks or changes for a user

- `snapshot()` of a store with a cycle returns where it threw. Every
  adapter, `subscribeKey` and `withHistory` then work on such a store.
- The tutorial's sentence "Circular references in traversed state are
  rejected by `snapshot()`" goes. Its place is taken by the cost above:
  everything on a cycle gets a new snapshot on every write to any of it.
- `JSON.stringify` of such a snapshot throws, as it does for any object with
  a cycle. `persist` reports it through `onError`.

### Recommendation

**Keep the cycle. Before 1.0**, because it reverses a documented sentence.

- All four reports agree on what to remove: a write that succeeds and a
  store that can then not be read. This removes it for 9 bytes less than
  today, and nothing that works today stops working.
- The other way, refusing the write that closes a cycle, was not spiked. It
  needs a walk from the new parent up to the roots on every assignment of an
  object, and a second check for a cycle that is already in the object given
  to `createClassyStore()`, which the live side accepts today and
  `pinned.md` proposes to guarantee.
- **What the owner should know before agreeing:** a cycle is correct and
  slow. A model with parent pointers loses structural sharing for everything
  the pointers connect. The docs should say so and name the alternative:
  hold the parent's id, or hold the parent in an object the store does not
  proxy.
- Not checked: what the Redux DevTools extension does with a snapshot that
  holds a cycle. `devtools()` hands the snapshot over and does not serialise
  it.

### Cost for stage 4

`snapshot.ts` (a mutation target), `internal.ts`, the React hook,
`history.ts`, `cloneSnapshot.ts`. Tests first: the rows of the table, the
failed build that leaves nothing cached, and the two React tests. Rewrite
the seven tests. One paragraph in `TUTORIAL.md` and one in `PATTERNS.md`.
Medium risk: the cache and the freeze order are the heart of `snapshot.ts`.
**Size:** the `./react` budget is left with 8 bytes.

## N4. Types

- **Question.** Can `Snapshot<T>` keep a tuple a tuple, and can a snapshot of
  a reactive collection lose its mutators in the type and name the cause when
  one is called? Stage 1 findings 14 and 16; Valtio V10 and V11, Immer 8 and
  10, Vue 11; M41 and M42. `pinned.md` lists both as defects.

### Tuples

- **What was changed** (`n4a-tuple.patch`). `types.ts`: the array branch of
  `Snapshot<T>` is deleted, 3 lines added and 5 removed. The mapped type
  already handles arrays, read-only arrays and tuples.
- **Result.**
  - Unit tests: 1,341 pass. Nothing runs differently.
  - Typecheck: 2 errors, both **fixes**. `types.index.test.ts`, "Snapshot
    turns a tuple into a readonly array of the union of its members", pins
    finding 14. `types.collections.test.ts`, line 87 of the test that pins
    finding 16: the backing array of a map snapshot is now an array of
    `readonly [key, value]` pairs, where it was an array of arrays of the
    union.
  - A spike test (`spikeTypes.test.ts`, appendix C) asserts the new types and
    passes the typecheck: `[string, number]` gives `readonly [string,
    number]`; optional, named and rest elements survive; an array of objects
    gives the type it gives today; `snap.pair.length` is `2`; reading a third
    position is a type error.
  - Size: no change. Nothing is emitted for a type.
- **What it changes for a user.** A tuple's snapshot type becomes exact.
  Code that relied on the union, for example `snap.pair.map(…)` typed over
  `string | number`, still compiles, since a tuple is an array. The Next.js
  example casts `snap.recipes._entries` to an array of pairs in two places;
  the casts become unnecessary and still compile.
- **Recommendation: do it. Before 1.0**, because it changes a public type.
- **Cost for stage 4.** One branch of one type, two type tests rewritten,
  the spike test's cases added. Risk low.

### Collection snapshots

- **What was changed** (`n4-types-with-backing.patch`, 81 lines added, 6
  removed, with the tuple change included).
  - `collections.ts`: two exported types, `ReactiveMapSnapshot<K, V>` and
    `ReactiveSetSnapshot<T>`: `size`, the queries and the iterators, no
    `set`, `add`, `delete` or `clear`. `get` returns `Snapshot<V>`, where
    today it is typed as the mutable `V` and returns a frozen object. `get`
    and `has` accept a key or a snapshot of it, which is what the lookup
    matches at run time.
  - `types.ts`: `Snapshot<T>` maps `ReactiveMap` and `ReactiveSet` to those
    two types, through a type-only import.
  - `collections.ts`: one helper, `assertWritable(this)`, called first in
    `set`, `delete` and `clear` of both classes and in `add`. It throws a
    `TypeError` with a message of ours when the collection behind `this` is
    frozen. `unwrap()` makes it see through a store proxy and through a
    React tracking proxy.
  - Two variants of the types were run: with the backing arrays `_entries`
    and `_items` kept as read-only members, and without them
    (`n4-types.patch`).
- **Reproduction** (`repro/n4.ts`, on Bun):

  | Call on a snapshot                              | Today                                                                          | Spike           |
  | ----------------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
  | `map.set(…)`, `set.add(new)`                    | `TypeError: Attempted to assign to readonly property.`                         | Our `TypeError` |
  | `map.delete(existing)`, `clear()`               | `TypeError: Unable to delete property.`                                        | Our `TypeError` |
  | `map.delete(missing)`, `set.delete(missing)`    | Returns `false`                                                                | Our `TypeError` |
  | `set.add(existing)`                             | Returns the collection                                                         | Our `TypeError` |
  | The same calls through a React tracking proxy   | `Proxy object's 'set' trap returned falsy value for property '1'`, or as above | Our `TypeError` |
  | `add` on a set its owner froze, held in a store | **Adds, and notifies no one**                                                  | Our `TypeError` |
  | `set` and `add` on the live store               | Work                                                                           | Work            |

  The sixth row was not in any finding. `Object.freeze(reactiveSet())`
  freezes the instance and not its backing array. The store keeps a frozen
  object by reference and does not look inside, so `add()` pushes to the raw
  array: the collection changes and no subscriber hears. With the check it
  throws.
- **Result.**
  - Unit tests: 1,341 pass, 0 fail. The existing tests expect a `TypeError`
    and still get one.
  - Typecheck, backing arrays kept: errors in 3 tests, all **fixes**. The
    test that pins finding 16 in `types.collections.test.ts` (12 lines of
    it); the tuple test above; and `types.snapshot.test.ts`, "keeps typed
    reactive collection queries callable", which expects `get` on a snapshot
    to have the live signature.
  - Typecheck, backing arrays hidden: the same, and 5 more lines that read
    `_entries` or `_items` from a snapshot: four in `collections.test.ts`
    and one in `persist.test.ts`. **Incidental.**
  - The examples and the docs site, each checked on its own after a build:
    all pass with the backing arrays kept. With them hidden the Next.js
    example fails in 7 places, in four components that read
    `snap.recipes._entries` or `snap.allTags._items`.
  - `bun run check:package` passes: publint and arethetypeswrong accept the
    main entry's declarations importing a shared declaration file for the
    collection types.
  - Size: the main entry is unchanged. `./collections` adds 815 bytes, 88
    more than today and 65 over its budget of 750. With the message cut to
    "a snapshot of a collection is read-only" it adds 782, which is 32 over.
- **What it breaks or changes for a user.**
  - `snapshot(store).todos.set(…)` no longer compiles. It throws today.
  - `snapshot(store).todos.get(key)` is typed read-only. Code that assigned
    to a field of the result compiled and threw.
  - A mutator that would change nothing (`delete` of a missing key, `add` of
    a member already there) throws on a snapshot, where it returned.
  - `API_REFERENCE.md` says of `Snapshot<T>`: "Methods keep their
    signatures". That sentence needs the exception.
- **Recommendation: do it, with the backing arrays kept read-only in the
  snapshot type. Before 1.0.**
  - Whether `_entries` and `_items` are public at all is M43, and it has to
    be decided before 1.0 for the live type anyway. This spike shows the
    owner's own example reads them from snapshots, so hiding them is a
    change to plan for, not a detail.
  - Take the short message, or decide the text with the development build
    (M72). Either way the collections budget moves by 32 to 65 bytes.
  - A general hook that lets any class name its snapshot type (Valtio V10)
    was not spiked. It is an addition and can follow 1.0: a class that does
    not use it is typed as today.
- **Cost for stage 4.** `collections.ts`, `types.ts`, the collections entry.
  Three type tests rewritten, new type tests for the two snapshot types,
  runtime tests for each row of the table, including the tracked proxy and
  the frozen collection. One sentence in the API reference and a paragraph
  in the collections guide. Risk low. **Size:** the budget for `./collections`
  (750) has to move.

## N5. `subscribeKey` without a snapshot of the whole store

(pending)

## The combination

(pending)

## Verified and not verified

(pending)

## Appendix A: patches

Each patch is against the unmodified worktree unless its line says
otherwise. Apply one with `git apply <file>` from the worktree root. If
`git apply` calls a patch corrupt at its last line, the blank context line
at its end lost its single space.

### `n2b-own-not-enumerable.patch`

N2, form B: class getters stay own accessors of a snapshot and are not enumerable.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..2de6afd 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -212,7 +212,7 @@ function installMemoizedGetters(snap: object, target: object): void {
       originalAccessors.set(memoizedGetter, own ? descriptor : null);
       Object.defineProperty(snap, key, {
         get: memoizedGetter,
-        enumerable: own ? descriptor.enumerable : true,
+        enumerable: own ? descriptor.enumerable : false,
         configurable: true,
       });
     }
```

### `n2a-one-loop.patch`

N2, form A as recommended: one derived prototype per class, and own accessors written in the place the store lists them.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0103258 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -45,6 +45,11 @@ export function unwrap<T>(value: T): T {
   return (trackedSnapshots.get(value) ?? value) as T;
 }
 
+/** @internal The raw object a snapshot, or a tracked read of one, was built from. */
+export function snapshotSource(value: object): object | undefined {
+  return snapshotSources.get(trackedSnapshots.get(value) ?? value);
+}
+
 /**
  * @internal One identity for a raw object, its store proxy, every snapshot of
  * it, and tracked reads of those snapshots. Primitives are their own identity.
diff --git a/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts b/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
index feea8b0..1ca4a7e 100644
--- a/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
+++ b/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
@@ -1,3 +1,4 @@
+import {registerTrackingProxy} from '../../../../storeRuntime';
 import {mapOwnArrayElements} from '../../../../utils/internal/internal';
 
 const readonlyTarget: ProxyHandler<object> = {
@@ -39,6 +40,9 @@ export class SnapshotTargetCache extends WeakMap<object, unknown> {
       // per-consumer proxy. Update the tuple in place: createProxy's first call
       // continues using this same tuple immediately after cache.set().
       entry[1] = new Proxy(entry[1], readonlyTarget);
+      // A class getter read through a tracking proxy runs with this copy as
+      // `this`. It has to find the snapshot the copy stands for.
+      registerTrackingProxy(entry[1], entry[0]);
     }
     return super.set(key, entry);
   }
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..2b8df5a 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,10 @@
 import {markToTrack} from 'proxy-compare';
-import {getInternal, registerSnapshot} from '../core/core';
+import {
+  getInternal,
+  registerSnapshot,
+  snapshotSource,
+  unwrap,
+} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -21,17 +26,67 @@ const snapshotGetterCache = new WeakMap<
   Map<string | symbol, unknown>
 >();
 
-// A mutable restore needs the user's own descriptor, or the inherited getter
-// already present on the clone's prototype.
-const originalAccessors = new WeakMap<
-  () => unknown,
-  PropertyDescriptor | null
->();
+// A mutable restore needs the user's own descriptor back.
+const originalAccessors = new WeakMap<() => unknown, PropertyDescriptor>();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
   return getter && originalAccessors.get(getter);
 }
 
+// One derived prototype per class: it inherits from the class prototype and
+// carries a memoizing accessor for each getter the class and its parents have.
+const snapshotPrototypes = new WeakMap<object, object>();
+const classPrototypes = new WeakMap<object, object>();
+
+/** The class prototype behind a snapshot's prototype, for a mutable restore. */
+export function originalSnapshotPrototype(proto: object | null): object | null {
+  return (proto && classPrototypes.get(proto)) ?? proto;
+}
+
+function snapshotPrototype(proto: object | null): object | null {
+  if (!proto || proto === Object.prototype) return proto;
+  let derived = snapshotPrototypes.get(proto);
+  if (derived) return derived;
+  derived = Object.create(proto) as object;
+  const seen = new Set<string | symbol>();
+  let count = 0;
+  for (
+    let owner: object | null = proto;
+    owner && owner !== Object.prototype;
+    owner = Object.getPrototypeOf(owner)
+  ) {
+    for (const key of Reflect.ownKeys(owner)) {
+      // The nearest definition wins, as it does in a property lookup.
+      if (seen.has(key)) continue;
+      seen.add(key);
+      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
+      if (!descriptor?.get) continue;
+      count++;
+      // Ask the class at the time of the read, so a getter redefined on the
+      // class later is the one that runs.
+      const run = (self: object) => Reflect.get(proto, key, self);
+      Object.defineProperty(derived, key, {
+        get(this: object) {
+          const cache = snapshotGetterCache.get(this);
+          if (cache?.has(key)) return cache.get(key);
+          const target = snapshotSource(this);
+          // Not one of our snapshots: the class getter as it was written.
+          return target
+            ? evaluateSnapshotGetter(unwrap(this), target, key, run)
+            : run(this);
+        },
+        enumerable: descriptor.enumerable,
+        configurable: true,
+      });
+    }
+  }
+  // A class without getters needs no layer of its own.
+  if (!count) derived = proto;
+  else classPrototypes.set(derived, proto);
+  snapshotPrototypes.set(proto, derived);
+  return derived;
+}
+
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
 
 /**
@@ -71,7 +126,7 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
-  getterFn: () => unknown,
+  run: (self: object) => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
   const readProps = new Set<string | symbol>();
@@ -91,7 +146,7 @@ function computeWithTracking(
   };
 
   const tracked = new Proxy({}, handler);
-  const result = getterFn.call(tracked);
+  const result = run(tracked);
   return {deps, result};
 }
 
@@ -122,7 +177,7 @@ function evaluateSnapshotGetter(
   currentSnap: object,
   target: object,
   key: string | symbol,
-  getterFn: () => unknown,
+  run: (self: object) => unknown,
 ): unknown {
   // ── Per-snapshot fast path ──
   const perSnapCache = snapshotGetterCache.get(currentSnap);
@@ -139,7 +194,7 @@ function evaluateSnapshotGetter(
     result = prev.result;
   } else {
     // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
+    const computation = computeWithTracking(currentSnap, run);
     result = computation.result;
 
     // Save cross-snapshot memo.
@@ -192,32 +247,25 @@ function snapshotValue(
     : value;
 }
 
-/** Install the nearest accessor for each key without invoking user code. */
-function installMemoizedGetters(snap: object, target: object): void {
-  const seen = new Set<string | symbol>();
-  let proto: object | null = target;
-  while (proto && proto !== Object.prototype) {
-    for (const key of Reflect.ownKeys(proto)) {
-      if (seen.has(key)) continue;
-      seen.add(key);
-      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
-      if (!descriptor || 'value' in descriptor) continue;
-      const getter = descriptor.get;
-      function memoizedGetter(this: object) {
-        return getter
-          ? evaluateSnapshotGetter(this, target, key, getter)
-          : undefined;
-      }
-      const own = proto === target;
-      originalAccessors.set(memoizedGetter, own ? descriptor : null);
-      Object.defineProperty(snap, key, {
-        get: memoizedGetter,
-        enumerable: own ? descriptor.enumerable : true,
-        configurable: true,
-      });
-    }
-    proto = Object.getPrototypeOf(proto);
+/** Install one own accessor of the target without invoking user code. */
+function installOwnGetter(
+  snap: object,
+  target: object,
+  key: string | symbol,
+  descriptor: PropertyDescriptor,
+): void {
+  const getter = descriptor.get;
+  function memoizedGetter(this: object) {
+    return getter
+      ? evaluateSnapshotGetter(this, target, key, (self) => getter.call(self))
+      : undefined;
   }
+  originalAccessors.set(memoizedGetter, descriptor);
+  Object.defineProperty(snap, key, {
+    get: memoizedGetter,
+    enumerable: descriptor.enumerable,
+    configurable: true,
+  });
 }
 
 /**
@@ -261,21 +309,24 @@ function createSnapshotRecursive<T extends object>(
     );
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
-    snap = Object.create(Object.getPrototypeOf(target));
+    snap = Object.create(snapshotPrototype(Object.getPrototypeOf(target)));
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
-      if (!desc || !('value' in desc)) continue;
-      // Assignment can call an inherited setter (including Object.prototype.__proto__).
-      Object.defineProperty(snap, key, {
-        value: snapshotValue(desc.value, internal, key, inProgress),
-        enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
-      });
+      if (!desc) continue;
+      if ('value' in desc) {
+        // Assignment can call an inherited setter (including Object.prototype.__proto__).
+        Object.defineProperty(snap, key, {
+          value: snapshotValue(desc.value, internal, key, inProgress),
+          enumerable: desc.enumerable,
+          configurable: true,
+          writable: true,
+        });
+      } else {
+        // An own accessor, from an object literal, stays an own accessor in
+        // the place the store lists it. Class getters are on the prototype.
+        installOwnGetter(snap, target, key, desc);
+      }
     }
-
-    // Install lazy-memoizing getters with cross-snapshot caching.
-    installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
   }
 
   markSnapshotForTracking(snap);
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..a77e6af 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -12,4 +12,8 @@ export {
   unwrap,
 } from './core/core';
 export {hydrationSnapshots} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
-export {originalSnapshotAccessor, snapshot} from './snapshot/snapshot';
+export {
+  originalSnapshotAccessor,
+  originalSnapshotPrototype,
+  snapshot,
+} from './snapshot/snapshot';
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..b89ab96 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,4 +1,7 @@
-import {originalSnapshotAccessor} from '../../storeRuntime';
+import {
+  originalSnapshotAccessor,
+  originalSnapshotPrototype,
+} from '../../storeRuntime';
 import {canProxy} from '../internal/internal';
 
 /** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
@@ -16,7 +19,7 @@ export function cloneSnapshotValue(
         new Array(value.length),
         Object.getPrototypeOf(value),
       )
-    : Object.create(Object.getPrototypeOf(value));
+    : Object.create(originalSnapshotPrototype(Object.getPrototypeOf(value)));
   clones.set(value, clone);
 
   for (const key of Reflect.ownKeys(value)) {
@@ -24,13 +27,10 @@ export function cloneSnapshotValue(
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     if (!descriptor) continue;
     if (!('value' in descriptor)) {
-      const original = originalSnapshotAccessor(descriptor.get);
-      if (original !== null) {
-        Object.defineProperty(clone, key, {
-          ...(original ?? descriptor),
-          configurable: true,
-        });
-      }
+      Object.defineProperty(clone, key, {
+        ...(originalSnapshotAccessor(descriptor.get) ?? descriptor),
+        configurable: true,
+      });
       continue;
     }
     Object.defineProperty(clone, key, {
```

### `n2a-one-loop-with-s1.patch`

N2, form A with the snapshot half of the traps report's S1 on top, as one patch.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..0103258 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -45,6 +45,11 @@ export function unwrap<T>(value: T): T {
   return (trackedSnapshots.get(value) ?? value) as T;
 }
 
+/** @internal The raw object a snapshot, or a tracked read of one, was built from. */
+export function snapshotSource(value: object): object | undefined {
+  return snapshotSources.get(trackedSnapshots.get(value) ?? value);
+}
+
 /**
  * @internal One identity for a raw object, its store proxy, every snapshot of
  * it, and tracked reads of those snapshots. Primitives are their own identity.
diff --git a/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts b/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
index feea8b0..1ca4a7e 100644
--- a/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
+++ b/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts
@@ -1,3 +1,4 @@
+import {registerTrackingProxy} from '../../../../storeRuntime';
 import {mapOwnArrayElements} from '../../../../utils/internal/internal';
 
 const readonlyTarget: ProxyHandler<object> = {
@@ -39,6 +40,9 @@ export class SnapshotTargetCache extends WeakMap<object, unknown> {
       // per-consumer proxy. Update the tuple in place: createProxy's first call
       // continues using this same tuple immediately after cache.set().
       entry[1] = new Proxy(entry[1], readonlyTarget);
+      // A class getter read through a tracking proxy runs with this copy as
+      // `this`. It has to find the snapshot the copy stands for.
+      registerTrackingProxy(entry[1], entry[0]);
     }
     return super.set(key, entry);
   }
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..78c1d22 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,10 @@
 import {markToTrack} from 'proxy-compare';
-import {getInternal, registerSnapshot} from '../core/core';
+import {
+  getInternal,
+  registerSnapshot,
+  snapshotSource,
+  unwrap,
+} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -21,17 +26,67 @@ const snapshotGetterCache = new WeakMap<
   Map<string | symbol, unknown>
 >();
 
-// A mutable restore needs the user's own descriptor, or the inherited getter
-// already present on the clone's prototype.
-const originalAccessors = new WeakMap<
-  () => unknown,
-  PropertyDescriptor | null
->();
+// A mutable restore needs the user's own descriptor back.
+const originalAccessors = new WeakMap<() => unknown, PropertyDescriptor>();
 
 export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
   return getter && originalAccessors.get(getter);
 }
 
+// One derived prototype per class: it inherits from the class prototype and
+// carries a memoizing accessor for each getter the class and its parents have.
+const snapshotPrototypes = new WeakMap<object, object>();
+const classPrototypes = new WeakMap<object, object>();
+
+/** The class prototype behind a snapshot's prototype, for a mutable restore. */
+export function originalSnapshotPrototype(proto: object | null): object | null {
+  return (proto && classPrototypes.get(proto)) ?? proto;
+}
+
+function snapshotPrototype(proto: object | null): object | null {
+  if (!proto || proto === Object.prototype) return proto;
+  let derived = snapshotPrototypes.get(proto);
+  if (derived) return derived;
+  derived = Object.create(proto) as object;
+  const seen = new Set<string | symbol>();
+  let count = 0;
+  for (
+    let owner: object | null = proto;
+    owner && owner !== Object.prototype;
+    owner = Object.getPrototypeOf(owner)
+  ) {
+    for (const key of Reflect.ownKeys(owner)) {
+      // The nearest definition wins, as it does in a property lookup.
+      if (seen.has(key)) continue;
+      seen.add(key);
+      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
+      if (!descriptor?.get) continue;
+      count++;
+      // Ask the class at the time of the read, so a getter redefined on the
+      // class later is the one that runs.
+      const run = (self: object) => Reflect.get(proto, key, self);
+      Object.defineProperty(derived, key, {
+        get(this: object) {
+          const cache = snapshotGetterCache.get(this);
+          if (cache?.has(key)) return cache.get(key);
+          const target = snapshotSource(this);
+          // Not one of our snapshots: the class getter as it was written.
+          return target
+            ? evaluateSnapshotGetter(unwrap(this), target, key, run)
+            : run(this);
+        },
+        enumerable: descriptor.enumerable,
+        configurable: true,
+      });
+    }
+  }
+  // A class without getters needs no layer of its own.
+  if (!count) derived = proto;
+  else classPrototypes.set(derived, proto);
+  snapshotPrototypes.set(proto, derived);
+  return derived;
+}
+
 // ── Cross-snapshot getter memoization ─────────────────────────────────────────
 
 /**
@@ -39,7 +94,12 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  /** `has`: `prop in this`. `keys`: the own keys of `this`. Otherwise a read. */
+  kind?: 'has' | 'keys';
+  prop: string | symbol;
+  value: unknown;
+};
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -71,7 +131,7 @@ const crossSnapshotMemo = new WeakMap<
  */
 function computeWithTracking(
   snap: object,
-  getterFn: () => unknown,
+  run: (self: object) => unknown,
 ): {deps: GetterDep[]; result: unknown} {
   const deps: GetterDep[] = [];
   const readProps = new Set<string | symbol>();
@@ -88,11 +148,24 @@ function computeWithTracking(
       }
       return value;
     },
+    has(_target, prop) {
+      const value = Reflect.has(snap, prop);
+      deps.push({kind: 'has', prop, value});
+      return value;
+    },
+    ownKeys() {
+      const value = Reflect.ownKeys(snap);
+      deps.push({kind: 'keys', prop: '', value});
+      return value;
+    },
   };
 
-  const tracked = new Proxy({}, handler);
-  const result = getterFn.call(tracked);
-  return {deps, result};
+  // The frozen snapshot is the target, so an operation without a trap
+  // (`instanceof`, a descriptor read) answers for the snapshot itself.
+  const tracked = new Proxy(snap, handler);
+  const result = run(tracked);
+  // A getter that returns `this` returns the snapshot, not the tracker.
+  return {deps, result: result === tracked ? snap : result};
 }
 
 /**
@@ -103,8 +176,20 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    if (dep.kind === 'has') {
+      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;
+    } else if (dep.kind === 'keys') {
+      const before = dep.value as (string | symbol)[];
+      const now = Reflect.ownKeys(currentSnap);
+      if (
+        now.length !== before.length ||
+        now.some((key, index) => key !== before[index])
+      )
+        return false;
+    } else if (
+      !Object.is(Reflect.get(currentSnap, dep.prop, currentSnap), dep.value)
+    )
+      return false;
   }
   return true;
 }
@@ -122,7 +207,7 @@ function evaluateSnapshotGetter(
   currentSnap: object,
   target: object,
   key: string | symbol,
-  getterFn: () => unknown,
+  run: (self: object) => unknown,
 ): unknown {
   // ── Per-snapshot fast path ──
   const perSnapCache = snapshotGetterCache.get(currentSnap);
@@ -139,7 +224,7 @@ function evaluateSnapshotGetter(
     result = prev.result;
   } else {
     // Compute fresh with dep tracking.
-    const computation = computeWithTracking(currentSnap, getterFn);
+    const computation = computeWithTracking(currentSnap, run);
     result = computation.result;
 
     // Save cross-snapshot memo.
@@ -192,32 +277,25 @@ function snapshotValue(
     : value;
 }
 
-/** Install the nearest accessor for each key without invoking user code. */
-function installMemoizedGetters(snap: object, target: object): void {
-  const seen = new Set<string | symbol>();
-  let proto: object | null = target;
-  while (proto && proto !== Object.prototype) {
-    for (const key of Reflect.ownKeys(proto)) {
-      if (seen.has(key)) continue;
-      seen.add(key);
-      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
-      if (!descriptor || 'value' in descriptor) continue;
-      const getter = descriptor.get;
-      function memoizedGetter(this: object) {
-        return getter
-          ? evaluateSnapshotGetter(this, target, key, getter)
-          : undefined;
-      }
-      const own = proto === target;
-      originalAccessors.set(memoizedGetter, own ? descriptor : null);
-      Object.defineProperty(snap, key, {
-        get: memoizedGetter,
-        enumerable: own ? descriptor.enumerable : true,
-        configurable: true,
-      });
-    }
-    proto = Object.getPrototypeOf(proto);
+/** Install one own accessor of the target without invoking user code. */
+function installOwnGetter(
+  snap: object,
+  target: object,
+  key: string | symbol,
+  descriptor: PropertyDescriptor,
+): void {
+  const getter = descriptor.get;
+  function memoizedGetter(this: object) {
+    return getter
+      ? evaluateSnapshotGetter(this, target, key, (self) => getter.call(self))
+      : undefined;
   }
+  originalAccessors.set(memoizedGetter, descriptor);
+  Object.defineProperty(snap, key, {
+    get: memoizedGetter,
+    enumerable: descriptor.enumerable,
+    configurable: true,
+  });
 }
 
 /**
@@ -261,21 +339,24 @@ function createSnapshotRecursive<T extends object>(
     );
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
-    snap = Object.create(Object.getPrototypeOf(target));
+    snap = Object.create(snapshotPrototype(Object.getPrototypeOf(target)));
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
-      if (!desc || !('value' in desc)) continue;
-      // Assignment can call an inherited setter (including Object.prototype.__proto__).
-      Object.defineProperty(snap, key, {
-        value: snapshotValue(desc.value, internal, key, inProgress),
-        enumerable: desc.enumerable,
-        configurable: true,
-        writable: true,
-      });
+      if (!desc) continue;
+      if ('value' in desc) {
+        // Assignment can call an inherited setter (including Object.prototype.__proto__).
+        Object.defineProperty(snap, key, {
+          value: snapshotValue(desc.value, internal, key, inProgress),
+          enumerable: desc.enumerable,
+          configurable: true,
+          writable: true,
+        });
+      } else {
+        // An own accessor, from an object literal, stays an own accessor in
+        // the place the store lists it. Class getters are on the prototype.
+        installOwnGetter(snap, target, key, desc);
+      }
     }
-
-    // Install lazy-memoizing getters with cross-snapshot caching.
-    installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
   }
 
   markSnapshotForTracking(snap);
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..a77e6af 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -12,4 +12,8 @@ export {
   unwrap,
 } from './core/core';
 export {hydrationSnapshots} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
-export {originalSnapshotAccessor, snapshot} from './snapshot/snapshot';
+export {
+  originalSnapshotAccessor,
+  originalSnapshotPrototype,
+  snapshot,
+} from './snapshot/snapshot';
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..b89ab96 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,4 +1,7 @@
-import {originalSnapshotAccessor} from '../../storeRuntime';
+import {
+  originalSnapshotAccessor,
+  originalSnapshotPrototype,
+} from '../../storeRuntime';
 import {canProxy} from '../internal/internal';
 
 /** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
@@ -16,7 +19,7 @@ export function cloneSnapshotValue(
         new Array(value.length),
         Object.getPrototypeOf(value),
       )
-    : Object.create(Object.getPrototypeOf(value));
+    : Object.create(originalSnapshotPrototype(Object.getPrototypeOf(value)));
   clones.set(value, clone);
 
   for (const key of Reflect.ownKeys(value)) {
@@ -24,13 +27,10 @@ export function cloneSnapshotValue(
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     if (!descriptor) continue;
     if (!('value' in descriptor)) {
-      const original = originalSnapshotAccessor(descriptor.get);
-      if (original !== null) {
-        Object.defineProperty(clone, key, {
-          ...(original ?? descriptor),
-          configurable: true,
-        });
-      }
+      Object.defineProperty(clone, key, {
+        ...(originalSnapshotAccessor(descriptor.get) ?? descriptor),
+        configurable: true,
+      });
       continue;
     }
     Object.defineProperty(clone, key, {
```

### `n4a-tuple.patch`

N4: the array branch of `Snapshot<T>` is deleted.

```diff
diff --git a/packages/classy-store/src/types.ts b/packages/classy-store/src/types.ts
index 0855363..fda998c 100644
--- a/packages/classy-store/src/types.ts
+++ b/packages/classy-store/src/types.ts
@@ -37,11 +37,9 @@ type SnapshotLeaf =
  */
 export type Snapshot<T> = T extends SnapshotLeaf
   ? T
-  : T extends Array<infer U>
-    ? ReadonlyArray<Snapshot<U>>
-    : T extends object
-      ? {readonly [K in keyof T]: Snapshot<T[K]>}
-      : T;
+  : T extends object
+    ? {readonly [K in keyof T]: Snapshot<T[K]>}
+    : T;
 
 /** Options that control how store subscribers are notified. */
 export type SubscribeOptions = {
```

### `n4-types-with-backing.patch`

N4 as recommended: the tuple change, the two collection snapshot types with read-only backing arrays, and the named error. The variant that hides the backing arrays, `n4-types.patch`, is this patch without the two `_entries` and `_items` members of the snapshot types.

```diff
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..1424dba 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -1,6 +1,61 @@
 import {identityOf, isTrackingProxy, unwrap} from '../storeRuntime';
+import type {Snapshot} from '../types';
 import {PROXYABLE} from '../utils/internal/internal';
 
+// ── Snapshots ─────────────────────────────────────────────────────────────────
+
+/** What `snapshot()` gives for a `ReactiveMap`: its queries, and no mutator. */
+export type ReactiveMapSnapshot<K, V> = {
+  /** @internal Backing storage. */
+  readonly _entries: readonly (readonly [Snapshot<K>, Snapshot<V>])[];
+  readonly size: number;
+  get(key: K | Snapshot<K>): Snapshot<V> | undefined;
+  has(key: K | Snapshot<K>): boolean;
+  keys(): IterableIterator<Snapshot<K>>;
+  values(): IterableIterator<Snapshot<V>>;
+  entries(): IterableIterator<[Snapshot<K>, Snapshot<V>]>;
+  forEach(
+    callback: (
+      value: Snapshot<V>,
+      key: Snapshot<K>,
+      map: ReactiveMapSnapshot<K, V>,
+    ) => void,
+  ): void;
+  [Symbol.iterator](): IterableIterator<[Snapshot<K>, Snapshot<V>]>;
+};
+
+/** What `snapshot()` gives for a `ReactiveSet`: its queries, and no mutator. */
+export type ReactiveSetSnapshot<T> = {
+  /** @internal Backing storage. */
+  readonly _items: readonly Snapshot<T>[];
+  readonly size: number;
+  has(value: T | Snapshot<T>): boolean;
+  keys(): IterableIterator<Snapshot<T>>;
+  values(): IterableIterator<Snapshot<T>>;
+  entries(): IterableIterator<[Snapshot<T>, Snapshot<T>]>;
+  forEach(
+    callback: (
+      value: Snapshot<T>,
+      key: Snapshot<T>,
+      set: ReactiveSetSnapshot<T>,
+    ) => void,
+  ): void;
+  [Symbol.iterator](): IterableIterator<Snapshot<T>>;
+};
+
+/**
+ * A snapshot of a collection is frozen, and so is a collection its owner
+ * froze. Say so, instead of letting the frozen backing array fail with the
+ * engine's own message.
+ */
+function assertWritable(collection: object): void {
+  if (Object.isFrozen(unwrap(collection))) {
+    throw new TypeError(
+      '@codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.',
+    );
+  }
+}
+
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
 /**
@@ -90,6 +145,7 @@ export class ReactiveMap<K, V> {
 
   /** Sets `key` to `value`. Keeps the existing key and position if present, appends otherwise. */
   set(key: K, value: V): this {
+    assertWritable(this);
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index !== -1) {
@@ -102,6 +158,7 @@ export class ReactiveMap<K, V> {
 
   /** Removes the entry for `key`. Returns `true` if found. */
   delete(key: K): boolean {
+    assertWritable(this);
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index === -1) return false;
@@ -111,6 +168,7 @@ export class ReactiveMap<K, V> {
 
   /** Removes all entries. Uses splice to trigger proxy notification. */
   clear(): void {
+    assertWritable(this);
     this._entries.splice(0, this._entries.length);
   }
 
@@ -234,6 +292,7 @@ export class ReactiveSet<T> {
 
   /** Adds `value` if not already present (no-op for duplicates). */
   add(value: T): this {
+    assertWritable(this);
     if (!this.has(value)) {
       this._items.push(value);
     }
@@ -242,6 +301,7 @@ export class ReactiveSet<T> {
 
   /** Removes `value`. Returns `true` if found. */
   delete(value: T): boolean {
+    assertWritable(this);
     const items = this._items;
     const index = indexOfMember(items, value, false);
     if (index === -1) return false;
@@ -251,6 +311,7 @@ export class ReactiveSet<T> {
 
   /** Removes all items. Uses splice to trigger proxy notification. */
   clear(): void {
+    assertWritable(this);
     this._items.splice(0, this._items.length);
   }
 
diff --git a/packages/classy-store/src/collections/index.ts b/packages/classy-store/src/collections/index.ts
index ea12261..7a41c3f 100644
--- a/packages/classy-store/src/collections/index.ts
+++ b/packages/classy-store/src/collections/index.ts
@@ -1,2 +1,7 @@
-export type {ReactiveMap, ReactiveSet} from './collections';
+export type {
+  ReactiveMap,
+  ReactiveMapSnapshot,
+  ReactiveSet,
+  ReactiveSetSnapshot,
+} from './collections';
 export {reactiveMap, reactiveSet} from './collections';
diff --git a/packages/classy-store/src/types.ts b/packages/classy-store/src/types.ts
index 0855363..bc6cafe 100644
--- a/packages/classy-store/src/types.ts
+++ b/packages/classy-store/src/types.ts
@@ -1,3 +1,10 @@
+import type {
+  ReactiveMap,
+  ReactiveMapSnapshot,
+  ReactiveSet,
+  ReactiveSetSnapshot,
+} from './collections/collections';
+
 /**
  * Primitive types that should not be proxied or snapshot-cloned.
  * Used by `Snapshot<T>` to identify leaf types that pass through unchanged.
@@ -37,11 +44,13 @@ type SnapshotLeaf =
  */
 export type Snapshot<T> = T extends SnapshotLeaf
   ? T
-  : T extends Array<infer U>
-    ? ReadonlyArray<Snapshot<U>>
-    : T extends object
-      ? {readonly [K in keyof T]: Snapshot<T[K]>}
-      : T;
+  : T extends ReactiveMap<infer K, infer V>
+    ? ReactiveMapSnapshot<K, V>
+    : T extends ReactiveSet<infer V>
+      ? ReactiveSetSnapshot<V>
+      : T extends object
+        ? {readonly [K in keyof T]: Snapshot<T[K]>}
+        : T;
 
 /** Options that control how store subscribers are notified. */
 export type SubscribeOptions = {
```

### `n3-cycles.patch`

N3: a snapshot keeps a cycle. Includes the guard in the React hook and the two lines that let undo restore a reference to the store itself.

```diff
diff --git a/packages/classy-store/src/frameworks/react/hooks/useClassyStore/useClassyStore.ts b/packages/classy-store/src/frameworks/react/hooks/useClassyStore/useClassyStore.ts
index f504b50..025557a 100644
--- a/packages/classy-store/src/frameworks/react/hooks/useClassyStore/useClassyStore.ts
+++ b/packages/classy-store/src/frameworks/react/hooks/useClassyStore/useClassyStore.ts
@@ -97,7 +97,8 @@ export function useClassyStore<T extends object, S>(
     const nextSnapshot = snapshot(proxyStore);
     if (
       previousAutoSnapshot &&
-      !isChanged(previousAutoSnapshot, nextSnapshot, affected)
+      // The fourth argument is proxy-compare's guard for data with a cycle.
+      !isChanged(previousAutoSnapshot, nextSnapshot, affected, new WeakMap())
     ) {
       return previousAutoSnapshot;
     }
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..4afa773 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -2,7 +2,7 @@ import {markToTrack} from 'proxy-compare';
 import {getInternal, registerSnapshot} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
-import {mapOwnArrayElements} from '../utils/internal/internal';
+import {forEachOwnArrayElement} from '../utils/internal/internal';
 
 // ── Caches ────────────────────────────────────────────────────────────────────
 
@@ -184,7 +184,7 @@ function snapshotValue(
   value: unknown,
   parent: StoreInternal,
   key: string | symbol,
-  inProgress: WeakSet<object>,
+  inProgress: Map<object, object>,
 ): unknown {
   const child = parent.childInternals.get(key);
   return child
@@ -235,7 +235,7 @@ function installMemoizedGetters(snap: object, target: object): void {
 function createSnapshotRecursive<T extends object>(
   target: T,
   internal: StoreInternal,
-  inProgress: WeakSet<object> = new WeakSet(),
+  inProgress: Map<object, object>,
 ): T {
   // Cache hit: version unchanged → return the same frozen snapshot reference.
   const cached = snapshotCache.get(target);
@@ -243,25 +243,30 @@ function createSnapshotRecursive<T extends object>(
     return cached[1] as T;
   }
 
-  if (inProgress.has(target)) {
-    throw new Error(
-      '@codebelt/classy-store: circular reference detected in snapshot',
-    );
-  }
-  inProgress.add(target);
+  // A cycle in the data: this object is already being built further up the
+  // stack. Hand out the unfinished snapshot. It is filled and frozen before
+  // snapshot() returns, so no caller ever sees it incomplete.
+  const unfinished = inProgress.get(target);
+  if (unfinished) return unfinished as T;
 
   let snap: Record<string | symbol, unknown> | unknown[];
 
   if (Array.isArray(target)) {
-    // Only objects can be child nodes; primitives need no key lookup.
-    snap = mapOwnArrayElements(target, (value, index) =>
-      typeof value === 'object' && value !== null
-        ? snapshotValue(value, internal, String(index), inProgress)
-        : value,
-    );
+    // An array is filled by index, so it has to exist before its elements are
+    // visited. Only objects can be child nodes; primitives need no key lookup.
+    const elements: unknown[] = new Array(target.length);
+    snap = elements;
+    inProgress.set(target, snap);
+    forEachOwnArrayElement(target, (value, index) => {
+      elements[index] =
+        typeof value === 'object' && value !== null
+          ? snapshotValue(value, internal, String(index), inProgress)
+          : value;
+    });
   } else {
     // Preserve the prototype chain and install memoized getters on the snapshot.
     snap = Object.create(Object.getPrototypeOf(target));
+    inProgress.set(target, snap);
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
       if (!desc || !('value' in desc)) continue;
@@ -283,7 +288,6 @@ function createSnapshotRecursive<T extends object>(
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
-  inProgress.delete(target);
   return snap as T;
 }
 
@@ -307,5 +311,17 @@ function createSnapshotRecursive<T extends object>(
  */
 export function snapshot<T extends object>(proxyStore: T): Snapshot<T> {
   const internal = getInternal(proxyStore);
-  return createSnapshotRecursive(internal.target, internal) as Snapshot<T>;
+  const inProgress = new Map<object, object>();
+  try {
+    return createSnapshotRecursive(
+      internal.target,
+      internal,
+      inProgress,
+    ) as Snapshot<T>;
+  } catch (error) {
+    // A build that failed part-way may have cached a node that refers to an
+    // unfinished one. Forget every node this call built.
+    for (const target of inProgress.keys()) snapshotCache.delete(target);
+    throw error;
+  }
 }
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..8472e15 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -6,10 +6,11 @@ export function cloneSnapshotValue(
   value: unknown,
   clones: WeakMap<object, object>,
 ): unknown {
-  // Match snapshot leaf semantics: opaque values and functions pass through.
-  if (!canProxy(value)) return value;
+  if (typeof value !== 'object' || value === null) return value;
   const cached = clones.get(value);
   if (cached) return cached;
+  // Match snapshot leaf semantics: opaque values and functions pass through.
+  if (!canProxy(value)) return value;
 
   const clone: object = Array.isArray(value)
     ? Object.setPrototypeOf(
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index 8f690c2..40f22f1 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -93,6 +93,9 @@ export function withHistory<T extends object>(
     const recorded = snap as Record<string, unknown>;
     const current = snapshot(proxyStore) as Record<string, unknown>;
     const clones = new WeakMap<object, object>();
+    // A field that refers back to the store itself is restored as the store,
+    // not as a copy of it.
+    clones.set(recorded, proxyStore);
 
     // A field added after this snapshot was taken did not exist in it.
     for (const key of Object.keys(current)) {
diff --git a/packages/classy-store/src/utils/internal/internal.ts b/packages/classy-store/src/utils/internal/internal.ts
index 3a6b73d..71b2d00 100644
--- a/packages/classy-store/src/utils/internal/internal.ts
+++ b/packages/classy-store/src/utils/internal/internal.ts
@@ -14,28 +14,36 @@ export function getArrayIndex(key: string | symbol): number | undefined {
   return undefined;
 }
 
-/** Visit only present indices, including non-enumerable ones. Keep trailing holes. */
-export function mapOwnArrayElements<T, U>(
+/** Visit only present indices, including non-enumerable ones. */
+export function forEachOwnArrayElement<T>(
   source: readonly T[],
-  project: (value: T, index: number) => U,
-): U[] {
+  visit: (value: T, index: number) => void,
+): void {
   const length = source.length;
-  const result = new Array<U>(length);
   // Nearly every array is dense: walk it by index up to the first hole. A
   // sparse array reaches its first hole within its populated count, so a
   // trailing hole spanning billions of slots still costs no length-sized scan.
   // `in` is an order of magnitude cheaper here than an own-property check.
   let index = 0;
   for (; index < length && index in source; index++) {
-    result[index] = project(source[index], index);
+    visit(source[index], index);
   }
-  if (index === length) return result;
+  if (index === length) return;
   for (const key of Object.getOwnPropertyNames(source)) {
     const later = getArrayIndex(key);
-    if (later !== undefined && later > index) {
-      result[later] = project(source[later], later);
-    }
+    if (later !== undefined && later > index) visit(source[later], later);
   }
+}
+
+/** Copy only present indices, including non-enumerable ones. Keep trailing holes. */
+export function mapOwnArrayElements<T, U>(
+  source: readonly T[],
+  project: (value: T, index: number) => U,
+): U[] {
+  const result = new Array<U>(source.length);
+  forEachOwnArrayElement(source, (value, index) => {
+    result[index] = project(value, index);
+  });
   return result;
 }
 
```

## Appendix B: raw output

### `repro/n2.ts` on the unmodified worktree

N2. Run from `packages/classy-store` in the worktree with `bun <script>`.

```text
## shape of a class snapshot
Object.keys(store)                                         id,items,note
Object.keys(snapshot)                                      id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
Reflect.ownKeys(snapshot)                                  id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
for...in keys                                              id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
{...snapshot} keys                                         id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
JSON.stringify(snapshot)                                   {"id":1,"items":[{"price":2},{"price":3}],"note":"n","total":5,"first":{"price":2},"self":{},"keyCount":0,"isCart":false,"ctorName":"Cart","protoIsClass":false,"kind":"base"}
structuredClone(snapshot) keys                             THROWS DOMException: The object can not be cloned.
getPrototypeOf(snapshot) === Cart.prototype                true
snapshot instanceof Cart, Base                             true,true
snapshot.constructor === Cart                              true
'total' in snapshot, hasOwn                                true,true
'onlySet' in snapshot, hasOwn, enumerable                  true,true,true
typeof snapshot.add (method)                               function
Object.isFrozen(snapshot)                                  true

## values and memoization
total, kind (inherited class)                              5,base
total runs after 3 reads of one snapshot                   0
total runs on next snapshot after unrelated write          0
total after add(5)                                         10
first === items[0] on one snapshot                         true

## `this` inside a snapshot getter
this.keyCount (store says)                                 3
snapshot.keyCount                                          0
snapshot.isCart                                            false
snapshot.ctorName                                          Cart
snapshot.protoIsClass (store says)                         false (true)
snapshot.self === snapshot                                 false

## an object literal with a getter
Object.keys(store)                                         count,double,nested
Object.keys(snapshot)                                      count,nested,double
JSON.stringify(snapshot)                                   {"count":2,"nested":{"n":1,"plus":2},"double":4}
{...snapshot}.double                                       4
descriptor of double: get, enumerable                      function,true

## utilities that look at a snapshot
shallowEqual(snapshot, same snapshot content)              false / true
shallowEqual(snapshot of Point, new Point())               true
shallowEqual(snapshot of PointG, new PointG())             false
getPrototypeOf(snapshot of Point) === Point.prototype      true
cloneSnapshotValue: proto is class, getter works, keys     true,10,id+items+note
store made from a clone: snapshot proto depth to Cart      0

## React tracking (proxy-compare) over a snapshot
tracked read of total                                      5, runs 1
same getter then read plainly: extra runs                  0
unrelated write: isChanged                                 false
getter runs for that isChanged                             0
write to items: isChanged                                  true
Object.keys(tracked proxy)                                 id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
tracked proxy instanceof Cart                              true
tracked self is                                            something else

## a getter redefined on the class after a snapshot
old snapshot value, new snapshot value, added getter       1,102,1002
```

### `repro/n2.ts` on form B

N2.

```text
## shape of a class snapshot
Object.keys(store)                                         id,items,note
Object.keys(snapshot)                                      id,items,note
Reflect.ownKeys(snapshot)                                  id,items,note,total,first,self,keyCount,isCart,ctorName,protoIsClass,onlySet,kind
for...in keys                                              id,items,note
{...snapshot} keys                                         id,items,note
JSON.stringify(snapshot)                                   {"id":1,"items":[{"price":2},{"price":3}],"note":"n"}
structuredClone(snapshot) keys                             id,items,note
getPrototypeOf(snapshot) === Cart.prototype                true
snapshot instanceof Cart, Base                             true,true
snapshot.constructor === Cart                              true
'total' in snapshot, hasOwn                                true,true
'onlySet' in snapshot, hasOwn, enumerable                  true,true,false
typeof snapshot.add (method)                               function
Object.isFrozen(snapshot)                                  true

## values and memoization
total, kind (inherited class)                              5,base
total runs after 3 reads of one snapshot                   0
total runs on next snapshot after unrelated write          0
total after add(5)                                         10
first === items[0] on one snapshot                         true

## `this` inside a snapshot getter
this.keyCount (store says)                                 3
snapshot.keyCount                                          0
snapshot.isCart                                            false
snapshot.ctorName                                          Cart
snapshot.protoIsClass (store says)                         false (true)
snapshot.self === snapshot                                 false

## an object literal with a getter
Object.keys(store)                                         count,double,nested
Object.keys(snapshot)                                      count,nested,double
JSON.stringify(snapshot)                                   {"count":2,"nested":{"n":1,"plus":2},"double":4}
{...snapshot}.double                                       4
descriptor of double: get, enumerable                      function,true

## utilities that look at a snapshot
shallowEqual(snapshot, same snapshot content)              false / true
shallowEqual(snapshot of Point, new Point())               true
shallowEqual(snapshot of PointG, new PointG())             true
getPrototypeOf(snapshot of Point) === Point.prototype      true
cloneSnapshotValue: proto is class, getter works, keys     true,10,id+items+note
store made from a clone: snapshot proto depth to Cart      0

## React tracking (proxy-compare) over a snapshot
tracked read of total                                      5, runs 1
same getter then read plainly: extra runs                  0
unrelated write: isChanged                                 false
getter runs for that isChanged                             0
write to items: isChanged                                  true
Object.keys(tracked proxy)                                 id,items,note
tracked proxy instanceof Cart                              true
tracked self is                                            something else

## a getter redefined on the class after a snapshot
old snapshot value, new snapshot value, added getter       1,102,1002
```

### `repro/n2.ts` on form A

N2.

```text
## shape of a class snapshot
Object.keys(store)                                         id,items,note
Object.keys(snapshot)                                      id,items,note
Reflect.ownKeys(snapshot)                                  id,items,note
for...in keys                                              id,items,note
{...snapshot} keys                                         id,items,note
JSON.stringify(snapshot)                                   {"id":1,"items":[{"price":2},{"price":3}],"note":"n"}
structuredClone(snapshot) keys                             id,items,note
getPrototypeOf(snapshot) === Cart.prototype                false
snapshot instanceof Cart, Base                             true,true
snapshot.constructor === Cart                              true
'total' in snapshot, hasOwn                                true,false
'onlySet' in snapshot, hasOwn, enumerable                  true,false,false
typeof snapshot.add (method)                               function
Object.isFrozen(snapshot)                                  true

## values and memoization
total, kind (inherited class)                              5,base
total runs after 3 reads of one snapshot                   0
total runs on next snapshot after unrelated write          0
total after add(5)                                         10
first === items[0] on one snapshot                         true

## `this` inside a snapshot getter
this.keyCount (store says)                                 3
snapshot.keyCount                                          0
snapshot.isCart                                            false
snapshot.ctorName                                          Cart
snapshot.protoIsClass (store says)                         false (true)
snapshot.self === snapshot                                 false

## an object literal with a getter
Object.keys(store)                                         count,double,nested
Object.keys(snapshot)                                      count,double,nested
JSON.stringify(snapshot)                                   {"count":2,"double":4,"nested":{"n":1,"plus":2}}
{...snapshot}.double                                       4
descriptor of double: get, enumerable                      function,true

## utilities that look at a snapshot
shallowEqual(snapshot, same snapshot content)              false / true
shallowEqual(snapshot of Point, new Point())               true
shallowEqual(snapshot of PointG, new PointG())             false
getPrototypeOf(snapshot of Point) === Point.prototype      true
cloneSnapshotValue: proto is class, getter works, keys     true,10,id+items+note
store made from a clone: snapshot proto depth to Cart      1

## React tracking (proxy-compare) over a snapshot
tracked read of total                                      5, runs 1
same getter then read plainly: extra runs                  0
unrelated write: isChanged                                 false
getter runs for that isChanged                             0
write to items: isChanged                                  true
Object.keys(tracked proxy)                                 id,items,note
tracked proxy instanceof Cart                              true
tracked self is                                            something else

## a getter redefined on the class after a snapshot
old snapshot value, new snapshot value, added getter       1,102,1002
```

### `repro/n2-this.ts` on the unmodified worktree

N2. The left column is the store, the right one a snapshot.

```text
Object.keys(this).length                     store: 2  | snapshot: 0
'b' in this                                  store: true  | snapshot: false
this instanceof Dict                         store: true  | snapshot: false
a getter that returns this                   store: the object itself  | snapshot: something else
Object.entries(this).length                  store: 2  | snapshot: 0
Reflect.ownKeys(this).length                 store: 2  | snapshot: 0
for...in count                               store: 2  | snapshot: 0
keys of {...this}                            store: a,b  | snapshot: 
getOwnPropertyDescriptor(this, 'a')?.value   store: 1  | snapshot: undefined
getPrototypeOf(this) === Dict.prototype      store: true  | snapshot: false
JSON.stringify(this)                         store: {"a":1,"b":2}  | snapshot: {}
a getter that writes a field of this         store: wrote  | snapshot: wrote
after delete store.b: snapshot keyCount 0, hasB false
object literal getter that counts its keys: store 3, snapshot 0
```

### `repro/n2-this.ts` on today's shape with S1

N2.

```text
Object.keys(this).length                     store: 2  | snapshot: 14
'b' in this                                  store: true  | snapshot: true
this instanceof Dict                         store: true  | snapshot: true
a getter that returns this                   store: the object itself  | snapshot: the object itself
Object.entries(this).length                  store: 2  | snapshot: THROWS RangeError
Reflect.ownKeys(this).length                 store: 2  | snapshot: 14
for...in count                               store: 2  | snapshot: 14
keys of {...this}                            store: a,b  | snapshot: THROWS RangeError
getOwnPropertyDescriptor(this, 'a')?.value   store: 1  | snapshot: 1
getPrototypeOf(this) === Dict.prototype      store: true  | snapshot: true
JSON.stringify(this)                         store: {"a":1,"b":2}  | snapshot: THROWS TypeError
a getter that writes a field of this         store: wrote  | snapshot: THROWS TypeError
after delete store.b: snapshot keyCount 14, hasB false
object literal getter that counts its keys: store 3, snapshot 3
```

### `repro/n2-this.ts` on form B with S1

N2.

```text
Object.keys(this).length                     store: 2  | snapshot: 2
'b' in this                                  store: true  | snapshot: true
this instanceof Dict                         store: true  | snapshot: true
a getter that returns this                   store: the object itself  | snapshot: the object itself
Object.entries(this).length                  store: 2  | snapshot: 2
Reflect.ownKeys(this).length                 store: 2  | snapshot: 14
for...in count                               store: 2  | snapshot: 2
keys of {...this}                            store: a,b  | snapshot: a,b
getOwnPropertyDescriptor(this, 'a')?.value   store: 1  | snapshot: 1
getPrototypeOf(this) === Dict.prototype      store: true  | snapshot: true
JSON.stringify(this)                         store: {"a":1,"b":2}  | snapshot: {"a":1,"b":2}
a getter that writes a field of this         store: wrote  | snapshot: THROWS TypeError
after delete store.b: snapshot keyCount 2, hasB false
object literal getter that counts its keys: store 3, snapshot 3
```

### `repro/n2-this.ts` on form A with S1

N2.

```text
Object.keys(this).length                     store: 2  | snapshot: 2
'b' in this                                  store: true  | snapshot: true
this instanceof Dict                         store: true  | snapshot: true
a getter that returns this                   store: the object itself  | snapshot: the object itself
Object.entries(this).length                  store: 2  | snapshot: 2
Reflect.ownKeys(this).length                 store: 2  | snapshot: 2
for...in count                               store: 2  | snapshot: 2
keys of {...this}                            store: a,b  | snapshot: a,b
getOwnPropertyDescriptor(this, 'a')?.value   store: 1  | snapshot: 1
getPrototypeOf(this) === Dict.prototype      store: true  | snapshot: false
JSON.stringify(this)                         store: {"a":1,"b":2}  | snapshot: {"a":1,"b":2}
a getter that writes a field of this         store: wrote  | snapshot: THROWS TypeError
after delete store.b: snapshot keyCount 2, hasB false
object literal getter that counts its keys: store 3, snapshot 3
```

### `repro/bench-n2.mjs` on Bun 1.4.5

N2. Nanoseconds: the fastest of 75 samples, then the median of the five runs' fastest samples. `base` is unmodified, `n2b` form B, `n2a` form A with two loops.

```text
| Case | base | n2b | n2a |
| --- | ---: | ---: | ---: |
| class, 0 getters: write, snapshot | 761.2 (median 890.4) | 760.9 (median 962.3) | 571.8 (median 606) |
| class, 8 getters: write, snapshot | 2063.2 (median 2870.8) | 2572.3 (median 2896.1) | 476.9 (median 688.3) |
| class, 8 getters: write, snapshot, read one getter | 2455.1 (median 3105.8) | 2376 (median 2851) | 889.2 (median 915.5) |
| class, 8 getters: write, snapshot, read all eight | 2518.4 (median 3361.5) | 2898.1 (median 4276.9) | 1376.9 (median 1606.3) |
| cached getter read on one snapshot | 7 (median 12) | 11 (median 14.1) | 2.8 (median 3) |
| object literal, 2 own getters: write, snapshot | 1047.4 (median 1469.7) | 979.7 (median 1233.8) | 728.6 (median 922.3) |
| 1,000 rows of a class with 8 getters: first snapshot, per row | 2870.1 (median 4093.7) | 2488.5 (median 3577.2) | 1242.3 (median 1295.2) |
| 1,000 rows of a class with 0 getters: first snapshot, per row | 1639.8 (median 1923.7) | 1416.8 (median 2130.5) | 1150.2 (median 1377.9) |
```

### `repro/bench-n2.mjs` on Node 24.21.0

N2. As above.

```text
| Case | base | n2b | n2a |
| --- | ---: | ---: | ---: |
| class, 0 getters: write, snapshot | 1816 (median 1845.7) | 1855.1 (median 1868) | 1332.4 (median 1383.2) |
| class, 8 getters: write, snapshot | 5760.9 (median 6964.8) | 6980.4 (median 7355) | 1333.4 (median 1339.7) |
| class, 8 getters: write, snapshot, read one getter | 7403.2 (median 8043) | 6271 (median 7433.6) | 1935.3 (median 2018.1) |
| class, 8 getters: write, snapshot, read all eight | 8981.8 (median 9456.9) | 9344.3 (median 10270.2) | 2965.5 (median 3231.9) |
| cached getter read on one snapshot | 23.6 (median 24) | 23.5 (median 23.9) | 12.5 (median 12.7) |
| object literal, 2 own getters: write, snapshot | 2900.1 (median 3019.5) | 2985.4 (median 3093.5) | 2493.5 (median 2970.6) |
| 1,000 rows of a class with 8 getters: first snapshot, per row | 7932.7 (median 8514) | 7963.7 (median 8872.7) | 3071.2 (median 3701.8) |
| 1,000 rows of a class with 0 getters: first snapshot, per row | 3041.5 (median 3692.4) | 3491.4 (median 3733.3) | 2819.8 (median 3457.2) |
```

### `repro/mem-n2.mjs` on Node 24.21.0

N2. `n2a1` is form A with one loop.

```text
base: {"8 getters: bytes per row snapshot":2649}
   {"0 getters: bytes per row snapshot":215}
n2b: {"8 getters: bytes per row snapshot":2681}
   {"0 getters: bytes per row snapshot":194}
n2a1: {"8 getters: bytes per row snapshot":160}
   {"0 getters: bytes per row snapshot":214}
```

### `repro/n4.ts` on the unmodified worktree

N4.

```text
snapshot: map.set(new key)                     TypeError: Attempted to assign to readonly property.
snapshot: map.set(existing key)                TypeError: Attempted to assign to readonly property.
snapshot: map.delete(existing key)             TypeError: Unable to delete property.
snapshot: map.delete(missing key)              returns false
snapshot: map.clear()                          TypeError: Unable to delete property.
snapshot: set.add(new member)                  TypeError: Attempted to assign to readonly property.
snapshot: set.add(existing member)             returns the collection
snapshot: set.delete(missing member)           returns false
snapshot: set.clear()                          TypeError: Unable to delete property.
tracked snapshot: map.set(new key)             TypeError: Proxy object's 'set' trap returned falsy value for property '1'
tracked snapshot: map.set(existing key)        TypeError: Proxy object's 'set' trap returned falsy value for property '1'
tracked snapshot: map.delete(existing key)     TypeError: Unable to delete property.
tracked snapshot: map.delete(missing key)      returns false
tracked snapshot: map.clear()                  TypeError: Unable to delete property.
tracked snapshot: set.add(new member)          TypeError: Proxy object's 'set' trap returned falsy value for property '1'
tracked snapshot: set.add(existing member)     returns the collection
tracked snapshot: set.delete(missing member)   returns false
tracked snapshot: set.clear()                  TypeError: Unable to delete property.
live store: map.set, set.add still work        returns 2,2
a set its owner froze, in a store: add         returns the collection
snapshot unchanged: 1,1
```

### `repro/n4.ts` on the spike

N4.

```text
snapshot: map.set(new key)                     TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: map.set(existing key)                TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: map.delete(existing key)             TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: map.delete(missing key)              TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: map.clear()                          TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: set.add(new member)                  TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: set.add(existing member)             TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: set.delete(missing member)           TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot: set.clear()                          TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: map.set(new key)             TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: map.set(existing key)        TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: map.delete(existing key)     TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: map.delete(missing key)      TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: map.clear()                  TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: set.add(new member)          TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: set.add(existing member)     TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: set.delete(missing member)   TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
tracked snapshot: set.clear()                  TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
live store: map.set, set.add still work        returns 2,2
a set its owner froze, in a store: add         TypeError: @codebelt/classy-store: this collection is a snapshot or was frozen, and cannot be changed. Change the collection in the store.
snapshot unchanged: 1,1
```

### The example and docs type checks with the backing arrays hidden

N4. Each step of the root `typecheck` script after the package's own, run by itself after `bun run build`. With the backing arrays kept, every step exits 0.

```text
@codebelt/classy-store typecheck:scoping -> exit 0, 0 TS errors
classy-store-svelte-example check:integration -> exit 0, 0 TS errors
classy-store-vue-example check:integration -> exit 0, 0 TS errors
classy-store-solid-example typecheck -> exit 0, 0 TS errors
classy-store-solid-example check:integration -> exit 0, 0 TS errors
classy-store-angular-example typecheck -> exit 0, 0 TS errors
classy-store-angular-example check:integration -> exit 0, 0 TS errors
classy-store-nextjs-example typecheck -> exit 1, 7 TS errors
classy-store-nextjs-example typecheck: src/components/planner/MealSlotPicker.tsx(20,24): error TS2551: Property '_entries' does not exist on type 'ReactiveMapSnapshot<string, Recipe>'. Did you mean 'entries'?
classy-store-nextjs-example typecheck: src/components/recipes/RecipeCard.tsx(16,23): error TS2551: Property '_entries' does not exist on type 'ReactiveMapSnapshot<string, Recipe>'. Did you mean 'entries'?
classy-store-nextjs-example typecheck: src/components/recipes/RecipeFilter.tsx(78,26): error TS2339: Property '_items' does not exist on type 'ReactiveSetSnapshot<string>'.
classy-store-nextjs-example typecheck: src/components/recipes/RecipeFilter.tsx(95,25): error TS2339: Property '_items' does not exist on type 'ReactiveSetSnapshot<string>'.
classy-store-nextjs-example typecheck: src/components/recipes/TagManager.tsx(26,28): error TS2339: Property '_items' does not exist on type 'ReactiveSetSnapshot<string>'.
classy-store-nextjs-example typecheck: src/components/recipes/TagManager.tsx(39,24): error TS2339: Property '_items' does not exist on type 'ReactiveSetSnapshot<string>'.
classy-store-nextjs-example typecheck: src/components/recipes/TagManager.tsx(71,23): error TS2339: Property '_items' does not exist on type 'ReactiveSetSnapshot<string>'.
classy-store-docs types:check -> exit 0, 0 TS errors
```

### `repro/n3.ts` on the spike

N3. Bun 1.4.5. On the unmodified worktree the script stops at its first `snapshot()` of a cycle with "circular reference detected in snapshot".

```text
## 1. a store that holds itself
the write: sync notifications                                  1
snapshot(store).self === snapshot(store)                       true
every reachable object is frozen                               true
the same snapshot twice                                        true
a write: new snapshot, self follows, sibling kept              true,true,true,true,1,2
the snapshot taken before the cycle is untouched               1,false
snapshot(store.self) is the root snapshot                      true
delete the cycle: snapshot has no self                         false

## 2. a ring of two, a list that holds itself, two stores
ring: a.b === b, b.a === a, all frozen                         true,true,true
ring: snapshot(ring.a) is the one inside the root snapshot     true
list: list[1] === list, frozen, length                         true,true,2
two stores: left.peer.peer === left, snapshot(right) is left.peer true,true

## 3. a tree with parent pointers: what is shared after one write
children whose parent is the root snapshot                     1000
after one child is written: children with a new snapshot       1000 of 1000; plain kept: true
the same without parent pointers                               1 of 1000
write one child, snapshot: with parent pointers                971.0 us
write one child, snapshot: without                             126.3 us

## 4. getters and the utilities on a cyclic snapshot
getters on the snapshot                                        2,2,2
shallowEqual(snapshot, snapshot)                               true
cloneSnapshotValue keeps the cycle, mutable                    true,false
structuredClone keeps the cycle                                true
JSON.stringify(snapshot)                                       THROWS TypeError: JSON.stringify cannot serialize cyclic structures.
JSON.stringify(store), for comparison                          THROWS TypeError: JSON.stringify cannot serialize cyclic structures.
subscribeKey on a cyclic store                                 [2]
isChanged with the guard: related write, unrelated write       true,false
isChanged without the guard, after an unrelated write          THROWS RangeError: Maximum call stack size exceeded.
withHistory: undo on a cyclic store                            2,true,true
withHistory: redo                                              3,true
persist: all fields, cyclic store                              stored nothing; errors ["write: TypeError: JSON.stringify cannot serialize cyclic structures"]
persist: properties without the cyclic field                   stored {"version":0,"state":{"n":3,"other":{"m":1}}}
```

### `repro/n3-failed-build.ts`

N3. With and without the line that drops what a failed call built.

```text
with the cleanup:
the armed build threw: ownKeys failed
after the failure: a.root === root true, a frozen true, a.root frozen true, a.n 2
without it:
the armed build threw: ownKeys failed
after the failure: a.root === root false, a frozen true, a.root frozen false, a.n 2
```

### `repro/bench-guard.mjs` on Bun 1.4.5

N3. Nanoseconds per `isChanged` call, the fastest of 30 samples, on the unmodified build.

```text
{
 "10 rows read, unrelated write, no guard": 21,
 "10 rows read, unrelated write, guard": 21,
 "10 rows read, last row written, no guard": 515,
 "10 rows read, last row written, guard": 539,
 "1000 rows read, unrelated write, no guard": 28,
 "1000 rows read, unrelated write, guard": 42,
 "1000 rows read, last row written, no guard": 48377,
 "1000 rows read, last row written, guard": 48153
}
```

### `repro/bench-guard.mjs` on Node 24.21.0

N3. As above.

```text
{
 "10 rows read, unrelated write, no guard": 20,
 "10 rows read, unrelated write, guard": 59,
 "10 rows read, last row written, no guard": 271,
 "10 rows read, last row written, guard": 353,
 "1000 rows read, unrelated write, no guard": 41,
 "1000 rows read, unrelated write, guard": 70,
 "1000 rows read, last row written, no guard": 13857,
 "1000 rows read, last row written, guard": 13939
}
```

## Appendix C: scripts

In `<scratch>/stage-3-spike-snapshots/repro/`. Each imports the worktree
source by relative path, or takes the folder of a saved build as its
argument.

### `savebuild.sh`

Builds the worktree and keeps a copy of `dist` with its own `package.json` and a copy of the core benchmark, under `packages/classy-store/.builds/<name>/` in the worktree, so that `proxy-compare` still resolves.

```sh
#!/bin/sh
# Usage: savebuild.sh <name>. Builds the worktree and keeps a self-contained copy.
set -e
W=<scratch>/stage-3-spike-snapshots/wt
cd $W && bun run build > <scratch>/stage-3-spike-snapshots/out/build-$1.txt 2>&1
B=$W/packages/classy-store/.builds/$1
rm -rf $B && mkdir -p $B/tests/benchmark
cp -R $W/packages/classy-store/dist $B/dist
cp $W/packages/classy-store/package.json $B/package.json
cp $W/packages/classy-store/tests/benchmark/runCoreBenchmark.mjs $W/packages/classy-store/tests/benchmark/baseline.json $W/packages/classy-store/tests/benchmark/limits.json $B/tests/benchmark/
echo saved $B
```

### `apply-s1.py`

The snapshot half of the traps report's variant S1, applied by text so that it fits each form of N2. Run from the worktree root.

```py
# The snapshot half of the traps report's variant S1 (its t4-snapshot-target
# patch), applied by text so that it fits each form of N2.
import sys
p='packages/classy-store/src/snapshot/snapshot.ts'
s=open(p).read()
old="type GetterDep = {prop: string | symbol; value: unknown};"
assert old in s
s=s.replace(old,"""type GetterDep = {
  /** `has`: `prop in this`. `keys`: the own keys of `this`. Otherwise a read. */
  kind?: 'has' | 'keys';
  prop: string | symbol;
  value: unknown;
};""")
old="""      return value;
    },
  };

  const tracked = new Proxy({}, handler);"""
assert old in s
s=s.replace(old,"""      return value;
    },
    has(_target, prop) {
      const value = Reflect.has(snap, prop);
      deps.push({kind: 'has', prop, value});
      return value;
    },
    ownKeys() {
      const value = Reflect.ownKeys(snap);
      deps.push({kind: 'keys', prop: '', value});
      return value;
    },
  };

  // The frozen snapshot is the target, so an operation without a trap
  // (`instanceof`, a descriptor read) answers for the snapshot itself.
  const tracked = new Proxy(snap, handler);""")
for call in ("getterFn.call(tracked)", "run(tracked)"):
    old="  const result = %s;\n  return {deps, result};" % call
    if old in s:
        s=s.replace(old,"  const result = %s;\n  // A getter that returns `this` returns the snapshot, not the tracker.\n  return {deps, result: result === tracked ? snap : result};" % call)
        break
else:
    raise SystemExit('no result line')
old="""    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
    if (!Object.is(currentValue, dep.value)) return false;"""
assert old in s
s=s.replace(old,"""    if (dep.kind === 'has') {
      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;
    } else if (dep.kind === 'keys') {
      const before = dep.value as (string | symbol)[];
      const now = Reflect.ownKeys(currentSnap);
      if (
        now.length !== before.length ||
        now.some((key, index) => key !== before[index])
      )
        return false;
    } else if (
      !Object.is(Reflect.get(currentSnap, dep.prop, currentSnap), dep.value)
    )
      return false;""")
open(p,'w').write(s)
```

### `compare.mjs`

Runs one benchmark script against several saved builds, interleaved, in fresh processes.

```js
// Usage: bun compare.mjs <runtime> <script> <runs> <build>... : median and range per case, per build.
import {spawnSync} from 'node:child_process';
const [runtime, script, runsText, ...builds] = process.argv.slice(2);
const runs = Number(runsText);
const results = Object.fromEntries(builds.map((b) => [b, []]));
// Interleave the builds so drift on a busy machine hits all of them alike.
for (let run = 0; run < runs; run++) {
  for (const build of builds) {
    const child = spawnSync(runtime, [script, build], {encoding: 'utf8'});
    const line = child.stdout.trim().split('\n').pop();
    try {
      results[build].push(JSON.parse(line));
    } catch {
      console.error(child.stdout, child.stderr);
      process.exit(1);
    }
  }
}
const names = Object.keys(results[builds[0]][0]);
const short = (b) => b.split('/').pop();
console.log(`| Case | ${builds.map(short).join(' | ')} |`);
console.log(`| --- | ${builds.map(() => '---:').join(' | ')} |`);
for (const name of names) {
  const cells = builds.map((b) => {
    const v = results[b].map((r) => r[name]).sort((x, y) => x - y);
    const med = v[Math.floor(v.length / 2)];
    return `${v[0]} (median ${med})`;
  });
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}
```

### `n2.ts`

N2: what a snapshot of a class with getters looks like from outside.

```ts
// N2: what a snapshot of a class with getters looks like from outside.
// Run from the worktree root: bun <scratch>/repro/n2.ts
import {
  createClassyStore,
  PROXYABLE,
  shallowEqual,
  snapshot,
} from '../wt/packages/classy-store/src/index';
// The library's own copy of proxy-compare: a second copy would not know which
// objects the library marked for tracking.
import {
  createProxy,
  isChanged,
} from '../wt/packages/classy-store/src/storeRuntime';
import {SnapshotTargetCache} from '../wt/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache';
import {TrackedProxyCache} from '../wt/packages/classy-store/src/frameworks/react/utils/trackedProxyCache/trackedProxyCache';
import {cloneSnapshotValue} from '../wt/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot';

// What useClassyStore passes to proxy-compare: one target cache for the
// module, one proxy cache per hook.
const targets = new SnapshotTargetCache();
const track = <T extends object>(
  value: T,
  affected: WeakMap<object, unknown>,
) => createProxy(value, affected, new TrackedProxyCache(), targets) as T;

const show = (label: string, run: () => unknown) => {
  let text: string;
  try {
    const value = run();
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (error) {
    text = `THROWS ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 70)}`;
  }
  console.log(`${label.padEnd(58)} ${text}`);
};

let totalRuns = 0;
class Base {
  static [PROXYABLE] = true;
  id = 1;
  get kind() {
    return 'base';
  }
}
class Cart extends Base {
  items = [{price: 2}, {price: 3}];
  note = 'n';
  get total() {
    totalRuns++;
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
  get first() {
    return this.items[0];
  }
  get self() {
    return this;
  }
  get keyCount() {
    return Object.keys(this).length;
  }
  get isCart() {
    return this instanceof Cart;
  }
  get ctorName() {
    return this.constructor.name;
  }
  get protoIsClass() {
    return Object.getPrototypeOf(this) === Cart.prototype;
  }
  set onlySet(_value: number) {}
  add(price: number) {
    this.items.push({price});
  }
}

const store = createClassyStore(new Cart());
const snap = snapshot(store);

console.log('## shape of a class snapshot');
show('Object.keys(store)', () => Object.keys(store).join(','));
show('Object.keys(snapshot)', () => Object.keys(snap).join(','));
show('Reflect.ownKeys(snapshot)', () =>
  Reflect.ownKeys(snap).map(String).join(','),
);
show('for...in keys', () => {
  const keys: string[] = [];
  for (const key in snap) keys.push(key);
  return keys.join(',');
});
show('{...snapshot} keys', () => Object.keys({...snap}).join(','));
show('JSON.stringify(snapshot)', () => JSON.stringify(snap));
show('structuredClone(snapshot) keys', () =>
  Object.keys(structuredClone(snap)).join(','),
);
show('getPrototypeOf(snapshot) === Cart.prototype', () =>
  String(Object.getPrototypeOf(snap) === Cart.prototype),
);
show('snapshot instanceof Cart, Base', () =>
  [snap instanceof Cart, snap instanceof Base].join(','),
);
show('snapshot.constructor === Cart', () => String(snap.constructor === Cart));
show("'total' in snapshot, hasOwn", () =>
  ['total' in snap, Object.hasOwn(snap, 'total')].join(','),
);
show("'onlySet' in snapshot, hasOwn, enumerable", () =>
  [
    'onlySet' in snap,
    Object.hasOwn(snap, 'onlySet'),
    Object.keys(snap).includes('onlySet'),
  ].join(','),
);
show('typeof snapshot.add (method)', () => typeof snap.add);
show('Object.isFrozen(snapshot)', () => String(Object.isFrozen(snap)));

console.log('\n## values and memoization');
show('total, kind (inherited class)', () => [snap.total, snap.kind].join(','));
show('total runs after 3 reads of one snapshot', () => {
  totalRuns = 0;
  const fresh = snapshot(store);
  fresh.total;
  fresh.total;
  fresh.total;
  return totalRuns;
});
show('total runs on next snapshot after unrelated write', () => {
  snapshot(store).total;
  totalRuns = 0;
  store.note = `${store.note}x`;
  snapshot(store).total;
  return totalRuns;
});
show('total after add(5)', () => {
  store.add(5);
  return snapshot(store).total;
});
show('first === items[0] on one snapshot', () => {
  const now = snapshot(store);
  return String(now.first === now.items[0]);
});

console.log('\n## `this` inside a snapshot getter');
show('this.keyCount (store says)', () => store.keyCount);
show('snapshot.keyCount', () => snapshot(store).keyCount);
show('snapshot.isCart', () => String(snapshot(store).isCart));
show('snapshot.ctorName', () => snapshot(store).ctorName);
show(
  'snapshot.protoIsClass (store says)',
  () => `${snapshot(store).protoIsClass} (${store.protoIsClass})`,
);
show('snapshot.self === snapshot', () => {
  const now = snapshot(store);
  return String(now.self === now);
});

console.log('\n## an object literal with a getter');
const literal = createClassyStore({
  count: 2,
  get double() {
    return this.count * 2;
  },
  nested: {
    n: 1,
    get plus() {
      return this.n + 1;
    },
  },
});
const literalSnap = snapshot(literal);
show('Object.keys(store)', () => Object.keys(literal).join(','));
show('Object.keys(snapshot)', () => Object.keys(literalSnap).join(','));
show('JSON.stringify(snapshot)', () => JSON.stringify(literalSnap));
show('{...snapshot}.double', () => ({...literalSnap}).double);
show('descriptor of double: get, enumerable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(literalSnap, 'double');
  return [typeof descriptor?.get, descriptor?.enumerable].join(',');
});

console.log('\n## utilities that look at a snapshot');
show('shallowEqual(snapshot, same snapshot content)', () => {
  const a = snapshot(store);
  store.note = `${store.note}y`;
  store.note = store.note.slice(0, -1);
  const b = snapshot(store);
  return `${a === b} / ${shallowEqual(a, b)}`;
});
class Point {
  static [PROXYABLE] = true;
  x = 1;
  y = 2;
}
show('shallowEqual(snapshot of Point, new Point())', () =>
  String(shallowEqual(snapshot(createClassyStore(new Point())), new Point())),
);
class PointG {
  static [PROXYABLE] = true;
  x = 1;
  y = 2;
  get sum() {
    return this.x + this.y;
  }
}
show('shallowEqual(snapshot of PointG, new PointG())', () =>
  String(shallowEqual(snapshot(createClassyStore(new PointG())), new PointG())),
);
show('getPrototypeOf(snapshot of Point) === Point.prototype', () =>
  String(
    Object.getPrototypeOf(snapshot(createClassyStore(new Point()))) ===
      Point.prototype,
  ),
);
show('cloneSnapshotValue: proto is class, getter works, keys', () => {
  const clone = cloneSnapshotValue(snapshot(store), new WeakMap()) as Cart;
  return [
    Object.getPrototypeOf(clone) === Cart.prototype,
    clone.total,
    Object.keys(clone).join('+'),
  ].join(',');
});
show('store made from a clone: snapshot proto depth to Cart', () => {
  let value: Cart = cloneSnapshotValue(snapshot(store), new WeakMap()) as Cart;
  for (let round = 0; round < 3; round++) {
    const again = createClassyStore(value);
    value = cloneSnapshotValue(snapshot(again), new WeakMap()) as Cart;
  }
  let depth = 0;
  let proto = Object.getPrototypeOf(snapshot(createClassyStore(value)));
  while (proto && proto !== Cart.prototype) {
    depth++;
    proto = Object.getPrototypeOf(proto);
  }
  return depth;
});

console.log('\n## React tracking (proxy-compare) over a snapshot');
{
  const tracked = createClassyStore(new Cart());
  const before = snapshot(tracked);
  const affected = new WeakMap<object, unknown>();
  const proxy = track(before, affected) as Cart;
  totalRuns = 0;
  const seen = proxy.total;
  show('tracked read of total', () => `${seen}, runs ${totalRuns}`);
  show('same getter then read plainly: extra runs', () => {
    const runs = totalRuns;
    before.total;
    return totalRuns - runs;
  });
  tracked.note = 'changed';
  show('unrelated write: isChanged', () =>
    String(isChanged(before, snapshot(tracked), affected)),
  );
  totalRuns = 0;
  show('getter runs for that isChanged', () => {
    isChanged(before, snapshot(tracked), affected);
    return totalRuns;
  });
  tracked.add(1);
  show('write to items: isChanged', () =>
    String(isChanged(before, snapshot(tracked), affected)),
  );
  const keysAffected = new WeakMap<object, unknown>();
  const keysProxy = track(snapshot(tracked), keysAffected) as Cart;
  show('Object.keys(tracked proxy)', () => Object.keys(keysProxy).join(','));
  show('tracked proxy instanceof Cart', () =>
    String(keysProxy instanceof Cart),
  );
  show('tracked self is', () => {
    const now = snapshot(tracked);
    const p = track(now, new WeakMap()) as Cart;
    const self = p.self;
    return self === p
      ? 'the tracked proxy'
      : self === (now as unknown)
        ? 'the snapshot'
        : 'something else';
  });
}

console.log('\n## a getter redefined on the class after a snapshot');
{
  class Late {
    static [PROXYABLE] = true;
    n = 1;
    get value() {
      return this.n;
    }
  }
  const late = createClassyStore(new Late());
  const old = snapshot(late);
  old.value;
  Object.defineProperty(Late.prototype, 'value', {
    get(this: Late) {
      return this.n + 100;
    },
    configurable: true,
  });
  Object.defineProperty(Late.prototype, 'added', {
    get(this: Late) {
      return this.n + 1000;
    },
    configurable: true,
  });
  late.n = 2;
  const next = snapshot(late) as Late & {added: number};
  show('old snapshot value, new snapshot value, added getter', () =>
    [old.value, next.value, next.added].join(','),
  );
}
```

### `n2-this.ts`

N2: what `this` is inside a snapshot getter.

```ts
// N2: what `this` is inside a snapshot getter. The rows of the traps report's
// T4 table, asked of the store and of a snapshot.
import {
  createClassyStore,
  PROXYABLE,
  snapshot,
} from '../wt/packages/classy-store/src/index';

class Dict {
  static [PROXYABLE] = true;
  a = 1;
  b = 2;
  get keyCount() {
    return Object.keys(this).length;
  }
  get hasB() {
    return 'b' in this;
  }
  get isDict() {
    return this instanceof Dict;
  }
  get me() {
    return this;
  }
  get entryCount() {
    return Object.entries(this).length;
  }
  get ownKeyCount() {
    return Reflect.ownKeys(this).length;
  }
  get forIn() {
    let n = 0;
    for (const _key in this) n++;
    return n;
  }
  get spreadKeys() {
    return Object.keys({...this}).join(',');
  }
  get descriptorOfA() {
    return Object.getOwnPropertyDescriptor(this, 'a')?.value;
  }
  get protoIsClass() {
    return Object.getPrototypeOf(this) === Dict.prototype;
  }
  get json() {
    return JSON.stringify(this);
  }
  get writes() {
    (this as {scratch?: number}).scratch = 1;
    return 'wrote';
  }
}
const ask = (label: string, run: () => unknown) => {
  let text: string;
  try {
    text = String(run());
  } catch (error) {
    text = `THROWS ${(error as Error).constructor.name}`;
  }
  return `${label}: ${text}`;
};
const rows: [string, (o: Dict) => unknown][] = [
  ['Object.keys(this).length', (o) => o.keyCount],
  ["'b' in this", (o) => o.hasB],
  ['this instanceof Dict', (o) => o.isDict],
  [
    'a getter that returns this',
    (o) => (o.me === o ? 'the object itself' : 'something else'),
  ],
  ['Object.entries(this).length', (o) => o.entryCount],
  ['Reflect.ownKeys(this).length', (o) => o.ownKeyCount],
  ['for...in count', (o) => o.forIn],
  ['keys of {...this}', (o) => o.spreadKeys],
  ["getOwnPropertyDescriptor(this, 'a')?.value", (o) => o.descriptorOfA],
  ['getPrototypeOf(this) === Dict.prototype', (o) => o.protoIsClass],
  ['JSON.stringify(this)', (o) => o.json],
  ['a getter that writes a field of this', (o) => o.writes],
];
const store = createClassyStore(new Dict());
for (const [label, run] of rows) {
  console.log(
    `${ask(label.padEnd(44) + ' store', () => run(store))}  | snapshot: ${ask('', () => run(snapshot(store) as Dict)).slice(2)}`,
  );
}
delete (store as {b?: number}).b;
console.log(
  `after delete store.b: snapshot keyCount ${snapshot(store).keyCount}, hasB ${snapshot(store).hasB}`,
);
const literal = createClassyStore({
  x: 1,
  y: 2,
  get count() {
    return Object.keys(this).length;
  },
});
console.log(
  `object literal getter that counts its keys: store ${literal.count}, snapshot ${snapshot(literal).count}`,
);
```

### `bench-n2.mjs`

N2: the cost of a snapshot of a class with 0 and with 8 getters.

```js
// N2: what a snapshot of a class costs with 0 and with 8 getters.
// Usage: bun|node bench-n2.mjs <path to a saved build folder>
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const build = process.argv[2];
const {createClassyStore, snapshot, PROXYABLE} = await import(
  pathToFileURL(join(build, 'dist/index.mjs')).href
);

// A node made in this turn of the event loop stays alive until the turn ends:
// `new WeakRef()` pins its target for the rest of the job. So yield between
// samples, or a case that builds stores runs Node out of memory.
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

async function measure(setup) {
  const run = setup();
  // Size the batch so one sample takes about 20 ms, then take the median of 15.
  let iterations = 1;
  for (;;) {
    const start = performance.now();
    run(iterations);
    if (performance.now() - start > 20) break;
    iterations *= 2;
    await pause();
  }
  for (let warm = 0; warm < 5; warm++) {
    run(iterations);
    await pause();
  }
  const samples = [];
  for (let sample = 0; sample < 15; sample++) {
    const start = performance.now();
    run(iterations);
    samples.push(((performance.now() - start) * 1e6) / iterations);
    await pause();
  }
  // The machine is shared and busy. Other work only ever adds time, so the
  // fastest sample is the one closest to the cost of the code.
  return Math.min(...samples);
}

class Plain {
  static [PROXYABLE] = true;
  a = 1;
  b = 2;
  c = 'x';
  d = true;
}
class Eight {
  static [PROXYABLE] = true;
  a = 1;
  b = 2;
  c = 'x';
  d = true;
  get g1() {
    return this.a + 1;
  }
  get g2() {
    return this.a + 2;
  }
  get g3() {
    return this.b + 3;
  }
  get g4() {
    return this.b + 4;
  }
  get g5() {
    return `${this.c}5`;
  }
  get g6() {
    return `${this.c}6`;
  }
  get g7() {
    return !this.d;
  }
  get g8() {
    return this.a + this.b;
  }
}

const cases = {
  'class, 0 getters: write, snapshot': () => {
    const store = createClassyStore(new Plain());
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.a = i;
        sum += snapshot(store).a;
      }
      return sum;
    };
  },
  'class, 8 getters: write, snapshot': () => {
    const store = createClassyStore(new Eight());
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.a = i;
        sum += snapshot(store).a;
      }
      return sum;
    };
  },
  'class, 8 getters: write, snapshot, read one getter': () => {
    const store = createClassyStore(new Eight());
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.a = i;
        sum += snapshot(store).g1;
      }
      return sum;
    };
  },
  'class, 8 getters: write, snapshot, read all eight': () => {
    const store = createClassyStore(new Eight());
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.a = i;
        const s = snapshot(store);
        sum +=
          s.g1 +
          s.g2 +
          s.g3 +
          s.g4 +
          s.g5.length +
          s.g6.length +
          (s.g7 ? 1 : 0) +
          s.g8;
      }
      return sum;
    };
  },
  'cached getter read on one snapshot': () => {
    const store = createClassyStore(new Eight());
    const snap = snapshot(store);
    snap.g1;
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += snap.g1;
      return sum;
    };
  },
  'object literal, 2 own getters: write, snapshot': () => {
    const store = createClassyStore({
      a: 1,
      b: 2,
      get sum() {
        return this.a + this.b;
      },
      get diff() {
        return this.a - this.b;
      },
    });
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.a = i;
        sum += snapshot(store).a;
      }
      return sum;
    };
  },
  '1,000 rows of a class with 8 getters: first snapshot, per row': () => {
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const store = createClassyStore({
          rows: Array.from({length: 1000}, () => new Eight()),
        });
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
  '1,000 rows of a class with 0 getters: first snapshot, per row': () => {
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const store = createClassyStore({
          rows: Array.from({length: 1000}, () => new Plain()),
        });
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
};

const out = {};
for (const [name, setup] of Object.entries(cases)) {
  let value = await measure(setup);
  if (name.includes('per row')) value /= 1000;
  out[name] = Math.round(value * 10) / 10;
}
console.log(JSON.stringify(out));
```

### `mem-n2.mjs`

N2: memory held by the snapshots of 10,000 rows.

```js
// N2: memory held by the snapshots of 10,000 rows of a class with 8 getters.
// Usage: node --expose-gc mem-n2.mjs <build folder> <8|0>
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const {createClassyStore, snapshot, PROXYABLE} = await import(
  pathToFileURL(join(process.argv[2], 'dist/index.mjs')).href
);
class Eight {
  static [PROXYABLE] = true;
  a = 1;
  b = 2;
  c = 'x';
  d = true;
  get g1() {
    return this.a + 1;
  }
  get g2() {
    return this.a + 2;
  }
  get g3() {
    return this.b + 3;
  }
  get g4() {
    return this.b + 4;
  }
  get g5() {
    return `${this.c}5`;
  }
  get g6() {
    return `${this.c}6`;
  }
  get g7() {
    return !this.d;
  }
  get g8() {
    return this.a + this.b;
  }
}
class Zero {
  static [PROXYABLE] = true;
  a = 1;
  b = 2;
  c = 'x';
  d = true;
}
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5));
    globalThis.gc();
  }
};
const out = {};
// One class per process, so nothing from the other is freed in between.
for (const [name, Row] of [
  process.argv[3] === '0' ? ['0 getters', Zero] : ['8 getters', Eight],
]) {
  const store = createClassyStore({
    rows: Array.from({length: 10000}, () => new Row()),
  });
  await settle();
  const before = process.memoryUsage().heapUsed;
  const snap = snapshot(store);
  await settle();
  const after = process.memoryUsage().heapUsed;
  out[`${name}: bytes per row snapshot`] = Math.round((after - before) / 10000);
  if (snap.rows.length !== 10000) throw new Error('bad');
}
console.log(JSON.stringify(out));
```

### `n4.ts`

N4: what a mutator does when it is called on a snapshot of a collection.

```ts
// N4: what a mutator does when it is called on a snapshot of a collection.
import {
  reactiveMap,
  reactiveSet,
} from '../wt/packages/classy-store/src/collections/index';
import {
  createClassyStore,
  snapshot,
} from '../wt/packages/classy-store/src/index';
import {createProxy} from '../wt/packages/classy-store/src/storeRuntime';
import {SnapshotTargetCache} from '../wt/packages/classy-store/src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache';
import {TrackedProxyCache} from '../wt/packages/classy-store/src/frameworks/react/utils/trackedProxyCache/trackedProxyCache';

const store = createClassyStore({
  todos: reactiveMap<string, {done: boolean}>([['first', {done: false}]]),
  tags: reactiveSet<string>(['urgent']),
});
// The casts stand in for a JavaScript caller, or for today's types.
type AnyMap = {
  set(k: string, v: unknown): unknown;
  delete(k: string): unknown;
  clear(): unknown;
};
type AnySet = {
  add(v: string): unknown;
  delete(v: string): unknown;
  clear(): unknown;
};
const snap = snapshot(store);
const tracked = createProxy(
  snap,
  new WeakMap(),
  new TrackedProxyCache(),
  new SnapshotTargetCache(),
);
const show = (label: string, run: () => unknown) => {
  try {
    const value = run();
    console.log(
      `${label.padEnd(46)} returns ${typeof value === 'object' ? 'the collection' : String(value)}`,
    );
  } catch (error) {
    console.log(
      `${label.padEnd(46)} ${(error as Error).constructor.name}: ${(error as Error).message}`,
    );
  }
};
for (const [name, target] of [
  ['snapshot', snap],
  ['tracked snapshot', tracked],
] as const) {
  const map = target.todos as unknown as AnyMap;
  const set = target.tags as unknown as AnySet;
  show(`${name}: map.set(new key)`, () => map.set('second', {done: true}));
  show(`${name}: map.set(existing key)`, () => map.set('first', {done: true}));
  show(`${name}: map.delete(existing key)`, () => map.delete('first'));
  show(`${name}: map.delete(missing key)`, () => map.delete('nope'));
  show(`${name}: map.clear()`, () => map.clear());
  show(`${name}: set.add(new member)`, () => set.add('later'));
  show(`${name}: set.add(existing member)`, () => set.add('urgent'));
  show(`${name}: set.delete(missing member)`, () => set.delete('nope'));
  show(`${name}: set.clear()`, () => set.clear());
}
show('live store: map.set, set.add still work', () => {
  store.todos.set('second', {done: true});
  store.tags.add('later');
  return `${store.todos.size},${store.tags.size}`;
});
const frozen = createClassyStore({
  held: Object.freeze(reactiveSet<string>(['a'])),
});
show('a set its owner froze, in a store: add', () => frozen.held.add('b'));
console.log(`snapshot unchanged: ${snap.todos.size},${snap.tags.size}`);
```

### `spikeTypes.test.ts`

N4: the tuple cases. Placed in `packages/classy-store/src/` of the worktree for the typecheck, and deleted afterwards.

```ts
// SPIKE, not for the repository: what Snapshot<T> gives once its array branch is gone.
import {describe, expect, expectTypeOf, test} from 'bun:test';
import {createClassyStore, snapshot} from './index';
import type {Snapshot} from './index';

describe('N4: tuples survive Snapshot', () => {
  test('tuples keep their positions; arrays are as before', () => {
    expectTypeOf<Snapshot<[string, number]>>().toEqualTypeOf<
      readonly [string, number]
    >();
    expectTypeOf<Snapshot<readonly [string, number]>>().toEqualTypeOf<
      readonly [string, number]
    >();
    expectTypeOf<Snapshot<[{id: number}, Date]>>().toEqualTypeOf<
      readonly [{readonly id: number}, Date]
    >();
    expectTypeOf<
      Snapshot<[first: string, second?: {x: number}]>
    >().toEqualTypeOf<
      readonly [first: string, second?: {readonly x: number}]
    >();
    expectTypeOf<Snapshot<[string, ...{x: number}[]]>>().toEqualTypeOf<
      readonly [string, ...{readonly x: number}[]]
    >();
    expectTypeOf<Snapshot<{id: number}[]>>().toEqualTypeOf<
      readonly {readonly id: number}[]
    >();
    expectTypeOf<Snapshot<readonly {id: number}[]>>().toEqualTypeOf<
      readonly {readonly id: number}[]
    >();
    expectTypeOf<Snapshot<{id: number}[][]>>().toEqualTypeOf<
      readonly (readonly {readonly id: number}[])[]
    >();
    expectTypeOf<Snapshot<string[] | null>>().toEqualTypeOf<
      readonly string[] | null
    >();
    expectTypeOf<
      Snapshot<{pair: [string, number]; list: number[]}>
    >().toEqualTypeOf<{
      readonly pair: readonly [string, number];
      readonly list: readonly number[];
    }>();
  });

  test('a tuple read from a snapshot has typed positions and a literal length', () => {
    const store = createClassyStore({pair: ['a', 1] as [string, number]});
    const snap = snapshot(store);
    expectTypeOf(snap.pair[0]).toEqualTypeOf<string>();
    expectTypeOf(snap.pair[1]).toEqualTypeOf<number>();
    expectTypeOf(snap.pair.length).toEqualTypeOf<2>();
    const [label, count] = snap.pair;
    expectTypeOf(label).toEqualTypeOf<string>();
    expectTypeOf(count).toEqualTypeOf<number>();
    expect(() => {
      // @ts-expect-error A snapshot tuple is read-only.
      snap.pair[0] = 'b';
    }).toThrow();
    // @ts-expect-error There is no third position.
    expect(snap.pair[2]).toBeUndefined();
  });
});
```

### `n3.ts`

N3: cycles, what is shared, and the utilities on a snapshot that holds a cycle.

```ts
// N3: a cycle in the data. What a snapshot does, and what the utilities do
// with a snapshot that holds a cycle.
import {
  createClassyStore,
  shallowEqual,
  snapshot,
  subscribe,
} from '../wt/packages/classy-store/src/index';
import {
  createProxy,
  isChanged,
} from '../wt/packages/classy-store/src/storeRuntime';
import {
  persist,
  subscribeKey,
  withHistory,
} from '../wt/packages/classy-store/src/utils/index';
import {cloneSnapshotValue} from '../wt/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot';

const show = (label: string, run: () => unknown) => {
  let text: string;
  try {
    const value = run();
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (error) {
    text = `THROWS ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 80)}`;
  }
  console.log(`${label.padEnd(62)} ${text}`);
};
/** Every object reachable from a snapshot, each once. */
function reach(root: object): Set<object> {
  const seen = new Set<object>([root]);
  for (const node of seen) {
    for (const key of Reflect.ownKeys(node)) {
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      const value =
        descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (typeof value === 'object' && value !== null) seen.add(value);
    }
  }
  return seen;
}
const allFrozen = (root: object) =>
  [...reach(root)].every((node) => Object.isFrozen(node));

console.log('## 1. a store that holds itself');
type Self = {n: number; other: {m: number}; self?: Self};
const self = createClassyStore<Self>({n: 1, other: {m: 1}});
const beforeCycle = snapshot(self);
let calls = 0;
subscribe(self, () => calls++, {sync: true});
self.self = self;
show('the write: sync notifications', () => calls);
show('snapshot(store).self === snapshot(store)', () => {
  const s = snapshot(self);
  return String(s.self === s);
});
show('every reachable object is frozen', () =>
  String(allFrozen(snapshot(self))),
);
show('the same snapshot twice', () =>
  String(snapshot(self) === snapshot(self)),
);
show('a write: new snapshot, self follows, sibling kept', () => {
  const a = snapshot(self);
  self.n = 2;
  const b = snapshot(self);
  return [
    a !== b,
    b.self === b,
    a.self === a,
    b.other === a.other,
    a.n,
    b.n,
  ].join(',');
});
show('the snapshot taken before the cycle is untouched', () =>
  [beforeCycle.n, 'self' in beforeCycle].join(','),
);
show('snapshot(store.self) is the root snapshot', () =>
  String(snapshot(self.self as Self) === snapshot(self)),
);
show('delete the cycle: snapshot has no self', () => {
  delete self.self;
  return String('self' in snapshot(self));
});

console.log('\n## 2. a ring of two, a list that holds itself, two stores');
const ring = createClassyStore<{
  a: {name: string; b?: unknown};
  b: {name: string; a?: unknown};
}>({a: {name: 'a'}, b: {name: 'b'}});
ring.a.b = ring.b;
ring.b.a = ring.a;
show('ring: a.b === b, b.a === a, all frozen', () => {
  const s = snapshot(ring);
  return [s.a.b === s.b, s.b.a === s.a, allFrozen(s)].join(',');
});
show('ring: snapshot(ring.a) is the one inside the root snapshot', () =>
  String(snapshot(ring.a) === snapshot(ring).a),
);
const loop = createClassyStore<{list: unknown[]}>({list: [1]});
loop.list.push(loop.list);
show('list: list[1] === list, frozen, length', () => {
  const s = snapshot(loop);
  return [s.list[1] === s.list, Object.isFrozen(s.list), s.list.length].join(
    ',',
  );
});
const left = createClassyStore<{name: string; peer?: unknown}>({name: 'left'});
const right = createClassyStore<{name: string; peer?: unknown}>({
  name: 'right',
});
left.peer = right;
right.peer = left;
show(
  'two stores: left.peer.peer === left, snapshot(right) is left.peer',
  () => {
    const s = snapshot(left) as {peer: {peer: unknown}};
    return [s.peer.peer === s, snapshot(right) === (s.peer as unknown)].join(
      ',',
    );
  },
);

console.log(
  '\n## 3. a tree with parent pointers: what is shared after one write',
);
type Node = {id: number; value: number; parent?: unknown};
const tree = createClassyStore<{
  title: string;
  plain: {x: number};
  children: Node[];
}>({
  title: 't',
  plain: {x: 1},
  children: Array.from({length: 1000}, (_, id) => ({id, value: 0})),
});
for (const child of tree.children) child.parent = tree;
show('children whose parent is the root snapshot', () => {
  const s = snapshot(tree);
  return s.children.filter((c) => c.parent === s).length;
});
show('after one child is written: children with a new snapshot', () => {
  const a = snapshot(tree);
  tree.children[3].value = 1;
  const b = snapshot(tree);
  return `${b.children.filter((c, i) => c !== a.children[i]).length} of 1000; plain kept: ${b.plain === a.plain}`;
});
const flat = createClassyStore<{children: Node[]}>({
  children: Array.from({length: 1000}, (_, id) => ({id, value: 0})),
});
show('the same without parent pointers', () => {
  const a = snapshot(flat);
  flat.children[3].value = 1;
  const b = snapshot(flat);
  return `${b.children.filter((c, i) => c !== a.children[i]).length} of 1000`;
});
const time = (run: () => void, rounds: number) => {
  let best = Infinity;
  for (let r = 0; r < 7; r++) {
    const start = performance.now();
    for (let i = 0; i < rounds; i++) run();
    best = Math.min(best, (performance.now() - start) / rounds);
  }
  return `${(best * 1000).toFixed(1)} us`;
};
let tick = 0;
show('write one child, snapshot: with parent pointers', () =>
  time(() => {
    tree.children[tick++ % 1000].value = tick;
    snapshot(tree);
  }, 200),
);
show('write one child, snapshot: without', () =>
  time(() => {
    flat.children[tick++ % 1000].value = tick;
    snapshot(flat);
  }, 200),
);

console.log('\n## 4. getters and the utilities on a cyclic snapshot');
const self2 = createClassyStore<Self>({n: 1, other: {m: 1}});
self2.self = self2;
class Model {
  n = 1;
  me?: Model;
  get double() {
    return this.n * 2;
  }
  get viaCycle() {
    return (this.me as Model).n + 1;
  }
}
const model = createClassyStore(new Model());
model.me = model;
show('getters on the snapshot', () => {
  const s = snapshot(model);
  return [s.double, s.viaCycle, (s.me as Model).double].join(',');
});
show('shallowEqual(snapshot, snapshot)', () =>
  String(shallowEqual(snapshot(model), snapshot(model))),
);
show('cloneSnapshotValue keeps the cycle, mutable', () => {
  const c = cloneSnapshotValue(snapshot(self2), new WeakMap()) as Self;
  return [c.self === c, Object.isFrozen(c)].join(',');
});
show('structuredClone keeps the cycle', () => {
  const c = structuredClone(snapshot(self2)) as Self;
  return String(c.self === c);
});
show('JSON.stringify(snapshot)', () => JSON.stringify(snapshot(self2)));
show('JSON.stringify(store), for comparison', () => JSON.stringify(self2));
show('subscribeKey on a cyclic store', () => {
  const seen: number[] = [];
  const stop = subscribeKey(self2, 'n', (v) => seen.push(v), {sync: true});
  self2.n++;
  stop();
  return seen;
});
show('isChanged with the guard: related write, unrelated write', () => {
  const before = snapshot(self2);
  const affected = new WeakMap<object, unknown>();
  const proxy = createProxy(before, affected) as Self;
  (proxy.self as Self).self?.n;
  self2.other.m++;
  const unrelated = isChanged(before, snapshot(self2), affected, new WeakMap());
  self2.n++;
  return [
    isChanged(before, snapshot(self2), affected, new WeakMap()),
    unrelated,
  ].join(',');
});
show('isChanged without the guard, after an unrelated write', () => {
  const before = snapshot(self2);
  const affected = new WeakMap<object, unknown>();
  const proxy = createProxy(before, affected) as Self;
  (proxy.self as Self).self?.n;
  self2.other.m++;
  return String(isChanged(before, snapshot(self2), affected));
});
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
{
  const store = createClassyStore<Self>({n: 1, other: {m: 1}});
  store.self = store;
  const history = withHistory(store);
  store.n = 2;
  await flush();
  store.n = 3;
  await flush();
  history.undo();
  await flush();
  show('withHistory: undo on a cyclic store', () =>
    [
      store.n,
      store.self === store,
      snapshot(store).self === snapshot(store),
    ].join(','),
  );
  history.redo();
  await flush();
  show('withHistory: redo', () => [store.n, store.self === store].join(','));
  history.dispose();
}
{
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
  const store = createClassyStore<Self>({n: 1, other: {m: 1}});
  store.self = store;
  const errors: string[] = [];
  const handle = persist(store, {
    name: 'cyclic',
    storage,
    onError: (error, operation) =>
      void errors.push(`${operation}: ${String(error).slice(0, 60)}`),
  });
  await handle.hydrated;
  store.n = 2;
  await flush();
  show(
    'persist: all fields, cyclic store',
    () =>
      `stored ${memory.get('cyclic') ?? 'nothing'}; errors ${JSON.stringify(errors)}`,
  );
  handle.dispose();
  const picked = persist(store, {
    name: 'picked',
    storage,
    properties: ['n', 'other'],
  });
  await picked.hydrated;
  store.n = 3;
  await flush();
  show(
    'persist: properties without the cyclic field',
    () => `stored ${memory.get('picked') ?? 'nothing'}`,
  );
  picked.dispose();
}
```

### `n3-failed-build.ts`

N3: a build that throws part-way.

```ts
// N3: a build that throws part-way must leave no cached node that points to an
// unfinished snapshot.
import {
  createClassyStore,
  snapshot,
} from '../wt/packages/classy-store/src/index';

let armed = false;
const bad = new Proxy(
  {x: 1},
  {
    ownKeys(target) {
      if (armed) throw new Error('ownKeys failed');
      return Reflect.ownKeys(target);
    },
  },
);
const store = createClassyStore<{
  a: {root?: unknown; n: number};
  bad: {x: number};
}>({a: {n: 1}, bad});
store.a.root = store;
snapshot(store);
store.a.n = 2;
// Make `bad` stale too, so that the next build has to list its keys.
store.bad.x = 2;
armed = true;
try {
  snapshot(store);
  console.log('the armed build did not throw');
} catch (error) {
  console.log(`the armed build threw: ${(error as Error).message}`);
}
armed = false;
const next = snapshot(store);
console.log(
  `after the failure: a.root === root ${next.a.root === next}, a frozen ${Object.isFrozen(next.a)}, a.root frozen ${Object.isFrozen(next.a.root as object)}, a.n ${next.a.n}`,
);
```

### `spikeCycle.test.tsx`

N3: the real hook over a cycle. Placed in `packages/classy-store/src/frameworks/react/` of the worktree, run with `bun test`, and deleted afterwards.

```js
// SPIKE, not for the repository: the real hook over a store that holds a cycle.
import {afterEach, describe, expect, it} from 'bun:test';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createClassyStore} from '../../core/core';
import {useClassyStore} from './react';

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(element: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

type Self = {n: number; other: {m: number}; self?: Self};

describe('N3: useClassyStore over a cycle', () => {
  it('auto-tracked: renders for a write it read through the cycle, not for another', () => {
    const store = createClassyStore<Self>({n: 1, other: {m: 1}});
    store.self = store;
    let renders = 0;
    function View() {
      const snap = useClassyStore(store);
      renders++;
      return <span>{snap.self?.self?.n}</span>;
    }
    render(<View />);
    expect(container.textContent).toBe('1');
    act(() => {
      store.other.m = 2;
    });
    expect(renders).toBe(1);
    act(() => {
      store.n = 5;
    });
    expect(container.textContent).toBe('5');
    expect(renders).toBe(2);
  });

  it('selector: a row of a tree with parent pointers', () => {
    type Node = {id: number; value: number; parent?: unknown};
    const tree = createClassyStore<{children: Node[]}>({
      children: [
        {id: 0, value: 0},
        {id: 1, value: 0},
      ],
    });
    for (const child of tree.children) child.parent = tree;
    let renders = 0;
    function Row() {
      const row = useClassyStore(tree, (snap) => snap.children[0]);
      renders++;
      return <span>{row.value}</span>;
    }
    render(<Row />);
    act(() => {
      tree.children[1].value = 9;
    });
    // The other row was written. With a cycle every node gets a new snapshot,
    // so an identity selector on this row sees a change.
    expect(renders).toBe(2);
  });
});
```

### `bench-guard.mjs`

N3: the cost of proxy-compare's cycle guard on data without a cycle.

```js
// N3: what proxy-compare's cycle guard costs the React hook on data without a
// cycle. A component read `value` of every row; one row is written; time isChanged.
// Usage: bun|node bench-guard.mjs <build folder>
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const build = process.argv[2];
const {createClassyStore, snapshot} = await import(
  pathToFileURL(join(build, 'dist/index.mjs')).href
);
const {createProxy, isChanged} = await import(
  pathToFileURL(join(build, 'dist/storeRuntime.mjs')).href
);
const out = {};
for (const count of [10, 1000]) {
  const store = createClassyStore({
    other: 0,
    rows: Array.from({length: count}, (_, id) => ({id, value: id})),
  });
  const before = snapshot(store);
  const affected = new WeakMap();
  const proxy = createProxy(before, affected);
  let sum = 0;
  for (const row of proxy.rows) sum += row.value;
  store.other = 1; // nothing the component read
  const after = snapshot(store);
  for (const [label, run] of [
    ['no guard', () => isChanged(before, after, affected)],
    ['guard', () => isChanged(before, after, affected, new WeakMap())],
  ]) {
    let best = Infinity;
    for (let sample = 0; sample < 30; sample++) {
      const rounds = count === 10 ? 20000 : 500;
      const start = performance.now();
      for (let i = 0; i < rounds; i++) run();
      best = Math.min(best, ((performance.now() - start) * 1e6) / rounds);
    }
    out[`${count} rows read, unrelated write, ${label}`] = Math.round(best);
  }
  store.rows[count - 1].value = -1; // the last row the component read
  const changed = snapshot(store);
  for (const [label, run] of [
    ['no guard', () => isChanged(before, changed, affected)],
    ['guard', () => isChanged(before, changed, affected, new WeakMap())],
  ]) {
    let best = Infinity;
    for (let sample = 0; sample < 30; sample++) {
      const rounds = count === 10 ? 20000 : 500;
      const start = performance.now();
      for (let i = 0; i < rounds; i++) run();
      best = Math.min(best, ((performance.now() - start) * 1e6) / rounds);
    }
    out[`${count} rows read, last row written, ${label}`] = Math.round(best);
  }
}
console.log(JSON.stringify(out, null, 1));
```

### `bench-snap.mjs`

N1, N3 and N5: snapshot costs against a saved build.

```js
// Snapshot costs for N1, N3 and N5, against a saved build.
// Usage: bun|node bench-snap.mjs <build folder> [text a case name must contain]
// Prints one JSON object: nanoseconds per operation, the fastest of 15 samples.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const build = process.argv[2];
const only = process.argv[3];
const load = (file) => import(pathToFileURL(join(build, 'dist', file)).href);
const {batch, createClassyStore, snapshot, subscribe} = await load('index.mjs');
const {subscribeKey} = await load('utils/index.mjs');
const {reactiveMap} = await load('collections/index.mjs');

// `new WeakRef()` pins its target until the turn of the event loop ends, so
// yield between samples.
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

async function measure(setup) {
  const run = setup();
  let iterations = 1;
  for (;;) {
    const start = performance.now();
    run(iterations);
    if (performance.now() - start > 20) break;
    iterations *= 2;
    await pause();
  }
  for (let warm = 0; warm < 5; warm++) {
    run(iterations);
    await pause();
  }
  let best = Infinity;
  for (let sample = 0; sample < 15; sample++) {
    const start = performance.now();
    run(iterations);
    best = Math.min(best, ((performance.now() - start) * 1e6) / iterations);
    await pause();
  }
  // The machine is shared and busy. Other work only adds time, so the fastest
  // sample is the one closest to the cost of the code.
  return best;
}

const rows = (count) =>
  Array.from({length: count}, (_, id) => ({id, value: id, done: false}));

const writeThenSnapshot = (count) => () => {
  const store = createClassyStore({count: 0, rows: rows(count)});
  snapshot(store);
  return (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      store.rows[i % count].value = i;
      sum += snapshot(store).rows.length;
    }
    return sum;
  };
};

const cases = {
  'rows 1,000: write one row, snapshot': writeThenSnapshot(1000),
  'rows 10,000: write one row, snapshot': writeThenSnapshot(10000),
  'rows 100: write one row, snapshot': writeThenSnapshot(100),
  'rows 1,000: write 10 rows, snapshot': () => {
    const store = createClassyStore({rows: rows(1000)});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 10; k++)
          store.rows[(i * 97 + k * 31) % 1000].value = i;
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
  'rows 1,000: write 100 rows, snapshot': () => {
    const store = createClassyStore({rows: rows(1000)});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 100; k++)
          store.rows[(i * 97 + k * 7) % 1000].value = i;
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
  'rows 1,000: replace one row, snapshot': () => {
    const store = createClassyStore({rows: rows(1000)});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.rows[i % 1000] = {id: i, value: i, done: true};
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
  'rows 1,000: push and pop, snapshot': () => {
    const store = createClassyStore({rows: rows(1000)});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.rows.push({id: i, value: i, done: false});
        store.rows.pop();
        sum += snapshot(store).rows.length;
      }
      return sum;
    };
  },
  'record of 1,000 keys: write one, snapshot': () => {
    const byId = {};
    for (let id = 0; id < 1000; id++) byId[`k${id}`] = {id, value: id};
    const store = createClassyStore({byId});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.byId[`k${i % 1000}`].value = i;
        sum += snapshot(store).byId.k0.id;
      }
      return sum;
    };
  },
  'reactiveMap of 1,000: change one value, snapshot': () => {
    const store = createClassyStore({
      map: reactiveMap(rows(1000).map((row) => [row.id, row])),
    });
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        store.map.get(i % 1000).value = i;
        sum += snapshot(store).map.size;
      }
      return sum;
    };
  },
  'cached snapshot': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    snapshot(store);
    return (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += snapshot(store).count;
      return sum;
    };
  },
  'rows 1,000: create a store and take its first snapshot': () => (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += snapshot(createClassyStore({rows: rows(1000)})).rows.length;
    }
    return sum;
  },
  'write a root field, no snapshot': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    return (n) => {
      for (let i = 0; i < n; i++) store.count = i;
      return store.count;
    };
  },
  'write one of 1,000 rows, no snapshot': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    snapshot(store);
    return (n) => {
      for (let i = 0; i < n; i++) store.rows[i % 1000].value = i;
      return store.count;
    };
  },
  'write a field three objects deep, no snapshot': () => {
    const store = createClassyStore({a: {b: {c: {value: 0}}}});
    snapshot(store);
    return (n) => {
      for (let i = 0; i < n; i++) store.a.b.c.value = i;
      return store.a.b.c.value;
    };
  },
  'push and pop on 1,000 rows, no snapshot': () => {
    const store = createClassyStore({rows: rows(1000)});
    snapshot(store);
    return (n) => {
      for (let i = 0; i < n; i++) {
        store.rows.push({id: i, value: i, done: false});
        store.rows.pop();
      }
      return store.rows.length;
    };
  },
  'A1: 2,000 direct row writes, sync subscriber that snapshots (whole loop)':
    () => {
      const store = createClassyStore({rows: rows(2000)});
      subscribe(store, () => snapshot(store), {sync: true});
      return (n) => {
        for (let i = 0; i < n; i++) for (const row of store.rows) row.value++;
        return store.rows.length;
      };
    },
  'A1 inside batch() (whole loop)': () => {
    const store = createClassyStore({rows: rows(2000)});
    subscribe(store, () => snapshot(store), {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) {
        batch(() => {
          for (const row of store.rows) row.value++;
        });
      }
      return store.rows.length;
    };
  },
  'subscribeKey(count, sync) beside 1,000 rows: write one row': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    let calls = 0;
    subscribeKey(store, 'count', () => calls++, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.rows[i % 1000].value = i;
      return calls;
    };
  },
  'subscribeKey(rows, sync) beside 1,000 rows: write one row': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    let calls = 0;
    subscribeKey(store, 'rows', () => calls++, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.rows[i % 1000].value = i;
      return calls;
    };
  },
  'subscribeKey(count, sync): write count': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    let calls = 0;
    subscribeKey(store, 'count', () => calls++, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.count = i + 1;
      return calls;
    };
  },
  'plain sync subscriber beside 1,000 rows: write one row': () => {
    const store = createClassyStore({count: 0, rows: rows(1000)});
    let calls = 0;
    subscribe(store, () => calls++, {sync: true});
    return (n) => {
      for (let i = 0; i < n; i++) store.rows[i % 1000].value = i;
      return calls;
    };
  },
};

const out = {};
for (const [name, setup] of Object.entries(cases)) {
  if (only && !name.includes(only)) continue;
  const value = await measure(setup);
  out[name] = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
}
console.log(JSON.stringify(out));
```

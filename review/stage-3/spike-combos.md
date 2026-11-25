# Spike: three combinations that were decided and never built

Brief: `review/stage-3/briefs/spike-combos.md`. Scratch folder
`<scratch>/stage-3-spike-combos/`, worktree `<scratch>/stage-3-spike-combos/wt`
at `57404c3`. Nothing in the repository was changed except this file.

## Summary

- **K1. A cycle and the in-place restore.** Built together, decisions 30 and
  44 overflow the stack on undo, redo and a DevTools jump of every store
  with a cycle that the restore has to enter, and leave the store half
  restored. A clone map entry per node entered, plus the recorded root
  standing for the store, makes all six cases return with the right values
  and node identity. 8 new lines in `cloneSnapshot.ts`, 16 bytes on
  `./utils`, the 1,000-row undo inside the spread.
- **K2. The method name.** P7 costs 5 to 6% on every method call on Node.
  A hook slot that `devtools()` fills while connected, and that the method
  path only tests, is inside the unmodified build's spread on both engines in
  every round, and costs 12 bytes in the main entry, 8 fewer than P7.
- **K3. Getter values for the panel.** `devtools` adds the root store's class
  getter values to a shallow copy of what it sends, each read guarded. 95
  bytes on `./utils`. It returns on a cycle because it walks nothing, and it
  sends an entry today's build cannot serialise: a class getter that throws.

## K1. Undo on a store with a cycle

- **Question.** Objection 1 of `adversarial-whole.md`: with decision 44 (a
  snapshot keeps a cycle, N3) and decision 30 (restore in place, V4) in one
  build, do undo, redo and a DevTools jump of a store with a cycle return?
  Stage 1 finding 8, M36, M60.
- **Build.** A worktree at `57404c3` with `c1-p7-p8-v4-full.patch` of
  `<scratch>/stage-3-spike-classes-2/patches/` (the base class C1, P7, P8 and
  V4, the build V4 was measured on), then `n3-cycles.patch` of
  `spike-snapshots.md`. N3's hunk in `cloneSnapshot.ts` (check the clone map
  before `canProxy`) was applied by hand. Its hunk in `history.ts`
  (`clones.set(recorded, proxyStore)`) has nowhere to go: under V4
  `withHistory` calls the shared `applyState`, so the same line moves there
  (below). The appendix says how to rebuild the combination; the hand-placed
  hunk is `k1-n3-clone-hunk.patch` there.
- **Reproduction.** `repro/k1.ts` in the appendix, with a fake extension that
  answers a jump to entry 0 by its id. Six stores; each is made, attached,
  written once, then undone, redone, and in a fresh copy jumped back.

### Before: V4 and N3 together

V4 alone cannot be attached to any of these stores: `withHistory()` and
`devtools()` throw "circular reference detected in snapshot" on attach,
because they take a snapshot. With N3 they attach, and then:

| Store, write                                         | Undo                                     | Redo         | DevTools jump |
| ---------------------------------------------------- | ---------------------------------------- | ------------ | ------------- |
| `{n: 1, self: store}`, `n = 2`                       | `RangeError` after `n` was put back      | `RangeError` | `RangeError`  |
| `a.peer = b`, `b.peer = a`, `a.name = 'x'`           | `RangeError` after `a.name` was put back | `RangeError` | `RangeError`  |
| 3 rows, each `row.list` is the store, a row's `done` | `RangeError`, nothing put back           | returns      | `RangeError`  |
| 3 rows, each `row.parent` is the rows array          | `RangeError`, nothing put back           | returns      | `RangeError`  |
| `{n, self: store}`, `self = null` (breaks the cycle) | `RangeError`, `self` stays `null`        | returns      | `RangeError`  |
| `{n, self: null}`, `self = store` (closes it)        | returns, `self` is `null`                | `RangeError` | returns       |

So the reviewer's model is right about the library: every restore that has to
go into a node on a cycle overflows the stack. It is worse than "never
returns". A `RangeError` part-way leaves the store half restored, the batch
still notifies once with that state, and the history pointer has already
moved, so the next redo "returns" over a state that was never applied. The
one case that works is the restore whose target has no cycle in it.

### The fix: a node is entered once per restore

`k1-cycle-guard.patch`, `cloneSnapshot.ts` only: 16 lines added and 11
removed, of which 8 are new and the rest is the old block one level less
indented (the `if` becomes an early return).

- `restoreValue` already passes a `WeakMap` from a recorded snapshot to what
  it becomes, for the copy path. Before it descends into a live node it now
  records `snapshot -> live node` there, and a second visit of the same
  snapshot in one call returns the live node at once. Because the map is the
  one `cloneSnapshotValue` also reads, a copied branch that points at a node
  being restored points at the live node, not at a new copy.
- `applyState` enters the recorded root as the store before it starts. That
  is N3's line from `history.ts`, moved to the function both callers now
  share, so DevTools gets it too.
- The mark is set only when the restore goes into a node, after the check
  that the node's snapshot is the recorded one. A first draft set it for
  every node it looked at, which costs one `WeakMap` write per untouched row:
  medians of 282 to 296 microseconds against 261 to 277 for the 1,000-row
  undo, higher in all six rounds.

| Store, write                                | Undo, redo, DevTools jump                                           |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `{n: 1, self: store}`, `n = 2`              | all return; `n` 1, 2, 1; `self === store` after each                |
| `a.peer = b`, `b.peer = a`, `a.name = 'x'`  | all return; `a` is the node that was made; both `peer` links kept   |
| 3 rows, each `row.list` is the store        | all return; each row is the node that was made; `list` is the store |
| 3 rows, each `row.parent` is the rows array | all return; the same, `parent` is the rows array                    |
| `self = null` (breaks the cycle)            | undo and jump put `self` back as the store; redo makes it `null`    |
| `self = store` (closes it)                  | undo and jump make it `null`; redo puts the store back              |

One synchronous notification per undo in every case.

### Result

| Measure                                          | V4 and N3           | With the guard         |
| ------------------------------------------------ | ------------------- | ---------------------- |
| Tests                                            | 1,305 pass, 36 fail | the same 36            |
| Typecheck                                        | 2 errors            | the same 2             |
| Main entry, gzipped                              | 3,800               | 3,800                  |
| `./utils` adds to main                           | 3,193               | 3,209, **+16**         |
| 1,000 plain rows, one undo and its snapshot, Bun | 261, 263, 268 µs    | 264, 264, 270 µs       |
| 1,000 base-class rows, the same                  | 293, 294, 299 µs    | 293, 297, 314 µs       |
| 1,000 rows that point back to the store          | `RangeError`        | 1.86 ms (1.74 to 2.09) |

- The 36 failures are the 29 of the V4 build (the 28 of the C1 build and the
  one P8 **fixes**) and the 7 of N3 that assert the throw (**fixes** under
  decision 44). The guard adds none and removes none: no test has a cycle and
  a history.
- The two type errors are the two of the V4 build: the main entry's export
  list (C1 adds `ClassyStore`) and P7's option list, both **incidental**.
- Timings: `repro/bench-undo.ts` of V4, unchanged, three rounds of each build
  back to back, the medians of five. The guard is inside the spread on both
  kinds of rows. 100 rows with back pointers take 0.18 ms and 1,000 take 1.86
  ms, so the cyclic case is linear: the cost is N3's, every row on the cycle
  gets a new snapshot, not the restore's.
- Main-entry bytes of this build (3,800) are C1, P7 and N3 together; the
  guard does not touch the main entry.

### What it changes for a user

Nothing that works today changes. Without the guard, decisions 30 and 44
together turn "`withHistory` throws on attach" into "undo overflows the stack
and leaves the store half restored", which is worse.

### Recommendation

**Do it, as part of decision 30. Before 1.0**, with decision 30. Decision 44
should say that `applyState` enters each node once per call and treats the
recorded root as the store; the line N3 put in `history.ts` belongs there.

### Cost for stage 4

`cloneSnapshot.ts`, 8 lines. Tests first, in the commit of decision 30 (or
whichever of 30 and 44 lands second): the six rows of the table for undo,
redo and a jump by id, each asserting that it returns, the values, node
identity and one synchronous notification. 16 bytes on `./utils`. Risk low.

## K2. The method name for `devtools` without a cost for everyone

- **Question.** Objection 17 of `adversarial-whole.md`: P7 names DevTools
  entries through a hook in `transactional()` that every method call runs,
  `devtools()` or not. Can the core hold only a slot that `devtools()` fills
  while connected, so that a method call without `devtools` costs what it
  costs today? Decisions 4 and 27, M57.
- **Builds**, each on a clean worktree at `57404c3`, so that nothing else in
  them moves the method path:
  - **base**: unmodified.
  - **P7**: `p7.patch` of `persist-devtools.md`, as it is. `transactional()`
    saves the outer name, sets `currentAction ??= method.name`, and restores
    it in its `finally`, on every call.
  - **slot** (`k2-slot-on-p7.patch`, 34 added and 5 removed against P7): P7
    with a counter `naming` in the
    core. `transactional()` tests it; when it is not zero the call goes to a
    second function, `runNamed`, which is P7's body. `devtools()` adds 1 on
    connect and takes 1 on `dispose()`.
  - **hook** (`k2-hook-on-p7.patch`, 35 lines added and 10 removed against
    P7): the core holds only
    `let methodHook` and an internal `setMethodHook()`. `transactional()`
    runs `if (methodHook) return methodHook(method, receiver, args)` and is
    otherwise today's code. The naming moves into `devtools.ts`: its hook
    keeps the outer name, sets its own `currentAction`, and runs the method
    inside the public `batch()`, which is the same transaction
    `transactional()` opens. The first connection installs the hook, the
    last `dispose()` removes it. `actionName()` leaves the core.
- **Reproduction** (`repro/k2.ts`, a fake extension). Under both new forms:
  `rename()`, `birthday()` (which calls `rename()`) and two direct writes in
  one task send `["rename","birthday","STORE_UPDATE"]`, as P7 does; a second
  store's connection still names `birthday` after the first connection is
  disposed; `dispose()` twice is harmless; a reconnected store names its
  entries again.

### Result

`store.method` of `bun run benchmark:core` (`--only store.method`, five fresh
processes per build), the four builds back to back, five rounds on each
engine. Medians in nanoseconds; lowest and highest of each round in brackets.

| Build | Bun, five rounds                     | Node, five rounds                        |
| ----- | ------------------------------------ | ---------------------------------------- |
| base  | 237, 220, 231, 231, 228 (216 to 240) | 298, 296, 295, 296, 297 (291 to 305)     |
| P7    | 229, 227, 235, 226, 224 (218 to 245) | **316, 313, 314, 310, 310 (305 to 355)** |
| slot  | 226, 235, 231, 231, 231 (220 to 245) | 296, 296, 297, 296, 296 (293 to 310)     |
| hook  | 232, 230, 234, 232, 231 (219 to 238) | 299, 292, 299, 296, 295 (290 to 314)     |

An earlier block of four rounds of base, P7 and slot gave the same picture
(Node: base 288 to 296, P7 305 to 313, slot 294 to 301).

- On Node, P7's range is above the base's in four rounds of five and touches
  it in the fifth: 5 to 6% on every method call, as the reviewer says. The
  slot and the hook are inside the base's spread in every round.
- On Bun no build differs from another.

| Bytes, gzipped | base  | P7          | slot        | hook           |
| -------------- | ----- | ----------- | ----------- | -------------- |
| Main entry     | 3,661 | 3,681, +20  | 3,701, +40  | **3,673, +12** |
| `./utils`      | 6,347 | 6,750, +403 | 6,788, +441 | 6,799, +452    |

Every other entry carries the runtime and moves with the main entry: +3 to
+16 under the hook (P7: +12 to +22). Tests: 1,341 pass under both forms.
Typecheck: the one error P7 already has, its option list in
`types.utils.test.ts` (**incidental**, as P7 says).

### What it changes for a user

Nothing visible. While `devtools` is connected a method call allocates one
closure for `batch()`, which is a development-time cost only. One edge, from
reading: the hook slot is one per runtime, and the connection counter one per
copy of `./utils`. An app that loads `./utils` twice (its ESM and its CJS
build) and connects `devtools` from both would have one copy's hook replace
the other's, and that copy's entries fall back to `STORE_UPDATE`. Not run.

### Recommendation

**Do the hook form instead of P7's hook. Before 1.0**, with decision 27,
which it changes. It is the only form that is both inside the base's spread
on Node and smaller than P7 in the main entry: 12 bytes, not 20; the slot
form costs 40 because the call body is written twice. Decision 27's sentence
"that is the price of knowing which method wrote" goes; decision 4's main-entry
figure takes 8 bytes off P7's share, and `./utils` 49 more.

Without any help from the core, `devtools` could not name entries by method:
by the time its synchronous subscriber runs, the method has returned, so not
even a stack trace holds it. It could name them by what changed (the top-level
keys whose snapshots differ from the last one sent), which is free for the
core and is what it would fall back to; or wrap the methods of the store's
class prototype while connected, which changes the user's class for every
instance and is not worth it.

### Cost for stage 4

`core.ts` (one line in `transactional()`, the slot and its setter),
`storeRuntime.ts`, `devtools.ts`. Tests: the entry names with one and two
connections, after one is disposed and after a reconnect; a method that
throws while connected leaves the name cleared; a class stored as data and
constructed while connected. The benchmark `store.method` needs no change;
its Node figure stays at the baseline. Risk low.

## K3. What `devtools` sends once snapshots carry no getter values

- **Question.** Objection 18 of `adversarial-whole.md`: decision 43 moves
  class getters onto a derived prototype, so a snapshot no longer lists them,
  and promises that `devtools` adds their values back. That was never built,
  nor its bytes counted, and a walk that adds values to nested snapshots
  would meet objection 1's cycles. Decisions 43, 44 and 4, M33.
- **Build.** A worktree at `57404c3` with `n2a-one-loop-with-s1.patch` of
  `spike-snapshots.md` (form A with S1, decision 43's evidence), then P7. One
  hunk of P7 is rejected, the import lines of `cloneSnapshot.ts`; both sides'
  imports were kept by hand. Then N3, whose two hunks in `snapshot.ts` and one
  in `cloneSnapshot.ts` meet form A and were also resolved by hand
  (`k3-n3-on-n2a-p7.patch`, the same resolution the snapshot report made for
  its combination). Then the change itself.
- **The change** (`k3-devtools-getters.patch`), `devtools.ts` only, 29 lines
  added and 2 removed:
  - On connect, `devtools` lists the getter names on the root store's
    prototype chain, up to `Object.prototype`. Once, not per entry.
  - What it hands `init()` and `send()` is a shallow copy of the snapshot
    with one more key per getter, read from the snapshot (so memoized), each
    read in `try`. A getter that throws is sent as its error text,
    `"Error: no discount for ann"`, and the entry still goes.
  - A root with no class getter is sent as the snapshot itself, as today.
  - Nested objects are not walked: they are the snapshot's own children, so
    there is no walk to meet a cycle. A nested store keeps only its fields; an
    object-literal getter stays in the payload because form A keeps it an
    own accessor.
  - What `devtools` keeps for an exact jump is still the snapshot, not the
    copy.
- **Reproduction.** `repro/k3.ts`, a fake extension that records what
  `init()` and `send()` receive. The payload is printed as the panel would
  see it, with a cycle written as a reference to its path (the extension's
  serialiser, `jsan`, writes cycles as references too; not run against the
  real extension), and as `JSON.stringify` of it.

### Payloads

A class `Cart extends Base`: fields `owner`, `price`, `qty`; getters `total`
and `broken` (throws) on `Cart`, `label` on `Base`; a field `nested` holding an
object literal with a getter `twice`, and a field `line` holding a store of
class `Line` with a getter `half`. After `setQty(5)`:

| Build                    | What the panel gets for the `setQty` entry                                                                                                          | `JSON.stringify` of it           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Today                    | `owner, price, qty: 5, nested {n, twice}, line {n, half}, total 15, broken, label` with `broken` an accessor that throws when it is read            | **throws** "no discount for ann" |
| Form A, S1, P7, N3       | `{"owner":"ann","price":3,"qty":5,"nested":{"n":1,"twice":2},"line":{"n":4}}`                                                                       | the same                         |
| The same with the change | `{"owner":"ann","price":3,"qty":5,"nested":{"n":1,"twice":2},"line":{"n":4},"total":15,"broken":"Error: no discount for ann","label":"ann's cart"}` | the same                         |

A plain store with a cycle, `{n, self: store, child: {name, up: store}}`, after
`n = 2`:

| Build                    | Payload                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| Today                    | `devtools()` throws "circular reference detected in snapshot"        |
| Form A, S1, P7, N3       | `{"n":2,"self":"[cycle: $]","child":{"name":"c","up":"[cycle: $]"}}` |
| The same with the change | the same: no getter, so the snapshot is sent as it is                |

A class store with a getter and a cycle, `class Node {n; self; get double()}`
with `self = store`, after `n = 2`: without the change
`{"n":2,"self":"[cycle: $]"}`; with it
`{"n":2,"self":{"n":2,"self":"[cycle: $.self]"},"double":4}`. The copy is a
new object, so `self` points to the snapshot, one level down, and the cycle
closes there. It returns and nothing is lost; the panel shows the root once
more under `self`.

Two things this shows that were not known:

- **Today, a class getter that throws breaks the entry.** The snapshot holds
  it as an own enumerable accessor, so serialising the snapshot runs it and
  `JSON.stringify` throws. Whether the extension then drops the entry or
  shows an error was not run. After decision 43 with this change, the entry
  is sent with the error text.
- **A jump by JSON that carries the added keys back is harmless.**
  `repro/k3-jump.ts`: the extension's JSON of the first entry, with `total`
  and `broken` in it, restores `qty` and adds no own key: `applyState`'s data
  key check skips the getters.

### Result

| Measure                | Form A, S1, P7, N3  | With the change |
| ---------------------- | ------------------- | --------------- |
| Tests                  | 1,320 pass, 21 fail | the same 21     |
| Typecheck              | 1 error             | the same        |
| Main entry, gzipped    | 3,924               | 3,924           |
| `./utils` adds to main | 3,124               | 3,219, **+95**  |

The 21 failures are the 14 of form A with S1 and the 7 of N3, as the
snapshot report lists them for its combination. The type error is P7's
option list (**incidental**). No test covers what `devtools` sends.

### What it changes for a user

Against today: the panel shows the same fields and the root's getter values.
It no longer shows the getter values of nested class instances or nested
stores (`line.half` above). A throwing getter shows its error instead of
spoiling the entry.

### Recommendation

**Do it, as part of decision 43. Before 1.0**, because the DevTools tutorial
promises computed values. Decision 43 should say: "`devtools` adds the values
of the root store's class getters to what it sends, each read guarded; nested
objects are sent as they are." The tutorial says the same, in one sentence.
Adding nested getter values would need a walk with a visited set and a copy
of every node on the way, for every entry; not worth it for a development
tool. 95 bytes go into the `./utils` ceiling.

### Cost for stage 4

`devtools.ts`, 29 lines. Tests: the payload for a class with fields and
getters, one that throws, an inherited getter, a root without getters (the
snapshot itself is sent), a cycle, and a JSON jump that carries the getter
keys back. One sentence in `DEVTOOLS_TUTORIAL.md`. Risk low.

## What the decision document should say

- **Decision 30** (and 44): "A restore enters each live node once per call,
  and the recorded root stands for the store, so a store with a cycle can be
  undone, redone and jumped." Its evidence adds K1: 16 bytes on `./utils`, the
  six cases as tests. Decision 44's "`withHistory` and `cloneSnapshot` are made
  safe for it" points to this, because under decision 30 N3's line in
  `history.ts` has moved into `applyState`.
- **Decision 27**: replace "The name of the method costs 20 bytes in the main
  entry, for a hook in `transactional()`" with "`devtools()` installs a hook
  while it is connected; the method path only tests it. 12 bytes in the main
  entry, no measurable cost on a method call without `devtools`." Objection 17's
  first point is then answered.
- **Decision 43**: replace "it adds the getters' values to what it sends" with
  "it adds the values of the root store's class getters to what it sends, each
  read guarded so a getter that throws shows its error; nested objects are sent
  as they are". 95 bytes in the `./utils` ceiling.
- **Decision 4**, the byte figures: main entry P7 share 12, not 20; `./utils`
  +16 (K1), +49 (K2's hook moves code there) and +95 (K3) on top of the figures
  it has.

## Verified and not verified

**Run.** Each build's unit suite (`bun run test`), the package typecheck and
`bun run size`, from the worktree root: the V4 and N3 build before and after
the guard; P7 with the slot and with the hook; form A with S1, P7 and N3,
before and after the getter change; P7 alone and the base for size. The
reproductions `repro/k1.ts`, `repro/k2.ts`, `repro/k3.ts`, `repro/k3-jump.ts`
on the source of each build. V4's `bench-undo.ts` and `repro/bench-cycle.ts`
on Bun, three rounds back to back. `benchmark:core --only store.method` on
Bun 1.4.5 and Node 24.21.0 for four saved builds, each with its own
`package.json` beside its `dist`, five fresh processes per build, nine rounds
in all.

**Not run.** The browser, framework and mutation suites. The real Redux
DevTools extension: what it does with a cyclic state, with a payload whose
getter threw, and the entry ids. The 1,000-row undo on Node (V4's script
imports TypeScript source). The full `benchmark:core` set: only
`store.method` was timed, because only the method path changed in K2; K1 and
K3 do not touch the main entry's code.

**Reasoning only.** That two copies of `./utils` (ESM and CJS) connected at
once would overwrite each other's hook in K2. That the K1 guard needs no test
other than the six cases: the map is per call and the only new early return
is for a node already being written in that call.

**Timings.** Other agents ran benchmarks and suites during every run. A
difference is reported only where ranges of the same round do not touch:
P7 against the base on Node in four rounds of five. Everything else is inside
the spread.

## Addendum: an undo after an object moved to another store, or is shared

Added by the orchestrating agent on 2026-11-25, for objection 8 of
`adversarial-edges.md`. Decision 30 restores a live object in place. What
happens when that object has since moved to another store, or sits in two?

- **Build.** A worktree at `57404c3` with `k1-combined-fixed.patch` (V4,
  N3 and the guard of K1), and the unmodified source beside it.
- **Script.** `moved.ts`, below. It imports the source, so no build is
  needed: `SRC=<worktree>/packages/classy-store/src bun moved.ts`.

| Case                                                                | Unmodified                                                                | Decisions 30 and 44                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A card moves from store A to store B, B edits it, A undoes the move | A gets a copy; B keeps its edit and is not told                           | A gets the card itself back; it is the same object in B; B's edit is undone too, and B's subscribers are told once |
| An object shared by A and B from the start; B edits it; A undoes    | A gets a copy, so the two stores **no longer share it**; B keeps the edit | Still one object; the edit is undone in both; B's subscribers are told once; a redo puts it back in both           |
| A row is removed from A and nobody else holds it; A undoes          | The row is back as a new object                                           | The row is back as the object the caller held                                                                      |
| A card moves from A to B with no edit; A undoes                     | A gets a copy; B keeps the card                                           | Both stores hold the one card                                                                                      |

So the restore follows the object, as decision 30 says. The cost is the
first row: an undo in one store changes an object that another store now
holds. Today's behaviour has its own defect in the second row, which nobody
had recorded: an undo silently ends the sharing of an object between two
stores.

### `moved.ts`

```ts
// Objection E8: an undo after an object moved to, or is shared with, another store.
// Run: SRC=<worktree>/packages/classy-store/src bun moved.ts
const SRC = process.env.SRC;
const {createClassyStore, snapshot, subscribe} = await import(
  `${SRC}/index.ts`
);
const {withHistory} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));
const show = (label: string, value: unknown) =>
  console.log(label.padEnd(58), JSON.stringify(value));

// 1. A card moves from board A to board B, B edits it, A undoes the move.
{
  const a = createClassyStore({cards: [{id: 1, title: 'one'}]});
  const b = createClassyStore({cards: [] as {id: number; title: string}[]});
  const history = withHistory(a);
  const card = a.cards[0];
  await flush();
  let bCalls = 0;
  subscribe(b, () => bCalls++, {sync: true});
  // the move
  a.cards.splice(0, 1);
  b.cards.push(card);
  await flush();
  b.cards[0].title = 'edited in B';
  await flush();
  bCalls = 0;
  history.undo();
  show('1 moved: A has the card back', a.cards.length);
  show('1 moved: it is the same object as before', a.cards[0] === card);
  show('1 moved: it is the same object as in B', a.cards[0] === b.cards[0]);
  show('1 moved: title in A after undo', a.cards[0]?.title);
  show('1 moved: title in B after A undid', b.cards[0]?.title);
  show('1 moved: B subscribers called by A undo', bCalls);
  show('1 moved: B snapshot title', snapshot(b).cards[0]?.title);
}

// 2. An object shared by two stores from the start; B edits it; A undoes.
{
  const shared = createClassyStore({n: 1});
  const a = createClassyStore({shared, own: 0});
  const b = createClassyStore({shared});
  const history = withHistory(a);
  await flush();
  let bCalls = 0;
  subscribe(b, () => bCalls++, {sync: true});
  b.shared.n = 2;
  await flush();
  bCalls = 0;
  history.undo();
  show('2 shared: n in A after undo', a.shared.n);
  show('2 shared: n in B after A undid', b.shared.n);
  show(
    '2 shared: still one object',
    a.shared === b.shared && a.shared === shared,
  );
  show('2 shared: B subscribers called by A undo', bCalls);
  history.redo();
  show('2 shared: n in B after A redid', b.shared.n);
}

// 3. A row was removed and dropped (nobody else holds it), then undo.
{
  const a = createClassyStore({rows: [{id: 1}, {id: 2}]});
  const history = withHistory(a);
  const first = a.rows[0];
  await flush();
  a.rows.splice(0, 1);
  await flush();
  history.undo();
  show('3 removed: row is back', a.rows.length);
  show('3 removed: it is the object the caller held', a.rows[0] === first);
}

// 4. A card moved to B and A's undo, on a card B has since removed again.
{
  const a = createClassyStore({cards: [{id: 1, title: 'one'}]});
  const b = createClassyStore({cards: [] as {id: number; title: string}[]});
  const history = withHistory(a);
  const card = a.cards[0];
  await flush();
  a.cards.splice(0, 1);
  b.cards.push(card);
  await flush();
  history.undo();
  show('4 moved, no edit: A has it', a.cards[0] === card);
  show('4 moved, no edit: B still has it', b.cards[0] === card);
  show('4 moved, no edit: B length', b.cards.length);
}
```

## Appendix: how to build each spike again

All patches apply to a worktree at `57404c3`; run `bun install
--frozen-lockfile` and `bun run build` once.

- **K1 before the guard.** `c1-p7-p8-v4-full.patch` from
  `<scratch>/stage-3-spike-classes-2/patches/`; then `n3-cycles.patch` of
  `spike-snapshots.md` without its sections for `cloneSnapshot.ts` and
  `history.ts` (for example
  `awk '/^diff --git/{p=($0 !~ /cloneSnapshot|history/)} p' n3-cycles.patch`);
  then `k1-n3-clone-hunk.patch` below, which is N3's `cloneSnapshot.ts` hunk
  placed on V4's file. **K1 with the guard:** add `k1-cycle-guard.patch`.
- **K2.** `p7.patch` of `persist-devtools.md`; then `k2-slot-on-p7.patch` or
  `k2-hook-on-p7.patch`.
- **K3.** `n2a-one-loop-with-s1.patch` of `spike-snapshots.md`; then
  `p7.patch` with `git apply --reject`, and in `cloneSnapshot.ts` keep both
  sides' imports by hand (`batch`, `originalSnapshotAccessor`,
  `originalSnapshotPrototype`, `snapshot` from the runtime, `canProxy` and
  `findPropertyDescriptor` from internal) and P7's doc comment and `untrusted`
  parameter; then `k3-n3-on-n2a-p7.patch`, which is N3 placed on that tree;
  then `k3-devtools-getters.patch`.
- Scripts take the source folder in `SRC`:
  `SRC=<worktree>/packages/classy-store/src bun repro/k1.ts`. The benchmark
  copies are `<scratch>/stage-3-spike-combos/bench/<build>/pkg/` with `dist`,
  `package.json` and `tests/benchmark`, and a `node_modules` link beside
  `pkg` to the package's own `node_modules` for `proxy-compare`.

## Appendix: patches

### `k1-n3-clone-hunk.patch`: N3 on V4: the clone map is read before `canProxy`

```diff
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index e13feb0..32d64c4 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -16,10 +16,11 @@ export function cloneSnapshotValue(
   clones: WeakMap<object, object>,
   untrusted?: boolean,
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
```

### `k1-cycle-guard.patch`: K1: a node is entered once per restore

```diff
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index 32d64c4..05cdc14 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -79,18 +79,20 @@ function restoreValue(
 ): unknown {
   const live = untrusted ? undefined : liveNodeOf(state);
   if (!live) return cloneSnapshotValue(state, clones, untrusted);
-  // Unchanged since it was recorded: nothing below it to write.
-  if (snapshot(live) !== state) {
-    if (Array.isArray(live)) {
-      const recorded = state as unknown[];
-      for (let i = 0; i < recorded.length; i++) {
-        const value = restoreValue(recorded[i], clones, untrusted);
-        if (!Object.is(live[i], value)) live[i] = value;
-      }
-      if (live.length !== recorded.length) live.length = recorded.length;
-    } else {
-      applyFields(live, state as Record<string, unknown>, clones, untrusted);
+  // Unchanged since it was recorded, or met again through a cycle and
+  // already being written: nothing below it to write.
+  if (snapshot(live) === state || clones.get(state as object) === live)
+    return live;
+  clones.set(state as object, live);
+  if (Array.isArray(live)) {
+    const recorded = state as unknown[];
+    for (let i = 0; i < recorded.length; i++) {
+      const value = restoreValue(recorded[i], clones, untrusted);
+      if (!Object.is(live[i], value)) live[i] = value;
     }
+    if (live.length !== recorded.length) live.length = recorded.length;
+  } else {
+    applyFields(live, state as Record<string, unknown>, clones, untrusted);
   }
   return live;
 }
@@ -133,5 +135,8 @@ export function applyState(
   untrusted?: boolean,
 ): void {
   const clones = new WeakMap<object, object>();
+  // The recorded root stands for the store: a field that refers back to it
+  // is restored as the store.
+  clones.set(state, store);
   batch(() => applyFields(store, state, clones, untrusted));
 }
```

### `k2-slot-on-p7.patch`: K2: the slot form, against P7

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index b1b9c22..132bdfb 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -267,24 +267,46 @@ function transactional(
   return function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
     if (new.target) return Reflect.construct(method, args);
-    // The outermost call names the transaction for its sync subscribers.
-    const outer = currentAction;
-    currentAction ??= method.name;
+    // Only while `devtools` is connected is the method's name kept.
+    if (naming) return runNamed(method, receiver, args);
     transactionDepth++;
     try {
       return Reflect.apply(method, receiver, args);
     } finally {
       settleTransaction();
-      currentAction = outer;
     }
   };
 }
 
+/** A method call that names its transaction, for `devtools`. */
+function runNamed(
+  method: (...args: unknown[]) => unknown,
+  receiver: object,
+  args: unknown[],
+): unknown {
+  // The outermost call names the transaction for its sync subscribers.
+  const outer = currentAction;
+  currentAction ??= method.name;
+  transactionDepth++;
+  try {
+    return Reflect.apply(method, receiver, args);
+  } finally {
+    settleTransaction();
+    currentAction = outer;
+  }
+}
+
+let naming = 0;
 let currentAction: string | undefined;
 
 /** @internal The outermost store method running now, for `devtools`. */
 export const actionName = (): string | undefined => currentAction;
 
+/** @internal `devtools` adds 1 while it is connected and -1 when it leaves. */
+export const nameActions = (change: number): void => {
+  naming += change;
+};
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 63931b6..83b9083 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -6,6 +6,7 @@ export {
   createClassyStore,
   getInternal,
   getVersion,
+  nameActions,
   identityOf,
   isTrackingProxy,
   registerTrackingProxy,
diff --git a/packages/classy-store/src/utils/devtools/devtools.ts b/packages/classy-store/src/utils/devtools/devtools.ts
index 5bb8a20..779c38a 100644
--- a/packages/classy-store/src/utils/devtools/devtools.ts
+++ b/packages/classy-store/src/utils/devtools/devtools.ts
@@ -1,4 +1,9 @@
-import {actionName, snapshot, subscribe} from '../../storeRuntime';
+import {
+  actionName,
+  nameActions,
+  snapshot,
+  subscribe,
+} from '../../storeRuntime';
 import {applyState} from '../cloneSnapshot/cloneSnapshot';
 
 // ── Redux DevTools types (minimal subset) ────────────────────────────────────
@@ -80,6 +85,8 @@ export function devtools<T extends object>(
     name: 'ClassyStore',
     ...connectOptions,
   });
+  // Store methods name their entries only while a connection exists.
+  nameActions(1);
 
   // States sent, by the id the extension gives each entry, so a jump restores
   // the exact snapshot (a Date stays a Date) and not its JSON.
@@ -191,6 +198,7 @@ export function devtools<T extends object>(
     dispose() {
       if (disposed) return;
       disposed = true;
+      nameActions(-1);
       unsubscribeFromStore();
       devToolsUnsub();
     },
```

### `k2-hook-on-p7.patch`: K2: the hook form, against P7 (recommended)

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index b1b9c22..a2906fd 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -267,23 +267,29 @@ function transactional(
   return function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
     if (new.target) return Reflect.construct(method, args);
-    // The outermost call names the transaction for its sync subscribers.
-    const outer = currentAction;
-    currentAction ??= method.name;
+    // `devtools`, while connected, runs the call itself to name it.
+    if (methodHook) return methodHook(method, receiver, args);
     transactionDepth++;
     try {
       return Reflect.apply(method, receiver, args);
     } finally {
       settleTransaction();
-      currentAction = outer;
     }
   };
 }
 
-let currentAction: string | undefined;
+type MethodHook = (
+  method: (...args: unknown[]) => unknown,
+  receiver: object,
+  args: unknown[],
+) => unknown;
+
+let methodHook: MethodHook | undefined;
 
-/** @internal The outermost store method running now, for `devtools`. */
-export const actionName = (): string | undefined => currentAction;
+/** @internal `devtools` installs a hook while it is connected, and removes it. */
+export const setMethodHook = (hook: MethodHook | undefined): void => {
+  methodHook = hook;
+};
 
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 63931b6..6d32f8f 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -1,7 +1,6 @@
 // Both package formats resolve this peer-free entry through #store-runtime.
 export {createProxy, isChanged} from 'proxy-compare';
 export {
-  actionName,
   batch,
   createClassyStore,
   getInternal,
@@ -9,6 +8,7 @@ export {
   identityOf,
   isTrackingProxy,
   registerTrackingProxy,
+  setMethodHook,
   subscribe,
   unwrap,
 } from './core/core';
diff --git a/packages/classy-store/src/utils/devtools/devtools.ts b/packages/classy-store/src/utils/devtools/devtools.ts
index 5bb8a20..1af5762 100644
--- a/packages/classy-store/src/utils/devtools/devtools.ts
+++ b/packages/classy-store/src/utils/devtools/devtools.ts
@@ -1,4 +1,4 @@
-import {actionName, snapshot, subscribe} from '../../storeRuntime';
+import {batch, setMethodHook, snapshot, subscribe} from '../../storeRuntime';
 import {applyState} from '../cloneSnapshot/cloneSnapshot';
 
 // ── Redux DevTools types (minimal subset) ────────────────────────────────────
@@ -50,6 +50,25 @@ export type DevtoolsHandle = {
 
 // ── Implementation ───────────────────────────────────────────────────────────
 
+// The outermost store method running now. The core runs a method through
+// `named` only while at least one connection exists, so a store without
+// `devtools` pays nothing for the name.
+let connections = 0;
+let currentAction: string | undefined;
+function named(
+  method: (...args: unknown[]) => unknown,
+  receiver: object,
+  args: unknown[],
+): unknown {
+  const outer = currentAction;
+  currentAction ??= method.name;
+  try {
+    return batch(() => Reflect.apply(method, receiver, args));
+  } finally {
+    currentAction = outer;
+  }
+}
+
 /**
  * Connect a store proxy to Redux DevTools for state inspection and time-travel debugging.
  *
@@ -80,6 +99,7 @@ export function devtools<T extends object>(
     name: 'ClassyStore',
     ...connectOptions,
   });
+  if (!connections++) setMethodHook(named);
 
   // States sent, by the id the extension gives each entry, so a jump restores
   // the exact snapshot (a Date stays a Date) and not its JSON.
@@ -109,7 +129,7 @@ export function devtools<T extends object>(
     proxyStore,
     () => {
       if (applying) return;
-      const name = actionName();
+      const name = currentAction;
       if (name) {
         // A direct write still waiting in this task is part of this entry.
         directWrites = false;
@@ -191,6 +211,7 @@ export function devtools<T extends object>(
     dispose() {
       if (disposed) return;
       disposed = true;
+      if (!--connections) setMethodHook(undefined);
       unsubscribeFromStore();
       devToolsUnsub();
     },
```

### `k3-n3-on-n2a-p7.patch`: K3: N3 on form A with S1 and P7

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
index 78c1d22..1b55142 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -7,7 +7,7 @@ import {
 } from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
-import {mapOwnArrayElements} from '../utils/internal/internal';
+import {forEachOwnArrayElement} from '../utils/internal/internal';
 
 // ── Caches ────────────────────────────────────────────────────────────────────
 
@@ -269,7 +269,7 @@ function snapshotValue(
   value: unknown,
   parent: StoreInternal,
   key: string | symbol,
-  inProgress: WeakSet<object>,
+  inProgress: Map<object, object>,
 ): unknown {
   const child = parent.childInternals.get(key);
   return child
@@ -313,7 +313,7 @@ function installOwnGetter(
 function createSnapshotRecursive<T extends object>(
   target: T,
   internal: StoreInternal,
-  inProgress: WeakSet<object> = new WeakSet(),
+  inProgress: Map<object, object>,
 ): T {
   // Cache hit: version unchanged → return the same frozen snapshot reference.
   const cached = snapshotCache.get(target);
@@ -321,25 +321,30 @@ function createSnapshotRecursive<T extends object>(
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
     snap = Object.create(snapshotPrototype(Object.getPrototypeOf(target)));
+    inProgress.set(target, snap);
     for (const key of Reflect.ownKeys(target)) {
       const desc = Object.getOwnPropertyDescriptor(target, key);
       if (!desc) continue;
@@ -364,7 +369,6 @@ function createSnapshotRecursive<T extends object>(
   registerSnapshot(snap, target);
   // Cache AFTER populating + freezing. The reference is stable.
   snapshotCache.set(target, [internal.version, snap]);
-  inProgress.delete(target);
   return snap as T;
 }
 
@@ -388,5 +392,17 @@ function createSnapshotRecursive<T extends object>(
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
index 27758b0..7371849 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -16,10 +16,11 @@ export function cloneSnapshotValue(
   clones: WeakMap<object, object>,
   untrusted?: boolean,
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

### `k3-devtools-getters.patch`: K3: the root store's getter values in what `devtools` sends

```diff
diff --git a/packages/classy-store/src/utils/devtools/devtools.ts b/packages/classy-store/src/utils/devtools/devtools.ts
index 5bb8a20..fcc6275 100644
--- a/packages/classy-store/src/utils/devtools/devtools.ts
+++ b/packages/classy-store/src/utils/devtools/devtools.ts
@@ -91,7 +91,35 @@ export function devtools<T extends object>(
     sentStates.clear();
     sentStates.set(0, state);
     nextId = 1;
-    connection.init(state);
+    connection.init(withGetters(state));
+  }
+
+  // A snapshot carries class getters on its prototype, so the extension's
+  // serialiser does not see them. The panel gets the root's getter values
+  // beside its fields; a getter that throws shows its error and the entry is
+  // still sent. Nested objects, and a root without getters, go as they are.
+  const getters: string[] = [];
+  for (
+    let proto = Object.getPrototypeOf(proxyStore);
+    proto && proto !== Object.prototype;
+    proto = Object.getPrototypeOf(proto)
+  ) {
+    for (const key of Object.getOwnPropertyNames(proto)) {
+      if (Object.getOwnPropertyDescriptor(proto, key)?.get) getters.push(key);
+    }
+  }
+  function withGetters(state: object): object {
+    if (!getters.length) return state;
+    const shown: Record<string, unknown> = {...state};
+    for (const key of getters) {
+      if (Object.hasOwn(shown, key)) continue;
+      try {
+        shown[key] = (state as Record<string, unknown>)[key];
+      } catch (error) {
+        shown[key] = String(error);
+      }
+    }
+    return shown;
   }
   init(snapshot(proxyStore));
 
@@ -100,7 +128,7 @@ export function devtools<T extends object>(
     sentStates.set(nextId, state);
     sentStates.delete(nextId - maxAge - 1);
     nextId++;
-    connection.send({type}, state);
+    connection.send({type}, withGetters(state));
   }
 
   let applying = false;
```

## Appendix: scripts

### `repro/k1.ts`

```ts
// K1: undo and a DevTools jump on a store with a cycle.
// Run: SRC=<worktree>/packages/classy-store/src bun k1.ts
const SRC = process.env.SRC;
const core = await import(`${SRC}/index.ts`);
const {createClassyStore, snapshot, subscribe} = core;
const {withHistory, devtools} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));

(globalThis as Record<string, unknown>).window ??= globalThis;
let listener: ((m: unknown) => void) | null = null;
(globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
  connect: () => ({
    init() {},
    send() {},
    subscribe(fn: (m: unknown) => void) {
      listener = fn;
      return () => {};
    },
  }),
};

type Case = {
  name: string;
  make: () => any;
  write: (s: any) => void;
  check: (s: any, held: any) => Record<string, unknown>;
};

const cases: Case[] = [
  {
    name: '{n: 1, self: store}, write n = 2',
    make: () => {
      const s = createClassyStore({n: 1, self: null as unknown});
      s.self = s;
      return s;
    },
    write: (s) => {
      s.n = 2;
    },
    check: (s) => ({n: s.n, 'self is the store': s.self === s}),
  },
  {
    name: 'a and b refer to each other, write a.name',
    make: () => {
      const s = createClassyStore({
        a: {name: 'a', peer: null as any},
        b: {name: 'b', peer: null as any},
      });
      s.a.peer = s.b;
      s.b.peer = s.a;
      return s;
    },
    write: (s) => {
      s.a.name = 'x';
    },
    check: (s, held) => ({
      'a.name': s.a.name,
      'a is the node that was made': s.a === held.a,
      'a.peer is b': s.a.peer === s.b,
      'b.peer is a': s.b.peer === s.a,
    }),
  },
  {
    name: 'a list of 3 rows, each row.list is the list, write rows[1].done',
    make: () => {
      const s = createClassyStore({rows: [] as any[]});
      for (let i = 0; i < 3; i++) s.rows.push({id: i, done: false, list: null});
      for (const r of s.rows) r.list = s;
      return s;
    },
    write: (s) => {
      s.rows[1].done = true;
    },
    check: (s, held) => ({
      'rows[1].done': s.rows[1].done,
      'each row is the node that was made': s.rows
        .map((r: any, i: number) => r === held.rows[i])
        .join(','),
      'each row.list is the store': s.rows
        .map((r: any) => r.list === s)
        .join(','),
    }),
  },
  {
    name: 'rows whose parent is the rows array itself, write rows[2].done',
    make: () => {
      const s = createClassyStore({rows: [] as any[]});
      for (let i = 0; i < 3; i++)
        s.rows.push({id: i, done: false, parent: null});
      for (const r of s.rows) r.parent = s.rows;
      return s;
    },
    write: (s) => {
      s.rows[2].done = true;
    },
    check: (s, held) => ({
      'rows[2].done': s.rows[2].done,
      'each row is the node that was made': s.rows
        .map((r: any, i: number) => r === held.rows[i])
        .join(','),
      'each row.parent is the rows array': s.rows
        .map((r: any) => r.parent === s.rows)
        .join(','),
    }),
  },
  {
    name: '{n, self: store}, the write breaks the cycle (self = null)',
    make: () => {
      const s = createClassyStore({n: 1, self: null as unknown});
      s.self = s;
      return s;
    },
    write: (s) => {
      s.self = null;
    },
    check: (s) => ({'self is the store': s.self === s}),
  },
  {
    name: '{n, self: null}, the write closes the cycle (self = store)',
    make: () => createClassyStore({n: 1, self: null as unknown}),
    write: (s) => {
      s.self = s;
    },
    check: (s) => ({self: s.self === s ? 'the store' : s.self}),
  },
];

function attempt(fn: () => void): string {
  try {
    fn();
    return 'returns';
  } catch (e) {
    const err = e as Error;
    return `throws ${err.name}: ${err.message.slice(0, 70)}`;
  }
}

for (const c of cases) {
  console.log(`\n### ${c.name}`);
  // withHistory
  {
    const s = c.make();
    const held = {a: s.a, rows: s.rows ? [...s.rows] : undefined};
    let h: any;
    const attach = attempt(() => {
      h = withHistory(s);
    });
    if (!h) {
      console.log(`- withHistory attach: ${attach}`);
    } else {
      c.write(s);
      await flush();
      let calls = 0;
      const off = subscribe(s, () => calls++, {sync: true});
      const t = performance.now();
      const r = attempt(() => h.undo());
      const ms = (performance.now() - t).toFixed(2);
      off();
      console.log(
        `- undo: ${r} (${ms} ms), sync notifications ${calls}, ${JSON.stringify(c.check(s, held))}`,
      );
      const r2 = attempt(() => h.redo());
      console.log(`- redo: ${r2}, ${JSON.stringify(c.check(s, held))}`);
      h.dispose();
    }
  }
  // devtools: jump to the initial entry by its id
  {
    const s = c.make();
    const held = {a: s.a, rows: s.rows ? [...s.rows] : undefined};
    let dt: any;
    const attach = attempt(() => {
      dt = devtools(s, {name: 'k1'});
    });
    if (!dt) {
      console.log(`- devtools attach: ${attach}`);
      continue;
    }
    c.write(s);
    await flush();
    const r = attempt(() =>
      listener?.({
        type: 'DISPATCH',
        payload: {type: 'JUMP_TO_STATE', actionId: 0},
        state: '{}',
      }),
    );
    console.log(
      `- devtools jump to entry 0 by its id: ${r}, ${JSON.stringify(c.check(s, held))}`,
    );
    dt.dispose();
  }
}
console.log(
  '\nsnapshot of the first case keeps the cycle:',
  (() => {
    try {
      const s = cases[0].make();
      const snap = snapshot(s) as any;
      return snap.self === snap;
    } catch (e) {
      return `throws ${(e as Error).message}`;
    }
  })(),
);
```

### `repro/bench-cycle.ts`

```ts
// Undo of one edited row in a list of 1,000 rows that each point back to the store.
// Run: SRC=<src> bun bench-cycle.ts
const SRC = process.env.SRC;
const {createClassyStore, snapshot} = await import(`${SRC}/index.ts`);
const {withHistory} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));
const n = Number(process.env.N ?? 1000);
const store = createClassyStore({rows: [] as any[]});
store.rows = Array.from({length: n}, (_, id) => ({
  id,
  done: false,
  list: null,
}));
for (const r of store.rows) r.list = store;
const h = withHistory(store);
store.rows[n / 2].done = true;
await flush();
const times: number[] = [];
for (let r = 0; r < 5; r++) {
  const t = performance.now();
  const N = 5;
  for (let i = 0; i < N; i++) {
    h.undo();
    snapshot(store);
    h.redo();
    snapshot(store);
  }
  times.push((performance.now() - t) / (2 * N));
}
times.sort((a, b) => a - b);
console.log(
  `cyclic rows ${n}: one restore and its snapshot ${times[2].toFixed(2)} ms (${times[0].toFixed(2)} to ${times[4].toFixed(2)}); row done after redo: ${store.rows[n / 2].done}`,
);
```

### `repro/k2.ts`

```ts
// K2: entry names with the name slot. Run: SRC=<src> bun k2.ts
const SRC = process.env.SRC;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {devtools} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));
(globalThis as Record<string, unknown>).window ??= globalThis;
const sent: string[][] = [];
let conn = 0;
(globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
  connect: () => {
    const log: string[] = [];
    sent[conn++] = log;
    return {
      init() {},
      send(a: {type: string} | null) {
        if (a) log.push(a.type);
      },
      subscribe: () => () => {},
    };
  },
};
class Person {
  name = 'a';
  age = 1;
  rename(n: string) {
    this.name = n;
  }
  birthday() {
    this.age++;
    this.rename(`${this.name}!`);
  }
}
const p = createClassyStore(new Person());
const q = createClassyStore(new Person());
const d1 = devtools(p, {name: 'p'});
p.rename('b');
p.birthday();
p.age = 5;
p.age = 6;
await flush();
console.log('one connection:', JSON.stringify(sent[0]));
const d2 = devtools(q, {name: 'q'});
d1.dispose();
q.birthday();
await flush();
console.log(
  'second store after the first connection left:',
  JSON.stringify(sent[1]),
);
d2.dispose();
d2.dispose();
console.log('disposed twice; a method still works:', (q.rename('z'), q.name));
const d3 = devtools(p, {name: 'p again'});
p.rename('c');
await flush();
console.log('reconnected:', JSON.stringify(sent[2]));
d3.dispose();
```

### `repro/k3.ts`

```ts
// K3: what devtools sends for a class with getters, and for a store with a cycle.
// Run: SRC=<src> bun k3.ts
const SRC = process.env.SRC;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {devtools} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));
(globalThis as Record<string, unknown>).window ??= globalThis;
const got: {kind: string; state: unknown}[] = [];
(globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
  connect: () => ({
    init(state: unknown) {
      got.push({kind: 'init', state});
    },
    send(_a: unknown, state: unknown) {
      got.push({kind: 'send', state});
    },
    subscribe: () => () => {},
  }),
};
// What the panel can show: JSON, with a cycle written as a reference to its path
// (the extension serialises with jsan, which also writes cycles as references).
function show(value: unknown): string {
  const seen = new Map<object, string>();
  const walk = (v: unknown, path: string): unknown => {
    if (typeof v !== 'object' || v === null) return v;
    if (seen.has(v)) return `[cycle: ${seen.get(v)}]`;
    seen.set(v, path);
    const out: Record<string, unknown> = Array.isArray(v) ? ([] as never) : {};
    for (const k of Object.keys(v)) {
      try {
        out[k] = walk((v as Record<string, unknown>)[k], `${path}.${k}`);
      } catch (e) {
        out[k] = `<reading it throws: ${(e as Error).message}>`;
      }
    }
    return out;
  };
  return JSON.stringify(walk(value, '$'));
}
function plainJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return `JSON.stringify throws: ${(e as Error).message.slice(0, 60)}`;
  }
}

class Line {
  n = 4;
  get half() {
    return this.n / 2;
  }
}
class Base {
  get label() {
    return `${(this as unknown as Cart).owner}'s cart`;
  }
}
class Cart extends Base {
  owner = 'ann';
  price = 3;
  qty = 2;
  // An object literal: its getter is an own accessor and stays one.
  nested = {
    n: 1,
    get twice() {
      return this.n * 2;
    },
  };
  // A nested class instance: its getters are not added.
  line = createClassyStore(new Line());
  get total() {
    return this.price * this.qty;
  }
  get broken(): number {
    throw new Error('no discount for ' + this.owner);
  }
  setQty(q: number) {
    this.qty = q;
  }
}
{
  const cart = createClassyStore(new Cart());
  const dt = devtools(cart, {name: 'cart'});
  cart.setQty(5);
  await flush();
  for (const g of got) {
    console.log(`- ${g.kind}: ${show(g.state)}`);
    console.log(`  JSON.stringify: ${plainJson(g.state)}`);
  }
  dt.dispose();
}
got.length = 0;
{
  const s = createClassyStore({
    n: 1,
    self: null as unknown,
    child: {name: 'c', up: null as unknown},
  });
  s.self = s;
  s.child.up = s;
  let dt: {dispose(): void} | undefined;
  try {
    dt = devtools(s, {name: 'cycle'});
  } catch (e) {
    console.log(`- cycle: devtools() throws ${(e as Error).message}`);
  }
  if (dt) {
    s.n = 2;
    await flush();
    for (const g of got) {
      console.log(`- cycle ${g.kind}: ${show(g.state)}`);
      console.log(`  JSON.stringify: ${plainJson(g.state)}`);
    }
    dt.dispose();
  }
}
got.length = 0;
{
  class Node {
    n = 1;
    self: unknown = null;
    get double() {
      return this.n * 2;
    }
  }
  const s = createClassyStore(new Node());
  s.self = s;
  const dt = devtools(s, {name: 'class cycle'});
  s.n = 2;
  await flush();
  for (const g of got)
    console.log(
      `- class with a getter and a cycle, ${g.kind}: ${show(g.state)}`,
    );
  dt.dispose();
}
```

### `repro/k3-jump.ts`

```ts
// K3: a jump by JSON whose state carries the getter values devtools added.
const SRC = process.env.SRC;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {devtools} = await import(`${SRC}/utils/index.ts`);
(globalThis as Record<string, unknown>).window ??= globalThis;
let listener: (m: unknown) => void = () => {};
const sent: unknown[] = [];
(globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
  connect: () => ({
    init(s: unknown) {
      sent.push(s);
    },
    send(_a: unknown, s: unknown) {
      sent.push(s);
    },
    subscribe(fn: (m: unknown) => void) {
      listener = fn;
      return () => {};
    },
  }),
};
class Cart {
  price = 3;
  qty = 2;
  get total() {
    return this.price * this.qty;
  }
  get broken(): number {
    throw new Error('no');
  }
}
const cart = createClassyStore(new Cart());
devtools(cart);
const first = JSON.stringify(sent[0]);
cart.qty = 7;
await new Promise((r) => setTimeout(r, 0));
try {
  listener({type: 'DISPATCH', payload: {type: 'JUMP_TO_STATE'}, state: first});
  console.log(
    'JSON jump with getter keys:',
    JSON.stringify({
      qty: cart.qty,
      total: cart.total,
      ownKeys: Object.keys(cart),
    }),
  );
} catch (e) {
  console.log('JSON jump throws', (e as Error).message);
}
```

### `bench.sh`

```bash
#!/bin/bash
# bench.sh <rounds> <build>...: store.method, five fresh processes per build, builds back to back.
C=$(cd "$(dirname "$0")" && pwd)
R=$1; shift
cd "$C/bench"
for i in $(seq 1 $R); do
  for eng in bun node; do
    for b in "$@"; do
      line=$($eng $b/pkg/tests/benchmark/runCoreBenchmark.mjs --only store.method --runs 5 2>/dev/null | grep "^| store.method")
      echo "round $i $eng $b $line"
    done
  done
done
```

### `measure.sh`

```bash
#!/bin/bash
# measure.sh <label>: tests, typecheck and size of the worktree as it stands.
C=$(cd "$(dirname "$0")" && pwd)
L=$1
cd "$C/wt" || exit 1
bun run build > "$C/out/$L-build.log" 2>&1
bun run test > "$C/out/$L-test.txt" 2>&1
bun run --filter @codebelt/classy-store typecheck > "$C/out/$L-tc.txt" 2>&1
bun run size > "$C/out/$L-size.txt" 2>&1
echo "== $L"
grep -E " [0-9]+ (pass|fail)$" "$C/out/$L-test.txt"
grep -E "^\(fail\)" "$C/out/$L-test.txt" | sort -u
grep -cE "error TS" "$C/out/$L-tc.txt"
grep -E "error TS" "$C/out/$L-tc.txt" | head -5
grep -E "^\|" "$C/out/$L-size.txt" | head -20
```

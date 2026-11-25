# Brief: three core fixes the second adversarial review asks for

- **Report:** `review/stage-3/spike-core-3.md`
- **Scratch folder:** `<scratch>/stage-3-spike-core-3/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief (`review/stage-3/briefs/COMMON.md`)
  describes. Read that file first.

Three independent spikes, G1 to G3. Each answers one objection of
`review/stage-3/adversarial-2-core.md`, which has a script for it in
`<scratch>/stage-3-adversarial-2-core/repro/`. Copy the scripts; do not write
to that folder. Write each section of the report as soon as its spike is
done.

## G1. A snapshot getter must not reach the live store either (objection 3)

Decision 10 and guarantee rule 4 say a getter that writes to the object it
is computed on throws, on the store and on a snapshot.
`spike-core-2.md`, F4, built it: on a snapshot the tracker's traps throw
(half A); on the live store the traps of a node throw while a getter of that
node is on the evaluation stack (half B).

The hole: on a snapshot, a write that does not go through `this` reaches the
live store and notifies its subscribers while a component reads a snapshot.
Two ways: an arrow-function method of a `ClassyStore` subclass, whose `this`
is the live store, and a getter that writes through a reference to its store
(`store.count++`).

- **Build.** On the F4 build (the getter combination of `spike-getters.md`,
  appendix E, then `f4a-delta.patch` and `f4b-delta.patch` of
  `spike-core-2.md`, with the base class C1 as F4 used it): while a snapshot
  getter of an object runs, the live node behind that snapshot counts as
  having a getter on the stack, so half B's check throws for a write to it.
- **Run.** `snapgetter.ts`, and the nine rows of F4's `f4-writes.ts` again on
  both layers, with three more rows on the snapshot layer: a base-class arrow
  method that writes its own field, a write through a module-level reference
  to the store, and a method of an object literal called by the getter.
- **Report** what throws and what still gets through (a write to a child, to
  another store), tests against the F4 build's failures, size, and the
  timing of a cached and a recomputed snapshot getter against the F4 build.

## G2. The table per prototype must not grow with keys that do not exist (objection 5)

Decision 12 takes `f2-holder-lazy.patch` of `spike-core-2.md`. Its table
records every key that was looked up on a prototype and not found, for good.
A dictionary that is read by keys it does not have yet adds one entry per
key to the table of `Object.prototype`, which every plain object shares:
`table-growth.ts` measures 88 MB for a million keys.

- **Build two forms** on `f2-holder-lazy.patch`: (a) the table records a key
  only when the prototype chain has it, as an accessor or as data, and a key
  that is absent everywhere is looked up again each time; (b) no table for
  `Object.prototype` and `Array.prototype`, which have no accessor a store
  reads through the table.
- **Run.** `table-growth.ts`; `table.ts` and `f2-lazy.ts` of
  `spike-core-2.md`; the unit suite; size.
- **Time** `store.read`, `store.read.nested`, `store.method`,
  `getter.cached` and a read of an absent key (add a row to the benchmark
  copy if none exists) on Bun and Node, two rounds back to back with the
  unmodified build and the lazy form. Saved builds are in
  `<scratch>/stage-3-spike-core-2/builds/`.
- **Report** which form keeps the lazy form's gains, and its bytes.

## G3. An undo into a container that cannot be written (objection 4)

Decision 30 restores a nested object in place (`spike-classes-2.md`, V4, and
`k1-combined-fixed.patch` of `spike-combos.md`, which is V4 with decision 44
and the mark for cycles). When the container was frozen through the store
after the entry was recorded, the restore's write is refused part-way: the
store is half restored and the history has moved. `undo-frozen.ts` shows it.
Today the restore replaces the branch at its parent and the undo works.

- **Build**, on `k1-combined-fixed.patch`: a container that is not
  extensible, or that refuses a write, is not restored in place; it is
  replaced at its parent by a copy, as today. Only the root cannot be
  replaced: when the root refuses a write, the undo throws and the history
  does not move.
- **Run.** `undo-frozen.ts`, with rows for a frozen, a sealed and a
  non-extensible container, a container with one read-only key that
  differs, a frozen container whose child differs (the child is restored in
  place or the container is replaced: say which), and a frozen root. The six
  rows of K1's `repro/k1.ts` and the four of the addendum's `moved.ts` in
  `spike-combos.md`, which must not change. V4's `bench-undo.ts` for the
  1,000-row undo, against the K1 build.
- **Report** each row before and after, tests against the K1 build's 36
  failures, and the bytes on `./utils`.

## For each spike

What was changed (file, lines added and removed, the patch in the appendix),
the result, what it changes for a user, your recommendation, the label
("before 1.0" or "can follow 1.0") with the reason, and the cost for stage
4. End the report with what was run, what was only read and what was not
done.

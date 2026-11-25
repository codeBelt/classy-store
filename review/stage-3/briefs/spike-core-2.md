# Brief: four core fixes the adversarial review asks for

- **Report:** `review/stage-3/spike-core-2.md`
- **Scratch folder:** `<scratch>/stage-3-spike-core-2/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

`review/stage-3/adversarial-core.md` and `adversarial-edges.md` found defects
in four decisions of `review/stage-3-decisions.md`, each reproduced with a
script. For each, build the fix the reviewers name, run it against the suite,
and say what the decision should become. Read the objection and run its
script first; the scripts are in `<scratch>/stage-3-adversarial-core/scripts/`
and `<scratch>/stage-3-adversarial-edges/scripts/`. Work in this order.

## F1. Raw values on write, and a container frozen through the store

`adversarial-core.md`, objection 2; `adversarial-edges.md`, objection 14.
Decision 5 stores the raw object behind a proxy (`spike-traps.md`, T2,
`t2a-raw-only.patch`). Decision 2 keeps `Object.freeze(store.part)` working.
Together: after the freeze a read-only property must hand out what the raw
object holds, which is now the raw child, so `outer.inner` reads back raw and
a write through it notifies no one. Today a child that was assigned as a
proxy stays a child after the freeze.

On `t2a-raw-only.patch` with `t3a.patch`: make the `defineProperty` trap put
the child's proxy into the raw slot before a property that holds a proxied
child becomes read-only, so that the value the engine demands is the proxy.
Then answer, with a table before and after, for a child assigned through the
store and for a child that was in the object at creation: what does
`outer.inner` read after `Object.freeze(outer)`, does a write through it
notify, what does a snapshot hold, and the same for a row of a frozen list,
a frozen store root, `Object.seal`, and one property made read-only with
`defineProperty`. Say what the documented rule "a frozen object is a value;
the store does not look inside it" should then read. If the swap cannot work,
say what can.

## F2. The table per prototype must not freeze a getter's body

`adversarial-core.md`, objection 6. Decision 12 (the patch is in
`review/stage-2/solid.md`, port 6, and was applied by hand in
`spike-traps.md`, T6) caches the whole inherited descriptor. A getter
redefined on the class after the first read then keeps its old body on the
live store while snapshots run the new one.

Build the form that caches only which prototype object holds the key and
whether it is an accessor, and reads the function at the read. Time
`store.read`, a read three objects deep, a cached getter read and
`store.method` on both engines for three builds back to back, five runs
each: unmodified, the full-descriptor table, and yours. Run the reviewer's
`table.ts` on each. Give the bytes.

## F3. Searches on a list that holds frozen values

`adversarial-core.md`, objection 7. Decision 6 (`spike-traps.md`, T2,
`t2.patch`) makes `includes`, `indexOf` and `lastIndexOf` compare by
`identityOf`. Every snapshot of one object has the same identity, so on a
list of saved snapshots `indexOf(v2)` is 0 and `includes` of a snapshot that
was never pushed is true.

Change the comparison so that an element the store keeps as a value (a frozen
object, an opaque object) is compared by reference, and only an element that
is a node of the store by identity. Write it as one loop that allocates
nothing, which `spike-traps.md` lists as not done. Show the reviewer's
`search.ts` and the T2 reproduction (`includes(raw)`, `includes(snapshot of a
live row)`, `NaN`, `fromIndex`) before and after, the tests by class, the
bytes, and the time of `includes` on a list of 1,000 rows against a plain
array and against today.

## F4. A getter that writes

`adversarial-core.md`, objections 12 and 13. On the getter combination of
`spike-getters.md` (appendix E, which has G7a):

- Make the snapshot tracker's `set`, `defineProperty` and `deleteProperty`
  traps throw, so that the write is refused in sloppy code too, where a trap
  that returns `false` is ignored.
- Make a write to the getter's own node throw on the live store as well, and
  only that: a write to another node, a store constructed inside the getter,
  and a method of another store called from it must all still work. This is
  the "own-node" form that `spike-classes.md` names as the needed exemption.

Give the tests by class, the bytes of each half, and a table for these cases
on both layers: `this.cache ??= …`, `this.child.x = 1`, `this.list.push(1)`,
`other.n = 1`, `new Sub()` inside the getter (with the base class of
`spike-classes.md` applied), and a getter that calls a prototype method which
writes.

## What the report ends with

For each of F1 to F4: what was built, the patch, the output before and after,
tests by class, bytes, and one paragraph the decision document can take over.

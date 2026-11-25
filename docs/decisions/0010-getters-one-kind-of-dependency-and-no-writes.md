# 0010. Getters have one kind of dependency, behave the same on both layers, and must not write to their own object

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, simplification
- **Label:** Before 1.0: a getter that writes becomes an error, and the
  sentence about an absent field goes
- **Changes documented behaviour:** yes

## Context

Before 1.0, a getter records three kinds of dependency, and the two layers (the
live store and the snapshot) differ:

- A getter that reads a property which does not exist is recomputed on every
  read on the store, and cached on a snapshot.
- A getter that catches another getter's error,
  `try { return this.strict } catch { return 'fallback' }`, stays
  `'fallback'` after `strict` stops throwing.
- With `c` reading `b` reading `a`, `snapshot(s).c; s.unrelated = 1;
  snapshot(s).c` runs `a` and `b` again: the snapshot layer throws away the
  memo that the nested getters filled.
- A cycle of getters on a snapshot overflows the stack with a `RangeError`,
  where the live store throws its own error.
- Getters arranged as a diamond cost twice as much per level.
- A getter that writes re-runs and notifies on every read on the live store.
  On a snapshot the write is dropped in silence. `this.cache ??= …` works on
  the store and fails in every adapter, because every adapter reads
  snapshots.

## Decision

- **One kind of getter dependency**, `{value, version}` by property. It holds
  the version stamp that makes a clean read constant, records each property
  once per run, and treats a missing property as a value.
- A getter that reads a getter which threw records that dependency, on both
  layers, inside a frame that also covers validation.
- The snapshot layer keeps the memo that nested getters filled, and reports a
  cycle with the live layer's error, the code `getter-cycle` of record 0035.
- **A getter must not write to the object it is computed on, by any path.**
  - On the live store, a write to the getter's own object throws a
    `TypeError` with the code `getter-write` (record 0035) that names the
    field: an assignment, a `delete`, a definition, also through a method
    the getter calls.
  - On a snapshot, a write to `this` throws the same way, and the traps throw
    themselves, so it holds in code that is not strict too. While a snapshot
    getter runs, the live object the snapshot was taken from counts as
    having a getter running, so a write that reaches the live store around
    `this` throws as well, with nothing written and nobody told: through an
    arrow-function method of a `ClassyStore` subclass, through a reference
    to the store, or through a method called on the store.
  - The throw is for the one object the getter is computed on, and its
    message names that object's field. A getter on a nested object that
    writes its parent or the root is not covered; that is unspecified.
  - Allowed on both layers: a write to another store, and constructing a
    store inside a getter. A write to a child object is allowed on the live
    store; on a snapshot it throws in strict code, because the child is
    frozen, and is ignored in code that is not strict. That difference is
    unspecified.
- Whether a thrown error is cached is unspecified.

The snapshot part is written first on the snapshot layer as it is before
1.0. Record
0043 then installs a class's getters once, on a shared prototype, so the
live object has to be found from `this` at each run; the rows for this
decision are run again as tests after record 0043.

## Alternatives considered

### Three kinds of dependency with the fix added on

77 bytes larger than one kind.

### Leave the live store as it is

`this.cache ??= …` would keep working on the store and throwing through
every adapter. A throw from a trap that returns `false` would be an error in
strict code only, so a getter in a plain script would lose its write in
silence.

### Throw for every write made while any getter runs

It would refuse a store constructed inside a getter, which the base class of
record 0011 does by writing its own fields, and a getter that calls a method
of another store.

### Record reads outside the getter's own node

For another store or a static. 124 bytes, 14 to 18% slower on a getter over
1,000 rows, and it cannot work on a snapshot. The docs state the limit and
the pattern that works: hold the other store as a field.

### Cache a thrown error

73 bytes and seven pinned behaviours changed, for one gain. It can follow
1.0.

## Consequences

- A getter that fills a cache field on its own store, or calls a method that
  writes its own store, throws where it worked on the live store. It already
  failed in every component. The docs say a getter must not write to the
  store it reads.
- The reference sentence about an absent field goes.
- The version stamp is safe for a subtree that has left the store: a
  differential fuzz of 300 seeds compared 180,112 getter reads with a plain
  mirror, 55,058 of them on a node outside the store.
- Timings on Node: a cached getter read is 26% faster and a recompute 6 to 9%
  slower; the four cost ratios stay inside their limits on both engines. The
  throw around `this` kept a write and both getter reads inside the spread;
  on Bun the recomputed read was a steady 4% higher.
- Size: +281 bytes on the main entry (165 for the combination, 74 for the
  throw on both layers, 42 for the throw around `this`, each on the one
  before). 16 unit tests changed for the combination (15 fixes, 1
  incidental), then 3 more that pinned a getter writing its own store.
- Not built: the throw around `this` on top of record 0001 and on top of
  record 0043.

- Open again if a case is found where a getter must write its own object.

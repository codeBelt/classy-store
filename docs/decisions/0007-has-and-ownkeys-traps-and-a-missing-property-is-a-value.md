# 0007. `has` and `ownKeys` traps on the live store, and a missing property is a value

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Changes behaviour that 0.11 documents:** yes

## Context

In 0.11 the store proxy has no `has` and no `ownKeys` trap, and a getter
records nothing for a property that is not there:

- A live getter that reads `Object.keys(this)` or `'b' in this` goes stale.
  It still answers 2 and `true` after `delete store.b`.
- A live getter that reads a property which does not exist is recomputed on
  every read, so a getter that builds an object returns a new one each time.
  The reference says: "A live getter that reads an absent field recomputes
  on subsequent reads".

A memoized getter that returns a stale answer is a defect in the feature the
library is built around.

## Decision

- A getter that asks `'b' in this` records a dependency on the key.
- A getter that asks `Object.keys(this)` records a dependency on a per-node
  counter of the key set.
- A read of a property that is not there records that it was missing, so
  such a getter is memoized like any other.
- The `defineProperty` trap of record 0002 moves the key counter when a
  definition adds a key or changes whether it is enumerable.
- The two new records take the single shape of a getter dependency of record
  0010, and this change is written on top of that one.

Not tracked in 1.0: `Object.hasOwn(this, key)`, `this.hasOwnProperty(key)`
and `Object.getOwnPropertyDescriptor(this, key)` inside a getter. They do
not go through the two traps, and a getter that uses one stays stale after a
key is added, as in 0.11. The docs say to use `in`.

What `this` is inside a snapshot getter is record 0043.

## Alternatives considered

### A trap that also records own-property checks

It is an addition and can follow 1.0.

### Leave the getters stale

The reference sentence would stay, and a memoized getter would keep
returning wrong answers.

## Consequences

- The reference sentence about an absent field goes.
- Size: +156 bytes on the main entry, measured alone. 9 unit tests changed,
  all fixes. Timings were inside the spread except two metrics on Node that
  were 1.4% and 1.5% slower.
- Those figures are for a prototype written beside the old dependency kinds.
  No prototype built it in the single shape of record 0010, so the commit
  takes its figures from its own build.
- An own-property check in a getter stays stale, and the list of what 1.0
  does not catch names it (record 0036).
- Open again to add the trap for own-property checks.

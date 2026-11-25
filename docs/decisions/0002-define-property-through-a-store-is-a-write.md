# 0002. `Object.defineProperty` through a store is a write, and nothing is refused

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0: the tutorial says that `Object.defineProperty`
  "bypasses assignment/deletion tracking"
- **Changes documented behaviour:** yes

## Context

Before 1.0, the `defineProperty` trap handles freezing only. The tutorial says
that `Object.defineProperty` "bypasses assignment/deletion tracking". The
result:

- Defining a new data property sets the live value, notifies no one, and
  stays out of the snapshot until the next ordinary write.
- Redefining a property that holds an object leaves the old object in place:
  after `Object.defineProperty(s, 'child', {value: other})`, `s.child.n`
  still reads the old child, and a later `s.child = other` counts as no
  change.
- Defining `length` on a list leaves removed elements readable by index.
- After `Object.defineProperty(store.rows, 0, {value: 7})` the store returns
  the old object and a snapshot shows 7.
- Freezing a removed container while its subtree is suspended detaches a
  child without resuming it, so the next snapshot is stale once and a new
  subscriber can miss a write (see record 0003).

Class fields compiled as definitions reach this trap as data descriptors, so
the base class of record 0011 needs the trap to behave as a write.

## Decision

A definition through a store does the bookkeeping of a write: the value
becomes the property's child, or the old child is detached, and subscribers
are told when the value, the getter, the kind of property or its
enumerability changed. Every descriptor is still forwarded to the raw
object. `Object.freeze(store)` keeps working and stays silent. A definition
or a delete of a property that is or was an accessor clears the node's
getter cache, so a getter that read it is not left stale. No
`setPrototypeOf` trap is added.

This commit stores a defined value as it is given. Record 0005 then changes
the trap to store the raw value.

## Alternatives considered

### Refuse accessor and read-only descriptors

Immer does this. It costs 160 bytes more, most of it message text, and it
rules out the base class, whose fields arrive as definitions. An accessor or
a read-only definition works correctly on both layers after this decision,
so refusing it would forbid something that is right. Not taken, and final
for 1.0.

### Refuse `Object.freeze(store)`

MobX does this. It gives up a feature added on purpose and removes no code,
because a frozen root passed to `createClassyStore()` still needs the
read-only case. Not taken, and final for 1.0.

### A `setPrototypeOf` trap that throws

After record 0001, a method replaced on the prototype or a swapped prototype
is picked up. `persist` cannot swap a prototype. What is left is an
application that swaps the prototype of its own store on purpose, and that
is not the library's to forbid. Not taken, and final for 1.0.

## Consequences

- A definition through the store notifies and shows in the next snapshot.
  The tutorial sentence about `defineProperty` changes.
- Size: +49 bytes on the main entry. 28 lines added and 9 removed in the
  prototype; 17 unit tests changed, all of them tests that pinned the
  defects above. Timings were inside the spread.
- What a prototype changed after its first read does stays unspecified
  (record 0012).
- Open again if a use is found that needs a definition to be refused.

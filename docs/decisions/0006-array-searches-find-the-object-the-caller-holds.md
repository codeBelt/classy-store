# 0006. `includes`, `indexOf` and `lastIndexOf` find the object the caller holds

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0
- **Changes documented behaviour:** no

## Context

Before 1.0:

```ts
const row = {id: 1};
store.rows.push(row);
store.rows.includes(row); // false
```

The list hands out proxies and the search compares them against the raw
object. That is a wrong answer from a documented array method, in the most
ordinary way of using it. Each element also goes through the `get` trap, so
a search is slow.

## Decision

On a list in a store, the three searches find an element that is part of a
store by any of its forms: its raw object, its proxy, or a snapshot of it.
Any other element, such as a snapshot or a frozen object kept as a value, or
a `Date`, is found by reference, as in a plain array. A primitive is searched
for with the native method.

How: the raw list holds an element that is part of a store by its raw
object, or in an older list by its proxy, and a value by itself. So the
answer is the nearest hit of the engine's own search for up to three values:
the value given and, when it is a form of an object in a store, that
object's raw form and its proxy. `fromIndex` is passed to the engine
unchanged.

A reactive collection answers differently, on purpose (record 0042): it
matches every member by identity, so two snapshots of one object are two
elements of a list and one member of a set. The collections guide states the
difference, and a test pins both answers.

## Alternatives considered

### Compare every element by identity

Every snapshot of one object has the same identity. On a list of saved
versions, `indexOf(v2)` then answered 0, and `includes` was true for a
version that was never pushed. A list of snapshots kept as values is an undo
stack, and it has to answer as a plain array does.

### One loop and no allocation

Built as well: 42 bytes larger and five to eleven times slower.

### Run every read-only array method on the raw array

It would hand each element's proxy to the callback. It was not measured on
this library, and records 0010 and 0012 attack the same cost.

## Consequences

- A search for an object in a list of 1,000 rows takes 0.5 microseconds on
  Bun and 0.9 on Node, against 95 and 180 before this change, and
  0.15 and 0.2 for a
  plain array. It allocates two short arrays per search for an object.
- 18 rows of searches agree with a plain array wherever a plain array has an
  answer. 7 unit tests changed, all fixes.
- Size: +168 bytes on the main entry (100, then 68 more for the answer on a
  list of snapshots).

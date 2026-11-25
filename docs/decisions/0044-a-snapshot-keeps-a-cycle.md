# 0044. A snapshot keeps a cycle

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, public API
- **Label:** Before 1.0: it reverses a documented sentence
- **Changes documented behaviour:** yes

## Context

Before 1.0, a store that refers to itself can be written but not read:

```ts
store.self = store; // succeeds and notifies
snapshot(store); // throws "circular reference detected in snapshot"
```

It throws until the reference is deleted, so no adapter can read the store.
The tutorial says that circular references in traversed state are rejected
by `snapshot()`.

## Decision

`snapshot()` of a store that refers to itself returns a frozen snapshot with
the same cycle in it. The React hook, `withHistory` and `cloneSnapshot` are
made safe for it.

The restore of record 0030 walks into live objects and has to stop on a
cycle; it enters each live object at most once. The line this change adds to
`history.ts` moves into the restore function that undo, redo and a DevTools
jump share.

## Alternatives considered

### Refuse the write that closes a cycle

It would need a walk from the new parent to the roots on every assignment of
an object, and would also have to reject a cycle already in the object given
to `createClassyStore()`, which works on the live side before 1.0. Not
taken, and final for 1.0.

## Consequences

- Everything on a cycle gets a new snapshot on every write to any of it, so
  a model with parent pointers loses structural sharing for what the pointers
  connect. The docs say so and name the alternatives: hold the parent's id,
  or hold the parent in an object the store does not proxy.
- `JSON.stringify` of such a snapshot throws, as for any cycle, and
  `persist` reports it through `onError`.
- In the DevTools panel, a class store with a getter and a cycle shows its
  root once more under the field that points back, because what `devtools`
  sends for such a store is a copy (record 0043).
- Size: the main entry is 9 bytes smaller, `./utils` 21 larger, `./react` 30
  larger. 7 unit tests changed, all of them asserting the throw.
- The guard costs a tracked comparison in the React hook 14 to 29
  nanoseconds on data without a cycle.
- Built apart from record 0030, an undo overflowed the stack; with the mark
  of record 0030 it returns. 1,000 rows that point back to their store take
  1.9 milliseconds to undo.
- Not checked: what the Redux DevTools extension does with a cyclic state.
- A getter on a store that refers to itself recomputes on every write, a
  write to a field it never read included. That stays.

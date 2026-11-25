# 0009. A plain object from another realm is state

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0
- **Changes documented behaviour:** no

## Context

Before 1.0, `isPlainObject` accepts only this realm's `Object.prototype`. An
object made in an iframe or a Node `vm` context is kept by reference: writes
to it notify no one and its snapshot is not frozen, in silence.

The change can ship in 1.0 or not at all. Afterwards the object would be a
frozen copy in a snapshot where it is now the object itself, so code that
compares or writes through a snapshot would break in a minor release.

## Decision

A plain object made in another realm is proxied and frozen in snapshots like
any other plain object.

The commit first builds it without the per-prototype cache, and keeps the
smaller form that leaves store creation inside the spread.

The docs say that the raw object must not be frozen once a store holds it.

## Alternatives considered

### A guard for a property frozen behind the store

After `Object.freeze(raw.config)`, `s.config.nested` throws a `TypeError`
from the Proxy `get` invariant. A guard in `get` could detach the child and
return the raw value. That failure is loud, and the guard takes back most of
what record 0012 gains on a nested read.

### A Proxy target of the library's own

It would remove that invariant. It is too large for 1.0, makes the `has`,
`ownKeys`, `getOwnPropertyDescriptor` and `getPrototypeOf` traps mandatory,
needs separate support for `Object.freeze(store)`, and reopens records 0002
and 0007.

## Consequences

- Writes to an object from another realm notify, and its snapshot is frozen.
- Size: +81 bytes on the main entry with the cache, 24 lines, no unit test
  changed. The form without the cache was not measured.
- `canProxy` changes, and `persist` and `history` use it too.
- Freezing a raw object behind the store still makes a read throw. It is
  unspecified, like anything done to the raw object behind a store.

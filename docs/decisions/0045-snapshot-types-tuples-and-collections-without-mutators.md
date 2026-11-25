# 0045. Snapshot types: tuples stay tuples, and a collection snapshot has no mutators

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** yes

## Context

In the public types of 0.11:

- `Snapshot<[string, number]>` is `readonly (string | number)[]`.
- A snapshot of a reactive collection keeps its mutators in the type.
  `snapshot(store).todos.set(…)`, `.delete()`, `.clear()` and `tags.add()`
  compile, and each throws a `TypeError` when run.
- `add()` on a set that its owner froze and placed in a store pushes to the
  raw array and tells no one.
- The backing arrays `_entries` and `_items` are writable members of the
  published `ReactiveMap` and `ReactiveSet` types. The `@internal` tag is
  only a comment.

## Decision

- `Snapshot<[string, number]>` is `readonly [string, number]`.
- `Snapshot<ReactiveMap<K, V>>` and `Snapshot<ReactiveSet<T>>` are two
  exported types with the queries and the iterators and without `set`,
  `add`, `delete` and `clear`.
- Calling a mutator on a snapshot, through a tracking proxy, or on a
  collection its owner froze throws a `TypeError` with a code (record 0035).
- The backing arrays `_entries` and `_items` stay public, read-only in the
  snapshot types. The docs say that writing to them directly, on a live
  collection, is unspecified: use the methods.
- A subclass of a reactive collection works at run time, and its own members
  are not in its snapshot type in 1.0: `Snapshot<Tags>` is the snapshot type
  of the collection it extends.

## Alternatives considered

### Hide the backing arrays

The repository's own Next.js example reads them from snapshots in four
components, and hiding them is a migration with nothing behind it. Not
taken, and final for 1.0.

### A way for a class to name its snapshot type

An addition. It can follow 1.0.

## Consequences

- Code that called a mutator on a snapshot no longer compiles; it threw at
  run time before.
- No unit test changed. Type tests in 3 files changed, all fixes.
  `./collections` grows by 55 bytes with a short message.

# 0042. Reactive collections: one membership rule, an index for snapshots, and native `Map` and `Set` stay opaque

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, performance
- **Changes behaviour that 0.11 documents:** yes

## Context

In 0.11 `reactiveMap` and `reactiveSet` are backed by arrays and match
members by identity, which is the same for a raw object, its proxy and
every snapshot of it. Two rules disagree:

- `+0` and `-0` are two members when added and one when constructed:
  `reactiveSet([0])` then `add(-0)` has size 2; `reactiveSet([0, -0])` has
  size 1. A native `Set` holds one. The collections guide documents this.
- A collection constructed from one object in two forms holds it twice:
  `reactiveSet([raw, proxy])` has size 2, and `delete(raw)` leaves
  `has(raw)` true. `add` holds it once.

Every lookup scans the backing array, also on a frozen snapshot: `has()`
among 10,000 members takes 160 to 525 microseconds.

## Decision

- **One membership rule.** `-0` and `+0` are one key, as in a native `Map`,
  and a collection constructed from a raw object and its proxy holds it
  once.
- **Membership is by identity for every member.** A raw object, its proxy
  and each of its snapshots are one member. That keeps a selection made with
  one snapshot of a row true for the next. A collection cannot hold two
  snapshots of one object as two members: the second `add()` changes
  nothing, and the guide says so. A list in a store does not work this way
  (record 0006).
- **A snapshot of a collection answers `has()` and `get()` from an index**,
  built on the second lookup. A read through the tracking proxy of the React
  hook without a selector still scans, because the tracker has to see what
  was read.
- **Native `Map` and `Set` stay opaque**, and `reactiveMap` and
  `reactiveSet` stay separate classes.
- Once record 0013 is in, the core skips a removed subscriber, so the Vue,
  Angular and Svelte adapters drop their `active` flags, in the adapter
  commits that follow it. Solid keeps its flag, which under record 0037
  decides what the accessor returns after disposal, and Angular keeps its
  `destroyed` check.

## Alternatives considered

### An index beside the live array in 1.0

It is 100 times faster on a hit and costs 339 bytes, and it answers wrong
after a write to the raw backing array, which the scan gets right. Record
0045 keeps the backing arrays public and makes writing to them unspecified,
which leaves room for it later.

### Reactive native `Map` and `Set`

No library has a frozen native `Map`: one can still be written through
`Map.prototype.set`.

## Consequences

- The collections guide changes its sentence on `-0`.
- The membership rule costs 13 bytes, and the 2 tests that pinned the two
  defects change.
- Plain lookups on a snapshot among 10,000 members go from 160 to 525
  microseconds to under 0.1. `./collections` grows from 727 to about 843
  bytes. A tracked lookup was not timed.
- The index can follow 1.0; the membership rule is required before it.

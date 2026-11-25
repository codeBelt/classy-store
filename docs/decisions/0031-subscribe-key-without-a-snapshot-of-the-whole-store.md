# 0031. `subscribeKey` works without a snapshot of the whole store, and has no selector form in 1.0

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** performance
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 `subscribeKey(store, key, cb)` takes a snapshot of the whole store
on every notification, to compare one top-level key. Beside 1,000 rows that
costs 113 microseconds on Bun and 49 on Node per notification.

It takes a top-level key only. Users of Zustand expect a selector, an
equality option and an immediate first call.

## Decision

- `subscribeKey` reads the live value, and takes a snapshot of that one node
  only when the node or its version changed. The callbacks and their values
  are the same in every case that was run.
- A selector form, an equality option and an immediate first call are not
  part of 1.0.

## Alternatives considered

### A selector form, with an equality option and an immediate first call

They are additions and can follow 1.0, if the key form stays.

## Consequences

- A key beside 1,000 rows goes from 113 microseconds to 0.45 on Bun and from
  49 to 0.78 on Node.
- 21 lines, 62 bytes on `./utils`, no unit test fails.

# 0046. A snapshot after one row changes still rebuilds the list

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** performance
- **Changes behaviour that 0.11 documents:** no

## Context

When one row of a list changes, the next snapshot builds a new frozen array
for the whole list, reusing the snapshots of the unchanged rows. The cost
grows with the number of rows: writing one of 1,000 rows and taking a
snapshot took about 70 microseconds on Node and 150 on Bun on a busy
machine, against well under a microsecond for a cached snapshot.

## Decision

Not changed in 1.0.

## Alternatives considered

### Record which keys changed and rebuild only those

It is correct: a prototype showed no difference in 120,000 compared
snapshots. On Node it makes a snapshot after one of 1,000 rows changes three
times faster. On Bun, and so most likely in Safari, it gains nothing at that
size, because freezing a new 1,000-element array costs about 80
microseconds there by itself. It costs 270 bytes, for arrays only. It
changed 8 tests and gave 9 type errors, all of which read an internal map.
It can follow in a 1.x release.

## Consequences

- Record 0037 already removes the worst case for three of the five adapters
  without it: a loop of direct writes no longer takes one snapshot per write
  there.
- Open again when the bytes are affordable, or when a measurement on
  JavaScriptCore shows a gain.

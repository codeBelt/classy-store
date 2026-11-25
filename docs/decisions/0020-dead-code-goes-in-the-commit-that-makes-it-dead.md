# 0020. Dead and redundant code goes, in the commit that makes it dead

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** simplification
- **Changes behaviour that 0.11 documents:** no

## Context

The mutation run of 0.11 found code that no test can reach and checks that
can never fail, among them:

- `core.ts`: `if (!cached) return false` in `areDepsValid` is unreachable,
  because a computed dependency is recorded only after its cache entry
  exists and entries are never removed. `node.resumeScope()` in
  `createClassyStore` shows only through the defect of record 0003.
- `ownership.ts`: an unreachable `break` in `resume()`, three redundant
  fast-path guards and one redundant early return.
- `snapshot.ts`: `configurable: true` and `writable: true` on properties that
  `Object.freeze` overrides anyway, a `delete` from the in-progress set that
  nothing reads again, and three checks that cannot fail.
- `persist.ts`: an `assertActive()` that can never throw and one that
  duplicates it, four copies of the block that cancels the debounce timer,
  two assignments that are never read, guards whose removal changes nothing,
  and a default `merge = 'shallow'` whose text is never compared.
- `equality.ts`: three `instanceof` checks that cannot fail after the
  same-prototype check. `history.ts`: the `if` around the truncation in
  `record()` and the `disposed ||` in `redo()`. `collections.ts`: the object
  guard in `indexOfMember`, which repeats the one inside `identityOf`.
- Two traps of the React snapshot cache cannot be reached through
  `proxy-compare`.

`CONSTRAINTS.md` allows no unexplained surviving mutant in a target file, so
dead code cannot wait for a cleanup step.

## Decision

- **Code that is dead in 0.11 is removed first**, before the other changes:
  the ten dead lines of the three core files in the form the type checker
  accepts, the dead blocks of `persist.ts`, and the redundant checks in
  `equality.ts`, `history.ts` and `collections.ts`, each after a benchmark
  where it sits in a loop.
- **Code that a later change makes dead is removed in that change's
  commit.** That holds for the per-field bookkeeping of a restore, which
  records 0022 and 0023 make unreachable, and for `resumeScope()` in
  `createClassyStore`, which record 0003 makes redundant.
- **The two unreachable traps of the React snapshot cache** are removed if
  deleting them fails no unit test and no React suite; otherwise each gets a
  test that reaches it.
- **The ternary in `activeTracker()` stays.** It looks dead and is on the
  path of every read. That rests on a measurement of a patch that changed
  several things at once; it is timed alone before anything relies on it.

## Alternatives considered

### Remove all dead code in one cleanup step at the end

Code made dead in between would break the mutation rule in every commit
until then.

## Consequences

- The core files: 8 lines added, 17 removed, 32 bytes smaller on the main
  entry. No test fails, and the typecheck passes.
- The number of mutants listed as unkillable goes down.

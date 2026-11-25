# 0023. A restore is all or nothing

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0, for the documented sentence
- **Changes documented behaviour:** yes

## Context

Before 1.0, `persist` restores a record field by field through the store:

- A deeply nested record restores and then makes every snapshot and every
  save throw, so it is never replaced, and the store never saves again.
  Deeper still, the restore fails part-way: earlier fields are restored and
  later ones are not.
- `JSON.parse` makes `"__proto__"` an ordinary own key. A restored object
  keeps it as data, and the next save writes it back.
- A synchronous subscriber is told once per field and can edit another
  field in between.

## Decision

- A restore copies every value first, writes them in one transaction, checks
  that the result can be snapshotted, and rolls back if it cannot.
- A nested `__proto__` key is dropped.
- A record whose restore was rolled back, or that is nested too deep to
  copy, has nothing to keep (record 0021): it is reported, and the next save
  replaces it. No release can restore such a record, so keeping it would
  only stop the store from saving for good.
- The per-field bookkeeping of a restore that this makes unreachable is
  removed in the same commit (record 0020).

## Alternatives considered

None was named.

## Consequences

- A synchronous subscriber is told once, after the whole record is in. The
  persist tutorial describes the behaviour from before 1.0, and that
  sentence changes in the same commit.

- Size: 74 bytes on `./utils`. 1 unit test changed, a fix.

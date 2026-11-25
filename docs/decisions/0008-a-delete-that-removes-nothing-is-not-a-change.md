# 0008. A delete that removes nothing is not a change

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0: the rule that a write which changes nothing
  notifies no one is false without this
- **Changes documented behaviour:** no

## Context

Before 1.0, `delete
 store.dict.missing` calls every subscriber and replaces the
snapshot with an equal one. The same holds for `delete list[5]` past the end
of a list. Writing the value a field already holds does neither.

The rule that 1.0 guarantees is that a write which changes nothing notifies
no one. That rule is false while a delete of a missing key notifies.

## Decision

`delete store.dict.missing` returns `true` and does nothing else: no version
bump, no notification, no new snapshot.

## Alternatives considered

None was named.

## Consequences

- A subscriber is not called for a delete that removes nothing.
- 2 lines, +11 bytes on the main entry. 7 unit tests changed, all fixes, and
  one case that was kept out of the randomized test can go back into it.

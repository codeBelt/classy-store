# 0024. A pending save is written when the page is hidden, and nothing is written back at load but an expiry stamp

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0: the persist tutorial says that hydration does not
  rewrite storage, and the stamp is an exception to that sentence
- **Changes documented behaviour:** yes

## Context

- Before 1.0, a debounced save that is still waiting is lost when the page goes
  away: `debounce` has no flush.
- After a restore that migrates version 1 to 2, the stored record still says
  version 1, so the migration runs on every load until the first edit.
- With `expireIn` set, a record with no `expiresAt` never expires.
- The persist tutorial says that hydration does not rewrite storage.

## Decision

- A debounced save that is still waiting is written when the page is hidden
  (`pagehide`).
- **A migrated record is not written back at load.** The first save writes
  it, as before 1.0.
- **One thing is written back at load:** a record of the configured version
  that has no `expiresAt`, or `null`, read by a handle whose `expireIn` is a
  finite number, is saved again with an `expiresAt`, through the ordinary
  save path and its debounce. Its state and its version are unchanged.
- A record that arrives from another tab is never written back.

## Alternatives considered

### Write a migrated record back at load

So that the migration would not run again on the next load. It opens two
losses. A `migrate` that is wrong and does not throw would replace the
source record for every user who opens the release, edit or no edit, where
without the write-back a user who only looks keeps the old record. And after
a rollback, every user who merely opened the newer build would have a record
the older build must not write over. Running a `migrate` once more per load
costs nothing next to either. Not taken, and final for 1.0.

### Stamp a record for any `expireIn`

With `expireIn: Infinity` the record is written again on every load.

## Consequences

- The tutorial sentence that hydration does not rewrite storage gets the
  stamp as its one exception.
- The `pagehide` flush changed no unit test. A real page unload was not
  tested; it is tested in the browser suite.
- A migrated record was kept until the first edit, and a record without
  `expiresAt` was written once with one, in a prototype. The limit to a
  finite `expireIn` was not built. No test pins either write-back before 1.0;
  both get tests.

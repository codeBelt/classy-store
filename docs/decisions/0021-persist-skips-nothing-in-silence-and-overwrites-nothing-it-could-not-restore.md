# 0021. Nothing `persist` cannot use is skipped in silence, and nothing it could not restore is written over

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, diagnostics
- **Label:** Before 1.0
- **Changes documented behaviour:** yes

## Context

Before 1.0, `persist` can lose stored data in several ways:

- A record it refuses is reported only to `onError`, which is optional;
  without it the refusal is silent, and the next save replaces the record.
- A handle with `skipHydration` saves on its first edit, before any read. A
  stored record is replaced by the defaults and one edit, and the
  `rehydrate()` that follows reads the damage back. `skipHydration` is the
  pattern the server-rendering guides teach, and they say it "does not delay
  writes".
- A record of a newer version (another tab that has already updated, or a
  deployment that was rolled back) is passed to `migrate`, and the next edit
  writes the older build's state over it.
- A record that the application's own `migrate`, `merge` or `deserialize`
  fails on is replaced at the next save, which turns a bug in one release
  into lost data for every user who makes an edit.
- An `async` `migrate` is called and its promise dropped, which becomes an
  unhandled rejection.
- `onError` has no handle, so it cannot call `clear()`; an error it throws is
  swallowed.

## Decision

**A handle writes only after it has read.** Until its first read has
settled, a handle saves nothing: with `skipHydration` that is until the
first `rehydrate()`, and with a storage that returns a promise it is while
the first read is in flight. An edit made before then is kept in the store.
When the read restores a record, the edit wins for the field it changed, and
the result is saved. `save()` rejects before the first read has settled.
`clear()` works at any time.

**A stored record that is read and not restored** is one of five kinds:

| Kind                          | What it is                                                                                                                                                                                                                                                                                     | What happens                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Nothing to keep               | Not JSON; an envelope that is not an object; a `state` that is not a plain object; a version that is not a finite number of zero or more; an `expiresAt` that is neither a number, `null` nor missing; a record the library itself cannot restore, because it is nested too deep (record 0023) | Reported as `'parse'`. The next save replaces it                                            |
| A lower version, no `migrate` | The documented way to drop an old format                                                                                                                                                                                                                                                       | Not used and not reported. The next save replaces it                                        |
| From a newer version          | Its version is above the configured one                                                                                                                                                                                                                                                        | Reported as `'parse'`. `migrate` is not called. The handle does not write while it is there |
| Not migrated or not merged    | `migrate`, `merge` or a `deserialize` threw, or `migrate` or `merge` returned a thenable or something that is not a plain object                                                                                                                                                               | Reported as `'parse'`. The handle does not write while it is there                          |
| Not read                      | The read itself failed                                                                                                                                                                                                                                                                         | Reported as `'read'`. It counts as no read, so the handle does not write                    |

- **A handle that does not write** saves nothing: on an edit, when the page
  is hidden, or on `save()`. An edit does not repeat the report. `save()`
  reports as `'write'` and rejects with the error that `lastError` holds,
  the report that stopped the handle from writing. A `rehydrate()` that
  finds such a record again reports and rejects with that record's error. A
  `rehydrate()` whose own read fails reports as `'read'` and rejects with
  that error, as before 1.0. The handle writes again after `clear()`; after
  a `rehydrate()` that restores a record, finds none or finds one with
  nothing to keep; and when such a record, or the removal of the record,
  arrives from another tab. `lastError` of the status holds the report for
  as long as the handle does not write.
- **`onError` receives the handle as its third argument**, so that it can
  call `clear()`. For a synchronous storage the first read runs inside
  `persist()` (record 0019), so the report comes before `persist()` has
  returned. An error that `onError` throws is logged with `console.error`.
- **When no `onError` is given, the report goes to `console.error`** with
  its code, in every build. `onError` replaces that default.
- **What a report carries.** `onError(error, operation, handle)` receives
  the value that was thrown when the library did not throw it: the
  storage's error, the error of a `serialize`, `deserialize`, `migrate` or
  `merge`, or the `SyntaxError` of the default `JSON.parse`. When the
  library refuses a record or a call itself, `error` is an `Error` whose
  message carries one of these codes (record 0035): `persist-invalid` for a
  record with nothing to keep that parses, `persist-newer` for a record of a
  newer version, `persist-not-plain` for a `migrate` or `merge` that
  returned a thenable or a value that is not a plain object, and
  `persist-unread` for a `save()` before the first read has settled. The
  default report is one `console.error` call: its first argument is
  `@codebelt/classy-store [persist-failed]: <operation> "<key>"` and its
  second is the error.
- **Every failure of `save()` is reported as `'write'` and rejects with the
  same error**, as before 1.0; that includes a `save()` before the first
  read has settled. A call on a disposed handle rejects with
  `persist-disposed` and is not reported, because after `dispose()` the
  handle reports nothing.

- **One version rule, on both sides.** A version is a finite number, zero or
  above. A record with no `version` field counts as version 0; any other
  value, `null` and `"2"` included, leaves nothing to keep. The `version`
  option is checked when `persist()` is called (record 0022).
- **`migrate` is called only for a lower version**, and never as an `async`
  function: a native `async` function is refused when `persist()` is called
  (record 0022). If a `migrate` returns a thenable when it runs, a handler is
  attached to it, so no rejection is left unhandled, and the record counts as
  not migrated.
- **Expiry comes first.** A record whose time has elapsed is treated as
  expired whatever its version, as the build that wrote it would treat it.

## Alternatives considered

### Write over a newer record, or one that could not be migrated or merged

Not saving is the failure that can be undone; it is reported, and the
application can choose the other one with `clear()`. Not taken, and final
for 1.0.

### A handle that saves before it has read

It writes over a record it never saw. Not taken, and final for 1.0.

### A `skipHydration` handle that only looks at the stored version first

It would still write the defaults over a record it could have restored.

### Require an integer version, on the record only

An application configured with `version: 1.1` would refuse its own record
after the upgrade.

### Await an `async` `migrate`

It would put a turn between the read and the apply, which record 0019
removes. Accepting it later is a compatible change, so this is not final.

### A `'migrate'` value for `PersistOperation`

A new member of that public union would break a consumer's exhaustive
`switch`. Not taken, and final for 1.0.

### Keep a record that is nested too deep

No release can restore it, and keeping it would stop the store from ever
saving again.

## Consequences

- With `skipHydration`, nothing is saved until `rehydrate()` has been called.
  An application that never calls it saves nothing, and only `save()` says
  so, by rejecting. `isHydrated` shows the state. The guide sentence that
  `skipHydration` "does not delay writes" is reversed.
- While a handle does not write, edits are not saved, and a later
  `rehydrate()` that restores a record restores over them. After a release
  whose `migrate`, `merge` or `deserialize` fails for a stored record, that
  user's state is not saved until a later release reads the record or the
  application calls `clear()`.
- After a rollback of a deployment, a user whose record the newer build saved
  cannot save on the older build until the newer one is back.
- Two losses stay, and the guide names both: a tab that read before a newer
  build wrote, and does not sync, writes over the newer record at its next
  edit; and a `migrate` that returns a wrong result without throwing is
  saved at the user's next edit.
- A callback written for two arguments still fits `onError`.
- The rules were built once together and run through 33 paths. 98 lines
  added and 36 removed in `persist.ts` and `persist.types.ts`; +245 bytes on
  `./utils` over the first combined build of the `persist` changes. 48 unit
  tests changed: fixes, tests that used `skipHydration` as a set-up and
  saved before any read (incidental), tests that pinned the read winning
  over an earlier edit (changed by this decision), and tests of the
  arguments of `onError` (incidental).
- Not in that build: a record nested too deep has nothing to keep; the
  removal of the record in another tab lets a handle write again; the expiry
  stamp of record 0024 only for a finite `expireIn`. Not run: a real
  `pagehide`, a real second tab, the browser suites.

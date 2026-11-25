# Stage 3 spikes: `persist`, `devtools` and `history`

Helper report for the stage 3 decision document, 2026-11-24. Spikes were run in
a throwaway worktree at `74966f1` (`<scratch>/stage-3-persist-devtools/wt`).
Nothing in the repository was changed except this file. Every patch is in the
appendix.

## Summary

| Item                       | Result                                                                                                                                                  | Recommendation                                                        | Label          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------- |
| P1. When hydration happens | A synchronous `getItem` is restored before `persist()` returns. 1 test fails (incidental). `./utils` 6 bytes smaller                                    | Do it, as the only behaviour, with no option                          | Before 1.0     |
| P2. Nothing skipped        | Every unusable record reaches `onError` as `'parse'`, with a reason in the message. 8 tests fail, all pins of the silence (fixes). +144 bytes           | Do it. No new operation name. Refuse an `async` `migrate`             | Before 1.0     |
| P3. Options validated      | `persist()` throws a `TypeError` for a prototype key, an accessor, a method or a half transform. 5 tests fail (4 fixes, 1 incidental). +82 bytes        | Do it                                                                 | Before 1.0     |
| P4. All or nothing         | Copy every value first, restore in one transaction, check one snapshot, roll back on failure; strip nested `__proto__`. 1 test fails (fixes). +74 bytes | Do it                                                                 | Can follow 1.0 |
| P5. Write-back and flush   | A migrated record is stored at once; a pending debounced save is written on `pagehide`. 0 tests fail. +102 bytes                                        | Do both                                                               | Can follow 1.0 |
| P6. Cross-tab events       | An event from another area is ignored when `storage` is a `Storage`. 0 tests fail. +24 bytes                                                            | Do the narrow form. Do not refuse events without `storageArea`        | Can follow 1.0 |
| P7. `devtools`             | One entry per outermost method, named after it; exact time travel in one transaction; `RESET`, `COMMIT`, `ROLLBACK`, `IMPORT_STATE`. 0 tests fail. +403 | Do it. Keep `enabled` defaulting to `true`                            | Before 1.0     |
| P8. `history`              | Drop the `restoring` counter, undo in one transaction. 1 test fails (fixes). 24 bytes smaller                                                           | Do it                                                                 | Can follow 1.0 |
| P9. Option names           | Reading only                                                                                                                                            | Keep the names. Keep `storage` required for 1.0. Drop `clearOnExpire` | Before 1.0     |
| Combination                | All of the above. 15 tests fail, the union of the single spikes, none a regression. `./utils` adds 3,396 bytes, 646 over its budget                     | As above. The utils budget has to move                                |                |

Three things the decider should know first:

1. **The `./utils` budget cannot hold this set.** It adds 2,686 bytes against
   2,750 today; the combination adds 3,396. About 400 of the 710 extra bytes are
   `devtools`, about 100 are error text. The main entry gains 20 bytes for the
   action-name hook, which every other entry carries too.
2. **P1 makes the order of `prepareStoreForHydration` and `persist()`
   matter.** Today an async read hides a wrong order; with P1, a store prepared
   after a module-level `persist()` captures the restored state. The React
   spike (A5) removes the hazard if it captures before the first write. What
   `persist` needs from A5 is in P1.
3. **The rule "only an elapsed TTL may delete stored data" decided P2's expiry
   case.** Counting a record without `expiresAt` as expired would wipe every
   user's saved state on the release that adds `expireIn`. The combination
   restores such a record and writes it back with an `expiresAt`, so it expires
   from then on.

## Baseline

The unmodified worktree at `74966f1` on an Apple M1 Max, other agents running.
Bun 1.4.5, Node 24.21.0.

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes after one build.
- `bun run size`: main entry 3,661 bytes gzipped; `./utils` 6,347, adding
  2,686 against a budget of 2,750.
- The reproduction script (appendix, `repro.ts`) reproduces every finding the
  spikes aim at. Its output is in each entry's "before".

## P1. When hydration happens

**Question.** Should a synchronous storage be read before `persist()` returns,
and how does that sit with `skipHydration`, server rendering and the React
server snapshot? Stage 2 defect 18 (Legend-State 4), M48, M70, stage 1 finding
56, merged dependency 16 and "proposals I think are wrong" item 18.

**What was changed.** `persist.ts`, 15 lines added and 18 removed
(`p1.patch`). `hydrateFromStorage()` awaits `getItem()` only when it returns a
thenable, and marks the handle hydrated in its own `finally`. An `async`
function runs synchronously up to its first `await`, so with `localStorage`
the whole restore happens inside `persist()`. The two callers lose their own
bookkeeping, which is why the entry gets smaller.

**Reproduction.**

| Case                                                           | Before                | P1                   |
| -------------------------------------------------------------- | --------------------- | -------------------- |
| `count` when `persist()` returns, stored 7                     | 0, `isHydrated` false | 7, `isHydrated` true |
| `skipHydration` and `rehydrate()`: `count` before the `await`  | 0                     | 7                    |
| `prepareStoreForHydration` called after `persist()`: its count | 0                     | 7                    |

**Tests.** 1,340 pass, 1 fails, **incidental**:
`persist.concurrent.test.ts`, "clear during initial restore wins until a later
local write (editAfterClear=true)". It attaches a synchronous subscriber after
`persist()` returns and expects to see the initial restore, which now happened
before it subscribed. The case it guards (a `clear()` from a subscriber during
a restore) still passes in the `manual` and `storage` rows. Stage 4 should
attach the subscriber before `persist()`.

**Typecheck** passes. **Size** `./utils` 6,341, 6 bytes smaller.

**What it changes for a user.**

- A client-only app on `localStorage` renders the stored state on its first
  render. No flash of defaults. An async adapter behaves as today.
- `migrate`, the transforms and `merge` run inside `persist()`. A throw is
  still caught and reported as `'parse'`; `persist()` itself does not throw.
- The tutorial sentence "Hydration is asynchronous even with `localStorage`"
  becomes false. `hydrated` still resolves, so code that awaits it works.

**Server rendering.** The documented pattern (persist inside a client effect,
optionally with `skipHydration`) is unaffected: the restore happens after
React hydrated, whenever the read runs. The hazard is a module-level or
render-time `persist()` on the client: the store now holds stored data before
`hydrateRoot`, so the first client render differs from the server HTML unless
the server snapshot was captured before the restore. Today the async read
hides that `prepareStoreForHydration` was called too late; with P1 it does not.

**What `persist` needs from A5** (the React agent's automatic capture): the
capture must happen before `persist()`'s first restore write. Both forms in
Zustand and Jotai finding 1 satisfy that. Capturing at creation does trivially.
Capturing lazily "just before the first write" also does, because the restore
writes through the store's `set` trap (`persist.ts` assigns
`proxyStore[key]`). Without A5, the docs must say that
`prepareStoreForHydration` goes before `persist()`, which `REACT_SSR.md`
already says ("before rendering or starting persistence").

**`skipHydration`.** Keep it, with the same name as Zustand's. With P1 its
only purpose is to choose when the read happens, which is what the SSR recipe
uses it for. An option `hydrate: 'sync' | 'async'` (M48) is not needed: an
async adapter is async whatever the option says, and a sync one gains nothing
from a forced microtask.

**Spike gap.** If the baseline snapshot at the top of `hydrateFromStorage()`
throws (a store that is already broken), `hydrated` never resolves. Stage 4
moves the `hydratedFlag` bookkeeping to cover that line.

**Recommendation: do it, as the only behaviour. Before 1.0**, because it
changes documented behaviour and the order rule above.

**Cost for stage 4.** `persist.ts`, the one test above, about four new tests
(sync and async adapter, `rehydrate()` with a sync adapter, a `save()` queued
before a read). The tutorial and `REACT_SSR.md`. Risk low. No number moves.

## P2. Nothing is skipped in silence

**Question.** What should each unusable record do, and through which channel?
Security 4 to 6, Zustand and Jotai 3, stage 1 finding 53, M45, M46,
contradictions 20 and 21.

**What was changed.** `persist.ts`, 24 lines added and 21 removed
(`p2.patch`). One `unreadable(why)` throws a `TypeError` from inside
`applyPersistedState()`, which `hydrateFromStorage()` already catches and
reports as `'parse'`, with `lastError` set. The decisions:

| Record                                                                             | Before                  | P2                                                           |
| ---------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| JSON that is not `{version, state}`; `state` not a plain object, an array included | Skipped, no report      | `'parse'`: "is not {version, state}"                         |
| Version differs, no `migrate`                                                      | Skipped, no report      | `'parse'`: "has version 1 and there is no migrate"           |
| Version `"2"`, `null`, `2.5`                                                       | Counted as 0            | `'parse'`: "has a version that is not an integer"            |
| Version missing                                                                    | 0                       | 0, unchanged                                                 |
| `migrate` returns a promise, an array or `null`                                    | Skipped or `'parse'`    | `'parse'`: "migrate must return a plain object"              |
| `expireIn` set, `expiresAt` missing                                                | Restored, never expires | Restored; the combination writes it back with an `expiresAt` |
| `expiresAt` `null`                                                                 | Restored                | Restored: JSON stores an `expireIn` of `Infinity` as `null`  |
| `expiresAt` `"yesterday"`                                                          | Restored                | `'parse'`: "has an expiresAt that is not a number"           |

In every `'parse'` case the store keeps its state and the record stays in
storage until the next save, as for text that is not JSON today.

**Tests.** 1,333 pass, 8 fail, all **fixes**: each pins a silent skip that P2
reports.

- `persist.hydration.test.ts`: "stored data from another version is ignored
  when there is no migrate".
- `persist.validation.test.ts` (the "stored records that are not an
  envelope" group): null, a number, a string, an object without state, state null,
  state a string, and "a record whose state is an array writes the array
  length into a field named length" (stage 1 finding 53).

A first form that counted a missing `expiresAt` as expired failed three more
tests: in `persist.test.ts`, "clearOnExpire does not remove a record from
another version" ("only an elapsed TTL may delete stored data") and "data
without expiresAt hydrates normally when expireIn is set"; in
`persist.validation.test.ts`, "a record saved with `expireIn: Infinity` never
expires". Both pin a real rule, so the form was
dropped.

**Typecheck** passes. **Size** `./utils` 6,491, +144. Most of it is message
text.

**The two contradictions.**

- **20, the operation name.** Keep `'parse'`; add no `'migrate'`.
  `PersistOperation` is a public union, and adding a member after 1.0 breaks
  an exhaustive `switch`. What a user does is the same for every case ("the
  stored record could not be used"); the message says which. An error class
  with a `reason` field could follow 1.0 as an addition.
- **21, an `async` `migrate`.** Refuse it, do not await it. Awaiting brings
  back the turn that P1 removes, and the type already refuses a promise. The
  runtime check is for JavaScript callers, and it catches the mistake with a
  message instead of a silent default.

**What it changes for a user.** New `onError` calls and a non-null
`lastError` for records that were dropped in silence. A record with a string
version no longer reaches `migrate` as version 0.

**Recommendation: do it. Before 1.0**, because it changes documented
behaviour (the tutorial's version rules) and what `onError` receives. Not
reported to the console: that belongs to the development build (M72).

**Cost for stage 4.** `persist.ts`; rewrite the eight tests to expect the
report; a table like the one above in `PERSIST_TUTORIAL.md`. Risk low. M54's
scattered guards go with it.

## P3. Options are validated when `persist()` is called

**Question.** Should `persist()` refuse a `properties` list it cannot honour?
Security 1, stage 1 findings 48, 52 and 55, M44.

**What was changed.** `persist.ts`, 29 lines added and 17 removed
(`p3.patch`). `resolveProperties()` throws
`TypeError('persist(): cannot persist "<key>"')` for `__proto__`,
`constructor`, `prototype`, a key that is not a string, an accessor (getter
or setter), a method, and a transform without both `serialize` and
`deserialize` functions. A variant with two messages (`p3-two-messages.patch`)
cost 131 bytes; one message costs 82.

**Reproduction.** Before: all six lists accepted. After: all six throw when
`persist()` is called.

**Tests.** 1,336 pass, 5 fail.

- **Fixes** (4): `persist.validation.test.ts`, "a getter named in properties
  is saved and stops the restore at that field with a parse error" (finding
  52), and three in "properties entries that are neither a key nor a full
  transform": null, a transform without a key, a transform without serialize
  (finding 55).
- **Incidental** (1): `persist.restore.test.ts`, "a field written by the
  setter of an earlier restored field still receives its own stored value".
  It lists an accessor pair in `properties` to drive the restore's per-field
  bookkeeping. P3 refuses the accessor, and with P4 that bookkeeping branch is
  dead (see the combination).

**Typecheck** passes. **Size** `./utils` 6,429, +82.

**What it breaks for a user.** Code that lists a getter, a setter pair or a
malformed entry now throws at startup. All of these are broken today in
silence. A setter pair that worked by accident (save the getter, restore
through the setter) must list the backing field instead.

**Recommendation: do it. Before 1.0**, because a call that works today
throws.

**Cost for stage 4.** `persist.ts`; rewrite the five tests to expect the
throw. Risk low.

## P4. Restore is all or nothing

**Question.** Can a record that restores and then breaks every snapshot (and
the partial restore of finding 52) become a reported, skipped record? Security
2 and 3, stage 2 defects 12 and 13, M51, M52, merged dependency 15.

**What was changed.** `cloneSnapshot.ts`, 8 lines added and 2 removed;
`persist.ts`, 44 added and 22 removed (`p4.patch`).

- `cloneSnapshotValue(value, clones, untrusted)` drops an own `__proto__` key
  at every depth when `untrusted` is passed. Only `persist` and `devtools`
  pass it, so `withHistory` still copies exactly.
- `applyPersistedState()` copies every value before writing any, so a value
  too deep to copy leaves the store untouched.
- The writes run inside `batch()`, then one `snapshot()` is taken inside the
  same transaction. If a write or the snapshot throws, the written fields are
  put back from the snapshot taken before the restore and the error is
  reported as `'parse'`. Subscribers hear only the rolled-back state.

**Reproduction.**

| Case                                     | Before                                                  | P4                                          |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Depth 17,000                             | `a` restored, `b` deep, every snapshot throws, no error | Nothing restored, snapshot works, `'parse'` |
| Depth 30,000                             | `a` restored, `b` default, `'parse'`                    | Nothing restored, `'parse'`                 |
| Nested `__proto__` in `prefs`            | Own keys `__proto__`, `theme`; written back on save     | Own key `theme` only                        |
| A setter that throws on the second field | `a` restored, `'parse'`                                 | `a` stays 0, `'parse'`                      |

**Tests.** 1,340 pass, 1 fails, **fixes**: `persist.validation.test.ts`, "a
getter named in properties is saved and stops the restore at that field with
a parse error". The restore no longer stops part-way.

**Typecheck** passes. **Size** `./utils` 6,421, +74.

**What it changes for a user.** A synchronous subscriber hears a restore once,
not once per field. The tutorial says synchronous subscribers "can edit a
different field during restoration" and that their edit wins. It still wins,
because it now runs after the restore. A rolled-back field gets a copy of its
earlier value, so its identity changes on the failure path only. The depth
limit depends on the engine and should be documented, not capped.

**Recommendation: do it. Can follow 1.0**: it is a bug fix with no API
change. Do it with P2, since both rewrite the same function.

**Cost for stage 4.** `persist.ts`, `cloneSnapshot.ts`; the one test; new
tests for the deep record, the strip and the rollback. Risk medium: the
rollback has to keep `skipAutoSaveVersion` right, as the spike does by setting
`expectedVersion` after the rollback.

## P5. A migrated record is written back; a debounced save is flushed

**Question.** Zustand and Jotai finding 4 (M47), Legend-State finding 5 (M50).

**What was changed.** `persist.ts`, 27 lines added (`p5.patch`).

- A read that went through `migrate` sets `saveAfterRead`, so the save that
  already follows a read stores the record at the new version. The storage
  event path does not, so two tabs cannot keep rewriting each other.
- With `debounce > 0`, listeners for `pagehide` and `visibilitychange` write a
  pending save at once when the page is hidden. Both are removed in
  `dispose()`. `addEventListener` is called with `?.`, so React Native and
  Node do not throw.

**Reproduction.** After migrating `{old: 7}` from version 1: before, the
record still says version 1; after, `{"version":2,"state":{"n":7}}`. With
`debounce: 10000`, an edit, then `pagehide`: before, 0 writes; after, 1.

Two tabs on one area with `syncTabs`, both migrating (`probe.ts`): 1 write in
total, and both end at 7. In the probe the second tab reads after the first
wrote, because P1 reads synchronously. In two real tabs both may migrate and
write once each, and each then receives the other's version-2 record through
the storage event, which does not write. That last sentence is reasoning.

**Tests.** 1,341 pass. **Typecheck** passes. **Size** `./utils` 6,449, +102.

**What it changes for a user.** Storage is written once at load after a
migration. A debounced edit survives closing the tab when the adapter is
synchronous. An async adapter starts the write and may not finish.

**Recommendation: do both. Can follow 1.0.**

**Cost for stage 4.** `persist.ts`; tests for both, with fake events. A real
page unload was not tested; stage 4 should add a browser test. Risk low.

## P6. Cross-tab events

**Question.** Security 8, M53.

**What was changed.** `persist.ts`, 14 lines added and 4 removed
(`p6.patch`). When the event names a `storageArea` that is not `storage`, and
`storage` is itself a `Storage`, the event is ignored. A wrapper around
`localStorage` cannot be compared, so it keeps today's behaviour.

**Reproduction.** An event from another area with the same key: applied
before, ignored after. An event from the configured area: applied in both. A
synthetic event without `storageArea`: applied in both.

**Tests.** 1,341 pass. **Size** `./utils` +24.

**The strict form** (`p6-strict.patch`) also ignores every event without
`storageArea`. It fails 20 tests, which all dispatch synthetic events, and it
protects against nothing: only a script can make such an event, and a script
can already write to the store.

**Recommendation: do the narrow form. Can follow 1.0.** Document that
`syncTabs` listens to `localStorage` events under `name` whatever the adapter,
and that two tabs editing different fields at once is last writer wins on the
whole record (Legend-State 10).

**Cost for stage 4.** `persist.ts`, one test with a second area. Risk low.

## P7. `devtools`

**Question.** Security 7, Zustand and Jotai 6 and 7, Valtio V9, M56, M57,
contradictions 19 and 29, merged dependencies 14, 15 and 18.

**What was changed** (`p7.patch`). `core.ts` 9 lines added, `storeRuntime.ts`
1, `cloneSnapshot.ts` 51 added and 4 removed, `devtools.ts` 125 added and 51
removed.

- **Action names.** `transactional()` records the outermost method's
  `method.name` in a module variable while the call runs, and an internal
  `actionName()` reads it. Nothing public is added.
- **Sending.** `devtools` subscribes with `{sync: true}`. Inside a method it
  sends one entry named after the method, with one snapshot. Direct writes
  outside a method send one `STORE_UPDATE` entry per task, from a microtask.
  That answers contradiction 29: the synchronous channel costs one snapshot
  per outermost method, never one per direct write, so the 640-millisecond
  case of M63 does not arise. A direct write still waiting when a method
  sends is folded into the method's entry.
- **Time travel.** A shared `applyState(store, state, untrusted)` in
  `cloneSnapshot.ts`, which is `withHistory`'s rule: only data keys, a data
  field missing from the state is deleted, an unchanged branch keeps its
  identity, all in one `batch()`. It skips every accessor, not only getters.
  `devtools` keeps the snapshots it sent, by the id the extension gives each
  entry, up to `maxAge` (default 50). A jump whose `payload.actionId` it knows
  restores that exact snapshot, so a `Date` stays a `Date`. Otherwise it
  parses `state`, strips `__proto__` and refuses keys the store does not have.
- **Messages.** `RESET` applies the state from `devtools()` time and calls
  `init()`; `COMMIT` calls `init()` with the current state; `ROLLBACK`
  applies the given state and calls `init()`; `IMPORT_STATE` applies the last
  computed state and sends the lifted state back. A malformed `state` changes
  nothing.
- **Options.** `maxAge`, `trace`, `traceLimit`, `actionsDenylist` and
  `actionsAllowlist` are typed and passed to `connect()` with `name`. An index
  signature would pass any option, but it also accepts `enabeld: false` without
  a word, so the list is named.

**Reproduction** (a fake extension; `repro.ts`, section P7).

| Case                                                    | Before             | P7                                     |
| ------------------------------------------------------- | ------------------ | -------------------------------------- |
| `rename()`, `birthday()`, two direct writes in one task | `["STORE_UPDATE"]` | `["rename","birthday","STORE_UPDATE"]` |
| Options reaching `connect()`                            | `{"name":"p7"}`    | `{"name":"p7","maxAge":30}`            |
| A jump: sync subscriber calls                           | 5                  | 1                                      |
| A jump: an unknown field `added`                        | Added              | Not added                              |
| A jump: setter-only accessor in the state               | Called             | Not called                             |
| A jump: `when` afterwards                               | A string           | A `Date`                               |
| A jump to a state without `age`                         | `age` kept         | `age` deleted                          |
| An edit in the same tick as a jump                      | Never sent         | Sent                                   |
| `RESET`, `COMMIT`, `ROLLBACK`, `IMPORT_STATE`           | Ignored            | Handled                                |

**Tests.** 1,341 pass. The existing tests flush a tick before every
assertion, so none sees the switch to the synchronous channel. **Typecheck**
fails one type test, **incidental**: `types.utils.test.ts`, "DevtoolsOptions
has an optional name and an optional enabled flag", which pins the old option
list exactly.

**Size.** Main entry 3,681, +20, and every other entry about +12 to +22,
because all of them carry the runtime. `./utils` 6,750, +403.

**`enabled` (contradiction 19).** Keep `true` as the default, and document
next to it that the extension receives every state. The library has no
portable way to know it runs in production, and reading `process.env.NODE_ENV`
belongs to the development-build decision (M72). Requiring the option would
make every call longer to protect against a user who has the extension and
can already edit their own client.

**A setter (merged dependency 18).** With D3 a setter becomes a transaction,
but it does not pass through `transactional()`, so its writes are named
`STORE_UPDATE` and grouped per task. That is acceptable; naming it after the
property is a later addition.

**Not verified.** The id that the extension gives each entry, and the
`actionId` in its jump messages, are taken from how Redux DevTools numbers
lifted actions, not from a run against the real extension. When an id is
unknown, the JSON path is used, which is still correct apart from values JSON
cannot carry.

**Recommendation: do it. Before 1.0**, because the entry names, the
synchronous channel and the new options are visible behaviour.

**Cost for stage 4.** `core.ts` (the hook, on the method path; the benchmark
is below), `devtools.ts`, a shared `applyState` that `withHistory` also uses
(merged dependency 14: when M60 makes it recursive, both change once). Tests
for each message and for the entry names, without flushing a tick first. The
type test. `DEVTOOLS_TUTORIAL.md`. Risk medium, from the unverified ids.

## P8. `history`: an edit in the same tick as `undo()`

**Question.** Stage 1 findings 57, 58 and 59, M58.

**What was changed.** `history.ts`, 5 lines added and 9 removed
(`p8.patch`). The `restoring` counter is gone: the version check that already
follows it skips the restore's own notification. The apply runs inside
`batch()`. `p8a-no-counter.patch` is the counter change alone; it gives the
same test result.

**Reproduction.** After `undo(); store.value = 9;` in one tick: before,
`canRedo` true and `redo()` gives 1, so the 9 is lost; after, `canRedo` false
and the value stays 9. One undo over three fields: 3 sync calls before, 1
after.

**Tests.** 1,340 pass, 1 fails, **fixes**: `history.sameTick.test.ts`, "an
edit made in the same tick after an undo is not recorded, and a redo then
discards it".

**Typecheck** passes. **Size** `./utils` 6,323, 24 bytes smaller.

**What it changes for a user.** The edit is recorded. A synchronous
subscriber hears an undo once. A synchronous subscriber that edits the store
while hearing an undo still has its edit folded into the restored entry, as
today.

**Recommendation: do it. Can follow 1.0.**

**Cost for stage 4.** `history.ts`, the test. Risk low. With P7, `history.ts`
uses the shared `applyState` and loses 39 lines in all.

## P9. Option names and defaults

No spike. Against `review/stage-2/legend-state.md` ("Our options next to
Legend's") and `review/stage-2/zustand-jotai.md` ("Names a user from either
library would trip on").

| Option                        | Recommendation                                                                                                                                                                                                                                                                                    | Label          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `storage` required            | Keep it required for 1.0. Making it optional later is an addition; the reverse is not. A default needs an answer for a server or React Native, where `localStorage` is missing, and every answer is either a throw or a new silence (merged "wrong" item 18). The docs already pass it everywhere | Can follow 1.0 |
| `name`                        | Keep. Same as Zustand                                                                                                                                                                                                                                                                             | No change      |
| `properties`                  | Keep. `partialize` would be a second way to say the same. P3 makes it strict                                                                                                                                                                                                                      | No change      |
| `version`, `migrate`, `merge` | Keep. Same names and argument order as Zustand. `migrate` stays synchronous (P2)                                                                                                                                                                                                                  | No change      |
| `skipHydration`               | Keep. Same as Zustand. With P1 it chooses the moment of the read                                                                                                                                                                                                                                  | No change      |
| `debounce`                    | Keep, with the flush of P5                                                                                                                                                                                                                                                                        | No change      |
| `syncTabs`                    | Keep. Document last writer wins                                                                                                                                                                                                                                                                   | No change      |
| `expireIn`                    | Keep                                                                                                                                                                                                                                                                                              | No change      |
| `clearOnExpire`               | Remove it and always remove an expired record. Expired data left in storage is never read again; the option is the only one without a precedent in either library. Breaking, so now or never. Not spiked                                                                                          | Before 1.0     |
| `onError`, `PersistOperation` | Keep the four operations (P2)                                                                                                                                                                                                                                                                     | No change      |
| `devtools` `name`, `enabled`  | Keep both and their defaults (P7). Add the five `connect()` options                                                                                                                                                                                                                               | Before 1.0     |
| `withHistory` `limit`         | Keep                                                                                                                                                                                                                                                                                              | No change      |

## The combination

**What was changed** (`combo.patch`): P1 to P8 together, plus two changes that
need more than one spike.

- `withHistory` uses the shared `applyState()` from P7 instead of its own
  copy, which also gives it P8's transaction.
- A record restored under `expireIn` with no `expiresAt` is written back, by
  the same `saveAfterRead` path as a migrated record, so it expires from then
  on. `probe.ts` shows the record written with an `expiresAt` after the load.

Files: `core.ts` +9, `storeRuntime.ts` +1, `cloneSnapshot.ts` +51 and -4,
`devtools.ts` +125 and -51, `history.ts` +5 and -39, `persist.ts` +155 and
-81.

**Tests.** 1,326 pass, 15 fail: exactly the union of the single spikes' lists
(P1 1, P2 8, P3 5 and P4 1, which share one test, and P8 1). None is a
regression.

**Typecheck** fails the one type test of P7, as expected.

**Size.**

| Entry            | Baseline | Combination | Adds to main | Budget |
| ---------------- | -------: | ----------: | -----------: | -----: |
| `.`              |    3,661 |       3,681 |              |  3,750 |
| `./utils`        |    6,347 |       7,077 |        3,396 |  2,750 |
| `./collections`  |    4,388 |       4,402 |          721 |    750 |
| `./react`        |    5,323 |       5,335 |        1,654 |  1,700 |
| `./react/server` |    3,814 |       3,826 |          145 |    175 |
| `./vue`          |    3,941 |       3,960 |          279 |    300 |
| `./svelte`       |    3,843 |       3,862 |          181 |    200 |
| `./angular`      |    3,932 |       3,954 |          273 |    300 |
| `./solid`        |    3,973 |       3,993 |          312 |    335 |

The bytes by spike, measured alone: P7 +403, P2 +144, P5 +102, P3 +82, P4
+74, P6 +24, P1 -6, P8 -24. Where the decision document could cut: the error
text of P2 and P3 (about 100 bytes) if a development build keeps messages
there, and `IMPORT_STATE` (rarely used). A new `./utils` budget of 3,500
would leave room for a few-line fix, as the other budgets do.

**Seen in the combination: dead code for stage 4.** With the restore inside
`batch()` (P4) and accessors refused (P3), no synchronous subscriber can run
between two restored fields and a data field adds exactly one revision.
Deleting the line `if (after > before + 1 && pending.size)
discardEditedFields();` leaves the 15 failures unchanged. The
`clearedVersion` step inside the loop is likely dead for the same reason (not
tried). That is part of M54.

**Timings.**

Saved builds of the baseline and the combination, each with its own
`package.json`, run back to back on a machine shared with other agents. Only
`core.ts` changes on the hot path (the action-name hook in `transactional()`),
so only a method call can move. The four ratios that `CONSTRAINTS.md` limits:

| Ratio               | Bun baseline | Bun combination | Node baseline | Node combination | Limits (Bun, Node) |
| ------------------- | -----------: | --------------: | ------------: | ---------------: | -----------------: |
| read / proxy read   |         14.2 |            15.6 |          2.06 |             2.06 |            20, 2.5 |
| write / proxy write |         2.67 |            2.72 |          1.33 |             1.40 |           3.2, 1.7 |
| cached getter       |         33.1 |            29.5 |          3.62 |             3.63 |            41, 5.3 |
| cached snapshot     |         6.78 |            7.42 |          1.35 |             1.39 |            10, 1.8 |

All inside their limits, and each difference is inside the run's own spread
(the Bun baseline read ratio ran from 12.1 to 19.5). The full Node run of the
combination was noisy: some highest values were 10 to 30 times the median.

`store.method`, run again alone, 7 runs each, in alternating order
(nanoseconds, median and lowest):

| Engine | Baseline             | Combination          |
| ------ | -------------------- | -------------------- |
| Node   | 311 / 302, 301 / 298 | 321 / 319, 315 / 310 |
| Bun    | 226 / 225, 230 / 223 | 226 / 224, 234 / 223 |

On Node the hook costs about 10 to 14 nanoseconds per method call, 3 to 5
percent, just outside the spread. On Bun there is no difference. Every other
metric's difference is inside its spread. No limit moves.

## Verified and not verified

**Verified by running:**

- Every spike alone and the combination: `bun run test`, the package
  typecheck and `bun run size` in the worktree. Each failing test is named
  above with its class.
- The reproduction script before and after each spike, and after the
  combination (appendix). `probe.ts` for the TTL write-back and two tabs that
  both migrate, on the combination.
- The dead-branch deletion on the combination.
- `bun run benchmark:core` and `benchmark:core:node` on saved builds of the
  baseline and the combination, back to back.

**Only read, or reasoning:**

- The ids Redux DevTools gives entries and sends in jump messages (P7).
- That `visibilitychange` reaches a listener on `window` (it is dispatched at
  `document` and propagates to `window`), and that a real page unload runs
  the flush (P5). No browser was run.
- Two real tabs that both migrate (P5): the probe ran both handles in one
  process.
- The React side of P1. No React or server render was run with P1; the order
  claim rests on what `hydrationSnapshots` holds after each call order.

**Not run:** the browser, framework and mutation suites, as the brief says.

## Appendix: reproduction output

Before (unmodified worktree):

```text
## P1. when hydration happens
count right after persist(): 0 | isHydrated false
count after hydrated: 7
prepareStoreForHydration called after persist(): server snapshot count 0
skipHydration + rehydrate(): count before await 0
after await 7

## P2. nothing is skipped in silence
envelope 5                         count 0 | expired false | errors []
envelope null                      count 0 | expired false | errors []
envelope []                        count 0 | expired false | errors []
state null                         count 0 | expired false | errors []
state [1,2,3]                      count 0 | expired false | errors []
version 1, no migrate              count 0 | expired false | errors []
version "2" vs 2, migrate          count 7 | expired false | errors []
version missing vs 2, migrate      count 8 | expired false | errors []
async migrate                      count 0 | expired false | errors []
migrate returns an array           count 0 | expired false | errors []
expireIn, no expiresAt             count 9 | expired false | errors []
expireIn, expiresAt "yesterday"    count 9 | expired false | errors []
not JSON                           count 0 | expired false | errors ["parse: JSON Parse error: Expected '}'"]

## P3. options validated when persist() is called
__proto__                            accepted
constructor                          accepted
getter                               accepted
method                               accepted
transform without serialize          accepted
transform serialize not a function   accepted

## P4. restore is all or nothing
depth 17000: a restored-a | b deep | snapshot RangeError | errors (none)
depth 30000: a restored-a | b default | snapshot ok | errors parse:RangeError
nested __proto__ own keys after restore: ["__proto__","theme"] | theme dark
written back: {"version":0,"state":{"prefs":{"__proto__":{"polluted":1},"theme":"dark"}}}
field that throws on apply: a 1 | errors ["parse:setter refuses"]

## P5. migrated record written back; debounced save flushed when hidden
after migrate: n 7 | stored {"version":1,"state":{"old":7}}
debounce 10s, pagehide fired: writes 0 | stored null

## P6. cross-tab events
synthetic event without storageArea applied: true
event from another storage area applied: true
event from the configured area applied: true

## P7. devtools
entries sent: ["STORE_UPDATE"]
connect() options: {"name":"p7"}
jump: name b age 1 | sync calls 5 | 'added' in store true | setter calls 1 | when is Date false
jump to a state without age: age 1 | ownKeys ["name","age","when","_level","added"]
edit made in the same tick as a jump sent: false
RESET: name same-tick | inits 1
COMMIT: inits 1
ROLLBACK: name after-commit | inits 1
IMPORT_STATE: name after-commit age 1
jump with nested __proto__: name p

## P8. history: an edit in the same tick as undo()
canRedo after same-tick edit: true
value after redo(): 1
sync subscriber calls for one undo over 3 fields: 3
```

After the combination:

```text
## P1. when hydration happens
count right after persist(): 7 | isHydrated true
count after hydrated: 7
prepareStoreForHydration called after persist(): server snapshot count 7
skipHydration + rehydrate(): count before await 7
after await 7

## P2. nothing is skipped in silence
envelope 5                         count 0 | expired false | errors ["parse: persist(): the stored record is not {version, state}"]
envelope null                      count 0 | expired false | errors ["parse: persist(): the stored record is not {version, state}"]
envelope []                        count 0 | expired false | errors ["parse: persist(): the stored record is not {version, state}"]
state null                         count 0 | expired false | errors ["parse: persist(): the stored record is not {version, state}"]
state [1,2,3]                      count 0 | expired false | errors ["parse: persist(): the stored record is not {version, state}"]
version 1, no migrate              count 0 | expired false | errors ["parse: persist(): the stored record has version 1 and there is no migrate"]
version "2" vs 2, migrate          count 0 | expired false | errors ["parse: persist(): the stored record has a version that is not an integer"]
version missing vs 2, migrate      count 8 | expired false | errors []
async migrate                      count 0 | expired false | errors ["parse: persist(): the stored record was not migrated: migrate must return a plain object"]
migrate returns an array           count 0 | expired false | errors ["parse: persist(): the stored record was not migrated: migrate must return a plain object"]
expireIn, no expiresAt             count 9 | expired false | errors []
expireIn, expiresAt "yesterday"    count 0 | expired false | errors ["parse: persist(): the stored record has an expiresAt that is not a number"]
not JSON                           count 0 | expired false | errors ["parse: JSON Parse error: Expected '}'"]

## P3. options validated when persist() is called
__proto__                            threw TypeError: persist(): cannot persist "__proto__"
constructor                          threw TypeError: persist(): cannot persist "constructor"
getter                               threw TypeError: persist(): cannot persist "doubled"
method                               threw TypeError: persist(): cannot persist "inc"
transform without serialize          threw TypeError: persist(): cannot persist "count"
transform serialize not a function   threw TypeError: persist(): cannot persist "count"

## P4. restore is all or nothing
depth 17000: a default-a | b default | snapshot ok | errors parse:RangeError
depth 30000: a default-a | b default | snapshot ok | errors parse:RangeError
nested __proto__ own keys after restore: ["theme"] | theme dark
written back: {"version":0,"state":{"prefs":{"theme":"dark"}}}
field that throws on apply: persist() threw persist(): cannot persist "b"

## P5. migrated record written back; debounced save flushed when hidden
after migrate: n 7 | stored {"version":2,"state":{"n":7}}
debounce 10s, pagehide fired: writes 1 | stored {"version":0,"state":{"n":5}}

## P6. cross-tab events
synthetic event without storageArea applied: true
event from another storage area applied: false
event from the configured area applied: true

## P7. devtools
entries sent: ["rename","birthday","STORE_UPDATE"]
connect() options: {"name":"p7","maxAge":30}
jump: name b age 1 | sync calls 1 | 'added' in store false | setter calls 0 | when is Date true
jump to a state without age: age undefined | ownKeys ["name"]
edit made in the same tick as a jump sent: true
RESET: name a | inits 2
COMMIT: inits 3
ROLLBACK: name committed | inits 4
IMPORT_STATE: name imported age 9
jump with nested __proto__: name p

## P8. history: an edit in the same tick as undo()
canRedo after same-tick edit: false
value after redo(): 9
sync subscriber calls for one undo over 3 fields: 1
```

`probe.ts` on the combination:

```text
pre-TTL record: n 3 | stored now {"version":0,"state":{"n":3},"expiresAt":1795582453256}
two tabs migrate: a 7 b 7 | writes 1 | stored {"version":2,"state":{"n":7}}
```

## Appendix: patches and scripts

Each applies with `git apply` to a worktree at `74966f1`.

### `p1.patch`: P1

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..5ff9587 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -390,12 +390,16 @@ export function persist<T extends object>(
     const isCurrent = () => !disposed && request === hydrationRequest;
     reading++;
     try {
-      let raw: string | null;
+      let raw: string | null | Promise<string | null>;
       try {
         // A read requested after save()/clear() observes those operations' results.
         if (storageQueue) await storageQueue;
         if (!isCurrent()) return;
-        raw = await storage.getItem(name);
+        raw = storage.getItem(name);
+        // A synchronous storage is restored before persist() returns, so the
+        // first render already shows the stored state.
+        if (typeof (raw as Promise<unknown> | null)?.then === 'function')
+          raw = await raw;
       } catch (error) {
         if (isCurrent()) fail(error, 'read');
         return;
@@ -404,6 +408,7 @@ export function persist<T extends object>(
       // data must not replace current state or clear newer stored data.
       if (!isCurrent()) return;
       if (raw !== null) {
+        raw = raw as string;
         // A debounced local write may be pending from a mutation issued
         // before the data arrived. Fold it into the save that follows the read.
         if (debounceTimer !== null) {
@@ -431,6 +436,11 @@ export function persist<T extends object>(
         succeeded();
       }
     } finally {
+      if (!hydratedFlag) {
+        hydratedFlag = true;
+        resolveHydrated();
+      }
+      status.update(readStatus());
       reading--;
       // Local edits made during the read are saved together with what it restored.
       if (!reading && saveAfterRead) {
@@ -486,13 +496,8 @@ export function persist<T extends object>(
 
   // Kick off initial hydration (unless skipped).
   if (!skipHydration) {
-    void hydrateFromStorage()
-      .catch(() => {})
-      .finally(() => {
-        hydratedFlag = true;
-        status.update(readStatus());
-        resolveHydrated();
-      });
+    // Failures are reported through status and onError.
+    void hydrateFromStorage().catch(() => {});
   }
 
   // ── Build handle ───────────────────────────────────────────────────────
@@ -550,15 +555,7 @@ export function persist<T extends object>(
       assertActive();
       expiredFlag = false;
       status.update(readStatus());
-      try {
-        await hydrateFromStorage();
-      } finally {
-        if (!hydratedFlag) {
-          hydratedFlag = true;
-          resolveHydrated();
-        }
-        status.update(readStatus());
-      }
+      await hydrateFromStorage();
     },
   };
```

### `p2.patch`: P2

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..1d30f5e 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -1,6 +1,6 @@
 import {getVersion, snapshot, subscribe} from '../../storeRuntime';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {findGetterDescriptor, isPlainObject} from '../internal/internal';
 import {createUtilityStatus} from '../utilityStatus/utilityStatus';
 
 import type {
@@ -283,21 +283,19 @@ export function persist<T extends object>(
     baseline = snapshot(proxyStore) as Record<string, unknown>,
   ): boolean {
     const envelope = JSON.parse(raw) as PersistEnvelope;
-
-    if (
-      !envelope ||
-      typeof envelope !== 'object' ||
-      envelope.state === null ||
-      typeof envelope.state !== 'object'
-    ) {
-      return false;
-    }
-
-    // Expiry check — skip hydration if data has expired.
-    if (
-      typeof envelope.expiresAt === 'number' &&
-      Date.now() >= envelope.expiresAt
-    ) {
+    // Every record that cannot be used is reported as 'parse', never skipped.
+    const unreadable: (why: string) => never = (why) => {
+      throw new TypeError(`persist(): the stored record ${why}`);
+    };
+    if (!isPlainObject(envelope) || !isPlainObject(envelope.state))
+      unreadable('is not {version, state}');
+
+    // Expiry check — skip hydration if data has expired. JSON stores an
+    // `expireIn` of Infinity as null; a record from before `expireIn` has none.
+    const {expiresAt} = envelope;
+    if (expiresAt != null && typeof expiresAt !== 'number')
+      unreadable('has an expiresAt that is not a number');
+    if (typeof expiresAt === 'number' && Date.now() >= expiresAt) {
       expiredFlag = true;
       return true;
     }
@@ -305,13 +303,18 @@ export function persist<T extends object>(
     let {state} = envelope;
 
     // Data stored under another schema version is usable only through
-    // `migrate`. Without one, the store keeps its current state. A record
-    // with no version counts as the default, version 0.
-    const storedVersion =
-      typeof envelope.version === 'number' ? envelope.version : 0;
+    // `migrate`. A record with no version counts as the default, version 0;
+    // any other version must be an integer.
+    const storedVersion = envelope.version ?? 0;
+    if (!Number.isInteger(storedVersion))
+      unreadable('has a version that is not an integer');
     if (storedVersion !== version) {
-      if (!migrate) return false;
+      if (!migrate)
+        unreadable(`has version ${storedVersion} and there is no migrate`);
       state = migrate(state, storedVersion);
+      // A promise, an array or null is not a state.
+      if (!isPlainObject(state))
+        unreadable('was not migrated: migrate must return a plain object');
     }
 
     const startVersion = getVersion(proxyStore);
```

### `p3.patch`: P3, one message

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..df2f3de 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -1,6 +1,9 @@
 import {getVersion, snapshot, subscribe} from '../../storeRuntime';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {
+  findGetterDescriptor,
+  findPropertyDescriptor,
+} from '../internal/internal';
 import {createUtilityStatus} from '../utilityStatus/utilityStatus';
 
 import type {
@@ -22,22 +25,13 @@ type PersistEnvelope = {
 
 // ── Helpers ──────────────────────────────────────────────────────────────────
 
-/** Check if a value is a PropertyTransform descriptor (has `key` + `serialize`). */
-function isTransform<T extends object>(
-  entry: keyof T | PropertyTransform<T>,
-): entry is PropertyTransform<T> {
-  return (
-    typeof entry === 'object' &&
-    entry !== null &&
-    'key' in entry &&
-    'serialize' in entry
-  );
-}
-
 /**
  * Build the normalized list of property keys and their optional transforms.
  * If `properties` is not provided, defaults to all own enumerable data properties
  * of the store (excluding getters and methods).
+ *
+ * An explicit list is checked here, once: an entry that names an accessor, a
+ * method or a prototype key, or a transform without both functions, throws.
  */
 function resolveProperties<T extends object>(
   proxyStore: T,
@@ -45,10 +39,28 @@ function resolveProperties<T extends object>(
 ): Array<{key: string; transform?: PropertyTransform<T>}> {
   if (properties) {
     return properties.map((entry) => {
-      if (isTransform(entry)) {
-        return {key: entry.key as string, transform: entry};
-      }
-      return {key: entry as string};
+      const transform =
+        typeof entry === 'object' && entry !== null ? entry : undefined;
+      const key = transform ? transform.key : entry;
+      const descriptor =
+        typeof key === 'string'
+          ? findPropertyDescriptor(proxyStore, key)
+          : undefined;
+      if (
+        (transform &&
+          (typeof transform.serialize !== 'function' ||
+            typeof transform.deserialize !== 'function')) ||
+        typeof key !== 'string' ||
+        key === '__proto__' ||
+        key === 'constructor' ||
+        key === 'prototype' ||
+        descriptor?.get ||
+        descriptor?.set ||
+        typeof (proxyStore as Record<string, unknown>)[key] === 'function'
+      )
+        // A key must name a data field; a transform needs both functions.
+        throw new TypeError(`persist(): cannot persist "${String(key)}"`);
+      return {key, transform};
     });
   }
```

### `p3-two-messages.patch`: P3, two messages

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..a193b5b 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -1,6 +1,9 @@
 import {getVersion, snapshot, subscribe} from '../../storeRuntime';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {
+  findGetterDescriptor,
+  findPropertyDescriptor,
+} from '../internal/internal';
 import {createUtilityStatus} from '../utilityStatus/utilityStatus';
 
 import type {
@@ -22,22 +25,13 @@ type PersistEnvelope = {
 
 // ── Helpers ──────────────────────────────────────────────────────────────────
 
-/** Check if a value is a PropertyTransform descriptor (has `key` + `serialize`). */
-function isTransform<T extends object>(
-  entry: keyof T | PropertyTransform<T>,
-): entry is PropertyTransform<T> {
-  return (
-    typeof entry === 'object' &&
-    entry !== null &&
-    'key' in entry &&
-    'serialize' in entry
-  );
-}
-
 /**
  * Build the normalized list of property keys and their optional transforms.
  * If `properties` is not provided, defaults to all own enumerable data properties
  * of the store (excluding getters and methods).
+ *
+ * An explicit list is checked here, once: an entry that names an accessor, a
+ * method or a prototype key, or a transform without both functions, throws.
  */
 function resolveProperties<T extends object>(
   proxyStore: T,
@@ -45,10 +39,32 @@ function resolveProperties<T extends object>(
 ): Array<{key: string; transform?: PropertyTransform<T>}> {
   if (properties) {
     return properties.map((entry) => {
-      if (isTransform(entry)) {
-        return {key: entry.key as string, transform: entry};
-      }
-      return {key: entry as string};
+      const transform =
+        typeof entry === 'object' && entry !== null ? entry : undefined;
+      const key = transform ? transform.key : entry;
+      if (
+        transform &&
+        (typeof transform.serialize !== 'function' ||
+          typeof transform.deserialize !== 'function')
+      )
+        throw new TypeError(
+          `persist(): the entry for "${String(key)}" needs both serialize and deserialize`,
+        );
+      const descriptor =
+        typeof key === 'string' ? findPropertyDescriptor(proxyStore, key) : undefined;
+      if (
+        typeof key !== 'string' ||
+        key === '__proto__' ||
+        key === 'constructor' ||
+        key === 'prototype' ||
+        descriptor?.get ||
+        descriptor?.set ||
+        typeof (proxyStore as Record<string, unknown>)[key] === 'function'
+      )
+        throw new TypeError(
+          `persist(): "${String(key)}" is not a data field and cannot be persisted`,
+        );
+      return {key, transform};
     });
   }
```

### `p4.patch`: P4

```diff
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..214810e 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,10 +1,15 @@
 import {originalSnapshotAccessor} from '../../storeRuntime';
 import {canProxy} from '../internal/internal';
 
-/** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
+/**
+ * Restore proxyable snapshot data as mutable objects, preserving prototypes.
+ * With `untrusted`, an own `__proto__` key is dropped at every depth: data
+ * read from storage or DevTools must not carry one back into the store.
+ */
 export function cloneSnapshotValue(
   value: unknown,
   clones: WeakMap<object, object>,
+  untrusted?: boolean,
 ): unknown {
   // Match snapshot leaf semantics: opaque values and functions pass through.
   if (!canProxy(value)) return value;
@@ -21,6 +26,7 @@ export function cloneSnapshotValue(
 
   for (const key of Reflect.ownKeys(value)) {
     if (Array.isArray(value) && key === 'length') continue;
+    if (untrusted && key === '__proto__') continue;
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     if (!descriptor) continue;
     if (!('value' in descriptor)) {
@@ -34,7 +40,7 @@ export function cloneSnapshotValue(
       continue;
     }
     Object.defineProperty(clone, key, {
-      value: cloneSnapshotValue(descriptor.value, clones),
+      value: cloneSnapshotValue(descriptor.value, clones, untrusted),
       enumerable: descriptor.enumerable,
       configurable: true,
       writable: true,
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..1144235 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -1,4 +1,4 @@
-import {getVersion, snapshot, subscribe} from '../../storeRuntime';
+import {batch, getVersion, snapshot, subscribe} from '../../storeRuntime';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
 import {findGetterDescriptor} from '../internal/internal';
 import {createUtilityStatus} from '../utilityStatus/utilityStatus';
@@ -353,28 +353,50 @@ export function persist<T extends object>(
       }
     }
 
+    // Copy every value before writing any, so a value that cannot be copied
+    // (too deep, say) leaves the store untouched.
+    const values = new Map<string, unknown>();
+    for (const key of pending)
+      values.set(key, cloneSnapshotValue(merged[key], clones, true));
+    const written: string[] = [];
+
     try {
-      // The cached snapshot keeps its identity until something changes, so
-      // this also covers edits made by `migrate`, a transform or `merge`.
-      if (snapshot(proxyStore) !== baseline) discardEditedFields();
-      for (const key of pending) {
-        pending.delete(key);
-        const before = getVersion(proxyStore);
-        (proxyStore as Record<string, unknown>)[key] = cloneSnapshotValue(
-          merged[key],
-          clones,
-        );
-        const after = getVersion(proxyStore);
-        if (after === before) continue;
-        expectedVersion++;
-        // Applying another stored field after clear() is still part of this
-        // restore. A later subscriber/user edit has its own revision.
-        if (clearedVersion === before && after === before + 1)
-          clearedVersion = after;
-        // A direct data-field assignment adds one revision. Any additional
-        // revision came from user code and must survive the rest of this pass.
-        if (after > before + 1 && pending.size) discardEditedFields();
-      }
+      // One transaction: a synchronous subscriber hears the restore once.
+      batch(() => {
+        // The cached snapshot keeps its identity until something changes, so
+        // this also covers edits made by `migrate`, a transform or `merge`.
+        if (snapshot(proxyStore) !== baseline) discardEditedFields();
+        try {
+          for (const key of pending) {
+            pending.delete(key);
+            const before = getVersion(proxyStore);
+            (proxyStore as Record<string, unknown>)[key] = values.get(key);
+            written.push(key);
+            const after = getVersion(proxyStore);
+            if (after === before) continue;
+            expectedVersion++;
+            // Applying another stored field after clear() is still part of this
+            // restore. A later subscriber/user edit has its own revision.
+            if (clearedVersion === before && after === before + 1)
+              clearedVersion = after;
+            // A direct data-field assignment adds one revision. Any additional
+            // revision came from user code and must survive the rest of this pass.
+            if (after > before + 1 && pending.size) discardEditedFields();
+          }
+          // A record the store can hold but not snapshot would break every
+          // read and every save. Put the fields back and report it instead.
+          snapshot(proxyStore);
+        } catch (error) {
+          const live = proxyStore as Record<string, unknown>;
+          for (const key of written) {
+            if (Object.hasOwn(current, key))
+              live[key] = cloneSnapshotValue(current[key], new WeakMap());
+            else delete live[key];
+          }
+          expectedVersion = getVersion(proxyStore);
+          throw error;
+        }
+      });
     } finally {
       skipAutoSaveVersion = expectedVersion;
     }
```

### `p5.patch`: P5

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..8a3ac67 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -127,6 +127,8 @@ export function persist<T extends object>(
   let storageQueue: Promise<void> | undefined;
   let skipAutoSaveVersion: number | undefined;
   let clearedVersion: number | undefined;
+  // Set when a read restored a record through `migrate`.
+  let migrated = false;
   let lastError: PersistStatus['lastError'] = null;
   const readStatus = (): PersistStatus => ({
     isHydrated: hydratedFlag,
@@ -312,6 +314,7 @@ export function persist<T extends object>(
     if (storedVersion !== version) {
       if (!migrate) return false;
       state = migrate(state, storedVersion);
+      migrated = true;
     }
 
     const startVersion = getVersion(proxyStore);
@@ -412,11 +415,14 @@ export function persist<T extends object>(
           saveAfterRead = true;
         }
         let expired: boolean;
+        migrated = false;
         try {
           expired = applyPersistedState(raw, baseline);
         } catch (error) {
           fail(error, 'parse');
         }
+        // Store the migrated record, so the next load does not migrate again.
+        if (migrated) saveAfterRead = true;
         if (expired && clearOnExpire) {
           const removal = enqueueStorageMutation(
             () => storage.removeItem(name),
@@ -481,6 +487,23 @@ export function persist<T extends object>(
     globalThis.addEventListener('storage', onStorageEvent);
   }
 
+  /** A debounced save still waiting when the page is hidden is written now. */
+  function onHide(event: Event): void {
+    if (
+      debounceTimer !== null &&
+      (event.type === 'pagehide' ||
+        globalThis.document?.visibilityState === 'hidden')
+    ) {
+      clearTimeout(debounceTimer);
+      debounceTimer = null;
+      autoSave();
+    }
+  }
+  if (debounceMs > 0) {
+    globalThis.addEventListener?.('pagehide', onHide);
+    globalThis.addEventListener?.('visibilitychange', onHide);
+  }
+
   // Subscribe to store mutations.
   const unsubscribeFromStore = subscribe(proxyStore, scheduleWrite);
 
@@ -506,6 +529,10 @@ export function persist<T extends object>(
     }
     unsubscribeFromStore();
     if (syncTabs) globalThis.removeEventListener('storage', onStorageEvent);
+    if (debounceMs > 0) {
+      globalThis.removeEventListener?.('pagehide', onHide);
+      globalThis.removeEventListener?.('visibilitychange', onHide);
+    }
     status.dispose(readStatus());
   }
```

### `p6.patch`: P6, the narrow form

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..14a1ed5 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -447,10 +447,20 @@ export function persist<T extends object>(
     if (disposed) return;
     if (event.key !== name) return;
     if (event.newValue === null) return; // cleared
-    // Delivery is asynchronous: another tab or a local save may have already
-    // replaced this event's value. Do not roll the UI back to an obsolete value.
-    if (event.storageArea && event.storageArea.getItem(name) !== event.newValue)
-      return;
+    const area = event.storageArea;
+    if (area) {
+      // The same key in another area (sessionStorage, say) is not this record.
+      // A wrapper around localStorage cannot be compared, so only a Storage is.
+      if (
+        area !== storage &&
+        typeof Storage !== 'undefined' &&
+        storage instanceof Storage
+      )
+        return;
+      // Delivery is asynchronous: another tab or a local save may have already
+      // replaced this event's value. Do not roll the UI back to an obsolete value.
+      if (area.getItem(name) !== event.newValue) return;
+    }
     hydrationRequest++;
     // A pending local debounced write would otherwise overwrite the remote
     // state once its timer fires.
```

### `p6-strict.patch`: P6, the strict form (not recommended)

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..15f64b0 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -446,10 +446,19 @@ export function persist<T extends object>(
   function onStorageEvent(event: StorageEvent): void {
     if (disposed) return;
     if (event.key !== name) return;
-    if (event.newValue === null) return; // cleared
-    // Delivery is asynchronous: another tab or a local save may have already
-    // replaced this event's value. Do not roll the UI back to an obsolete value.
-    if (event.storageArea && event.storageArea.getItem(name) !== event.newValue)
+    const area = event.storageArea;
+    if (
+      event.newValue === null || // cleared
+      // A browser always names the area. An event without one was made by a
+      // script, and one from another area is not this record.
+      !area ||
+      (area !== storage &&
+        typeof Storage !== 'undefined' &&
+        storage instanceof Storage) ||
+      // Delivery is asynchronous: another tab or a local save may have already
+      // replaced this event's value. Do not roll the UI back to an obsolete value.
+      area.getItem(name) !== event.newValue
+    )
       return;
     hydrationRequest++;
     // A pending local debounced write would otherwise overwrite the remote
```

### `p7.patch`: P7

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..b1b9c22 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -267,15 +267,24 @@ function transactional(
   return function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
     if (new.target) return Reflect.construct(method, args);
+    // The outermost call names the transaction for its sync subscribers.
+    const outer = currentAction;
+    currentAction ??= method.name;
     transactionDepth++;
     try {
       return Reflect.apply(method, receiver, args);
     } finally {
       settleTransaction();
+      currentAction = outer;
     }
   };
 }
 
+let currentAction: string | undefined;
+
+/** @internal The outermost store method running now, for `devtools`. */
+export const actionName = (): string | undefined => currentAction;
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..63931b6 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -1,6 +1,7 @@
 // Both package formats resolve this peer-free entry through #store-runtime.
 export {createProxy, isChanged} from 'proxy-compare';
 export {
+  actionName,
   batch,
   createClassyStore,
   getInternal,
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..7e73592 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,10 +1,15 @@
-import {originalSnapshotAccessor} from '../../storeRuntime';
-import {canProxy} from '../internal/internal';
+import {batch, originalSnapshotAccessor, snapshot} from '../../storeRuntime';
+import {canProxy, findPropertyDescriptor} from '../internal/internal';
 
-/** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
+/**
+ * Restore proxyable snapshot data as mutable objects, preserving prototypes.
+ * With `untrusted`, an own `__proto__` key is dropped at every depth: data
+ * read from storage or DevTools must not carry one back into the store.
+ */
 export function cloneSnapshotValue(
   value: unknown,
   clones: WeakMap<object, object>,
+  untrusted?: boolean,
 ): unknown {
   // Match snapshot leaf semantics: opaque values and functions pass through.
   if (!canProxy(value)) return value;
@@ -21,6 +26,7 @@ export function cloneSnapshotValue(
 
   for (const key of Reflect.ownKeys(value)) {
     if (Array.isArray(value) && key === 'length') continue;
+    if (untrusted && key === '__proto__') continue;
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     if (!descriptor) continue;
     if (!('value' in descriptor)) {
@@ -34,7 +40,7 @@ export function cloneSnapshotValue(
       continue;
     }
     Object.defineProperty(clone, key, {
-      value: cloneSnapshotValue(descriptor.value, clones),
+      value: cloneSnapshotValue(descriptor.value, clones, untrusted),
       enumerable: descriptor.enumerable,
       configurable: true,
       writable: true,
@@ -43,3 +49,44 @@ export function cloneSnapshotValue(
 
   return clone;
 }
+
+/** Accessors and methods are behaviour, not state; applying leaves them alone. */
+export function isDataKey(store: object, key: string): boolean {
+  const descriptor = findPropertyDescriptor(store, key);
+  return (
+    !descriptor?.get &&
+    !descriptor?.set &&
+    typeof (store as Record<string, unknown>)[key] !== 'function'
+  );
+}
+
+/**
+ * Make the store's data fields match `state`, as one transaction: a data
+ * field missing from `state` is deleted, a branch that is already the same
+ * snapshot is left alone, and every other branch is replaced with a copy.
+ */
+export function applyState(
+  store: object,
+  state: Record<string, unknown>,
+  untrusted?: boolean,
+): void {
+  const live = store as Record<string, unknown>;
+  const current = snapshot(store) as Record<string, unknown>;
+  const clones = new WeakMap<object, object>();
+  batch(() => {
+    // A field added after this state was taken did not exist in it.
+    for (const key of Object.keys(current)) {
+      if (!Object.hasOwn(state, key) && isDataKey(store, key)) delete live[key];
+    }
+    for (const key of Object.keys(state)) {
+      if (key === '__proto__' || !isDataKey(store, key)) continue;
+      // Data from outside may not add a field the store does not have.
+      if (untrusted && !Object.hasOwn(current, key)) continue;
+      // An untouched branch still has this exact snapshot. Leaving it alone
+      // keeps its identity, so selectors reading it stay quiet.
+      if (Object.hasOwn(current, key) && Object.is(current[key], state[key]))
+        continue;
+      live[key] = cloneSnapshotValue(state[key], clones, untrusted);
+    }
+  });
+}
diff --git a/packages/classy-store/src/utils/devtools/devtools.ts b/packages/classy-store/src/utils/devtools/devtools.ts
index cc5544a..5bb8a20 100644
--- a/packages/classy-store/src/utils/devtools/devtools.ts
+++ b/packages/classy-store/src/utils/devtools/devtools.ts
@@ -1,22 +1,26 @@
-import {snapshot, subscribe} from '../../storeRuntime';
-import {findGetterDescriptor} from '../internal/internal';
+import {actionName, snapshot, subscribe} from '../../storeRuntime';
+import {applyState} from '../cloneSnapshot/cloneSnapshot';
 
 // ── Redux DevTools types (minimal subset) ────────────────────────────────────
 
 type DevToolsMessage = {
   type: string;
-  payload?: {type?: string};
+  payload?: {
+    type?: string;
+    actionId?: number;
+    nextLiftedState?: {computedStates?: Array<{state?: unknown}>};
+  };
   state?: string;
 };
 
 type DevToolsConnection = {
   init: (state: unknown) => void;
-  send: (action: string | {type: string}, state: unknown) => void;
+  send: (action: string | {type: string} | null, state: unknown) => void;
   subscribe: (listener: (message: DevToolsMessage) => void) => () => void;
 };
 
 type DevToolsExtension = {
-  connect: (options?: {name?: string}) => DevToolsConnection;
+  connect: (options?: Record<string, unknown>) => DevToolsConnection;
 };
 
 // Read the extension through a local type. Declaring it on the global `Window`
@@ -30,6 +34,13 @@ export type DevtoolsOptions = {
   name?: string;
   /** Set to `false` to disable the integration (returns an inert handle). Defaults to `true`. */
   enabled?: boolean;
+  /** Entries the extension keeps, and states kept here for an exact jump. Defaults to 50. */
+  maxAge?: number;
+  /** Passed to the extension's `connect()` as they are. */
+  trace?: boolean;
+  traceLimit?: number;
+  actionsDenylist?: string | string[];
+  actionsAllowlist?: string | string[];
 };
 
 export type DevtoolsHandle = {
@@ -42,9 +53,10 @@ export type DevtoolsHandle = {
 /**
  * Connect a store proxy to Redux DevTools for state inspection and time-travel debugging.
  *
- * Uses `subscribe()` + `snapshot()` to send state on each change.
- * Listens for `DISPATCH` messages (`JUMP_TO_STATE`, `JUMP_TO_ACTION`) and applies
- * the received state back to the store proxy, skipping getters and methods.
+ * Each outermost store method sends one entry named after the method. Direct
+ * writes made in one task send one `STORE_UPDATE` entry. A jump, `RESET`,
+ * `ROLLBACK` and `IMPORT_STATE` replace the store's data fields in one
+ * transaction, as `withHistory` does, and never call an accessor or method.
  *
  * @param proxyStore - A reactive proxy created by `createClassyStore()`.
  * @param options - Optional configuration.
@@ -54,7 +66,8 @@ export function devtools<T extends object>(
   proxyStore: T,
   options?: DevtoolsOptions,
 ): DevtoolsHandle {
-  const {name = 'ClassyStore', enabled = true} = options ?? {};
+  const {enabled = true, ...connectOptions} = options ?? {};
+  const maxAge = connectOptions.maxAge ?? 50;
 
   const extension =
     enabled && typeof window !== 'undefined'
@@ -63,51 +76,112 @@ export function devtools<T extends object>(
   // Guard: no extension or disabled
   if (!extension) return {dispose() {}};
 
-  const connection = extension.connect({name});
-
-  // Send initial state
-  connection.init(snapshot(proxyStore));
-
-  // Track whether we're currently applying time-travel state to avoid
-  // re-sending the state we just applied.
-  let isTimeTraveling = false;
-
-  // Subscribe to store mutations → send to DevTools
-  const unsubscribeFromStore = subscribe(proxyStore, () => {
-    if (isTimeTraveling) return;
-    connection.send({type: 'STORE_UPDATE'}, snapshot(proxyStore));
+  const connection = extension.connect({
+    name: 'ClassyStore',
+    ...connectOptions,
   });
 
-  // Listen for DevTools dispatches (time-travel)
+  // States sent, by the id the extension gives each entry, so a jump restores
+  // the exact snapshot (a Date stays a Date) and not its JSON.
+  const sentStates = new Map<number, object>();
+  let nextId = 0;
+  let initialState: object;
+  function init(state: object) {
+    initialState = state;
+    sentStates.clear();
+    sentStates.set(0, state);
+    nextId = 1;
+    connection.init(state);
+  }
+  init(snapshot(proxyStore));
+
+  function send(type: string) {
+    const state = snapshot(proxyStore);
+    sentStates.set(nextId, state);
+    sentStates.delete(nextId - maxAge - 1);
+    nextId++;
+    connection.send({type}, state);
+  }
+
+  let applying = false;
+  let directWrites = false;
+  const unsubscribeFromStore = subscribe(
+    proxyStore,
+    () => {
+      if (applying) return;
+      const name = actionName();
+      if (name) {
+        // A direct write still waiting in this task is part of this entry.
+        directWrites = false;
+        send(name);
+        return;
+      }
+      // Direct writes outside a method: one entry per task, so a loop of
+      // writes takes one snapshot and not one per write.
+      if (directWrites) return;
+      directWrites = true;
+      queueMicrotask(() => {
+        if (!directWrites) return;
+        directWrites = false;
+        send('STORE_UPDATE');
+      });
+    },
+    {sync: true},
+  );
+
+  function apply(state: unknown, trusted: boolean) {
+    if (typeof state !== 'object' || state === null || Array.isArray(state))
+      return;
+    applying = true;
+    try {
+      applyState(proxyStore, state as Record<string, unknown>, !trusted);
+    } finally {
+      applying = false;
+    }
+  }
+
+  function parse(text: string | undefined): unknown {
+    if (typeof text !== 'string') return undefined;
+    try {
+      return JSON.parse(text);
+    } catch {
+      // A malformed message changes nothing.
+      return undefined;
+    }
+  }
+
   const devToolsUnsub = connection.subscribe((message: DevToolsMessage) => {
-    if (message.type === 'DISPATCH' && message.state) {
-      const payloadType = message.payload?.type;
-      if (payloadType === 'JUMP_TO_STATE' || payloadType === 'JUMP_TO_ACTION') {
-        try {
-          const newState = JSON.parse(message.state) as Record<string, unknown>;
-          isTimeTraveling = true;
-
-          // Apply state back to the proxy, skipping getters and methods
-          for (const key of Object.keys(newState)) {
-            // Skip getters
-            if (findGetterDescriptor(proxyStore, key)?.get) continue;
-            // Skip methods
-            if (
-              typeof (proxyStore as Record<string, unknown>)[key] === 'function'
-            ) {
-              continue;
-            }
-            (proxyStore as Record<string, unknown>)[key] = newState[key];
-          }
-        } catch {
-          // JSON.parse or property assignment failed — ignore.
-        } finally {
-          // Reset after microtask so the batched subscription callback
-          // (which fires via queueMicrotask) still sees the flag as true.
-          queueMicrotask(() => {
-            isTimeTraveling = false;
-          });
-        }
+    if (message.type !== 'DISPATCH') return;
+    const payload = message.payload ?? {};
+    switch (payload.type) {
+      case 'JUMP_TO_STATE':
+      case 'JUMP_TO_ACTION': {
+        const kept =
+          typeof payload.actionId === 'number'
+            ? sentStates.get(payload.actionId)
+            : undefined;
+        if (kept) apply(kept, true);
+        else apply(parse(message.state), false);
+        return;
+      }
+      case 'RESET':
+        apply(initialState, true);
+        init(snapshot(proxyStore));
+        return;
+      case 'COMMIT':
+        init(snapshot(proxyStore));
+        return;
+      case 'ROLLBACK':
+        apply(parse(message.state), false);
+        init(snapshot(proxyStore));
+        return;
+      case 'IMPORT_STATE': {
+        const lifted = payload.nextLiftedState;
+        const states = lifted?.computedStates ?? [];
+        apply(states[states.length - 1]?.state, false);
+        sentStates.clear();
+        connection.send(null, lifted);
+        return;
       }
     }
   });
```

### `p8.patch`: P8

```diff
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index 8f690c2..e762df3 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -1,4 +1,4 @@
-import {getVersion, snapshot, subscribe} from '../../storeRuntime';
+import {batch, getVersion, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
 import {findGetterDescriptor} from '../internal/internal';
@@ -61,7 +61,6 @@ export function withHistory<T extends object>(
   const history: Snapshot<T>[] = [snapshot(proxyStore)];
   let pointer = 0;
   let paused = false;
-  let restoring = 0;
   let disposed = false;
   const status = createUtilityStatus<HistoryStatus>({
     canUndo: false,
@@ -129,22 +128,19 @@ export function withHistory<T extends object>(
   /** Move to another entry without recording the move itself. */
   function restore(target: number): void {
     pointer = target;
-    restoring++;
     try {
-      applySnapshot(history[pointer]);
+      // One transaction: a synchronous subscriber hears once per step.
+      batch(() => applySnapshot(history[pointer]));
     } finally {
+      // The restore's own notification finds this revision and records nothing.
       recordedVersion = getVersion(proxyStore);
-      // The store's batched notification for this restore runs first.
-      queueMicrotask(() => {
-        restoring--;
-      });
       status.update(readStatus());
     }
   }
 
   // Subscribe to store mutations
   const unsubscribeFromStore = subscribe(proxyStore, () => {
-    if (paused || restoring > 0 || disposed) return;
+    if (paused || disposed) return;
     // undo() may already have recorded this revision ahead of the notification.
     if (getVersion(proxyStore) === recordedVersion) return;
     record();
```

### `p8a-no-counter.patch`: P8, the counter alone

```diff
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index 8f690c2..3620a7c 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -61,7 +61,6 @@ export function withHistory<T extends object>(
   const history: Snapshot<T>[] = [snapshot(proxyStore)];
   let pointer = 0;
   let paused = false;
-  let restoring = 0;
   let disposed = false;
   const status = createUtilityStatus<HistoryStatus>({
     canUndo: false,
@@ -129,22 +128,18 @@ export function withHistory<T extends object>(
   /** Move to another entry without recording the move itself. */
   function restore(target: number): void {
     pointer = target;
-    restoring++;
     try {
       applySnapshot(history[pointer]);
     } finally {
+      // The restore's own notification finds this revision and records nothing.
       recordedVersion = getVersion(proxyStore);
-      // The store's batched notification for this restore runs first.
-      queueMicrotask(() => {
-        restoring--;
-      });
       status.update(readStatus());
     }
   }
 
   // Subscribe to store mutations
   const unsubscribeFromStore = subscribe(proxyStore, () => {
-    if (paused || restoring > 0 || disposed) return;
+    if (paused || disposed) return;
     // undo() may already have recorded this revision ahead of the notification.
     if (getVersion(proxyStore) === recordedVersion) return;
     record();
```

### `combo.patch`: The combination, against `74966f1`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..b1b9c22 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -267,15 +267,24 @@ function transactional(
   return function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
     if (new.target) return Reflect.construct(method, args);
+    // The outermost call names the transaction for its sync subscribers.
+    const outer = currentAction;
+    currentAction ??= method.name;
     transactionDepth++;
     try {
       return Reflect.apply(method, receiver, args);
     } finally {
       settleTransaction();
+      currentAction = outer;
     }
   };
 }
 
+let currentAction: string | undefined;
+
+/** @internal The outermost store method running now, for `devtools`. */
+export const actionName = (): string | undefined => currentAction;
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..63931b6 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -1,6 +1,7 @@
 // Both package formats resolve this peer-free entry through #store-runtime.
 export {createProxy, isChanged} from 'proxy-compare';
 export {
+  actionName,
   batch,
   createClassyStore,
   getInternal,
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index bc200bd..7e73592 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,10 +1,15 @@
-import {originalSnapshotAccessor} from '../../storeRuntime';
-import {canProxy} from '../internal/internal';
+import {batch, originalSnapshotAccessor, snapshot} from '../../storeRuntime';
+import {canProxy, findPropertyDescriptor} from '../internal/internal';
 
-/** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
+/**
+ * Restore proxyable snapshot data as mutable objects, preserving prototypes.
+ * With `untrusted`, an own `__proto__` key is dropped at every depth: data
+ * read from storage or DevTools must not carry one back into the store.
+ */
 export function cloneSnapshotValue(
   value: unknown,
   clones: WeakMap<object, object>,
+  untrusted?: boolean,
 ): unknown {
   // Match snapshot leaf semantics: opaque values and functions pass through.
   if (!canProxy(value)) return value;
@@ -21,6 +26,7 @@ export function cloneSnapshotValue(
 
   for (const key of Reflect.ownKeys(value)) {
     if (Array.isArray(value) && key === 'length') continue;
+    if (untrusted && key === '__proto__') continue;
     const descriptor = Object.getOwnPropertyDescriptor(value, key);
     if (!descriptor) continue;
     if (!('value' in descriptor)) {
@@ -34,7 +40,7 @@ export function cloneSnapshotValue(
       continue;
     }
     Object.defineProperty(clone, key, {
-      value: cloneSnapshotValue(descriptor.value, clones),
+      value: cloneSnapshotValue(descriptor.value, clones, untrusted),
       enumerable: descriptor.enumerable,
       configurable: true,
       writable: true,
@@ -43,3 +49,44 @@ export function cloneSnapshotValue(
 
   return clone;
 }
+
+/** Accessors and methods are behaviour, not state; applying leaves them alone. */
+export function isDataKey(store: object, key: string): boolean {
+  const descriptor = findPropertyDescriptor(store, key);
+  return (
+    !descriptor?.get &&
+    !descriptor?.set &&
+    typeof (store as Record<string, unknown>)[key] !== 'function'
+  );
+}
+
+/**
+ * Make the store's data fields match `state`, as one transaction: a data
+ * field missing from `state` is deleted, a branch that is already the same
+ * snapshot is left alone, and every other branch is replaced with a copy.
+ */
+export function applyState(
+  store: object,
+  state: Record<string, unknown>,
+  untrusted?: boolean,
+): void {
+  const live = store as Record<string, unknown>;
+  const current = snapshot(store) as Record<string, unknown>;
+  const clones = new WeakMap<object, object>();
+  batch(() => {
+    // A field added after this state was taken did not exist in it.
+    for (const key of Object.keys(current)) {
+      if (!Object.hasOwn(state, key) && isDataKey(store, key)) delete live[key];
+    }
+    for (const key of Object.keys(state)) {
+      if (key === '__proto__' || !isDataKey(store, key)) continue;
+      // Data from outside may not add a field the store does not have.
+      if (untrusted && !Object.hasOwn(current, key)) continue;
+      // An untouched branch still has this exact snapshot. Leaving it alone
+      // keeps its identity, so selectors reading it stay quiet.
+      if (Object.hasOwn(current, key) && Object.is(current[key], state[key]))
+        continue;
+      live[key] = cloneSnapshotValue(state[key], clones, untrusted);
+    }
+  });
+}
diff --git a/packages/classy-store/src/utils/devtools/devtools.ts b/packages/classy-store/src/utils/devtools/devtools.ts
index cc5544a..5bb8a20 100644
--- a/packages/classy-store/src/utils/devtools/devtools.ts
+++ b/packages/classy-store/src/utils/devtools/devtools.ts
@@ -1,22 +1,26 @@
-import {snapshot, subscribe} from '../../storeRuntime';
-import {findGetterDescriptor} from '../internal/internal';
+import {actionName, snapshot, subscribe} from '../../storeRuntime';
+import {applyState} from '../cloneSnapshot/cloneSnapshot';
 
 // ── Redux DevTools types (minimal subset) ────────────────────────────────────
 
 type DevToolsMessage = {
   type: string;
-  payload?: {type?: string};
+  payload?: {
+    type?: string;
+    actionId?: number;
+    nextLiftedState?: {computedStates?: Array<{state?: unknown}>};
+  };
   state?: string;
 };
 
 type DevToolsConnection = {
   init: (state: unknown) => void;
-  send: (action: string | {type: string}, state: unknown) => void;
+  send: (action: string | {type: string} | null, state: unknown) => void;
   subscribe: (listener: (message: DevToolsMessage) => void) => () => void;
 };
 
 type DevToolsExtension = {
-  connect: (options?: {name?: string}) => DevToolsConnection;
+  connect: (options?: Record<string, unknown>) => DevToolsConnection;
 };
 
 // Read the extension through a local type. Declaring it on the global `Window`
@@ -30,6 +34,13 @@ export type DevtoolsOptions = {
   name?: string;
   /** Set to `false` to disable the integration (returns an inert handle). Defaults to `true`. */
   enabled?: boolean;
+  /** Entries the extension keeps, and states kept here for an exact jump. Defaults to 50. */
+  maxAge?: number;
+  /** Passed to the extension's `connect()` as they are. */
+  trace?: boolean;
+  traceLimit?: number;
+  actionsDenylist?: string | string[];
+  actionsAllowlist?: string | string[];
 };
 
 export type DevtoolsHandle = {
@@ -42,9 +53,10 @@ export type DevtoolsHandle = {
 /**
  * Connect a store proxy to Redux DevTools for state inspection and time-travel debugging.
  *
- * Uses `subscribe()` + `snapshot()` to send state on each change.
- * Listens for `DISPATCH` messages (`JUMP_TO_STATE`, `JUMP_TO_ACTION`) and applies
- * the received state back to the store proxy, skipping getters and methods.
+ * Each outermost store method sends one entry named after the method. Direct
+ * writes made in one task send one `STORE_UPDATE` entry. A jump, `RESET`,
+ * `ROLLBACK` and `IMPORT_STATE` replace the store's data fields in one
+ * transaction, as `withHistory` does, and never call an accessor or method.
  *
  * @param proxyStore - A reactive proxy created by `createClassyStore()`.
  * @param options - Optional configuration.
@@ -54,7 +66,8 @@ export function devtools<T extends object>(
   proxyStore: T,
   options?: DevtoolsOptions,
 ): DevtoolsHandle {
-  const {name = 'ClassyStore', enabled = true} = options ?? {};
+  const {enabled = true, ...connectOptions} = options ?? {};
+  const maxAge = connectOptions.maxAge ?? 50;
 
   const extension =
     enabled && typeof window !== 'undefined'
@@ -63,51 +76,112 @@ export function devtools<T extends object>(
   // Guard: no extension or disabled
   if (!extension) return {dispose() {}};
 
-  const connection = extension.connect({name});
-
-  // Send initial state
-  connection.init(snapshot(proxyStore));
-
-  // Track whether we're currently applying time-travel state to avoid
-  // re-sending the state we just applied.
-  let isTimeTraveling = false;
-
-  // Subscribe to store mutations → send to DevTools
-  const unsubscribeFromStore = subscribe(proxyStore, () => {
-    if (isTimeTraveling) return;
-    connection.send({type: 'STORE_UPDATE'}, snapshot(proxyStore));
+  const connection = extension.connect({
+    name: 'ClassyStore',
+    ...connectOptions,
   });
 
-  // Listen for DevTools dispatches (time-travel)
+  // States sent, by the id the extension gives each entry, so a jump restores
+  // the exact snapshot (a Date stays a Date) and not its JSON.
+  const sentStates = new Map<number, object>();
+  let nextId = 0;
+  let initialState: object;
+  function init(state: object) {
+    initialState = state;
+    sentStates.clear();
+    sentStates.set(0, state);
+    nextId = 1;
+    connection.init(state);
+  }
+  init(snapshot(proxyStore));
+
+  function send(type: string) {
+    const state = snapshot(proxyStore);
+    sentStates.set(nextId, state);
+    sentStates.delete(nextId - maxAge - 1);
+    nextId++;
+    connection.send({type}, state);
+  }
+
+  let applying = false;
+  let directWrites = false;
+  const unsubscribeFromStore = subscribe(
+    proxyStore,
+    () => {
+      if (applying) return;
+      const name = actionName();
+      if (name) {
+        // A direct write still waiting in this task is part of this entry.
+        directWrites = false;
+        send(name);
+        return;
+      }
+      // Direct writes outside a method: one entry per task, so a loop of
+      // writes takes one snapshot and not one per write.
+      if (directWrites) return;
+      directWrites = true;
+      queueMicrotask(() => {
+        if (!directWrites) return;
+        directWrites = false;
+        send('STORE_UPDATE');
+      });
+    },
+    {sync: true},
+  );
+
+  function apply(state: unknown, trusted: boolean) {
+    if (typeof state !== 'object' || state === null || Array.isArray(state))
+      return;
+    applying = true;
+    try {
+      applyState(proxyStore, state as Record<string, unknown>, !trusted);
+    } finally {
+      applying = false;
+    }
+  }
+
+  function parse(text: string | undefined): unknown {
+    if (typeof text !== 'string') return undefined;
+    try {
+      return JSON.parse(text);
+    } catch {
+      // A malformed message changes nothing.
+      return undefined;
+    }
+  }
+
   const devToolsUnsub = connection.subscribe((message: DevToolsMessage) => {
-    if (message.type === 'DISPATCH' && message.state) {
-      const payloadType = message.payload?.type;
-      if (payloadType === 'JUMP_TO_STATE' || payloadType === 'JUMP_TO_ACTION') {
-        try {
-          const newState = JSON.parse(message.state) as Record<string, unknown>;
-          isTimeTraveling = true;
-
-          // Apply state back to the proxy, skipping getters and methods
-          for (const key of Object.keys(newState)) {
-            // Skip getters
-            if (findGetterDescriptor(proxyStore, key)?.get) continue;
-            // Skip methods
-            if (
-              typeof (proxyStore as Record<string, unknown>)[key] === 'function'
-            ) {
-              continue;
-            }
-            (proxyStore as Record<string, unknown>)[key] = newState[key];
-          }
-        } catch {
-          // JSON.parse or property assignment failed — ignore.
-        } finally {
-          // Reset after microtask so the batched subscription callback
-          // (which fires via queueMicrotask) still sees the flag as true.
-          queueMicrotask(() => {
-            isTimeTraveling = false;
-          });
-        }
+    if (message.type !== 'DISPATCH') return;
+    const payload = message.payload ?? {};
+    switch (payload.type) {
+      case 'JUMP_TO_STATE':
+      case 'JUMP_TO_ACTION': {
+        const kept =
+          typeof payload.actionId === 'number'
+            ? sentStates.get(payload.actionId)
+            : undefined;
+        if (kept) apply(kept, true);
+        else apply(parse(message.state), false);
+        return;
+      }
+      case 'RESET':
+        apply(initialState, true);
+        init(snapshot(proxyStore));
+        return;
+      case 'COMMIT':
+        init(snapshot(proxyStore));
+        return;
+      case 'ROLLBACK':
+        apply(parse(message.state), false);
+        init(snapshot(proxyStore));
+        return;
+      case 'IMPORT_STATE': {
+        const lifted = payload.nextLiftedState;
+        const states = lifted?.computedStates ?? [];
+        apply(states[states.length - 1]?.state, false);
+        sentStates.clear();
+        connection.send(null, lifted);
+        return;
       }
     }
   });
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index 8f690c2..0bdf25d 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -1,7 +1,6 @@
 import {getVersion, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
-import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {applyState} from '../cloneSnapshot/cloneSnapshot';
 import {
   createUtilityStatus,
   type UtilityStatusSource,
@@ -61,7 +60,6 @@ export function withHistory<T extends object>(
   const history: Snapshot<T>[] = [snapshot(proxyStore)];
   let pointer = 0;
   let paused = false;
-  let restoring = 0;
   let disposed = false;
   const status = createUtilityStatus<HistoryStatus>({
     canUndo: false,
@@ -76,38 +74,9 @@ export function withHistory<T extends object>(
     isDisposed: disposed,
   });
 
-  const live = proxyStore as Record<string, unknown>;
   // The store revision that the entry under the pointer describes.
   let recordedVersion = getVersion(proxyStore);
 
-  /** Getters and methods are behavior, not state; restoring leaves them alone. */
-  function isData(key: string): boolean {
-    return (
-      !findGetterDescriptor(proxyStore, key)?.get &&
-      typeof live[key] !== 'function'
-    );
-  }
-
-  /** Make the store's data fields match a recorded snapshot. */
-  function applySnapshot(snap: Snapshot<T>): void {
-    const recorded = snap as Record<string, unknown>;
-    const current = snapshot(proxyStore) as Record<string, unknown>;
-    const clones = new WeakMap<object, object>();
-
-    // A field added after this snapshot was taken did not exist in it.
-    for (const key of Object.keys(current)) {
-      if (!Object.hasOwn(recorded, key) && isData(key)) delete live[key];
-    }
-    for (const key of Object.keys(recorded)) {
-      if (!isData(key)) continue;
-      // An untouched branch still has this exact snapshot. Leaving it alone
-      // keeps its identity, so selectors reading it stay quiet.
-      if (Object.hasOwn(current, key) && Object.is(current[key], recorded[key]))
-        continue;
-      live[key] = cloneSnapshotValue(recorded[key], clones);
-    }
-  }
-
   /** Append the store's current state as the newest history entry. */
   function record(): void {
     // Truncate any redo entries after the current pointer
@@ -129,22 +98,19 @@ export function withHistory<T extends object>(
   /** Move to another entry without recording the move itself. */
   function restore(target: number): void {
     pointer = target;
-    restoring++;
     try {
-      applySnapshot(history[pointer]);
+      // One transaction: a synchronous subscriber hears once per step.
+      applyState(proxyStore, history[pointer] as Record<string, unknown>);
     } finally {
+      // The restore's own notification finds this revision and records nothing.
       recordedVersion = getVersion(proxyStore);
-      // The store's batched notification for this restore runs first.
-      queueMicrotask(() => {
-        restoring--;
-      });
       status.update(readStatus());
     }
   }
 
   // Subscribe to store mutations
   const unsubscribeFromStore = subscribe(proxyStore, () => {
-    if (paused || restoring > 0 || disposed) return;
+    if (paused || disposed) return;
     // undo() may already have recorded this revision ahead of the notification.
     if (getVersion(proxyStore) === recordedVersion) return;
     record();
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index 1d40a4c..ddb5f4f 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -1,6 +1,10 @@
-import {getVersion, snapshot, subscribe} from '../../storeRuntime';
+import {batch, getVersion, snapshot, subscribe} from '../../storeRuntime';
 import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {
+  findGetterDescriptor,
+  findPropertyDescriptor,
+  isPlainObject,
+} from '../internal/internal';
 import {createUtilityStatus} from '../utilityStatus/utilityStatus';
 
 import type {
@@ -22,22 +26,13 @@ type PersistEnvelope = {
 
 // ── Helpers ──────────────────────────────────────────────────────────────────
 
-/** Check if a value is a PropertyTransform descriptor (has `key` + `serialize`). */
-function isTransform<T extends object>(
-  entry: keyof T | PropertyTransform<T>,
-): entry is PropertyTransform<T> {
-  return (
-    typeof entry === 'object' &&
-    entry !== null &&
-    'key' in entry &&
-    'serialize' in entry
-  );
-}
-
 /**
  * Build the normalized list of property keys and their optional transforms.
  * If `properties` is not provided, defaults to all own enumerable data properties
  * of the store (excluding getters and methods).
+ *
+ * An explicit list is checked here, once: an entry that names an accessor, a
+ * method or a prototype key, or a transform without both functions, throws.
  */
 function resolveProperties<T extends object>(
   proxyStore: T,
@@ -45,10 +40,28 @@ function resolveProperties<T extends object>(
 ): Array<{key: string; transform?: PropertyTransform<T>}> {
   if (properties) {
     return properties.map((entry) => {
-      if (isTransform(entry)) {
-        return {key: entry.key as string, transform: entry};
-      }
-      return {key: entry as string};
+      const transform =
+        typeof entry === 'object' && entry !== null ? entry : undefined;
+      const key = transform ? transform.key : entry;
+      const descriptor =
+        typeof key === 'string'
+          ? findPropertyDescriptor(proxyStore, key)
+          : undefined;
+      if (
+        (transform &&
+          (typeof transform.serialize !== 'function' ||
+            typeof transform.deserialize !== 'function')) ||
+        typeof key !== 'string' ||
+        key === '__proto__' ||
+        key === 'constructor' ||
+        key === 'prototype' ||
+        descriptor?.get ||
+        descriptor?.set ||
+        typeof (proxyStore as Record<string, unknown>)[key] === 'function'
+      )
+        // A key must name a data field; a transform needs both functions.
+        throw new TypeError(`persist(): cannot persist "${String(key)}"`);
+      return {key, transform};
     });
   }
 
@@ -127,6 +140,9 @@ export function persist<T extends object>(
   let storageQueue: Promise<void> | undefined;
   let skipAutoSaveVersion: number | undefined;
   let clearedVersion: number | undefined;
+  // Set when a read restored a record that should be stored again: migrated,
+  // or written before `expireIn` was set, so it gets its expiresAt now.
+  let rewrite = false;
   let lastError: PersistStatus['lastError'] = null;
   const readStatus = (): PersistStatus => ({
     isHydrated: hydratedFlag,
@@ -283,21 +299,20 @@ export function persist<T extends object>(
     baseline = snapshot(proxyStore) as Record<string, unknown>,
   ): boolean {
     const envelope = JSON.parse(raw) as PersistEnvelope;
-
-    if (
-      !envelope ||
-      typeof envelope !== 'object' ||
-      envelope.state === null ||
-      typeof envelope.state !== 'object'
-    ) {
-      return false;
-    }
-
-    // Expiry check — skip hydration if data has expired.
-    if (
-      typeof envelope.expiresAt === 'number' &&
-      Date.now() >= envelope.expiresAt
-    ) {
+    // Every record that cannot be used is reported as 'parse', never skipped.
+    const unreadable: (why: string) => never = (why) => {
+      throw new TypeError(`persist(): the stored record ${why}`);
+    };
+    if (!isPlainObject(envelope) || !isPlainObject(envelope.state))
+      unreadable('is not {version, state}');
+
+    // Expiry check — skip hydration if data has expired. JSON stores an
+    // `expireIn` of Infinity as null; a record from before `expireIn` has none.
+    const {expiresAt} = envelope;
+    if (expiresAt != null && typeof expiresAt !== 'number')
+      unreadable('has an expiresAt that is not a number');
+    if (expireIn != null && expiresAt === undefined) rewrite = true;
+    if (typeof expiresAt === 'number' && Date.now() >= expiresAt) {
       expiredFlag = true;
       return true;
     }
@@ -305,13 +320,19 @@ export function persist<T extends object>(
     let {state} = envelope;
 
     // Data stored under another schema version is usable only through
-    // `migrate`. Without one, the store keeps its current state. A record
-    // with no version counts as the default, version 0.
-    const storedVersion =
-      typeof envelope.version === 'number' ? envelope.version : 0;
+    // `migrate`. A record with no version counts as the default, version 0;
+    // any other version must be an integer.
+    const storedVersion = envelope.version ?? 0;
+    if (!Number.isInteger(storedVersion))
+      unreadable('has a version that is not an integer');
     if (storedVersion !== version) {
-      if (!migrate) return false;
+      if (!migrate)
+        unreadable(`has version ${storedVersion} and there is no migrate`);
       state = migrate(state, storedVersion);
+      // A promise, an array or null is not a state.
+      if (!isPlainObject(state))
+        unreadable('was not migrated: migrate must return a plain object');
+      rewrite = true;
     }
 
     const startVersion = getVersion(proxyStore);
@@ -353,28 +374,50 @@ export function persist<T extends object>(
       }
     }
 
+    // Copy every value before writing any, so a value that cannot be copied
+    // (too deep, say) leaves the store untouched.
+    const values = new Map<string, unknown>();
+    for (const key of pending)
+      values.set(key, cloneSnapshotValue(merged[key], clones, true));
+    const written: string[] = [];
+
     try {
-      // The cached snapshot keeps its identity until something changes, so
-      // this also covers edits made by `migrate`, a transform or `merge`.
-      if (snapshot(proxyStore) !== baseline) discardEditedFields();
-      for (const key of pending) {
-        pending.delete(key);
-        const before = getVersion(proxyStore);
-        (proxyStore as Record<string, unknown>)[key] = cloneSnapshotValue(
-          merged[key],
-          clones,
-        );
-        const after = getVersion(proxyStore);
-        if (after === before) continue;
-        expectedVersion++;
-        // Applying another stored field after clear() is still part of this
-        // restore. A later subscriber/user edit has its own revision.
-        if (clearedVersion === before && after === before + 1)
-          clearedVersion = after;
-        // A direct data-field assignment adds one revision. Any additional
-        // revision came from user code and must survive the rest of this pass.
-        if (after > before + 1 && pending.size) discardEditedFields();
-      }
+      // One transaction: a synchronous subscriber hears the restore once.
+      batch(() => {
+        // The cached snapshot keeps its identity until something changes, so
+        // this also covers edits made by `migrate`, a transform or `merge`.
+        if (snapshot(proxyStore) !== baseline) discardEditedFields();
+        try {
+          for (const key of pending) {
+            pending.delete(key);
+            const before = getVersion(proxyStore);
+            (proxyStore as Record<string, unknown>)[key] = values.get(key);
+            written.push(key);
+            const after = getVersion(proxyStore);
+            if (after === before) continue;
+            expectedVersion++;
+            // Applying another stored field after clear() is still part of this
+            // restore. A later subscriber/user edit has its own revision.
+            if (clearedVersion === before && after === before + 1)
+              clearedVersion = after;
+            // A direct data-field assignment adds one revision. Any additional
+            // revision came from user code and must survive the rest of this pass.
+            if (after > before + 1 && pending.size) discardEditedFields();
+          }
+          // A record the store can hold but not snapshot would break every
+          // read and every save. Put the fields back and report it instead.
+          snapshot(proxyStore);
+        } catch (error) {
+          const live = proxyStore as Record<string, unknown>;
+          for (const key of written) {
+            if (Object.hasOwn(current, key))
+              live[key] = cloneSnapshotValue(current[key], new WeakMap());
+            else delete live[key];
+          }
+          expectedVersion = getVersion(proxyStore);
+          throw error;
+        }
+      });
     } finally {
       skipAutoSaveVersion = expectedVersion;
     }
@@ -390,12 +433,16 @@ export function persist<T extends object>(
     const isCurrent = () => !disposed && request === hydrationRequest;
     reading++;
     try {
-      let raw: string | null;
+      let raw: string | null | Promise<string | null>;
       try {
         // A read requested after save()/clear() observes those operations' results.
         if (storageQueue) await storageQueue;
         if (!isCurrent()) return;
-        raw = await storage.getItem(name);
+        raw = storage.getItem(name);
+        // A synchronous storage is restored before persist() returns, so the
+        // first render already shows the stored state.
+        if (typeof (raw as Promise<unknown> | null)?.then === 'function')
+          raw = await raw;
       } catch (error) {
         if (isCurrent()) fail(error, 'read');
         return;
@@ -404,6 +451,7 @@ export function persist<T extends object>(
       // data must not replace current state or clear newer stored data.
       if (!isCurrent()) return;
       if (raw !== null) {
+        raw = raw as string;
         // A debounced local write may be pending from a mutation issued
         // before the data arrived. Fold it into the save that follows the read.
         if (debounceTimer !== null) {
@@ -412,11 +460,14 @@ export function persist<T extends object>(
           saveAfterRead = true;
         }
         let expired: boolean;
+        rewrite = false;
         try {
           expired = applyPersistedState(raw, baseline);
         } catch (error) {
           fail(error, 'parse');
         }
+        // Store a migrated record, so the next load does not migrate again.
+        if (rewrite) saveAfterRead = true;
         if (expired && clearOnExpire) {
           const removal = enqueueStorageMutation(
             () => storage.removeItem(name),
@@ -431,6 +482,11 @@ export function persist<T extends object>(
         succeeded();
       }
     } finally {
+      if (!hydratedFlag) {
+        hydratedFlag = true;
+        resolveHydrated();
+      }
+      status.update(readStatus());
       reading--;
       // Local edits made during the read are saved together with what it restored.
       if (!reading && saveAfterRead) {
@@ -447,10 +503,20 @@ export function persist<T extends object>(
     if (disposed) return;
     if (event.key !== name) return;
     if (event.newValue === null) return; // cleared
-    // Delivery is asynchronous: another tab or a local save may have already
-    // replaced this event's value. Do not roll the UI back to an obsolete value.
-    if (event.storageArea && event.storageArea.getItem(name) !== event.newValue)
-      return;
+    const area = event.storageArea;
+    if (area) {
+      // The same key in another area (sessionStorage, say) is not this record.
+      // A wrapper around localStorage cannot be compared, so only a Storage is.
+      if (
+        area !== storage &&
+        typeof Storage !== 'undefined' &&
+        storage instanceof Storage
+      )
+        return;
+      // Delivery is asynchronous: another tab or a local save may have already
+      // replaced this event's value. Do not roll the UI back to an obsolete value.
+      if (area.getItem(name) !== event.newValue) return;
+    }
     hydrationRequest++;
     // A pending local debounced write would otherwise overwrite the remote
     // state once its timer fires.
@@ -481,18 +547,30 @@ export function persist<T extends object>(
     globalThis.addEventListener('storage', onStorageEvent);
   }
 
+  /** A debounced save still waiting when the page is hidden is written now. */
+  function onHide(event: Event): void {
+    if (
+      debounceTimer !== null &&
+      (event.type === 'pagehide' ||
+        globalThis.document?.visibilityState === 'hidden')
+    ) {
+      clearTimeout(debounceTimer);
+      debounceTimer = null;
+      autoSave();
+    }
+  }
+  if (debounceMs > 0) {
+    globalThis.addEventListener?.('pagehide', onHide);
+    globalThis.addEventListener?.('visibilitychange', onHide);
+  }
+
   // Subscribe to store mutations.
   const unsubscribeFromStore = subscribe(proxyStore, scheduleWrite);
 
   // Kick off initial hydration (unless skipped).
   if (!skipHydration) {
-    void hydrateFromStorage()
-      .catch(() => {})
-      .finally(() => {
-        hydratedFlag = true;
-        status.update(readStatus());
-        resolveHydrated();
-      });
+    // Failures are reported through status and onError.
+    void hydrateFromStorage().catch(() => {});
   }
 
   // ── Build handle ───────────────────────────────────────────────────────
@@ -506,6 +584,10 @@ export function persist<T extends object>(
     }
     unsubscribeFromStore();
     if (syncTabs) globalThis.removeEventListener('storage', onStorageEvent);
+    if (debounceMs > 0) {
+      globalThis.removeEventListener?.('pagehide', onHide);
+      globalThis.removeEventListener?.('visibilitychange', onHide);
+    }
     status.dispose(readStatus());
   }
 
@@ -550,15 +632,7 @@ export function persist<T extends object>(
       assertActive();
       expiredFlag = false;
       status.update(readStatus());
-      try {
-        await hydrateFromStorage();
-      } finally {
-        if (!hydratedFlag) {
-          hydratedFlag = true;
-          resolveHydrated();
-        }
-        status.update(readStatus());
-      }
+      await hydrateFromStorage();
     },
   };
```

### `repro.ts`: the reproductions, run with `SRC=<worktree>/packages/classy-store/src bun repro.ts`

```ts
// Reproductions for the stage 3 persist, devtools and history spikes.
// Run: SRC=<worktree>/packages/classy-store/src bun repro.ts
const SRC = process.env.SRC as string;
const core = await import(`${SRC}/index.ts`);
const utils = await import(`${SRC}/utils/index.ts`);
const runtime = await import(`${SRC}/storeRuntime.ts`);
const {createClassyStore, snapshot, subscribe} = core;
const {persist, devtools, withHistory} = utils;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
// A browser's areas are Storage objects. Bun has none, so stand one in.
(globalThis as Record<string, unknown>).Storage ??= class Storage {};
const StorageClass = (globalThis as unknown as {Storage: {prototype: object}})
  .Storage;
const memoryStorage = () => {
  const memory = new Map<string, string>();
  const writes: string[] = [];
  return Object.assign(Object.create(StorageClass.prototype), {
    memory,
    writes,
    getItem: (name: string) => memory.get(name) ?? null,
    setItem: (name: string, value: string) => {
      writes.push(value);
      memory.set(name, value);
    },
    removeItem: (name: string) => void memory.delete(name),
  });
};

// Capture global listeners so the script can deliver events itself.
const listeners = new Map<string, Set<(event: unknown) => void>>();
const realAdd = globalThis.addEventListener?.bind(globalThis);
const realRemove = globalThis.removeEventListener?.bind(globalThis);
globalThis.addEventListener = ((type: string, fn: (event: unknown) => void) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)?.add(fn);
}) as typeof globalThis.addEventListener;
globalThis.removeEventListener = ((
  type: string,
  fn: (event: unknown) => void,
) => {
  listeners.get(type)?.delete(fn);
}) as typeof globalThis.removeEventListener;
const fire = (type: string, event: unknown = {type}) => {
  for (const fn of listeners.get(type) ?? []) fn(event);
};
void realAdd;
void realRemove;

const line = (...parts: unknown[]) => console.log(...parts);

// ── P1 ──
line('## P1. when hydration happens');
{
  const storage = memoryStorage();
  storage.memory.set('p1', JSON.stringify({version: 0, state: {count: 7}}));
  const store = createClassyStore({count: 0});
  const handle = persist(store, {name: 'p1', storage});
  line(
    'count right after persist():',
    store.count,
    '| isHydrated',
    handle.isHydrated,
  );
  await handle.hydrated;
  line('count after hydrated:', store.count);

  const {prepareStoreForHydration} = await import(
    `${SRC}/frameworks/react/server.ts`
  );
  const store2 = createClassyStore({count: 0});
  persist(store2, {name: 'p1', storage});
  prepareStoreForHydration(store2);
  line(
    'prepareStoreForHydration called after persist(): server snapshot count',
    (runtime.hydrationSnapshots.get(store2) as {count: number}).count,
  );
  await settle();

  const store3 = createClassyStore({count: 0});
  const h3 = persist(store3, {name: 'p1', storage, skipHydration: true});
  const pending = h3.rehydrate();
  line('skipHydration + rehydrate(): count before await', store3.count);
  await pending;
  line('after await', store3.count);
}

// ── P2 ──
line('\n## P2. nothing is skipped in silence');
const p2 = async (
  label: string,
  record: string,
  extra: Record<string, unknown> = {},
) => {
  const storage = memoryStorage();
  storage.memory.set('p2', record);
  const store = createClassyStore({count: 0});
  const errors: string[] = [];
  const handle = persist(store, {
    name: 'p2',
    storage,
    onError: (error: unknown, operation: string) =>
      errors.push(`${operation}: ${(error as Error)?.message ?? error}`),
    ...extra,
  });
  await handle.hydrated;
  await settle();
  line(
    `${label.padEnd(34)} count ${store.count} | expired ${handle.isExpired} | errors ${JSON.stringify(errors)}`,
  );
};
await p2('envelope 5', '5');
await p2('envelope null', 'null');
await p2('envelope []', '[]');
await p2('state null', '{"version":0,"state":null}');
await p2('state [1,2,3]', '{"version":0,"state":[1,2,3]}');
await p2('version 1, no migrate', '{"version":1,"state":{"count":7}}', {
  version: 2,
});
await p2('version "2" vs 2, migrate', '{"version":"2","state":{"count":7}}', {
  version: 2,
  migrate: (state: {count: number}, old: number) => ({
    count: state.count + old * 100,
  }),
});
await p2('version missing vs 2, migrate', '{"state":{"count":7}}', {
  version: 2,
  migrate: (state: {count: number}, old: number) => ({
    count: state.count + old * 100 + 1,
  }),
});
await p2('async migrate', '{"version":1,"state":{"count":7}}', {
  version: 2,
  migrate: async (state: {count: number}) => ({count: state.count + 1}),
});
await p2('migrate returns an array', '{"version":1,"state":{"count":7}}', {
  version: 2,
  migrate: () => [1],
});
await p2('expireIn, no expiresAt', '{"version":0,"state":{"count":9}}', {
  expireIn: 1000,
});
await p2(
  'expireIn, expiresAt "yesterday"',
  '{"version":0,"state":{"count":9},"expiresAt":"yesterday"}',
  {expireIn: 1000},
);
await p2('not JSON', '{oops');

// ── P3 ──
line('\n## P3. options validated when persist() is called');
class Counter {
  count = 0;
  tail = 'a';
  get doubled() {
    return this.count * 2;
  }
  inc() {
    this.count++;
  }
}
for (const [label, properties] of [
  ['__proto__', ['count', '__proto__']],
  ['constructor', ['count', 'constructor']],
  ['getter', ['count', 'doubled', 'tail']],
  ['method', ['count', 'inc']],
  [
    'transform without serialize',
    [{key: 'count', deserialize: (v: unknown) => v}],
  ],
  [
    'transform serialize not a function',
    [{key: 'count', serialize: 1, deserialize: (v: unknown) => v}],
  ],
] as const) {
  const storage = memoryStorage();
  try {
    const handle = persist(createClassyStore(new Counter()), {
      name: 'p3',
      storage,
      properties: properties as never,
    });
    await handle.hydrated;
    line(`${label.padEnd(36)} accepted`);
  } catch (error) {
    line(
      `${label.padEnd(36)} threw ${(error as Error).constructor.name}: ${(error as Error).message}`,
    );
  }
}

// ── P4 ──
line('\n## P4. restore is all or nothing');
for (const depth of [17000, 30000]) {
  let deep: unknown = 'leaf';
  for (let i = 0; i < depth; i++) deep = {d: deep};
  const storage = memoryStorage();
  storage.memory.set(
    'p4',
    JSON.stringify({version: 0, state: {a: 'restored-a', b: deep}}),
  );
  const store = createClassyStore({a: 'default-a', b: {} as unknown});
  const errors: string[] = [];
  const handle = persist(store, {
    name: 'p4',
    storage,
    onError: (e: unknown, op: string) =>
      errors.push(`${op}:${(e as Error).constructor.name}`),
  });
  await handle.hydrated;
  let snap = 'ok';
  try {
    snapshot(store);
  } catch (e) {
    snap = (e as Error).constructor.name;
  }
  line(
    `depth ${depth}: a ${store.a} | b ${typeof store.b === 'object' && Object.keys(store.b as object).length ? 'deep' : 'default'} | snapshot ${snap} | errors ${errors.join(',') || '(none)'}`,
  );
  handle.dispose();
}
{
  const storage = memoryStorage();
  storage.memory.set(
    'p4p',
    '{"version":0,"state":{"prefs":{"__proto__":{"polluted":1},"theme":"dark"}}}',
  );
  const store = createClassyStore({
    prefs: {theme: 'light'} as Record<string, unknown>,
  });
  const handle = persist(store, {name: 'p4p', storage});
  await handle.hydrated;
  line(
    'nested __proto__ own keys after restore:',
    JSON.stringify(Reflect.ownKeys(store.prefs)),
    '| theme',
    store.prefs.theme,
  );
  await handle.save();
  line('written back:', storage.memory.get('p4p'));
}
{
  // partial restore through a field that fails to apply
  const storage = memoryStorage();
  storage.memory.set('p4s', '{"version":0,"state":{"a":1,"b":2}}');
  class S {
    a = 0;
    _b = 0;
    get b() {
      return this._b;
    }
    set b(_v: number) {
      throw new Error('setter refuses');
    }
  }
  const store = createClassyStore(new S());
  const errors: string[] = [];
  try {
    const handle = persist(store, {
      name: 'p4s',
      storage,
      properties: ['a', 'b'] as never,
      onError: (e: unknown, op: string) =>
        errors.push(`${op}:${(e as Error).message}`),
    });
    await handle.hydrated;
    line(
      'field that throws on apply: a',
      store.a,
      '| errors',
      JSON.stringify(errors),
    );
  } catch (e) {
    line('field that throws on apply: persist() threw', (e as Error).message);
  }
}

// ── P5 ──
line(
  '\n## P5. migrated record written back; debounced save flushed when hidden',
);
{
  const storage = memoryStorage();
  storage.memory.set('p5', '{"version":1,"state":{"old":7}}');
  const store = createClassyStore({n: 0});
  const handle = persist(store, {
    name: 'p5',
    storage,
    version: 2,
    migrate: (state: {old: number}) => ({n: state.old}),
  });
  await handle.hydrated;
  await settle();
  line('after migrate: n', store.n, '| stored', storage.memory.get('p5'));
}
{
  const storage = memoryStorage();
  const store = createClassyStore({n: 0});
  const handle = persist(store, {name: 'p5d', storage, debounce: 10_000});
  await handle.hydrated;
  store.n = 5;
  await new Promise((r) => setTimeout(r, 5));
  fire('pagehide');
  line(
    'debounce 10s, pagehide fired: writes',
    storage.writes.length,
    '| stored',
    storage.memory.get('p5d') ?? null,
  );
  handle.dispose();
}

// ── P6 ──
line('\n## P6. cross-tab events');
{
  const areaA = memoryStorage();
  const areaB = memoryStorage();
  const store = createClassyStore({who: 'mine'});
  const handle = persist(store, {name: 'p6', storage: areaA, syncTabs: true});
  await handle.hydrated;
  fire('storage', {
    key: 'p6',
    newValue: '{"version":0,"state":{"who":"synthetic"}}',
  });
  line(
    'synthetic event without storageArea applied:',
    store.who === 'synthetic',
  );
  store.who = 'mine';
  areaB.memory.set('p6', '{"version":0,"state":{"who":"other-area"}}');
  fire('storage', {
    key: 'p6',
    newValue: '{"version":0,"state":{"who":"other-area"}}',
    storageArea: areaB,
  });
  line('event from another storage area applied:', store.who === 'other-area');
  store.who = 'mine';
  areaA.memory.set('p6', '{"version":0,"state":{"who":"same-area"}}');
  fire('storage', {
    key: 'p6',
    newValue: '{"version":0,"state":{"who":"same-area"}}',
    storageArea: areaA,
  });
  line('event from the configured area applied:', store.who === 'same-area');
  handle.dispose();
}

// ── P7 ──
line('\n## P7. devtools');
(globalThis as Record<string, unknown>).window ??= globalThis;
const fakeExtension = () => {
  const sent: Array<{action: unknown; state: unknown}> = [];
  const inits: unknown[] = [];
  let listener: ((m: unknown) => void) | null = null;
  const connectOptions: unknown[] = [];
  (globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: (options: unknown) => {
      connectOptions.push(options);
      return {
        init: (s: unknown) => inits.push(s),
        send: (action: unknown, state: unknown) => sent.push({action, state}),
        subscribe: (fn: (m: unknown) => void) => {
          listener = fn;
          return () => {
            listener = null;
          };
        },
      };
    },
  };
  return {
    sent,
    inits,
    connectOptions,
    dispatch: (m: unknown) => listener?.(m),
  };
};
class Profile {
  name = 'a';
  age = 1;
  when = new Date(0);
  _level = 0;
  set level(v: number) {
    this._level = v;
    setterCalls++;
  }
  rename(name: string) {
    this.name = name;
  }
  birthday() {
    this.age++;
  }
}
let setterCalls = 0;
{
  const ext = fakeExtension();
  const store = createClassyStore(new Profile());
  const handle = devtools(store, {name: 'p7', maxAge: 30} as never);
  let syncCalls = 0;
  subscribe(store, () => syncCalls++, {sync: true});
  store.rename('b');
  store.birthday();
  store.age = 40;
  store.name = 'c';
  await settle();
  line(
    'entries sent:',
    JSON.stringify(ext.sent.map((e) => (e.action as {type: string}).type)),
  );
  line('connect() options:', JSON.stringify(ext.connectOptions[0]));
  syncCalls = 0;
  ext.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE', index: 1, actionId: 1},
    state: JSON.stringify({
      name: 'b',
      age: 1,
      when: new Date(0),
      added: 1,
      level: 7,
    }),
  });
  line(
    `jump: name ${store.name} age ${store.age} | sync calls ${syncCalls} | 'added' in store ${'added' in store} | setter calls ${setterCalls} | when is Date ${store.when instanceof Date}`,
  );
  ext.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: JSON.stringify({name: 'z'}),
  });
  line(
    `jump to a state without age: age ${store.age} | ownKeys ${JSON.stringify(Object.keys(store))}`,
  );
  store.name = 'same-tick';
  const before = ext.sent.length;
  await settle();
  line('edit made in the same tick as a jump sent:', ext.sent.length > before);
  ext.dispatch({type: 'DISPATCH', payload: {type: 'RESET'}});
  line('RESET: name', store.name, '| inits', ext.inits.length);
  store.name = 'committed';
  await settle();
  ext.dispatch({type: 'DISPATCH', payload: {type: 'COMMIT'}});
  line('COMMIT: inits', ext.inits.length);
  store.name = 'after-commit';
  await settle();
  ext.dispatch({
    type: 'DISPATCH',
    payload: {type: 'ROLLBACK'},
    state: JSON.stringify({
      name: 'committed',
      age: 1,
      when: '1970-01-01T00:00:00.000Z',
    }),
  });
  line('ROLLBACK: name', store.name, '| inits', ext.inits.length);
  ext.dispatch({
    type: 'DISPATCH',
    payload: {
      type: 'IMPORT_STATE',
      nextLiftedState: {
        computedStates: [
          {state: {name: 'i0', age: 1}},
          {state: {name: 'imported', age: 9}},
        ],
      },
    },
  });
  line('IMPORT_STATE: name', store.name, 'age', store.age);
  ext.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: '{"prefs":{"__proto__":{"x":1}},"name":"p"}',
  });
  line('jump with nested __proto__: name', store.name);
  handle.dispose();
}

// ── P8 ──
line('\n## P8. history: an edit in the same tick as undo()');
{
  const store = createClassyStore({value: 0});
  const history = withHistory(store);
  store.value = 1;
  await settle();
  history.undo();
  store.value = 9;
  await settle();
  line('canRedo after same-tick edit:', history.canRedo);
  history.redo();
  line('value after redo():', store.value);
  history.dispose();
}
{
  const store = createClassyStore({a: 0, b: 0, c: 0});
  const history = withHistory(store);
  store.a = 1;
  store.b = 1;
  store.c = 1;
  await settle();
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  history.undo();
  line('sync subscriber calls for one undo over 3 fields:', calls);
  history.dispose();
}
process.exit(0);
```

### `probe.ts`: two probes on the combination

```ts
// Probes on the combination: TTL stamp, two tabs that both migrate.
const SRC = process.env.SRC as string;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {persist} = await import(`${SRC}/utils/index.ts`);
const settle = () => new Promise((r) => setTimeout(r, 20));
const listeners = new Set<(e: unknown) => void>();
globalThis.addEventListener = ((t: string, f: (e: unknown) => void) => {
  if (t === 'storage') listeners.add(f);
}) as never;
globalThis.removeEventListener = (() => {}) as never;
// One shared area standing in for localStorage, with storage events to the other tab.
const memory = new Map<string, string>();
let writes = 0;
const area = {
  getItem: (n: string) => memory.get(n) ?? null,
  setItem: (n: string, v: string) => {
    writes++;
    memory.set(n, v);
    queueMicrotask(() => {
      for (const f of listeners) f({key: n, newValue: v, storageArea: area});
    });
  },
  removeItem: (n: string) => void memory.delete(n),
};
memory.set('ttl', '{"version":0,"state":{"n":3}}');
{
  const store = createClassyStore({n: 0});
  const h = persist(store, {name: 'ttl', storage: area, expireIn: 60_000});
  await h.hydrated;
  await settle();
  console.log('pre-TTL record: n', store.n, '| stored now', memory.get('ttl'));
  h.dispose();
}
memory.set('mig', '{"version":1,"state":{"old":7}}');
writes = 0;
{
  const opts = {
    name: 'mig',
    storage: area,
    version: 2,
    syncTabs: true,
    migrate: (s: {old: number}) => ({n: s.old}),
  };
  const a = createClassyStore({n: 0});
  const b = createClassyStore({n: 0});
  const ha = persist(a, opts);
  const hb = persist(b, opts);
  await settle();
  await settle();
  console.log(
    'two tabs migrate: a',
    a.n,
    'b',
    b.n,
    '| writes',
    writes,
    '| stored',
    memory.get('mig'),
  );
  ha.dispose();
  hb.dispose();
}
process.exit(0);
```

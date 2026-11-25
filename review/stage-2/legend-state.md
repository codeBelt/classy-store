# Stage 2: Legend-State (persistence, sync and batching; API read)

Stage 2 of the pre-1.0 review, 2026-11-19. Read-only: nothing in the
repository was changed apart from this file. This is an API read, so the
source was read only at the files that decide persistence and batching.

## Library, version and files read

- **Library:** `@legendapp/state`, from `https://github.com/LegendApp/legend-state`.
- **Two versions were read**, because the "latest stable release" is not where
  the project is going:
  - **2.1.15**, the npm `latest` tag and the newest stable release. Tag
    `v2.1.15`, commit `02032f3c75874904b114ec6d69cbbfba45a29970`, dated
    2024-08-30. Its persistence is `persistObservable()`.
  - **3.0.0-next.1**, the npm `next` tag. Tag `v3.0.0-next.1`, commit
    `2676125aa77002cadbb70d32d795fa64930f8051`, dated 2026-11-17. Version 3
    replaces `persistObservable()` with `syncObservable()` and rewrites the
    batcher. It is a pre-release; the stable line is two years old, so I read
    it as the direction the library has taken. Every claim below names which
    version it is about.
- **Files read, 2.1.15** (`src/`): `batching.ts` whole; `persist/persistObservable.ts`
  whole; `persist-plugins/local-storage.ts` whole; `ObservableObject.ts`
  lines 100 to 135, 545 to 625 and 700 to 760 (`set`, `setKey`, `assign`,
  `updateNodesAndNotify`); the `PersistOptions*`, `ObservablePersistLocal` and
  `PersistMetadata` types in `observableInterfaces.ts`. A grep over all of
  `src/` for `beforeunload`, `pagehide`, `visibilitychange`, `storage` events,
  `migrat`, `version`, `expire` and `ttl`.
- **Files read, 3.0.0-next.1** (`src/`): `batching.ts` lines 1 to 200 and 395 to
  562; `sync/syncTypes.ts`, `sync/persistTypes.ts`, `persistFormat.ts` whole;
  `sync/retry.ts` lines 1 to 60; `sync/syncObservable.ts` lines 255 to 355
  (local save queue and metadata), 432 to 580 (the queue that turns changes
  into saves), 3178 to 3554 (`onObsChange`, `loadLocal`, `loadPersistedLocal`)
  and 4500 to 4518 (return value); `persist-plugins/local-storage.ts` whole;
  `globals.ts` lines 43 to 138 (`safeStringify`, `safeParse`); a grep over
  `src/` for every `NODE_ENV` branch and `[legend-state]` message.
  `syncObservable.ts` is 4,520 lines, about 3,000 of them reconciliation of
  pending changes with server data. I did not read that part line by line.
- **Not read:** the IndexedDB, MMKV, AsyncStorage and SQLite plugins beyond
  their types and their parse-failure messages; the Firebase, Supabase and
  CRUD sync plugins; the React bindings; Legend's website documentation.
- **Ours:** `utils/persist/persist.ts` and `persist.types.ts` whole,
  `core/core.ts` lines 205 to 330 (notification, transactions, `batch`,
  `deliver`) and 560 to 600 (`subscribe`), and the persist tutorial and
  architecture pages under `website/content/docs/`. Line numbers for ours refer
  to `release/1.0` at `5d866cb`.
- **Ported tests** ran on Bun 1.4.4, with `@legendapp/state@2.1.15` and
  `@legendapp/state@3.0.0-next.1` each installed from npm in its own scratch
  folder (version 3 imports itself by name, so the two cannot share a folder),
  and against our source imported by absolute path. Their code and output are
  in the appendix.

## Summary

Legend-State is not a class store, and its persistence is built around remote
sync: each observable can have a local cache and a remote, and the machinery
(pending-change tracking, replay after a failed upload, `lastSync`, retry with
back-off) exists for the remote. For a store that persists to `localStorage`
the comparison is narrower than the size of its source suggests, and it comes
out mostly in our favour: we have a schema version and migration, expiry,
cross-tab sync, a status handle, a disposable handle and a deferred save after
an early write, none of which Legend's local persistence has. Eleven findings
follow. The three that matter most:

1. **Synchronous hydration (finding 4).** With a synchronous storage area,
   Legend has the stored value in the observable the moment the persistence
   call returns (port P2: 7 against our 0). We always read through an `await`,
   so a store on `localStorage` renders its defaults first and the saved state
   a microtask later. That is a choice with an SSR consequence, and it should
   be made on purpose before 1.0.
2. **A throwing listener broke Legend's batcher until 3.0 (finding 1).** In
   2.1.15 one listener that throws leaves a module-level flag set, so no
   observable notifies again, and the second listener on the same observable
   never runs (port B5). Version 3 fixed it by running every listener and
   rethrowing the first error. Our `deliver()` already isolates listeners
   (`core.ts:314-327`); what is worth taking from version 3 is only its
   decision about where the error goes.
3. **`batch()` and `async` functions (finding 3).** Neither library notices an
   `async` function passed to `batch`; the writes after the first `await` fall
   outside it (port B8). Legend avoids half of the trap by typing `batch` as
   returning nothing; ours returns whatever `run` returns, so it hands back the
   promise that tells the caller nothing was batched. A dev-only check or a type
   that refuses a promise would catch it.

"Where we already do better" lists what to keep.

## How the two designs differ

- **Legend notifies on every write, immediately, unless a batch is open.**
  `notify()` runs "immediate" listeners, adds the node to the current batch, and
  if no batch is open calls `runBatch()` at once (2.1.15 `batching.ts:79-109`;
  3.0.0-next.1 `batching.ts:116-190`). Port B1 shows the default listener has
  run before the write returns. `ObservableObject.updateNodesAndNotify` opens a
  batch around each write so that one write is one notification
  (`ObservableObject.ts:719-752`). Ours is the opposite default: a plain
  subscriber hears one notification per microtask and a `{sync: true}` one per
  write or per method call (`core.ts:217-241`).
- **A Legend listener gets a list of changes** (`path`, `valueAtPath`,
  `prevAtPath`) and a lazy `getPrevious()`; ours get nothing. Persistence is the
  consumer that needs it: it saves the changed paths, not the whole value.
- **Legend's persistence is an observer of the observable**, registered with
  `obs.onChange` (`persistObservable.ts:802-812`), like ours with `subscribe`
  (`persist.ts:485`). It has no handle to stop it: `persistObservable` returns
  the observable itself, and 3.0 returns the sync-state observable
  (`syncObservable.ts:4500-4518`). Ours returns a handle with `dispose`.
- **Legend has no snapshots, so it has nothing like our version-keyed restore
  bookkeeping.** It marks changes that came from a restore instead
  (finding 6).

## Findings

### 1. A throwing listener wedged the batcher in 2.1.15; 3.0 fixed it

Stage 1 findings 18, 22 and 23 concern what happens around a listener. Bears on
API question 8.

- **What they do.**
  - 2.1.15: `batchNotifyChanges` calls `listener(listenerParams!)` with no
    `try` (`batching.ts:243`). `endBatch` sets `isRunningBatch = true`, calls
    `runBatch()` and sets it back to `false` on the next line, with no `finally`
    (`batching.ts:313-317`). A throw leaves `isRunningBatch` true, so every later
    `endBatch` takes the "already running" branch, sets `didDelayEndBatch` and
    returns (`batching.ts:296-300`): nothing is ever notified again.
  - 3.0.0-next.1: `batchNotifyChanges` catches each listener's error, keeps the
    first, finishes the other listeners and rethrows it (`batching.ts:412-420`
    and the `if (didError) throw firstError` after the loop). `endBatch` resets
    `isRunningBatch` in a `catch` (`batching.ts:523-535`), and
    `endBatchAndThrow` closes a batch while keeping the error that interrupted
    it (`batching.ts:545-551`). `batch()` uses it (`batching.ts:489-497`).
- **What we do.** `deliver()` copies the listeners, calls each in a `try`, and
  sends the error to `console.error` (`core.ts:314-327`). The writer does not
  see it.
- **Difference in behaviour.** Port B5, 2.1.15, run in a process of its own:
  the write throws, the second listener on the same observable does not run,
  and an unrelated observable's listener is called 0 times out of 2 writes, for
  the rest of the process. Version 3 and ours: the second listener runs, and the
  other store is notified twice (appendix, B5 and `b5.iso.ts`). Ours never
  throws to the writer; version 3 does, with the first error.
- **Proposal: reject the bug, adapt the decision.** Keep `deliver()`. The open
  question is where a listener's error should go. Version 3 gives it to the
  writer, after every listener has run. That is wrong for us: the write has
  already happened and a framework binding's error would surface in whatever
  line assigned a field. `console.error` is the quietest answer and is what a
  Vue or Solid user sees from their own effects. A cheap improvement that comes
  from reading Legend: route the error through one function that dev tools and
  tests can replace, so the stage 3 diagnostics work has a single place to hook.
  That is optional.
- **Kind:** diagnostics.
- **Cost:** none to keep; a replaceable reporter is one function in `core.ts`
  and an internal export, not breaking.

### 2. A write that is undone inside a batch is not notified

Bears on API question 2.

- **What they do.** In 3.0.0-next.1, `notify()` looks for the node in the open
  batch and, when the new value equals the value from before the batch, deletes
  the entry, so no listener hears of it (`batching.ts:133-143`, the check
  `existing.prev === value`). Port B6: `a` set to 1 and back to 0 inside a
  batch gives 0 calls in 3.0.0-next.1. Version 2.1.15 gives 1 call: the
  suppression is new in 3.0, and `notify()` in 2.1.15 only overwrites the
  entry's value (`batching.ts:97-103`).
- **What we do.** Every write bumps the version and schedules a notification
  (`core.ts:217-241`), and the transaction delivers once at the end
  (`core.ts:249-256`). Port B6: 1 call, to a sync subscriber, with a snapshot
  that differs from the earlier one in identity but not in content.
- **Difference in behaviour.** A net-zero batch is silent in Legend 3 and
  notifies once in Legend 2.1.15 and in ours.
- **Proposal: reject.** Legend can do this because it has no snapshot object to
  keep consistent. A framework binding of ours reads `snapshot(store)` and
  compares identity; suppressing the notification while the version has moved
  would let a binding hold a snapshot that is no longer the cached one, or force
  the snapshot cache to treat a reverted version as unchanged. Structural
  sharing could in principle return the old snapshot after a revert, but that is
  a change to `snapshot.ts` for a rare case. This is reasoning from reading.
- **Kind:** performance.
- **Cost:** reject; none.

### 3. `batch()` with an `async` function

Bears on API questions 2 and 8.

- **What they do.** `batch(fn: () => void)` in both versions. 2.1.15 calls
  `fn()` inside `try/finally` and ends the batch (`batching.ts:268-285`);
  3.0 does the same (`batching.ts:489-497`). The return value is discarded, so
  `batch(async () => ...)` returns `undefined`. Neither version inspects it.
  `beginBatch()` arms a `setTimeout(onActionTimeout, 0)` that force-ends a batch
  still open on the next macrotask and prints "Forcibly completing
  observableBatcher because end() was never called" under
  `NODE_ENV === 'development'` (2.1.15 `batching.ts:25-34, 286-291`;
  3.0 `batching.ts:49-58`). That watchdog guards the low-level
  `beginBatch/endBatch` pair, not the async case: `batch()` always ends
  synchronously.
- **What we do.** `batch<T>(run: () => T): T` increments the depth, calls `run`,
  and decrements in `finally` (`core.ts:299-306`). It returns what `run`
  returns. The doc comment says the part after an `await` is not covered
  (`core.ts:282-283`).
- **Difference in behaviour.** Port B8, 2.1.15 and 3.0.0-next.1: one write
  before the `await`, two after; the listener has been called once when `batch`
  returns and three times when the promise settles; no warning. Ours: the same
  three calls, no warning, and `batch` returns the promise. In Legend that
  promise is dropped, so the mistake is invisible; in ours it is returned, which
  makes a check possible.
- **Proposal: adapt.** Two ways, both small. (a) A dev-only `console.warn`
  when `run()` returns a thenable, with a stable message. (b) A type that
  rejects a function returning a promise, for example a conditional type on the
  parameter; this needs a type test because inference through a conditional
  return is awkward (reading, not tried). Neither changes the runtime contract.
  Do not copy Legend's watchdog timer: it exists for an unbalanced
  `beginBatch/endBatch` pair, which we do not export.
- **Kind:** diagnostics.
- **Cost:** `core.ts` (about 5 lines) or `index.ts` types; not breaking; low
  risk.

### 4. Hydration is synchronous in Legend and asynchronous in ours

Bears on API question 8 only indirectly; it is the persistence design question
the brief asks about ("how hydration interacts with rendering on a server").

- **What they do.** The local-storage plugin reads synchronously
  (`persist-plugins/local-storage.ts:13-26` in both versions: `getTable` calls
  `storage.getItem` and parses). `loadLocal` / `loadPersistedLocal` call it and
  merge into the observable (2.1.15 `persistObservable.ts:520-616`; 3.0
  `syncObservable.ts:3296-3398`). The function is `async`, but it reaches its
  first `await` only when the plugin is not yet initialised or has an
  asynchronous `loadTable`. For `localStorage`, nothing is awaited, so the merge
  has run when the persistence call returns. On the server the plugin is built
  with `typeof localStorage !== 'undefined' ? localStorage : undefined`
  (`local-storage.ts:67-71` in 2.1.15) and `getTable` returns `undefined`
  without a storage object, so a server render sees the defaults and a client
  render sees the stored data. That would be a hydration mismatch, and I found
  no option for it (reading from the source; no server render was run).
- **What we do.** `persist()` starts `hydrateFromStorage()` and does not wait
  (`persist.ts:488-496`). It reads with `raw = await storage.getItem(name)`
  (`persist.ts:398`), and an `await` on a plain value still yields a
  microtask. So even a synchronous adapter delivers after the call returns.
  `skipHydration` and `rehydrate()` are the documented route for SSR
  (`persist.types.ts:101-106`).
- **Difference in behaviour.** Port P2, both versions of Legend: the observable
  holds 7 immediately after the call; ours holds 0 and reaches 7 after
  `await handle.hydrated`.
- **Proposal: adapt, as a decision for stage 3.** The case for a synchronous
  fast path: in a client-only app on `localStorage` the first render shows
  defaults and the second shows the saved state, a visible flash that Legend and
  Zustand's synchronous storage avoid. The case against: a synchronous restore
  inside `persist()` runs `migrate`, transforms and `merge` (user code) inside
  the caller's stack, and it makes hydration order depend on whether the adapter
  happens to be synchronous. The middle path is an option, for example
  `hydrate: 'sync' | 'async'`, defaulting to the current behaviour, so SSR stays
  safe. `getItem` returning a non-promise is the signal; `hydrated` would still
  resolve. This touches the restore-versus-local-edit logic (stage 1 finding
  56), which currently relies on the read being in flight.
- **Kind:** API design.
- **Cost:** `persist.ts`, `persist.types.ts`, docs and about 6 tests; additive if
  it is an option; medium risk because of finding 56.

### 5. No write is flushed when the page goes away

- **What they do.** Neither version has a `beforeunload`, `pagehide` or
  `visibilitychange` handler: the grep over `src/` finds listeners only in
  `useHover.ts`, `pageHash.ts` and `pageHashParams.ts`. It does not need one for
  local saves, because there is no local debounce: a change is queued in a
  microtask and written at once (3.0 `syncObservable.ts:3233-3246`, 2.1.15
  `persistObservable.ts:488-500`). `debounceSet` (3.0) and `saveTimeout` (the
  Firebase plugin) debounce the remote upload only (3.0
  `syncObservable.ts:518-530`), and they are not flushed either.
- **What we do.** `debounce` is for the local write (`persist.ts:247-259`) and
  nothing flushes the timer when the tab closes; `syncTabs` is the only global
  listener (`persist.ts:480-482`).
- **Difference in behaviour.** With `debounce: 500`, an edit made less than half
  a second before the tab closes is lost. Legend has no equivalent exposure
  because it has no local debounce. This is a gap the comparison exposes, not
  something Legend solved.
- **Proposal: adapt.** When `debounce > 0` and a timer is pending, flush on
  `pagehide` (and `visibilitychange` to `hidden`) with a synchronous
  `storage.setItem` when the adapter returned a non-promise; for an async
  adapter, start the write and accept it may not finish. Remove the listeners in
  `dispose()`. Add an option or make it the default when `debounce > 0`.
  Reading only; I did not test a browser unload.
- **Kind:** bug (data loss window), API design.
- **Cost:** `persist.ts`, one test file, docs; not breaking if added behind the
  existing `debounce`; low risk.

### 6. Telling a restore's writes from the user's

Stage 1 finding 54 (dead and redundant code in `persist.ts`) and the version
bookkeeping in `applyPersistedState`.

- **What they do.** Restores write inside a flag. In 3.0, `loadPersistedLocal`
  sets `internal.globalState.isLoadingLocal = true` around `mergeIntoObservable`
  (`syncObservable.ts:3386-3397`); `notify()` stores that flag on the batch
  entry (`batching.ts:143-165`, `isFromPersist`, `isFromSync`); listeners receive
  it as `isFromPersist` / `isFromSync` in their parameters, and `onObsChange`
  skips a change when `isFromPersist` is set (`syncObservable.ts:3183-3185`).
  2.1.15 reads the global flag when the listener runs instead
  (`persistObservable.ts:485-486`, `isLoadingLocal`, `isLoadingRemote`).
- **What we do.** After a batched notification we cannot tell who wrote, so
  `persist` records the versions it expects: `skipAutoSaveVersion`,
  `clearedVersion`, `expectedVersion`, `discardEditedFields()` and a baseline
  snapshot comparison (`persist.ts:128-129, 262-270, 281-382`). About 100 lines,
  and the area stage 1 found most to explain (finding 54, `persist.json`).
- **Difference in behaviour.** Equivalent results on the cases stage 1 pinned;
  Legend's flag is simpler but cannot express "a subscriber edited another field
  while the restore was running": there the restore's own batch is tagged as a
  whole.
- **Proposal: reject.** To copy the flag we would tag each pending notification
  in the core with its origin, because our persist subscriber runs in a later
  microtask, after the restore function has returned; Legend can carry the tag
  because its batch entries hold it. That puts persist-specific state into
  `core.ts` and widens the listener contract. The version scheme is local to
  `persist.ts` and exact. Keep it; if stage 3 wants fewer lines, simplify
  inside `persist.ts` (the four cancel-timer blocks and the unread assignments
  of finding 54), not by moving the logic.
- **Kind:** simplification (rejected).
- **Cost:** reject; none.

### 7. The storage contract, ready-made backends and async transforms

- **What they do.** A Legend backend is a class implementing a table-shaped
  interface: `getTable`, `set(table, changes)`, `deleteTable`, `getMetadata`,
  `setMetadata`, `deleteMetadata`, and optional `initialize` and `loadTable`
  (3.0 `sync/syncTypes.ts:146-155`; 2.1.15 `observableInterfaces.ts:222-231`).
  It receives changes by path and a metadata record for pending changes and
  `lastSync`. The library ships six: localStorage, sessionStorage, AsyncStorage,
  MMKV, IndexedDB and Expo SQLite. Backend-specific options live inside the
  generic option objects (`mmkv`, `indexedDB`, `options: any`;
  `syncTypes.ts:25-37`), and a plugin is instantiated once per class and shared
  (`syncObservable.ts:3316-3328`). Transforms are `transform: {load, save}`
  over the whole table, may return promises, and (2.1.15) `fieldTransforms`
  renames fields; a field mapped to null is not saved (2.1.15
  `persistObservable.ts:276-278`).
- **What we do.** `StorageAdapter` is `getItem`, `setItem`, `removeItem` on
  strings, sync or async (`persist.types.ts:10-14`): the Web Storage shape. A
  per-property transform is `{key, serialize, deserialize}`, synchronous
  (`persist.types.ts:22-31`). We ship no adapter.
- **Difference in behaviour.** Ours is simpler and is the shape every key-value
  store already has, so wrapping AsyncStorage, MMKV or `idb-keyval` is a few
  lines and encryption is a wrapper that encrypts the string in `setItem` and
  decrypts in `getItem` (reading from the types; not tried). Legend's table
  model is what lets IndexedDB store rows and SQLite store tables, which a
  string key cannot do. Our synchronous `serialize` cannot call an async
  encryption API; the adapter route can.
- **Proposal: keep the contract; adapt the docs.** Add short recipes for
  AsyncStorage, IndexedDB and an encrypting wrapper to the persist tutorial, as
  that is what a Legend user would otherwise look for. Reject a table model.
  Consider letting `serialize` and `deserialize` return a promise only if a real
  case needs it; the adapter already covers it.
- **Kind:** docs.
- **Cost:** `PERSIST_TUTORIAL.md`; not breaking.

### 8. Date, Map and Set round trip by default in Legend

Bears on API question 5.

- **What they do.** `safeStringify` replaces a `Date`, a `Map` and a `Set` with a
  tagged object, `{__LSType: 'Date' | 'Map' | 'Set', value}`, and `safeParse`
  revives it (3.0 `globals.ts:43-83`; 2.1.15 `helpers.ts:254-259`). Both local
  plugins use them. A stored object that merely looks like the tag is revived
  too, and a malformed one makes `new Map(value.value)` throw during parse;
  that is reasoning from reading, and a case for the security agent.
  3.0 stopped reviving plain ISO strings to dates, and prints a dev warning for
  them (`globals.ts:92-107`).
- **What we do.** `JSON.stringify` of the snapshot (`persist.ts:217`). A `Date`
  becomes a string, a `ReactiveMap` becomes whatever its snapshot serialises to,
  so these need a `PropertyTransform` (`persist.types.ts:16-31`). Stage 1
  finding 53 shows the envelope check is loose about shapes.
- **Difference in behaviour.** A store with a `Date` field persists with no
  configuration in Legend and needs a transform in ours.
- **Proposal: reject a tag format; adapt the docs.** A tag convention makes the
  stored format part of the contract and invites the prototype-pollution class
  of problem the security agent is asked to look at. A short "Dates, maps and
  sets" section in the tutorial with a ready-made transform for each is
  enough. Consider exporting those three transforms from the utils entry if the
  tutorial already repeats them.
- **Kind:** docs, API design.
- **Cost:** docs; optionally three small exports; not breaking.

### 9. Status: Legend has a pause switch and an in-flight count; we have neither

- **What they do.** The returned sync state is an observable with
  `isPersistLoaded`, `isPersistEnabled`, `isSyncEnabled`, `lastSync`,
  `syncCount`, `isGetting`, `isSetting`, `numPendingGets`, `numPendingSets`,
  `error`, `sync()`, `getPendingChanges()`, `resetPersistence()` and `reset()`
  (3.0 `observableInterfaces.ts:199-231`). Setting `isPersistEnabled` to false
  stops saving (`syncObservable.ts:566, 677`); `readonly` in the persist options
  does the same statically. Errors go to `syncState.error` and to
  `onError(error, {source, type, retry, ...})` (`syncObservable.ts:432-445`).
- **What we do.** `PersistStatus` holds `isHydrated`, `isExpired`, `isDisposed`
  and `lastError`, observable through `UtilityStatusSource`
  (`persist.types.ts:148-188`), plus `dispose`, `save`, `clear`, `rehydrate`.
- **Difference in behaviour.** Ours is smaller and, because `dispose()` exists,
  covers stopping for good. A user who wants to pause saving for a while (for
  example while loading a document from a server) has to dispose and
  re-attach, losing the handle. There is no "a write is in flight" signal for a
  "Saving..." indicator; `save()` resolves when its write ends, which covers the
  explicit case only.
- **Proposal: reject for now.** Neither is a gap that stage 3 should fill before
  1.0 unless the owner uses them. If one is wanted, a `pause()` and `resume()`
  on the handle that stop `scheduleWrite` and take a save on resume is about 10
  lines; an `isSaving` field in `PersistStatus` is the one addition the status
  type can take later without breaking anyone.
- **Kind:** API design.
- **Cost:** `persist.ts`, `persist.types.ts`; additive.

### 10. Cross-tab and conflicts: Legend has none locally; ours is last writer wins

- **What they do.** There is no `storage` event handling in either version (grep
  over `src/`). The local-storage plugin keeps the parsed table in a field,
  `data[table]`, filled on the first read and updated by every `set`
  (`local-storage.ts:14-38`). It therefore never sees another tab's write, and
  its next save writes its cached copy back, so the other tab's change is lost.
  Port P4: another tab writes `b = 99`; this tab then sets `a`; the stored
  record is `{a: 1, b: 0}`, both versions. Conflict settlement exists only for
  the remote: pending local paths are replayed over server data after a `get`
  (2.1.15 `persistObservable.ts:724-748`; 3.0 `syncObservable.ts:3400-3532` and
  the reconciliation functions that follow), with `mode` choosing set, assign,
  merge, append or prepend (`GetMode`, `observableInterfaces.ts:165`) and
  `lastSync` as the cursor.
- **What we do.** `syncTabs` listens for the `storage` event, ignores deletions
  and obsolete values, cancels a pending debounced write, and restores field by
  field (`persist.ts:446-476`). A write in this tab replaces the whole stored
  record. Port P4 on ours without `syncTabs`: the same `{a: 1, b: 0}`, because we
  also serialise the whole selected state.
- **Difference in behaviour.** With `syncTabs` on, ours would have taken `b = 99`
  before the local write; Legend cannot. Neither has per-field merging of two
  tabs' concurrent edits: whichever tab saves last wins the whole record.
- **Proposal: reject remote sync; adapt the docs.** Remote sync with pending
  replay is a product of its own (about 3,000 lines in Legend) and does not
  belong in a 1.0 persist util. What the comparison does show is that the
  tutorial's `syncTabs` section should say plainly that two tabs editing
  different fields at once is last-writer-wins on the whole record, which is
  not obvious from "Tab B automatically receives the update". Per-field storage
  (one key per property) would remove it but is a different design.
- **Kind:** docs.
- **Cost:** `PERSIST_TUTORIAL.md`; not breaking.

### 11. Unknown stored keys are merged in Legend and dropped in ours

Stage 1 findings 52, 53 and 55 concern what `persist` accepts from storage.

- **What they do.** Whatever the record holds is merged into the observable with
  `mergeIntoObservable` (3.0 `syncObservable.ts:3390-3394`; 2.1.15
  `persistObservable.ts:601`). There is no property list to filter by. Port P3:
  a stored `{old: 1, count: 7}` over `{count: 0}` leaves the observable with the
  keys `count` and `old`, both versions. A falsy root replaces the default
  (`syncObservable.ts:3390-3392`), and a non-object root is accepted.
- **What we do.** Only keys in `propKeys` are written, and only those present in
  the merged state (`persist.ts:337-339, 360-365`). Port P3 on ours: the keys
  are `['count']`. Stage 1 finding 53 notes that an array in `state` still
  passes the envelope check, so the filter is by key name, not by shape.
- **Difference in behaviour.** After a schema change Legend keeps stale keys in
  live state and rewrites them on the next save; ours ignores them and drops
  them on the next save. That is also why ours can be the safer one against a
  stored `__proto__` key (the security agent's area).
- **Proposal: keep ours.** The `properties` allow-list, resolved once at attach
  (`persist.ts:160-168`), is the thing Legend lacks. Say in the docs that
  unknown stored keys are ignored and removed on the next save, because it is
  the reason `migrate` is only needed for renames and shape changes.
- **Kind:** docs.
- **Cost:** `PERSIST_TUTORIAL.md`; none.

## Where we already do better

1. **Listener isolation** (finding 1): ours is the 3.0 behaviour minus the
   rethrow, and far better than 2.1.15.
2. **Schema version and migration.** Legend has none. The only version is a
   marker for the serialiser's own format, `__LSFormat: 1` in the metadata
   record (3.0 `persistFormat.ts:5-9, 44-50`), used to decide how to revive
   dates. An app that renames a field has to do it inside `transform.load`
   without being told which version it is reading. `grep -rn migrat src` finds
   nothing relevant in either version. Ours: `version`, `migrate`, `merge`
   (`persist.ts:310-315`).
3. **Expiry.** No TTL in Legend (grep for `expire`, `ttl` in the persist and sync
   folders: no match). Ours: `expireIn`, `clearOnExpire`.
4. **An edit made before the stored data arrives.** Legend refuses to save it:
   it logs "An observable was changed before being loaded from persist" and
   returns, so the change stays in memory and reaches storage only if a later
   change happens (2.1.15 `persistObservable.ts:230-235`; 3.0
   `syncObservable.ts:569-576, 680-688`). Ours holds the save until the read
   settles and then writes the merged state (`persist.ts:235-244, 436-439`).
5. **A corrupt record.** Port P1: both libraries fall back to the defaults and
   overwrite the bad record on the next save. Legend says so with one
   `console.error` and no callback; the plugin catches the parse error itself
   (`local-storage.ts:17-22`), so the application never hears. Ours calls
   `onError(error, 'parse')` and sets `lastError` in the status. Neither keeps a
   copy of the bad record.
6. **Write coalescing in 2.1.15.** Port P5: three writes in one tick give three
   `setItem` calls in 2.1.15 (each write is its own queued change), one in 3.0
   (`mergeQueuedChanges`, `syncObservable.ts:406-431, 449`), and one in ours. In
   3.0 the first write after loading a record that predates the format marker
   also writes a second key; a record already in the current format gets one.
7. **A handle with `dispose`.** Legend's local persistence cannot be detached
   from an observable.
8. **Cross-tab sync, debounce for local writes and `skipHydration`** have no
   counterpart.

## Our options next to Legend's

Options of ours that look unusual beside it, and what that tells us:

| Option                      | In Legend                                                     | Reading                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`, `migrate`        | Absent                                                        | Not unusual overall (Zustand has both); a real advantage over Legend.                                                                                                       |
| `merge`                     | Always a merge into the initial value; no choice              | Ours is an option with one non-default value; fine.                                                                                                                         |
| `expireIn`, `clearOnExpire` | Absent                                                        | The only options with no precedent in the libraries read so far. Two options for one concept; a single `expireIn` with the clearing as the default is worth a stage 3 look. |
| `syncTabs`                  | Absent                                                        | A browser-only listener behind a boolean. Keep.                                                                                                                             |
| `skipHydration`             | Absent (hydration is synchronous)                             | Exists because of finding 4; the two decisions go together.                                                                                                                 |
| `debounce`                  | Remote only (`debounceSet`); local writes are immediate       | Brings the unload gap of finding 5.                                                                                                                                         |
| `properties` allow-list     | Absent (whole observable; `fieldTransforms` can drop a field) | Useful; finding 52 and 55 of stage 1 are its edge cases. Consider throwing on an entry that is neither a key nor a complete transform.                                      |

Features a user of ours would miss, most to least likely:

1. A synchronous first render with saved data (finding 4).
2. Dates, maps and sets saved without a transform (finding 8).
3. Ready-made backends for AsyncStorage, MMKV, IndexedDB, SQLite (finding 7).
4. A pause switch and an in-flight flag (finding 9).
5. Remote sync with retry, back-off and replay of pending changes. Out of scope.

## Stage 1 findings with a counterpart

| Stage 1 finding                                 | Legend-State                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 18 (sync subscriber that writes recurses)       | A write inside a listener is applied and the written node's listeners run (port B7, both versions: order `a,b`). No loop guard was looked for. |
| 22 (re-entrant write delivers a snapshot twice) | No snapshots; not comparable.                                                                                                                  |
| 23 (rejected promise from a subscriber)         | Listener return values are ignored in `batchNotifyChanges`; an async listener's rejection is unhandled, as in ours. Reading only.              |
| 43 (a setter is not a transaction)              | Legend has no class setters. Its equivalent is a computed's `set`; not read.                                                                   |
| 52 (a getter named in `properties` is saved)    | No allow-list, so no counterpart. Computeds are not persisted unless they are the persisted observable. Not tested.                            |
| 53 (an array passes the envelope check)         | Any JSON root is accepted; falsy roots replace the default, objects and arrays merge (`syncObservable.ts:3390-3394`). No envelope to check.    |
| 54 (dead code in `persist.ts`)                  | See finding 6; Legend's flag approach has none of these blocks but moves the logic into the core.                                              |
| 55 (malformed `properties` entry ignored)       | No allow-list.                                                                                                                                 |
| 56 (when a debounced save runs against a read)  | Legend drops a change made before load with a console error (finding in "Where we already do better", item 4); it has no local debounce.       |

## The eight API questions, from Legend's point of view

1. **Should synchronous notification be the default for `subscribe()`?** Legend's
   default is synchronous per write (port B1), and it needs `batch()` and
   per-write batching inside `set` to make that tolerable. Its persistence
   layer then adds its own microtask queue on top (3.0
   `syncObservable.ts:3244-3246`, 2.1.15 `persistObservable.ts:498-499`), which
   is what we have built in as the default. Legend is evidence that synchronous
   delivery is workable; it is not evidence that ordinary subscribers should
   have it, because Legend's framework bindings are the ones that want it. No
   stronger position.
2. **Writes outside a method, and `batch()`.** Legend has no methods: every
   write is outside one, and nothing warns. Grouping is explicit, with `batch()`
   exported and used inside the library for compound writes (`assign`,
   persistence restores). `batch` belongs in the API there because the default
   is per-write notification; for us the default already coalesces, so `batch`
   serves sync subscribers and framework bindings. Nested batches fold into the
   outermost (port B3), a throwing body still notifies and rethrows (port B4),
   and a write undone inside a batch is silent in 3.0 only (port B6, finding 2). Neither
   library groups an `async` body (finding 3). Position: keep `batch`; do not
   try to group automatically.
3. **Snapshot getters as enumerable own accessors.** No position (no snapshots).
4. **Arrow-function methods and `#private` fields.** No position (Legend is not
   class based).
5. **Native `Map` and `Set` reactive directly.** Legend observes native Map and
   Set and persists them as tagged JSON (3.0 `globals.ts:49-58`;
   `batching.ts` handles `Map` in its previous-value rebuild). I did not test
   its Map reactivity. No stronger position.
6. **Opt-in or opt-out for nested class instances.** Legend wraps plain objects
   and arrays by default and has an opaque marker to exclude one (a symbol check
   in `updateNodes`, 2.1.15 `ObservableObject.ts:105-135`; `ObservableHint.ts`
   in 3.0, not read). That is opt-out. Reading only.
7. **Entry points and names consistent across the five frameworks.** No
   position. Observation only: Legend splits by concern (`/persist`, `/sync`,
   `/persist-plugins/*`), not by framework.
8. **Development-only diagnostics.** Legend has about 30 branches gated on
   `process.env.NODE_ENV === 'development'` (sometimes also `'test'`), each with
   a `[legend-state]` prefix: a circular reference, an `HTMLElement` set into
   state, `toggle` on a non-boolean, duplicate ids in an array, an observable
   changed before its persistence loaded, a missing `name` on `persist`, an
   unfinished batch (3.0 `grep` result, listed under files read). Transfers to
   us: (a) a dev warning when `batch()` receives a promise (finding 3); (b) the
   "changed before loaded" warning is not needed because we defer the save; (c)
   a missing `name` is already a type error for us. The watchdog timer for an
   unbalanced batch does not apply. Bigger point: the split is a plain
   `NODE_ENV` read, so the checks vanish from a minified build, which is what
   the stage 3 diagnostics work needs. Both versions call `process.env` inline;
   3.0 caches the result in a variable for speed (`globals.ts:88-92`).

## What I verified by running code, and what I only read

Ran (appendix): batching behaviour on 2.1.15, 3.0.0-next.1 and ours (B1 to B8);
listener failure in 2.1.15 in an isolated process; persistence behaviour on all
three (P1 to P5). The localStorage in the ports is a map-backed stand-in with the
`getItem`, `setItem` and `removeItem` calls the plugins use; no browser was
involved, so nothing was tested about real `storage` events, quotas, or
page unload.

Only read: every claim about `syncObservable.ts` outside the lines listed
(pending-change replay, `lastSync`, retry, `mode`), the Firebase, IndexedDB,
MMKV, AsyncStorage and SQLite plugins, `isPersistEnabled` behaviour, the Map
reactivity in Legend, `ObservableHint`, and finding 2's argument about snapshot
identity in our core.

Not done: Legend's website documentation was not consulted, per the brief.

## Appendix: ported tests and their output

Ports were run with `bun <file>`. The two Legend versions use separate folders
under the scratch directory, `ports/` (2.1.15) and `ports3/` (3.0.0-next.1);
the ours ports import our source by absolute path.

### Batching, Legend-State

The same file runs against each version. B5 comes last because in 2.1.15 it breaks the batcher for the rest of the process (a first run with it in the middle showed this).

`ports/batch.legend.ts`

```ts
import {observable, batch} from '@legendapp/state';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const pkg = JSON.parse(
  await Bun.file(
    import.meta.dir + '/node_modules/@legendapp/state/package.json',
  ).text(),
).version;
console.log('legend-state', pkg);

// B1 write outside batch: when does the listener run?
{
  const o = observable({a: 0});
  let calls = 0;
  o.onChange(() => calls++);
  o.a.set(1);
  console.log(
    'B1 write outside batch, listener calls right after write:',
    calls,
  );
}
// B2 three writes in a batch
{
  const o = observable({a: 0, b: 0, c: 0});
  const seen: number[] = [];
  o.onChange((p) => seen.push(p.changes.length));
  batch(() => {
    o.a.set(1);
    o.b.set(1);
    o.c.set(1);
  });
  console.log(
    'B2 three writes in batch: calls, changes per call =',
    JSON.stringify(seen),
  );
}
// B3 nested batch
{
  const o = observable({a: 0, b: 0});
  let calls = 0;
  o.onChange(() => calls++);
  batch(() => {
    batch(() => {
      o.a.set(1);
    });
    console.log('B3 after inner batch, calls =', calls);
    o.b.set(1);
  });
  console.log('B3 after outer batch, calls =', calls);
}
// B4 throwing batch body
{
  const o = observable({a: 0});
  let calls = 0;
  o.onChange(() => calls++);
  let thrown: unknown;
  try {
    batch(() => {
      o.a.set(1);
      throw new Error('boom');
    });
  } catch (e) {
    thrown = e;
  }
  console.log(
    'B4 throwing batch: error propagated =',
    (thrown as Error)?.message,
    ', listener calls =',
    calls,
  );
}
// B6 revert inside batch
{
  const o = observable({a: 0});
  let calls = 0;
  o.onChange(() => calls++);
  batch(() => {
    o.a.set(1);
    o.a.set(0);
  });
  console.log('B6 a 0->1->0 inside batch: calls =', calls);
}
// B7 write inside listener
{
  const o = observable({a: 0, b: 0});
  const log: string[] = [];
  o.a.onChange(() => {
    log.push('a');
    o.b.set(5);
  });
  o.b.onChange(() => log.push('b'));
  o.a.set(1);
  console.log('B7 write in listener, order =', log.join(','));
}
// B5 throwing listener: do others run, do later writes notify?
{
  const o = observable({a: 0});
  let second = 0,
    later = 0;
  o.onChange(() => {
    throw new Error('listener boom');
  });
  o.onChange(() => second++);
  let err: unknown;
  try {
    o.a.set(1);
  } catch (e) {
    err = e;
  }
  console.log(
    'B5 throwing listener: write threw =',
    (err as Error)?.message,
    ', second listener ran =',
    second,
  );
  const o2 = observable({x: 0});
  o2.onChange(() => later++);
  try {
    o2.x.set(1);
  } catch {}
  try {
    o2.x.set(2);
  } catch {}
  console.log(
    'B5 a different observable afterwards: listener calls (expect 2) =',
    later,
  );
}
```

Output, `batch.v2.txt`:

```text
legend-state 2.1.15
B1 write outside batch, listener calls right after write: 1
B2 three writes in batch: calls, changes per call = [3]
B3 after inner batch, calls = 0
B3 after outer batch, calls = 1
B4 throwing batch: error propagated = boom , listener calls = 1
B6 a 0->1->0 inside batch: calls = 1
B7 write in listener, order = a,b
B5 throwing listener: write threw = listener boom , second listener ran = 0
B5 a different observable afterwards: listener calls (expect 2) = 0
```

Output, `batch.v3.txt`:

```text
legend-state 3.0.0-next.1
B1 write outside batch, listener calls right after write: 1
B2 three writes in batch: calls, changes per call = [3]
B3 after inner batch, calls = 0
B3 after outer batch, calls = 1
B4 throwing batch: error propagated = boom , listener calls = 1
B6 a 0->1->0 inside batch: calls = 0
B7 write in listener, order = a,b
B5 throwing listener: write threw = listener boom , second listener ran = 1
B5 a different observable afterwards: listener calls (expect 2) = 2
```

### A throwing listener in 2.1.15, alone in its process

`ports/b5.iso.ts`

```ts
import {observable} from '@legendapp/state';
const o = observable({a: 0});
let second = 0;
o.onChange(() => {
  throw new Error('boom');
});
o.onChange(() => second++);
try {
  o.a.set(1);
} catch (e) {
  console.log('threw', (e as Error).message);
}
const p = observable({x: 0});
let later = 0;
p.onChange(() => later++);
p.x.set(1);
p.x.set(2);
console.log(
  'second listener ran:',
  second,
  '| unrelated observable listener calls after two writes (expect 2):',
  later,
);
setTimeout(
  () => console.log('after a macrotask, unrelated observable calls:', later),
  5,
);
```

Output, `b5iso.v2.txt`:

```text
threw boom
second listener ran: 0 | unrelated observable listener calls after two writes (expect 2): 0
after a macrotask, unrelated observable calls: 0
```

### Batching, ours

B5 on ours has `write threw = undefined` because `deliver()` sends the error to `console.error`, which the script counts.

`ports/batch.ours.ts`

```ts
import {
  batch,
  createClassyStore,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const origError = console.error;
let loggedErrors = 0;
console.error = () => {
  loggedErrors++;
};
const make = () => createClassyStore({a: 0, b: 0, c: 0});
// B1
{
  const s = make();
  let sync = 0,
    async_ = 0;
  subscribe(s, () => sync++, {sync: true});
  subscribe(s, () => async_++);
  s.a = 1;
  console.log(
    'B1 write outside batch: sync subscriber calls right after =',
    sync,
    ', default subscriber calls right after =',
    async_,
  );
  await flush();
  console.log('B1 default subscriber after a tick =', async_);
}
// B2
{
  const s = make();
  let sync = 0,
    def = 0;
  subscribe(s, () => sync++, {sync: true});
  subscribe(s, () => def++);
  batch(() => {
    s.a = 1;
    s.b = 1;
    s.c = 1;
  });
  await flush();
  console.log(
    'B2 three writes in batch: sync calls =',
    sync,
    ', default calls =',
    def,
    '(no change list is passed)',
  );
}
// B3
{
  const s = make();
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  batch(() => {
    batch(() => {
      s.a = 1;
    });
    console.log('B3 after inner batch, sync calls =', calls);
    s.b = 1;
  });
  console.log('B3 after outer batch, sync calls =', calls);
}
// B4
{
  const s = make();
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  let thrown: any;
  try {
    batch(() => {
      s.a = 1;
      throw new Error('boom');
    });
  } catch (e) {
    thrown = e;
  }
  console.log(
    'B4 throwing batch: error propagated =',
    thrown?.message,
    ', sync calls =',
    calls,
  );
}
// B5
{
  const s = make();
  let second = 0;
  const s2 = make();
  let later = 0;
  subscribe(
    s,
    () => {
      throw new Error('listener boom');
    },
    {sync: true},
  );
  subscribe(s, () => second++, {sync: true});
  let err: any;
  try {
    s.a = 1;
  } catch (e) {
    err = e;
  }
  subscribe(s2, () => later++, {sync: true});
  s2.a = 1;
  s2.a = 2;
  console.log(
    'B5 throwing listener: write threw =',
    err?.message,
    ', second listener ran =',
    second,
    ', console.error calls =',
    loggedErrors,
    ', other store calls (expect 2) =',
    later,
  );
}
// B6
{
  const s = make();
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  batch(() => {
    s.a = 1;
    s.a = 0;
  });
  console.log('B6 a 0->1->0 inside batch: sync calls =', calls);
}
// B7
{
  const s = make();
  const log: string[] = [];
  subscribe(
    s,
    () => {
      log.push('first');
      if (log.length === 1) s.b = 5;
    },
    {sync: true},
  );
  s.a = 1;
  console.log('B7 write in listener, log =', log.join(','));
}
console.error = origError;
```

Output, `batch.ours.txt`:

```text
B1 write outside batch: sync subscriber calls right after = 1 , default subscriber calls right after = 0
B1 default subscriber after a tick = 1
B2 three writes in batch: sync calls = 1 , default calls = 1 (no change list is passed)
B3 after inner batch, sync calls = 0
B3 after outer batch, sync calls = 1
B4 throwing batch: error propagated = boom , sync calls = 1
B5 throwing listener: write threw = undefined , second listener ran = 1 , console.error calls = 1 , other store calls (expect 2) = 2
B6 a 0->1->0 inside batch: sync calls = 1
B7 write in listener, log = first,first
```

### `batch()` with an async function

Outputs in order: 2.1.15, 3.0.0-next.1, ours.

`ports/batch.async.legend.ts`

```ts
import {observable, batch} from '@legendapp/state';
const o = observable({a: 0, b: 0, c: 0});
let calls = 0;
o.onChange(() => calls++);
const warn: any[] = [];
const w = console.warn;
console.warn = (...a) => warn.push(a);
const e = console.error;
console.error = (...a) => warn.push(a);
const p = batch(async () => {
  o.a.set(1);
  await null;
  o.b.set(1);
  o.c.set(1);
});
console.log(
  'B8 async batch: calls right after batch() returned =',
  calls,
  '| returned a promise =',
  p instanceof Promise,
);
await p;
await new Promise((r) => setTimeout(r, 5));
console.log(
  'B8 after the awaited writes: calls =',
  calls,
  '| warnings =',
  warn.length,
);
console.warn = w;
console.error = e;
```

`ports/batch.async.ours.ts`

```ts
import {
  batch,
  createClassyStore,
  subscribe,
} from '<repo>/packages/classy-store/src/index.ts';
const s = createClassyStore({a: 0, b: 0, c: 0});
let calls = 0;
subscribe(s, () => calls++, {sync: true});
const warn: any[] = [];
const w = console.warn;
console.warn = (...a) => warn.push(a);
const e = console.error;
console.error = (...a) => warn.push(a);
const p = batch(async () => {
  s.a = 1;
  await null;
  s.b = 1;
  s.c = 1;
});
console.log(
  'B8 async batch: sync calls right after batch() returned =',
  calls,
  '| returned a promise =',
  p instanceof Promise,
);
await p;
await new Promise((r) => setTimeout(r, 5));
console.log(
  'B8 after the awaited writes: sync calls =',
  calls,
  '| warnings =',
  warn.length,
);
console.warn = w;
console.error = e;
```

Output, `async.v2.txt`:

```text
B8 async batch: calls right after batch() returned = 1 | returned a promise = false
B8 after the awaited writes: calls = 3 | warnings = 0
```

Output, `async.v3.txt`:

```text
B8 async batch: calls right after batch() returned = 1 | returned a promise = false
B8 after the awaited writes: calls = 3 | warnings = 0
```

Output, `async.ours.txt`:

```text
B8 async batch: sync calls right after batch() returned = 1 | returned a promise = true
B8 after the awaited writes: sync calls = 3 | warnings = 0
```

### Persistence, Legend-State 2.1.15

`ports/persist.legend.v2.ts`

```ts
// Legend-State 2.1.15
const store = new Map<string, string>();
let writes = 0;
const writeLog: string[] = [];
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    writes++;
    writeLog.push(k);
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};
const {observable} = await import('@legendapp/state');
const {persistObservable} = await import('@legendapp/state/persist');
const {ObservablePersistLocalStorage} = await import(
  '@legendapp/state/persist-plugins/local-storage'
);
const flush = () => new Promise<void>((r) => setTimeout(r, 20));
const errs: unknown[][] = [];
const origErr = console.error;
console.error = (...a) => errs.push(a);
const mk = (name: string, init: any) => {
  const o = observable(init);
  persistObservable(o, {
    local: name,
    pluginLocal: ObservablePersistLocalStorage,
  });
  return o;
};

// P1 corrupt record, then a save
store.set('p1', '{not json');
{
  const o = mk('p1', {count: 0});
  console.log(
    'P1 value right after attach =',
    JSON.stringify(o.peek()),
    '| console.error calls =',
    errs.length,
    '| error text =',
    String(errs[0]?.[0]),
  );
  await flush();
  o.count.set(5);
  await flush();
  console.log('P1 stored after a later save =', store.get('p1'));
}
// P2 synchronous hydration
store.set('p2', JSON.stringify({count: 7}));
{
  const o = mk('p2', {count: 0});
  console.log('P2 value immediately after attach (no await) =', o.peek().count);
}
// P3 stored record from an older shape holds an unknown key
store.set('p3', JSON.stringify({old: 1, count: 7}));
{
  const o = mk('p3', {count: 0});
  await flush();
  console.log(
    'P3 keys after hydrating {old:1,count:7} over {count:0} =',
    JSON.stringify(Object.keys(o.peek())),
  );
}
// P4 what is written for one changed field
store.set('p4', JSON.stringify({a: 0, b: 0}));
{
  const o = mk('p4', {a: 0, b: 0});
  await flush();
  store.set('p4', JSON.stringify({a: 0, b: 99})); // another tab writes
  o.a.set(1);
  await flush();
  console.log(
    'P4 after another tab wrote b=99 and this tab set a=1, stored =',
    store.get('p4'),
  );
}
// P5 write per mutation: 3 sets in separate ticks vs same tick
store.set('p5', JSON.stringify({a: 0}));
{
  const o = mk('p5', {a: 0});
  await flush();
  writes = 0;
  writeLog.length = 0;
  o.a.set(1);
  o.a.set(2);
  o.a.set(3);
  await flush();
  console.log(
    'P5 three writes in one tick -> storage setItem calls =',
    writes,
    JSON.stringify(writeLog),
  );
}
console.error = origErr;
```

Output, `persist.v2.txt`:

```text
P1 value right after attach = {"count":0} | console.error calls = 1 | error text = [legend-state] ObservablePersistLocalStorage failed to parse
P1 stored after a later save = {"count":5}
P2 value immediately after attach (no await) = 7
P3 keys after hydrating {old:1,count:7} over {count:0} = ["count","old"]
P4 after another tab wrote b=99 and this tab set a=1, stored = {"a":1,"b":0}
P5 three writes in one tick -> storage setItem calls = 3 ["p5","p5","p5"]
```

### Persistence, Legend-State 3.0.0-next.1

Differs from the 2.1.15 file in the import, the attach call, and the added P5b.

`ports3/persist.legend.v3.ts`

```ts
// Legend-State 3.0.0-next.1
const store = new Map<string, string>();
let writes = 0;
const writeLog: string[] = [];
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    writes++;
    writeLog.push(k);
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};
const {observable} = await import('@legendapp/state');
const {syncObservable} = await import('@legendapp/state/sync');
const {ObservablePersistLocalStorage} = await import(
  '@legendapp/state/persist-plugins/local-storage'
);
const flush = () => new Promise<void>((r) => setTimeout(r, 20));
const errs: unknown[][] = [];
const origErr = console.error;
console.error = (...a) => errs.push(a);
const mk = (name: string, init: any) => {
  const o = observable(init);
  syncObservable(o, {persist: {name, plugin: ObservablePersistLocalStorage}});
  return o;
};

// P1 corrupt record, then a save
store.set('p1', '{not json');
{
  const o = mk('p1', {count: 0});
  console.log(
    'P1 value right after attach =',
    JSON.stringify(o.peek()),
    '| console.error calls =',
    errs.length,
    '| error text =',
    String(errs[0]?.[0]),
  );
  await flush();
  o.count.set(5);
  await flush();
  console.log('P1 stored after a later save =', store.get('p1'));
}
// P2 synchronous hydration
store.set('p2', JSON.stringify({count: 7}));
{
  const o = mk('p2', {count: 0});
  console.log('P2 value immediately after attach (no await) =', o.peek().count);
}
// P3 stored record from an older shape holds an unknown key
store.set('p3', JSON.stringify({old: 1, count: 7}));
{
  const o = mk('p3', {count: 0});
  await flush();
  console.log(
    'P3 keys after hydrating {old:1,count:7} over {count:0} =',
    JSON.stringify(Object.keys(o.peek())),
  );
}
// P4 what is written for one changed field
store.set('p4', JSON.stringify({a: 0, b: 0}));
{
  const o = mk('p4', {a: 0, b: 0});
  await flush();
  store.set('p4', JSON.stringify({a: 0, b: 99})); // another tab writes
  o.a.set(1);
  await flush();
  console.log(
    'P4 after another tab wrote b=99 and this tab set a=1, stored =',
    store.get('p4'),
  );
}
// P5 write per mutation: 3 sets in separate ticks vs same tick
store.set('p5', JSON.stringify({a: 0}));
{
  const o = mk('p5', {a: 0});
  await flush();
  writes = 0;
  writeLog.length = 0;
  o.a.set(1);
  o.a.set(2);
  o.a.set(3);
  await flush();
  console.log(
    'P5 three writes in one tick -> storage setItem calls =',
    writes,
    JSON.stringify(writeLog),
  );
}
console.error = origErr;
// P5b same as P5 but over a record already written by Legend (not a legacy record), second round of writes
{
  const o = mk('p5', {a: 0});
  await flush();
  writes = 0;
  writeLog.length = 0;
  o.a.set(10);
  o.a.set(11);
  o.a.set(12);
  await flush();
  console.log(
    'P5b three more writes in one tick, record already in the current format -> storage setItem calls =',
    writes,
    JSON.stringify(writeLog),
  );
}
```

Output, `persist.v3.txt`:

```text
P1 value right after attach = {"count":0} | console.error calls = 1 | error text = [legend-state] ObservablePersistLocalStorageBase failed to parse
P1 stored after a later save = {"count":5}
P2 value immediately after attach (no await) = 7
P3 keys after hydrating {old:1,count:7} over {count:0} = ["count","old"]
P4 after another tab wrote b=99 and this tab set a=1, stored = {"a":1,"b":0}
P5 three writes in one tick -> storage setItem calls = 2 ["p5","p5__m"]
P5b three more writes in one tick, record already in the current format -> storage setItem calls = 1 ["p5"]
```

### Persistence, ours

P1 in ours reads the status through `getSnapshot()`; the other ports use `onError` and storage contents.

`ports/persist.ours.ts`

```ts
import {createClassyStore} from '<repo>/packages/classy-store/src/index.ts';
import {persist} from '<repo>/packages/classy-store/src/utils/persist/persist.ts';
const store = new Map<string, string>();
let writes = 0;
const writeLog: string[] = [];
const storage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    writes++;
    writeLog.push(k);
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};
const flush = () => new Promise<void>((r) => setTimeout(r, 20));
const errors: Array<[unknown, string]> = [];
const mk = (name: string, init: any) => {
  const s = createClassyStore(init);
  const h = persist(s, {
    name,
    storage,
    onError: (e, op) => errors.push([e, op]),
  });
  return {s, h};
};
// P1
store.set('p1', '{not json');
{
  const {s, h} = mk('p1', {count: 0});
  await h.hydrated;
  console.log(
    'P1 value after hydrated =',
    JSON.stringify(s),
    '| onError calls =',
    errors.length,
    'operation =',
    errors[0]?.[1],
    '| status.lastError.operation =',
    h.getSnapshot?.().lastError?.operation,
  );
  s.count = 5;
  await flush();
  console.log('P1 stored after a later save =', store.get('p1'));
}
// P2
store.set('p2', JSON.stringify({version: 0, state: {count: 7}}));
{
  const {s, h} = mk('p2', {count: 0});
  console.log('P2 value immediately after attach (no await) =', s.count);
  await h.hydrated;
  console.log('P2 value after hydrated =', s.count);
}
// P3
store.set('p3', JSON.stringify({version: 0, state: {old: 1, count: 7}}));
{
  const {s, h} = mk('p3', {count: 0});
  await h.hydrated;
  console.log(
    'P3 keys after hydrating {old:1,count:7} over {count:0} =',
    JSON.stringify(Object.keys(s)),
  );
}
// P4
store.set('p4', JSON.stringify({version: 0, state: {a: 0, b: 0}}));
{
  const {s, h} = mk('p4', {a: 0, b: 0});
  await h.hydrated;
  store.set('p4', JSON.stringify({version: 0, state: {a: 0, b: 99}}));
  s.a = 1;
  await flush();
  console.log(
    'P4 after another tab wrote b=99 and this tab set a=1 (no syncTabs), stored =',
    store.get('p4'),
  );
}
// P5
store.set('p5', JSON.stringify({version: 0, state: {a: 0}}));
{
  const {s, h} = mk('p5', {a: 0});
  await h.hydrated;
  await flush();
  writes = 0;
  writeLog.length = 0;
  s.a = 1;
  s.a = 2;
  s.a = 3;
  await flush();
  console.log(
    'P5 three writes in one tick -> storage setItem calls =',
    writes,
    JSON.stringify(writeLog),
  );
}
```

Output, `persist.ours.txt`:

```text
P1 value after hydrated = {"count":0} | onError calls = 1 operation = parse | status.lastError.operation = parse
P1 stored after a later save = {"version":0,"state":{"count":5}}
P2 value immediately after attach (no await) = 0
P2 value after hydrated = 7
P3 keys after hydrating {old:1,count:7} over {count:0} = ["count"]
P4 after another tab wrote b=99 and this tab set a=1 (no syncTabs), stored = {"version":0,"state":{"a":1,"b":0}}
P5 three writes in one tick -> storage setItem calls = 1 ["p5"]
```

# Stage 2: Zustand and Jotai (API read)

Stage 2 of the pre-1.0 review, 2026-11-19. Read-only: nothing in the
repository was changed apart from this file. This is an API read, as the brief
asks: documentation and public API first, source only at the files named.

## Libraries, versions and files read

- **Zustand 5.1.0**, `https://github.com/pmndrs/zustand`, tag `v5.1.0`, commit
  `9fed2eb2f3af672da9f7bf694b996df3831fc207` (2026-11-06), which is the npm
  `latest` tag on 2026-11-19. Read under `src/`: `react.ts`, `traditional.ts`,
  `react/shallow.ts`, `vanilla.ts` whole; `middleware/persist.ts` whole;
  `middleware/devtools.ts` lines 1 to 560 (the part that decides action names,
  connection handling and every message handled; the rest is the action-dropdown
  helpers); `middleware/subscribeWithSelector.ts` and `middleware/ssrSafe.ts`
  whole. Docs read: `docs/reference/middlewares/persist.md` and `devtools.md`
  (parameters and troubleshooting), `docs/learn/guides/nextjs.md`,
  `ssr-and-hydration.md`, and the "Changes in v5" part of
  `docs/reference/migrations/migrating-to-v5.md`.
- **Jotai 3.0.2**, `https://github.com/pmndrs/jotai`, tag `v3.0.2`, commit
  `9de9377d10a5ac01388764b89458e2d7091d29d4` (2026-11-09), npm `latest` on
  2026-11-19. Read under `src/`: `react/Provider.ts`, `useAtom.ts`,
  `useAtomValue.ts`, `useAtomValueRawSync.ts`, `useSetAtom.ts`,
  `react/utils/useHydrateAtoms.ts`, `vanilla/utils/atomWithStorage.ts` and
  `vanilla/utils/selectAtom.ts`. Docs read: `docs/utilities/ssr.mdx`,
  `storage.mdx`, `select.mdx`, `docs/guides/nextjs.mdx`, `debugging.mdx`
  (headings only) and `docs/core/store.mdx`. Jotai's Redux DevTools support is
  a separate package that is not in this repository, so it was not read.
- **Ours**, read at `release/1.0`, commit `c59084e`:
  `frameworks/react/hooks/useClassyStore/useClassyStore.ts`,
  `frameworks/react/utils/createStoreHook/createStoreHook.ts`,
  `hooks/useLocalStore/useLocalStore.ts`, `frameworks/react/server.ts`,
  `utils/persist/persist.ts` and `persist.types.ts`, `utils/devtools/devtools.ts`,
  `utils/subscribe-key/subscribe-key.ts`, `utils/history/history.ts`,
  `utils/utilityStatus/utilityStatus.ts`, `types.ts`, and the entry files
  `index.ts` and `utils/index.ts`. Also `types.react.test.ts` (signatures),
  `core/core.ts` lines 255 to 300, 470 to 500 and 575 to 612, and the guides
  `REACT_SSR.md`, `REACT_SCOPING.md`, `PERSIST_TUTORIAL.md` and
  `DEVTOOLS_TUTORIAL.md` under `website/content/docs/`.
- **Ports** ran on Bun 1.4.4 with `react@19.3.1`, `zustand@5.1.0`,
  `jotai@3.0.2` and `happy-dom@21.0.4`, in a scratch folder. Our source was
  copied (without tests) from `c59084e` into the same folder, so that one
  React instance serves all three libraries. The code and output are in the
  appendix.

Line numbers for Zustand and Jotai refer to those tags. Line numbers for ours
refer to `c59084e`.

## Summary

Zustand and Jotai disagree with each other on almost everything except two
things: both notify subscribers synchronously, and both let you write from
anywhere. Where they agree with each other and we differ, a user coming from
either will be surprised. Where we differ from one only, the difference is a
choice. Ten findings; the three that matter most:

1. **Hydration safety is automatic in Zustand and manual in ours (finding 1).**
   Zustand's hook reads `getInitialState()` as the server snapshot, so a store
   written between the server render and hydration (a persist restore, another
   boundary) causes no mismatch. In our port the same case raised React's
   hydration error until `prepareStoreForHydration` was called, and Jotai
   raised it too. Capturing the initial snapshot automatically is a
   non-breaking change and removes the one call every SSR user has to remember.
2. **`persist` fails silently where Zustand speaks (finding 3).** A stored
   version that differs from `version` with no `migrate` is ignored with no
   `onError`, no log and no status; Zustand logs `console.error`. An async
   `migrate`, which Zustand accepts, makes ours restore nothing at all without a
   word. The migrated record is also never written back, so the migration runs
   on every load until the user's first edit (finding 4).
3. **`devtools` is the thinnest of the three integrations (findings 6 and 7).**
   Every entry is named `STORE_UPDATE`. Time travel notifies a synchronous
   subscriber once per field (3 notifications for a 3-field jump, against 1 in
   Zustand), turns a `Date` field into a string, and `RESET`, `COMMIT`,
   `ROLLBACK` and `IMPORT_STATE` are ignored. Method names are already known
   inside the core (`core.ts:487-491`), so real action names are cheap.

Where we are better: the hook with no selector, the `persist` handle, and the
types of the two utilities. "Where ours is clearer" lists them.

## How the two libraries differ from ours

This explains why some answers carry over and some cannot.

- **Zustand's store is a value you replace; ours is one you mutate.** A write is
  one `setState(partial)` call, so there is one atomic unit and one
  notification (`vanilla.ts:66-81`). Ours has direct property writes, so the
  atomic unit has to be made (transactions, `batch()`), and several of our
  findings are about that gap.
- **Zustand's middleware wraps the state creator at creation time.** `persist`
  and `devtools` wrap `set` and replace `api.setState`
  (`persist.ts:218-223`, `devtools.ts:267-296`). That is why they can name an
  action and write on every `set`, and also why they have no teardown and need
  the `Mutate`/`StoreMutators` type machinery (`vanilla.ts:20-41`). Ours attach
  after creation and return a handle.
- **Jotai separates definition from value.** An atom is a key; a store holds the
  values (`store.mdx`). A module-level atom is therefore safe on a server, and a
  `Provider` makes a fresh store per mount (`Provider.ts:23-49`). Ours, like
  Zustand's, puts the value in the module-level object.
- **Neither has a snapshot.** Both hand the component the state object itself.
  Questions about frozen snapshots and getters get "no position".

## Findings

### 1. The server snapshot is automatic in Zustand, manual in ours

Stage 1 has no number for this; it bears on API question 7 and 8.

- **What they do.** Zustand's `useStore` passes `() => selector(api.getInitialState())`
  as React's `getServerSnapshot` (`react.ts:30-34`). `getInitialState` is the
  state the creator returned (`vanilla.ts:85-86`, `:95`), and `persist` replaces
  it with the pre-restore state (`persist.ts:234`). React uses that function
  only on the server and while hydrating, so nothing needs calling. Jotai passes
  `getSnapshot` for both (`useAtomValueRawSync.ts:35-39`), so a value written
  before hydration mismatches; its answer is `useHydrateAtoms`, which sets atoms
  once per store before the first read (`useHydrateAtoms.ts:27-54`) and is
  documented as the way to do it (`ssr.mdx`).
- **What we do.** `useClassyStore` reads a snapshot from a `WeakMap` that only
  `prepareStoreForHydration` fills (`useClassyStore.ts:73-75`, `server.ts:16-22`,
  `hydrationSnapshots.ts:4`). Without that call the server snapshot is the
  current state (`REACT_SSR.md`: "Unprepared stores retain the existing behavior").
- **Difference in behaviour.** Port 3: render `0` on the server, write `5`, then
  `hydrateRoot`. Zustand: no error, shows 5 after hydration. Zustand with
  `persist` and a synchronous storage already holding 7: no error, shows 7.
  Jotai: `Hydration failed because the server rendered text didn't match`.
  Ours unprepared: the same error. Ours after `prepareStoreForHydration`: no
  error. (Appendix, port 3.)
- **Proposal: adapt.** Capture the initial snapshot without being asked. Two
  ways, to be decided in stage 3 (reasoning from reading, not prototyped):
  capture in `createClassyStore`, or lazily just before the first write, so a
  store that is never written costs nothing. Keep `prepareStoreForHydration` as
  an explicit capture for a store that was changed before it reached React. The
  contract becomes Zustand's: the server and the first client render both start
  from the state the store was created with. A late Suspense boundary is already
  handled by the `WeakMap`, which would simply be filled earlier.
- **Kind:** API design (removes a required call; also a diagnostics gain, since
  forgetting it is a silent mismatch).
- **Cost:** `core.ts` (the write path, if lazy) or `createClassyStore`, and
  `hydrationSnapshots.ts` moves out of the React folder. Not breaking. Risk
  medium: a retained snapshot holds old objects alive, and writes made through
  a raw reference (stage 1 finding 11) would bypass a first-write hook.

### 2. Hook shape: our no-selector form and `isEqual` against `useShallow` and `equalityFn`

Stage 1 has no number.

- **What they do.** Zustand v5's `useStore(api, selector)` takes no equality
  argument; a selector that returns a new object every call loops (`react.ts:32`,
  and "Changes in v5" in the migration guide). Its fixes are `useShallow(selector)`
  (`react/shallow.ts:4-11`) and the separate `useStoreWithEqualityFn(api,
  selector, equalityFn)` from `zustand/traditional` (`traditional.ts:21-45`). With
  no selector it returns the whole state and re-renders on every change. Jotai
  has no selector at all; the slice is another atom, and `selectAtom(atom,
  selector, equalityFn)` is "an escape hatch" (`select.mdx`, `selectAtom.ts:24-57`).
- **What we do.** `useClassyStore(store, selector, {isEqual})` and
  `useClassyStore(store)`, which returns a `proxy-compare` tracking proxy and
  re-renders only for fields the component read (`useClassyStore.ts:35-49`,
  `:129-136`). A selector's result is cached per snapshot, so a new object each
  call does not loop (`:196-229`).
- **Difference in behaviour.** Port 1. Zustand, selector `s => ({a: s.a})`:
  React reports `The result of getSnapshot should be cached` and throws
  `Maximum update depth exceeded` after 55 renders. Ours: one render, and
  one re-render for an unrelated write; with `isEqual: shallowEqual` zero.
  No selector, unrelated write: Zustand re-renders once, ours zero, Jotai (atom
  per field) zero.
- **Proposal: keep the behaviour; adapt the name.** Our no-selector form is the
  best of the three and needs no change. The option is called `isEqual`; in
  these two libraries every equivalent is `equalityFn` (`traditional.ts:28`,
  `subscribeWithSelector.ts:54`, `selectAtom.ts:22`). Renaming it before the
  freeze costs a find and replace and removes a surprise. Also keep `shallowEqual`
  exported; Zustand's users know it as `shallow`.
- **Kind:** API design.
- **Cost:** `useClassyStore.types.ts`, the three adapter docs, the type test
  (`types.react.test.ts`, one assertion). Breaking, but the owner is the only
  user. Risk low.

### 3. `persist` is silent where Zustand reports

Stage 1 findings 52, 53 and 55 are the same family (accepted input that does
nothing).

- **What they do.** With a stored version that differs and no `migrate`,
  Zustand logs `State loaded from storage couldn't be migrated since no migrate
  function was provided` and keeps the current state (`persist.ts:276-278`).
  When storage is unavailable it logs a warning on every write (`:197-208`).
  `migrate` may return a promise (`:99-105`, handled at `:271-273`). A stored
  record with no `version` field is accepted whatever the configured version
  (`:262-265`).
- **What we do.** A version mismatch with no `migrate` returns `false` and
  nothing else: no `onError`, no status change, no log (`persist.ts:310-315`). A
  record with no version counts as version 0 (`:310-311`). `migrate` is typed
  and called as synchronous (`persist.types.ts:78-81`, `persist.ts:314`). There
  is no development-mode logging anywhere in the package (the only two
  `console.error` calls are listener failures, `core.ts:325` and
  `utilityStatus.ts:45`).
- **Difference in behaviour.** Port 4c: version 1 stored, `version: 2`, no
  `migrate`. Zustand: state kept, `console.error` as above. Ours: state kept,
  `onError` calls `[]`. Port 4d: record without a version, `version: 2`.
  Zustand restores 7; ours ignores it (0). Port 7: `migrate` is `async`.
  Zustand restores 7; ours restores 0, `onError` is empty, `isHydrated` is true
  (reached through a cast; the types forbid it, but a plain JavaScript user
  has no types).
- **Proposal: adapt.** (a) Report a version mismatch with no `migrate` through
  `onError` under a new operation (for example `'migrate'`), so `usePersistStatus`
  shows it. (b) Await `migrate` so that an async function works, as Zustand
  does: `hydrateFromStorage` is already async (`persist.ts:385`), so the await
  goes before `applyPersistedState`, and the edit-protection baseline is taken
  before it already. If a promise is not wanted, throw when the return value has
  a `then`. (c) Keep "no version means 0"; it is safer than Zustand's, which
  accepts an old unversioned record into a new schema. Document it in
  `PERSIST_TUTORIAL.md`.
- **Kind:** diagnostics, API design.
- **Cost:** `persist.ts`, `persist.types.ts` (`PersistOperation` gains a member;
  `migrate` return type widens), tutorial. Not breaking. Risk low to medium:
  awaiting `migrate` adds a turn between the read and the apply, which the
  existing "hydration request" counter already guards (`:386`, `:405`).

### 4. A migrated record is not written back

- **What they do.** After a successful migration Zustand calls `setItem()` at
  once, so the stored record carries the new version (`persist.ts:297-299`).
- **What we do.** `applyPersistedState` restores the migrated state and sets
  `skipAutoSaveVersion` so the restore itself does not trigger a write
  (`persist.ts:378-380`). Nothing writes the record at the new version until the
  first edit.
- **Difference in behaviour.** Port 4e: stored `{old: 7}` at version 1,
  `version: 2`, a `migrate` that renames the field. Zustand: restores 7 and has
  written `{"state":{"n":7},"version":2}`. Ours: restores 7, writes nothing.
- **Why it matters.** The migration then runs on every page load until the user
  edits something. A user who only reads stays at version 1 indefinitely. When
  a later release deletes the old `migrate` branch because "everyone has
  migrated", those users hit finding 3's silent path and lose the stored data
  (reasoning from reading; the run shows only the missing write).
- **Proposal: adopt.** Save once after a successful migration. Take care that the
  write is a revision the handle already expects, as the restore already is
  (`:372-376`), and check with `syncTabs` on that two tabs which both migrate do
  not keep rewriting each other's record (not run).
- **Kind:** bug (data lifecycle).
- **Cost:** `persist.ts` only, plus a test. Not breaking. Risk low to medium
  (a write at load changes when storage is first touched).

### 5. `persist` defaults and option names against both libraries

- **What they do.** Zustand's `persist` needs only `name`. `storage` defaults to
  `createJSONStorage(() => localStorage)`, evaluated lazily so a server does not
  throw (`persist.ts:178-180`, `:31-41`; documented in `persist.md`). Jotai's
  `atomWithStorage` needs a key and a value; the default storage is `localStorage`
  with the same lazy guard and a development warning if it throws
  (`atomWithStorage.ts:100-113`). Zustand names the filter
  `partialize` (a function); Jotai has none, since each atom is one value. Both
  take a `storage` that already (de)serialises (`PersistStorage`,
  `SyncStorage<Value>`), where ours takes a raw string store.
- **What we do.** `name` and `storage` are both required, and `storage` is a raw
  string store such as `localStorage` itself (`persist.types.ts:37-45`). The
  filter is `properties: Array<key | {key, serialize, deserialize}>`
  (`:57`), a list rather than a function.
- **Difference.** A Zustand user types `persist(store, {name: 'x'})` and gets a
  type error. Everything after that is clearer in ours: a raw `localStorage`
  needs no wrapper, and a per-key transform is typed per key where Zustand
  offers one global `storage` plus `partialize`. The stored envelope is nearly
  identical (`{state, version}`, ours adds `expiresAt`), so an app moving from
  Zustand to us keeps its stored data (port 4a, 4f show the same keys).
- **Proposal: adapt.** Make `storage` optional and default to a lazily read
  `globalThis.localStorage`, with no persistence (and one development warning,
  once finding 3's diagnostics exist) where it is missing or throws. Keep
  `properties`; `partialize` would be a second way to say the same. Keep the
  names `name`, `version`, `migrate`, `merge` and `skipHydration`, which already
  match Zustand's in spelling and argument order (`persist.md`, `persist.ts:176-187`).
- **Kind:** API design.
- **Cost:** `persist.ts`, `persist.types.ts`, docs. Not breaking. Risk low.

### 6. `devtools` action names and entry timing

Bears on API question 8.

- **What they do.** Zustand's patched `setState` takes a third argument, a
  string or `{type, ...}`; otherwise it uses `anonymousActionType` or infers the
  caller's function name from the stack, falling back to `anonymous`
  (`devtools.ts:267-280`, `:223-235`). Several stores can share one connection
  through the `store` option, which prefixes the name (`:281-294`).
- **What we do.** Every entry is `{type: 'STORE_UPDATE'}` (`devtools.ts:78`).
  The subscription is the batched one, so every mutation in one tick makes one
  entry (`:76-79`). The store already knows the method name: the get trap wraps
  each method in `transactional(method, receiver)` (`core.ts:487-491`), so the
  outermost method call is the natural action.
- **Difference in behaviour.** Port 5a: `inc()`, `inc()`, `reset()` in one tick.
  Ours sends one `STORE_UPDATE`. Zustand sends one entry per `set`: `anonymous`
  for the arrow function in Bun (stack inference depends on the engine's stack
  format), and `counter/incNamed` when the name is passed.
- **Proposal: adapt.** Name the entry after the outermost store method (the
  transaction already has the call) and use `STORE_UPDATE` for a direct write
  made outside a method. Send on the synchronous channel, once per outermost
  transaction, so three methods in a tick give three entries, which is what a
  time-travel panel needs. This does not need Zustand's stack inference.
- **Kind:** API design, diagnostics.
- **Cost:** `core.ts` (`transactional` passes a name to a small internal slot),
  `devtools.ts`. Not breaking. Risk medium: it touches the hot path, so run
  `bun run benchmark:core` before and after; `transactional` runs once per method
  call and the added work is one assignment at depth 0.

### 7. `devtools` time travel and the messages it ignores

- **What they do.** Zustand handles `ACTION` (custom dispatch, action dropdown),
  `DISPATCH` with `RESET` (back to `initialState`), `COMMIT` (re-init),
  `ROLLBACK`, `JUMP_TO_STATE`, `JUMP_TO_ACTION`, `IMPORT_STATE` and
  `PAUSE_RECORDING` (`devtools.ts:391-557`). Time travel is one `set` call, so one
  notification (`:313-318`). `enabled` defaults to off in production
  (`:251-254`). Every other option is passed to the extension's `connect()`
  (`:240-241`, `:327`), so `actionsDenylist`, `maxAge` and `trace` work.
- **What we do.** Only `JUMP_TO_STATE` and `JUMP_TO_ACTION` (`devtools.ts:85`).
  Each key of the parsed state is assigned one at a time with no `batch()`
  (`:91-101`). `enabled` defaults to `true` in any environment (`:57`). Only
  `name` reaches `connect()` (`:66`).
- **Difference in behaviour.** Port 5b: a jump over 3 fields gives a
  synchronous subscriber 3 calls (Zustand: 1), so a React binding is notified
  three times for one jump. Port 5c: a `Date` field comes back as the string
  `1970-01-01T00:00:00.000Z` after a jump, because the extension sends JSON and
  the assignment takes it as is. A `RESET` message leaves the store unchanged
  (n stayed 5).
- **Proposal: adopt (batch and Date), adapt (messages and options).** Wrap the
  jump in `batch()` (one line). For the `Date` case, keep a current value that
  is not JSON-like instead of overwriting it, or reuse the persist transform
  shape. Handle `RESET` (back to the state captured at `devtools()` time, which
  is what `init()` already sends), `COMMIT` and `ROLLBACK`. Pass remaining
  options to `connect()`. Decide `enabled`: tie the default to the environment
  as Zustand does, or leave it and keep the "Development-only" example in the
  tutorial. The security agent covers the `message.state` parse.
- **Kind:** bug (batch, Date), API design (the rest).
- **Cost:** `devtools.ts`, `DEVTOOLS_TUTORIAL.md`. Not breaking, except a default
  change for `enabled`. Risk low.

### 8. Slice subscriptions: `subscribeKey` against `subscribeWithSelector`

Bears on API question 1.

- **What they do.** `subscribeWithSelector` adds an overload
  `subscribe(selector, listener, {equalityFn, fireImmediately})`; the listener
  gets the selected value and the previous one (`subscribeWithSelector.ts:46-71`).
  The plain listener gets `(state, previousState)` (`vanilla.ts:62`). Jotai's
  `store.sub(atom, listener)` takes a derived atom for a slice and passes no
  arguments (`store.mdx`).
- **What we do.** `subscribeKey(store, key, cb, options)` takes a top-level key
  only and calls `cb(value, previous)` (`subscribe-key.ts:17-42`). The core
  `subscribe(store, cb, options)` calls `cb()` with nothing (`core.ts:585-603`).
  There is no `equalityFn` and no `fireImmediately`.
- **Difference in behaviour.** Port 6b: watching `items.length`. Zustand's
  selector does it in three lines and also fires immediately (`[[1,1],[2,1]]`).
  Ours cannot name a derived value or a nested field; the port compares by hand
  and gets `[[2,1]]`.
- **Proposal: adapt.** Let `subscribeKey` take a selector function as well as a
  key, or add a separate selector function, and give it `equalityFn` and
  `fireImmediately`. Leave the argument-free `subscribe(store, cb)`, since the
  listener can call `snapshot(store)` at no cost (the snapshot is cached by
  version); but say so in `API_REFERENCE.md`, because a Zustand user expects
  `(state, prev)`.
- **Kind:** API design.
- **Cost:** `subscribe-key.ts`, its types and tutorial. Not breaking if the key
  form stays. Risk low.

### 9. Subscriber delivery: the three libraries chose differently

Stage 1 findings 18 to 22; bears on API question 1.

- **What they do.** Zustand notifies with `listeners.forEach` over a `Set`
  (`vanilla.ts:79`) and passes the variable `state`, read at call time. Jotai
  `store.sub` is synchronous too (port 6a). Neither has a loop guard.
- **What we do.** The core has batched and synchronous listener sets
  (`core.ts:585-603`); stage 1 pinned the results as findings 18 to 22.
- **Difference in behaviour.** Port 8, with our subscribers synchronous:
  finding 18 (a subscriber that writes): Zustand and Jotai both recurse with no
  guard (stopped at 5000 by the test). Finding 20 (unsubscribe a later
  subscriber from inside delivery): Zustand never calls it; ours calls it
  once. Finding 21 (subscribe during delivery): Zustand calls the new subscriber
  for the write in flight; ours does not. Finding 22 (re-entrant write): both
  deliver the final state twice to the next subscriber, `[2, 2]`, identical.
- **Proposal: adopt for finding 20, keep ours for 21, no change for 18 and 22.**
  Skipping a listener removed before its turn is what a caller expects and costs
  a membership check. Not calling a subscriber that registered after the write is
  the better rule, so ours is right there. For 18 and 22 neither library does
  better; a guard is a stage 3 decision of its own.
- **Kind:** bug (20).
- **Cost:** the delivery loop in `core.ts`, and the test that pins finding 20.
  Not breaking. Risk low.

### 10. Server safety by construction, and the scoping story

Bears on API question 8.

- **What they do.** Jotai: atoms are definitions and `Provider` makes a store per
  mount, so one app instance per request is isolated by default
  (`Provider.ts:33-47`, `nextjs.mdx`). Zustand: "No global stores", create one
  per request and pass it by context (`nextjs.md`), which is discipline, and an
  experimental `ssrSafe` middleware that throws on `setState` when
  `window` is undefined (`ssrSafe.ts:6-25`, marked "experimental" at `:3-5`).
  Neither ships a context helper; Zustand's docs show a hand-written provider
  that throws when used outside it.
- **What we do.** The same discipline as Zustand, documented in `REACT_SSR.md`
  and `REACT_SCOPING.md`, plus `useLocalStore` for a store owned by one
  component (`useLocalStore.ts:30-33`). No provider; no server-write check.
- **Proposal: reject a Provider and an automatic server-write check; keep
  the docs.** A store is a value, not a key, so a provider would add a second
  way to hold it. A server-write warning would fire on legitimate per-request
  setup (the docs tell users to build the store from request data and mutate it
  before render). If wanted, offer Zustand's opt-in shape (an explicit
  read-only-on-server marker) rather than a default. `useLocalStore` is a
  convenience neither library ships; keep it.
- **Kind:** docs.
- **Cost:** none to code.

## Where ours is clearer

- **The hook with no selector** re-renders only for fields read. Zustand's
  returns everything and re-renders for everything; its v5 selector rule
  (return a stable value or loop) is a trap ours does not have (port 1).
- **The `persist` handle.** `hydrated` (promise), `isHydrated`, `lastError`,
  `isExpired`, `dispose()`, `save()`, `clear()`, `rehydrate()` and the
  `usePersistStatus` hook replace Zustand's four pieces: `hasHydrated()`,
  `onHydrate`, `onFinishHydration` and the `onRehydrateStorage` function
  returning a function (`persist.ts:329-367`, `persist.md`). The handle is a
  working external store (`getSnapshot`, `subscribe`; `utilityStatus.ts:11-24`).
  Zustand's `persist` also has no teardown; ours does (`persist.ts:500-510`).
- **Errors.** `onError(error, operation)` covers read, parse, write and remove.
  Zustand reports a read error only, through `onRehydrateStorage`'s second
  argument (`persist.ts:317-326`); a failed write in its `setItem` is unhandled.
- **Edit protection during hydration.** A field edited while the read was in
  flight keeps its edit (`persist.ts:343-377`). Neither library does this: both
  replace state when the read lands (`persist.ts:296`, and `onMount`'s
  `setAtom` at `atomWithStorage.ts:234`).
- **Types.** Our utilities are ordinary functions of a store. Zustand's
  middleware need `StoreMutatorIdentifier`, `Mutate` and `StateCreator` with
  four type parameters (`vanilla.ts:20-41`), and the docs have an
  advanced-TypeScript guide (listed, not read).
- **Cross-tab sync** is an option (`syncTabs`). Zustand has none; Jotai's is
  built into its default storage and cannot be turned off
  (`atomWithStorage.ts:160-189`).

## Names a user from either library would trip on

| Ours                                         | Zustand                                | Jotai                                            | Note                                                                    |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `isEqual` option                             | `equalityFn`                           | `equalityFn`                                     | Finding 2.                                                              |
| `subscribe(store, cb)`, cb gets nothing      | cb gets `(state, prev)`                | cb gets nothing                                  | Finding 8.                                                              |
| `persist` needs `storage`                    | defaults to `localStorage`             | defaults to `localStorage`                       | Finding 5.                                                              |
| `properties: [...]`                          | `partialize(state)`                    | none                                             | Keep ours.                                                              |
| `skipHydration`                              | `skipHydration`                        | restores on mount; `getOnInit` reads at creation | Same name as Zustand.                                                   |
| `persist` returns a handle                   | `store.persist.*` on the store         | atom                                             | Finding 5 and "clearer".                                                |
| `prepareStoreForHydration` in `react/server` | automatic                              | `useHydrateAtoms` (client)                       | The name says server; it is called in client code too (`REACT_SSR.md`). |
| `devtools(store, {name, enabled})`           | creator wrapper, many options          | separate package                                 | Findings 6 and 7.                                                       |
| `createStoreHook(store)`                     | `create(creator)` returns a bound hook | n/a                                              | Ours is clear; Zustand's also exposes the store on the hook.            |
| `useLocalStore(factory)`                     | docs recipe with `useState`            | `Provider`                                       | Neither ships it.                                                       |
| `shallowEqual`                               | `shallow`, `useShallow`                | n/a                                              | Keep.                                                                   |

## Stage 1 findings with a counterpart

| Finding                                                 | Zustand                                                                               | Jotai                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 18, a sync subscriber that writes recurses              | Same, no guard (port 8a)                                                              | Same, no guard (port 8a)                                        |
| 19, batched subscriber served again in a loop           | No counterpart: no batching                                                           | No counterpart                                                  |
| 20, a removed subscriber is still called once           | Not called (port 8b)                                                                  | Not run                                                         |
| 21, a late subscriber sometimes hears the write         | Always hears the write in flight (port 8c)                                            | Not run                                                         |
| 22, a re-entrant write delivers the same snapshot twice | Same: `[2, 2]` (port 8d)                                                              | Not run                                                         |
| 23, a returned rejected promise is not reported         | The return value is ignored (`vanilla.ts:79`); reading only                           | Not read                                                        |
| 52, a getter named in `properties`                      | No getters; `partialize` is a function and `JSON.stringify` drops functions (reading) | n/a                                                             |
| 53, an array as stored `state`                          | The default `merge` spreads it into the state (`persist.ts:182-185`, reading)         | n/a                                                             |
| 55, a malformed `properties` entry is ignored           | No counterpart: `partialize` is a function                                            | n/a                                                             |
| 56, debounce relative to a read                         | No debounce; writes on every `set` (`persist.ts:210-223`)                             | No debounce; writes on every set (`atomWithStorage.ts:259-260`) |
| 57, an edit in the same tick as `undo()`                | No history middleware in the package                                                  | n/a                                                             |

## The eight API questions

1. **Should synchronous notification be the default for `subscribe()`?** Both
   libraries notify synchronously, and neither has microtask batching (port
   6a: two writes, two calls, in both). They get atomicity from the shape of
   the write: one `setState(partial)` or one atom write is one notification.
   Ours has direct property writes, which have no such unit, so the microtask
   default is the thing that gives a `store.a = 1; store.b = 2` pair one
   notification. A user from either library will expect the sync behaviour, so
   if the default stays batched, say it at the top of `API_REFERENCE.md`. If it
   flips, a plain multi-field write must go through a method or `batch()`.
   Evidence only supports "users expect sync"; it does not settle the choice.
2. **Writes outside a store method, and `batch()`.** Both libraries allow
   writes from anywhere (`useStore.setState(...)`, `store.set(atom, ...)`) and
   neither warns. Neither has `batch()`, because the multi-field write is a
   single call (`setState({a, b})`; a Jotai write function that sets two atoms).
   Our equivalent of that call is `Object.assign(store, {a, b})`, which is two
   writes and two sync notifications (port 6d: Zustand 1, ours 2 synchronous and
   1 batched). So `batch()` belongs in the API, and a
   warning on an outside write would contradict what both libraries teach.
3. **Snapshot getters as enumerable own accessors.** No position: neither has
   snapshots or class getters.
4. **Arrow-function methods and `#private` fields.** No position. Zustand's
   state is a plain object of closures, so arrow functions are its normal form;
   that is the expectation a user brings, and the reason `CLAUDE.md`'s "no arrow
   methods" rule will surprise them (reasoning from reading).
5. **Native `Map` and `Set`.** No position from the libraries' code. Zustand's
   docs have a guide on Maps and Sets (`docs/learn/guides/maps-and-sets-usage.md`,
   listed, not read).
6. **Opt-in or opt-out for nested class instances.** No position: neither
   proxies anything.
7. **Entry points, export names and adapter names.** Zustand: `zustand`,
   `zustand/vanilla`, `zustand/middleware`, `zustand/shallow`,
   `zustand/react/shallow`, `zustand/traditional`. Jotai: `jotai`,
   `jotai/vanilla`, `jotai/react`, `jotai/utils`. Ours: `.`, `./react`,
   `./react/server`, `./utils`, `./collections`, plus one entry per framework.
   Both libraries keep the vanilla core, the React binding and the utilities in
   separate entries, so ours matches them. Two differences to know: `utils`
   is Jotai's word, and Zustand calls the same things `middleware`; and
   `prepareStoreForHydration` sits in `react/server` but is called on the client
   too, which neither library does (Zustand has no such call, Jotai's
   `useHydrateAtoms` is client code with `'use client'`). Finding 1 removes the
   odd one out. Hook names follow each library's pattern (`useStore`,
   `useAtom`, `useClassyStore`), so ours is consistent; React-only helpers
   (`useHistoryStatus`, `usePersistStatus`) live in the React entry, beside the
   utilities they read, as expected.
8. **Development-only diagnostics for silent failures.** Both libraries use
   them where ours has none. Zustand: `persist` logs a version mismatch with no
   migrate and an unavailable storage (`persist.ts:197-208`, `:276`); `devtools`
   warns about a reserved action type and malformed dispatch JSON
   (`devtools.ts:364-374`, `:424-439`); `ssrSafe` throws on a server write.
   Jotai: `useSetAtom` throws `not writable atom` (`useSetAtom.ts:33`), atoms
   carry `debugLabel`, and `atomWithStorage` warns in development when
   `localStorage` throws (`atomWithStorage.ts:106-109`). Both gate on the build
   mode (`import.meta.env.MODE`, `process.env.NODE_ENV`). Candidates for ours,
   each tied to a silent case already found: a version mismatch with no
   `migrate`, a `migrate` that returns a promise, a malformed `properties`
   entry (stage 1 finding 55), a getter named in `properties` (finding 52), and
   an unrecognised devtools message. The package would need a convention for
   the gate first, since it has none today.

## What was verified by running code, and what was only read

**Run (Bun 1.4.4, ports in the appendix):**

- Fresh-object selector: Zustand loops, ours does not (port 1).
- No-selector re-renders: Zustand yes, ours no, Jotai no (port 1).
- Hydration after a write, four variants and Zustand with `persist` (port 3).
- Persist lifecycle with a synchronous storage, version mismatch with and
  without `migrate`, unversioned record, migrate write-back, write counts and
  envelope shape (port 4); Jotai's restore on mount (port 4b).
- Devtools action names, time-travel notification count, `Date` after a jump,
  `RESET` (port 5), through a fake `__REDUX_DEVTOOLS_EXTENSION__`, not a real
  extension.
- Subscription timing, slice subscription, the multi-field write (port 6),
  async `migrate` (port 7), subscriber delivery cases (port 8).

**Only read:**

- Zustand's action-name inference from the stack in V8 or Firefox: the port ran
  on Bun's engine, where it gave `anonymous`.
- Zustand's `useShallow` and `traditional` behaviour beyond port 1; Jotai's
  `selectAtom`, `useHydrateAtoms` and `atomWithStorage` `RESET`/validator
  paths; Jotai's delivery cases 8b to 8d; Jotai DevTools.
- That Zustand's `persist` has no teardown, reports no write errors and
  replaces state when a read lands, and that Jotai does the same on mount: from
  source, not run.
- Our `devtools` ignoring `COMMIT`, `ROLLBACK` and `IMPORT_STATE`: read at
  `devtools.ts:85`; only `RESET` was run.
- Every proposal's cost, and finding 4's claim that the data is lost when an old
  `migrate` branch is deleted: reasoning from the missing write.
- Finding 1's lazy-capture variant: not prototyped.
- Real-browser hydration: the ports use happy-dom, so React's recoverable error
  is the evidence, not a browser console.

## Appendix: ported tests and their output

Each file is in the scratch folder
`/private/tmp/claude-501/-Users-robertparallax-WebstormProjects-classy-store/9c8c2bbd-bb57-4b12-aa7b-9d06972e3fdd/scratchpad/stage-2-zustand-jotai/ports/`
and runs with `bun test <file>` there. `./ours/` is a copy of our `src`
(without tests) from `c59084e`. The preload registers happy-dom and sets
`IS_REACT_ACT_ENVIRONMENT`; `helpers.ts` mounts a component inside `act`.

### preload.ts

```ts
import {GlobalRegistrator} from '@happy-dom/global-registrator';

GlobalRegistrator.register();
// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
```

### helpers.ts

```ts
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';

export const SRC = './ours';

export async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    unmount: () => act(async () => root.unmount()),
  };
}
export {act, createElement};
```

### p1-selectors.test.tsx

```ts
// Ports 1 and 2: selector shape and what makes a component re-render.
import {expect, spyOn, test} from 'bun:test';
import {createClassyStore} from './ours/index.ts';
import {shallowEqual} from './ours/index.ts';
import {useClassyStore} from './ours/frameworks/react/react.ts';
import {atom, createStore, Provider, useAtomValue} from 'jotai';
import {act} from 'react';
import {create} from 'zustand';
import {useShallow} from 'zustand/react/shallow';
import {mount} from './helpers';

// Port 1: a selector that returns a NEW object on every call.
test('1a zustand v5: selector returning a fresh object, no useShallow', async () => {
  const useStore = create<{a: number; b: number}>(() => ({a: 1, b: 2}));
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  let renders = 0;
  let thrown: unknown;
  function C() {
    renders++;
    const {a} = useStore((s) => ({a: s.a}));
    return <i>{a}</i>;
  }
  try {
    await mount(<C />);
  } catch (e) {
    thrown = e;
  }
  const msg = String(errors.mock.calls[0]?.[0] ?? '').slice(0, 80);
  errors.mockRestore();
  console.log('zustand fresh-object selector: renders', renders, 'thrown', String(thrown).slice(0, 90), '| console.error:', msg);
});

test('1b zustand v5 with useShallow: fresh object, stable result', async () => {
  const useStore = create<{a: number; b: number}>(() => ({a: 1, b: 2}));
  let renders = 0;
  function C() {
    renders++;
    const {a} = useStore(useShallow((s) => ({a: s.a})));
    return <i>{a}</i>;
  }
  await mount(<C />);
  const before = renders;
  await act(async () => useStore.setState({b: 3}));
  console.log('zustand useShallow: renders after unrelated write', renders - before);
});

test('1c classy: fresh object selector without isEqual', async () => {
  const store = createClassyStore({a: 1, b: 2});
  let renders = 0;
  function C() {
    renders++;
    const {a} = useClassyStore(store, (s) => ({a: s.a}));
    return <i>{a}</i>;
  }
  await mount(<C />);
  const first = renders;
  await act(async () => {
    store.b = 3;
  });
  console.log('classy fresh-object selector: initial renders', first, 'after unrelated write', renders - first);
});

test('1d classy: fresh object selector with isEqual shallowEqual', async () => {
  const store = createClassyStore({a: 1, b: 2});
  let renders = 0;
  function C() {
    renders++;
    const {a} = useClassyStore(store, (s) => ({a: s.a}), {isEqual: shallowEqual});
    return <i>{a}</i>;
  }
  await mount(<C />);
  const first = renders;
  await act(async () => {
    store.b = 3;
  });
  console.log('classy isEqual shallowEqual: initial renders', first, 'after unrelated write', renders - first);
});

// Port 2: no selector. Does an unrelated write re-render?
test('2a zustand: useStore(store) with no selector re-renders on any write', async () => {
  const useStore = create<{a: number; b: number}>(() => ({a: 1, b: 2}));
  let renders = 0;
  function C() {
    renders++;
    const s = useStore();
    return <i>{s.a}</i>;
  }
  await mount(<C />);
  const first = renders;
  await act(async () => useStore.setState({b: 3}));
  console.log('zustand no selector: re-renders after unrelated write', renders - first);
});

test('2b classy: no selector is auto-tracked', async () => {
  const store = createClassyStore({a: 1, b: 2});
  let renders = 0;
  function C() {
    renders++;
    const s = useClassyStore(store);
    return <i>{s.a}</i>;
  }
  await mount(<C />);
  const first = renders;
  await act(async () => {
    store.b = 3;
  });
  const afterB = renders - first;
  await act(async () => {
    store.a = 9;
  });
  console.log('classy no selector: re-renders after unrelated write', afterB, 'after read field write', renders - first - afterB);
});

test('2c jotai: one atom per field, useAtomValue re-renders only for its atom', async () => {
  const aAtom = atom(1);
  const bAtom = atom(2);
  const store = createStore();
  let renders = 0;
  function C() {
    renders++;
    return <i>{useAtomValue(aAtom)}</i>;
  }
  await mount(
    <Provider store={store}>
      <C />
    </Provider>,
  );
  const first = renders;
  await act(async () => store.set(bAtom, 3));
  console.log('jotai: re-renders after unrelated atom write', renders - first);
});
```

Output:

```text

zustand fresh-object selector: renders 55 thrown Error: Maximum update depth exceeded. This can happen when a component repeatedly calls se | console.error: The result of getSnapshot should be cached to avoid an infinite loop
zustand useShallow: renders after unrelated write 0
classy fresh-object selector: initial renders 1 after unrelated write 1
classy isEqual shallowEqual: initial renders 1 after unrelated write 0
zustand no selector: re-renders after unrelated write 1
classy no selector: re-renders after unrelated write 0 after read field write 1
jotai: re-renders after unrelated atom write 0

```

### p3-hydration.test.tsx

```ts
// Port 3: the store changes between server render and hydration (what a
// persist restore, or another boundary hydrating first, does).
import {expect, test} from 'bun:test';
import {atom, createStore, Provider, useAtomValue} from 'jotai';
import {act} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {create} from 'zustand';
import {createClassyStore} from './ours/index.ts';
import {useClassyStore} from './ours/frameworks/react/react.ts';
import {prepareStoreForHydration} from './ours/frameworks/react/server.ts';

async function hydrate(element: React.ReactElement, html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const errors: string[] = [];
  await act(async () => {
    hydrateRoot(container, element, {
      onRecoverableError: (e) => errors.push(String((e as Error).message).split('\n')[0].slice(0, 60)),
    });
  });
  return {errors, text: container.textContent};
}

test('3a zustand: store written before hydration, no preparation', async () => {
  const useStore = create<{n: number}>(() => ({n: 0}));
  const C = () => <b>{useStore((s) => s.n)}</b>;
  const html = renderToString(<C />);
  useStore.setState({n: 5}); // e.g. a persist restore or an earlier boundary
  const r = await hydrate(<C />, html);
  console.log('zustand:', JSON.stringify({html, ...r}));
});

test('3b jotai: atom written before hydration, no useHydrateAtoms', async () => {
  const nAtom = atom(0);
  const store = createStore();
  const C = () => <b>{useAtomValue(nAtom)}</b>;
  const tree = (
    <Provider store={store}>
      <C />
    </Provider>
  );
  const html = renderToString(tree);
  store.set(nAtom, 5);
  const r = await hydrate(tree, html);
  console.log('jotai:', JSON.stringify({html, ...r}));
});

test('3c classy: written before hydration, not prepared', async () => {
  const store = createClassyStore({n: 0});
  const C = () => <b>{useClassyStore(store, (s) => s.n)}</b>;
  const html = renderToString(<C />);
  store.n = 5;
  const r = await hydrate(<C />, html);
  console.log('classy unprepared:', JSON.stringify({html, ...r}));
});

test('3d classy: written before hydration, prepareStoreForHydration', async () => {
  const store = prepareStoreForHydration(createClassyStore({n: 0}));
  const C = () => <b>{useClassyStore(store, (s) => s.n)}</b>;
  const html = renderToString(<C />);
  store.n = 5;
  const r = await hydrate(<C />, html);
  console.log('classy prepared:', JSON.stringify({html, ...r}));
});

import {createJSONStorage, persist} from 'zustand/middleware';
test('3e zustand + persist with a sync storage that already holds n=7', async () => {
  const data: Record<string, string> = {k: JSON.stringify({state: {n: 7}, version: 0})};
  const storage = createJSONStorage(() => ({
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  }));
  const useStore = create<{n: number}>()(persist(() => ({n: 0}), {name: 'k', storage}));
  const C = () => <b>{useStore((s) => s.n)}</b>;
  const html = renderToString(<C />); // server has no storage; use the initial state
  const r = await hydrate(<C />, html);
  console.log('zustand persist (sync storage holding 7): getState().n =', useStore.getState().n, JSON.stringify({html, ...r}));
});
```

Output:

```text

zustand: {"html":"<b>0</b>","errors":[],"text":"5"}
jotai: {"html":"<b>0</b>","errors":["Hydration failed because the server rendered text didn't mat"],"text":"5"}
classy unprepared: {"html":"<b>0</b>","errors":["Hydration failed because the server rendered text didn't mat"],"text":"5"}
classy prepared: {"html":"<b>0</b>","errors":[],"text":"5"}
zustand persist (sync storage holding 7): getState().n = 7 {"html":"<b>0</b>","errors":[],"text":"7"}

```

### p4-persist.test.tsx

```ts
// Port 4: persist lifecycle, version handling and what is written.
import {expect, spyOn, test} from 'bun:test';
import {atom, createStore} from 'jotai';
import {atomWithStorage} from 'jotai/utils';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import {createClassyStore} from './ours/index.ts';
import {persist as classyPersist} from './ours/utils/index.ts';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const memory = (seed: Record<string, string> = {}) => {
  const data = {...seed};
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
      writes.push(v);
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
};

test('4a hydration timing with a SYNC storage', async () => {
  const mem = memory({k: JSON.stringify({state: {n: 7}, version: 0})});
  const z = create<{n: number}>()(
    persist(() => ({n: 0}), {name: 'k', storage: createJSONStorage(() => mem)}),
  );
  const zAtCreate = z.getState().n;
  const zHyd = z.persist.hasHydrated();

  class S {
    n = 0;
  }
  const c = createClassyStore(new S());
  const h = classyPersist(c, {name: 'k', storage: mem});
  const cAtCreate = c.n;
  const cHyd = h.isHydrated;
  await h.hydrated;
  console.log(
    JSON.stringify({
      zustand: {atCreate: zAtCreate, hasHydrated: zHyd},
      classy: {atCreate: cAtCreate, isHydrated: cHyd, afterHydrated: c.n},
    }),
  );
  h.dispose();
});

test('4b jotai atomWithStorage: initial value first, stored value on mount', async () => {
  const mem = memory({k: JSON.stringify(7)});
  const a = atomWithStorage('k', 0, {
    getItem: (k, init) =>
      mem.getItem(k) === null ? init : JSON.parse(mem.getItem(k) as string),
    setItem: (k, v) => mem.setItem(k, JSON.stringify(v)),
    removeItem: (k) => mem.removeItem(k),
  });
  const store = createStore();
  const before = store.get(a);
  const unsub = store.sub(a, () => {});
  console.log(
    'jotai: read before any subscriber',
    before,
    '| after sub (onMount)',
    store.get(a),
  );
  unsub();
});

test('4c stored version differs and there is no migrate', async () => {
  const mem = memory({k: JSON.stringify({state: {n: 7}, version: 1})});
  const err = spyOn(console, 'error').mockImplementation(() => {});
  const z = create<{n: number}>()(
    persist(() => ({n: 0}), {
      name: 'k',
      version: 2,
      storage: createJSONStorage(() => mem),
    }),
  );
  const zMsg = err.mock.calls.map((c) => String(c[0]).slice(0, 70));
  err.mockRestore();

  class S {
    n = 0;
  }
  const c = createClassyStore(new S());
  const errors: unknown[] = [];
  const h = classyPersist(c, {
    name: 'k',
    version: 2,
    storage: mem,
    onError: (e, op) => errors.push([String(e), op]),
  });
  await h.hydrated;
  console.log(
    JSON.stringify({
      zustand: {n: z.getState().n, console_error: zMsg},
      classy: {n: c.n, onError: errors, status: h.getStatus?.() ?? 'n/a'},
    }),
  );
  h.dispose();
});

test('4d stored value has no version field', async () => {
  const mem = memory({k: JSON.stringify({state: {n: 7}})});
  const z = create<{n: number}>()(
    persist(() => ({n: 0}), {
      name: 'k',
      version: 2,
      storage: createJSONStorage(() => mem),
    }),
  );
  class S {
    n = 0;
  }
  const c = createClassyStore(new S());
  const h = classyPersist(c, {name: 'k', version: 2, storage: mem});
  await h.hydrated;
  console.log(
    JSON.stringify({
      zustand_n_with_version_2_and_unversioned_record: z.getState().n,
      classy_n: c.n,
    }),
  );
  h.dispose();
});

test('4e after a migration, is the migrated record written back at once?', async () => {
  const seed = JSON.stringify({state: {old: 7}, version: 1});
  const memZ = memory({k: seed});
  const z = create<{n: number}>()(
    persist(() => ({n: 0}), {
      name: 'k',
      version: 2,
      storage: createJSONStorage(() => memZ),
      migrate: (s: any) => ({n: s.old}),
    }),
  );
  await flush();
  class S {
    n = 0;
  }
  const memC = memory({k: seed});
  const c = createClassyStore(new S());
  const h = classyPersist(c, {
    name: 'k',
    version: 2,
    storage: memC,
    migrate: (s: any) => ({n: s.old}),
  });
  await h.hydrated;
  await flush();
  console.log(
    JSON.stringify({
      zustand: {n: z.getState().n, writes: memZ.writes},
      classy: {n: c.n, writes: memC.writes},
    }),
  );
  h.dispose();
});

test('4f a persisted store with a method: what is written, and is there a way to stop writing', async () => {
  const mem = memory();
  const z = create<{n: number; inc: () => void}>()(
    persist((set) => ({n: 0, inc: () => set((s) => ({n: s.n + 1}))}), {
      name: 'k',
      storage: createJSONStorage(() => mem),
      partialize: (s) => ({n: s.n}),
    }),
  );
  z.getState().inc();
  z.getState().inc();
  const zWrites = mem.writes.length;
  class S {
    n = 0;
    inc() {
      this.n++;
    }
  }
  const memC = memory();
  const c = createClassyStore(new S());
  const h = classyPersist(c, {name: 'k', storage: memC});
  await h.hydrated;
  c.inc();
  await flush();
  c.inc();
  await flush();
  console.log(
    JSON.stringify({
      zustand: {writes: zWrites, last: mem.writes.at(-1)},
      classy: {writes: memC.writes.length, last: memC.writes.at(-1)},
    }),
  );
  h.dispose();
});
```

Output:

```text

{"zustand":{"atCreate":7,"hasHydrated":true},"classy":{"atCreate":0,"isHydrated":false,"afterHydrated":7}}
jotai: read before any subscriber 0 | after sub (onMount) 7
{"zustand":{"n":0,"console_error":["State loaded from storage couldn't be migrated since no migrate functi"]},"classy":{"n":0,"onError":[],"status":"n/a"}}
{"zustand_n_with_version_2_and_unversioned_record":7,"classy_n":0}
{"zustand":{"n":7,"writes":["{\"state\":{\"n\":7},\"version\":2}"]},"classy":{"n":7,"writes":[]}}
{"zustand":{"writes":2,"last":"{\"state\":{\"n\":2},\"version\":0}"},"classy":{"writes":2,"last":"{\"version\":0,\"state\":{\"n\":2}}"}}

```

### p5-devtools.test.tsx

```ts
// Port 5: devtools action names, and time travel across several fields.
import {expect, test} from 'bun:test';
import {create} from 'zustand';
import {devtools as zdevtools} from 'zustand/middleware';
import {createClassyStore, subscribe} from './ours/index.ts';
import {devtools} from './ours/utils/index.ts';

function fakeExtension() {
  const sent: Array<{action: unknown; state: unknown}> = [];
  let listener: ((m: any) => void) | undefined;
  const ext = {
    connect: (opts: unknown) => ({
      init: (s: unknown) => sent.push({action: 'INIT', state: s}),
      send: (action: unknown, state: unknown) => sent.push({action, state}),
      subscribe: (l: (m: any) => void) => {
        listener = l;
        return () => {};
      },
      unsubscribe: () => {},
    }),
  };
  (globalThis as any).window.__REDUX_DEVTOOLS_EXTENSION__ = ext;
  return {sent, dispatch: (m: unknown) => listener?.(m)};
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

test('5a action names from a store method', async () => {
  const z = fakeExtension();
  const useStore = create<{n: number; inc: () => void; incNamed: () => void}>()(
    zdevtools(
      (set) => ({
        n: 0,
        inc: () => set((s) => ({n: s.n + 1})),
        incNamed: () =>
          set((s) => ({n: s.n + 1}), undefined, 'counter/incNamed'),
      }),
      {name: 'z', enabled: true},
    ),
  );
  useStore.getState().inc();
  useStore.getState().incNamed();

  const c = fakeExtension();
  class S {
    n = 0;
    inc() {
      this.n++;
    }
    reset() {
      this.n = 0;
    }
  }
  const store = createClassyStore(new S());
  const h = devtools(store, {name: 'c'});
  store.inc();
  store.inc();
  store.reset();
  await flush();
  console.log(
    JSON.stringify({
      zustand: z.sent.map((x) => x.action),
      classy: c.sent.map((x) => x.action),
    }),
  );
  h.dispose();
});

test('5b time travel: how many sync notifications for a 3-field jump', async () => {
  const c = fakeExtension();
  class S {
    a = 0;
    b = 0;
    c = 0;
  }
  const store = createClassyStore(new S());
  const h = devtools(store);
  let syncCalls = 0;
  subscribe(store, () => syncCalls++, {sync: true});
  c.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: JSON.stringify({a: 1, b: 2, c: 3}),
  });
  await flush();

  const z = fakeExtension();
  const useStore = create<{a: number; b: number; c: number}>()(
    zdevtools(() => ({a: 0, b: 0, c: 0}), {enabled: true}),
  );
  let zCalls = 0;
  useStore.subscribe(() => zCalls++);
  z.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: JSON.stringify({a: 1, b: 2, c: 3}),
  });
  console.log(
    JSON.stringify({
      classy_sync_subscriber_calls_for_one_jump: syncCalls,
      zustand_subscriber_calls_for_one_jump: zCalls,
    }),
  );
  h.dispose();
});

test('5c time travel of a Date field, and RESET / COMMIT messages', async () => {
  const c = fakeExtension();
  class S {
    at = new Date(0);
    n = 0;
  }
  const store = createClassyStore(new S());
  const h = devtools(store);
  store.n = 1;
  store.at = new Date(5000);
  await flush();
  const jsonState = JSON.stringify({at: new Date(0), n: 0}); // what the extension sends back
  c.dispatch({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: jsonState,
  });
  await flush();
  const afterJump = typeof (store as any).at + ':' + (store as any).at;
  store.n = 5;
  await flush();
  c.dispatch({type: 'DISPATCH', payload: {type: 'RESET'}});
  await flush();
  console.log(
    JSON.stringify({
      classy_after_jump_type_of_at: afterJump,
      n_before_RESET_message: 5,
      n_after_RESET_message: store.n,
    }),
  );
  h.dispose();
});
```

Output:

```text

{"zustand":["INIT",{"type":"anonymous"},{"type":"counter/incNamed"}],"classy":["INIT",{"type":"STORE_UPDATE"}]}
{"classy_sync_subscriber_calls_for_one_jump":3,"zustand_subscriber_calls_for_one_jump":1}
{"classy_after_jump_type_of_at":"string:1970-01-01T00:00:00.000Z","n_before_RESET_message":5,"n_after_RESET_message":5}

```

### p6-subscribe.test.tsx

```ts
// Port 6: subscribing outside React, and to one slice.
import {expect, test} from 'bun:test';
import {atom, createStore} from 'jotai';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {createClassyStore, snapshot, subscribe} from './ours/index.ts';
import {subscribeKey} from './ours/utils/index.ts';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

test('6a notification timing for two writes in a row', async () => {
  const z = create<{n: number}>()(() => ({n: 0}));
  let zc = 0;
  z.subscribe(() => zc++);
  z.setState({n: 1});
  z.setState({n: 2});
  const zSync = zc;

  const nAtom = atom(0);
  const js = createStore();
  let jc = 0;
  js.sub(nAtom, () => jc++);
  js.set(nAtom, 1);
  js.set(nAtom, 2);
  const jSync = jc;

  const c = createClassyStore({n: 0});
  let cc = 0;
  subscribe(c, () => cc++);
  let cs = 0;
  subscribe(c, () => cs++, {sync: true});
  c.n = 1;
  c.n = 2;
  const cSync = [cc, cs];
  await flush();
  console.log(
    JSON.stringify({
      zustand_sync_calls: zSync,
      jotai_sync_calls: jSync,
      classy_default_and_sync_right_after: cSync,
      classy_default_after_flush: cc,
    }),
  );
});

test('6b slice subscription: a derived value, equality, fireImmediately, previous value', async () => {
  const z = create<{items: number[]; other: number}>()(
    subscribeWithSelector(() => ({items: [1], other: 0})),
  );
  const zCalls: unknown[] = [];
  z.subscribe(
    (s) => s.items.length,
    (len, prev) => zCalls.push([len, prev]),
    {fireImmediately: true},
  );
  z.setState({other: 1}); // not the slice
  z.setState({items: [1, 2]});

  const c = createClassyStore({items: [1], other: 0});
  const cCalls: unknown[] = [];
  // subscribeKey takes a key, not a selector: watch `items` and compare lengths by hand.
  let prevLen = snapshot(c).items.length;
  subscribeKey(c, 'items', (items) => {
    if (items.length !== prevLen) {
      cCalls.push([items.length, prevLen]);
      prevLen = items.length;
    }
  });
  c.other = 1;
  await flush();
  c.items.push(2);
  await flush();
  console.log(JSON.stringify({zustand: zCalls, classy_by_hand: cCalls}));
});

test('6c subscribeKey on a nested path is not possible, only top-level keys', () => {
  // `K extends keyof T & keyof Snapshot<T>`: a nested field has no key here.
  const c = createClassyStore({user: {name: 'a'}});
  const calls: unknown[] = [];
  subscribeKey(c, 'user', (u) => calls.push(u.name));
  expect(typeof c.user).toBe('object');
});

test('6d the multi-field write: Zustand setState({a, b}) against Object.assign on our store', async () => {
  const z = create<{a: number; b: number}>()(() => ({a: 0, b: 0}));
  let zc = 0;
  z.subscribe(() => zc++);
  z.setState({a: 1, b: 1});

  const c = createClassyStore({a: 0, b: 0});
  let syncCalls = 0;
  let batchedCalls = 0;
  subscribe(c, () => syncCalls++, {sync: true});
  subscribe(c, () => batchedCalls++);
  Object.assign(c, {a: 1, b: 1});
  await flush();
  console.log(
    JSON.stringify({
      zustand_setState_two_fields: zc,
      classy_Object_assign_sync: syncCalls,
      classy_Object_assign_default: batchedCalls,
    }),
  );
});
```

Output:

```text

{"zustand_sync_calls":2,"jotai_sync_calls":2,"classy_default_and_sync_right_after":[0,2],"classy_default_after_flush":1}
{"zustand":[[1,1],[2,1]],"classy_by_hand":[[2,1]]}
{"zustand_setState_two_fields":1,"classy_Object_assign_sync":2,"classy_Object_assign_default":1}

```

### p7-migrate.test.tsx

```ts
// Port 7: an async migrate, which Zustand allows (PromiseLike result).
import {test} from 'bun:test';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import {createClassyStore} from './ours/index.ts';
import {persist as classyPersist} from './ours/utils/index.ts';

const mem = (seed: string) => {
  const d: Record<string, string> = {k: seed};
  return {
    getItem: (k: string) => d[k] ?? null,
    setItem: (k: string, v: string) => void (d[k] = v),
    removeItem: (k: string) => void delete d[k],
  };
};
test('7 async migrate', async () => {
  const seed = JSON.stringify({state: {old: 7}, version: 1});
  const z = create<{n: number}>()(
    persist(() => ({n: 0}), {
      name: 'k',
      version: 2,
      storage: createJSONStorage(() => mem(seed)),
      migrate: async (s: any) => ({n: s.old}),
    }),
  );
  await new Promise((r) => setTimeout(r, 5));
  class S {
    n = 0;
  }
  const c = createClassyStore(new S());
  const errs: unknown[] = [];
  const h = classyPersist(c, {
    name: 'k',
    version: 2,
    storage: mem(seed),
    migrate: (async (s: any) => ({n: s.old})) as any,
    onError: (e, op) => errs.push(op),
  });
  await h.hydrated;
  console.log(
    JSON.stringify({
      zustand_n: z.getState().n,
      classy_n: c.n,
      classy_onError: errs,
      classy_isHydrated: h.isHydrated,
    }),
  );
  h.dispose();
});
```

Output:

```text

{"zustand_n":7,"classy_n":0,"classy_onError":[],"classy_isHydrated":true}

```

### p8-delivery.test.tsx

```ts
// Port 8: stage 1 findings 18, 20, 21, 22 (subscriber delivery) against
// Zustand's subscribe and Jotai's store.sub. Ours is the same case with
// {sync: true} subscribers.
import {test} from 'bun:test';
import {atom, createStore} from 'jotai';
import {create} from 'zustand';
import {createClassyStore, subscribe} from './ours/index.ts';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

test('8a finding 18: a subscriber that writes to its own store', async () => {
  const z = create<{n: number}>()(() => ({n: 0}));
  let zCalls = 0;
  let zErr = '';
  z.subscribe(() => {
    zCalls++;
    if (zCalls < 5000) z.setState({n: zCalls}); // bounded only so the test ends
  });
  z.setState({n: -1});
  const j = createStore();
  const nAtom = atom(0);
  let jCalls = 0;
  j.sub(nAtom, () => {
    jCalls++;
    if (jCalls < 5000) j.set(nAtom, jCalls);
  });
  j.set(nAtom, -1);
  console.log(
    JSON.stringify({
      zustand_calls_until_bound: zCalls,
      jotai_calls_until_bound: jCalls,
    }),
  );
});

test('8b finding 20: unsubscribe a later subscriber during delivery', async () => {
  const z = create<{n: number}>()(() => ({n: 0}));
  let unsubB = () => {};
  const zLog: string[] = [];
  z.subscribe(() => {
    zLog.push('A');
    unsubB();
  });
  unsubB = z.subscribe(() => zLog.push('B'));
  z.setState({n: 1});

  const c = createClassyStore({n: 0});
  const cLog: string[] = [];
  let cUnsubB = () => {};
  subscribe(
    c,
    () => {
      cLog.push('A');
      cUnsubB();
    },
    {sync: true},
  );
  cUnsubB = subscribe(c, () => cLog.push('B'), {sync: true});
  c.n = 1;
  console.log(JSON.stringify({zustand: zLog, classy_sync: cLog}));
});

test('8c finding 21: subscribe during delivery of the write that is being delivered', async () => {
  const z = create<{n: number}>()(() => ({n: 0}));
  const zLog: string[] = [];
  let added = false;
  z.subscribe(() => {
    zLog.push('A');
    if (!added) {
      added = true;
      z.subscribe(() => zLog.push('late'));
    }
  });
  z.setState({n: 1});

  const c = createClassyStore({n: 0});
  const cLog: string[] = [];
  let cAdded = false;
  subscribe(
    c,
    () => {
      cLog.push('A');
      if (!cAdded) {
        cAdded = true;
        subscribe(c, () => cLog.push('late'), {sync: true});
      }
    },
    {sync: true},
  );
  c.n = 1;
  console.log(JSON.stringify({zustand: zLog, classy_sync: cLog}));
});

test('8d finding 22: a re-entrant write, what the next subscriber sees', async () => {
  const z = create<{n: number}>()(() => ({n: 0}));
  const zSeen: number[] = [];
  let wrote = false;
  z.subscribe((s) => {
    if (!wrote) {
      wrote = true;
      z.setState({n: 2});
    }
  });
  z.subscribe((s) => zSeen.push(s.n));
  z.setState({n: 1});

  const c = createClassyStore({n: 0});
  const cSeen: number[] = [];
  let cWrote = false;
  subscribe(
    c,
    () => {
      if (!cWrote) {
        cWrote = true;
        c.n = 2;
      }
    },
    {sync: true},
  );
  subscribe(c, () => cSeen.push(c.n), {sync: true});
  c.n = 1;
  console.log(
    JSON.stringify({zustand_B_sees: zSeen, classy_sync_B_sees: cSeen}),
  );
});
```

Output:

```text

{"zustand_calls_until_bound":5000,"jotai_calls_until_bound":5000}
{"zustand":["A"],"classy_sync":["A","B"]}
{"zustand":["A","late"],"classy_sync":["A"]}
{"zustand_B_sees":[2,2],"classy_sync_B_sees":[2,2]}

```

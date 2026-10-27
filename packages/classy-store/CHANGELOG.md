# @codebelt/classy-store

## 0.8.1

### Patch Changes

- [#36](https://github.com/codeBelt/classy-store/pull/36) [`4d4e800`](https://github.com/codeBelt/classy-store/commit/4d4e80006483fa104f0cb934f8f00e122220f540) Thanks [@codeBelt](https://github.com/codeBelt)! - Fix Svelte readable-store subscriptions to deliver mutations synchronously,
  including mutations made by the initial callback. Prevent callbacks after
  unsubscription and clean up if the initial callback throws. Ordinary core
  subscriptions remain batched. Add regressions for Svelte 5 input editing,
  computed values, list updates, and component cleanup.

## 0.8.0

### Minor Changes

- [#34](https://github.com/codeBelt/classy-store/pull/34) [`10faa38`](https://github.com/codeBelt/classy-store/commit/10faa38e29a02bf85f8dac696177d6dae8ee79cb) Thanks [@codeBelt](https://github.com/codeBelt)! - **Upgrade required from 0.7.x.** Add observable utility status and simplify the public API. See the [0.8.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_8) for migration examples.

  - History and persistence handles expose `getSnapshot()`, `getServerSnapshot()`, and `subscribe(listener)`. Use the new `useHistoryStatus(history)` React hook for undo/redo availability and recording state, and `usePersistStatus(handle)` for hydration, expiry, and persistence errors. Both expose disposal status and update even when store data does not change. Each hook accepts its matching handle type and shares an internal subscription implementation.
  - Explicit `save()`, `clear()`, and `rehydrate()` calls reject on failure after reporting through `onError` and status. These methods take no options; catch rejected promises in event handlers and effects. Automatic writes and initial hydration handle reported failures internally. Failed calls do not block later queued writes. Calls on disposed handles and explicit queued operations cancelled by disposal reject.
  - Persistence cleanup is now `dispose()`. The `unsubscribe()` method has been removed; update effect cleanups and other teardown calls to `handle.dispose()`. Repeated disposal is safe and still stops listeners and timers, ignores pending reads, and skips queued writes that have not started.
  - Remove the public `getVersion` export. Use `subscribe()` for notifications or compare `snapshot()` references for change detection. The version helper remains internal for persistence and core bookkeeping.
  - Keep the shared `UtilityStatusSource` type internal. Use the exported `HistoryHandle`, `PersistHandle`, `HistoryStatus`, and `PersistStatus` types in consumers. Also export `PersistOperation` from the utilities entry.
  - Import `prepareStoreForHydration` from `@codebelt/classy-store/react/server` on both server and client. The duplicate export from `@codebelt/classy-store/react` has been removed.
  - Persistence transforms infer their value type from `key`. Serializers receive that property's readonly snapshot; deserializers must return the matching mutable property type. Existing transforms that return another property's type or mutate snapshot inputs now fail TypeScript checks. Persistence flags are readonly in the public types, matching their existing runtime getters.
  - Preserve explicit history pause state when undo/redo finishes. Update React and Next.js examples to subscribe to utility status directly.

  `hydrated` and `isHydrated` indicate that a hydration attempt has settled, including failure or an obsolete read. Inspect `lastError`; await explicit operations and handle their errors when success matters. Utility status uses its initial snapshot during SSR/hydration; construct server and client handles with matching initial status.

  Reorganize React hooks and internal types by ownership, split computed tests by layer, and name regression suites by behavior. This structural cleanup preserves runtime behavior and package entry points.

## 0.7.0

### Minor Changes

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Add a server-safe `@codebelt/classy-store/react/server` entry for `prepareStoreForHydration`, and mark the published React hooks entry with `use client`. The existing preparation export remains available from `/react`; both use the same capture cache within a module graph.

  Fix `Snapshot<T>` function classification so methods with typed parameters retain their callable signatures under strict TypeScript, including reactive collection queries, overloads, and generic functions.

  Add packed-package production Next.js App Router tests with React Compiler off/on for package boundaries, request isolation, controlled inputs, streaming hydration, navigation, refresh, and cleanup, plus CI coverage and integration documentation.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Add `prepareStoreForHydration(store)` to the React entry point. Call it on server and client stores initialized with matching data, before rendering or persistence, to retain the initial snapshot for server rendering and delayed Suspense hydration. Hooks then catch up to the live store without replacing server DOM, even if persistence changes state before their first read.

  Preparation returns the original mutable proxy, preserves the first capture on repeated calls, and keeps current client subscriptions and core snapshots unchanged. Equal selector results retain their identity when hydration switches to live state. Add delayed and streamed hydration regressions, React 18/19 package coverage, and usage documentation.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - **Upgrade required for React consumers using timing options.** React subscriptions now always notify synchronously, fixing controlled-input caret jumps without configuration. Remove the `sync` option from `useClassyStore` and hooks returned by `createStoreHook`, and remove imports of `UseClassyStoreOptions`. Remove the entire options argument in auto-tracked mode, including an empty `{}`. Selector options still accept `isEqual`. Ordinary `subscribe()` callbacks remain microtask-batched and retain their existing `sync` option.

  See the [0.7.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_7) for before/after examples, the new native `WeakRef` requirement for auto-tracking, and SSR, Next.js, and persistence guidance.

  React selectors may run after each mutation; several writes are not an atomic transaction. React can batch the resulting renders within an event handler. Auto-tracked reads are isolated per render so conditional and abandoned renders do not retain stale dependencies, including for class and null-prototype snapshots. Unchanged tracked references remain stable across parent renders.

  Persistence hydration restores mutable nested defaults and custom merged values while preserving prototypes and user accessors. Add real-browser input regressions, lifecycle and SSR coverage, and packed-package checks for React 18 and 19.

### Patch Changes

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Restore mutable nested state after undo/redo while preserving reactive collection methods and keeping recorded snapshots unchanged. Refresh React selections when selectors or equality functions change, even when the store has not mutated. Update the library's development dependencies and add regression coverage for both fixes.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Keep asynchronous persistence writes and removals in request order. Reads wait for prior writes and ignore results superseded by a newer read, save, clear, or local edit. Clearing storage cancels pending auto-saves, and cleanup skips queued operations that have not started.

  Ignore outdated browser storage events so two-tab synchronization cannot overwrite a newer local save with an older event. Add deterministic async regressions and real two-tab React tests in Chromium, Firefox, and WebKit.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Fix stale auto-tracked React views when React Compiler or manual memoization reuses a derived value or child without repeating its property reads. Preserve committed dependencies for each reused immutable snapshot object, including structurally shared children, while isolating reads from suspended or abandoned renders.

  Add compiled-consumer package tests for React 18 and 19, browser input and memoized-child regressions, and independent concurrency, hydration, and property-operation coverage. Selector APIs and synchronous React notification behavior are unchanged. Auto-tracking can conservatively retain earlier reads until a snapshot object's identity changes.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Reuse guarded backing copies of frozen snapshots across React auto-tracked consumers. Large forms and lists avoid repeatedly scanning and copying the same snapshot array while each hook retains its own tracked reads. Reflective mutations of tracking targets are rejected, and mutable computed values remain uncached.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - **Runtime requirement:** auto-tracked React hooks now require native `WeakRef` support (ES2021). Selector hooks do not require `WeakRef`. See the [0.7.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_7).

  Release removed child proxies from their former parents, including children removed by native array-length truncation. Failed writes and deletes preserve the existing child connection; partial array truncations invalidate only the removed entries.

  Discard obsolete untracked snapshot clones when a nested object starts using versioned tracking. This releases initial collection data and prevents fresh stores over the same raw object from receiving the stale cached clone.

  Use weak render-read keys and a weak commit queue to prevent auto-tracked React consumers from retaining obsolete collection snapshots through shared child proxies. Isolate stable subscription and selector callbacks from render-local closure contexts so they do not retain initial results for the lifetime of a mount.

  Add deterministic lifecycle and Compiler regressions plus production Chromium heap-snapshot checks for mounts, resets, rolling replacements, truncation, and intentionally retained detached children with Compiler off and on.

- [#31](https://github.com/codeBelt/classy-store/pull/31) [`1848a2d`](https://github.com/codeBelt/classy-store/commit/1848a2d4d02151fcf86c6103bd624151aa599b85) Thanks [@codeBelt](https://github.com/codeBelt)! - Ignore pending persistence read results and read-error callbacks after unsubscribe. Retired handles no longer overwrite a current React scope or clear storage when an expired read completes after effect cleanup. Pending hydration promises still settle when storage completes.

  Add a typed context example with independent and nested store instances, keyed resets, effect-owned persistence, and SSR hydration preparation. Test the actual example against packed React 18/19 consumers, including Strict Mode, storage configuration changes, asynchronous cleanup, and delayed Suspense hydration.

## 0.6.0

### Minor Changes

- [#29](https://github.com/codeBelt/classy-store/pull/29) [`342a3a1`](https://github.com/codeBelt/classy-store/commit/342a3a1eb5b2205aa231742786c42d659bd269ea) Thanks [@codeBelt](https://github.com/codeBelt)! - Add sync option

## 0.5.0

### Minor Changes

- [#27](https://github.com/codeBelt/classy-store/pull/27) [`0d930e4`](https://github.com/codeBelt/classy-store/commit/0d930e45e2324e30d55506bd5b6f1c465c209d25) Thanks [@codeBelt](https://github.com/codeBelt)! - feat: add createStoreHook for simplified React store integration

## 0.4.1

### Patch Changes

- [#25](https://github.com/codeBelt/classy-store/pull/25) [`5fb91d3`](https://github.com/codeBelt/classy-store/commit/5fb91d398a1cb001003b6d2a6ff9b5e7d656845b) Thanks [@codeBelt](https://github.com/codeBelt)! - core improvements and tests

## 0.4.0

### Minor Changes

- [#20](https://github.com/codeBelt/classy-store/pull/20) [`1199324`](https://github.com/codeBelt/classy-store/commit/1199324a3858a69f465cfc12fb92df97ea0ba100) Thanks [@codeBelt](https://github.com/codeBelt)! - refactor: rename `useStore` to `useClassyStore`

## 0.3.1

### Patch Changes

- [#17](https://github.com/codeBelt/classy-store/pull/17) [`3cb2880`](https://github.com/codeBelt/classy-store/commit/3cb2880a907c0fb1c9ea3dd77d52eb56b7665f48) Thanks [@codeBelt](https://github.com/codeBelt)! - - ensure paused state update is deferred using queueMicrotask in history utils
  - prevent arrow functions bypassing proxy traps, add error isolation for listeners

## 0.3.0

### Minor Changes

- [`a7b3d6a`](https://github.com/codeBelt/classy-store/commit/a7b3d6a17e8184695a84d15fa010da9988a45efd) Thanks [@codeBelt](https://github.com/codeBelt)! - refactor: simplify utils and core exports by removing unused functions and types

## 0.2.0

### Minor Changes

- [#8](https://github.com/codeBelt/classy-store/pull/8) [`96259f9`](https://github.com/codeBelt/classy-store/commit/96259f9aa38b3122e7c85f65d49acb9d39f48d3b) Thanks [@codeBelt](https://github.com/codeBelt)! - add framework-specific store utilities (Vue, Svelte, Angular, Solid)

## 0.1.3

### Patch Changes

- [`4084f39`](https://github.com/codeBelt/classy-store/commit/4084f397ee975988f742e5f49105b5115a9deb2d) Thanks [@codeBelt](https://github.com/codeBelt)! - Fix README not displaying on npm after monorepo migration

## 0.1.2

### Patch Changes

- [`b5a84ac`](https://github.com/codeBelt/classy-store/commit/b5a84ac80747dea5c74f14001187b4cbc12b9d6c) Thanks [@codeBelt](https://github.com/codeBelt)! - Restructure to Bun workspace monorepo

## 0.1.1

### Patch Changes

- [#11](https://github.com/codeBelt/classy-store/pull/11) [`47e4600`](https://github.com/codeBelt/classy-store/commit/47e46004aaeb42ac130c96c7170ac13640d19fe5) Thanks [@codeBelt](https://github.com/codeBelt)! - convert codebase to bun workspace

## 0.1.1

### Patch Changes

- [#7](https://github.com/codeBelt/classy-store/pull/7) [`64489ea`](https://github.com/codeBelt/classy-store/commit/64489eabb16e7d917ec211b97d65cf47148c6cb9) Thanks [@codeBelt](https://github.com/codeBelt)! - add `withHistory`, `devtools`, and `subscribeKey` utilities for enhanced state management

- [#6](https://github.com/codeBelt/classy-store/pull/6) [`14ffd85`](https://github.com/codeBelt/classy-store/commit/14ffd85f1b6107f4ec44cfcbd7abec0c234437c2) Thanks [@codeBelt](https://github.com/codeBelt)! - add `useLocalStore` hook for component-scoped reactive stores with tests and documentation

## 0.1.0

### Minor Changes

- [#4](https://github.com/codeBelt/classy-store/pull/4) [`59e2046`](https://github.com/codeBelt/classy-store/commit/59e204682755794139886839ed9ff9ff9f0ae158) Thanks [@codeBelt](https://github.com/codeBelt)! - replace `store` with `createClassyStore` across the codebase

## 0.0.2

### Patch Changes

- [#3](https://github.com/codeBelt/classy-store/pull/3) [`cb05c1b`](https://github.com/codeBelt/classy-store/commit/cb05c1b3133c56bcfd3fd3ba6027a053eee8ad94) Thanks [@codeBelt](https://github.com/codeBelt)! - add TTL expiration and related features to persistence utility

## 0.0.1

### Patch Changes

- [#1](https://github.com/codeBelt/classy-store/pull/1) [`4d371f4`](https://github.com/codeBelt/classy-store/commit/4d371f41a123860ef99288bbb71af3be2a084798) Thanks [@codeBelt](https://github.com/codeBelt)! - restructure internal folder hierarchy and module imports

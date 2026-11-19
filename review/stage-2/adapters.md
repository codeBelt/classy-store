# Stage 2: Adapters

Stage 2 of the pre-1.0 review, 2026-11-19. Read-only: nothing in the
repository was changed apart from this file.

## Versions, files and pages read

- **Frameworks**, as installed in this repository under
  `packages/classy-store/node_modules` and run from there: React 19.3.1 and
  React DOM 19.3.1 (peer range `^18.0.0 || ^19.0.0`), Vue 3.5.45 (`^3.2.0`),
  Svelte 5.57.3 (`^4.0.0 || ^5.0.0`), Solid 2.0.0 with `@solidjs/web`
  (`^2.0.0`), Angular 22.2.6 (`^22.0.0`). Svelte 4, React 18 and Vue 3.2 are
  not installed and were not run.
- **Ours**, `release/1.0` at `12fe57d`: everything under
  `packages/classy-store/src/frameworks/` (the five adapters, the React hooks,
  `createStoreHook`, `server.ts`), `package.json` (exports and peer ranges),
  `types.vue.test.ts` and the other `types.*.test.ts` for the adapters, and the
  guides `VUE.md`, `SVELTE.md`, `SOLID.md`, `ANGULAR.md`, `REACT_SSR.md`,
  `REACT_NEXT.md` and the "React Compiler compatibility" part of
  `API_REFERENCE.md` under `website/content/docs/`.
- **Framework documentation and source** (read through Context7 and in the
  installed packages):
  - React: <https://react.dev/reference/react/useSyncExternalStore> (the
    `getSnapshot` caching rule, `getServerSnapshot`).
  - Vue: <https://vuejs.org/api/composition-api-lifecycle.html#onmounted> and
    `#onunmounted` ("This hook is not called during server-side rendering"),
    <https://vuejs.org/api/reactivity-advanced.html> (`shallowRef`,
    `customRef`, `effectScope`, `onScopeDispose`),
    <https://vuejs.org/guide/scaling-up/ssr.html>.
  - Pinia: <https://pinia.vuejs.org/core-concepts/> (`defineStore`, the
    `useXStore` naming advice, `storeToRefs`),
    <https://pinia.vuejs.org/core-concepts/state.html> (`$subscribe` and
    `flush: 'sync'`).
  - Svelte: <https://svelte.dev/docs/svelte/stores> (the store contract),
    <https://svelte.dev/docs/svelte/svelte-reactivity#createSubscriber>,
    <https://svelte.dev/docs/svelte/svelte-store> (`fromStore`, `toStore`),
    <https://svelte.dev/docs/svelte/best-practices> ("If you need to observe
    something external to Svelte, use `createSubscriber`"), and
    `svelte/src/reactivity/create-subscriber.js`.
  - Solid 2: the installed `solid-js` 2.0.0 and `@solidjs/signals` exports
    (`createSignal`, `from`, `getOwner`, `isDisposed`, `onCleanup`, `flush`).
    No Solid documentation page was fetched; Solid claims below rest on code
    that was run.
  - Angular: <https://angular.dev/api/core/rxjs-interop/toSignal> and its
    source `packages/core/rxjs-interop/src/to_signal.ts` (`injector`,
    `manualCleanup`, `assertInInjectionContext`),
    <https://angular.dev/errors/NG0203>, <https://angular.dev/errors/NG0602>,
    and `signalSetFn` / `producerUpdatesAllowed` in the installed
    `@angular/core/fesm2022/_effect-chunk.mjs` (lines 125 and 360).
  - NgRx SignalStore: <https://ngrx.io/guide/signals/signal-store> (`withState`,
    `withComputed`, `protectedState`) and
    <https://ngrx.io/guide/signals/signal-store/state-tracking> (`watchState`,
    `getState`).
- **Runs:** Bun 1.4.4, in the scratch folder
  `scratchpad/stage-2-adapters/`, importing our source by absolute path. Code
  and output are in the appendix.

## Summary

The five adapters are small and correct in the common case, and four of the
six questions have good answers everywhere. Four things stand out:

1. **Every adapter builds a snapshot inside its listener** (finding A1). With
   a sync subscription, a loop of direct writes outside a store method builds
   one snapshot per write: 2,000 row writes take 630 to 760 ms with any adapter
   attached, against 1 to 3 ms with none, or inside `batch()`. Vue, Angular and
   Solid can build the snapshot at the read instead; React and Svelte cannot,
   so for them the fix is stage 1 finding 2 or grouping writes.
2. **The Vue adapter leaks a subscription on every server render** (V1): Vue
   does not dispose component scopes during SSR, so a module-level store gains
   one listener per request, forever.
3. **The Angular adapter drops a store write made inside a `computed`** (N1):
   its listener calls `signal.set()` in a reactive context, Angular throws, the
   core logs the error, and the signal stays stale until the next write. One
   `untracked()` fixes it.
4. **Names:** `useClassyStore` fits React and Vue, `toSvelteStore` fits
   Svelte, `injectClassyStore` fits Angular. Solid is the odd one: Solid
   primitives are `create*` or `from*`, and our adapter is exactly Solid 2's
   `from()` (verified). The Vue ref should be typed read-only (stage 1 finding
   17).

## React

**Answers.**

1. **Name.** `useClassyStore`, `createStoreHook`, `useLocalStore`,
   `usePersistStatus`, `useHistoryStatus`: hook names, as React users expect.
   Zustand's `create` returns a bound hook the way `createStoreHook` does.
2. **Return type.** A frozen snapshot (auto-tracked through a `proxy-compare`
   proxy) or the selected value. Read-only by construction.
3. **Cleanup.** Owned by `useSyncExternalStore`
   (`hooks/useClassyStore/useClassyStore.ts:118`). Outside a component the
   hook throws React's own invalid-hook-call error. Strict Mode's double
   subscribe is handled by React.
4. **Timing.** Sync (`useClassyStore.ts:144-147`). Right for
   `useSyncExternalStore`: React reads `getSnapshot` when notified and needs
   the change during the event for controlled inputs.
5. **Selectors.** Both: a selector with optional `isEqual`, or auto-tracking.
   `getSnapshot` returns the cached `snapshot()`, which satisfies React's rule
   that it return the same value while the store is unchanged.
6. **Server.** `useSyncExternalStore` does not subscribe on the server (0
   listeners after three renders, verified). An unprepared store renders its
   live state; `prepareStoreForHydration` (`server.ts:16-22`) pins the first
   snapshot, and later writes do not change the server output (verified:
   prepared at 5, written to 6, renders 5). The React Compiler is covered by
   the repository's own matrix (`tests/compiler/`, `API_REFERENCE.md` "React
   Compiler compatibility"); not re-checked here.

**Findings.** Only A1 below. The React adapter follows `useSyncExternalStore`
as documented; nothing else was found to change.

## Vue

**Answers.**

1. **Name.** `useClassyStore` is a composable name and fits. Pinia's
   `useXStore()` returns the store itself; ours returns a ref of the snapshot,
   which is closer to `storeToRefs`. The name is fine.
2. **Return type.** `Ref<Snapshot<T>>` (`vue/vue.ts:12`), a `shallowRef` at
   runtime (`vue.ts:20`). The ref is writable (V2).
3. **Cleanup.** `onScopeDispose` (`vue.ts:31`). Outside a scope it throws our
   message (`vue.ts:14-18`). On the server the scope is never disposed (V1).
4. **Timing.** Sync (`vue.ts:28`). Vue batches rendering itself, so this is
   right, and it matches Pinia's `$subscribe(..., {flush: 'sync'})` for
   callers that need every change.
5. **Selectors.** None, and none needed: a `computed(() => state.value.user)`
   only re-runs dependants when that branch changes, because structural sharing
   keeps its identity (verified: two unrelated writes, a whole-ref effect ran
   3 times, the `computed`-based effects once).
6. **Server.** Subscribes and never unsubscribes (V1).

### V1. The Vue adapter leaks one subscription per server render

- **What the framework recommends.** Vue does not call `onMounted` or
  `onUnmounted` during SSR, and its SSR guide says to put side effects that
  need cleanup in `onMounted`. Component effect scopes are not stopped after
  `renderToString`.
- **What we do.** Subscribe in the composable body (`vue.ts:22-29`), clean up
  in `onScopeDispose` (`vue.ts:31-34`).
- **Difference.** Three `renderToString` calls against one module-level store
  leave 1, 2, 3 listeners; `app.unmount()` afterwards is refused ("Cannot
  unmount an app that is not mounted"), so the application has no way out.
  Each stale listener builds a snapshot on every later write (A1). A sketch
  that subscribes in `onMounted` when a component instance is not yet mounted
  leaves 0 listeners on the server and works on the client (mount, write,
  unmount back to 0). Vue also exposes `inject(ssrContextKey)`, which returns
  non-null inside setup under `renderToString` (verified), if a check is
  preferred. Request-scoped stores are collected with the request, so the leak
  is for stores that outlive a request.
- **Proposal.** Adopt: subscribe in `onMounted` when called inside a component
  that is not mounted, at once otherwise (bare `effectScope`), and refresh the
  value once on subscribe for writes made between setup and mount. Say in
  `VUE.md` what SSR does, as `ANGULAR.md` does.
- **Kind.** Bug. **Cost.** `vue.ts`, `vue.test.ts`, `VUE.md`; not breaking;
  low risk.

### V2. The returned ref is writable (stage 1 finding 17)

- **What the framework recommends.** Vue types read-only refs as
  `Readonly<Ref<T>>` and offers `readonly()` / `shallowReadonly()` for a
  runtime guard; Pinia's `storeToRefs` getters are read-only refs.
- **What we do.** `Ref<Snapshot<T>>` (`vue.ts:12`).
- **Difference.** `state.value = {count: 99}` compiles and runs: the ref shows
  99 while the store holds 0, and dependants run on the fake value. The next
  store write overwrites it. Typed as `Readonly<Ref<Snapshot<T>>>`, the write
  is a compile error and the ref is still accepted by `unref`, `toValue`,
  `watch`, `computed` and as `MaybeRefOrGetter` (checked with `tsc`).
  `readonly(state)` at runtime refuses the write with a Vue warning and returns
  the same frozen snapshot.
- **Proposal.** Adopt the type change. A runtime `readonly()` wrapper in
  development is optional. The type `ShallowRef` would be more exact but was
  not checked against Vue 3.2.0, the floor of the peer range; `Ref` is.
- **Kind.** API design. **Cost.** `vue.ts`, `types.vue.test.ts` (its FINDING
  test flips); breaking only for code that writes the ref.

## Svelte

**Answers.**

1. **Name.** `toSvelteStore` matches Svelte's own `toStore` / `fromStore`
   conversions. Fits.
2. **Return type.** `ClassyReadable<Snapshot<T>>`, a `subscribe`-only object
   (`svelte/svelte.ts:8-10`). It is accepted where `svelte/store` wants a
   `Readable` (`derived`, `get`, `fromStore`; checked with `tsc` and run).
   Read-only.
3. **Cleanup.** Svelte's `$store` unsubscribes on destroy; manual subscribers
   call the returned function. No lifetime is needed, so nothing can be called
   outside one.
4. **Timing.** Sync (`svelte.ts:33`), as the store contract requires: the
   callback must run synchronously on subscribe and on every change.
5. **Selectors.** None. `derived(store, fn)` in Svelte 4 and `$derived` in
   Svelte 5 give the same granularity as a selector (verified: a `$derived` of
   `user` did not re-run on unrelated writes).
6. **Server.** `$store` in a server component subscribes, reads and
   unsubscribes: 0 listeners after three `render()` calls (verified).

### S1. The guide's variable name conflicts with the `$state` rune

- **What the framework recommends.** In runes mode a local binding named
  `state` read as `$state` is ambiguous; the compiler warns
  `store_rune_conflict` and asks for a rename.
- **What we do.** `SVELTE.md` names the store `state`
  (`website/content/docs/SVELTE.md:30`).
- **Difference.** The guide compiles as is, but as soon as the component also
  uses `let open = $state(false)`, Svelte 5.57.3 warns
  `store_rune_conflict`. Named `snap`, no warning in any case tried.
- **Proposal.** Adopt: rename in the guide and the Svelte example.
- **Kind.** Docs. **Cost.** `SVELTE.md`, `examples/svelte`; none.

### S2. A store-contract adapter is right for the peer range, but Svelte 5 users need the runes path written down

- **What the framework recommends.** Svelte 5 still supports stores, and
  `fromStore` turns one into a `{current}` rune object. For "something
  external to Svelte" the best-practices page points to `createSubscriber`
  (Svelte 5 only).
- **What we do.** The store contract only.
- **Difference.** `$snap` is a compile error in a `.svelte.js` / `.svelte.ts`
  module (`store_invalid_subscription_module`), where Svelte 5 users keep
  shared logic. `fromStore(toSvelteStore(store))` works there (verified), and
  so does a ten-line `createSubscriber` binding that builds the snapshot at the
  read (verified, same effect runs as `fromStore`). Both unsubscribe a
  microtask after the last effect is destroyed (2 listeners in the same tick, 0
  on the next task): that is `createSubscriber`'s documented deferral.
- **Proposal.** Keep `toSvelteStore`: it is the only shape that works on both
  Svelte 4 and 5. Document `fromStore(toSvelteStore(store))` for runes modules.
  A rune-native helper (built on `createSubscriber`) would import
  `svelte/reactivity`, which Svelte 4 lacks, so it needs either a separate
  entry or dropping Svelte 4 from the peer range; decide that with question 7.
  A lazy `createSubscriber` helper would also avoid A1 for Svelte.
- **Kind.** API design, docs. **Cost.** `SVELTE.md` now; a new entry later if
  wanted; not breaking.

## Solid

**Answers.**

1. **Name.** `useClassyStore` does not follow Solid: primitives are
   `createSignal`, `createMemo`, `createStore`, and Solid 2 has `from()` for
   exactly what this adapter does (O2).
2. **Return type.** An accessor `() => Snapshot<T>` (`solid/solid.ts:12`), as
   Solid users expect. Read-only.
3. **Cleanup.** `onCleanup` on the current owner (`solid.ts:38`); without a
   live owner it throws our message (`solid.ts:14-19`).
4. **Timing.** Sync into `setState` (`solid.ts:29-36`); Solid 2 defers the
   signal's visible value to `flush()`. A read straight after a write returns
   the old value until `flush()` (verified: 0 while the store holds 1). That is
   Solid 2's own rule for its signals, and the adapter's doc comment says so.
5. **Selectors.** None, none needed: `createMemo(() => state().user)` did not
   re-run its effect on unrelated writes (verified).
6. **Server.** Under Solid's server runtime, three `renderToString` calls leave
   0 listeners, and a read after a write is current (verified).

### O1. No Solid-specific defect found

The adapter matches `createMemo(() => from(subscribe))`, Solid 2's own
callback-source primitive, in values, timing and cleanup (verified: same
values, listener removed on dispose). Only A1 and the name apply.

## Angular

**Answers.**

1. **Name.** `injectClassyStore` follows Angular's `inject*` convention for
   functions that need an injection context. Fits.
2. **Return type.** `Signal<Snapshot<T>>` via `asReadonly()`
   (`angular/angular.ts:38`): read-only, like NgRx SignalStore's state signals.
3. **Cleanup.** `DestroyRef.onDestroy` (`angular.ts:33`). Outside an injection
   context the call fails in `inject(DestroyRef)` (`angular.ts:15`) with
   Angular's NG0203 naming `DestroyRef`, not our function (N2).
4. **Timing.** Sync `signal.set` (`angular.ts:28`). Angular schedules
   rendering, so sync is right, but see N1.
5. **Selectors.** None, none needed: `computed(() => state().user)` did not
   re-run dependants on unrelated writes (verified).
6. **Server.** Not run. Angular destroys the application's injectors after a
   server render, which would run `onDestroy`; `ANGULAR.md` asks for a
   request-scoped store. Reasoning from reading.

### N1. A store write made inside a `computed` is lost until the next write

- **What the framework recommends.** Angular forbids `signal.set()` while a
  consumer that disallows writes is active (`signalSetFn` checks
  `producerUpdatesAllowed`, `_effect-chunk.mjs:125,360`); `toSignal`'s source
  notes it must subscribe outside a reactive context, and NG0602 names
  `untracked` as the way out.
- **What we do.** `state.set(snapshot(proxyStore))` in the listener
  (`angular.ts:28`), no `untracked`.
- **Difference.** A `computed` that calls a store method which writes (a
  counter, a cache, lazy loading) makes our listener throw; the core sends the
  error to `console.error`, `store.reads` is 1 and the signal still says 0
  until the next ordinary write (verified). Wrapped in `untracked()`, the same
  write is accepted (verified with a bare signal and with a sketch adapter).
- **Proposal.** Adopt: `untracked(() => state.set(...))`.
- **Kind.** Bug. **Cost.** `angular.ts`, one test; not breaking; low risk.

### N2. No `injector` option and a misleading error outside an injection context

- **What the framework recommends.** `toSignal`, `toObservable`, `effect` and
  `afterNextRender` accept `{injector}`, and call
  `assertInInjectionContext(fn)` only when none is given, so the NG0203
  message names the user's call.
- **What we do.** `inject(DestroyRef)` only (`angular.ts:15`); our own message
  (`angular.ts:17`) is reached only with a destroyed injector, and it lacks the
  `@codebelt/classy-store/angular:` prefix the Vue and Solid messages use.
- **Difference.** Called from `ngOnInit` or an event handler the error names
  `DestroyRef`; `assertInInjectionContext(injectClassyStore)` would name
  `injectClassyStore()` (both verified). The only workaround today is
  `runInInjectionContext`.
- **Proposal.** Adopt: `injectClassyStore(store, {injector?})`, assert as
  `toSignal` does, and align the message prefix. Optionally
  `assertNotInReactiveContext` as `toSignal` does.
- **Kind.** API design, diagnostics. **Cost.** `angular.ts`, tests,
  `ANGULAR.md`; additive.

## Across adapters

### A1. Each adapter builds a snapshot per sync notification

- **What the frameworks recommend.** Vue's `customRef` lets a getter compute
  on read; Angular's `computed` and Svelte's `createSubscriber` are built for
  "notify cheaply, compute when read". React's `getSnapshot` and Svelte's store
  contract must hand over the value when notified.
- **What we do.** `snapshot(proxyStore)` in the listener: `vue.ts:26`,
  `svelte.ts:29`, `solid.ts:33`, `angular.ts:28`; React's `getSnapshot`
  (`useClassyStore.ts:97`), which React calls on each notification.
- **Difference.** Sync subscribers are notified once per direct write. A loop
  of 2,000 direct row writes, outside a method, median of 5 to 7 runs:

  | Attached                                         | Time              |
  | ------------------------------------------------ | ----------------- |
  | nothing                                          | 1 to 3 ms         |
  | sync subscriber, empty                           | 1.1 ms            |
  | sync subscriber calling `snapshot`               | 649 ms            |
  | batched subscriber calling it                    | 1.0 ms            |
  | Vue adapter                                      | 633 ms            |
  | Angular adapter                                  | 626 ms            |
  | Svelte adapter                                   | 647 ms            |
  | React selector hook, mounted                     | 764 ms            |
  | React auto-tracked hook, mounted                 | 655 ms            |
  | Vue sketch, snapshot built at read               | 2.2 ms            |
  | Angular sketch, `computed` over a version signal | 8.2 ms incl. read |
  | Vue adapter, writes in `batch()`                 | 2.0 ms            |
  | React selector hook, in `batch()`                | 2.6 ms            |

  The cost is quadratic: each snapshot after one row changes is linear in the
  rows (stage 1 finding 2). Writes inside a store method are one transaction
  and do not hit this.
- **Proposal.** Adapt. Vue: a `customRef` whose getter returns
  `snapshot(store)` and whose listener only triggers. Angular: a version signal
  bumped in `untracked`, read by a `computed` that returns the snapshot. Solid:
  the same with a version signal and `createMemo` (not measured). React and
  Svelte cannot defer; for them this is an argument for stage 1 finding 2 and
  for documenting `batch()` (or wrapping writes in methods) next to the sync
  timing in each guide.
- **Kind.** Performance. **Cost.** Three adapter files and their tests; not
  breaking; medium risk (timing tests in each adapter suite pin when the value
  is current).

### A2. Every adapter re-implements the guard for stage 1 finding 20

- **What we do.** An `active` flag checked in the listener: `vue.ts:21,26`,
  `svelte.ts:26,29`, `solid.ts:27,33`, `angular.ts:23,28`; Solid and Angular
  also check `isDisposed` / `destroyed`.
- **Proposal.** If stage 3 makes the core stop calling a removed subscriber
  (finding 20), drop the flags. Simplification; four files; no behaviour
  change.

## Comparison table

| Adapter | Name                | Entry                       | Returns               | Read-only | Cleanup                          | Timing                                | Selectors                    | Server                                |
| ------- | ------------------- | --------------------------- | --------------------- | --------- | -------------------------------- | ------------------------------------- | ---------------------------- | ------------------------------------- |
| React   | `useClassyStore`    | `./react`, `./react/server` | snapshot or selection | yes       | `useSyncExternalStore`           | sync, React reads on notify           | selector + auto-tracking     | no subscription; hydration snapshot   |
| Vue     | `useClassyStore`    | `./vue`                     | `Ref<Snapshot<T>>`    | no (V2)   | `onScopeDispose`; throws outside | sync, eager snapshot                  | none; `computed` suffices    | leaks one listener per render (V1)    |
| Svelte  | `toSvelteStore`     | `./svelte`                  | `ClassyReadable`      | yes       | caller / `$store`                | sync, eager snapshot                  | none; `derived` / `$derived` | `$store` reads once, no leak          |
| Solid   | `useClassyStore`    | `./solid`                   | `() => Snapshot<T>`   | yes       | `onCleanup`; throws outside      | sync, visible after `flush()`         | none; `createMemo`           | no leak                               |
| Angular | `injectClassyStore` | `./angular`                 | `Signal<Snapshot<T>>` | yes       | `DestroyRef`; NG0203 outside     | sync, eager; fails in `computed` (N1) | none; `computed`             | not run; request-scoped store advised |

## Stage 1 findings with a counterpart

| Stage 1                 | What the adapters do                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2                       | Multiplied by every sync adapter: one snapshot per direct write (A1).                                                                                                                          |
| 14                      | `Snapshot<[A, B]>` flattens tuples in every adapter's return type.                                                                                                                             |
| 16                      | Snapshot types of reactive collections keep their mutators in every adapter's return type.                                                                                                     |
| 17                      | Confirmed and run: the write compiles and changes what dependants see until the next store write. `Readonly<Ref<…>>` fixes it (V2).                                                            |
| 18                      | A framework callback that writes the store from a sync effect (Vue `flush: 'sync'` watch) re-enters the adapter listener; not run here. N1 is the Angular form of a write during notification. |
| 20                      | Each adapter guards against it with its own `active` flag (A2).                                                                                                                                |
| 22                      | Same snapshot delivered twice: Vue's `shallowRef` and Angular's `signal` ignore an identical value; Svelte's `$store` treats every object as changed. Reasoning, not run.                      |
| Tests of internal state | The adapter tests count `syncListeners`; so did every leak check here. A supported listener count would serve both.                                                                            |

## The eight API questions, from the adapters' side

1. **Sync by default?** The adapters all pass `{sync: true}` and need it
   (Svelte's contract, React's controlled inputs). Whether plain `subscribe()`
   defaults to sync makes no difference to them. No position on the default.
2. **Writes outside methods.** A1 is the cost: each direct write is one sync
   notification and one snapshot per adapter. `batch()` belongs in the API,
   and the guides should mention it where they describe sync timing.
3. **Enumerable getters on snapshots.** No position.
4. **Arrow methods, `#private`.** No position.
5. **Native Map and Set.** No position.
6. **Opt-in or opt-out.** No position.
7. **Entry points and names.** Answered below.
8. **Diagnostics.** Two from this work: name the caller in the Angular
   injection error (N2), and in development warn when a sync adapter listener
   sees many notifications in one task (the A1 pattern), suggesting `batch()`
   or a method.

## API question 7: consistency across the five frameworks

**Entry points** are consistent: `@codebelt/classy-store/<framework>`, one
per framework, plus `./react/server` because React Server Components need an
entry without hooks. Keep.

**Adapter names** follow each framework's idiom for React (`use*`), Vue
(`use*`, as Pinia's `useXStore`), Svelte (`to*`, like `toStore`) and Angular
(`inject*`, for functions that call `inject()`). Solid uses `use*`, which in
Solid means context lookup (`useContext`), while reactive primitives are
`create*` or `from*`. Since the scheme is "the framework's idiom", Solid is
the inconsistent one.

**Error messages:** Vue and Solid say
`@codebelt/classy-store/<framework>: useClassyStore() requires …`; Angular
says `injectClassyStore requires …` without the prefix, and its common case
shows Angular's message instead (N2). Svelte has no lifetime to check.

**Exported types:** Svelte exports `ClassyReadable`; React exports
`UseClassyStoreSelectorOptions`; the others export no types. Fine.

**What I would rename before 1.0:**

- **Solid:** `useClassyStore` to `fromClassyStore`, after Solid 2's `from()`,
  which it reproduces. (`createClassyStore` is taken by the core.)
- **Angular:** keep the name; add the `{injector}` option now, while the
  signature can change.
- **Vue:** keep the name; change the return type to `Readonly<Ref<…>>`.
- **Svelte:** keep `toSvelteStore`; rename the guide's `state` to `snap`.
- **React:** no change.

## What was verified by running code, and what was only read

**Run** (code and output in the appendix): Vue SSR leak, `unmount` refusal,
writable ref, `readonly()` guard, `computed` granularity, SSR detection, the
`onMounted` sketch on server and client; Angular NG0203 messages, the
`computed` write failure and the `untracked` fix, `computed` granularity,
cleanup on destroy, the `injector` sketch; React server rendering and
`prepareStoreForHydration`; Solid client timing, `flush()`, granularity,
cleanup, `from()` equivalence, server runtime; Svelte server rendering,
compile warnings and errors, `fromStore` and `createSubscriber` bindings,
deferred cleanup; types of the read-only Vue ref and of `ClassyReadable`
against `svelte/store` (`tsc`, exit 0); all A1 timings.

**Only read:** Svelte 4, React 18 and Vue 3.2 behaviour (not installed);
Angular on the server; Solid with a lazy binding (not measured); the React
Compiler (the repository's matrix covers it); stage 1 finding 22 per
framework; Pinia and NgRx SignalStore, from their documentation only.

## Appendix: scripts and output

All files are in
`<scratch>/stage-2-adapters/`,
run with `bun <file>` unless noted. `node_modules` there is a symlink to
`packages/classy-store/node_modules`.

### `vue-checks.ts`

Run: `bun vue-checks.ts`

```ts
// Vue adapter checks. Run: bun vue-checks.ts
import {
  computed,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  isReadonly,
  isRef,
  isShallow,
  readonly,
  shallowReadonly,
  version,
  watchEffect,
} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/vue/vue';

console.log('vue', version);
const listeners = (store: object) => getInternal(store).syncListeners.size;

// 1. Server rendering against a store that outlives the request.
{
  class Counter {
    count = 0;
    increment() {
      this.count++;
    }
  }
  const store = createClassyStore(new Counter());
  const App = defineComponent({
    setup() {
      const state = useClassyStore(store);
      return () => h('p', String(state.value.count));
    },
  });
  for (let request = 1; request <= 3; request++) {
    const app = createSSRApp(App);
    const html = await renderToString(app);
    console.log(
      `1. SSR request ${request}: ${html} -> sync listeners on the store: ${listeners(store)}`,
    );
  }
  // What an application can do about it today:
  const app = createSSRApp(App);
  await renderToString(app);
  const before = listeners(store);
  app.unmount();
  console.log(
    `1. app.unmount() after renderToString: ${before} -> ${listeners(store)}`,
  );
}

// 2. The returned ref accepts a write.
{
  const store = createClassyStore({count: 0});
  const scope = effectScope();
  const state = scope.run(() => useClassyStore(store))!;
  const seen: number[] = [];
  scope.run(() =>
    watchEffect(() => seen.push(state.value.count), {flush: 'sync'}),
  );
  // Compiles today: the type is Ref<Snapshot<T>>.
  state.value = {count: 99};
  console.log(
    '2. after state.value = {count: 99}: ref',
    state.value.count,
    'store',
    store.count,
    'effect saw',
    seen,
  );
  store.count = 1;
  console.log(
    '2. after store.count = 1: ref',
    state.value.count,
    'effect saw',
    seen,
  );
  console.log(
    '2. isRef',
    isRef(state),
    'isShallow',
    isShallow(state),
    'isReadonly',
    isReadonly(state),
  );

  // The same ref behind readonly(): what a guarded version does.
  const guarded = readonly(state);
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args[0]);
  (guarded as {value: unknown}).value = {count: 5};
  console.warn = originalWarn;
  console.log(
    '2. readonly(ref): isRef',
    isRef(guarded),
    'value after write',
    guarded.value.count,
    'warning:',
    String(warnings[0]).slice(0, 70),
  );
  console.log(
    '2. readonly(ref).value is the same frozen snapshot:',
    guarded.value === state.value,
    Object.isFrozen(guarded.value),
  );
  const shallowGuarded = shallowReadonly(state);
  console.log(
    '2. shallowReadonly(ref).value same snapshot:',
    shallowGuarded.value === state.value,
  );
  scope.stop();
}

// 3. A selector as a computed: does a dependent effect re-run when another field changes?
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const scope = effectScope();
  const runs = {whole: 0, count: 0, user: 0};
  scope.run(() => {
    const state = useClassyStore(store);
    const count = computed(() => state.value.count);
    const user = computed(() => state.value.user);
    watchEffect(
      () => {
        void state.value.count;
        runs.whole++;
      },
      {flush: 'sync'},
    );
    watchEffect(
      () => {
        void count.value;
        runs.count++;
      },
      {flush: 'sync'},
    );
    watchEffect(
      () => {
        void user.value;
        runs.user++;
      },
      {flush: 'sync'},
    );
  });
  store.other++;
  store.other++;
  console.log('3. after two writes to an unrelated field, effect runs:', runs);
  scope.stop();
}
```

Output:

```text
vue 3.5.45
1. SSR request 1: <p>0</p> -> sync listeners on the store: 1
1. SSR request 2: <p>0</p> -> sync listeners on the store: 2
1. SSR request 3: <p>0</p> -> sync listeners on the store: 3
[Vue warn]: Cannot unmount an app that is not mounted.
1. app.unmount() after renderToString: 4 -> 4
2. after state.value = {count: 99}: ref 99 store 0 effect saw [ 0, 99 ]
2. after store.count = 1: ref 1 effect saw [ 0, 99, 1 ]
2. isRef true isShallow true isReadonly false
2. readonly(ref): isRef true value after write 1 warning: [Vue warn] Set operation on key "value" failed: target is readonly.
2. readonly(ref).value is the same frozen snapshot: true true
2. shallowReadonly(ref).value same snapshot: true
3. after two writes to an unrelated field, effect runs: {
  whole: 3,
  count: 1,
  user: 1,
}
```

### `vue-ssr-detect.ts`

Run: `bun vue-ssr-detect.ts`

```ts
// Can an adapter tell, through public API, that Vue is rendering on the server? Run: bun vue-ssr-detect.ts
import {
  createSSRApp,
  defineComponent,
  effectScope,
  getCurrentInstance,
  h,
  inject,
  ssrContextKey,
} from 'vue';
import {renderToString} from 'vue/server-renderer';

function renderingOnServer() {
  return getCurrentInstance() ? inject(ssrContextKey, null) !== null : false;
}

const App = defineComponent({
  setup() {
    console.log('inside setup() under renderToString:', renderingOnServer());
    return () => h('p', 'x');
  },
});
await renderToString(createSSRApp(App));
effectScope().run(() =>
  console.log('inside a bare effectScope:', renderingOnServer()),
);
```

Output:

```text
inside setup() under renderToString: true
inside a bare effectScope: false
```

### `vue-sketch.ts` (used by the next two)

```ts
// A sketch of the Vue adapter that follows Vue's SSR guidance: the ref reads the
// store's cached snapshot, and the subscription starts in onMounted(), which Vue
// does not register while rendering on the server.
// Used by vue-prototype-server.ts and vue-prototype-client.ts.
import {
  customRef,
  getCurrentInstance,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  readonly,
  type Ref,
} from 'vue';
import {
  getInternal,
  subscribe,
} from '<repo>/packages/classy-store/src/core/core';
import {snapshot} from '<repo>/packages/classy-store/src/snapshot/snapshot';
import type {Snapshot} from '<repo>/packages/classy-store/src/types';

export function useClassyStoreSketch<T extends object>(
  proxyStore: T,
): Readonly<Ref<Snapshot<T>>> {
  getInternal(proxyStore);
  if (!getCurrentScope()?.active)
    throw new Error('requires an active Vue effect scope');

  let notify = () => {};
  const state = customRef<Snapshot<T>>((track, trigger) => {
    // No snapshot is built here: the next read builds it, once.
    notify = trigger;
    return {
      get() {
        track();
        return snapshot(proxyStore);
      },
      set() {},
    };
  });

  let unsubscribe: (() => void) | undefined;
  const start = () => {
    unsubscribe = subscribe(proxyStore, notify, {sync: true});
    notify(); // a write made between setup() and the mount
  };
  const instance = getCurrentInstance();
  if (instance && !instance.isMounted) onMounted(start);
  else start();
  onScopeDispose(() => unsubscribe?.());

  return process.env.NODE_ENV !== 'production'
    ? (readonly(state) as Readonly<Ref<Snapshot<T>>>)
    : state;
}
```

### `vue-prototype-server.ts`

Run: `bun vue-prototype-server.ts`

```ts
// Run: bun vue-prototype-server.ts
import {createSSRApp, defineComponent, h} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';
import {useClassyStoreSketch} from './vue-sketch';

const listeners = (store: object) => getInternal(store).syncListeners.size;
const store = createClassyStore({count: 0});
const App = defineComponent({
  setup() {
    const state = useClassyStoreSketch(store);
    store.count++; // a write during setup, before the subscription starts
    return () => h('p', String(state.value.count));
  },
});

for (let request = 1; request <= 3; request++) {
  const html = await renderToString(createSSRApp(App));
  console.log(
    `sketch, SSR request ${request}: ${html} -> sync listeners: ${listeners(store)}`,
  );
}
```

Output:

```text
sketch, SSR request 1: <p>1</p> -> sync listeners: 0
sketch, SSR request 2: <p>2</p> -> sync listeners: 0
sketch, SSR request 3: <p>3</p> -> sync listeners: 0
```

### `vue-prototype-client.ts`

Run: `bun vue-prototype-client.ts`

```ts
// Run: bun vue-prototype-client.ts
import {GlobalRegistrator} from '@happy-dom/global-registrator';
GlobalRegistrator.register();
const {createApp, defineComponent, h, nextTick} = await import('vue');
const {createClassyStore, getInternal} = await import(
  '<repo>/packages/classy-store/src/core/core'
);
const {useClassyStoreSketch} = await import('./vue-sketch');

const listeners = (store: object) => getInternal(store).syncListeners.size;
const store = createClassyStore({count: 0});
const App = defineComponent({
  setup() {
    const state = useClassyStoreSketch(store);
    store.count++; // a write during setup, before the subscription starts
    return () => h('p', String(state.value.count));
  },
});

const host = document.createElement('div');
const app = createApp(App);
app.mount(host);
console.log(
  'sketch, client mount: listeners',
  listeners(store),
  '| html straight after mount:',
  host.innerHTML,
  '| store',
  store.count,
);
await nextTick();
console.log('sketch, after nextTick:', host.innerHTML);
store.count = 10;
await nextTick();
console.log('sketch, after a write:', host.innerHTML);
app.unmount();
console.log('sketch, after unmount: listeners', listeners(store));
await GlobalRegistrator.unregister();
```

Output:

```text
sketch, client mount: listeners 1 | html straight after mount: <p>1</p> | store 1
sketch, after nextTick: <p>1</p>
sketch, after a write: <p>10</p>
sketch, after unmount: listeners 0
```

### `angular-checks.ts`

Run: `bun angular-checks.ts`

```ts
// Angular adapter checks. Run: bun angular-checks.ts
import {
  computed,
  effect,
  Injector,
  runInInjectionContext,
  untracked,
  VERSION,
  signal,
  assertInInjectionContext,
} from '@angular/core';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';
import {injectClassyStore} from '<repo>/packages/classy-store/src/frameworks/angular/angular';

console.log('angular', VERSION.full);
const listeners = (store: object) => getInternal(store).syncListeners.size;

// 1. Outside an injection context: whose name is in the message?
{
  const store = createClassyStore({count: 0});
  try {
    injectClassyStore(store);
  } catch (error) {
    console.log('1. ours:', (error as Error).message.split('\n')[0]);
  }
  try {
    assertInInjectionContext(injectClassyStore);
  } catch (error) {
    console.log(
      '1. assertInInjectionContext(injectClassyStore):',
      (error as Error).message.split('\n')[0],
    );
  }
}

// 2. There is no way to pass an injector: the call has to be wrapped.
{
  const store = createClassyStore({count: 0});
  const injector = Injector.create({providers: []});
  const state = runInInjectionContext(injector, () => injectClassyStore(store));
  console.log(
    '2. runInInjectionContext works:',
    state().count,
    'arity of injectClassyStore:',
    injectClassyStore.length,
  );
  injector.destroy();
}

// 3. A store write made while an Angular computed is running.
{
  const store = createClassyStore({count: 0, reads: 0});
  const injector = Injector.create({providers: []});
  const state = runInInjectionContext(injector, () => injectClassyStore(store));
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args) =>
    errors.push(String(args[1] ?? args[0]).split('\n')[0]);
  const trigger = signal(0);
  const derived = computed(() => {
    trigger();
    store.reads++; // a write to the classy store from inside a computed
    return untracked(() => state().count);
  });
  derived();
  console.error = originalError;
  console.log(
    '3. store.reads',
    store.reads,
    'signal reads',
    state().reads,
    'console.error:',
    errors,
  );
  store.count = 1;
  console.log('3. after the next ordinary write: signal reads', state().reads);
  injector.destroy();
}

// 4. A computed as a selector.
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const injector = Injector.create({providers: []});
  const runs = {count: 0, user: 0};
  const {count, user, state} = runInInjectionContext(injector, () => {
    const state = injectClassyStore(store);
    const count = computed(() => state().count);
    const user = computed(() => state().user);
    return {state, count, user};
  });
  const viaCount = computed(() => {
    runs.count++;
    return count();
  });
  const viaUser = computed(() => {
    runs.user++;
    return user().name;
  });
  viaCount();
  viaUser();
  store.other++;
  viaCount();
  viaUser();
  store.other++;
  viaCount();
  viaUser();
  console.log(
    '4. downstream computed runs after two unrelated writes:',
    runs,
    'listeners',
    listeners(store),
  );
  injector.destroy();
  console.log('4. listeners after destroy:', listeners(store));
}
```

Output:

```text
angular 22.2.6
1. ours: NG0203: The `DestroyRef` token injection failed. `inject()` function must be called from an injection context such as a constructor, a factory function, a field initializer, or a function used with `runInInjectionContext`. Find more at https://v22.angular.dev/errors/NG0203
1. assertInInjectionContext(injectClassyStore): NG0203: injectClassyStore() can only be used within an injection context such as a constructor, a factory function, a field initializer, or a function used with `runInInjectionContext`. Find more at https://v22.angular.dev/errors/NG0203
2. runInInjectionContext works: 0 arity of injectClassyStore: 1
3. store.reads 1 signal reads 0 console.error: [ "Error" ]
3. after the next ordinary write: signal reads 1
4. downstream computed runs after two unrelated writes: {
  count: 1,
  user: 1,
} listeners 1
4. listeners after destroy: 0
```

### `angular-computed-write.ts`

Run: `bun angular-computed-write.ts`

```ts
// What signal.set() does inside a computed, with and without untracked(). Run: bun angular-computed-write.ts
import {computed, signal, untracked} from '@angular/core';

const target = signal(0);
const plain = computed(() => {
  try {
    target.set(1);
    return 'set() accepted';
  } catch (error) {
    return `set() threw: ${(error as Error).message.split('\n')[0] || (error as Error).name}`;
  }
});
console.log('inside computed:', plain(), '-> target', target());

const guarded = computed(() => {
  untracked(() => target.set(2));
  return 'untracked(set) accepted';
});
console.log(
  'inside computed, wrapped in untracked():',
  guarded(),
  '-> target',
  target(),
);
```

Output:

```text
inside computed: set() threw: Error -> target 0
inside computed, wrapped in untracked(): untracked(set) accepted -> target 2
```

### `angular-sketch.ts`

Run: `bun angular-sketch.ts`

```ts
// A sketch of the Angular adapter shaped like toSignal(). Run: bun angular-sketch.ts
import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  type Injector,
  Injector as InjectorClass,
  inject,
  isSignal,
  type Signal,
  signal,
  untracked,
} from '@angular/core';
import {
  createClassyStore,
  getInternal,
  subscribe,
} from '<repo>/packages/classy-store/src/core/core';
import {snapshot} from '<repo>/packages/classy-store/src/snapshot/snapshot';
import type {Snapshot} from '<repo>/packages/classy-store/src/types';

function injectClassyStoreSketch<T extends object>(
  proxyStore: T,
  options?: {injector?: Injector},
): Signal<Snapshot<T>> {
  getInternal(proxyStore);
  if (!options?.injector) assertInInjectionContext(injectClassyStoreSketch);
  const destroyRef = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
  const version = signal(0);
  // untracked(): a store write made while a computed runs may not write a signal otherwise.
  const unsubscribe = subscribe(
    proxyStore,
    () => untracked(() => version.update((n) => n + 1)),
    {sync: true},
  );
  destroyRef.onDestroy(unsubscribe);
  // The snapshot is built at the read, once, however many writes came before it.
  return computed(() => {
    version();
    return snapshot(proxyStore);
  });
}

const listeners = (store: object) => getInternal(store).syncListeners.size;
const store = createClassyStore({
  count: 0,
  reads: 0,
  rows: Array.from({length: 2000}, (_, id) => ({id, done: false})),
});
const injector = InjectorClass.create({providers: []});

// Called from an event handler or ngOnInit: no injection context, an injector passed in.
const state = injectClassyStoreSketch(store, {injector});
console.log(
  'isSignal',
  isSignal(state),
  'has set()',
  'set' in state,
  'count',
  state().count,
);

const derived = computed(() => {
  store.reads++; // a store write inside a computed
  return untracked(() => state().count);
});
derived();
console.log(
  'write inside a computed: store.reads',
  store.reads,
  'signal reads',
  state().reads,
);

const start = performance.now();
for (const row of store.rows) row.done = true;
const done = state().rows.every((row) => row.done);
console.log(
  `2000 direct writes then one read: ${(performance.now() - start).toFixed(2)} ms, current: ${done}`,
);

try {
  injectClassyStoreSketch(store);
} catch (error) {
  console.log(
    'no context, no injector:',
    (error as Error).message.split('. Find')[0],
  );
}
injector.destroy();
console.log('listeners after destroy:', listeners(store));
```

Output:

```text
isSignal true has set() false count 0
write inside a computed: store.reads 1 signal reads 1
2000 direct writes then one read: 8.20 ms, current: true
no context, no injector: NG0203: injectClassyStoreSketch() can only be used within an injection context such as a constructor, a factory function, a field initializer, or a function used with `runInInjectionContext`
listeners after destroy: 0
```

### `react-server.ts`

Run: `bun react-server.ts`

```ts
// React adapter under react-dom/server. Run: bun react-server.ts
import {createElement, version} from 'react';
import {renderToString} from 'react-dom/server';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/react/react';
import {prepareStoreForHydration} from '<repo>/packages/classy-store/src/frameworks/react/server';

console.log('react', version);
const store = createClassyStore({count: 0});
function Auto() {
  const state = useClassyStore(store);
  return createElement('p', null, state.count);
}
function Selected() {
  const count = useClassyStore(store, (state) => state.count);
  return createElement('p', null, count);
}
for (const Component of [Auto, Selected]) {
  const html = renderToString(createElement(Component));
  console.log(
    `${Component.name}: ${html} -> listeners: ${getInternal(store).syncListeners.size}`,
  );
}
// An unprepared store renders its live state on the server; a prepared one renders the captured state.
store.count = 5;
console.log(
  'unprepared, after a write:',
  renderToString(createElement(Selected)),
);
prepareStoreForHydration(store);
store.count = 6;
console.log(
  'prepared at 5, then written to 6:',
  renderToString(createElement(Selected)),
  renderToString(createElement(Auto)),
);
```

Output:

```text
react 19.3.1
Auto: <p>0</p> -> listeners: 0
Selected: <p>0</p> -> listeners: 0
unprepared, after a write: <p>5</p>
prepared at 5, then written to 6: <p>5</p> <p>5</p>
```

### `solid-client.ts`

Run: `bun --conditions browser --conditions development solid-client.ts`

```ts
// Solid adapter under Solid's client runtime. Run: bun --conditions browser --conditions development solid-client.ts
import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  from,
  getOwner,
} from 'solid-js';
import {
  createClassyStore,
  getInternal,
  subscribe,
} from '<repo>/packages/classy-store/src/core/core';
import {snapshot} from '<repo>/packages/classy-store/src/snapshot/snapshot';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/solid/solid';

const listeners = (store: object) => getInternal(store).syncListeners.size;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// 1. Timing and granularity.
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const runs = {whole: 0, count: 0, user: 0};
  const {state, dispose} = createRoot((dispose) => {
    const state = useClassyStore(store);
    const count = createMemo(() => state().count);
    const user = createMemo(() => state().user);
    createEffect(
      () => state().count,
      () => void runs.whole++,
    );
    createEffect(
      () => count(),
      () => void runs.count++,
    );
    createEffect(
      () => user(),
      () => void runs.user++,
    );
    return {state, dispose};
  });
  flush();
  console.log('1. after mount, effect runs:', {...runs});
  store.other++;
  console.log(
    '1. read straight after a write, before flush():',
    state().other,
    '(store holds',
    store.other + ')',
  );
  flush();
  console.log('1. after flush():', state().other);
  store.other++;
  flush();
  console.log('1. after two writes to an unrelated field, effect runs:', {
    ...runs,
  });
  dispose();
  console.log('1. listeners after dispose:', listeners(store));
}

// 2. Solid 2's own primitive for a callback subscription: createMemo(() => from(...)).
{
  const store = createClassyStore({count: 0});
  const seen: unknown[] = [];
  const dispose = createRoot((dispose) => {
    const state = createMemo(() =>
      from<{readonly count: number}>((next) => {
        next(snapshot(store));
        return subscribe(store, () => next(snapshot(store)), {sync: true});
      }),
    );
    createEffect(
      () => state().count,
      (count) => void seen.push(count),
    );
    return dispose;
  });
  flush();
  await tick();
  console.log('2. from(): first values', seen, 'listeners', listeners(store));
  store.count = 1;
  flush();
  await tick();
  flush();
  console.log('2. from(): after a write', seen);
  dispose();
  console.log('2. from(): listeners after dispose', listeners(store));
}
```

Output:

```text
1. after mount, effect runs: {
  whole: 1,
  count: 1,
  user: 1,
}
1. read straight after a write, before flush(): 0 (store holds 1)
1. after flush(): 1
1. after two writes to an unrelated field, effect runs: {
  whole: 3,
  count: 1,
  user: 1,
}
1. listeners after dispose: 0
2. from(): first values [ 0 ] listeners 1
2. from(): after a write [ 0, 1 ]
2. from(): listeners after dispose 0
```

### `solid-server.ts`

Run: `bun solid-server.ts`

```ts
// Solid adapter under Solid's server runtime. Run: bun solid-server.ts
import {renderToString, isServer} from '@solidjs/web';
import {createRoot, getOwner} from 'solid-js';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/solid/solid';

const listeners = (store: object) => getInternal(store).syncListeners.size;
console.log('isServer', isServer);

const store = createClassyStore({count: 0});
function App() {
  const state = useClassyStore(store);
  return String(state().count);
}
for (let request = 1; request <= 3; request++) {
  const html = renderToString(() => App());
  console.log(
    `request ${request}: ${JSON.stringify(html)} -> sync listeners: ${listeners(store)}`,
  );
}
await new Promise((resolve) => setTimeout(resolve, 20));
console.log('after a timer tick -> sync listeners:', listeners(store));

// Reads after a write, on the server runtime
createRoot((dispose) => {
  const state = useClassyStore(store);
  store.count = 5;
  console.log('server runtime, read straight after a write:', state().count);
  dispose();
});
console.log('after dispose -> sync listeners:', listeners(store));
```

Output:

```text
isServer true
request 1: "0" -> sync listeners: 0
request 2: "0" -> sync listeners: 0
request 3: "0" -> sync listeners: 0
after a timer tick -> sync listeners: 0
server runtime, read straight after a write: 5
after dispose -> sync listeners: 0
```

### `svelte-build.mjs`

Run: `bun svelte-build.mjs`

```js
// Compiles the Svelte fixtures used by svelte-server.mjs and svelte-client.mjs. Run: bun svelte-build.mjs
import {writeFileSync} from 'node:fs';
import {compile, compileModule} from 'svelte/compiler';

const SRC = '<repo>/packages/classy-store/src';

const component = `<script>
  import {toSvelteStore} from '${SRC}/frameworks/svelte/svelte';
  let {store} = $props();
  const snap = toSvelteStore(store);
</script>
<p>{$snap.count}</p>`;
writeFileSync(
  'svelte-out/Counter.server.js',
  compile(component, {generate: 'server', filename: 'Counter.svelte'}).js.code,
);

// Runes in a module: fromStore() over the adapter, and a direct createSubscriber binding.
const runes = `import {fromStore, derived, get} from 'svelte/store';
import {createSubscriber} from 'svelte/reactivity';
import {flushSync} from 'svelte';
import {toSvelteStore} from '${SRC}/frameworks/svelte/svelte';
import {subscribe, getInternal} from '${SRC}/core/core';
import {snapshot} from '${SRC}/snapshot/snapshot';

const listeners = (store) => getInternal(store).syncListeners.size;

// Ten lines: what a rune-native binding would be.
function classyState(store) {
  const track = createSubscriber((update) => subscribe(store, update, {sync: true}));
  return {
    get current() {
      track();
      return snapshot(store);
    },
  };
}

export async function run(store) {
  const viaFromStore = fromStore(toSvelteStore(store));
  const direct = classyState(store);
  const log = {fromStore: [], direct: [], derivedCount: [], derivedUser: 0};
  const count = $derived(direct.current.count);
  const user = $derived(direct.current.user);
  const stop = $effect.root(() => {
    $effect(() => { log.fromStore.push(viaFromStore.current.count); });
    $effect(() => { log.direct.push(direct.current.count); });
    $effect(() => { log.derivedCount.push(count); });
    $effect(() => { user; log.derivedUser++; });
  });
  flushSync();
  console.log('mounted: listeners', listeners(store), JSON.stringify(log));
  store.other++;
  flushSync();
  store.other++;
  flushSync();
  console.log('two unrelated writes:', JSON.stringify(log));
  store.count++;
  console.log('read outside an effect straight after a write: fromStore', viaFromStore.current.count, 'direct', direct.current.count);
  flushSync();
  console.log('after count++:', JSON.stringify(log));
  stop();
  console.log('effects destroyed, same tick: listeners', listeners(store));
  await new Promise((resolve) => setTimeout(resolve, 0));
  console.log('effects destroyed, next task: listeners', listeners(store));
  // svelte/store helpers accept the adapter's readable.
  const doubled = derived(toSvelteStore(store), ($s) => $s.count * 2);
  console.log('derived + get:', get(doubled), 'listeners after get:', listeners(store));
}`;
writeFileSync(
  'svelte-out/runes.svelte.js',
  compileModule(runes, {generate: 'client', filename: 'runes.svelte.js'}).js
    .code,
);
console.log('built');
```

Output:

```text
built
```

### `svelte-server.mjs`

Run: `bun svelte-server.mjs`

```js
// Svelte 5 server rendering with $store. Run: bun svelte-server.mjs
import {render} from 'svelte/server';
import Counter from './svelte-out/Counter.server.js';
import {
  createClassyStore,
  getInternal,
} from '<repo>/packages/classy-store/src/core/core';

const store = createClassyStore({count: 0});
for (let request = 1; request <= 3; request++) {
  const {body} = render(Counter, {props: {store}});
  console.log(
    `request ${request}: ${body.replace(/<!--.*?-->/g, '')} -> sync listeners: ${getInternal(store).syncListeners.size}`,
  );
}
```

Output:

```text
request 1: <p>0</p> -> sync listeners: 0
request 2: <p>0</p> -> sync listeners: 0
request 3: <p>0</p> -> sync listeners: 0
```

### `svelte-client.mjs`

Run: `bun --conditions browser svelte-client.mjs`

```js
// Runes over the adapter, on Svelte's client runtime. Run: bun --conditions browser svelte-client.mjs
import {run} from './svelte-out/runes.svelte.js';
import {createClassyStore} from '<repo>/packages/classy-store/src/core/core';
await run(createClassyStore({count: 0, other: 0, user: {name: 'Ada'}}));
```

Output:

```text
mounted: listeners 2 {"fromStore":[0],"direct":[0],"derivedCount":[0],"derivedUser":1}
two unrelated writes: {"fromStore":[0,0,0],"direct":[0,0,0],"derivedCount":[0],"derivedUser":1}
read outside an effect straight after a write: fromStore 1 direct 1
after count++: {"fromStore":[0,0,0,1],"direct":[0,0,0,1],"derivedCount":[0,1],"derivedUser":1}
effects destroyed, same tick: listeners 2
effects destroyed, next task: listeners 0
derived + get: 2 listeners after get: 0
```

### `svelte-compile.mjs`

Run: `bun svelte-compile.mjs (compiled code omitted from the output)`

```js
// Compile the component from website/content/docs/SVELTE.md with the installed Svelte 5 compiler.
import {
  compile,
  VERSION,
} from '<repo>/packages/classy-store/node_modules/svelte/src/compiler/index.js';

const guide = `<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';

  const state = toSvelteStore(counter);
</script>

<button onclick={() => counter.increment()}>{$state.count}</button>
`;
const renamed = guide.replaceAll('state', 'snap');

for (const [label, source] of [
  ['guide (variable named state)', guide],
  ['renamed to snap', renamed],
]) {
  for (const generate of ['client', 'server']) {
    try {
      const result = compile(source, {generate, filename: 'Counter.svelte'});
      console.log(
        label,
        generate,
        'OK; warnings:',
        result.warnings.map((w) => `${w.code}: ${w.message}`),
      );
      if (label.startsWith('renamed')) console.log(result.js.code);
    } catch (error) {
      console.log(label, generate, 'ERROR', error.code, '-', error.message);
    }
  }
}
console.log('svelte', VERSION);
```

Output:

```text
guide (variable named state) client OK; warnings: []
guide (variable named state) server OK; warnings: []
renamed to snap client OK; warnings: []
renamed to snap server OK; warnings: []
svelte 5.57.3
```

### `svelte-compile-runes.mjs`

Run: `bun svelte-compile-runes.mjs`

```js
// The guide's component once the user adds a rune (runes mode), as most Svelte 5 components do.
import {
  compile,
  compileModule,
} from '<repo>/packages/classy-store/node_modules/svelte/src/compiler/index.js';

const cases = {
  'state + $props': `<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';
  let {label} = $props();
  const state = toSvelteStore(counter);
</script>
<button onclick={() => counter.increment()}>{label} {$state.count}</button>`,
  'state + $derived': `<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';
  const state = toSvelteStore(counter);
  const doubled = $derived($state.count * 2);
</script>
<button onclick={() => counter.increment()}>{doubled}</button>`,
  'state + own $state rune': `<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';
  const state = toSvelteStore(counter);
  let open = $state(false);
</script>
<button onclick={() => counter.increment()}>{open} {$state.count}</button>`,
  'snap + $derived (runes mode)': `<script lang="ts">
  import {toSvelteStore} from '@codebelt/classy-store/svelte';
  import {counter} from './counter';
  const snap = toSvelteStore(counter);
  const doubled = $derived($snap.count * 2);
  let open = $state(false);
</script>
<button onclick={() => counter.increment()}>{open} {doubled}</button>`,
};
for (const [label, source] of Object.entries(cases)) {
  try {
    const result = compile(source, {
      generate: 'client',
      filename: 'Counter.svelte',
    });
    console.log(
      label,
      '=> OK; warnings:',
      result.warnings.map((w) => `${w.code}: ${w.message}`),
    );
  } catch (error) {
    console.log(label, '=> ERROR', error.code, '-', error.message);
  }
}

// $store syntax in a .svelte.ts module
try {
  compileModule(
    `import {toSvelteStore} from '@codebelt/classy-store/svelte';
import {counter} from './counter';
const snap = toSvelteStore(counter);
export function read() { return $snap.count; }`,
    {filename: 'shared.svelte.js'},
  );
  console.log('module with $snap => OK');
} catch (error) {
  console.log('module with $snap => ERROR', error.code, '-', error.message);
}
```

Output:

```text
state + $props => OK; warnings: []
state + $derived => OK; warnings: []
state + own $state rune => OK; warnings: [ "store_rune_conflict: It looks like you're using the `$state` rune, but there is a local binding called `state`. Referencing a local variable with a `$` prefix will create a store subscription. Please rename `state` to avoid the ambiguity\nhttps://svelte.dev/e/store_rune_conflict" ]
snap + $derived (runes mode) => OK; warnings: []
module with $snap => ERROR store_invalid_subscription_module - Cannot reference store value outside a `.svelte` file
https://svelte.dev/e/store_invalid_subscription_module
```

### `types-check.ts`

Run: `node_modules/.bin/tsc --project tsconfig.types.json`. Exit 0, no output: the `@ts-expect-error` lines are errors as expected, and the rest compiles.

```ts
// Type-level checks. Run: node_modules/.bin/tsc --project tsconfig.types.json
import {
  computed,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
  toValue,
  unref,
  watch,
} from 'vue';
import {derived, fromStore, get, type Readable} from 'svelte/store';
import type {Snapshot} from '<repo>/packages/classy-store/src/types';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/vue/vue';
import {toSvelteStore} from '<repo>/packages/classy-store/src/frameworks/svelte/svelte';

type Counter = {count: number; nested: {label: string}};
declare const store: Counter;

// Today: the write compiles.
const today = useClassyStore(store);
today.value = {count: 1, nested: {label: 'x'}};

// Candidate A: works on the whole peer range (Ref exists in 3.2.0).
declare const a: Readonly<Ref<Snapshot<Counter>>>;
// @ts-expect-error value is read-only
a.value = {count: 1, nested: {label: 'x'}};
// Candidate B: Vue's own shape for useTemplateRef(); ShallowRef is not exported by 3.2.0.
declare const b: Readonly<ShallowRef<Snapshot<Counter>>>;
// @ts-expect-error value is read-only
b.value = {count: 1, nested: {label: 'x'}};

// A read-only ref is still accepted wherever Vue reads a ref.
const n1: number = unref(a).count;
const n2: number = toValue(b).count;
const asSource: MaybeRefOrGetter<Snapshot<Counter>> = a;
const asRef: Ref<Snapshot<Counter>> = b;
watch(a, (value) => void value.count);
watch(b, (value) => void value.count);
const doubled = computed(() => a.value.count * 2);
void [n1, n2, asSource, asRef, doubled];

// Svelte: the adapter's own interface is accepted by svelte/store.
const readable: Readable<Snapshot<Counter>> = toSvelteStore(store);
const viaRunes: {readonly current: Snapshot<Counter>} = fromStore(
  toSvelteStore(store),
);
const count: number = get(derived(toSvelteStore(store), ($s) => $s.count));
void [readable, viaRunes, count];
```

### `eager-vs-lazy.ts`

Run: `bun eager-vs-lazy.ts`

```ts
// Cost of building a snapshot in the listener (what four adapters do) against building it at the read.
// Run: bun eager-vs-lazy.ts
import {effectScope} from 'vue';
import {
  batch,
  createClassyStore,
} from '<repo>/packages/classy-store/src/core/core';
import {useClassyStore} from '<repo>/packages/classy-store/src/frameworks/vue/vue';
import {useClassyStoreSketch} from './vue-sketch';

const ROWS = 2000;
const makeStore = () =>
  createClassyStore({
    rows: Array.from({length: ROWS}, (_, id) => ({id, done: false})),
  });

function measure(
  label: string,
  bind: (
    store: ReturnType<typeof makeStore>,
  ) => {value: {rows: readonly {done: boolean}[]}} | undefined,
  write: (store: ReturnType<typeof makeStore>) => void,
) {
  const times: number[] = [];
  for (let round = 0; round < 7; round++) {
    const store = makeStore();
    const scope = effectScope();
    const state = scope.run(() => bind(store));
    const start = performance.now();
    write(store);
    // One read afterwards, as a render would do.
    if (state && !state.value.rows[ROWS - 1].done) throw new Error('stale');
    times.push(performance.now() - start);
    scope.stop();
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(58)} median ${times[3].toFixed(2)} ms`);
}

const directWrites = (store: ReturnType<typeof makeStore>) => {
  for (const row of store.rows) row.done = true;
};
const batched = (store: ReturnType<typeof makeStore>) =>
  batch(() => directWrites(store));

measure(`${ROWS} direct writes, no adapter`, () => undefined, directWrites);
measure(
  `${ROWS} direct writes, Vue adapter (snapshot per notification)`,
  (store) => useClassyStore(store),
  directWrites,
);
measure(
  `${ROWS} direct writes, sketch (snapshot at the read)`,
  (store) => useClassyStoreSketch(store),
  directWrites,
);
measure(
  `${ROWS} writes inside batch(), Vue adapter`,
  (store) => useClassyStore(store),
  batched,
);
```

Output:

```text
2000 direct writes, no adapter                             median 1.12 ms
2000 direct writes, Vue adapter (snapshot per notification) median 632.79 ms
2000 direct writes, sketch (snapshot at the read)          median 2.21 ms
2000 writes inside batch(), Vue adapter                    median 2.02 ms
```

### `direct-writes-others.ts`

Run: `bun direct-writes-others.ts`

```ts
// The loop of direct writes with the Angular and Svelte adapters attached, and with a bare sync subscriber.
// Run: bun direct-writes-others.ts   (Solid needs its client runtime: see solid-direct-writes.ts)
import {Injector, runInInjectionContext} from '@angular/core';
import {
  createClassyStore,
  subscribe,
} from '<repo>/packages/classy-store/src/core/core';
import {snapshot} from '<repo>/packages/classy-store/src/snapshot/snapshot';
import {injectClassyStore} from '<repo>/packages/classy-store/src/frameworks/angular/angular';
import {toSvelteStore} from '<repo>/packages/classy-store/src/frameworks/svelte/svelte';

const ROWS = 2000;
const makeStore = () =>
  createClassyStore({
    rows: Array.from({length: ROWS}, (_, id) => ({id, done: false})),
  });
type Store = ReturnType<typeof makeStore>;

function measure(label: string, attach: (store: Store) => () => void) {
  const times: number[] = [];
  for (let round = 0; round < 5; round++) {
    const store = makeStore();
    const detach = attach(store);
    const start = performance.now();
    for (const row of store.rows) row.done = true;
    times.push(performance.now() - start);
    detach();
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(46)} median ${times[2].toFixed(2)} ms`);
}

measure('no subscriber', () => () => {});
measure('sync subscriber that does nothing', (store) =>
  subscribe(store, () => {}, {sync: true}),
);
measure('sync subscriber that calls snapshot()', (store) =>
  subscribe(store, () => void snapshot(store), {sync: true}),
);
measure('batched subscriber that calls snapshot()', (store) =>
  subscribe(store, () => void snapshot(store)),
);
measure('Angular adapter', (store) => {
  const injector = Injector.create({providers: []});
  runInInjectionContext(injector, () => injectClassyStore(store));
  return () => injector.destroy();
});
measure('Svelte adapter, one subscriber', (store) =>
  toSvelteStore(store).subscribe(() => {}),
);
```

Output:

```text
no subscriber                                  median 2.51 ms
sync subscriber that does nothing              median 1.13 ms
sync subscriber that calls snapshot()          median 649.47 ms
batched subscriber that calls snapshot()       median 1.03 ms
Angular adapter                                median 626.00 ms
Svelte adapter, one subscriber                 median 646.90 ms
```

### `react-direct-writes.ts`

Run: `bun react-direct-writes.ts`

```ts
// The same loop of direct writes with a mounted React consumer. Run: bun react-direct-writes.ts
import {GlobalRegistrator} from '@happy-dom/global-registrator';
GlobalRegistrator.register();
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;
const {createElement, act} = await import('react');
const {createRoot} = await import('react-dom/client');
const {batch, createClassyStore} = await import(
  '<repo>/packages/classy-store/src/core/core'
);
const {useClassyStore} = await import(
  '<repo>/packages/classy-store/src/frameworks/react/react'
);

const ROWS = 2000;
const makeStore = () =>
  createClassyStore({
    rows: Array.from({length: ROWS}, (_, id) => ({id, done: false})),
  });
type Store = ReturnType<typeof makeStore>;

async function measure(
  label: string,
  mode: 'selector' | 'auto' | 'none',
  write: (store: Store) => void,
) {
  const times: number[] = [];
  for (let round = 0; round < 5; round++) {
    const store = makeStore();
    const host = document.createElement('div');
    const root = createRoot(host);
    function View() {
      if (mode === 'selector')
        return createElement(
          'p',
          null,
          useClassyStore(
            store,
            (state) => state.rows.filter((row) => row.done).length,
          ),
        );
      const state = useClassyStore(store);
      return createElement(
        'p',
        null,
        state.rows.filter((row) => row.done).length,
      );
    }
    if (mode !== 'none')
      await act(async () => root.render(createElement(View)));
    const start = performance.now();
    await act(async () => write(store));
    times.push(performance.now() - start);
    if (mode !== 'none' && host.textContent !== String(ROWS))
      throw new Error(`stale: ${host.textContent}`);
    await act(async () => root.unmount());
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(52)} median ${times[2].toFixed(2)} ms`);
}

const directWrites = (store: Store) => {
  for (const row of store.rows) row.done = true;
};
await measure(`${ROWS} direct writes, no consumer`, 'none', directWrites);
await measure(
  `${ROWS} direct writes, selector hook mounted`,
  'selector',
  directWrites,
);
await measure(
  `${ROWS} direct writes, auto-tracked hook mounted`,
  'auto',
  directWrites,
);
await measure(
  `${ROWS} writes inside batch(), selector hook mounted`,
  'selector',
  (store) => batch(() => directWrites(store)),
);
await GlobalRegistrator.unregister();
```

Output:

```text
2000 direct writes, no consumer                      median 1.26 ms
2000 direct writes, selector hook mounted            median 763.86 ms
2000 direct writes, auto-tracked hook mounted        median 655.26 ms
2000 writes inside batch(), selector hook mounted    median 2.63 ms
```

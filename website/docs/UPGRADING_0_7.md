# Upgrading to 0.7.0

This is the historical 0.7.0 upgrade guide. For the current API, also read [Upgrading to 0.8.0](./UPGRADING_0_8.md), which replaces persistence cleanup and removes duplicate exports.

Version 0.7.0 focuses on core and React correctness, including controlled inputs, React Compiler, SSR, Next.js App Router, memory retention, and persistence. It includes React API and runtime changes that consumers upgrading from 0.6.x should review.

## Remove React timing options

React hooks now always subscribe synchronously. This keeps controlled inputs and their caret positions aligned with store updates. Remove `sync: true` and `sync: false` from both direct and bound hooks.

Before, in 0.6.x:

```tsx
const state = useClassyStore(store, {sync: true});
const count = useClassyStore(store, (state) => state.count, {sync: true});

// useCounterStore was created with createStoreHook(store).
const boundState = useCounterStore({sync: true});
const boundCount = useCounterStore((state) => state.count, {sync: true});
```

After, in 0.7.0:

```tsx
const state = useClassyStore(store);
const count = useClassyStore(store, (state) => state.count);

const boundState = useCounterStore();
const boundCount = useCounterStore((state) => state.count);
```

Auto-tracked hooks no longer accept an options argument, even an empty `{}`. Remove imports and annotations using the removed `UseClassyStoreOptions` type. Selector hooks still accept `UseClassyStoreSelectorOptions<S>` with `isEqual`:

```tsx
// Before
const selection = useClassyStore(store, selectSummary, {
  sync: true,
  isEqual: shallowEqual,
});

// After
const selection = useClassyStore(store, selectSummary, {
  isEqual: shallowEqual,
});
```

The same change applies to selector options passed to a bound hook. Existing calls without React timing options continue to work.

Ordinary `subscribe(store, listener)` callbacks still batch in a microtask, and core subscriptions retain their `{sync: true}` option. React selectors can run after each individual mutation, even when React batches the resulting renders into one commit. Keep selectors pure and able to read intermediate state during a multi-property update; this release does not introduce atomic transactions.

## Check the auto-tracking runtime requirement

Auto-tracked React hooks (`useClassyStore(store)` and bound hooks without a selector) now require native `WeakRef` support from ES2021. Weak references let mounted consumers release obsolete snapshots and collection values.

Check that every browser or server runtime running auto-tracked hooks supports `WeakRef`. Transpiling JavaScript does not supply native weak-reference behavior. If your supported runtime lacks it, use explicit selectors or retain 0.6.x until you can raise that runtime requirement. Selector hooks do not require `WeakRef`.

React 18 and 19 remain covered by the package compatibility tests. React Compiler works with both selector and auto-tracked hooks; no compiler opt-out is required.

## Prepare server-rendered stores before live updates

Client-only apps do not need hydration preparation. For server-rendered apps where persistence or another update can run before every Suspense boundary hydrates, call `prepareStoreForHydration(store)` on server and client stores initialized from matching data, before rendering or starting persistence.

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';

const store = prepareStoreForHydration(
  createClassyStore(new ProfileStore(initialData)),
);
```

Create a separate store for each server request. The prepared snapshot is retained for that store's lifetime; use a new store for a new request or an intentional reset. See the [SSR guide](./REACT_SSR.md) and [typed context example](./REACT_SCOPING.md).

The published `@codebelt/classy-store/react` entry now carries `use client`. In Next.js Server Components or other server-only modules, import preparation from `@codebelt/classy-store/react/server`. Hooks and the existing preparation export remain available from `/react` inside client modules and ordinary SSR. Pass serializable initial data across the Server Component boundary and construct the store inside a Client Provider; do not pass the store proxy across that boundary. See the [Next.js App Router guide](./REACT_NEXT.md).

## Review persistence ordering and cleanup

The stored JSON envelope has not changed, so upgrading the library alone does not require a persisted-data migration or a change to your application's persistence `version`.

- Saves and removals requested through one persistence handle execute in request order. Each save captures the state when it is requested.
- Rehydration waits for that handle's prior writes and ignores read results superseded by a newer read, save, clear, local edit, or accepted storage event.
- `clear()` cancels pending auto-saves and removes storage after writes already requested. It does not reset the live store; a later edit can save again.
- `unsubscribe()` stops listeners and timers, ignores pending reads, and skips queued operations that have not started. It cannot cancel I/O already issued to an adapter. If you need a final save, await `handle.save()` before unsubscribing while the application is still running.
- Real browser tab synchronization ignores outdated storage events and avoids echo writes. Ordering is per handle; separate handles writing the same async storage key still need application or adapter coordination.

See the [persistence guide](./PERSIST_TUTORIAL.md) for adapter, debounce, and cross-tab behavior.

## Release notes

### React integration

- Synchronous React subscriptions fix controlled-input caret jumps without configuration; core subscriptions remain batched by default.
- Selector or equality-function changes refresh selections without requiring a store mutation. Concurrent and abandoned renders keep their tracking isolated.
- Auto-tracking preserves reads reused by React Compiler and memoized children. It can conservatively retain earlier reads until the relevant snapshot object's identity changes.
- `prepareStoreForHydration` and the `/react/server` entry support delayed and streamed hydration, including persistence updates before a boundary hydrates.
- Next.js App Router package boundaries, request isolation, navigation, refresh, and cleanup have production packed-package coverage with Compiler off and on.
- A typed context example covers independent and nested stores, keyed resets, and effect-owned persistence cleanup.

### Core, utilities, and performance

- Undo/redo and persistence restore mutable nested state while preserving reactive collection methods and recorded snapshots.
- Frozen snapshot backing copies are reused across auto-tracked consumers, reducing repeated work in large forms and lists.
- Detached child proxies, obsolete snapshot clones, and retired React selections can be released, including after collection replacement and array truncation.
- `Snapshot<T>` preserves callable signatures for typed methods, overloads, and generic functions under strict TypeScript.
- Persistence orders asynchronous operations and rejects stale reads and storage events, with regression coverage for overlapping operations and real two-tab React inputs.

Validation includes core/React tests, three-browser input tests, packed React 18/19 consumers, Compiler off/on, streaming hydration, Next.js, render-count budgets, and heap-snapshot checks. Persistence, history, DevTools, and reactive collections also have combined happy-path coverage and public TypeScript checks.

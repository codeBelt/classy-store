# @codebelt/classy-store

**Class-based reactive state management for React, Vue, Svelte, Solid, and Angular.**

[![npm version](https://img.shields.io/npm/v/@codebelt/classy-store.svg)](https://www.npmjs.com/package/@codebelt/classy-store)
[![CI](https://github.com/codebelt/classy-store/actions/workflows/ci.yml/badge.svg)](https://github.com/codebelt/classy-store/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@codebelt/classy-store.svg)](https://github.com/codebelt/classy-store/blob/main/LICENSE)
[![Install size](https://pkg-size.dev/badge/install/394414)](https://pkg-size.dev/@codebelt/classy-store)
[![Bundle size](https://deno.bundlejs.com/badge?q=@codebelt/classy-store)](https://bundlejs.com/?q=@codebelt/classy-store)

## 📚 Documentation

Visit the **[Documentation Website](https://codebelt.github.io/classy-store/)** for tutorials, API reference, and examples.

## Upgrading to 0.8.0

Replace persistence `unsubscribe()` with `dispose()`, handle rejected promises from explicit persistence operations, and import hydration preparation from `@codebelt/classy-store/react/server`. The public `getVersion` export has been removed. New `useHistoryStatus` and `usePersistStatus` hooks keep utility metadata reactive in React.

See the [0.8.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_8) for required changes and examples. If upgrading from 0.6.x or earlier, also read the [0.7.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_7).

## 🚀 Features

- **Class-Based**: Define state and logic using standard ES6 classes.
- **Reactive**: Automatic reactivity using Proxies.
- **Computed Getters**: Class getters are automatically memoized and only recompute when dependencies change.
- **Framework Bindings**: React hooks and adapters for Vue, Svelte, Solid, and Angular.
- **TypeScript**: Written in TypeScript with first-class type support.
- **Persist**: Save and restore store state with versioning, migration, cross-tab sync, and SSR support.
- **Undo / Redo**: Add undo/redo to any store via a snapshot stack.
- **Subscribe Key**: Watch a single property for changes with previous and current values.
- **DevTools**: Connect to Redux DevTools for state inspection and time-travel debugging.

## ⚡ Quick Example

This example creates a shared store for a client-rendered React app. For SSR, create one store per request or provider as shown in the [scoping guide](https://codebelt.github.io/classy-store/docs/REACT_SCOPING).

```tsx
import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';

// 1. Plain class — fields are state, getters are computed values, the class is the type
class CartStore {
  items: { name: string; price: number; qty: number }[] = [];

  // Computed: auto-memoized, only recalculates when items change
  get total() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  add(name: string, price: number) {
    this.items.push({ name, price, qty: 1 });
  }
}

// 2. Wrap it once — use it anywhere
const cartStore = createClassyStore(new CartStore());

// 3. Use in any framework — React shown here
function CartTotal() {
  const total = useClassyStore(cartStore, (state) => state.total);
  return <span>${total.toFixed(2)}</span>;
}

function AddButton() {
  return <button onClick={() => cartStore.add('Widget', 9.99)}>Add item</button>;
}
```

Use prototype methods such as `add()` for actions. Arrow-function fields capture
the original instance, so their writes can bypass reactivity. Mutate through the
store proxy and read render data through the hook.

Nested plain objects, arrays, and the library's reactive collections support deep
updates. Native `Date`, `Map`, `Set`, and other nested class instances remain opaque:
replace their property to notify subscribers. Snapshots freeze copied state, but
retain opaque values by reference. Keep computed getters pure and based on store
property reads; changes to time or external variables do not invalidate their cache.

## Choosing an API

| What you need | API |
| --- | --- |
| Create shared state from a class or object | `createClassyStore(instance)` |
| Render store data in React | `useClassyStore(store)` or `useClassyStore(store, selector)` |
| Create a store owned by a component | `useLocalStore(factory)` |
| Bind a reusable hook to an existing store | `createStoreHook(store)` |
| Render undo/redo availability or pause state | `useHistoryStatus(history)` |
| Render persistence hydration, expiry, or errors | `usePersistStatus(handle)` |
| Prepare matching initial data for SSR/hydration | `prepareStoreForHydration(store)` |
| Read state outside React or observe mutations | `snapshot(store)`, `subscribe(store, listener)`, `subscribeKey(store, key, listener)` |
| Persist state, record history, or inspect it in DevTools | `persist(store, options)`, `withHistory(store)`, `devtools(store)` |
| Track changes inside Map-like or Set-like collections | `reactiveMap()`, `reactiveSet()` |
| Compare selector results one level deep | `shallowEqual(previous, next)` |

`useClassyStore` is the starting point for React components. The two status hooks
are optional: use them only when displaying metadata from an existing history or
persistence handle. They do not create those handles or subscribe to store data.

See the [API reference and import paths](https://codebelt.github.io/classy-store/docs/#package-entry-points) for signatures, public types, and lifecycle details.

## React integration

React subscriptions notify synchronously, so controlled inputs preserve caret position without extra options:

```tsx
const name = useClassyStore(formStore, (state) => state.name);

return (
  <input
    value={name}
    onChange={(event) => formStore.setName(event.target.value)}
  />
);
```

Ordinary `subscribe(store, listener)` callbacks still batch in a microtask. React batches renders within event handlers, while selectors can run after each mutation.

For server-rendered React apps, call `prepareStoreForHydration(store)` from `@codebelt/classy-store/react/server` on matching server/client stores before persistence starts. Delayed Suspense boundaries then hydrate from the original data and catch up to live state. See the [SSR guide](https://codebelt.github.io/classy-store/docs/REACT_SSR).

For Next.js App Router, construct stores inside Client Providers from serializable initial data. Use `@codebelt/classy-store/react/server` when preparing a store in server-only code. See the [App Router guide](https://codebelt.github.io/classy-store/docs/REACT_NEXT) for package boundaries, streaming, and navigation.

Selector and auto-tracked hooks are tested in React Compiler consumers on React 18 and 19. Auto-tracking preserves reads used by memoized calculations and children; no compiler opt-out is required. See [compiler compatibility](https://codebelt.github.io/classy-store/docs/#react-compiler-compatibility) for scope and render-filtering behavior.

Auto-tracked React subscriptions require native `WeakRef` support (ES2021) so tracking dependencies do not keep obsolete snapshots alive.

For independent forms, nested editors, and request-scoped state, see the [typed context example](https://codebelt.github.io/classy-store/docs/REACT_SCOPING). Providers own their store instances and effects; React keys control intentional resets.

Most components only need `useClassyStore(store)` to render application data. Use [`useHistoryStatus(history)`](https://codebelt.github.io/classy-store/docs/#usehistorystatushistory) for undo/redo controls and recording status, or [`usePersistStatus(handle)`](https://codebelt.github.io/classy-store/docs/#usepersiststatushandle) for hydration, expiry, and persistence errors. Both hooks come from `@codebelt/classy-store/react` and update even when store data is unchanged. Manual `save()`, `clear()`, and `rehydrate()` calls reject on failure after reporting through status and `onError`. Handle these promises in event handlers; automatic persistence reports failures without producing unhandled rejections.

## Angular 22 integration

The `/angular` adapter supports **all stable Angular 22 releases** (`^22.0.0`).
Development dependencies and the example stay pinned to `22.2.3`. Call `injectStore(store)`
in a live Angular injection context to get a readonly snapshot signal. Store
writes update the signal and dependent computed reads immediately; Angular
schedules rendering, including in zoneless applications. The subscription is
removed with its `DestroyRef` lifecycle. Ordinary core subscriptions remain
batched. See the [Angular guide](https://codebelt.github.io/classy-store/docs/ANGULAR)
for inputs, keyed lists, cleanup, and migration requirements.

## Solid 2 integration

The `/solid` adapter targets **Solid 2.0.0-rc.18 only**; Solid 1 is no longer
supported. Pin `solid-js` and the browser renderer `@solidjs/web` to that exact
release candidate. `useClassyStore(store)` returns an immutable snapshot accessor
and requires a live component or `createRoot()` owner for automatic cleanup.

Store changes reach Solid synchronously, while Solid 2 batches its reactive
updates. Use Solid's `flush()` when imperative code needs updated computed values
or DOM immediately. Ordinary core subscriptions remain batched. See the
[Solid 2 guide](https://codebelt.github.io/classy-store/docs/SOLID) for inputs,
keyed lists, ownership, and migration of the example toolchain.

## 📦 Installation

```bash
npm install @codebelt/classy-store
# or
bun add @codebelt/classy-store
```

Framework peers are optional; install only what your application uses.

| Framework | Supported peer range |
|-----------|----------------------|
| React | `^18.0.0 \|\| ^19.0.0` |
| Vue | `^3.2.0` |
| Svelte | `^4.0.0 \|\| ^5.0.0` |
| Angular | `^22.0.0` |
| Solid | `2.0.0-rc.18` (exact prerelease) |

Use matching `react` and `react-dom` versions for React applications. These
ranges exclude untested future majors. Development dependency pins are separate
from consumer support. Packed consumers cover the React 18.0/19.0, Vue 3.2.0,
and Svelte 4.0.0/5.0.0 minimums; see the
[framework support documentation](https://codebelt.github.io/classy-store/docs/#installation).

## 🤖 AI / LLM Usage

This library provides machine-readable documentation for LLM-powered tools:

- [`llms.txt`](https://codebelt.github.io/classy-store/llms.txt) — Navigation index for AI assistants
- [`llms-full.txt`](https://codebelt.github.io/classy-store/llms-full.txt) — Complete documentation in one file

The navigation index uses the [llms.txt format](https://llmstxt.org/).

## 💡 Why Another State Library

- A class-based store where the class is the object and the type — no separate interface or type definition needed.
- Getters as computed values, cached automatically and only recalculated when something changes.
- No component wrapping — no observers, no HOCs, just a hook.

## 🙏 Acknowledgements

This library wouldn't exist without the ideas pioneered by these projects. Each one taught us something different, and we took the best of each:

**[MobX](https://github.com/mobxjs/mobx)** — The OG of class-based reactive state. MobX proved that classes with fields, methods, and getters are the most natural way to model state. We took its `makeAutoObservable` philosophy — everything is reactive by default, no decorators or boilerplate — and its automatic computed memoization with fine-grained dependency tracking. MobX showed that getters should "just work" as cached derived values.

**[Valtio](https://github.com/pmndrs/valtio)** — Daishi Kato's proxy-based masterpiece gave us the core architectural pattern: a mutable write proxy for ergonomic mutations paired with immutable snapshots for React integration. Valtio's structural sharing approach — where unchanged sub-trees keep the same frozen reference across snapshots — is what makes `Object.is` selectors efficient without custom equality. We also adopted its `proxy-compare` library for automatic property tracking in selectorless mode.

**[Zustand](https://github.com/pmndrs/zustand)** — Also by Daishi Kato, Zustand set the standard for minimal, hook-first state management. Its selector pattern (`useClassyStore(store, s => s.count)`) with `Object.is` equality is what we use in selector mode. Zustand proved that you don't need Providers, context wrappers, or HOCs — just a hook and a store. Its focus on tiny bundle size pushed us to keep things lean.

**[proxy-compare](https://github.com/dai-shi/proxy-compare)** — The property-tracking utility by Dai-shi that powers our auto-tracked mode. It wraps snapshot objects in a tracking proxy, recording which properties a component reads, then compares those reads between snapshots. This lets components subscribe without writing explicit selectors.

**[React](https://react.dev)** — React 18's `useSyncExternalStore` is the foundation of our hook layer. It provides tear-free concurrent-mode-safe integration with external stores, and it's the same API used by Zustand, Redux, and Valtio under the hood.

**[Claude 4.6 Opus](https://anthropic.com)** — Let's be real: this library was designed, architected, implemented, tested, and documented almost entirely by Claude 4.6 Opus (Anthropic) via [Cursor](https://cursor.com). From the three-layer proxy architecture to the memoized computed getters with dependency tracking, the cross-snapshot caching strategy, and tests — it was all pair-programmed with an AI that never gets tired of writing Proxy traps. The human brought the vision, the taste, and the "no, make it better" energy. Claude brought the code.

**[OpenAI Codex](https://openai.com/codex/)** — Contributed public API refinements, core and React regression tests, and fixes for hydration, React Compiler compatibility, Next.js integration, performance, memory retention, and persistence. Also helped review and reorganize the codebase, update examples, and improve the documentation.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution policy and bug reports.

Run `bun run benchmark:react` to compare large forms and lists with selectors, auto-tracking, and React Compiler. See the [benchmark methodology](./packages/classy-store/tests/performance/README.md) for measurements and reproduction settings.

Run `bun run test:react:memory` to capture and compare Chromium heap snapshots across repeated mounts, resets, and collection changes. See the [memory regression methodology](./packages/classy-store/tests/memory/README.md) and [before/after results](./packages/classy-store/tests/memory/RESULTS.md).

Run `bun run test:react:next` for packed-package production Next.js builds and browser regressions with Compiler off/on. See the [integration methodology](./packages/classy-store/tests/next/README.md).

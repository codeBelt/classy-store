---
title: "About Classy Store"
description: "Design goals, comparisons, and the projects behind Classy Store."
---

## Features

- **Class-based stores** — plain classes with fields, methods, and getters
- **No required wrappers** — shared client stores need no `observer()`, Provider, HOC, or decorator; use context to scope instances
- **React render filtering** — selectors and tracked reads filter updates caused by store subscriptions
- **Immutable snapshots** — structural sharing keeps unchanged sub-trees reference-equal
- **Memoized computed values** — class getters are automatically cached, recompute only when deps change
- **Batched subscriptions** — ordinary listeners coalesce mutations in a microtask; React receives updates synchronously
- **Type-safe** — full TypeScript inference from your class definitions
- **Framework bindings** — React hooks and adapters for Vue, Svelte, Solid, and Angular
- **Two hook modes** — explicit selector or automatic property tracking (React)
- **Reactive collections** — `reactiveMap()` and `reactiveSet()` for Map/Set-like state
- **Persistence** — `persist()` utility with transforms, versioning, migration, debounce, cross-tab sync, TTL expiration, and SSR support
- **DevTools** — `devtools()` connects to Redux DevTools for state inspection and time-travel debugging
- **Property subscriptions** — `subscribeKey()` watches a single property for changes with previous/current values
- **Undo/Redo** — `withHistory()` adds undo/redo via a snapshot stack with pause/resume and configurable limits

## Comparison with other libraries

Classy Store combines class methods, memoized getters, snapshots, and React hooks
with selectors or automatic property tracking. Compare the APIs and tradeoffs in
the official documentation for [Zustand](https://zustand.docs.pmnd.rs/),
[MobX](https://mobx.js.org/), and [Valtio](https://valtio.dev/).

Bundle size depends on the imported entry points, bundler, and compression settings.
Measure the production bundle for your application's imports; a package tarball's
size is not the amount of JavaScript delivered to the browser.

## Vision

I wanted state management that feels like writing plain TypeScript.

- **A class is the store.** Define fields, methods, and getters — that's your state, your actions, and your derived values. The class _is_ the type. TypeScript infers everything automatically.
- **Getters are computed values.** Write `get filtered()` and it's memoized with dependency tracking out of the box. It caches until a dependency changes.
- **Framework bindings that feel native.** React's `useClassyStore`, Vue's `useClassyStore` (shallow ref), Svelte's `toSvelteStore`, Solid's `useClassyStore` (signal getter), Angular's `injectStore` — each integration matches the framework's reactive idioms.
- **Call methods directly.** `todoStore.addTodo('Buy milk')` — a real object with real methods, callable from anywhere.
- **Filter React store updates.** Selectors and automatic tracking can skip subscription-driven renders for unchanged data.

Clean, simple, and type-safe. That was the whole idea.

## Acknowledgements

This library wouldn't exist without the ideas pioneered by these projects. Each one taught us something different, and we took the best of each:

**[MobX](https://github.com/mobxjs/mobx)** — The OG of class-based reactive state. MobX proved that classes with fields, methods, and getters are the most natural way to model state. We took its `makeAutoObservable` philosophy — everything is reactive by default, no decorators or boilerplate — and its automatic computed memoization with fine-grained dependency tracking. MobX showed that getters should "just work" as cached derived values.

**[Valtio](https://github.com/pmndrs/valtio)** — Daishi Kato's proxy-based masterpiece gave us the core architectural pattern: a mutable write proxy for ergonomic mutations paired with immutable snapshots for React integration. Valtio's structural sharing approach — where unchanged sub-trees keep the same frozen reference across snapshots — is what makes `Object.is` selectors efficient without custom equality. We also adopted its `proxy-compare` library for automatic property tracking in selectorless mode.

**[Zustand](https://github.com/pmndrs/zustand)** — Also by Daishi Kato, Zustand set the standard for minimal, hook-first state management. Its selector pattern (`useClassyStore(store, s => s.count)`) with `Object.is` equality is what we use in selector mode. Zustand proved that you don't need Providers, context wrappers, or HOCs — just a hook and a store. Its focus on tiny bundle size pushed us to keep things lean.

**[proxy-compare](https://github.com/dai-shi/proxy-compare)** — The property-tracking utility by Dai-shi that powers our auto-tracked mode. It wraps snapshot objects in a tracking proxy, recording which properties a component reads, then compares those reads between snapshots. This lets components subscribe without writing explicit selectors.

**[React](https://react.dev)** — React 18's `useSyncExternalStore` is the foundation of our hook layer. It provides tear-free concurrent-mode-safe integration with external stores, and it's the same API used by Zustand, Redux, and Valtio under the hood.

**[Claude 4.6 Opus](https://anthropic.com)** — Let's be real: this library was designed, architected, implemented, tested, and documented almost entirely by Claude 4.6 Opus (Anthropic) via [Cursor](https://cursor.com). From the three-layer proxy architecture to the memoized computed getters with dependency tracking, the cross-snapshot caching strategy, and tests — it was all pair-programmed with an AI that never gets tired of writing Proxy traps. The human brought the vision, the taste, and the "no, make it better" energy. Claude brought the code.

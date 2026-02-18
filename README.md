# @codebelt/classy-store

**Class-based reactive state management for React, Vue, Svelte, Solid, and Angular.**

[![npm version](https://img.shields.io/npm/v/@codebelt/classy-store.svg)](https://www.npmjs.com/package/@codebelt/classy-store)
[![CI](https://github.com/codebelt/classy-store/actions/workflows/ci.yml/badge.svg)](https://github.com/codebelt/classy-store/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@codebelt/classy-store.svg)](https://github.com/codebelt/classy-store/blob/main/LICENSE)
[![Install size](https://pkg-size.dev/badge/install/394414)](https://pkg-size.dev/@codebelt/classy-store)
[![Bundle size](https://deno.bundlejs.com/badge?q=@codebelt/classy-store)](https://bundlejs.com/?q=@codebelt/classy-store)

## 📚 Documentation

Visit the **[Documentation Website](https://codebelt.github.io/classy-store/)** for tutorials, API reference, and examples.

## 🚀 Features

- **Class-Based**: Define state and logic using standard ES6 classes.
- **Reactive**: Automatic reactivity using Proxies.
- **Computed Getters**: Class getters are automatically memoized and only recompute when dependencies change.
- **Framework Bindings**: First-class integrations for React, Vue, Svelte, Solid, and Angular.
- **TypeScript**: Written in TypeScript with first-class type support.
- **Persist**: Save and restore store state with versioning, migration, cross-tab sync, and SSR support.
- **Undo / Redo**: Add undo/redo to any store via a snapshot stack.
- **Subscribe Key**: Watch a single property for changes with previous and current values.
- **DevTools**: Connect to Redux DevTools for state inspection and time-travel debugging.

## ⚡ Quick Example

```ts
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
  const total = useStore(cartStore, (store) => store.total);
  return <span>${total.toFixed(2)}</span>;
}

function AddButton() {
  return <button onClick={() => cartStore.add('Widget', 9.99)}>Add item</button>;
}
```

## 📦 Installation

```bash
npm install @codebelt/classy-store
# or
bun add @codebelt/classy-store
```

## 🤖 AI / LLM Usage

This library provides machine-readable documentation for LLM-powered tools:

- [`llms.txt`](https://codebelt.github.io/classy-store/llms.txt) — Navigation index for AI assistants
- [`llms-full.txt`](https://codebelt.github.io/classy-store/llms-full.txt) — Complete documentation in one file

These files follow the [llms.txt standard](https://llmstxt.org/).


## 💡 Why Another State Library

- A class-based store where the class is the object and the type — no separate interface or type definition needed.
- Getters as computed values, cached automatically and only recalculated when something changes.
- No component wrapping — no observers, no HOCs, just a hook.


## 🙏 Acknowledgements

This library wouldn't exist without the ideas pioneered by these projects. Each one taught us something different, and we took the best of each:

**[MobX](https://github.com/mobxjs/mobx)** — The OG of class-based reactive state. MobX proved that classes with fields, methods, and getters are the most natural way to model state. We took its `makeAutoObservable` philosophy — everything is reactive by default, no decorators or boilerplate — and its automatic computed memoization with fine-grained dependency tracking. MobX showed that getters should "just work" as cached derived values.

**[Valtio](https://github.com/pmndrs/valtio)** — Daishi Kato's proxy-based masterpiece gave us the core architectural pattern: a mutable write proxy for ergonomic mutations paired with immutable snapshots for React integration. Valtio's structural sharing approach — where unchanged sub-trees keep the same frozen reference across snapshots — is what makes `Object.is` selectors efficient without custom equality. We also adopted its `proxy-compare` library for automatic property tracking in selectorless mode.

**[Zustand](https://github.com/pmndrs/zustand)** — Also by Daishi Kato, Zustand set the standard for minimal, hook-first state management. Its selector pattern (`useStore(store, s => s.count)`) with `Object.is` equality is what we use in selector mode. Zustand proved that you don't need Providers, context wrappers, or HOCs — just a hook and a store. Its focus on tiny bundle size pushed us to keep things lean.

**[proxy-compare](https://github.com/dai-shi/proxy-compare)** — The ~1KB utility (also by Dai-shi) that powers our auto-tracked mode. It wraps frozen snapshot objects in a tracking proxy, recording which properties a component reads, then efficiently diffs only those properties between snapshots. This eliminates the need for manual selectors in most cases.

**[React](https://react.dev)** — React 18's `useSyncExternalStore` is the foundation of our hook layer. It provides tear-free concurrent-mode-safe integration with external stores, and it's the same API used by Zustand, Redux, and Valtio under the hood.

**[Claude 4.6 Opus](https://anthropic.com)** — Let's be real: this library was designed, architected, implemented, tested, and documented almost entirely by Claude 4.6 Opus (Anthropic) via [Cursor](https://cursor.com). From the three-layer proxy architecture to the memoized computed getters with dependency tracking, the cross-snapshot caching strategy, and tests — it was all pair-programmed with an AI that never gets tired of writing Proxy traps. The human brought the vision, the taste, and the "no, make it better" energy. Claude brought the code.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to contribute and the release workflow.

---
"@codebelt/classy-store": minor
---

React subscriptions now always notify synchronously, fixing controlled-input caret jumps without configuration. Remove the `sync` option from `useClassyStore` and hooks returned by `createStoreHook`, and remove imports of `UseClassyStoreOptions`. Selector options still accept `isEqual`. Ordinary `subscribe()` callbacks remain microtask-batched and retain their existing `sync` option.

React selectors may run after each mutation; several writes are not an atomic transaction. React can batch the resulting renders within an event handler. Auto-tracked reads are isolated per render so conditional and abandoned renders do not retain stale dependencies, including for class and null-prototype snapshots. Unchanged tracked references remain stable across parent renders.

Persistence hydration restores mutable nested defaults and custom merged values while preserving prototypes and user accessors. Add real-browser input regressions, lifecycle and SSR coverage, and packed-package checks for React 18 and 19.

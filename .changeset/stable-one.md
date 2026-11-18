---
"@codebelt/classy-store": major
---

Release 1.0.0, the first stable version. The public API and its behavior are now covered by semantic versioning.

**Breaking changes**

- Store methods and array operations are transactions. Synchronous subscribers, including every framework adapter, are notified once when the outermost call returns instead of once per property write. A `sort` or `unshift` on a long list is now one notification and one snapshot.
- `subscribe()` on a nested proxy observes only that proxy's subtree. It no longer fires for sibling changes.
- Each `subscribe()` call is an independent registration; subscribing the same callback twice yields two subscriptions.
- A snapshot assigned into a store stays an immutable snapshot, held by reference, including one read through React's auto-tracked hook.
- `persist`: hydration is per field. A stored field is restored unless that same field was edited locally while the read was in flight, and a local edit can no longer overwrite the stored record before it is restored. Stored data whose version differs is ignored unless `migrate` is provided.
- `shallowEqual` returns `false` for values with different prototypes, compares dates by instant and maps and sets one level deep, and no longer treats arbitrary key-less objects as equal.
- `devtools()` returns a handle with `dispose()` instead of a function, and no longer declares anything on the global `Window` type.
- Angular: `injectStore` is renamed `injectClassyStore`.
- Solid: the adapter requires Solid 2 (`solid-js@^2.0.0`).

**Other changes**

- `withHistory`: undo and redo remove top-level fields that the restored entry lacks, `undo()` steps back over an edit made in the same tick, and unchanged fields keep their identity.
- Reactive collections compare keys and values by identity, so a plain object works as a key whether it is given raw, as a store proxy or as a snapshot. Lookups scan the raw backing array.
- `batch(run)` is exported to group direct writes made outside a store method into one synchronous notification.
- `PROXYABLE` is exported so a class can opt into nested reactivity with `static [PROXYABLE] = true`.
- The package declares `engines.node >= 22` and exports `./package.json`.

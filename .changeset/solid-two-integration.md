---
'@codebelt/classy-store': minor
---

Migrate the `/solid` adapter to Solid 2.0.0-rc.18 only. Solid 1 is no longer
supported. Pin the exact release candidate; browser apps should also use
`@solidjs/web@2.0.0-rc.18` and Solid 2's compiler tooling. The public
`useClassyStore(store): () => Snapshot<T>` API is unchanged.

Forward store notifications synchronously to Solid while preserving Solid 2's
native scheduling and ordinary core subscription batching. Solid's `flush()`
now applies pending store-backed computed values and DOM updates.

Require a live Solid owner before subscribing, and release subscriptions on owner
disposal, including disposal during notification. Add real-component regressions
for inputs, computed values, keyed lists, timing, and cleanup; update the example,
TypeScript checks, CI, and public integration guide.

---
"@codebelt/classy-store": minor
---

Bound optional framework peers to supported stable majors: React `^18.0.0 || ^19.0.0`, Vue `^3.2.0`, and Svelte `^4.0.0 || ^5.0.0`. Future majors are no longer accepted automatically. Development dependency versions remain unchanged.

Fix the Vue adapter's public declaration to return `Ref<Snapshot<T>>` backed by a shallow ref. Vue 3.2.0 does not export the newer `ShallowRef` type; the stable type preserves readonly snapshot inference at the advertised minimum without changing runtime behavior.

Validate packed consumers at React 18.0.0/19.0.0, Vue 3.2.0, and Svelte 4.0.0/5.0.0 using existing focused tests. Add the minimums to CI coverage and document Svelte 4's native deferred `$:` computations versus Svelte 5's immediate `$derived` reads. Store snapshots still update synchronously in the adapters, and ordinary core subscriptions remain batched.

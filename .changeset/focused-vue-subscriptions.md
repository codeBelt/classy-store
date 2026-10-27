---
'@codebelt/classy-store': patch
---

Update Vue snapshot refs synchronously so computed values are immediately current
and one `await nextTick()` waits for the resulting DOM update. Vue rendering and
ordinary core subscriptions still batch.

Require an active Vue effect scope for `useClassyStore()` and stop delivery when
that scope is disposed, including disposal during notification. Call the hook in
`setup()` / `<script setup>` or `effectScope().run()`; calls without an active
scope now throw instead of creating a subscription with no cleanup owner.

Correct the Vue peer dependency to 3.2 or later, matching the Effect Scope APIs
used by the adapter. Add regressions for inputs, writable computed models, class
getters, keyed lists, timing, and component cleanup.

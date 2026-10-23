---
'@codebelt/classy-store': patch
---

Fix Svelte readable-store subscriptions to deliver mutations synchronously,
including mutations made by the initial callback. Prevent callbacks after
unsubscription and clean up if the initial callback throws. Ordinary core
subscriptions remain batched. Add regressions for Svelte 5 input editing,
computed values, list updates, and component cleanup.

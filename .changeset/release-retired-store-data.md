---
'@codebelt/classy-store': patch
---

Release removed child proxies from their former parents, including children removed by native array-length truncation. Failed writes and deletes preserve the existing child connection; partial array truncations invalidate only the removed entries.

Discard obsolete untracked snapshot clones when a nested object starts using versioned tracking. This releases initial collection data and prevents fresh stores over the same raw object from receiving the stale cached clone.

Use weak render-read keys and a weak commit queue to prevent auto-tracked React consumers from retaining obsolete collection snapshots through shared child proxies. Isolate stable subscription and selector callbacks from render-local closure contexts so they do not retain initial results for the lifetime of a mount. Auto-tracked React subscriptions now require native WeakRef support (ES2021).

Add deterministic lifecycle and Compiler regressions plus production Chromium heap-snapshot checks for mounts, resets, rolling replacements, truncation, and intentionally retained detached children with Compiler off and on.

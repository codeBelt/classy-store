---
'@codebelt/classy-store': patch
---

**Runtime requirement:** auto-tracked React hooks now require native `WeakRef` support (ES2021). Selector hooks do not require `WeakRef`. See the [0.7.0 upgrade guide](https://codebelt.github.io/classy-store/docs/UPGRADING_0_7).

Release removed child proxies from their former parents, including children removed by native array-length truncation. Failed writes and deletes preserve the existing child connection; partial array truncations invalidate only the removed entries.

Discard obsolete untracked snapshot clones when a nested object starts using versioned tracking. This releases initial collection data and prevents fresh stores over the same raw object from receiving the stale cached clone.

Use weak render-read keys and a weak commit queue to prevent auto-tracked React consumers from retaining obsolete collection snapshots through shared child proxies. Isolate stable subscription and selector callbacks from render-local closure contexts so they do not retain initial results for the lifetime of a mount.

Add deterministic lifecycle and Compiler regressions plus production Chromium heap-snapshot checks for mounts, resets, rolling replacements, truncation, and intentionally retained detached children with Compiler off and on.

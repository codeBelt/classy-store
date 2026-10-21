---
'@codebelt/classy-store': patch
---

Keep asynchronous persistence writes and removals in request order. Reads wait for prior writes and ignore results superseded by a newer read, save, clear, or local edit. Clearing storage cancels pending auto-saves, and cleanup skips queued operations that have not started.

Ignore outdated browser storage events so two-tab synchronization cannot overwrite a newer local save with an older event. Add deterministic async regressions and real two-tab React tests in Chromium, Firefox, and WebKit.

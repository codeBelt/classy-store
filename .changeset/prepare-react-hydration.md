---
'@codebelt/classy-store': minor
---

Add `prepareStoreForHydration(store)` to the React entry point. Call it on server and client stores initialized with matching data, before rendering or persistence, to retain the initial snapshot for server rendering and delayed Suspense hydration. Hooks then catch up to the live store without replacing server DOM, even if persistence changes state before their first read.

Preparation returns the original mutable proxy, preserves the first capture on repeated calls, and keeps current client subscriptions and core snapshots unchanged. Equal selector results retain their identity when hydration switches to live state. Add delayed and streamed hydration regressions, React 18/19 package coverage, and usage documentation.

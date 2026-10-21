---
'@codebelt/classy-store': patch
---

Fix stale auto-tracked React views when React Compiler or manual memoization reuses a derived value or child without repeating its property reads. Preserve committed dependencies for each reused immutable snapshot object, including structurally shared children, while isolating reads from suspended or abandoned renders.

Add compiled-consumer package tests for React 18 and 19, browser input and memoized-child regressions, and independent concurrency, hydration, and property-operation coverage. Selector APIs and synchronous React notification behavior are unchanged. Auto-tracking can conservatively retain earlier reads until a snapshot object's identity changes.

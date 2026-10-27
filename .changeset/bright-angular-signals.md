---
"@codebelt/classy-store": minor
---

Support all stable Angular 22 releases with the optional `@angular/core` peer set to `^22.0.0` and update `injectStore` signals synchronously while preserving Angular's native rendering schedule and ordinary core subscription batching. Ignore notifications during teardown and release each subscription with its Angular lifecycle.

This removes support for Angular 21 and earlier. Use aligned Angular runtime/compiler packages from a stable Angular 22 release and a compatible TypeScript 6.0 toolchain. Development dependencies and the example remain pinned to 22.2.3. The `/angular` import path and `injectStore(store)` signature are unchanged; imperative signal and computed reads now reflect writes immediately.

Add zoneless input, computed, keyed-list, and cleanup regressions, an updated Angular example, and migration documentation. Validate packed consumers with aligned Angular 22.0.0 and 22.2.3 packages and run the shared focused browser tests for both versions in CI.

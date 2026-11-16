---
"@codebelt/classy-store": patch
---

Share store identity, snapshot caches, and React hydration preparation across ESM and CommonJS entry points from the same package installation. A CommonJS utility such as `withHistory` can now subscribe to an ESM-created store, and an ESM utility can use a CommonJS-created store.

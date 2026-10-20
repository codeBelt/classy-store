---
'@codebelt/classy-store': patch
---

Ignore pending persistence read results and read-error callbacks after unsubscribe. Retired handles no longer overwrite a current React scope or clear storage when an expired read completes after effect cleanup. Pending hydration promises still settle when storage completes.

Add a typed context example with independent and nested store instances, keyed resets, effect-owned persistence, and SSR hydration preparation. Test the actual example against packed React 18/19 consumers, including Strict Mode, storage configuration changes, asynchronous cleanup, and delayed Suspense hydration.

---
'@codebelt/classy-store': minor
---

Add a server-safe `@codebelt/classy-store/react/server` entry for `prepareStoreForHydration`, and mark the published React hooks entry with `use client`. The existing preparation export remains available from `/react`; both use the same capture cache within a module graph.

Fix `Snapshot<T>` function classification so methods with typed parameters retain their callable signatures under strict TypeScript, including reactive collection queries, overloads, and generic functions.

Add packed-package production Next.js App Router tests with React Compiler off/on for package boundaries, request isolation, controlled inputs, streaming hydration, navigation, refresh, and cleanup, plus CI coverage and integration documentation.

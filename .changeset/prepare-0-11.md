---
"@codebelt/classy-store": minor
---

Release 0.11.0 with the MIT license and support for stores shared between ESM and CommonJS callers. The Solid adapter stays in preview at exactly `solid-js@2.0.0-rc.18`. The Angular adapter supports stable `@angular/core@^22.0.0` releases, with the development framework pinned to `22.2.6`.

Preserve edits made by synchronous subscribers to other fields during hydration and cross-tab restores, including when a field is missing from older stored data. Sparse-array selectors using `shallowEqual` now distinguish a hole from an element containing `undefined`. See the [0.11.0 release notes](https://codebelt.github.io/classy-store/docs/UPGRADING_0_11).

Keep explicit store subscriptions scoped to their own subtree, follow child subscriptions when they change owners, and reclaim dead owner links on read-only shared data. A clear issued during restore remains effective until the next local edit. Dense array comparisons short-circuit on the first mismatch.

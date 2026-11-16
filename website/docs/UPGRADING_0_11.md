# Classy Store 0.11.0 release notes

Applications upgrading from 0.10.x can keep their existing store definitions and public imports. This minor release supports React 18 and 19, Vue 3 starting at 3.2, Svelte 4 and 5, and Angular 22. The npm package includes the MIT license.

## Framework support

**The Solid adapter is in preview.** Applications using `@codebelt/classy-store/solid` must pin `solid-js` to exactly `2.0.0-rc.18`. Browser applications must also pin `@solidjs/web` to `2.0.0-rc.18`. Check the adapter's peer requirement before upgrading Solid. [Solid integration guide](./SOLID.md)

**Angular supports all stable 22.x releases** through the optional `@angular/core` peer range `^22.0.0`. The library's development dependencies and example use Angular `22.2.6`. Keep your application's Angular runtime and compiler packages on matching versions. [Angular integration guide](./ANGULAR.md)

## Changes since 0.10.x

- Retained rows stay reactive after reordering or filtering. An edit to a shared object updates every owning path. Subscriptions follow a retained row across stores. An independently created editor keeps its own undo/redo history when embedded in a larger store.
- Snapshots preserve sparse array holes, own JSON `__proto__` keys, and object-literal getters. Nested writes made by class setters reach subscribers. `shallowEqual` distinguishes arrays from records and a missing array slot from an element containing `undefined`.
- Persistence preserves and saves subscriber edits to other selected fields during a restore, regardless of field declaration order. Calling `clear()` from a restore subscriber removes the stored data until a later local edit. Existing 0.10.x records use the same envelope. Keep your persistence schema version when only the library version changes.
- ESM and CommonJS callers can pass a store between entry points from the same installed copy, including when using history utilities or preparing React hydration.

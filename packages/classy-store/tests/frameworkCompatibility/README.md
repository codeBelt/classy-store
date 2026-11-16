# Packed Vue and Svelte minimum versions

Run `bun run test:frameworks:compatibility` from the repository root. The runner
packs the library and installs isolated consumers for Vue 3.2.0, Svelte 4.0.0,
and Svelte 5.0.0. It checks the installed framework/compiler versions and packed
optional peer range, validates public TypeScript declarations, and compiles the
existing browser fixture with each consumer's native compiler.

The same four Playwright scenarios cover inputs/caret, same-event store reads,
computed values, batched core callbacks, lists, and repeated mount/unmount
cleanup. Source tests additionally inspect private listener counts. Packed
consumers retain public subscription/delivery and DOM cleanup assertions without
importing private library code.

The Svelte 4 consumer adapts the shared Svelte 5 fixture to native `$:` statements,
`on:` events, and class-based mounting/destruction. The adapter has no version
branch. Svelte 4's `$:` values update before rendering; the test asserts current
store values during the event and updated computations in the subsequent DOM.
Svelte 5's `$derived` computations remain tested with immediate reads.

CI runs Chromium. To run all three browsers:

```sh
FRAMEWORK_BROWSERS=chromium,firefox,webkit bun run test:frameworks:compatibility
```

After building, select individual consumers with exact versions:

```sh
node packages/classy-store/tests/frameworkCompatibility/runCompatibility.mjs vue@3.2.0 svelte@4.0.0
```

Set `KEEP_FRAMEWORK_COMPATIBILITY_TEMP=1` to keep consumers and traces. Install
the corresponding Playwright browsers before running. React minimums use the
existing `test:react:compatibility` and `test:react:compiler` runners.

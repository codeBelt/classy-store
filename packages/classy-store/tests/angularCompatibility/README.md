# Packed Angular 22 compatibility

Run `bun run test:angular:compatibility` from the repository root. This builds and
packs the library, then installs isolated Angular 22.0.0 and 22.2.3 consumers.
Each consumer pins its Angular core, common, platform-browser, compiler,
compiler-cli, CLI, and build packages to the selected version. The runner checks
the installed dependency tree for mixed Angular versions and checks the packed
optional peer range. The workspace's development/example versions stay at 22.2.3.

Both consumers typecheck the public API and compile the same AOT fixture used by
the source browser suite. The six shared scenarios cover timing/core batching,
inputs/caret and checkbox changes, getters/computed values, keyed lists,
zoneless OnPush rendering, independent consumers, and pending-work cleanup.
Private listener counts are checked only in the source suite; packed consumers
retain the public DOM and effect cleanup assertions without importing internals.

CI runs Chromium for both versions. To run all browsers locally:

```sh
ANGULAR_BROWSERS=chromium,firefox,webkit bun run test:angular:compatibility
```

Pass a version to the runner to check just that consumer after building the
library, for example:

```sh
node packages/classy-store/tests/angularCompatibility/runCompatibility.mjs 22.0.0
```

Set `KEEP_ANGULAR_COMPATIBILITY_TEMP=1` to preserve temporary consumers and traces.
Install the corresponding Playwright browsers before running the checks.

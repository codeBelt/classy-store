# Packed Next.js App Router integration

From the repository root, run:

```sh
bun run test:react:next
```

Install Chromium first with `cd packages/classy-store && bunx playwright install
chromium` if needed. The root command builds the library, creates an npm tarball,
installs it into a separate consumer directory, and runs production Next.js builds
and Chromium tests with React Compiler off and on. This uses the published package
entrypoints, without source aliases, workspace links, or `transpilePackages`.

The consumer pins Next.js 16.4.2 and uses the React, React DOM, and Compiler versions
declared in the library's development dependencies. It uses Turbopack and explicitly
sets `cacheComponents: false`. The tested navigation contract therefore includes
route unmounts and resets. React Activity preservation with Cache Components enabled
is a separate integration mode, not an assumption made by these tests.

Next App Router can supply its own React runtime. The compiler-evidence JSON
records the actual browser `React.version` separately from the installed package
versions in `report.json`. In the current Next.js 16.4.2 matrix that runtime is
`19.3.0-canary-278794d7-20261002`, while the installed React package is 19.3.1.

## Checks

- **Packed boundaries:** both ESM and CommonJS React hook entrypoints must retain
  their leading `use client` directive. The core, collections, utilities, and
  `@codebelt/classy-store/react/server` entrypoints stay server safe and execute
  under Node's `react-server` condition. Normal SSR also checks that the server and
  React entrypoints share the same hydration preparation function and initial
  snapshot registry.
- **Actual Compiler output:** the browser captures the production selector and
  auto-tracked consumer function bodies. Both must allocate a positive number of
  Compiler memo-cache slots and read and write those slots when Compiler is enabled;
  neither may allocate them when it is disabled. The bodies and extracted slot
  evidence are saved as JSON and attached to the Playwright result, so setting a
  config flag without transforming consumers cannot pass this check. A sentinel
  literal is not required: input-dependent memoization can use slot comparisons
  without including that literal in the component body.
- **Request isolation:** six overlapping requests use distinct seeds and verify
  their server store snapshots, collection contents, and server-rendered selector
  and auto-tracked values. A deliberate macrotask between mutation and snapshot
  makes request overlap observable.
- **Controlled inputs:** real browser typing updates selectors and auto-tracked
  consumers synchronously, including insertion into the middle of an input with
  the caret preserved.
- **Navigation:** real links, browser back/forward, and `router.refresh()` preserve
  shared layout state while route stores reset on replacement. A changed server
  request nonce proves refresh has merged the new payload. A document sentinel
  proves navigation did not replace the document. Leaving the layout disposes its
  persistence subscriptions; mutating the retired stores must cause no writes.
- **Streaming:** a unique server gate holds an async Server Component. The raw
  response must deliver the fallback before the gate is released, then deliver
  the server-rendered fields. This checks response ordering, not just final HTML.
- **Delayed hydration:** a second browser gate delays the streamed client subtree
  independently of the server response. Parent persistence must restore saved
  state while the child still displays its server values and remains unhydrated.
  After release, selector, auto-tracked output, and input update to saved data;
  their exact original DOM nodes must survive. Subsequent typing also works.

Every browser test fails on page exceptions or console errors, including recoverable
hydration failures. Server gates have a bounded fallback timeout; the network test
deadline is shorter, so waiting for that timeout cannot pass the streaming check.

## Outputs and focused runs

Logs, package-boundary results, Playwright diagnostics, and the final report are
written to `test-results/next/` by default. Build output and browser diagnostics
are separated by Compiler mode. CI runs each mode in its own job and uploads these
artifacts, including failure traces.

```sh
# One Compiler mode, retaining the generated consumer for inspection.
NEXT_TEST_MODES=on KEEP_NEXT_TEMP=1 bun run test:react:next

# Reuse a dedicated consumer directory and choose where reports are written.
NEXT_TEST_DIRECTORY=/tmp/classy-next-consumer \
NEXT_TEST_OUTPUT=/tmp/classy-next-results \
bun run test:react:next
```

`NEXT_TEST_MODES` defaults to `off,on`. `NEXT_TEST_DIRECTORY` must be a dedicated
scratch directory: the runner copies fixture files and installs dependencies there.
Without that setting the runner creates a temporary directory, deletes it after
success, and retains it after failure. `KEEP_NEXT_TEMP=1` also retains successful
temporary consumers. `NEXT_TEST_OUTPUT` changes the report directory.

To rerun browser tests against an already running production consumer:

```sh
NEXT_TEST_URL=http://127.0.0.1:3000 NEXT_TEST_COMPILER=on \
packages/classy-store/node_modules/.bin/playwright test \
  --config packages/classy-store/tests/next/playwright.config.ts
```

Both variables are required. `NEXT_TEST_COMPILER` must match the production build.
The runner provides them automatically. The outer test harness is included in
`bun run typecheck`; the isolated Next.js production build typechecks the fixture
against the installed package declarations.

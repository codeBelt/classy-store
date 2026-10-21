# React browser regressions

From the repository root:

```sh
bun install --frozen-lockfile
cd packages/classy-store
bunx playwright install chromium firefox webkit
bun run test:browser
```

CI also installs the Linux system dependencies with `playwright install --with-deps`. The suite starts an isolated local Bun server and tests the source React binding in Chromium, Firefox, and WebKit. Package exports and React version compatibility are tested separately in `tests/compatibility`.

Every test fails on browser console errors or uncaught page errors. Native clipboard replacement and subsequent caret behavior are tested in Chromium; Firefox and WebKit explicitly skip those cases because they do not expose the same clipboard permissions API.

The `/persistence` fixture opens two pages in one browser context and uses real
`localStorage` events. It verifies bidirectional input updates for selectors and
auto-tracking, no echo writes, reload restoration, unsubscribe, remote updates
cancelling pending debounces, and a newer local save winning over an older queued
storage event. The conflict case uses a capture listener to make the ordering
deterministic; the event itself is browser-generated and must be trusted. Errors
are collected from both tabs. These cases run in the existing three-browser CI
matrix.

The four hook forms (selector, auto-tracked, bound selector, and bound auto-tracked) cover middle insertion, selection replacement, deletion, multiline and Unicode input, checkbox changes, composition event sequences, and multi-property/array updates. The latter asserts one React commit in the event handler and one ordinary subscription callback after the microtask flush.

Composition tests combine synthetic boundaries with browser text insertion. They do not automate a native operating-system IME candidate picker; that still needs a manual smoke test. Firefox emits additional composition boundaries during text insertion, so the suite checks balanced boundaries and the final value/caret rather than a browser-specific event count.

The caret tests failed under the previous default batched React subscriptions: inserting `XY` in `abcdef` at position 2 produced `abXcdefY`. No `sync` option is passed by any fixture.

Hydration regressions render both a complete server response and a real `renderToReadableStream` response with separate shell and Suspense chunks. A client gate suspends before any child store hook runs. The parent effect restores real `localStorage` persistence while that boundary remains dehydrated; the tests then require all four hook forms to hydrate from the prepared server snapshot without a recoverable error or replacing any server input/output element. After hydration they must show the restored state and handle live input with its caret intact.

The streaming test starts the client hydration script explicitly after observing the shell, then releases the server chunk through a request-scoped test endpoint. This controls the ordering without timing sleeps and avoids differences in browser bootstrap-script scheduling during an open response. Client and server gates are independent. The complete response uses an ordinary script tag. Before `prepareStoreForHydration`, the completed-response regression failed with a hydration mismatch, an initial read of persisted state instead of server state, and replaced DOM.

The `/compiler` fixture transforms six consumer components with React Compiler target `19` before Bun bundles them. The shared compiler helper requires named `CompileSuccess` events with memo slots and a compiler runtime import, so skipped compilation fails the suite. All four hook forms cover controlled-input caret position, multi-property batching, local re-renders, conditional nested reads, and automatically memoized children. Before the tracking fix, changing only a memoized child's nested field after a parent-only render left both auto-tracked modes stale; selector modes passed.

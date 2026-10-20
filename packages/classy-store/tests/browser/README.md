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

The four hook forms (selector, auto-tracked, bound selector, and bound auto-tracked) cover middle insertion, selection replacement, deletion, multiline and Unicode input, checkbox changes, composition event sequences, and multi-property/array updates. The latter asserts one React commit in the event handler and one ordinary subscription callback after the microtask flush.

Composition tests combine synthetic boundaries with browser text insertion. They do not automate a native operating-system IME candidate picker; that still needs a manual smoke test. Firefox emits additional composition boundaries during text insertion, so the suite checks balanced boundaries and the final value/caret rather than a browser-specific event count.

The caret tests failed under the previous default batched React subscriptions: inserting `XY` in `abcdef` at position 2 produced `abXcdefY`. No `sync` option is passed by any fixture.

Hydration regressions render both a complete server response and a real `renderToReadableStream` response with separate shell and Suspense chunks. A client gate suspends before any child store hook runs. The parent effect restores real `localStorage` persistence while that boundary remains dehydrated; the tests then require all four hook forms to hydrate from the prepared server snapshot without a recoverable error or replacing any server input/output element. After hydration they must show the restored state and handle live input with its caret intact.

The streaming test starts the client hydration script explicitly after observing the shell, then releases the server chunk through a request-scoped test endpoint. This controls the ordering without timing sleeps and avoids differences in browser bootstrap-script scheduling during an open response. Client and server gates are independent. The complete response uses an ordinary script tag. Before `prepareStoreForHydration`, the completed-response regression failed with a hydration mismatch, an initial read of persisted state instead of server state, and replaced DOM.

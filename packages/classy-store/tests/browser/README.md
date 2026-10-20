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

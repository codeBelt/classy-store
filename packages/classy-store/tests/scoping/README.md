# Scoped React context checks

These tests exercise the editor context example in
`examples/react/src/demos/scoped-store/store` against the published package shape.
The compatibility runner copies that directory unchanged into each temporary
consumer as `example/`, alongside these fixtures and the React-version-aware
`reactAct.ts` helper. The `./example/...` imports intentionally resolve only in
those consumers; there is no second implementation of the example in this folder.

From the repository root:

```sh
bun run test:react:compatibility
```

The default matrix covers React 18.0, 18.3, and the library's pinned React version.
See `../compatibility/README.md` for selected versions and retained consumers.

- `scoping.lifecycle.test.tsx` checks independent providers, nested lookup,
  stable stores, explicit keyed resets, missing-provider errors, and cleanup.
- `scoping.ssr.test.tsx` checks request isolation, nested server contexts,
  matching hydration, and persistence updates before a suspended consumer's
  first hook read. Selector and auto-tracked consumers must retain the server
  DOM and then catch up to the persisted state.
- `scoping.qa.test.tsx` independently checks pending persistence reads during
  Strict Mode replay, provider replacement, keyed resets, and unmount, as well
  as abandoned renders and memoized consumers.
- `scoping.types.fixture.tsx` checks the copied example's inferred store,
  mutable actions, readonly snapshots, and provider props. The runner also
  typechecks every scoping runtime test and its helper components.

These are application ownership patterns built from existing public APIs;
they do not add a context abstraction to the library.

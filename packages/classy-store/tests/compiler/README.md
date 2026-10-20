# React Compiler consumers

Run `bun run test:react:compiler` from the repository root. The runner builds on
the package's existing `dist`, packs that public package, and installs isolated
React 18.0, 18.3, and current React 19 consumers. To check one version after a
library build:

```sh
node packages/classy-store/tests/compiler/runCompiler.mjs 19.3.1
```

Consumer components are transformed by the pinned `babel-plugin-react-compiler`
using its default inference rules. React 18 uses compiler target `18` and the
`react-compiler-runtime` shim; React 19 uses target `19` and React's runtime.
The package itself remains the published, uncompiled build. No compiler-specific
configuration or opt-out directives are applied to the store hooks.

The compile helper rejects compiler bailouts and requires every named component
to report `CompileSuccess` with memo slots and emit a memo-cache runtime import.
It preserves TypeScript and JSX for Bun to transpile after the compiler pass.
The generated `compilation.json` records the named components and memoization
statistics for each installed consumer.

The runtime suite covers direct and bound hooks, selector/equality changes,
conditional nested reads, memoized children, and local-state updates followed by
store mutations. The cached array derivation cases reproduce a stale-view bug:
after a local render, the compiler can retain an array mapping while rerunning
only an indexed read; replacing the hook's complete read set loses dependencies
still used by the cached result.

Independent QA fixtures under `fixtures/` are compiled by the same pipeline and
run alongside the main regressions. Browser fixtures reuse `compileConsumer`
for controlled inputs and actual browser scheduling.

Set `KEEP_COMPILER_TEMP=1` to retain the installed consumers, transformed source,
and compilation records. Set `BUN_EXECUTABLE` when testing with a specific Bun
installation. The matrix needs npm registry access for its isolated consumers.

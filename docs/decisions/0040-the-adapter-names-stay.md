# 0040. The adapter names stay

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Changes behaviour that 0.11 documents:** no

## Context

The adapters are `useClassyStore` for React, Vue and Solid,
`toSvelteStore` for Svelte and `injectClassyStore` for Angular. In Solid the
adapter behaves like Solid's `from()`, and `use*` there usually means a
context lookup, so `fromClassyStore` was proposed for Solid.

## Decision

No adapter is renamed. The Solid adapter keeps `useClassyStore`.

The Svelte guide gets a section on runes and names its example value
`snap`, not `state`.

## Alternatives considered

### Rename the Solid adapter to `fromClassyStore`

The precedent is split. The function has to be called under an owner and
returns an accessor, which is what a Solid user expects of a `use` function.
A rename is a cost with no behaviour behind it: eleven files and every Solid
import. The name is also the one a user of the React or the Vue adapter
already knows. Not taken, and final for 1.0.

## Consequences

- Nothing changes in the code.
- The same reasoning keeps `isEqual` (record 0041).
- Open again only with a new reason; a rename after 1.0 is a breaking change.

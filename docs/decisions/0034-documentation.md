# 0034. Documentation changes go with the change they describe, and shared limits stay documented

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** docs
- **Changes behaviour that 0.11 documents:** no

## Context

Several limits and defaults of 0.11 are not stated in the docs, and several
limits are shared with other libraries and have no proposal to change them.
Code that spreads a snapshot changes without an error under record 0043.

## Decision

Each documentation change is made with the code change it belongs to, or,
where no code changes, in a later documentation pass of its own. These
changes are made:

- "Frozen objects are values" needs the whole value frozen: the mutable
  contents of a shallowly frozen object are shared with every snapshot.
- An unmarked class instance is shared between the store and every snapshot.
- A `#private` field is never state.
- The object passed to `createClassyStore` is the store. The Solid guide says
  so, because a Solid user expects it to stay untouched.
- `subscribe()` is batched by default, and its callback receives no
  arguments. Both are stated at the top of the reference (record 0017).
- Each adapter guide names `batch()` beside the synchronous timing.
- The Svelte guide names its example value `snap`, not `state`, which
  conflicts with the `$state` rune, and gets a section on runes (record
  0040).
- `persist`: recipes for AsyncStorage, IndexedDB and an encrypting wrapper; a
  transform each for `Date`, `Map` and `Set`; unknown stored keys are ignored
  and removed at the next save; stored data is untrusted input and `merge` is
  the place to validate it; a record with no version counts as version 0.
- `devtools`: the extension receives every state, so secrets do not belong
  in a store with DevTools enabled outside development (record 0027).

These limits stay as they are, documented where they are documented or
listed as unspecified:

- A write through the raw object is invisible until the next write through
  the store to that node.
- A subscription follows the object, not the property.
- An object returned by a getter is not protected.
- `Object.getOwnPropertyDescriptor(store, key).value` is the raw object.
- `structuredClone(store)` throws.
- A write past the end of a typed-array store notifies and stores nothing.

Two more sentences go into the reference:

- **An array in a store carries its indices and `length` only.** A named
  property written to one stays on the live array and is left out of every
  snapshot. A check that reports it can follow in 1.x.
- **A spread or a serialised snapshot carries data, not computed values**
  (record 0043). The changelog entry for 1.0 has the same sentence, because
  code that spreads a snapshot changes without an error.

## Alternatives considered

None was proposed.

## Consequences

- The docs describe 1.0 at each commit, not only at the end.
- The changelog for 1.0 names the change to spreads of snapshots.

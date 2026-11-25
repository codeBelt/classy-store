# 0025. Cross-tab sync ignores an event from another storage area

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Changes behaviour that 0.11 documents:** no

## Context

With cross-tab sync on, `persist` listens to the `storage` event. In 0.11
the handler applies an event under the same key from another storage area,
for example a write to `sessionStorage` to a store kept in `localStorage`,
and a synthetic event that has no `storageArea`.

## Decision

The narrow form: when `storage` is a `Storage`, an event whose
`storageArea` is another area is ignored. An event without `storageArea` is
still accepted, because only a script can make one, and a script on the page
can write to the storage directly.

## Alternatives considered

### Refuse an event that has no `storageArea`

It protects nothing: a script that can make such an event can write to the
storage itself.

## Consequences

- Size: 24 bytes on `./utils`. No unit test changed.

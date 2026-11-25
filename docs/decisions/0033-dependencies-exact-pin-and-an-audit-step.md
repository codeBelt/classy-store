# 0033. Dependencies: an exact pin, and an audit step that reports

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** repository
- **Label:** Can follow 1.0
- **Changes documented behaviour:** no

## Context

`proxy-compare` is the library's one runtime dependency, and it is pinned to
an exact version. `bun audit` reports advisories in development
dependencies; the published tarball is accepted as it is.

## Decision

- `proxy-compare` stays pinned to an exact version, and `CONTRIBUTING.md`
  says why.
- CI gets a `bun audit` step that reports and does not fail.
- The published tarball is accepted as it is.

## Alternatives considered

None was named.

## Consequences

- An update of `proxy-compare` is a deliberate change.
- An advisory shows in CI without blocking a change.

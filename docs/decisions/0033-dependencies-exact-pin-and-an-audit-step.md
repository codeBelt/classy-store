# 0033. Dependencies: an exact pin, and an audit step that reports

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** repository
- **Changes behaviour that 0.11 documents:** no

## Context

`proxy-compare` 3.0.1 is the library's one runtime dependency. It has one
maintainer and is pinned to an exact version. `bun audit` reported 17
advisories in development dependencies, none of which reaches the published
tarball.

## Decision

- `proxy-compare` stays pinned to an exact version, and `CONTRIBUTING.md`
  says why.
- CI gets a `bun audit` step that reports and does not fail.
- The published tarball is accepted as it is.

## Alternatives considered

None was proposed.

## Consequences

- An update of `proxy-compare` is a deliberate change.
- An advisory shows in CI without blocking a change.

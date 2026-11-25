# 0032. The workflows are hardened now; the release job is split after 1.0

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** repository
- **Changes behaviour that 0.11 documents:** no

## Context

One job of `release.yml` holds the npm publishing identity
(`id-token: write`) and also runs `bun install`, the build and Changesets
before `npm publish`. Actions are pinned by major tag. A compromised
development dependency or a moved action tag could take the token and
publish a version of its own. That code in the job can take the token comes
from how GitHub and npm document the mechanism; nobody tried it. Three
workflows declare no permissions.

## Decision

- **Now:** every third-party action in every workflow is pinned to the
  commit its tag points to, with a Dependabot configuration that keeps the
  pins current. The three workflows that declare no permissions get
  `contents: read`. Neither changes what a run does.
- **After 1.0:** `release.yml` is split into a job that installs, builds,
  runs Changesets and packs the tarball, and a job that holds
  `id-token: write`, installs nothing and publishes that tarball. The plan
  for it names where each step goes, the tag step and the "already
  published" check included, and sets `persist-credentials: false` on the
  release checkout with the token passed to the push. The owner tries it
  with a manual run before a release depends on it.
- Only the owner can do two steps of the split: a GitHub environment for the
  publish job with a required reviewer, and the npm settings that accept
  only that environment and refuse publishing with a token.

## Alternatives considered

### Split the release job before 1.0

A release workflow cannot be tried without releasing. If the split landed
before 1.0, its first run would be the publish of 1.0. Nothing about the
split has to ship with 1.0.

## Consequences

- The split closes the route by which an installed dependency takes the
  token. It does not close the other one: the same code could rewrite
  `dist` before it is packed, and the second job would publish that.
  Pinning closes the moved-tag half of both.
- Until the split, a compromised development dependency in the release job
  could still take the token.

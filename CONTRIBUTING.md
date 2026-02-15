# Contributing to @codebelt/classy-store

## Development Setup

1. Install [Bun](https://bun.sh).
2. Clone the repository.
3. Run `bun install`.

## Workflow

- **Dev**: `bun run dev` (watch mode)
- **Test**: `bun run test`
- **Lint**: `bun run lint`
- **Docs**: `bun run docs:dev`

## Releasing

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

### 1. Create a Changeset

When you make changes that should be released, run:

```bash
bun run changeset:add
```

Follow the prompts to select the package and bump type (patch, minor, major). This creates a file in `.changeset/`. Commit this file with your PR.

### 2. Automated Release

When your PR is merged to `main`:
1. The **Release** GitHub Action will create a "Version Packages" PR.
2. When you merge that PR, the action will automatically publish the new version to npm and update the CHANGELOG.

### 3. Pre-releases

To enter pre-release mode (e.g., beta):

```bash
bun run prerelease:enter beta
bun run changeset:version
bun run changeset:publish
```

To exit:
```bash
bun run prerelease:exit
```

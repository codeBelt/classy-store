# Classy Store documentation

The published documentation uses Docusaurus in this `website/` directory.
Documentation pages live in `docs/`; `sidebars.ts` controls navigation.
The main project README is `../README.md`.

## Install

Install the workspace dependencies from the repository root, then the website's
separate dependencies:

```sh
bun install --frozen-lockfile
cd website
bun install --frozen-lockfile
```

## Develop

From the repository root:

```sh
bun run build
bun run docs:dev
```

This builds the React demos and starts Docusaurus. Changes to documentation pages
reload during development.

## Validate and build

From the repository root:

```sh
bun run build
bun run docs:build
```

The docs command rebuilds the demos, regenerates the full machine-readable docs,
and builds the static site in `website/build/`. Docusaurus checks links during
the build. To preview the result, run `bun run serve` from `website/`.

## Machine-readable documentation

- `static/llms.txt` is the navigation index; update it when adding a guide.
- `static/llms-full.txt` is generated from every Markdown page in `docs/`.
  Do not edit the generated file directly. Run `bun run docs:llms` from
  `website/` to refresh it without a full build.

## Deployment

The `Deploy Docs` GitHub Actions workflow builds and deploys to GitHub Pages when
relevant changes reach `main`. It also supports manual workflow dispatch. A local
build does not deploy the site or publish the npm package.

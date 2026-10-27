# Classy Store Fumadocs Prototype

This is an isolated Fumadocs version of the Classy Store documentation site.
The existing Docusaurus site remains in `../website`; this folder is a prototype
to iterate on before replacing or moving anything.

The app uses Next.js static export and Fumadocs MDX. Its content is copied from
`../website/docs`, so edit these copies while working on the prototype.

## Development

```bash
bun run dev
```

Open http://localhost:3000. The examples bundle is rebuilt from
`../examples/react` when the dev server starts.

## Static output

```bash
bun run build
```

For a GitHub Pages project site at `codebelt.github.io/classy-store`, use:

```bash
bun run build:pages
```

The exported files are written to `out/`. `public/.nojekyll` keeps GitHub Pages
from dropping Next.js's `_next` assets.

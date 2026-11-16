# Classy Store documentation

Edit pages in `website/content/docs/` and use `meta.json` there to order the sidebar. Set each page’s title and description in its frontmatter. Link between sources with relative Markdown links such as `./REACT_SSR.md`. Published paths and heading fragments are used by npm and earlier release notes.

From the repository root, install both sets of dependencies and build the library for the React demo.

```sh
bun install --frozen-lockfile
bun install --cwd website --frozen-lockfile
bun run build
bun run docs:dev
```

The dev server serves the site at <http://localhost:3000>. To verify the GitHub Pages export locally, run these commands from the repository root.

```sh
bun run docs:build
(cd website && bunx playwright install chromium)
bun run docs:test
```

The tests serve `website/out/` under `/classy-store/`. They require Python 3 and Chromium. The export includes the React demo, search index, per-page Markdown, `llms.txt`, and `llms-full.txt`. The Docs workflow checks pull requests and publishes the tested export from `main`.

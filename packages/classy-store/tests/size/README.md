# Bundle size

`bun run size` builds the library, bundles every published entry point the way
an application would, and reports its size in bytes.

```bash
bun run size                       # measure, compare with the baseline, check the budgets
bun run size --update-baseline     # also record the sizes in baseline.json
```

## What is measured

- Every entry is bundled together with the main entry (`.`), because no
  application uses an adapter or a utility without the core. "Adds to main" is
  what the entry costs on top of the core.
- `proxy-compare`, the one runtime dependency, is inside the bundle. The
  frameworks, which are peer dependencies, are left out.
- The bundle is minified by Bun with `process.env.NODE_ENV` set to
  `"production"`, then gzipped at level 9.
- Every export of both entries is kept, so this is the most an application
  pays. One that imports less may ship less.

The numbers repeat exactly for a given Bun version and source.

## Files

- [`baseline.json`](./baseline.json) holds the sizes that later changes are
  compared with. The "Against baseline" column is the difference in gzipped
  bytes.
- `budgets.json` holds the limits, in gzipped bytes. The main entry is held to
  its whole size and every other entry to what it adds. An entry with no budget
  fails the run, so a new entry point cannot ship unmeasured. `CONSTRAINTS.md`
  at the repository root says where each number comes from.
- `test-results/size/size.json` (ignored by Git) holds the last measurement.

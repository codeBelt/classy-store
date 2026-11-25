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
- `budgets.json` holds a `budget` and a `ceiling` per entry, in gzipped
  bytes. The main entry is held to its whole size and every other entry to
  what it adds. The run fails when a measured size is over its budget, when a
  budget is above its ceiling, and when an entry has no budget or no ceiling,
  so a new entry point cannot ship unmeasured.
- A budget moves with the work: a commit that grows an entry sets its budget
  to the new measured size plus 2% and adds a line with the measured size to
  decision record 0004. A ceiling does not move with the work: it changes only
  in a commit of its own, with its reason in record 0004. `bun run
check:floor` enforces both, and `CONSTRAINTS.md` at the repository root says
  where the numbers come from.
- Every production bundle is also checked for development text: it fails
  when it calls `console.warn`, which only a development-only report may
  use, or holds a code listed in `developmentOnly.json`. A development-only
  check is written in the guard form of `CONSTRAINTS.md`, which a production
  bundler removes; `productionBundle.test.ts` bundles that form on a fixture
  for production and for development.
- `runSize.test.ts` tests the checks without a build.
- `test-results/size/size.json` (ignored by Git) holds the last measurement.

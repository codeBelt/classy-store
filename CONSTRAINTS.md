# Constraints

The quality bar for `@codebelt/classy-store`. Written on 2026-11-18, at the end
of stage 1 of the pre-1.0 review, from what was measured that day. On
2026-11-19 the owner handed the decisions of that review, the decision records
included, to the agent that runs it; merging into `main` and releasing stay
the owner's.

Read this before changing code. When a check fails, the code is fixed. A rule
here is loosened or removed only together with a line in a decision record
under `docs/decisions/`, in the same commit; `bun run check:floor` blocks the
change otherwise. Tightening a rule needs nothing.

## Floor

Checked by `bun run check:floor`, in CI and before each push. It judges every
commit from the merge base with `origin/main` to the head against the commit
before it, and last the working tree against the head. While `main` does not
hold this file, it starts at the commit that added it, because the commits
before it were made with no bar. The branch is kept linear: a merge commit in
that range fails.

- No new comment that silences a checker: `@ts-ignore`, `@ts-nocheck`, `biome-ignore`, `eslint-disable`, or a comment that hides code from coverage or from the mutation run.
- No new `@ts-expect-error` or `as any` in library source. A test may use `@ts-expect-error` where the type error is what it tests.
- No unfinished work: a "not implemented" throw, an empty `catch`, or a `TODO` or `FIXME` in code.
- No skipped or focused test: `skip`, `todo`, `only`. A skip that states a condition and a reason is allowed, like the one browser test that needs Chromium's clipboard.
- No deleted test file, and no test file left with fewer assertions, unless the commit message has a line `Test-change: <path>: <reason>` for that file, and the reason names a decision or the test of public behaviour that covers the same fact.
- No rule in this file removed or loosened without a line in a decision record in the same commit.
- No change to a bar file without a line in a decision record in the same commit. The bar files hold a part of the bar that nothing else checks: `scripts/floor-guard.mjs`, `packages/classy-store/bunfig.toml` and `packages/classy-store/tests/mutation/runMutation.ts`.
- No size budget or cost limit that rises without a line in record 0004 in the same commit. A ceiling in `budgets.json` changes only in a commit of its own, which holds the new number and its line in record 0004 and nothing else.
- A development-only check reads `process.env.NODE_ENV` inline at its call site, after a cheap test that is almost always false and behind `typeof process !== 'undefined'`, never in a helper or a module constant, and reports with `console.warn`, which nothing else in the library calls. Two checks hold it, not the guard: `bun run size` fails when a production bundle holds `console.warn` or a code listed in `packages/classy-store/tests/size/developmentOnly.json`, and `packages/classy-store/tests/size/productionBundle.test.ts` bundles the form for production and for development.

## Enforced with numbers

| Dimension                    | Rule                                                                                                                                       | Checked by                               | Runs                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| Lint                         | No error from `biome.json`                                                                                                                 | `bun run lint`                           | CI                                         |
| Types                        | No type error in the package, its harnesses, the examples or the docs site                                                                 | `bun run typecheck`                      | CI                                         |
| Tests                        | No failing test                                                                                                                            | `bun run test:coverage`                  | CI                                         |
| Line coverage                | At least 100% of lines in every source file                                                                                                | `bun run test:coverage`                  | CI                                         |
| Function coverage            | At least 100% of functions in every source file                                                                                            | `bun run test:coverage`                  | CI                                         |
| Mutation                     | At most 0 unexplained surviving mutants in the target files                                                                                | `bun run test:mutation`                  | Before a commit that touches a target file |
| Size of each entry           | The main entry within its budget, every other entry adding no more than its budget, every budget within its ceiling, all in `budgets.json` | `bun run size`                           | CI                                         |
| Read cost on Bun             | At most 20 times a forwarding Proxy                                                                                                        | `bun run benchmark:core --check`         | Before a commit to library source          |
| Write cost on Bun            | At most 3.2 times a forwarding Proxy                                                                                                       | `bun run benchmark:core --check`         | Before a commit to library source          |
| Cached getter cost on Bun    | At most 41 times a forwarding Proxy read                                                                                                   | `bun run benchmark:core --check`         | Before a commit to library source          |
| Cached snapshot cost on Bun  | At most 10 times a forwarding Proxy read                                                                                                   | `bun run benchmark:core --check`         | Before a commit to library source          |
| Read cost on Node            | At most 2.5 times a forwarding Proxy                                                                                                       | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Write cost on Node           | At most 1.7 times a forwarding Proxy                                                                                                       | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Cached getter cost on Node   | At most 5.3 times a forwarding Proxy read                                                                                                  | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Cached snapshot cost on Node | At most 1.8 times a forwarding Proxy read                                                                                                  | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Package shape                | No problem from publint in strict mode or from arethetypeswrong                                                                            | `bun run check:package`                  | CI                                         |
| Browsers and frameworks      | No failure in the browser, React, Vue, Svelte, Angular, Solid and Next.js suites                                                           | The workflows under `.github/workflows/` | CI                                         |

The budgets and their ceilings are only in
`packages/classy-store/tests/size/budgets.json`, so that a budget that moves
changes one file. The cost limits are in
`packages/classy-store/tests/benchmark/limits.json` and are repeated above.
The commands read those files; this table is the record of why.

### Where the numbers come from

- **Coverage.** Every source file was at 100% of lines and functions when this
  was written, and Bun applies the threshold to each file on its own. Bun
  reports no branch coverage, so the mutation run stands in for it: a
  condition that can be forced one way with no test failing is an untested
  branch.
- **Mutation.** The seven target files are named in
  `packages/classy-store/tests/mutation/runMutation.ts`. Every surviving
  mutant there is either caught by a test or listed with a labelled reason.
  The run takes about ten minutes, so it is not in CI.
- **Size.** Each budget started as the size measured at the end of stage 1,
  rounded up by two to three percent: room for a fix of a few lines, not for
  a feature. The main entry measured 3,661 bytes. Every other entry is
  measured together with the main one and held to what it adds. Record 0004
  sets a ceiling for each entry, once, for the changes decided for 1.0. A
  commit that grows an entry sets its budget to the new measured size plus 2%
  and adds a line with the measured size to record 0004; no budget passes its
  ceiling.
- **Cost.** Each limit is the highest of five baseline runs times 1.2. A cost
  is a ratio to a Proxy that only forwards, timed in the same process, so it
  holds on another machine. The limits differ by engine because a forwarding
  Proxy costs about 2 nanoseconds on Bun and about 22 on Node.

## Measured, not enforced

| Metric                       | Today                                                   | Direction                                                                                                        |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Per-operation timings        | `packages/classy-store/tests/benchmark/baseline.json`   | Compared at every stage 4 commit. A difference outside the spread of the baseline runs is reported with numbers. |
| React commit timings         | `packages/classy-store/tests/performance/baseline.json` | The same.                                                                                                        |
| React memory retention       | `packages/classy-store/tests/memory/baseline.json`      | Must not grow. The harness fails on its own when cleanup leaves anything behind.                                 |
| Lint warnings                | 4                                                       | Must not grow.                                                                                                   |
| Mutants listed as unkillable | 78                                                      | Each needs a labelled reason, which the runner enforces. The 25 that mark dead code should go down.              |

## Exceptions

None.

| ID  | Rule | Path | Reason | Owner | Expires |
| --- | ---- | ---- | ------ | ----- | ------- |

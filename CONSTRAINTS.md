# Constraints

The quality bar for `@codebelt/classy-store`. Written on 2026-11-18, at the end
of stage 1 of the pre-1.0 review, from what was measured that day. The owner
has not reviewed it yet.

Read this before changing code. When a check fails, the code is fixed. A rule
here is loosened or removed only together with a decision record under
`docs/decisions/` that the owner approved; `bun run check:floor` blocks the
change otherwise. Tightening a rule needs nothing.

## Floor

Checked on every change by `bun run check:floor`. It reads the diff since this
file was added, or since `origin/main` once that branch contains this file.

- No new comment that silences a checker: `@ts-ignore`, `@ts-nocheck`, `biome-ignore`, `eslint-disable`, or a comment that hides code from coverage or from the mutation run.
- No new `@ts-expect-error` or `as any` in library source. A test may use `@ts-expect-error` where the type error is what it tests.
- No unfinished work: a "not implemented" throw, an empty `catch`, or a `TODO` or `FIXME` in code.
- No skipped or focused test: `skip`, `todo`, `only`. A skip that states a condition and a reason is allowed, like the one browser test that needs Chromium's clipboard.
- No deleted test file, and no test file left with fewer assertions.
- No rule in this file removed or loosened without a decision record.

## Enforced with numbers

| Dimension                    | Rule                                                                             | Checked by                               | Runs                                       |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Lint                         | No error from `biome.json`                                                       | `bun run lint`                           | CI                                         |
| Types                        | No type error in the package, its harnesses, the examples or the docs site       | `bun run typecheck`                      | CI                                         |
| Tests                        | No failing test                                                                  | `bun run test:coverage`                  | CI                                         |
| Line coverage                | At least 100% of lines in every source file                                      | `bun run test:coverage`                  | CI                                         |
| Function coverage            | At least 100% of functions in every source file                                  | `bun run test:coverage`                  | CI                                         |
| Mutation                     | At most 0 unexplained surviving mutants in the target files                      | `bun run test:mutation`                  | Before a commit that touches a target file |
| Size of the main entry       | At most 3750 bytes gzipped                                                       | `bun run size`                           | CI                                         |
| Size added by utils          | At most 2750 bytes gzipped                                                       | `bun run size`                           | CI                                         |
| Size added by collections    | At most 750 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Size added by react          | At most 1700 bytes gzipped                                                       | `bun run size`                           | CI                                         |
| Size added by react/server   | At most 175 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Size added by vue            | At most 300 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Size added by svelte         | At most 200 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Size added by angular        | At most 300 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Size added by solid          | At most 335 bytes gzipped                                                        | `bun run size`                           | CI                                         |
| Read cost on Bun             | At most 20 times a forwarding Proxy                                              | `bun run benchmark:core --check`         | Before a commit to library source          |
| Write cost on Bun            | At most 3.2 times a forwarding Proxy                                             | `bun run benchmark:core --check`         | Before a commit to library source          |
| Cached getter cost on Bun    | At most 41 times a forwarding Proxy read                                         | `bun run benchmark:core --check`         | Before a commit to library source          |
| Cached snapshot cost on Bun  | At most 10 times a forwarding Proxy read                                         | `bun run benchmark:core --check`         | Before a commit to library source          |
| Read cost on Node            | At most 2.5 times a forwarding Proxy                                             | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Write cost on Node           | At most 1.7 times a forwarding Proxy                                             | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Cached getter cost on Node   | At most 5.3 times a forwarding Proxy read                                        | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Cached snapshot cost on Node | At most 1.8 times a forwarding Proxy read                                        | `bun run benchmark:core:node --check`    | Before a commit to library source          |
| Package shape                | No problem from publint in strict mode or from arethetypeswrong                  | `bun run check:package`                  | CI                                         |
| Browsers and frameworks      | No failure in the browser, React, Vue, Svelte, Angular, Solid and Next.js suites | The workflows under `.github/workflows/` | CI                                         |

The size numbers live in `packages/classy-store/tests/size/budgets.json` and
the cost limits in `packages/classy-store/tests/benchmark/limits.json`. Those
files are what the commands read; this table is the record of why.

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
- **Size.** Each budget is the size measured at the end of stage 1, rounded up
  by two to three percent: room for a fix of a few lines, not for a feature.
  The main entry measured 3,661 bytes. Every other entry is measured together
  with the main one and held to what it adds.
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

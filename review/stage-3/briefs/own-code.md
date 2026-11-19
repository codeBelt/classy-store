# Brief: review our own core, independently of other libraries

- **Report:** `review/stage-3/own-code.md`
- **Scratch folder:** `<scratch>/stage-3-own-code/`
- **Skill to load first:** `mattpocock-skills:codebase-design`
- **Spikes:** deletions only, in a throwaway worktree (see the common brief).

## The job

Stage 3 step 2 in `REVIEW_PLAN.md`. Every function in these three files must
have a stated reason to exist:

- `packages/classy-store/src/core/core.ts` (611 lines)
- `packages/classy-store/src/core/ownership.ts` (170 lines)
- `packages/classy-store/src/snapshot/snapshot.ts` (311 lines)

Read `core/core.types.ts`, `storeRuntime.ts`, `types.ts` and
`utils/internal/internal.ts` as far as those three need them.

**Stay independent of the library comparison.** Do not read
`review/stage-2/` or `review/stage-2-report.md` until your own list is
written into the report. Of the common brief's reading list, skip item 4
until then. Afterwards, read `review/stage-2-report.md` only, and add one
short section that says where your list and it agree, and what each has that
the other lacks.

## Method

1. For every function, and every branch that handles a special case, write one
   line: why it exists and which behaviour needs it.
2. Check that claim. In the worktree, delete or stub the code and run
   `bun run test`. Record which tests fail. Code whose removal fails no test
   is either dead or untested: say which, with a small script that shows the
   difference if there is one.
3. Use the mutation results as a map. The files
   `packages/classy-store/tests/mutation/equivalent/core.json`,
   `ownership.json` and `snapshot.json` list the mutants no test can detect,
   each with a labelled reason. `Unreachable:` and `No effect:` mark code that
   may be dead or redundant. Stage 1 findings 54, 59, 64, 72 and 73 are where
   stage 1 already saw this.
4. Flag duplicated logic (the same rule written in two places), names that no
   longer match what the code does, comments that are wrong, and state that is
   kept in two places and has to be kept in step.
5. Draw the module boundaries as they are: what `core.ts` knows about
   `ownership.ts` and `snapshot.ts`, and the reverse. Say where a boundary
   leaks.

## What the report holds

- A table per file: function, lines, reason to exist, what fails without it.
- A list of code that can be deleted with no test failing, each with the
  patch, the line count and whether it is dead or only untested.
- Duplicated logic, misleading names and leaking boundaries, each with
  `file:line` and a proposal.
- The three or four places where the code is hardest to reason about, and
  what makes them so. The plan names two candidates: suspend and resume in
  `ownership.ts`, and the three kinds of getter dependency in `core.ts`.
  Confirm or correct that from the code.
- A total: how many lines the three files could lose with behaviour unchanged.

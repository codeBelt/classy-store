# Brief: the task list for stage 4

- **You write:** `review/stage-4-tasks.md`, and nothing else.
- **Scratch folder:** `<scratch>/stage-3-step7-tasks/`

Stage 4 implements the decisions, one change per commit, test first. Your
document is the ordered list of those commits. One agent will work through
it from top to bottom, so each task has to be doable with only the tasks
above it done.

## Read as well

- "The order for stage 4" in the decision document. It is the order; you
  refine it into tasks and may not reorder steps. If you find that a step
  cannot be done at its place, say so under "Open points" instead of moving
  it.
- For each decision, the "Cost for stage 4" and the test lists in the report
  it cites, and the patch in that report's appendix. The patch shows the
  size of the change; stage 4 writes the change again and does not apply
  the patch.
- `review/stage-3/merged.md`, section on dependencies.
- `REVIEW_PLAN.md`, the section "Stage 4".

## The document

1. **How to use this list**: ten lines at most. One task is one commit. The
   loop for each task: write the failing tests, make them pass, run
   `bun run checkall`, `bun run test:coverage`, `bun run size` and
   `bun run check:floor`, update the docs the task names, commit. Run the
   mutation run and both core benchmarks at each checkpoint.
2. **The tasks**, numbered in order, grouped under the twelve steps of the
   order. Each task:

   ```markdown
   ### T-NN. Short title in the imperative

   - **Decision:** the number or numbers.
   - **What:** two or three sentences.
   - **Tests first:** the cases to write, as a list. Name the test file each
     goes in, by the naming the repository uses.
   - **Tests that change:** the count and kind the report gives (fix,
     incidental), and the files.
   - **Done when:** up to three conditions a command can check.
   - **Files:** the source files touched.
   - **Size:** the bytes the report measured, and the entry.
   - **Docs:** the pages and sentences that change with it.
   - **Depends on:** task numbers.
   - **Risk:** low, medium or high, and the one thing most likely to go
     wrong.
   ```

   A task touches about five files at most. Where a decision is larger, split
   it into tasks that each leave the suite passing.
3. **Checkpoints** after each of the twelve steps: the full suite, the
   typecheck, coverage, size against the ceilings, the mutation run on the
   files the step touched, both core benchmarks against the limits, and the
   browser and framework suites where the step touched an adapter.
4. **What may run in parallel**, if anything: only tasks that touch disjoint
   files and do not depend on each other. The default is one writer.
5. **Risks**: a table of the five to ten largest, with what stage 4 does
   about each. Take them from the "not run" and "not verified" notes of the
   decision document.
6. **Open points**: anything the decision document leaves unclear for the
   person doing the work.

## What to watch

- The first task is tooling only (decision 4): the ceilings in
  `budgets.json`, the size script, the floor guard. Read
  `packages/classy-store/tests/size/` and `scripts/floor-guard.mjs` and say
  exactly what changes and how it is tested.
- A task with a timing condition names the metrics it times, by their exact
  names, and the command: `bun run benchmark:core --only <names>` and
  `bun run benchmark:core:node --only <names>`. A run of a few metrics takes
  seconds; the full benchmark runs at each checkpoint.
- Dead code is removed in the commit that makes it dead (decision 20). For
  each task, name the code it makes dead, from `own-code.md` and the
  reports.
- A task that adds an error or a logged report adds its code in the same
  commit (decision 35).
- Every "before 1.0" decision must be covered by a task. End the document
  with a table: decision, tasks. A decision with stage 4 "no" or "docs" is
  listed with that word.

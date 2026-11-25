# Common brief for every stage 3 agent

You are a helper agent for stage 3 (design review) of the pre-1.0 review of
`@codebelt/classy-store`, a class-based reactive store: a plain class wrapped
in a Proxy, consumers read frozen snapshots with structural sharing, and class
getters are memoized. The orchestrating agent is the only writer in the
repository at `<repo>` (branch
`release/1.0`).

Stage 3 ends in one decision document that the owner approves item by item
before anything is implemented. Your report is evidence for that document.
The library has one user, so breaking changes are allowed before 1.0; after
1.0 the public API is frozen.

**Paths.** In these briefs and in every report, `<repo>` is the repository
root and `<scratch>` is the agent scratchpad, a folder outside the repository
that does not survive a reboot. The prompt that starts you gives both as real
paths. Write the placeholders in your report, never the real paths: the
branch is public, and a real path carries the local account name.

## Read first, in this order

1. `CLAUDE.md` and `CONSTRAINTS.md`.
2. `REVIEW_PLAN.md`: "Starting point", "Ground rules" and "Stage 3".
3. `review/stage-1-report.md`: the summary and "Findings for stage 3". Those
   73 numbered findings are what the library does today. This brief calls
   them "stage 1 finding N".
4. `review/stage-2-report.md`, whole. It is short and says where the eleven
   stage 2 reports agree and disagree.
5. `review/stage-3/merged.md`, if your brief does not say otherwise: its
   index, the entries under the headings your subject falls in, and its
   "Contradictions between reports", "Dependencies between entries" and
   "Proposals I think are wrong" sections. It merges the eleven stage 2
   reports into 77 entries (`M1` to `M77`). Cite an entry by its id.
6. The first-wave reports of stage 3, where your subject touches theirs. Read
   each one's summary and recommendation sections; their appendices hold
   patches you can apply with `git apply` to a worktree at `57404c3`.
   - `review/stage-3/own-code.md`: a reason for every function in `core.ts`,
     `ownership.ts` and `snapshot.ts`, checked by 101 deletions. Its main
     result: the walk to a detached parent can go (`x2`), suspension itself
     should stay (`x1`).
   - `review/stage-3/spike-traps.md`: stored functions, raw values on write,
     `defineProperty` as a write, `has` and `ownKeys`, deletes, two guards.
   - `review/stage-3/spike-getters.md`: one kind of getter dependency, the
     stamp, errors, the snapshot layer.
   - `review/stage-3/spike-delivery.md`: one delivery queue, a setter as a
     transaction, `batch()` and promises.
7. The stage 2 reports and source files your own brief names.

## How to work

1. **Scratch folder.** Your own brief names it. Other agents share the
   scratchpad, so write only inside your folder. You may read other folders
   there; stage 2 agents left their sketches and scripts in
   `<scratch>/stage-2-<name>/`.
2. **The report.** Your own brief names it, under `review/stage-3/` in the
   repository. It is the only file you may create or change in the repository.
   Create it in your first few steps and keep it up to date as you go: usage
   limits can cut you off at any time, and what is not in the file is lost.
   Format it with `./node_modules/.bin/biome check --write <the report>` from
   the repository root before you finish, because the repository's lint checks
   Markdown. Do not commit: the orchestrating agent commits reports.
3. **No sub-agents.** Do the work yourself.
4. **You cannot ask the user anything.** If you are blocked, write what
   blocked you in the report and stop.

## If your brief asks for spikes

A spike is throwaway code that answers a question. It is never committed to
any branch. Stage 4 writes an approved change again, test first.

1. **Make one throwaway worktree** inside your scratch folder:

   ```bash
   git -C <repo> worktree add --detach <your scratch folder>/wt release/1.0
   cd <your scratch folder>/wt && bun install --frozen-lockfile
   ```

   If `<your scratch folder>/wt` already exists, a previous agent on this task
   was cut off: reuse it, and look for patches it saved.
2. **Git safety.** The main checkout holds other agents' uncommitted reports.
   Never run `git clean`, `git stash`, `git reset`, `git checkout` or
   `git restore` there, and never commit or push anywhere. To return your
   worktree to a clean state between spikes, save the patch first, then run
   `git -C <your scratch folder>/wt checkout -- .` and delete by name any file
   the spike added.
3. **Save every spike as a patch** before you reset:
   `git -C <your scratch folder>/wt diff > <your scratch folder>/patches/<spike>.patch`.
   Put each patch in the report's appendix too, because the scratchpad does
   not survive a reboot.
4. **Measure each spike against the unmodified worktree**, with these commands
   run from the worktree root:
   - `bun run test`: the unit suite, 1,341 tests at the baseline. For every
     test a spike makes fail, give the file, the test name and one of three
     classes: **fixes** (the test pins the defect the spike removes, so it is
     expected to flip), **incidental** (the test pins behaviour nobody
     promised, and the decision document must say whether it may change), or
     **regression** (the spike is wrong or incomplete).
   - `bun run --filter @codebelt/classy-store typecheck`.
   - `bun run size`: bytes per entry against the budgets in `CONSTRAINTS.md`.
     Report the bytes even when a budget fails; stage 3 may propose a new
     number.
   - `bun run benchmark:core` and `bun run benchmark:core:node`: the ratios to
     a forwarding Proxy. Other agents are running on this machine, so run the
     unmodified worktree and the spike back to back, give both, and treat a
     difference inside the spread as none.
   - The reproduction of each stage 1 or stage 2 finding the spike is meant to
     fix, before and after.
     Do not run the browser, framework or mutation suites. Say so under "not
     verified".
5. **Run spikes alone first**, then the combination you would recommend, with
   the same measures.
6. **What the first wave learned the hard way:**
   - In a fresh worktree the typecheck fails until `bun run build` has run
     once.
   - The built entry loads its runtime through the package import
     `#store-runtime`. A copy of `dist` saved for a later benchmark needs its
     own `package.json` beside it, or it loads the worktree's current build
     and you time the wrong code.
   - Never stop a process by name (`pkill`, `killall`): other agents run the
     same benchmark. Stop your own by its process id.
   - Never run `git stash` in a worktree: the stash list is shared with the
     main checkout.
   - The main entry measures 3,661 bytes against a budget of 3,750. Every
     first-wave combination goes over it. Report your bytes; the decision
     document sets one new budget for the whole set.

## The report

Write for the owner, who decides. Plain English, short sentences, concrete
numbers. One entry per spike or per item, each with:

- **Question** it answers, and the stage 1 and stage 2 findings behind it.
- **What was changed**, with files and the count of lines added and removed.
- **Result**: tests by class, typecheck, size, timings, reproductions.
- **What it breaks or changes for a user**, if anything.
- **Recommendation**: do it, do a variant, or do not, with the reason. Add a
  label: **Before 1.0** if it changes the public API or documented behaviour,
  **Can follow 1.0** if it could ship in a 1.x release without breaking a
  consumer.
- **Cost for stage 4**: files, tests to write, risk, and any number in
  `CONSTRAINTS.md` it would move.

End with "Verified and not verified": what you ran, what you only read, what
is reasoning. A claim needs a test, a reproduction or a measurement behind it.

Be selective. The reader needs what decides a question, not everything you
saw. Usage is limited, so read what your brief names, not the whole
repository.

## Final message to the orchestrating agent

Keep it brief: the path of the report, your three most important results, and
anything you could not do.

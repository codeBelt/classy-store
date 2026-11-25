# Common brief for the three fixers of stage 3, step 7

The spec `review/spec.md`, the decision records under `docs/decisions/` and
the stage 4 task list `review/stage-4-tasks.md` were written from
`review/stage-3-decisions.md` (the "decision document") and then checked
against it by four read-only agents. Their reports are
`review/stage-3/check-spec-api.md`, `check-spec-rules.md`,
`check-records.md` and `check-tasks.md`. After the checks, the
orchestrating agent settled every open point in the decision document: read
its section "Settled when the step 7 documents were checked" and every entry
that section names. You correct one of the three documents so that it
agrees with the decision document as it now stands (commit `944a2f7` or
later on `release/1.0`).

**The decision document wins.** You decide nothing. Where the decision
document, a checker's report and your document disagree, the decision
document as it now stands wins; where a checker's correction is overtaken by
a settled point, the settled point wins. If something is still unclear,
leave the text as it is and list the point in your final message.

**Paths.** `<repo>` is the repository root and `<scratch>` a scratchpad
outside it; your prompt gives both. Never write a real path of this machine
into a file.

## How to work

1. Make a worktree in your own scratch folder, on a branch of its own:

   ```bash
   git -C <repo> worktree add -b <your branch> <your scratch folder>/wt 944a2f7
   ```

   If it exists already, an earlier run was cut off: reuse it and read its
   `git log`. Edit files only inside that worktree. Never edit, commit in or
   push from `<repo>` itself. Do not push at all.
2. Read, in this order: the decision document's status note, its index "All
   decisions on one page", the new section "Settled when the step 7
   documents were checked", and every entry you change text from; then the
   checker reports your prompt names; then your document.
3. Apply every finding of your reports, using the "Correction" text where it
   still agrees with the decision document. Then carry every settled point
   that concerns your document. Then search your document for every term a
   settled point replaced (your prompt lists them) and fix each hit.
4. Commit in the worktree as soon as a part is in a good state, with a
   message that says what was corrected; end each message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. A usage limit
   can stop you at any time, and what is not committed is lost.
5. Format each file you changed with
   `<repo>/node_modules/.bin/biome check --write <file in the worktree>`,
   one file or a list of files, never a folder, and commit the result.
6. No sub-agents. You cannot ask anyone anything.

## Writing

Plain English, short sentences, for a reader whose first language may not
be English. No idioms. Keep each document's own style and section layout.
Copy numbers; never round or recompute one.

## Final message

The branch name, the commits, a count of what you changed, and every point
you could not settle.

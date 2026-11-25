# Common brief for the four checkers of stage 3, step 7

Stage 3 of the pre-1.0 review of `@codebelt/classy-store` has decided what
1.0 is. The decisions are in `review/stage-3-decisions.md` (the "decision
document"): 46 numbered entries, the guarantees of 1.0, the proposals not
taken, and the order for stage 4. Three helper agents turned it into three
documents: the 1.0 spec `review/spec.md`, the decision records under
`docs/decisions/`, and the stage 4 task list `review/stage-4-tasks.md`.
Nobody has checked them. You check one part, against the decision document.

**The decision document wins.** Where the document you check says something
the decision document does not say, says it differently, leaves out
something it says, or gets a number, a signature, a rule, a label or an
order wrong, that is a finding. Where the decision document is itself
unclear or contradicts itself, write it in the section "Unclear in the
decision document" of your report, with both readings; the orchestrating
agent decides.

**Paths.** `<repo>` is the repository root and `<scratch>` is a scratchpad
outside it; the prompt that started you gives both as real paths. Never
write a real path of this machine into a file in the repository.

## Read first

1. `review/stage-3-decisions.md`, all of it. Every entry you check a
   statement against, read in full.
2. `CLAUDE.md` and `CONSTRAINTS.md`.
3. Your own part, named in your prompt.
4. Where a statement is about today's code (a signature that does not
   change, a message text, a file name, a test file, a docs sentence that is
   to change), check it against the source under `packages/classy-store/`
   and the pages under `website/content/docs/`. "0.11" and "today" mean the
   code on this branch now.
5. A report under `review/stage-3/` only when the decision document cites it
   for a figure or a detail you need to confirm.

## What is already known, and not a finding

The writers listed what they could not settle: section 12 of the spec, the
section "Open points" of the task list, and `review/stage-3/step7-open-points.md`.
The orchestrating agent is settling those itself. Do not raise them again,
unless you find that an open point is itself wrong (it misreads the
decision document), or that the document you check already decided it
silently somewhere else.

## Rules

- **Read-only.** The one file you may create is your report, named in your
  prompt, under `review/stage-3/`. Change no other file. Do not commit. Do
  not start sub-agents. You cannot ask anyone anything.
- Create the report in your first few steps and add to it as you go: a
  usage limit can stop you at any time.
- Check every number by finding it in the decision document. A number that
  the decision document does not carry is a finding unless your part says
  where it comes from and that source carries it.
- Be exact and short. A finding that cannot be acted on is noise.
- Format the report with `./node_modules/.bin/biome check --write <your
report>` from the repository root before you finish. Never run it on a
  folder.

## The report

```markdown
# Check of <part> against the decision document

Checked at commit <short hash>. <one line: what was checked, how many findings>

## Findings

### 1. <short statement of the defect>

- **Where:** `<file>:<line>` (and any other lines with the same defect)
- **It says:** <short quote>
- **The decision document says:** <short quote>, decision N, line L of
  `review/stage-3-decisions.md`
- **Kind:** wrong | missing | extra | stale (says what an earlier draft said)
- **Correction:** <the replacement text, ready to paste, or the exact edit>

## Unclear in the decision document

### U1. <the point>

<both readings, where each is supported, and which the checked document took>

## Checked and agrees

<one line per section or entry that you checked and found right, so the
orchestrating agent knows what was covered>
```

## Final message

The path of your report, the number of findings, and the three you rate
most serious.

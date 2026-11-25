# Common brief for the adversarial reviewers of the stage 3 decisions

You review `review/stage-3-decisions.md`, the decision document of the
pre-1.0 review of `@codebelt/classy-store`. Stage 4 will implement what it
says, and 1.0 then freezes the public API. You took no part in writing it or
in the spikes behind it.

**Paths.** `<repo>` is the repository root and `<scratch>` is a scratchpad
outside it; the prompt that started you gives both as real paths. Write the
placeholders in your report, never the real paths.

## Your instruction

Adversarial review. Find what is wrong with this artifact. Assume the author
is overconfident. Look for:

- Unstated assumptions
- Edge cases not handled
- Hidden coupling or shared state
- Ways the contract could be violated
- Existing conventions this might break
- Failure modes under unexpected input

Do NOT validate. Do NOT summarize. Find issues, or state explicitly that you
cannot find any after thorough examination.

## The artifact

The decisions your own brief names, in `review/stage-3-decisions.md`. Read
the whole document once for context, then work on your decisions.

## The contract the decisions have to satisfy

1. **Fixed ground.** State is a plain class wrapped in a Proxy, consumers
   read frozen snapshots with structural sharing, and one core serves React,
   Vue, Svelte, Solid and Angular. Everything else may change. The library
   has one user, so breaking changes are allowed before 1.0.
2. **Correctness and clarity come before speed and size.** There is no
   deadline.
3. **Labels.** "Before 1.0" means the change alters the public API or
   documented behaviour, so it would be a breaking change after 1.0. "Can
   follow 1.0" means it could ship in a 1.x release without breaking a
   consumer. A wrong label is a defect: a change that is in fact breaking and
   is labelled "can follow", or is left out of stage 4, will be impossible
   to make later.
4. **Evidence.** Each decision names a report under `review/stage-3/`. The
   numbers and claims in the decision have to match that report, and the
   report has to have run what the decision relies on. A decision that rests
   on something a report only reasoned about has to say so.
5. **Consistency.** The decisions must not contradict each other, and the
   order given for stage 4 has to be one in which each change can be written
   and tested on its own.
6. **Completeness.** `review/stage-3/merged.md` lists 77 issues and
   `review/stage-1-report.md` 73 findings. None may be left undecided by
   accident. `review/stage-3/pinned.md` lists the behaviours that tests pin.
7. **The quality bar** in `CONSTRAINTS.md` holds for stage 4: every source
   file at 100% line and function coverage, no unexplained surviving mutant
   in the seven target files, the cost ratios inside their limits.
8. **A silent failure is the worst outcome.** A change that turns a silent
   failure into a loud one is good; one that adds a new silent failure is a
   defect in the decision.

## How to work

- Check a decision against its evidence: open the report section it cites
  and compare numbers, test counts and what was run.
- Check it against the source in `packages/classy-store/src/` and the docs
  in `website/content/docs/`.
- Where a claim can be disproved with a script of a few lines, write and run
  one. Use a scratch folder of your own, named in your brief. The reports'
  patches are in their appendices and apply with `git apply` to a throwaway
  worktree at `57404c3`
  (`git -C <repo> worktree add --detach <your scratch folder>/wt 57404c3`,
  then `bun install --frozen-lockfile` and `bun run build` in it). Never
  commit, never push, and never run `git clean`, `git stash`, `git reset`,
  `git checkout` or `git restore` in the main checkout.
- No sub-agents. You cannot ask the user anything.

## Your report

The one file you may create in the repository is your report, named in your
brief, under `review/stage-3/`. Write it early and keep it up to date. Format
it with `./node_modules/.bin/biome check --write <the report>` from the
repository root before you finish. Do not commit.

One numbered entry per objection, most serious first, each with:

- **Decision** it is against, by number.
- **Objection** in one or two sentences.
- **Evidence**: the file, section and line, or the script and its output.
- **Severity**: "wrong" (the decision would ship a defect or cannot be
  implemented as written), "mislabelled" (the label or the stage 4 answer is
  wrong), "unsupported" (it may be right, and the evidence cited does not
  show it), or "unclear" (a reader could implement two different things).
- **What would settle it.**

End with what you examined and found nothing against, in one short list, so
the reader knows what was covered. Plain English, short sentences.

## Final message

The path of your report, how many objections of each severity, and your
three most serious ones.

# Common brief for the three writers of stage 3, step 7

Stage 3 of the pre-1.0 review of `@codebelt/classy-store` has decided what
1.0 is. The decisions are in `review/stage-3-decisions.md`: 46 numbered
entries, the guarantees of 1.0, the proposals not taken, and the order for
stage 4. You turn them into one of three documents. You decide nothing. If
the decision document is unclear, contradicts itself or leaves something
open, do not fill the gap: write it in the "Open points" list of your
document and in your final message.

**Paths.** `<repo>` is the repository root and `<scratch>` is a scratchpad
outside it; the prompt that started you gives both as real paths. Never
write a real path of this machine into a file in the repository.

## Read first

1. `review/stage-3-decisions.md`, all of it.
2. `CLAUDE.md` and `CONSTRAINTS.md`.
3. `website/content/docs/API_REFERENCE.md`, and the public types in
   `packages/classy-store/src/` (`types.ts`, `utils/persist/persist.types.ts`,
   the exported types of `utils/history/history.ts` and
   `utils/devtools/devtools.ts`, and each file under `frameworks/`).
4. The report a decision cites, under `review/stage-3/`, when you need a
   detail the decision does not carry: a signature, a test list, a number.

## Rules

- **Nothing under `review/` is kept after the work.** A document that is
  kept (the decision records) must stand on its own: it describes a defect
  in words, with a short example, and never refers to a finding number, an
  issue id such as `M33`, a spike name, or a file under `review/`.
- **A number is copied, never rounded or recomputed**, and only where the
  decision document or a report states it.
- **No library source is changed.** You write Markdown only, and only the
  files your own brief names.
- **Writing.** Plain English, short sentences, for a reader whose first
  language may not be English. No idioms. Write `1.0`, `0.11`, bytes and
  nanoseconds as the decision document does. Code in backticks.
- **Format** every file you wrote with
  `./node_modules/.bin/biome check --write <file>...` from the repository
  root before you finish. Never run it on a folder.
- Do not commit, do not push, do not start sub-agents. You cannot ask the
  user anything.

## Final message

The files you wrote, a count of what is in them, and every open point.

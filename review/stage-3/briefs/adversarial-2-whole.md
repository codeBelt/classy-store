# Second adversarial brief: delivery, utilities, adapters, and the whole

- **Report:** `review/stage-3/adversarial-2-whole.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-2-whole/`

**Your decisions:** 4, 13 to 28, 31 to 42, guarantee rules 1, 3, 9, 10, 11
and 12, the index "All decisions on one page", "Where this differs from
`pinned.md`", "Proposed in a report and not taken", "Every merged issue,
and where it is decided", "The order for stage 4", and "Objections and
answers" as a whole.

**Evidence:** `spike-delivery.md`, `persist-devtools.md`, `devbuild.md`,
`adapters-collections.md`, `spike-combos.md` (K2 and K3), `merged.md`,
`review/stage-1-report.md`, `CONSTRAINTS.md`, `.github/workflows/`,
`packages/classy-store/tests/` for the size and floor scripts.

**First-round objections to check:** every one in `adversarial-edges.md`,
and 2 to 7, 10 to 12 and 14 to 17 of `adversarial-whole.md`.

Look hardest at these:

- **The index against the entries.** For each of the 46 rows, does the kind,
  the label and the stage 4 answer match the entry? Does every entry labelled
  "can follow 1.0" leave the documented behaviour as it is?
- **Decision 4, the sizes.** Add up the main entry's table yourself from the
  reports. Do the ceilings hold the sum, with the entries decided again in
  this round counted in? Is each row's figure the one its report measured?
  Is the tooling the first commit needs described well enough to write it
  and its test?
- **The order for stage 4.** Walk it step by step. At each step, can the
  change be written test first and pass the quality bar (100% coverage, no
  unexplained mutant, the size and cost limits) with only the steps before
  it done? Name any step that needs a later one.
- **Decision 27, `devtools`.** After the rewrite: how does the method name
  reach `devtools`, what does a method call cost a user who never calls
  `devtools()`, and what does the extension receive for computed values?
  Check each against `spike-combos.md`.
- **Decisions 19 to 26, `persist`.** Read the rules as a user who stores a
  record, upgrades the app, and opens two tabs. Is there an input for which
  the document does not say what happens, or says two things?
- **Decisions 13 to 16, delivery.** A subscriber that writes, throws,
  unsubscribes itself or another, or subscribes a new one, on each channel.
  Do the guarantee rules say what happens in each case, and does
  `spike-delivery.md` show it?
- **Decisions 37 to 42, the adapters and collections.** For each adapter,
  what does a component see between a write and the next render, and on the
  server?
- **Completeness.** Is every one of the 77 merged issues and the 73 stage 1
  findings still decided after the rewrite? Did the rewrite drop one?

# Adversarial brief: the document as a whole

- **Report:** `review/stage-3/adversarial-whole.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-whole/`

**Your subject:** not single decisions but what holds them together.
Decisions 4, 20, 32 to 36, the index "All decisions on one page", "Proposed
in a report and not taken", "Every merged issue, and where it is decided",
and "The order for stage 4".

**Evidence:** `review/stage-3/merged.md` (its index, contradictions,
dependencies and doubts), `devbuild.md`, every report's summary table,
`review/stage-1-report.md` (the 73 findings), `review/stage-2/security.md`
finding 12, `CONSTRAINTS.md`, `.github/workflows/`.

Look hardest at these:

- **Labels.** Go through every decision labelled "Can follow 1.0" or with
  stage 4 "No". Is any of them a change to the public API or to documented
  behaviour, checked against `website/content/docs/API_REFERENCE.md` and the
  guides? Go through "not taken" the same way: does leaving any of them out
  of 1.0 close a door, because doing it later would break a consumer?
- **Completeness.** Is every one of the 77 merged issues and the 73 stage 1
  findings decided, on purpose? List any that is not.
- **The size ceilings of decision 4.** Do the figures match the reports? Is
  a ceiling 28% above today's size consistent with the contract? What is in
  the set that buys little for its bytes?
- **Decision 36** drops every warning from 1.0. The two silent failures the
  plan names are a write in an arrow-function method and a write after an
  `await`. After all 46 decisions, which silent failures does a user of 1.0
  still meet with nothing to tell them?
- **Decision 32** changes a release workflow that nobody can run before the
  release. Read `.github/workflows/release.yml` and say what can go wrong
  with the split on the first publish, and whether it should wait.
- **The order for stage 4.** Find a pair of changes whose order is wrong, or
  a change that cannot be tested alone at its place in the order, using the
  dependencies in `merged.md` and the "which spikes conflict" sections of
  the reports.
- **Contradictions inside the document.** Two entries that cannot both be
  true, a number that differs between entries, a decision that the
  guarantee rules contradict.

# Brief: merge the stage 2 reports

- **Report:** `review/stage-3/merged.md`
- **Scratch folder:** `<scratch>/stage-3-merge/`
- **Skill to load first:** `api-and-interface-design`
- **Spikes:** none. This is reading and organising. Run code only where a
  script of a few lines settles a contradiction between two reports.

## The job

Stage 3 step 1 in `REVIEW_PLAN.md`: merge the eleven stage 2 reports under
`review/stage-2/` with the 73 stage 1 findings, and remove duplicates. Several
fixes are proposed three or four times in different words. The orchestrating
agent writes the decision document from your list, so it has to be complete
and it has to be short enough to read in one sitting.

Read the findings of all eleven reports: `valtio.md`, `mobx.md`,
`vue-reactivity.md`, `solid.md`, `svelte.md`, `signals.md`, `immer.md`,
`legend-state.md`, `zustand-jotai.md`, `adapters.md`, `security.md`. Skip
their appendices unless you need one script.

## What the report holds

1. **One entry per distinct issue.** Give each an id (`M1`, `M2`, ...) and
   group the entries under these headings: proxy traps and identity;
   ownership and memory; getters; subscriber delivery and transactions;
   snapshots; collections; types; `persist`; `devtools`; `history` and
   `subscribeKey`; adapters; diagnostics and a development build; security and
   the release workflow; documentation only. Each entry has:
   - the problem in one or two sentences, with the stage 1 finding numbers;
   - every report that addresses it, by report and finding id;
   - the distinct proposals after removing duplicates, and where two
     proposals conflict;
   - what evidence exists: a sketch and where its diff is, a reproduction, a
     measurement, or reasoning only;
   - kind: bug, simplification, performance, API design, diagnostics, docs;
   - whether it changes the public API or documented behaviour. Check
     `website/content/docs/API_REFERENCE.md` before you answer. This becomes
     the label "Before 1.0" or "Can follow 1.0" later, so say what you
     checked.
2. **A table of all 73 stage 1 findings**, each mapped to its entry or marked
   "no stage 2 counterpart". No finding may be missing.
3. **A table of every stage 2 finding** (by report and id), each mapped to its
   entry, so nothing a report found is lost.
4. **Contradictions between reports**, each with what would settle it. The
   stage 2 report lists the ones already known; look for more.
5. **Dependencies between entries**: which change has to be decided or made
   before another. For example the `has` and `ownKeys` traps cannot be
   separated from how snapshot getters are installed.
6. **Proposals you think are wrong or not worth their cost**, with the reason.
   You are the first reader with all eleven reports in view at once.

Do not make the decisions. Where reports disagree, set out both sides.

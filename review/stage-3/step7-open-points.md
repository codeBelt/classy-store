# Step 7: what the three writers left open

The spec, the decision records and the stage 4 task list were each written
by a helper agent from `review/stage-3-decisions.md`. A writer decides
nothing: where the decision document did not give it enough, it wrote the
point down. This file holds those points as each writer reported them. None
has been settled yet, and none of the three documents has been checked
against the decision document.

## The decision records, `docs/decisions/`

46 records and `README.md`, written from the decision document at `c332e5e`.

1. **The heading in 0004.** The brief asks for a section titled "Measured in
   stage 4", and also forbids naming the review's stages. The title was kept
   as asked. It is the only stage name in the records.
2. **The kind "docs" for 0034.** The record template has no such kind; the
   decision document uses it. The record uses "docs", and the README lists
   it.
3. **The field "Changes behaviour that 0.11 documents".** "Yes" where the
   decision document names a documented sentence: 2, 7, 10, 16, 21, 23, 24,
   28, 30, 37, 38, 42, 43, 44. "Yes" also for 29 (the sentence is in the
   history tutorial) and 45 (public types). "No" for the rest, by the
   writer's judgement. Records 1, 5, 6, 8, 9, 13, 15, 19 and 22 are labelled
   "before 1.0" and have no documented sentence the writer could find; 19,
   the timing of the restore, is the least certain.
4. **The naming of `devtools` entries in 0004 and 0027.** Decision 4's row in
   the main-entry table still read "the slot through which `devtools` names a
   method", while decision 27 takes the "hook" form and drops the "slot"
   form. The record 0004 says "hook". In 0027 the 20 bytes belong to the
   first form and 40 to the slot form, both taken from `spike-combos.md`.
5. **No reason is given for decision 18.** The record takes its reason from
   what decision 36 says about warnings that fire for correct code.
6. **Decisions that name no alternative:** 8, 15, 19, 23, 28, 33, 34 and 37.
   Those records say that none was proposed. In 0016 the writer added "the
   type alone" as an alternative, from the decision's own reasoning.
7. **Proposals tied to no decision.** "Array methods run on the raw array"
   is in 0006. "A Proxy target of the library's own" and "a guard for a raw
   object frozen behind the store" are in 0009.
8. **Where the cost of the lost-write check is recorded.** Decision 36 says
   "the decision record" without naming one. The writer added an empty table
   to 0036; 0004 is the other candidate.
9. **The approval sentence in 0004.** It says that the owner delegated these
   decisions on 2026-11-19, except merging into `main` and releasing. The
   delegation itself is in the plan, which is not kept, so the record cannot
   point to it.
10. **The later documentation pass.** Decisions 4 and 34 point to stage 5.
    The records say "when the work ends" and "a later documentation pass",
    without saying whether that is before the release.
11. **The label of 0046.** The brief counts decision 46 as "no change"; its
    label in the decision document is "can follow 1.0". The README keeps
    that label.
12. **Figures left out or taken from a report.** "26 tests change against 28
    on that base" is left out of 0001, because it cannot be read without the
    base. The call counts in 0017 are from `spike-delivery.md`. The 40 bytes
    in 0027 are from `spike-combos.md`.
13. **What "0.11" means.** The records write "0.11" wherever the decision
    document says "today", taking the code on `release/1.0` before the 1.0
    changes to be 0.11.

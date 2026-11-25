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

## The spec, `review/spec.md`

1,958 lines, written from the decision document at `c332e5e`: 43 exports
across the nine entry points, 173 numbered rules, the rule for functions
with a table of 59 cases, the 12 guarantees split into 67 statements, 11
unspecified items, 15 error codes and 18 done conditions. The writer
compiled the signatures with the package's own TypeScript.

Its 38 open points are in the spec itself, section 12, in two groups. They
are not repeated here.

- **A, 1 to 14: unclear in the decision document.** These need a decision
  before stage 4 starts. The ones that block a step:
  - Eleven of the 15 error codes are names the writer proposed, because the
    decision document decides that the errors exist and does not name them.
    Codes are stable from 1.0, and step 2 of the order creates the page of
    codes, so the names have to be settled first (points 1 to 3).
  - What a `persist` report carries when the error is not the library's
    own, and whether `save()` before the first read is reported as well as
    rejected (point 4).
  - The names of the two collection snapshot types (point 5).
  - Guarantee 3 and the unspecified item "which microtask a batched round
    runs in" overlap (point 8).
  - A generator method notifies once per write, which rule 2 does not say
    (point 9).
  - Rule 10's "the first `save()` reaches a synchronous storage before it
    returns" against a handle that does not write (point 11).
- **B, 15 to 38: not verified in the decision document**, each with what
  stage 4 does first. These are the same "not run" and "not built" notes the
  decision document carries, collected in one list.

## The stage 4 task list, `review/stage-4-tasks.md`

59 tasks under the twelve steps of the order, a checkpoint after each step,
a table of ten risks, and a closing table that maps every decision to its
tasks. Written from the decision document at `c332e5e`.

Its 19 open points are in the file itself, in its section "Open points".
They are not repeated here. The ones that block the first two steps:

- **The floor guard** (points 1 to 3): where its walk over the commits
  starts, whether it still judges the working tree, and how it tells a
  loosened rule in its own file, which is code and not a list.
- **The production-bundle test** (point 4): how it knows which text is
  development text before any exists.
- **The error codes** (points 5 and 17): which of today's messages get one,
  the names nobody decided, and whether the code of the snapshot cycle is
  created and then retired. The spec raises the same point.
- **Dead code** (points 6 and 7): no benchmark row exists for two of the
  checks decision 20 removes "after a benchmark", and the two React cache
  traps are covered by direct tests today.

Two points concern a decision's own text: decision 13's baseline (point 11)
and the option list of `devtools` (point 12). Point 18 is a gap in the
order: between the snapshot change and the `devtools` change, the DevTools
tutorial's promise of computed values is false.

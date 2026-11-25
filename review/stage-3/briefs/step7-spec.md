# Brief: the 1.0 public API spec

- **You write:** `review/spec.md`, and nothing else.
- **Scratch folder:** `<scratch>/stage-3-step7-spec/`

The spec is what stage 4 implements and what the stage 4 reviewer checks the
code against. It says what 1.0 is, not how it got there: no history of the
review, no "first draft", no objection numbers. Each statement names the
decision it comes from in brackets, like `[D13]`, so a reader can find the
reason.

## Sections, in this order

1. **Objective.** Three or four sentences: what the library is, what stays
   fixed (a plain class behind a Proxy, frozen snapshots with structural
   sharing, one core for five frameworks), and what 1.0 means for a user
   (the public API and the guaranteed behaviour change only in a major
   release).
2. **Entry points.** One table: import path, runtime exports, public types,
   peer dependency and its range. Mark what is new in 1.0 and what changed.
3. **The API, one sub-section per export**, grouped by entry point. For
   each:
   - the TypeScript signature as it will be in 1.0, in a code block;
   - behaviour, as numbered rules that a test can check, each with its
     decision;
   - every error it throws or logs: the code, the kind of error, and the
     condition;
   - "Changed from 0.11", one line per change, or "Unchanged".
     Options objects and handles get a table of their members. Where the
     decision document changes a type (the parameter of `batch()`, the return
     type of the Vue adapter, the snapshot types of tuples and collections,
     the option of `injectClassyStore`), write the new type out.
4. **Which function is a method.** The rule of decision 1 in full, with the
   table of cases from its report, because every other section relies on it.
5. **Guaranteed behaviour.** The rules of "What 1.0 guarantees", each one
   split into statements a test can check. Keep the rule numbers.
6. **Unspecified behaviour.** The list, unchanged in meaning, and for each
   item which stage 1 test files pin it today as change detectors
   (`review/stage-3/pinned.md` has the map).
7. **Error codes.** One table: code, thrown or logged, kind of error, which
   export, condition. Every code the decision document names, and the three
   messages the library has today, which get codes under decision 35. Where
   the document decides that a code exists and does not name it, propose a
   name in the same style and mark it "proposed".
8. **Limits.** The size ceiling of each entry and the cost ratios, from
   decision 4 and `CONSTRAINTS.md`, and how a budget moves in stage 4.
9. **Documentation that changes.** One list: the page under
   `website/content/docs/`, the sentence or section, and the decision. This
   is the checklist for decision 34.
10. **How stage 4 works.** Short, and by reference: the commands of
    `CLAUDE.md`, the bar of `CONSTRAINTS.md`, test first, one change per
    commit, the order of the decision document. Then the three lists:
    - **Always:** what every commit must do.
    - **Never:** merge into `main`, release, publish, tag, or run the release
      workflow; lower a number of `CONSTRAINTS.md` without a decision record;
      commit spike code.
    - **Decide again before doing:** anything the spec does not cover.
11. **Done means.** The conditions under which stage 4 is finished, each one
    checkable by a command or a file.
12. **Open points.** What the decision document leaves unverified ("not
    run", "not verified", "stage 4 measures it first"), each with the
    decision and what stage 4 must do first. And anything you could not
    resolve.

## What to watch

- A signature in the spec must be one that TypeScript accepts. Check each
  against the source types, and say in "Open points" when the decision
  document does not give enough to write it.
- Guaranteed and unspecified are separate sections and must not overlap.
  If a rule and an "unspecified" item cover the same behaviour, list it as
  an open point.
- Do not copy the "why" of a decision. The decision records hold it.

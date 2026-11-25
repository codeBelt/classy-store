# Check of the stage 4 task list against the decision document

Checked at commit 7a1dec5. All 59 tasks, the twelve checkpoints, "What may run
in parallel", "Risks" and the closing table of `review/stage-4-tasks.md`,
against `review/stage-3-decisions.md`, the stage 4 section of `REVIEW_PLAN.md`,
`CONSTRAINTS.md` and today's source. 19 findings, 4 points unclear in the
decision document.

The decision document was read as committed at 7a1dec5. While this check
ran, the working tree of `review/stage-3-decisions.md` gained uncommitted
edits (for example the guard's start and a linear branch, decision 4); the
line numbers below are those of the committed file, and those edits were not
checked. The linear-branch rule, if it stands, strengthens finding 7.

## Findings

### 1. The Solid adapter's size is a third of what the decision document gives

- **Where:** `review/stage-4-tasks.md:1688`
- **It says:** "about +15 bytes on `./solid` (`adapters-collections.md`, A1)"
- **The decision document says:** "34 to 44 bytes per entry", decision 37,
  line 1829; the table of decision 4 puts `./solid` at an estimate of 346
  against 312 today (+34), line 398. `adapters-collections.md`, A1, measured
  "`./solid` 346 (+34, 11 over 335)".
- **Kind:** wrong
- **Correction:** "- **Size:** about +34 bytes on `./solid`
  (`adapters-collections.md`, A1: 346); ceiling 375."

### 2. T-26 leaves the documented sentence that decision 44 reverses

- **Where:** `review/stage-4-tasks.md:899-901`
- **It says:** the docs are "one paragraph in `TUTORIAL.md` and one in
  `PATTERNS.md`: the loss of structural sharing on a cycle, and the
  alternatives".
- **The decision document says:** "Before 1.0: it reverses a documented
  sentence", decision 44, line 1763. The sentence is
  `website/content/docs/TUTORIAL.md:644`: "Circular references in traversed
  state are rejected by `snapshot()`."
- **Kind:** missing
- **Correction:** add to T-26's Docs: "`TUTORIAL.md` loses 'Circular
  references in traversed state are rejected by `snapshot()`' (line 644,
  the same paragraph T-11 edits); a snapshot keeps the cycle."

### 3. A budget that moves does not move in `CONSTRAINTS.md` in the same commit

- **Where:** `review/stage-4-tasks.md:17` (step 6 of "How to use this list")
- **It says:** "add a line to the record of decision 4 when a budget moves
  (measured size plus 2%)".
- **The plan says:** "If the approved decision moves a number in
  `CONSTRAINTS.md`, the same commit edits that file and names the decision",
  `REVIEW_PLAN.md:610-612`. `CONSTRAINTS.md` holds every budget in its table
  ("Size of the main entry: At most 3750 bytes gzipped", and so on), and the
  guard flags a threshold changed there.
- **Kind:** missing
- **Correction:** step 6: "When a budget moves (measured size plus 2%), the
  same commit changes `budgets.json` and the row of the `CONSTRAINTS.md` size
  table, adds a line with the measured size to the record of decision 4, and
  the commit message names decision 4."

### 4. The per-commit comparison with the baselines is not carried

- **Where:** `review/stage-4-tasks.md:15-16` (steps 4 and 5)
- **It says:** run "the timings the task names, `--check` on both engines";
  full benchmarks only at checkpoints.
- **The plan says:** each commit carries "a comparison with the stage 1
  baselines. A regression in performance, memory or bundle size is reported
  with numbers, not absorbed", `REVIEW_PLAN.md:606-610`. The decision
  document's order: "each measured against the stage 1 baselines", line 2389.
  `CONSTRAINTS.md`, "Measured, not enforced": per-operation timings
  "Compared at every stage 4 commit", React commit timings "The same", React
  memory retention "Must not grow".
- **Kind:** missing
- **Correction:** add a step 5a: "Compare `bun run size` and the core timings
  with the baseline (U1 settles which one); a difference outside the spread
  is written into the commit message with its numbers. For a commit to the
  React adapter, also `bun run benchmark:react:compare` and
  `bun run test:react:memory:compare`."

### 5. The rule for a test of internal state is not carried

- **Where:** `review/stage-4-tasks.md:12-21`
- **It says:** only step 3, for "Tests that change": "the commit message names
  the decision".
- **The plan says:** "A test of internal state, from the list stage 1 made,
  may be rewritten or removed when the internals it reads change. The commit
  message names the public-behaviour test that covers the same fact",
  `REVIEW_PLAN.md:614-616`. T-07 (direct tests of the cache traps), T-08 and
  T-19 (tests and mutation lists that read nodes and dependency maps) meet it.
- **Kind:** missing
- **Correction:** add to step 3: "A test of internal state (stage 1's list)
  that is rewritten or removed because the internals it reads change: the
  commit message names the public-behaviour test that covers the same fact."

### 6. Examples are left out of each commit

- **Where:** `review/stage-4-tasks.md:17`
- **It says:** "Update the docs the task names".
- **The plan says:** "Each commit: the change, its tests, updated docs and
  examples", `REVIEW_PLAN.md:606`.
- **Kind:** missing
- **Correction:** step 6: "Update the docs the task names, and any example
  under `examples/` or `website/examples/` that shows the changed behaviour."

### 7. "What may run in parallel" allows a second writer and moves step 12

- **Where:** `review/stage-4-tasks.md:1863-1876`
- **It says:** "a second writer in its own worktree could do them beside the
  main line", and "T-57 and T-58 ... at any time after T-01".
- **The plan and the decision document say:** "Stage 4: Refactor (one writer,
  one change per commit)", `REVIEW_PLAN.md:594`; the order puts the repository
  last, step 12, line 2431. A merged side branch also gives the per-commit
  guard of decision 4 a merge commit to judge.
- **Kind:** wrong
- **Correction:** replace the section with: "None. Stage 4 has one writer
  (REVIEW_PLAN.md, Stage 4), and the tasks run in the order above. T-05, T-06
  and T-07 touch different files from T-04 and could swap order among
  themselves; T-57 and T-58 stay in step 12."

### 8. Decision 17's documentation change is in no task

- **Where:** `review/stage-4-tasks.md:2017` and T-29's Docs, line 1000
- **It says:** the table: "Docs: the top of the `subscribe` section of the
  reference (T-29 edits that section)"; T-29: "a paragraph under `subscribe`
  in `API_REFERENCE.md`" (the error rule only).
- **The decision document says:** "The reference says at the top of the
  `subscribe` section that the callback runs in a microtask and that
  `{sync: true}` runs it before the write returns", decision 17, line 1116;
  "Stage 4: Docs", line 62.
- **Kind:** missing
- **Correction:** T-29's Docs: "...; and the top of the `subscribe` section
  states that the callback runs in a microtask and that `{sync: true}` runs
  it before the write returns (decision 17)."

### 9. T-35 rewrites a test that the decided rule leaves passing

- **Where:** `review/stage-4-tasks.md:1171-1172`
- **It says:** "P2's 8, rewritten to expect the report".
- **The decision document says:** "48 tests change: 14 of that
  combination's 15", decision 21, line 1315. `spike-persist-2.md`, "Tests":
  the 15th, `persist.hydration.test.ts` "stored data from another version is
  ignored when there is no migrate", which P2 failed, passes again (a lower
  version with no `migrate` is not reported). `persist-devtools.md` also says
  P1 to P4 share one test, so T-34, T-35, T-37 and T-38 count it twice.
- **Kind:** wrong
- **Correction:** "P2's 8 less the one that passes again: 7 rewritten to
  expect the report (fixes); `persist.hydration.test.ts` 'stored data from
  another version is ignored when there is no migrate' stays as it is (a
  lower version with no `migrate` is neither used nor reported)."

### 10. T-19 changes a test that T-11 has already rewritten

- **Where:** `review/stage-4-tasks.md:682`
- **It says:** "1 incidental, the `defineProperty` test of G1".
- **The decision document says:** decision 2 lands first (step 3, line 2405).
  `spike-getters.md`, "The order for stage 4", step 5: "If T3 (a) of the
  traps report is in by then, it has been rewritten there already". T3 (a)
  is T-11.
- **Kind:** wrong
- **Correction:** "...fixes. The `defineProperty` test that G1 changes was
  rewritten in T-11 (T3 (a)); here it must still pass (R11)."

### 11. The frame that covers validation is garbled and on the wrong task

- **Where:** `review/stage-4-tasks.md:670-671`; T-20, lines 704-707
- **It says:** T-19: "and is validated inside a frame that also covers
  validation"; T-20 does not name the frame.
- **The decision document says:** "A getter that reads a getter which threw
  records that dependency, on both layers, inside a frame that also covers
  validation", decision 10, line 736.
- **Kind:** wrong
- **Correction:** T-19: "...treats a missing property as a value, and runs
  in a frame that covers validation as well as the getter's run." T-20: "a
  getter that reads a getter which threw records that dependency, on the live
  store and on a snapshot, inside the frame of T-19 that also covers
  validation, ..."

### 12. The Risks table says every `persist` path is tested; three are not

- **Where:** `review/stage-4-tasks.md:1887`
- **It says:** "The tests first of T-14 and T-34 to T-39 take every row of
  `spike-functions-3.md` and `spike-persist-2.md`".
- **The decision document says:** "Two losses stay, and the guide names
  both. A tab that read before a newer build wrote, and does not sync, writes
  over the newer record ... A `migrate` that returns a wrong result without
  throwing is saved at the user's next edit", decision 21, lines 1295-1298;
  guarantee 10, lines 2217-2220. Those are paths 7 (without `syncTabs`) and
  4 of `spike-persist-2.md`, and path 1 (first install, one edit) is also in
  no task: T-35 takes 7 with `syncTabs` only, and no task takes 1 or 4.
- **Kind:** missing
- **Correction:** T-35's Tests first gain: "path 1; path 4 (a `migrate` that
  drops a field is saved at the next edit, pinned as one of the two losses);
  path 7 without `syncTabs` (the other loss)."

### 13. The lost-write figure goes into the wrong record

- **Where:** `review/stage-4-tasks.md:1770-1771`
- **It says:** Files: "the record of decision 4 (the stated cost of the
  development path)".
- **The decision document says:** "The figure goes into the decision record
  as the stated cost of the development path", decision 36, line 2024. Its
  record, `docs/decisions/0036-one-build-and-one-development-only-check.md`
  line 38, says the "figure goes into this record".
- **Kind:** wrong
- **Correction:** "the record of decision 36
  (`docs/decisions/0036-…md`), with the stated cost of the development path";
  the same at line 1754 ("written in the decision record of 36").

### 14. T-27 adds a coded message and does not list the page of codes

- **Where:** `review/stage-4-tasks.md:927-928`
- **It says:** Files: "`src/collections/collections.ts`, `src/types.ts`,
  `src/collections/index.ts`, the test files."
- **The decision document says:** a mutator on a snapshot "throws a
  `TypeError` with the code of decision 35", decision 45, line 1774; "every
  commit that adds a message adds its code and its line on that page", line
  2401.
- **Kind:** missing
- **Correction:** add "the page of codes" to Files, and to Done when "the
  code is on the page of codes".

### 15. T-52 does not run the Angular browser suite

- **Where:** `review/stage-4-tasks.md:1662-1663`
- **It says:** Done when: `test:angular:compatibility` and the example build.
- **The decision document says:** "Each adapter change runs its framework's
  packed-app and browser suite", decision 37, line 1835.
  `packages/classy-store/tests/browser/angular.spec.ts` exists.
- **Kind:** missing
- **Correction:** add "`bun run test:browser` passes for `angular.spec.ts`".

### 16. T-14's second size figure is not the rule on today's source

- **Where:** `review/stage-4-tasks.md:542-543`
- **It says:** "`spike-functions-3.md`: +290 on today's source."
- **The decision document says:** "The main entry is 3,951 bytes with all
  three in" (the strict rule, decision 2 and the base class), decision 1,
  line 277; the row of decision 4 is "the three together, 3,951 bytes, less
  the other two", line 486.
- **Kind:** wrong
- **Correction:** "+228 bytes on the main entry (decision 4: 3,951 with
  decision 2 and the base class, less those two)."

### 17. The documentation of decision 34 with no code change is placed nowhere

- **Where:** `review/stage-4-tasks.md:2034`
- **It says:** "Docs, in each task; the sentence on a named property of an
  array in stage 5 (no code)".
- **The decision document says:** "The documentation changes listed under
  M76 are made in stage 4, each with the code change it belongs to, or in
  stage 5 where no code changes", decision 34, line 2132. M76 items with no
  task: a frozen object must be frozen whole; an unmarked class instance is
  shared with every snapshot; the `subscribe()` callback receives no
  arguments; the `persist` recipes (AsyncStorage, IndexedDB, an encrypting
  wrapper), transforms for `Date`, `Map` and `Set`, unknown stored keys
  removed at the next save, and `merge` as the place to validate untrusted
  input.
- **Kind:** missing
- **Correction:** "Docs, in each task. In stage 5, with no code: the sentence
  on a named property of an array (M37), and the M76 items no task carries:
  [the list above]."

### 18. T-25 leaves the tutorial's "keep the class prototype"

- **Where:** `review/stage-4-tasks.md:866-868`
- **It says:** "the reference's 'keep the class prototype' becomes 'are
  instances of the class'".
- **The decision document says:** the same for the reference, decision 43,
  line 1696. `website/content/docs/TUTORIAL.md:664` has the same words, "their
  snapshots keep the class prototype", which decision 43 makes false.
- **Kind:** missing
- **Correction:** "the reference's (line 404) and the tutorial's (line 664)
  'keep the class prototype' become 'are instances of the class'".

### 19. Two small statements of fact

- **Where:** `review/stage-4-tasks.md:4` and `617-619`
- **It says:** "(status 'decided', at `c332e5e` of `release/1.0`)"; "T-17 to
  T-23 follow that order" (the order of `spike-getters.md`).
- **The facts:** the decision document last changed in `a1e1d99` (one word,
  "slot" to "hook", line 480). `spike-getters.md` orders G5, G7a, M, G1, G2,
  G3c, G4; the list puts G7a (the snapshot throw, T-22) after G4 (T-20).
- **Kind:** stale; wrong
- **Correction:** "at `a1e1d99`"; "T-17 to T-23 follow that order, except
  that G7a goes with F4 half A in T-22."

## Unclear in the decision document

### U1. Which baseline a commit is measured against

The order says "each measured against the stage 1 baselines" (line 2389), as
the plan does (`REVIEW_PLAN.md:609`). Decision 1 says "The baseline is the
commit before, not the figures of stage 1, which decision 12 has moved by
then" (line 298). The task list takes the commit before or the last
checkpoint everywhere (T-09, T-12, T-14, T-16, T-23, T-41) and records new
"starting figures" at checkpoint 1. Open point 11 asks this for decision 13
only; the question is general, and finding 4 depends on it.

### U2. Which actions are "third-party"

Decision 32 pins "every third-party action" (line 2088). T-58's Done when
(`grep -nE "uses: [^ ]+@v[0-9]"`) also requires pinning `actions/checkout`,
`actions/setup-node` and the other GitHub-owned actions. One reading counts
only actions outside GitHub (`oven-sh/setup-bun`, `changesets/action`); the
other counts every action not in the repository. The task list took the
second.

### U3. When "stage 4 ends" for T-59

Decision 4: "When stage 4 ends, every budget is the final measured size plus
2%", and the baselines are recorded again (lines 456, 552). The plan's stage
4 ends after the independent review and its fixes (`REVIEW_PLAN.md:618-627`),
which can move sizes again. The task list puts T-59 before that review.

### U4. Which guide carries the two sentences of decision 19

Decision 19, "Two things the guide has to say", names both the constructor
rule and "`prepareStoreForHydration(store)` is called before
`persist(store)`" (lines 1154-1164), which reads as the persist guide.
Decision 41 says "The guide says" the second (line 1904), which reads as the
React SSR guide. T-34 puts the first in `PERSIST_TUTORIAL.md` and the second
in `REACT_SSR.md` only.

## Checked and agrees

- Order: every task sits in the step and position "The order for stage 4"
  gives it. Each stated dependency holds: 3 first in step 3; 12 before 1 and
  2; 5 in the commit after 2 (T-12 after T-11); 7 on top of 10; 10's snapshot
  rows in step 4 and run again after 43 (T-25); 30 on top of 27; 29 after 1;
  11 after 1, 2 and 30; 38 in one change with 37 for Vue; 19's constructor
  test, 1's arrow rows and 10's arrow row in the base-class step (T-50).
- T-01: the nine ceilings, the size script's two failures, every guard rule
  of decision 4 with a test, the `CONSTRAINTS.md` sentences; CI already runs
  `check:floor` with `fetch-depth: 0`.
- T-02, T-43, T-56: the guard form of decision 36 and its bundle test.
- T-03: the format, the 29 assertions in 15 files, the eight items of what
  1.0 does not catch.
- T-04 to T-07: the nine dead rows of `r5` (ten lines), −32 and 3,629, the
  `persist.ts` blocks, the three redundant checks, the cache traps. Every
  named function exists: `areDepsValid`, `disconnect`, `resumeScope`,
  `detachedParent`, `indexOfMember`, `identityOf`, `record`, `redo`,
  `writeToStorage`, `assertActive`, `discardEditedFields`, `clearedVersion`,
  `skipAutoSaveVersion`, `transactional`, `linkChild`,
  `areMemoizedDepsValid`, `isPlainObject`.
- T-08 to T-16: the figures (−36, +180 as 165 + 15, 11, +49, +104 as 36 + 68,
  +228, +168 as 100 + 68, +81) and test counts (6, 7, 17, 3, 4 of 7), and
  decision 1's landing condition (the commit before, 10% and 1.6 times).
- T-17 to T-24: decision 10's bullets and test counts (15 fixes and 1
  incidental across T-18 to T-22, 3 incidental in T-21, none in T-23);
  decision 7's 9 tests and 156 bytes; the sentence on an absent field.
- T-25 to T-27: decisions 43, 44, 45 (239, 14, −9, +21, +30, 55, 3 type
  files), the changeset `.changeset/stable-one.md` exists.
- T-28 to T-31: decisions 13 to 16, the 100 rounds, `delivery-loop`,
  `batch-async`, the variant's condition, 16, 1, 2 and 3 + 2 tests.
- T-32, T-33, T-54: decision 42 (13 bytes, 727 to 843, the flags, Solid's
  flag and Angular's `destroyed` check kept).
- T-34 to T-40 except finding 9: the five kinds, the handle that does not
  write, `onError`'s third argument, the version rule, `migrate`, expiry
  first, rule 3 and its 24 + 2 + 3 tests, decision 22's checks, 23's rollback
  and the dead bookkeeping, 24's stamp for a finite `expireIn`, 25.
- T-41 to T-48: decision 27's entries, hook, key as name, time travel, the
  four messages, `enabled`, the getter values; 30's check, its three test
  sets, 113 + 16 + 211; 28; 29's four tests and its stop condition; 31.
- T-49 to T-53 except findings 1 and 15: decision 11, the 17 compilations,
  decisions 37 to 40.
- T-55, T-57, T-58, T-59: decision 36's row and condition, 33 (`proxy-compare`
  3.0.1), 32 (the three workflows without permissions are `ci.yml`,
  `react-compatibility.yml`, `react-next.yml`), and decision 4's end rule.
- Files: every source file, test file, docs page, script and benchmark
  metric the tasks name exists, apart from the new files they create.
- Plan rules carried: one change per commit, tests first, the mutation run
  on touched target files (how-to step 5), a public-behaviour test changed
  only with its decision named (step 3).
- The closing table matches the decision table's "Stage 4" column for all 46
  decisions, apart from finding 8.

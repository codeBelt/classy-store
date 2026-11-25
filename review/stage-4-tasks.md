# Stage 4 task list

The ordered list of commits that implement `review/stage-3-decisions.md`
(status "decided", at `c332e5e` of `release/1.0`). It follows the twelve steps
of that document's "The order for stage 4" and refines each step into tasks.
It decides nothing: where the decision document leaves a question open, the
question is under "Open points" at the end. A decision is cited as "decision
N"; a report under `review/stage-3/` is cited by its file name.

## How to use this list

1. Work from the top. One task is one commit; each task needs only the tasks above it.
2. For each task: write the tests under "Tests first" and see them fail; make them pass.
3. Rewrite the tests under "Tests that change"; the commit message names the decision.
4. Run `bun run checkall`, `bun run test:coverage`, `bun run size` and `bun run check:floor`.
5. Run the timings the task names, `--check` on both engines for library source, and the mutation run on the target files it touches.
6. Update the docs the task names, and add a line to the record of decision 4 when a budget moves (measured size plus 2%).
7. Commit. Remove in the same commit the code the task makes dead (decision 20).
8. A message or logged report that a task adds gets its code and its line on the page of codes in the same commit (decision 35).
9. At each checkpoint: the full suite, the mutation run on the step's files, and both core benchmarks in full.
10. No spike patch is applied; a patch shows the size of the change. T-01 touches more than five files because decision 4 makes it one commit.

## The tasks

### Step 1. Tooling

#### T-01. Add the size ceilings and make the floor guard check every commit

- **Decision:** 4.
- **What:** `budgets.json` gets a `ceiling` beside each budget, with the
  ceilings of decision 4: `.` 5,575, `./utils` 4,350, `./collections` 950,
  `./react` 1,750, `./vue` 400, `./angular` 425, `./solid` 375, `./svelte`
  200, `./react/server` 175. The budgets stay as they are. The size script
  fails when a budget is above its ceiling, as well as when a measured size is
  above its budget. The floor guard walks the commits from the merge base with
  `main` to the head and judges each against the one before it; it reads
  `budgets.json` and `limits.json` as well as `CONSTRAINTS.md`; it blocks a
  budget or a limit that rises unless the same commit adds a line to the
  decision record; it refuses a commit that changes an existing ceiling
  together with anything other than that number and the record's reason; and
  it takes its own file into scope for a rule that is removed or loosened.
  This is decision 4's one commit, so it touches more than five files.
- **What changes, exactly:**
  - `packages/classy-store/tests/size/budgets.json`: each entry changes from
    a number to `{"budget": <today's number>, "ceiling": <decision 4>}`.
  - `packages/classy-store/tests/size/size.types.ts`: a type for that entry.
  - `packages/classy-store/tests/size/runSize.ts`: the check of measured
    sizes against budgets moves into an exported function that takes the
    sizes and the budgets and returns the list of problems, so that a test
    can call it without a build; the script runs `main()` only when it is
    the entry module (`import.meta.main`). New problem: a budget above its
    ceiling. The usage text and `tests/size/README.md` name the ceiling.
  - `scripts/floor-guard.mjs`: the per-commit walk; a rule for a rising
    number in `budgets.json` or `limits.json`; the ceiling rule; the switch
    "any file under `docs/decisions/` was touched" is replaced by "this
    commit adds a line to a decision record"; `isSelf` no longer exempts the
    guard from the rule for a removed or loosened rule. The text of its own
    patterns, in its file and in its tests, is not a finding.
  - `CONSTRAINTS.md`: the sentence "that the owner approved" and the
    sentence "The owner has not reviewed it yet" are brought in line with the
    plan's first ground rule (the record is approved by the agent running the
    plan). Nothing else in it changes in this commit.
  - `packages/classy-store/package.json`: the `test` and `test:coverage`
    scripts gain `tests/size` and the guard's test folder, and `typecheck`
    gains the guard test's `tsconfig.json`.
- **Tests first:**
  - `packages/classy-store/tests/size/runSize.test.ts`: a measured size
    above its budget is a problem; a budget above its ceiling is a problem; a
    budget equal to its ceiling with a size under it is clean; an entry with
    no budget is a problem, as today.
  - `packages/classy-store/tests/floor/floorGuard.test.ts`, each case run on
    a throwaway Git repository the test creates in a temporary folder, with
    the guard copied in and the fixture lines put together at run time, so
    that no file of this repository holds a line the guard would flag:
    - each rule the guard has today, one case each: `silenced-checker`
      (anywhere in scope, and the library-only `@ts-expect-error` and
      `as any`), `unfinished-work`, `test-made-easier`, `test-deleted`,
      `assertions-removed`, `rule-removed`, `threshold-loosened`,
      `threshold-changed`, `threshold-removed`, `new-exception`;
    - a budget that rises without a line in the record is flagged, and is
      clean with one in the same commit;
    - a limit in `limits.json` that rises, the same two cases;
    - a record line in an earlier commit does not clear a rise in a later
      commit;
    - a ceiling changed together with another file is flagged; a ceiling
      changed alone with its record line is clean;
    - the commit that adds the ceilings where none existed is clean;
    - a violation made in one commit and undone in the next is still
      reported for the first commit;
    - a removed or loosened rule in `scripts/floor-guard.mjs` is flagged;
    - the guard's own pattern text, in its file and in a test fixture, is
      not flagged.
- **Tests that change:** none. No test of the guard or of the size script
  exists today.
- **Done when:** `bun test packages/classy-store/tests/size
  packages/classy-store/tests/floor` passes; `bun run size` passes and prints
  the ceilings; `bun run check:floor` is clean on the branch with this commit.
- **Files:** `packages/classy-store/tests/size/budgets.json`,
  `runSize.ts`, `size.types.ts`, `README.md`, `runSize.test.ts`;
  `scripts/floor-guard.mjs`; `packages/classy-store/tests/floor/`
  (`floorGuard.test.ts`, `tsconfig.json`); `packages/classy-store/package.json`;
  `CONSTRAINTS.md`.
- **Size:** none; no library source changes.
- **Docs:** `CONSTRAINTS.md` as above, and the record of decision 4
  (`docs/decisions/0004-…md`, written in stage 3, step 7), which this commit
  cites and does not change. `tests/size/README.md` explains the ceiling.
- **Depends on:** none.
- **Risk:** high. The guard now judges every commit on the branch, also the
  stage 1 to stage 3 commits, and its own rewrite: if the walk starts too
  early, or the self rule flags this commit, the guard blocks the work from
  its first commit (open points 1 to 3).

#### T-02. Make the guard form of a development-only check a floor rule, with its bundle test

- **Decision:** 36 (the guard's rule), used early by 27.
- **What:** `CONSTRAINTS.md` gains a floor bullet: a development-only check
  is guarded by an inline read of `process.env.NODE_ENV` at its call site,
  after a cheap test that is almost always false, behind `typeof process`;
  never in a helper and never as a module constant. A test bundles each built
  entry for production and asserts that no development text and no
  `console.warn` is left. No library source changes: the rule exists before
  decision 27's `enabled` default and decision 36's check use it.
- **Tests first:**
  - `packages/classy-store/tests/size/productionBundle.test.ts`: every entry,
    bundled with the size script's settings (minified, `NODE_ENV` defined as
    `"production"`), contains no `console.warn` and no development text
    (open point 4 on what marks it).
  - The same file, on a fixture module it writes at run time: a guard in the
    decided form is removed from the bundle; the same check behind a
    module-level constant is not, so the test can fail.
- **Tests that change:** none.
- **Done when:** `bun test packages/classy-store/tests/size` passes;
  `bun run check:floor` is clean (a new floor bullet tightens the bar).
- **Files:** `CONSTRAINTS.md`,
  `packages/classy-store/tests/size/productionBundle.test.ts`, and the shared
  bundling function moved out of `runSize.ts` if the test reuses it.
- **Size:** none.
- **Docs:** the floor bullet in `CONSTRAINTS.md`.
- **Depends on:** T-01.
- **Risk:** low. The test passes trivially until a development-only check
  exists, so its fixture half is what proves it can fail.

#### Checkpoint 1

`bun run checkall`, `bun run test:coverage`, `bun run size` (each budget
under its ceiling), `bun run check:floor` on the whole branch. No library
source changed, so no mutation run and no benchmark is needed; record both
core benchmarks once (`bun run benchmark:core`, `bun run
benchmark:core:node`) as the starting figures of stage 4 on this machine.

### Step 2. Codes, and code that is dead today

#### T-03. Give today's messages their codes and create the page of codes

- **Decision:** 35.
- **What:** every error and logged report of the library reads
  `@codebelt/classy-store [code]: facts`, where the facts are the names the
  user wrote. The three messages of today get codes: the getter cycle
  (`getter-cycle`, its path as the facts), "object is not a store proxy" and
  the snapshot's circular reference. One new documentation page lists each
  code with its advice. From this commit on, every commit that adds a message
  adds its code and its line on that page.
- **Tests first:** in the test files that assert today's text (29 assertions
  in 15 files by `devbuild.md`'s count, from a search, not a run), each
  assertion matches the code and the facts instead: for example
  `core.computed.test.ts` for the getter cycle, `core.test.ts` for a value
  that is not a store, `snapshot.test.ts` for the cycle. One new test per
  message that the text starts with the prefix and the code.
- **Tests that change:** the 29 assertions above, kind "changed by decision"
  (decision 35).
- **Done when:** `bun run test` passes; `grep -rn "\[getter-cycle\]"
  packages/classy-store/src/core/core.ts` finds the message; the page is in
  `website/content/docs/meta.json` and `bun run docs:build` succeeds.
- **Files:** `src/core/core.ts`, `src/snapshot/snapshot.ts`, the new page
  under `website/content/docs/`, `website/content/docs/meta.json`, and the
  test files above.
- **Size:** not measured alone. `devbuild.md`: a code with the names costs 43
  bytes more than a bare code on the first-wave set; the codes shorten the
  messages by about 100 bytes on the first set (decision 4).
- **Docs:** the new page of codes; `API_REFERENCE.md` links it. The page
  also lists what 1.0 does not catch (decision 36): a native `Map` or `Set`
  in a store, an unmarked nested class instance, a `Date` changed in place, a
  getter that reads another store or a static, a mutated result of a getter,
  a named property on an array, an own-property check inside a getter, and a
  prototype changed after its first read through a store.
- **Depends on:** T-01.
- **Risk:** medium. Every test that matches an error's text changes, and the
  adapters' and `persist`'s messages are not among "the three" (open point
  5).

#### T-04. Remove the ten dead lines of the three core files

- **Decision:** 20.
- **What:** apply the dead rows of `own-code.md` (`c11`, `c28`, `c56`,
  `o07`, `o21`, `s12`, `s13`, `s18`, `s23`) in the form the type checker
  accepts: `if (!cached) return false` merged into the next line of
  `areDepsValid()`, `?? 0` in place of the `count === undefined` check in
  `disconnect()`. The ternary in `activeTracker()` stays. The fast paths
  (`c03`, `c21`, `c27b`, `o22`, `s04`) stay.
- **Tests first:** none can fail: the code is dead. The mutation run on
  `core.ts`, `ownership.ts` and `snapshot.ts` is the check: the entries of
  the list of unkillable mutants that marked these lines go.
- **Tests that change:** none (`r5`: 1,341 pass).
- **Done when:** `bun run test` passes; `bun run typecheck` passes;
  `bun run test:mutation packages/classy-store/src/core/core.ts
  packages/classy-store/src/core/ownership.ts
  packages/classy-store/src/snapshot/snapshot.ts` leaves no unexplained
  survivor.
- **Files:** `src/core/core.ts`, `src/core/ownership.ts`,
  `src/snapshot/snapshot.ts`, the mutation list of equivalent mutants under
  `tests/mutation/`.
- **Size:** −32 bytes on the main entry (`r5`, 3,629).
- **Docs:** none.
- **Depends on:** T-03.
- **Risk:** low. `r5` was timed on Node only (`own-code.md`, "Not done");
  run `bun run benchmark:core --only store.read,store.write,getter.cached`
  on Bun.

#### T-05. Remove the dead blocks of `persist.ts`

- **Decision:** 20 (stage 1 finding 54, M54).
- **What:** remove what `tests/mutation/equivalent/persist.json` lists as
  dead or redundant: the `assertActive()` in `writeToStorage()` that cannot
  throw and the duplicate in `save()`; the debounce-cancel block written
  four times, with its null checks; the two `debounceTimer = null`
  assignments never read; the guards whose removal changes nothing
  (`if (onError)`, `if (prop.transform)`, `typeof envelope !== 'object'`,
  `if (!hydratedFlag)`).
- **Tests first:** none can fail. The mutation run on `persist.ts` checks
  that the listed equivalent mutants are gone.
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run test:mutation
  packages/classy-store/src/utils/persist/persist.ts` leaves no unexplained
  survivor; `persist.json` no longer lists the removed lines.
- **Files:** `src/utils/persist/persist.ts`,
  `tests/mutation/equivalent/persist.json`.
- **Size:** not measured alone; `./utils` only.
- **Docs:** none.
- **Depends on:** T-03.
- **Risk:** low. Decisions 21 to 23 rewrite the same functions in step 8, so
  keep this commit to deletions.

#### T-06. Remove the redundant checks of `equality.ts`, `history.ts` and `collections.ts`

- **Decision:** 20 (stage 1 finding 59).
- **What:** remove the three `b instanceof Date / Map / Set` checks after
  the same-prototype check in `equality.ts`; the `if` around the truncation
  in `record()` and the `disposed ||` in `redo()` in `history.ts`; the object
  guard in `indexOfMember` of `collections.ts`, which repeats the one inside
  `identityOf`. Each check that sits in a loop goes only after a benchmark
  shows that removing it costs nothing (decision 20).
- **Tests first:** none can fail. Before the `collections.ts` deletion, a
  timing of a lookup among many members with and without the guard (open
  point 6: the core benchmark has no collection row).
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run test:mutation
  packages/classy-store/src/utils/equality/equality.ts
  packages/classy-store/src/utils/history/history.ts
  packages/classy-store/src/collections/collections.ts` leaves no
  unexplained survivor.
- **Files:** `src/utils/equality/equality.ts`, `src/utils/history/history.ts`,
  `src/collections/collections.ts`, the lists under
  `tests/mutation/equivalent/`.
- **Size:** not measured.
- **Docs:** none.
- **Depends on:** T-03.
- **Risk:** low. The `collections.ts` guard may be a deliberate shortcut in
  a hot loop (stage 1); keep it if the timing says so.

#### T-07. Remove or test the two traps of the React snapshot cache

- **Decision:** 20 (stage 1 finding 4).
- **What:** the `set` and `deleteProperty` traps of the read-only handler in
  `snapshotTargetCache.ts` cannot be reached through proxy-compare. They are
  removed if deleting them fails no unit test and no React suite; otherwise
  each gets a test that reaches it.
- **Tests first:** delete the two traps on a scratch copy and run
  `bun run test`, `bun run test:react:compatibility` and
  `bun run test:react:compiler`; the result decides which half of the
  decision applies (open point 7: today's direct tests in
  `snapshotTargetCache.test.ts` reach the traps through the cache itself).
- **Tests that change:** the direct tests of the two traps in
  `snapshotTargetCache.test.ts`, if the traps go.
- **Done when:** `bun run test` passes; `bun run test:coverage` keeps
  `snapshotTargetCache.ts` at 100% of lines and functions.
- **Files:** `src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts`
  and its test.
- **Size:** not measured; `./react` only.
- **Docs:** none.
- **Depends on:** T-03.
- **Risk:** low.

#### Checkpoint 2

The full suite, the typecheck, coverage, `bun run size` against the
ceilings, `bun run check:floor`. The mutation run on `core.ts`,
`ownership.ts`, `snapshot.ts`, `persist.ts`, `history.ts`, `equality.ts` and
`collections.ts`: every unkillable mutant left has a labelled reason, and
the 25 that marked dead code go down. Both core benchmarks in full; every
figure inside the spread of checkpoint 1. `bun run test:react:compatibility`
for T-07.

### Step 3. The core, reads and writes

#### T-08. Remove the walk to a detached parent

- **Decision:** 3.
- **What:** remove the `detachedParent` pointer and the walk in
  `resumeScope()` (`own-code.md`, `x2`). Suspend and resume stay; each node
  resumes on its own when it is touched. The call of `resumeScope()` in
  `createClassyStore` becomes redundant and goes in this commit (decision
  20), and so does the mutation list's `resumeScope` entry.
- **Tests first:** in `core.removedContainers.test.ts`, the read of stage 1
  finding 66, which hangs today and returns with the change (it could not be
  pinned before); the first snapshot after freezing a removed container is
  current; a subscriber added then hears the next write.
- **Tests that change:** 6, all fixes: five in
  `core.unobservedObjects.test.ts` and `core.removedContainers.test.ts`, one
  in `core.noWeakRefMemory.test.ts`.
- **Done when:** `bun run test` passes; `bun run typecheck` passes; the
  mutation run on `ownership.ts` and `core.ts` leaves no unexplained
  survivor.
- **Files:** `src/core/ownership.ts`, `src/core/core.ts`, the three test
  files, the mutation list.
- **Size:** −36 bytes on the main entry (`x2`, 3,625).
- **Docs:** none; the order of owner notifications and the three cases of
  "Left as it is" are already stated or go to the spec.
- **Depends on:** T-04.
- **Risk:** low. The fuzz test passed on `x2`, and both engines timed within
  1% (`own-code.md`). Finding 68 (owner links without `WeakRef`) flips with
  no written expectation (open point 9).

#### T-09. Answer "is this key a getter?" from a table per prototype

- **Decision:** 12.
- **What:** the `get` and `set` traps stop walking the prototype chain with
  `Object.getOwnPropertyDescriptor`. An own key is decided with
  `hasOwnProperty` and one flag per node; an inherited key from a table per
  prototype, filled on the first miss, that records which prototype carries
  an accessor for the key or that none does. The table holds no function: a
  recompute asks that prototype for its getter. A key absent everywhere is
  recorded only while the table holds fewer than 256 keys.
- **Tests first** (`core.prototypeTable.test.ts`):
  - the three rows of `table.ts` (`spike-core-2.md`, F2): a getter
    redefined on the class runs its new body at its next recompute on both
    layers; a getter replaced by a value; a deleted getter;
  - the two rows of `f2-lazy.ts`;
  - the override nearer the instance, pinned as unspecified;
  - `table-growth.ts` as a test: a million absent keys on a nested
    dictionary and 200,000 on a class instance leave the table under the
    cap, through a test-only export or by heap growth;
  - a read of an absent key that is later added as a getter on the
    prototype is seen and is not memoized.
- **Tests that change:** none (F2 and G2: no test fails).
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  store.read,store.read.nested,getter.cached` and `bun run
  benchmark:core:node --only store.read,store.read.nested,getter.cached`
  are faster than checkpoint 2 (the spike: 31.9 to 11.5 nanoseconds for a
  read on Bun, 47.5 to 38 on Node); both `--check` runs pass.
- **Files:** `src/core/core.ts`, `src/core/ownership.ts` (one flag), the new
  test file.
- **Size:** +180 bytes on the main entry (165 for F2, 15 for the cap).
- **Docs:** `ARCHITECTURE.md` (how a read decides a getter); the reference
  states the unspecified answers for a prototype changed after its first
  read (decision 12, "What it assumes").
- **Depends on:** T-08.
- **Risk:** medium. F2 and G2 were never built on the getter combination of
  decision 10, which step 4 writes on top of this; `Object.prototype`
  carries `__proto__`, an accessor the table must not turn into a node.

#### T-10. Make a delete that removes nothing no change

- **Decision:** 8.
- **What:** `delete store.dict.missing` returns `true` and does nothing
  else: the `deleteProperty` trap returns before it does anything when the
  key is not an own key.
- **Tests first:** in `core.characterisation.invariants.test.ts`, deleting a
  missing key, an index past the end and a key of a frozen container notifies
  no one and bumps no version.
- **Tests that change:** 7, all fixes, in
  `core.characterisation.getters.test.ts`,
  `core.characterisation.invariants.test.ts` and
  `core.fuzz.findings.test.ts`; one switch leaves the randomized test in
  `core.fuzz.test.ts`.
- **Done when:** `bun run test` passes; the mutation run on `core.ts`
  leaves no unexplained survivor.
- **Files:** `src/core/core.ts` and the four test files.
- **Size:** +11 bytes on the main entry.
- **Docs:** none; guaranteed rule 2 ("a write that changes nothing notifies
  no one") goes to the reference with the spec.
- **Depends on:** T-09.
- **Risk:** low.

#### T-11. Treat `Object.defineProperty` through a store as a write

- **Decision:** 2.
- **What:** the `defineProperty` trap does a write's bookkeeping: the value
  becomes the property's child or the old child is detached, and subscribers
  are told when the value, the getter, the kind of property or its
  enumerability changed. Every descriptor is still forwarded;
  `Object.freeze(store)` stays silent. A definition or a delete of a
  property that is or was an accessor clears the node's getter cache. The
  defined value is stored as it is given; T-12 changes that. No
  `setPrototypeOf` trap.
- **Tests first** (`core.refusedDefinition.test.ts` and a new
  `core.definitions.test.ts`): a definition of a data value notifies and
  reaches the next snapshot; an accessor defined through the store works on
  both layers; a read-only definition; `Object.freeze(store)` notifies no
  one; a getter that read a property later redefined as data is not stale
  (`spike-getters.md`, probe P5); the same after a delete of an accessor.
- **Tests that change:** 17, all fixes (`spike-traps.md`, T3 (a)), in
  `core.characterisation.getters.test.ts`,
  `core.characterisation.invariants.test.ts`, `core.frozenValues.test.ts`,
  `core.refusedDefinition.test.ts`, `core.removedContainers.test.ts`,
  `core.unobservedObjects.test.ts` and `snapshot.redefinedElements.test.ts`,
  plus the one that passes for a new reason; and 3 more pinned tests that the
  cache clear flips (finding 44 and two of finding 30, `spike-getters.md`).
- **Done when:** `bun run test` passes; the mutation run on `core.ts`
  leaves no unexplained survivor; `bun run benchmark:core:node --check`
  passes.
- **Files:** `src/core/core.ts` and the test files above.
- **Size:** +49 bytes on the main entry.
- **Docs:** `TUTORIAL.md` loses "bypasses assignment/deletion tracking";
  `ARCHITECTURE.md` describes the trap anew in place of "forward, then
  detach if read-only".
- **Depends on:** T-10.
- **Risk:** medium. `Object.freeze(store)` goes through the trap once per
  key; the benchmark times no definition.

#### T-12. Store raw values on write, and keep a child through a freeze

- **Decision:** 5.
- **What:** the `set` and `defineProperty` traps store the raw object behind
  a store proxy, and `linkChild` finds an existing node by the raw object as
  well as by the proxy. When a property becomes read-only through the store
  while it holds a tracked object (`Object.freeze(container)`, or a
  definition without a value), the trap puts that object's proxy in the raw
  slot first. An object frozen before it reached the store and a read-only
  property defined with an object value stay raw, as today.
- **Tests first** (`core.rawValues.test.ts`):
  - a class instance that is already a store, placed in another store by
    its raw object, stays connected; the raw object holds no proxies after
    writes; `outer.inner === inner` gives its new answer;
  - the four lines of `raw-freeze.ts` (`spike-core-2.md`, F1);
  - a frozen list; a property made read-only by `defineProperty` without a
    value; a freeze through the store stays silent;
  - the two raw exceptions: an object frozen before it reached the store,
    and a read-only definition with an object value;
  - a list built from proxies and then assigned still holds proxies (not
    covered, on purpose).
- **Tests that change:** 3, all fixes (`spike-traps.md`, T2 first part), in
  `core.characterisation.identity.test.ts`; F1 changes none beyond those of
  decisions 2 and 5.
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  create.small,create.rows` and the same on Node are inside the spread of
  T-11's commit.
- **Files:** `src/core/core.ts`, the new test file, the identity test file.
- **Size:** +104 bytes on the main entry (36 for T2, 68 for F1).
- **Docs:** the reference's identity rule (guaranteed rule 6) and the
  section "frozen objects are values" name the two cases that stay raw.
- **Depends on:** T-11.
- **Risk:** medium. One earlier run showed store creation about 20% slower on
  Node, a second did not (decision 5).

#### T-13. Add the two benchmark rows that decision 1 is measured by

- **Decision:** 1.
- **What:** `runCoreBenchmark.mjs` gains two metrics: a call of a method
  held in a field of an object literal, and a read and call of an arrow
  function held in a field (`own-method.mjs` of `spike-functions-2.md` names
  them `own.method` and `own.fn.read`). Their figures on this commit, with
  today's rule, are the baseline T-14 is held to.
- **Tests first:** none; tooling. The README lists the two rows.
- **Tests that change:** none.
- **Done when:** `bun run benchmark:core --only <both names>` and
  `bun run benchmark:core:node --only <both names>` print both rows;
  `bun run check:floor` is clean.
- **Files:** `packages/classy-store/tests/benchmark/runCoreBenchmark.mjs`,
  `packages/classy-store/tests/benchmark/README.md`.
- **Size:** none.
- **Docs:** the benchmark README.
- **Depends on:** T-12.
- **Risk:** low.

#### T-14. Make a function in a field a method when it is read through the store

- **Decision:** 1.
- **What:** a function found on the prototype chain under any key but
  `constructor`, or held in an own data property of an object that is not
  an array, is a method when it is read through the store: bound to that
  object's proxy and run as one transaction. Case 2 hands out the function as
  it is when it is a class or a built-in constructor (its own `prototype` is
  read-only), a method a store handed out before, frozen, a store, or held in
  a read-only, non-configurable property. There is one method per object and
  function, named after the key it was first read under (the key reaches
  `transactional()`). A method of the same object written back is stored as
  the function it wraps; one of another object is stored as it is. A read of
  a function in a field counts as a read for a getter. The short path skips
  the descriptor for a method already handed out while the object is
  extensible, no definition through the store made a property read-only, and
  the function is not frozen. The object and its snapshots are never changed.
  The old function branch of the `get` trap, with its wrapper per read for
  an array method, goes in this commit.
- **Tests first** (`core.functions.test.ts`):
  - every row in bold of section 1 of `spike-functions-2.md` and its R
    column of section 2;
  - one function held by two stores writes the store it is called on;
  - the name for a prototype method and for an own method; one function
    under two keys is named after the key read first;
  - `store.a = store.a` is no change; `store.b = store.a` stores `a`'s
    function; a method of another object written and called stays bound to
    it;
  - a read after `Object.freeze(raw)`; a getter that calls a function in a
    field sees its replacement;
  - from `spike-functions-3.md`: `inc: function () {…}` on the store, called
    detached in strict code and in sloppy code through `new Function`; a
    generator method detached; a `function` method passed to another store
    and called there; a `function` constructor held as a value, its `new`
    and its statics as today; a class and `Date` held as values; the Babel
    shape with a read-only `prototype`;
  - the four rows of a property made read-only after a first read
    (`spike-functions-3.md`, section 2), one function per case, the one that
    throws included;
  - a frozen function and a store held as values are handed out as they are.
  - The rows for an arrow-function field of a base-class subclass wait for
    T-49.
- **Tests that change:** the fixes of the strict rule that `spike-functions-3.md`
  lists as left after decision 2 and before the base class: four in
  "functions read through a store" of
  `core.characterisation.identity.test.ts` (a class's statics, `includes`
  and `indexOf` on a list of functions, an array method stable on reads,
  `splice` by `indexOf`), the two of "static getters", the prototype swap
  and the nested array's `Array.isArray`. All fixes. The identity test for a
  `function` declaration stays as it is.
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  store.method,<T-13's two names>` and the same on Node: `store.method`
  inside the spread of T-13's commit, the call row at most 10% and the read
  and call row at most 1.6 times T-13's figures; `bun run benchmark:core
  --only store.read,create.small` inside the spread of T-13's commit on both
  engines.
- **Files:** `src/core/core.ts`, the new test file, the identity test file.
- **Size:** +228 bytes on the main entry (decision 4, measured with decision
  2 and the base class); `spike-functions-3.md`: +290 on today's source.
- **Docs:** the sentences of `spike-functions-2.md`, section 5, with the
  second replaced, a sentence 2a added and the eighth extended as
  `spike-functions-3.md` says, into `TUTORIAL.md` and `API_REFERENCE.md`;
  `ARCHITECTURE.md` describes the cache of methods, which is per object.
- **Depends on:** T-09, T-11, T-13.
- **Risk:** high. It is the read path of every function, and two decisions
  of the last round rest on it; the condition on `store.method` was missed
  by a hair on Node by the form without the short path.

#### T-15. Make `includes`, `indexOf` and `lastIndexOf` find the object the caller holds

- **Decision:** 6.
- **What:** on a list in a store, the three searches return the nearest hit
  of the engine's own search for up to three values: the value given, and,
  when it is a form of an object in a store, that object's raw form and its
  proxy. Any other element is found by reference; a primitive with the native
  method; `fromIndex` is passed unchanged.
- **Tests first** (`core.searches.test.ts`): `const row = {…};
  store.rows.push(row); store.rows.includes(row)` is `true`; the same for
  the proxy and for a snapshot of the row; the three lines of `search.ts`
  (`spike-core-2.md`, F3) for a list of saved snapshots; `includes(store.doc)`
  on that list; the `fromIndex` rows; the 18 rows that agree with a plain
  array; and one test that pins the different answer of a reactive set for
  two snapshots of one object.
- **Tests that change:** the 4 searches of `t2` (`spike-core-2.md`), all
  fixes, in `core.characterisation.identity.test.ts`.
- **Done when:** `bun run test` passes; the mutation run on `core.ts` leaves
  no unexplained survivor.
- **Files:** `src/core/core.ts` (the array branch of the `get` trap), the
  new test file.
- **Size:** +168 bytes on the main entry (100 for T2's searches, 68 for F3).
- **Docs:** `REACTIVE_COLLECTIONS_TUTORIAL.md` states that a list and a
  collection answer differently for two snapshots of one object.
- **Depends on:** T-14.
- **Risk:** low. The core benchmark has no search row; the spike's timing
  (0.5 microseconds for 1,000 rows on Bun) is not repeated by a command.

#### T-16. Treat a plain object from another realm as state

- **Decision:** 9.
- **What:** `isPlainObject` also accepts a prototype that ends its chain and
  whose own `constructor` prints as this realm's `Object` does, so an object
  made in an iframe or a `vm` context is proxied and frozen in snapshots.
  Built first without the per-prototype cache; the smaller form that keeps
  store creation inside the spread is kept.
- **Tests first** (`internal.test.ts`, with `node:vm`): a write to a foreign
  object and to a row of a list inside it notifies once; its snapshot and the
  snapshot of an object inside it are frozen; a foreign class instance, a
  foreign `Date` and a foreign `Map` stay opaque; a null-prototype object is
  proxied as before; `persist` and `withHistory` copy such an object.
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  create.small,create.rows` and the same on Node inside the spread of T-15's
  commit.
- **Files:** `src/utils/internal/internal.ts`, `internal.test.ts`.
- **Size:** +81 bytes on the main entry with the cache; the form without it
  was not measured. `./utils` grows by the same amount.
- **Docs:** the reference: an object from another realm is state; the raw
  object must not be frozen once a store holds it (decision 9, "Not taken").
- **Depends on:** T-15.
- **Risk:** low.

#### Checkpoint 3

The full suite, the typecheck, coverage, `bun run size` (the main entry's
budget moved in the commits that grew it, each under the ceiling of 5,575),
`bun run check:floor`. The mutation run on `core.ts` and `ownership.ts`.
Both core benchmarks in full with `--check`; the four ratios inside their
limits. `bun run test:browser` and `bun run test:react:compatibility`,
because every adapter reads through the changed traps.

### Step 4. Getters

Decision 10 is written in one shape that no spike built on top of the table
of decision 12 (T-09). `spike-getters.md` orders its parts; T-17 to T-23
follow that order. Its figures (182 lines added and 144 removed, 165 bytes,
16 tests) are the spike's; stage 4 takes its own from its own build.

#### T-17. Add the getter tests that pass today and guard the rewrite

- **Decision:** 10.
- **What:** a commit of tests only, all green on the code of T-16, so that
  the rewrite of T-19 has a net (`spike-getters.md`, "The order for stage 4",
  step 1).
- **Tests first** (`core.computed.test.ts`, `core.gettersAcrossNodes.test.ts`,
  `snapshot.computed.test.ts`, `core.fuzz.test.ts`): a getter that returns a
  child node, read by another getter (R2); a getter that returns a child
  array, iterated by another getter (P3); the same on a snapshot (P7); a
  dependency the current path no longer reads is not run (P1); the four
  cases of R12; a getter that catches a cycle error, read again after an
  unrelated write, on the live store (R13); R5b; R6; the fuzz for nodes
  outside the store, with getter reads on kept groups.
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run check:floor` is clean.
- **Files:** the four test files.
- **Size:** none.
- **Docs:** none.
- **Depends on:** T-16.
- **Risk:** low.

#### T-18. Keep the memo map on the snapshot layer, and report a snapshot getter cycle

- **Decision:** 10.
- **What:** the snapshot layer keeps the memo map that nested getters filled
  (finding 37), and reports a getter cycle with the live layer's error and
  code (`getter-cycle`) where it overflows the stack today (finding 38).
- **Tests first** (`snapshot.computed.test.ts`): R13 on a snapshot; a nested
  getter on a snapshot runs once per snapshot; a cycle of snapshot getters
  throws with the code, and the other getters keep working.
- **Tests that change:** 5, all fixes (findings 37 and 38).
- **Done when:** `bun run test` passes; the mutation run on `snapshot.ts`
  leaves no unexplained survivor.
- **Files:** `src/snapshot/snapshot.ts`, one exported function in
  `src/core/core.ts`, the test file.
- **Size:** about 70 bytes on the main entry in the combination
  (`spike-getters.md`, G5).
- **Docs:** none.
- **Depends on:** T-17.
- **Risk:** low.

#### T-19. Use one kind of getter dependency, `{value, version}` by property

- **Decision:** 10.
- **What:** one kind of dependency replaces the three (value, version,
  computed). It contains the version stamp that makes a clean read
  constant, records each property once per run, treats a missing property as
  a value, and is validated inside a frame that also covers validation. The
  getter is read from the prototype table of T-09 after that validation. The
  code of the three kinds goes in this commit, with the dead branch of
  finding 64 and the mutation list's entries for it.
- **Tests first** (`core.computed.test.ts`): a getter that reads a missing
  property is memoized and recomputes when the property appears (finding
  32); the loop getter records one dependency, seen as a clean read that
  costs the same as the hoisted form, or through a count of trap calls as
  `equality.arrayScan.test.ts` does; a diamond of getters does not double
  its cost per level; a live getter sees a definition as it sees a write
  (R11).
- **Tests that change:** 5 that pin finding 32 and 2 that pin the missing
  cutoff, fixes; 1 incidental, the `defineProperty` test of G1. The fuzz
  flag `A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE` flips.
- **Done when:** `bun run test` passes, with the fuzz of 600 seeds and the
  fuzz for nodes outside the store; `bun run benchmark:core --only
  getter.cached,getter.recompute,getter.rows.recompute` and the same on Node
  keep the four ratios inside their limits with `--check` (the spike on
  Node: a cached read 26% faster, a recompute 6 to 9% slower); the mutation
  run on `core.ts` leaves no unexplained survivor.
- **Files:** `src/core/core.ts`, `src/core/core.types.ts`, the test files.
- **Size:** G3c about 43 and the stamp with the missing value about 59
  bytes on the main entry (`spike-getters.md`), measured apart.
- **Docs:** the reference loses "A live getter that reads an absent field
  recomputes on subsequent reads"; `ARCHITECTURE.md`, "Nested getter
  support", is rewritten.
- **Depends on:** T-18.
- **Risk:** high. It is the part of `core.ts` the plan calls hardest to
  reason about, a mutation target, and it is built on T-09 for the first
  time.

#### T-20. Record a dependency on a getter that threw, on both layers

- **Decision:** 10.
- **What:** a getter that reads a getter which threw records that
  dependency, on the live store and on a snapshot, so a getter that catches
  the error recomputes when the cause changes (finding 36). Whether an
  error is cached stays unspecified.
- **Tests first:** R13 on both layers, R5b and R6
  (`core.computed.test.ts`, `snapshot.computed.test.ts`).
- **Tests that change:** 2, fixes (finding 36).
- **Done when:** `bun run test` passes; the mutation run on `core.ts` and
  `snapshot.ts` leaves no unexplained survivor.
- **Files:** `src/core/core.ts` (`get` trap, `areDepsValid`),
  `src/snapshot/snapshot.ts` (the tracking proxy, `areMemoizedDepsValid`).
- **Size:** about 30 bytes on the main entry.
- **Docs:** none.
- **Depends on:** T-19.
- **Risk:** low once T-19 is in.

#### T-21. Throw when a getter writes the object it is computed on, on the live store

- **Decision:** 10.
- **What:** on the live store, a write to the getter's own object throws a
  `TypeError` that names the field, with its code: an assignment, a
  `delete`, a definition, also through a method the getter calls. A write to
  another store, to a child, and a store constructed inside a getter stay
  allowed.
- **Tests first** (`core.getterWrites.test.ts`): the rows of `f4-writes.ts`
  (`spike-core-2.md`, F4) on the live store: `this.cache ??= …` throws; a
  `delete` and a definition through `this` throw; a method called by the
  getter that writes its own store throws; a write to another store, to a
  child, and the construction of a plain store inside a getter work. The row
  with a base-class store built inside a getter waits for T-49.
- **Tests that change:** 3, incidental, rewritten to expect the error: they
  pin today's getter that writes a field of its own store.
- **Done when:** `bun run test` passes; the message carries its code and the
  code is on the page of codes.
- **Files:** `src/core/core.ts`, the new test file, the page of codes.
- **Size:** 37 bytes for half B (`spike-core-2.md`, F4).
- **Docs:** `TUTORIAL.md` ("Keep computed getters pure"), `PATTERNS.md`,
  `ARCHITECTURE.md` and a line under "Getters" in the reference: a getter
  must not write to the store it reads; recording reads outside the getter's
  own node is not done, and the pattern is to hold the other store as a
  field.
- **Depends on:** T-20.
- **Risk:** medium. A getter that fills a cache field works today on the
  live store and throws after this.

#### T-22. Throw when a snapshot getter writes `this`, in any code

- **Decision:** 10.
- **What:** the traps of the snapshot's tracker throw themselves, with the
  same message and code, so a write to `this` in a snapshot getter throws in
  code that is not strict too; a write to a frozen child throws in strict
  code and is ignored otherwise.
- **Tests first** (`snapshot.computed.test.ts`): the rows of `f4-writes.ts`
  on a snapshot, in strict code and in a getter compiled with `Function`.
- **Tests that change:** 1, a fix (finding 39 on a snapshot).
- **Done when:** `bun run test` passes; the mutation run on `snapshot.ts`
  leaves no unexplained survivor.
- **Files:** `src/snapshot/snapshot.ts`, the test file.
- **Size:** 37 bytes for half A, with G7a's 20 inside the combination
  (`spike-core-2.md`, `spike-getters.md`).
- **Docs:** none beyond T-21.
- **Depends on:** T-21.
- **Risk:** low.

#### T-23. Count the live object as running while its snapshot getter runs

- **Decision:** 10.
- **What:** while a snapshot getter's body runs, the live object the
  snapshot was taken from counts as having a getter running, so a write that
  reaches the live store around `this` throws, with nothing written and
  nobody told. A getter on a nested object that writes its parent or the root
  is not covered and stays unspecified.
- **Tests first** (`snapshot.computed.test.ts`): the rows of `g1-rows.ts`
  (`spike-core-3.md`) that change: a write through a reference to the store
  and a store method called by the getter throw on a snapshot; the child and
  other-store rows stay allowed; the same rows for the method of T-14. The
  row with a base-class arrow method waits for T-49.
- **Tests that change:** none (G1).
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  getter.recompute,store.write` and the same on Node inside the spread of
  T-22's commit.
- **Files:** `src/core/core.ts` (one exported function, or two),
  `src/snapshot/snapshot.ts` (one parameter through three functions).
- **Size:** 42 bytes on the main entry (`spike-core-3.md`, G1).
- **Docs:** none beyond T-21.
- **Depends on:** T-22.
- **Risk:** medium. The spike hands each snapshot's live object to its
  getters; T-25 removes that closure, and these rows must pass again there.

#### T-24. Add the `has` and `ownKeys` traps

- **Decision:** 7.
- **What:** a getter that asks `'b' in this` records a dependency on the key
  and whether it was present; `Object.keys(this)` records a per-node counter
  of the key set; both in the one shape of T-19. The `defineProperty` trap of
  T-11 moves the key counter when a definition adds a key or changes whether
  it is enumerable. An own-property check (`Object.hasOwn`,
  `hasOwnProperty`, `getOwnPropertyDescriptor`) is not tracked in 1.0.
- **Tests first** (`core.keyTraps.test.ts`): `in` and `Object.keys(this)`
  stay current after a key is added or removed (findings 30 and 32 on the
  live store); `length` of an array; a key defined with
  `Object.defineProperty`; a key made not enumerable; `Object.hasOwn` inside
  a getter pinned as the documented gap.
- **Tests that change:** 9, all fixes (`spike-traps.md`, T4, the live store),
  in `core.characterisation.getters.test.ts` and
  `core.fuzz.findings.test.ts`; the fuzz switch for the live part in
  `core.fuzz.test.ts` goes.
- **Done when:** `bun run test` passes; `bun run benchmark:core --check` and
  `bun run benchmark:core:node --check` pass; the mutation run on `core.ts`
  and `ownership.ts` leaves no unexplained survivor.
- **Files:** `src/core/core.ts`, `src/core/core.types.ts`,
  `src/core/ownership.ts`, the test files.
- **Size:** +156 bytes as spiked beside today's dependencies; written in
  T-19's shape, its figure comes from this build (decision 7).
- **Docs:** the reference and the page of codes' list of what 1.0 does not
  catch: an own-property check inside a getter; use `in`.
- **Depends on:** T-23.
- **Risk:** medium. The two records share the dependency shape of T-19,
  which no spike combined with them.

#### Checkpoint 4

The full suite with both fuzz tests, the typecheck, coverage, `bun run size`,
`bun run check:floor`. The mutation run on `core.ts`, `ownership.ts` and
`snapshot.ts`, with the lists of unkillable mutants redone for the rewritten
getter functions. Both core benchmarks in full with `--check`.
`bun run test:browser` and `bun run test:react:compatibility`.

### Step 5. Snapshots

#### T-25. Carry class getters on one derived prototype per class

- **Decision:** 43.
- **What:** a class getter is no longer an enumerable own accessor of every
  snapshot. For each class with getters, one object that inherits from the
  class prototype is made once, with one memoizing accessor per getter, and
  snapshots of that class are created from it. Inside a snapshot getter
  `this` is the frozen snapshot behind a tracker: it has the store's keys,
  and the class as its constructor and for `instanceof`. A getter of an
  object literal stays an own accessor. The live object for T-23's rule is
  found from `this` at each run, because the getters are installed once on
  a shared prototype. A class setter no longer gets an own key on a
  snapshot.
- **Tests first** (`snapshot.classGetters.test.ts`): the rows of both tables
  of `spike-snapshots.md`, N2 (the shape from outside: `Object.keys`, JSON,
  a spread, `instanceof`, `constructor`, the prototype; and what `this` sees);
  a tracked read through the React hook and a plain read share one cached
  result; three undo rounds leave the prototype chain one deep; a getter
  redefined on the class; `persist` saves the same fields as before; a
  reactive collection's snapshot no longer lists `size` and `snap.size` reads
  as before; the rows of T-23 again, unchanged.
- **Tests that change:** 14 with S1 in the spike, fixes except the eight of
  today's shape, which change by decision (`spike-snapshots.md`); the figure
  is a forecast, because T-18 to T-23 changed the layer first.
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  snapshot.first,snapshot.afterWrite,snapshot.cached` and the same on Node
  pass `--check`; `bun run test:react:compatibility` passes.
- **Files:** `src/snapshot/snapshot.ts`, `src/core/core.ts`, the React
  tracking helpers under `src/frameworks/react/utils/`, the new test file,
  and the shape tests that change (five files in the spike).
- **Size:** +239 bytes on the main entry, as spiked on today's snapshot
  layer; a forecast.
- **Docs:** the paragraph in `TUTORIAL.md` on getters in snapshots; the
  reference's "keep the class prototype" becomes "are instances of the
  class"; point 3 of "Snapshot prototype" in `ARCHITECTURE.md`; the reference
  and the 1.0 changeset (`.changeset/stable-one.md`) say that a spread or a
  serialised snapshot carries data, not computed values (decision 34). The
  DevTools tutorial changes in T-44.
- **Depends on:** T-24.
- **Risk:** high. The React tracking path has to share one cached result
  between a tracked and a plain read, and the getters of T-23 lose the
  closure they were built on.

#### T-26. Let a snapshot keep a cycle

- **Decision:** 44.
- **What:** `snapshot()` of a store that refers to itself returns a frozen
  snapshot with the same cycle in it. The React hook's comparison,
  `cloneSnapshot` and `withHistory` are made safe for it; the line added to
  `history.ts` moves into the shared restore in T-45. The `snapshot-cycle`
  error of T-03 has no caller left and goes, with its line on the page of
  codes.
- **Tests first** (`snapshot.cycles.test.ts`, `react.behavior.test.tsx`,
  `cloneSnapshot.test.ts`): the rows of the table of `spike-snapshots.md`,
  N3; a failed build leaves nothing cached; the two React tests; everything
  on a cycle gets a new snapshot on every write to any of it; `persist`
  reports the `JSON.stringify` failure through `onError`.
- **Tests that change:** 7, all of them asserting the throw.
- **Done when:** `bun run test` passes; the mutation run on `snapshot.ts`
  leaves no unexplained survivor; `bun run test:react:compatibility` passes.
- **Files:** `src/snapshot/snapshot.ts`, `src/utils/internal/internal.ts`,
  the React hook, `src/utils/cloneSnapshot/cloneSnapshot.ts`,
  `src/utils/history/history.ts`.
- **Size:** −9 bytes on the main entry, +21 on `./utils`, +30 on `./react`
  (which leaves its budget 8 bytes, `spike-snapshots.md`).
- **Docs:** one paragraph in `TUTORIAL.md` and one in `PATTERNS.md`: the
  loss of structural sharing on a cycle, and the alternatives (hold the
  parent's id, or hold the parent in an object the store does not proxy).
- **Depends on:** T-25.
- **Risk:** medium. The cache and the freeze order are the heart of
  `snapshot.ts`; the guard costs a tracked comparison 14 to 29 nanoseconds.

#### T-27. Keep a tuple a tuple, and give collection snapshots no mutators

- **Decision:** 45.
- **What:** `Snapshot<[string, number]>` is `readonly [string, number]`.
  `Snapshot<ReactiveMap<K, V>>` and `Snapshot<ReactiveSet<T>>` are two
  exported types with the queries and iterators and without `set`, `add`,
  `delete` and `clear`. A mutator called on a snapshot, through a tracking
  proxy, or on a collection its owner froze throws a `TypeError` with its
  code. `_entries` and `_items` stay public and are read-only in the snapshot
  types.
- **Tests first:** type tests in `types.collections.test.ts` and
  `types.snapshot.test.ts` for the tuple and the two snapshot types; runtime
  tests in `collections.test.ts` for each row of the table of N4, including
  the tracked proxy and `add()` on a set its owner froze and placed in a
  store; a subclass of a collection has the snapshot type of the collection
  it extends.
- **Tests that change:** the type tests in 3 files, all fixes (N4); the
  tests that read `_entries` or `_items` from a snapshot (four in
  `collections.test.ts`, one in `persist.test.ts`), incidental.
- **Done when:** `bun run typecheck` passes; `bun run test` passes;
  `bun run check:package` passes.
- **Files:** `src/collections/collections.ts`, `src/types.ts`,
  `src/collections/index.ts`, the test files.
- **Size:** +55 bytes on `./collections` with a short message.
- **Docs:** the reference's snapshot types; the collections guide: writing to
  the backing arrays directly is unspecified, use the methods.
- **Depends on:** T-26.
- **Risk:** low.

#### Checkpoint 5

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`, `bun run check:package`. The mutation run on `snapshot.ts`,
`core.ts`, `history.ts` and `collections.ts`. Both core benchmarks in full
with `--check`. `bun run test:browser`, `bun run test:react:compatibility`,
`bun run test:react:compiler`, `bun run test:react:memory` and
`bun run benchmark:react`, because the React hook changed.

### Step 6. Delivery

#### T-28. Deliver through one queue, with a bound

- **Decision:** 13.
- **What:** a write made while synchronous subscribers are being called is
  queued and delivered after the round that is running, before the
  outermost write returns. A removed subscriber is not called; one added
  during delivery hears the next change. One queue serves all stores; on the
  batched path one microtask serves every round. A subscriber hears of its
  own write once. Delivery stops after 100 rounds and reports once with the
  code `delivery-loop`, where a subscriber's error is reported; the store
  keeps the writes and waiting subscribers are called at the next write. The
  first round reads the owners directly.
- **Tests first** (`core.deliveryTurns.test.ts`): the bound on each path,
  with the store usable afterwards; a loop across two stores; a subscriber
  added during a round after a re-entrant write; a transaction opened and
  closed inside a subscriber; a removed subscriber is not called; a write in
  a batched subscriber is delivered in the same microtask; a subscriber of
  store A that writes store B makes B current at once.
- **Tests that change:** 16: 13 fixes and 3 incidental
  (`spike-delivery.md`, D1), among them
  `core.characterisation.notifications.test.ts` and
  `core.deliveryTurns.test.ts`.
- **Done when:** `bun run test` passes; on a quiet machine `bun run
  benchmark:core --only store.write.sync,store.write,store.write.batched` and
  the same on Node: `store.write.sync` inside the spread of today's
  (decision 13; open point 11 on which baseline), or else the plain queue is
  taken and the reference states the slowdown; the mutation run on `core.ts`
  kills the mutants of the `try` and `finally` around the drain.
- **Files:** `src/core/core.ts`, the test files, the page of codes.
- **Size:** the queue 33 bytes, the bound and its message 75 to 130 as
  spiked and less with a code, the variant 30 (decision 13).
- **Docs:** the reference: adapter values of another store may lag inside
  one delivery round; the order of calls; what a removed or a late
  subscriber gets.
- **Depends on:** T-27.
- **Risk:** high. Every adapter relies on synchronous delivery; the browser
  and framework suites were not run by the spike.

#### T-29. Guard the report of a subscriber's error, and catch a rejection

- **Decision:** 14.
- **What:** a subscriber's error is caught, the others run, the writer is
  not told. The rejection of an `async` subscriber is caught and logged the
  same way. If `console.error` throws, the round goes on and the writer is
  still not told.
- **Tests first** (`core.deliveryTurns.test.ts`): a `console.error` that
  throws during a round, then a write that is delivered; a batched `async`
  subscriber that rejects is logged; the writer's return value and error are
  untouched by a failing subscriber.
- **Tests that change:** 1, a fix (D2).
- **Done when:** `bun run test` passes; the mutation run on `core.ts` leaves
  no unexplained survivor.
- **Files:** `src/core/core.ts`, the test file.
- **Size:** +25 bytes for the rejection handler; the guard was not spiked.
- **Docs:** a paragraph under `subscribe` in `API_REFERENCE.md`.
- **Depends on:** T-28.
- **Risk:** low.

#### T-30. Make a setter a transaction

- **Decision:** 15.
- **What:** a class setter that writes two fields notifies a synchronous
  subscriber once (finding 43).
- **Tests first** (`core.transactions.test.ts`): a setter that writes two
  fields notifies a synchronous subscriber once; a setter that throws
  closes its transaction.
- **Tests that change:** 2, both fixes.
- **Done when:** `bun run test` passes.
- **Files:** `src/core/core.ts`, the test file.
- **Size:** +5 bytes on the main entry.
- **Docs:** one sentence in `API_REFERENCE.md` and one in `TUTORIAL.md`.
- **Depends on:** T-29.
- **Risk:** low.

#### T-31. Refuse a promise in `batch()` by its type, and an `async` function when it runs

- **Decision:** 16.
- **What:** the parameter of `batch()` becomes a function whose result is
  not a promise, with a type whose error says why. At run time `batch()`
  throws a `TypeError` with the code `batch-async` for a native `async`
  function, before calling it, in every build.
- **Tests first:** a type test with `@ts-expect-error` for `batch(async () =>
  …)` and for `batch(() => { store.loading = true; return save(); })`; a
  runtime test that an `async` function passed through `any` throws before
  anything is written; the second shape called from JavaScript is accepted
  and batches its writes.
- **Tests that change:** 3 type assertions in 2 test files
  (`types.exports.test.ts` and the type test of `batch`), and 2 runtime
  tests, both fixes; the `async` runtime test becomes a type test plus a
  JavaScript-style call.
- **Done when:** `bun run typecheck` passes; `bun run test` passes; the
  code is on the page of codes.
- **Files:** `src/core/core.ts`, the test files, the page of codes.
- **Size:** the type 0 bytes; the check 50 to 83 bytes as spiked, less with
  a code.
- **Docs:** the `batch` section of `API_REFERENCE.md` and the tutorial; the
  reference states that an `async` method is a transaction up to its first
  `await`.
- **Depends on:** T-30.
- **Risk:** low. An `async` function turned into a generator by a build step
  is not seen.

#### Checkpoint 6

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`. The mutation run on `core.ts`. Both core benchmarks in full
with `--check`; the write ratio should fall (2.69 to 2.21 on Bun and 1.4 to
1.06 on Node in the spike). Every framework suite, because every adapter is
a synchronous subscriber: `bun run test:browser`, `bun run
test:react:compatibility`, `bun run test:frameworks:compatibility`,
`bun run test:angular:compatibility`, `bun run test:react:next`.

### Step 7. Collections

#### T-32. Give reactive collections one membership rule

- **Decision:** 42.
- **What:** `-0` and `+0` are one key, as in a native `Map`, and a
  collection constructed from a raw object and its proxy holds it once.
  Membership stays by identity for every member: a raw object, its proxy and
  each of its snapshots are one member.
- **Tests first** (`collections.identity.test.ts`): `-0` in every path
  (`set`, `get`, `has`, `delete`, the constructor, iteration); a constructor
  given an object and its proxy; a second `add()` of another snapshot of one
  object changes nothing.
- **Tests that change:** the 2 tests that pin findings 33 and 34, fixes.
- **Done when:** `bun run test` passes; the mutation run on
  `collections.ts` leaves no unexplained survivor.
- **Files:** `src/collections/collections.ts`, the test file.
- **Size:** +13 bytes on `./collections`.
- **Docs:** the tutorial's sentence on `-0`; the guide says a collection
  cannot hold two snapshots of one object as two members.
- **Depends on:** T-31.
- **Risk:** low.

#### T-33. Answer `has()` and `get()` on a collection snapshot from an index

- **Decision:** 42.
- **What:** a snapshot of a collection builds an index on its second lookup
  and answers `has()` and `get()` from it. A read through the tracking proxy
  of the React hook without a selector still scans. No index beside the live
  array.
- **Tests first** (`collections.test.ts`): a snapshot lookup builds the
  index on the second call; the index survives structural sharing (an
  unchanged collection in a newer snapshot reuses it); a tracked read through
  the hook still sees what was read; `withHistory` undo and redo answer
  correctly.
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run size` shows `./collections`
  near the spike's 843 bytes and under the ceiling of 950.
- **Files:** `src/collections/collections.ts`, the test file.
- **Size:** `./collections` from 727 to about 843 bytes (`adapters-collections.md`,
  A7).
- **Docs:** the collections guide: a lookup on a snapshot is indexed; on the
  live collection it is linear.
- **Depends on:** T-32.
- **Risk:** low. A tracked lookup was not timed.

#### Checkpoint 7

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`. The mutation run on `collections.ts`. Both core benchmarks in
full with `--check`. `bun run test:react:compatibility`.

### Step 8. Utilities

The `persist` rules were last built as one (`spike-persist-2.md`, on top of
the combination of `persist-devtools.md`). Stage 4 writes them in the order
of their decisions; the paths of that report's table are spread over the
tasks below by the rule they test. Its figures: 98 lines added and 36
removed in `persist.ts` and `persist.types.ts`, 245 bytes over that
combination, 48 tests changed.

#### T-34. Restore before `persist()` returns when the storage is synchronous

- **Decision:** 19.
- **What:** `persist()` restores before it returns when the storage is
  synchronous, and awaits only a storage that returns a promise. No option;
  `skipHydration` keeps its meaning. `hydrated` settles even when the store
  cannot be snapshotted at the start of a read; `rehydrate()` keeps the
  `finally` that guarantees it. The handle exists before the first read
  starts.
- **Tests first** (`persist.hydration.test.ts`): a synchronous storage: the
  state is restored when `persist()` returns; an asynchronous one: after
  `hydrated`; `rehydrate()` with a synchronous storage; a `save()` queued
  before a read; `hydrated` settles when the first snapshot throws. The
  constructor case waits for T-50.
- **Tests that change:** 1, incidental: it relies on the old timing.
- **Done when:** `bun run test` passes; the mutation run on `persist.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/persist/persist.ts`, the test file.
- **Size:** −6 bytes on `./utils` (P1).
- **Docs:** `PERSIST_TUTORIAL.md` (when hydration happens; call `persist()`
  after the store is constructed, never inside a constructor) and
  `REACT_SSR.md` (on the client, `prepareStoreForHydration(store)` is called
  before `persist(store)`, decision 41).
- **Depends on:** T-33.
- **Risk:** low.

#### T-35. Report every stored record `persist` cannot use, and keep what it could not restore

- **Decision:** 21 (the kinds, the handle that does not write, the reports).
- **What:** a record read and not restored is one of the five kinds of
  decision 21's table, reported as `'parse'` or `'read'`. A handle facing a
  newer record or one its `migrate`, `merge` or `deserialize` failed on does
  not write: an edit saves nothing and does not repeat the report, `save()`
  reports `'write'` and rejects, a `rehydrate()` that finds it again reports
  and rejects, and `lastError` holds the report. The handle writes again
  after `clear()`, after a `rehydrate()` that restores, finds none or finds
  nothing to keep, and when such a record or its removal arrives from
  another tab. `onError` receives the handle as its third argument; an
  error it throws is logged with `console.error`; without `onError` the
  report goes to `console.error` with its code. The version rule is one
  rule (a finite number of zero or more; a missing `version` is 0). `migrate`
  is called only for a lower version; a thenable it returns gets a handler
  and counts as not migrated. Expiry comes first. `PersistOperation` gains
  no member. The scattered envelope guards (M54) that are left go here.
- **Tests first** (`persist.errors.test.ts`, `persist.validation.test.ts`,
  `persist.tabs.test.ts`), the paths of `spike-persist-2.md`: 3, 4b, 4c, 4e,
  5, both rows of 6, 7 with `syncTabs`, 7c, 10 with a newer version, both
  storages of 11, 12, 12b, 16; `no-onerror.ts` (a newer record reported to
  `console.error` and kept); a record with `version: null` or `"2"` has
  nothing to keep; an `expiresAt` that is neither a number, `null` nor
  missing has nothing to keep; the removal of the record in another tab lets
  a blocked handle write again (decided, not built).
- **Tests that change:** P2's 8, rewritten to expect the report (fixes, as
  classed in `persist-devtools.md`); the 5 that check the arguments of
  `onError`, incidental; the type test of the two-argument `onError` in
  `types.utils.test.ts`, incidental.
- **Done when:** `bun run test` passes; `bun run typecheck` passes; the
  mutation run on `persist.ts` leaves no unexplained survivor.
- **Files:** `src/utils/persist/persist.ts`,
  `src/utils/persist/persist.types.ts`, the test files, the page of codes.
- **Size:** P2 +144 on `./utils` alone; of the rules' 245, the default
  `console.error` 7 and rules 1, 2, 4 and 7 together 120, shared with T-39.
- **Docs:** `PERSIST_TUTORIAL.md`: the table of the five kinds, the version
  rules (a record with no version counts as version 0), the error section,
  the two losses that stay; the reference's `onError` line.
- **Depends on:** T-34.
- **Risk:** medium. `blocked` touches every write path.

#### T-36. Let a handle write only after it has read

- **Decision:** 21 (a handle writes only after it has read).
- **What:** until its first read has settled a handle saves nothing: with
  `skipHydration` until the first `rehydrate()`, with an asynchronous storage
  while the first read is in flight. An edit made before then stays in the
  store; when the read restores a record, the edit wins for the field it
  changed and the result is saved. `save()` rejects before the first read has
  settled; `clear()` works at any time. A read that throws counts as no read
  (`read-failure-blocks.patch`).
- **Tests first** (`persist.reads.test.ts`, `persist.hydration.test.ts`):
  both rows of path 8 (`skipHydration` with a record of the same version and
  with a newer one); every row of path 9 (an asynchronous storage, an edit and
  a `save()` during the first read); path 13 (the first `getItem` throws,
  then an edit: the record is kept).
- **Tests that change:** 24 incidental tests that use `skipHydration` as a
  set-up and save before any read, rewritten to `await rehydrate()` first
  (listed by name in `spike-persist-2.md`, "Tests", in
  `persist.api.test.ts`, `persist.concurrent.test.ts`,
  `persist.debounce.test.ts`, `persist.dispose.test.ts`,
  `persist.errors.test.ts`, `persist.reads.test.ts`,
  `persist.validation.test.ts`, `persist.writes.test.ts`); 2 fixes that pin
  `save()` replacing a record it never read; 3 that pin the read winning over
  an edit made before `rehydrate()`, changed by decision.
- **Done when:** `bun run test` passes; the mutation run on `persist.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/persist/persist.ts` and the test files above.
- **Size:** +54 bytes on `./utils` for rule 3, +8 for the failed read.
- **Docs:** `PERSIST_TUTORIAL.md`: "It does not delay writes" is reversed;
  with `skipHydration` nothing is saved until `rehydrate()` has been called.
- **Depends on:** T-35.
- **Risk:** medium. `hasRead` touches every write path; the 24 rewritten tests
  are the guard that write ordering is unchanged.

#### T-37. Validate the options of `persist()` when it is called

- **Decision:** 22.
- **What:** `persist()` throws a `TypeError` with a code, before it reads or
  writes, for a prototype key, a getter or a method named in `properties`; a
  transform that is half written; a `version` that is not a finite number of
  zero or more; a `migrate` whose `Symbol.toStringTag` is exactly
  `'AsyncFunction'`.
- **Tests first** (`persist.validation.test.ts`): each refused option throws
  and nothing is read; `version: -1`, `NaN` and `'1'` throw; path 4d; a
  mock function of the test runner is accepted as `migrate`.
- **Tests that change:** 5: 4 fixes and 1 incidental (P3).
- **Done when:** `bun run test` passes; the codes are on the page of codes.
- **Files:** `src/utils/persist/persist.ts`, the test file, the page of
  codes.
- **Size:** +82 bytes on `./utils` (P3), and +56 for the checks of `version`
  and `migrate` (`spike-persist-2.md`).
- **Docs:** `PERSIST_TUTORIAL.md` (a setter pair lists its backing field).
- **Depends on:** T-36.
- **Risk:** low.

#### T-38. Make a restore all or nothing

- **Decision:** 23.
- **What:** a restore copies every value first, writes them in one
  transaction, checks that the result can be snapshotted, and rolls back if
  it cannot. A nested `__proto__` key is dropped. A record whose restore was
  rolled back, or that is nested too deep to copy, has nothing to keep: it is
  reported and the next save replaces it. The per-field bookkeeping of a
  restore, which this and T-37 make unreachable, goes in this commit
  (decision 20), among it `if (after > before + 1 && pending.size)
  discardEditedFields();` and the `clearedVersion` step inside the loop if
  the mutation run shows it dead.
- **Tests first** (`persist.restore.test.ts`): a deeply nested record is
  reported and replaced by the next save (path 14, as decided, not as
  built); the rollback leaves the store as it was; a nested `__proto__` is
  dropped; a synchronous subscriber is told once after the whole record is
  in.
- **Tests that change:** 1, a fix (P4).
- **Done when:** `bun run test` passes; the mutation run on `persist.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/persist/persist.ts`,
  `src/utils/cloneSnapshot/cloneSnapshot.ts`, the test file.
- **Size:** +74 bytes on `./utils` (P4).
- **Docs:** the persist tutorial's sentence that a synchronous subscriber is
  told once per field changes in this commit.
- **Depends on:** T-37.
- **Risk:** medium. The rollback has to keep `skipAutoSaveVersion` right.

#### T-39. Flush a pending save on `pagehide`, and write back only an expiry stamp

- **Decision:** 24.
- **What:** a debounced save still waiting is written when the page is
  hidden. A migrated record is not written back at load; the first save
  writes it. One thing is written back at load, through the ordinary save
  path: a record of the configured version with no `expiresAt`, or `null`,
  read by a handle whose `expireIn` is a finite number, is saved again with
  an `expiresAt`. A record from another tab is never written back.
- **Tests first** (`persist.debounce.test.ts`, `persist.hydration.test.ts`,
  `persist.tabs.test.ts`): a fake `pagehide` writes the pending save; path 2
  (a migrated record kept until the first edit); path 10b (written once
  with an `expiresAt`); path 10c with `expireIn: Infinity` writes nothing (not
  built); path 15 (no write-back from another tab). No test pins either
  write-back today.
- **Tests that change:** none expected.
- **Done when:** `bun run test` passes; a `pagehide` case in
  `tests/browser/persistence.spec.ts` passes under `bun run test:browser`.
- **Files:** `src/utils/persist/persist.ts`, the test files,
  `tests/browser/persistence.spec.ts`.
- **Size:** P5 +102 on `./utils` alone, which included the write-back
  after a migration that is now taken out.
- **Docs:** the persist tutorial says that hydration does not rewrite
  storage; the stamp is the exception.
- **Depends on:** T-38.
- **Risk:** medium. A real page unload and a real second tab were not run by
  any spike.

#### T-40. Ignore a storage event from another storage area

- **Decision:** 25.
- **What:** when `storage` is a `Storage`, an event whose `storageArea` is
  another area is ignored. An event without `storageArea` is still accepted.
- **Tests first** (`persist.tabs.test.ts`): an event from another area
  changes nothing; one without `storageArea` is applied.
- **Tests that change:** none.
- **Done when:** `bun run test` passes.
- **Files:** `src/utils/persist/persist.ts`, the test file.
- **Size:** +24 bytes on `./utils`.
- **Docs:** none.
- **Depends on:** T-39.
- **Risk:** low.

#### T-41. Name `devtools` entries after the method, through a hook in the core

- **Decision:** 27 (entries, the hook, the name).
- **What:** `devtools` subscribes on the synchronous channel. A store
  method sends one entry, named after the key it was first read under, when
  the outermost call returns, with one snapshot. Direct writes outside a
  method send one `STORE_UPDATE` entry per task, from a microtask. The core
  holds one place for a function, empty unless `devtools` is connected;
  `devtools()` fills it while at least one connection is open and empties it
  when the last one is disposed; a method call tests it and, when it is
  empty, runs today's code. The naming lives in `devtools.ts`.
- **Tests first** (`devtools.test.ts`, with a fake extension, without
  flushing a tick): entry names with one and two connections, after one is
  disposed, after a reconnect; a method that throws while connected leaves
  the name cleared; a class stored as data and constructed while connected;
  an arrow function written to a new key, and one assigned in a constructor;
  after `store.b = store.a`, `store.b()` is named `a`; two direct writes in
  one task send one `STORE_UPDATE`.
- **Tests that change:** none (stage 1 added none for `devtools`); the type
  test "DevtoolsOptions has an optional name and an optional enabled flag"
  changes only if the option list changes (open point 12).
- **Done when:** `bun run test` passes; `bun run benchmark:core --only
  store.method` and `bun run benchmark:core:node --only store.method` inside
  the spread of T-40's commit.
- **Files:** `src/core/core.ts`, `src/storeRuntime.ts`,
  `src/utils/devtools/devtools.ts`, the test file.
- **Size:** +12 bytes on the main entry; +57 on `./utils` for the naming
  moved out of the core (decision 4).
- **Docs:** `DEVTOOLS_TUTORIAL.md`: entries are named after methods.
- **Depends on:** T-40.
- **Risk:** medium. The entry ids the extension sends back were never
  verified; two copies of `./utils` (ESM and CommonJS) overwrite each
  other's hook.

#### T-42. Make a `devtools` jump exact, through one restore shared with `withHistory`

- **Decision:** 27 (time travel, messages).
- **What:** a jump replaces the state exactly, in one transaction, without
  calling setters, through one restore function in `cloneSnapshot.ts` that
  `withHistory` uses as well; history's own copy of it goes in this commit.
  A jump to an entry this session sent restores the snapshot that was sent,
  so a `Date` stays a `Date`; a jump the extension sends as JSON restores
  data. `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled.
- **Tests first** (`devtools.test.ts`): the rows of P7's reproduction: a jump
  calls a synchronous subscriber once; an unknown field is not added; a
  setter-only accessor is not called; a `Date` stays a `Date`; a field
  missing from the state is deleted; an edit in the same tick as a jump is
  sent; each of the four messages; a malformed `state` changes nothing.
- **Tests that change:** none expected; the history tests must stay green.
- **Done when:** `bun run test` passes; the mutation run on `history.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/devtools/devtools.ts`,
  `src/utils/cloneSnapshot/cloneSnapshot.ts`, `src/utils/history/history.ts`,
  the test file.
- **Size:** part of P7's +403 on `./utils`, not measured apart.
- **Docs:** `DEVTOOLS_TUTORIAL.md`: time travel and the four messages.
- **Depends on:** T-41.
- **Risk:** medium. T-45 changes the shared restore again, as merged
  dependency 14 warned.

#### T-43. Turn `devtools` on by default only where `NODE_ENV` says development

- **Decision:** 27 (`enabled`), with the guard form of 36.
- **What:** `enabled` defaults to on only where `process.env.NODE_ENV` can be
  read and is not `production`, read in the form of T-02. Where there is no
  `process`, the default is off. `enabled: true` turns it on anywhere.
- **Tests first** (`devtools.test.ts`): with `NODE_ENV` set to `production`
  for the test's duration, nothing connects; with `process` absent, nothing
  connects; with `NODE_ENV=test`, it connects; `enabled: true` connects in
  production. `productionBundle.test.ts` still passes.
- **Tests that change:** existing `devtools` tests that relied on the
  default of `true` under a missing `NODE_ENV`, if any.
- **Done when:** `bun run test` passes; `bun test
  packages/classy-store/tests/size` passes.
- **Files:** `src/utils/devtools/devtools.ts`, the test file.
- **Size:** not measured apart.
- **Docs:** `DEVTOOLS_TUTORIAL.md` names the builds in which the default is
  off, and says that the extension receives every state, so a store with
  secrets passes `enabled: false` (M76).
- **Depends on:** T-42, T-02.
- **Risk:** low.

#### T-44. Send the root store's class getter values to `devtools`

- **Decision:** 27, 43.
- **What:** a snapshot no longer lists class getters (T-25), so `devtools`
  adds the values of the root store's class getters to what it sends, each
  read guarded: a getter that throws shows its error text and the entry is
  still sent. Nested objects are sent as they are.
- **Tests first** (`devtools.test.ts`, K3 of `spike-combos.md`): the payload
  for a class with fields and getters; one getter that throws; an inherited
  getter; a root without getters (the snapshot itself is sent); a cycle; a
  JSON jump that carries the getter keys back restores the fields and adds no
  key.
- **Tests that change:** none.
- **Done when:** `bun run test` passes.
- **Files:** `src/utils/devtools/devtools.ts`, the test file.
- **Size:** +95 bytes on `./utils`.
- **Docs:** one sentence in `DEVTOOLS_TUTORIAL.md`; it also says that the
  panel shows the getter values of the root store only.
- **Depends on:** T-43.
- **Risk:** low. A getter of an object literal that throws still loses the
  entry, as today.

#### T-45. Restore a nested object in place on undo and time travel

- **Decision:** 30, and the restore half of 44.
- **What:** the shared restore of T-42 goes down while both sides are
  containers of the same kind and writes only what differs; where a restored
  value is the snapshot of an object that is still live, the live object is
  put back. It enters each live object at most once per restore and treats
  the recorded root as the store, and takes over the line T-26 added to
  `history.ts`. Before an object is restored in place, one check asks whether
  every write the restore would make there is allowed, counting only the
  writes it will make; a container that fails it is replaced at its parent by
  a copy; a root that fails it makes the restore throw a `TypeError`, with
  its code, before anything is written, and the history does not move.
- **Tests first** (`history.restore.test.ts`, `devtools.test.ts`): a jump by
  JSON on a sealed store whose methods are own fields, first (decision 30);
  the two tables of V4 (`spike-classes-2.md`), the 1,000-row case as a count
  of kept row snapshots, a row brought back after removal, a field restored
  as `undefined`, a row moved to another store; the six rows of K1 for undo,
  redo and a jump by id (each returns, with the values, node identity and
  one synchronous notification); the four rows of the addendum of
  `spike-combos.md` (an object moved or shared); the ten rows of G3
  (`spike-core-3.md`), each asserting the return or the throw, the values,
  whether the container is the same object, one notification, and
  `canUndo` and `canRedo`; a DevTools jump on a frozen root.
- **Tests that change:** none beyond those of decisions 30 and 44 (K1, G3);
  the history tests that pin a replaced branch, by decision if any fail.
- **Done when:** `bun run test` passes; the mutation run on `history.ts`
  leaves no unexplained survivor; the root error's code is on the page of
  codes.
- **Files:** `src/utils/cloneSnapshot/cloneSnapshot.ts`,
  `src/utils/history/history.ts`, one internal export from
  `src/core/core.ts`, the test files.
- **Size:** +113 (V4), +16 (K1) and +211 (G3) bytes on `./utils`.
- **Docs:** the reference's "changed fields are replaced with mutable
  copies" goes; `HISTORY_TUTORIAL.md`: a history records one store, an
  object two stores share is undone in both, a move between two stores is
  undone by a history on a store that holds both; `DEVTOOLS_TUTORIAL.md`: a
  jump sent as JSON restores data, not class instances.
- **Depends on:** T-44.
- **Risk:** high. Every undo of every store goes through the new code; the
  1,000-row undo was not timed on Node and has no core benchmark row.

#### T-46. Record an edit made in the same tick as `undo()`

- **Decision:** 28.
- **What:** `withHistory` drops its `restoring` counter and runs undo and
  redo as one transaction each, so an edit made in the same tick is
  recorded (findings 57 and 58).
- **Tests first** (`history.sameTick.test.ts`): `history.undo(); store.value
  = 9;` with no flush records the edit and clears `canRedo`; the same after
  `redo()`.
- **Tests that change:** 1, a fix.
- **Done when:** `bun run test` passes; the mutation run on `history.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/history/history.ts`, the test file.
- **Size:** −24 bytes on `./utils` (P8).
- **Docs:** the history guide's sentence on the same tick goes.
- **Depends on:** T-45.
- **Risk:** low.

#### T-47. Restore a function held in an own field, by reference

- **Decision:** 29.
- **What:** undo removes a function that was added to a field and puts back
  one that was replaced, by reference. Methods on the prototype are
  untouched. A state from outside (a JSON jump) carries no functions, and
  the shared restore neither deletes nor writes a function field for it.
  If the change in `history.ts` turns out larger than a few lines, stop and
  report (decision 29).
- **Tests first** (`history.fields.test.ts`, `devtools.test.ts`): a callback
  that is replaced; a callback whose key was deleted; a function field that
  held another function at the time of the undo; a jump by JSON on a store
  whose methods are own fields keeps every method; after a restore, a read
  through the store hands out the same method as before.
- **Tests that change:** the tests that pin undo skipping functions (finding
  60, pinned, not marked), by decision.
- **Done when:** `bun run test` passes; the mutation run on `history.ts`
  leaves no unexplained survivor.
- **Files:** `src/utils/history/history.ts`,
  `src/utils/cloneSnapshot/cloneSnapshot.ts`, the test files.
- **Size:** not built.
- **Docs:** `HISTORY_TUTORIAL.md`: undo restores a function field by
  reference.
- **Depends on:** T-46.
- **Risk:** medium. The change was never built.

#### T-48. Let `subscribeKey` read the live value, without a snapshot of the whole store

- **Decision:** 31.
- **What:** `subscribeKey` reads the live value, and takes a snapshot of that
  one node only when the node or its version changed. No selector form, no
  equality option, no immediate call.
- **Tests first** (`subscribe-key.test.ts`): the rows of `repro/n5.ts`
  against the contract (each value `===` the field of a whole snapshot); a
  getter key; a method key; a write elsewhere builds no root snapshot (a spy
  on `snapshot`, or a getter elsewhere that counts its runs).
- **Tests that change:** none.
- **Done when:** `bun run test` passes.
- **Files:** `src/utils/subscribe-key/subscribe-key.ts`, the test file.
- **Size:** +62 bytes on `./utils`.
- **Docs:** none.
- **Depends on:** T-47.
- **Risk:** low.

#### Checkpoint 8

The full suite, the typecheck, coverage, `bun run size` (`./utils` under its
ceiling of 4,350), `bun run check:floor`. The mutation run on `persist.ts`,
`history.ts`, `core.ts`. Both core benchmarks in full with `--check`.
`bun run test:browser` (the persistence spec), `bun run docs:build` and
`bun run docs:test`, because the tutorials of `persist`, `devtools` and
`history` changed.

### Step 9. The base class

#### T-49. Add the base class `ClassyStore`

- **Decision:** 11.
- **What:** `ClassyStore` is exported from the main entry. Its constructor
  returns the store, so a class that extends it is a store from its first
  line: field initialisers, the constructor body, arrow-function fields,
  methods bound in the constructor and whatever the constructor starts all
  write through the store. `createClassyStore(instance)` stays and returns
  the same store for a `ClassyStore` instance. Nested instances stay opaque
  unless the class sets `static [PROXYABLE] = true`; `= false` is documented
  as opaque on purpose. The base class has no rule of its own for functions.
- **Tests first** (`classyStore.test.ts`): the base class on two
  compilations of one fixture class through `Bun.Transpiler` (as it is, and
  with `useDefineForClassFields: false`), each with the four checks of V1 (the
  first snapshot is right, an arrow method notifies once, a field write and a
  timer's write are seen); the seven adapter tests of V2 (Vue, Svelte, Solid,
  Angular, `createStoreHook`, `useLocalStore`); the seven shape and type tests
  of V6; a `#private` field works on the live store and is not in a snapshot;
  `static [PROXYABLE] = false` stays opaque; `types.index.test.ts` and
  `types.exports.test.ts` gain `ClassyStore`.
- **Tests that change:** the export list in `types.index.test.ts` and
  `types.exports.test.ts`, incidental.
- **Done when:** `bun run test` passes; `bun run typecheck` passes; the 17
  compilations of `spike-classes-2.md`, V1, run again on the real code give
  the same four results (open point 13 on where they run).
- **Files:** `src/core/core.ts`, `src/index.ts`, `src/storeRuntime.ts`, the
  new test file, the two type test files.
- **Size:** +13 bytes on the main entry.
- **Docs:** `API_REFERENCE.md`; the tutorial's section on arrow functions;
  `ARCHITECTURE.md`; `CLAUDE.md` ("No arrow function methods"); the
  sentences of decision 11, "What it costs a user": a callback held in a
  field is compared on a snapshot; an arrow method is called on the store,
  and taken from a snapshot it writes one write at a time; under `StrictMode`
  `useLocalStore` makes two stores in development; a class that has to
  extend another class uses `createClassyStore(new X())`; a `#private` field
  is never state.
- **Depends on:** T-14, T-11, T-45.
- **Risk:** medium. A compiler emits class fields in more than one shape; the
  unit suite covers two of the 17.

#### T-50. Add the tests that need the base class

- **Decision:** 1, 10, 19 (with 11).
- **What:** a commit of tests: the rows that the order for stage 4 places
  here because they need `ClassyStore`. Each pins behaviour decided earlier;
  none is expected to fail. A failure here is a defect of the earlier task,
  fixed in this commit only if the fix is within that decision.
- **Tests first:**
  - `core.functions.test.ts`: an arrow-function field of a subclass is one
    transaction; a subclass's arrow field that overrides the parent's is one
    transaction, with class fields compiled as definitions and as
    assignments; its name for `devtools` is its key; a call taken from a
    snapshot writes the live store, one notification per write
    (decision 1);
  - `persist.hydration.test.ts`: `persist()` called in a constructor of a
    subclass: the subclass's field initialisers run after the restore and
    the next save writes them over the record; the test pins that, so that
    the guide's sentence stays true (decision 19);
  - `snapshot.computed.test.ts`: a getter read on a snapshot that calls an
    arrow-function method of its own class throws, with nothing written and
    nobody told; a base-class store built inside a getter works on both
    layers (decision 10).
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run check:floor` is clean.
- **Files:** the three test files.
- **Size:** none.
- **Docs:** none.
- **Depends on:** T-49.
- **Risk:** low as a commit; a failure here reopens T-14, T-23 or T-34.

#### Checkpoint 9

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`, `bun run check:package`. The mutation run on `core.ts`. Both
core benchmarks in full with `--check`. Every framework suite, because the
base class reaches every adapter: `bun run test:browser`,
`bun run test:react:compatibility`, `bun run test:react:compiler`,
`bun run test:react:next`, `bun run test:frameworks:compatibility`,
`bun run test:angular:compatibility`, and the Solid and Angular example
builds.

### Step 10. Adapters

#### T-51. Vue: build the snapshot at the read, subscribe to nothing on the server, and return a read-only ref

- **Decision:** 37 (Vue), 38.
- **What:** the Vue adapter returns a custom ref; its listener only marks the
  value as changed, and the snapshot is taken at the next read. On the server
  it subscribes to nothing and reads the store at every read. The ref is
  typed `Readonly<Ref<Snapshot<T>>>`, and a write to it throws a `TypeError`
  with its code. First, the type is compiled against Vue 3.2.0, the floor of
  the peer range (decision 38).
- **Tests first** (`vue.test.ts`, `types.vue.test.ts`): N direct writes build
  one snapshot at the read (a spy on `snapshot`, or a count of rebuilds of a
  getter); a read after dispose holds the last delivered value; no listener
  is left after three `renderToString` renders; a write in `onServerPrefetch`
  renders; a write to the ref throws with the code.
- **Tests that change:** 1 incidental (`isShallow` on the ref); two
  assertions of `types.vue.test.ts` flip.
- **Done when:** `bun run test` passes;
  `node packages/classy-store/tests/frameworkCompatibility/runCompatibility.mjs
  vue@3.2.0` (after `bun run build`) passes; `bun run test:browser` passes
  for `vue.spec.ts`.
- **Files:** `src/frameworks/vue/vue.ts`, `vue.test.ts`,
  `types.vue.test.ts`, the page of codes.
- **Size:** `./vue` to about 370 bytes, or 375 with room
  (`adapters-collections.md`, A2); ceiling 400, with 20 bytes of it for the
  setter that throws, which no spike built.
- **Docs:** `VUE.md` and `API_REFERENCE.md`: "backed by `shallowRef`" goes,
  the return type, a sentence on server rendering; the guide names `batch()`
  beside the timing (M76).
- **Depends on:** T-50.
- **Risk:** medium. The Vue packed-app suite and a real server render were
  not run by the spike.

#### T-52. Angular: build the snapshot at the read, update in `untracked()`, take an injector, check the context itself

- **Decision:** 37 (Angular), 39.
- **What:** the adapter's listener marks the value as changed and the
  snapshot is taken at the next read; the signal is updated inside
  `untracked()`, around the version bump. `injectClassyStore(store,
  {injector})` works outside an injection context. The adapter checks for an
  injection context itself and throws its own error, with the prefix and a
  code, in every Angular build.
- **Tests first** (`angular.test.ts`, `types.angular.test.ts`): a store
  write made while a `computed` runs is not lost; `{injector}` outside a
  context; the error outside a context names the function and carries the
  code; N direct writes build one snapshot at the read; a read after dispose
  holds the last delivered value.
- **Tests that change:** one assertion in `types.angular.test.ts`.
- **Done when:** `bun run test` passes; `bun run test:angular:compatibility`
  passes; `bun run --filter classy-store-angular-example build` passes.
- **Files:** `src/frameworks/angular/angular.ts`, `angular.test.ts`,
  `types.angular.test.ts`, the page of codes.
- **Size:** `untracked()` +19 bytes, the option and the message +51
  (`adapters-collections.md`, A3), plus A1's 34 to 44; the ceiling of 425
  holds 30 bytes for the adapter's own check, which no spike built.
- **Docs:** `ANGULAR.md`, `API_REFERENCE.md`; the guide names `batch()`.
- **Depends on:** T-51.
- **Risk:** medium. The library's own context check was not spiked.

#### T-53. Solid: build the snapshot at the read

- **Decision:** 37 (Solid).
- **What:** the listener only marks the value as changed and the accessor
  takes the snapshot at its next read. Solid keeps its `active` flag, which
  decides what the accessor returns after disposal. The name stays
  `useClassyStore` (decision 40).
- **Tests first** (`solid.test.ts`): N direct writes build one snapshot at
  the read; a read after dispose holds the last delivered value; a read
  straight after a write is unchanged until `flush()`, as today.
- **Tests that change:** none expected.
- **Done when:** `bun run test` passes; `bun run test:browser` passes for
  `solid.spec.ts`; `bun run --filter classy-store-solid-example build`
  passes.
- **Files:** `src/frameworks/solid/solid.ts`, `solid.test.ts`.
- **Size:** about +15 bytes on `./solid` (`adapters-collections.md`, A1);
  ceiling 375.
- **Docs:** `SOLID.md`: the object passed to `createClassyStore` is the
  store (M76); the guide names `batch()`.
- **Depends on:** T-52.
- **Risk:** low.

#### T-54. Drop the `active` flags of the Vue, Angular and Svelte adapters

- **Decision:** 42.
- **What:** the core skips a removed subscriber since T-28, so the `active`
  flags of the Vue, Angular and Svelte adapters guard nothing and go.
  Angular keeps its `destroyed` check; Solid keeps its flag.
- **Tests first:** none can fail; the existing dispose tests of the three
  adapters are the check.
- **Tests that change:** none.
- **Done when:** `bun run test` passes; `bun run test:browser` passes;
  `bun run test:frameworks:compatibility` passes.
- **Files:** `src/frameworks/vue/vue.ts`, `src/frameworks/angular/angular.ts`,
  `src/frameworks/svelte/svelte.ts`.
- **Size:** 13 to 16 bytes fewer per adapter (`adapters-collections.md`,
  A6).
- **Docs:** `SVELTE.md` gains a section on runes, names its example value
  `snap` and names `batch()` (decision 40, M76).
- **Depends on:** T-53.
- **Risk:** low.

#### Checkpoint 10

The full suite, the typecheck, coverage, `bun run size` (`./vue`,
`./angular`, `./solid`, `./svelte` under their ceilings), `bun run
check:floor`, `bun run check:package`. Both core benchmarks in full with
`--check`. `bun run test:browser`, `bun run test:frameworks:compatibility`,
`bun run test:angular:compatibility`, and the Solid and Angular example
builds.

### Step 11. The lost-write check

#### T-55. Add the benchmark row that takes one cached snapshot per task

- **Decision:** 36.
- **What:** `runCoreBenchmark.mjs` gains a row that takes one cached
  snapshot per task of the 1,000-row store, and its figure is recorded
  without the check, on both engines.
- **Tests first:** none; tooling.
- **Tests that change:** none.
- **Done when:** `bun run benchmark:core --only <the new row>,snapshot.afterWrite`
  and the same on Node print both rows; `bun run check:floor` is clean.
- **Files:** `packages/classy-store/tests/benchmark/runCoreBenchmark.mjs`,
  `packages/classy-store/tests/benchmark/README.md`.
- **Size:** none.
- **Docs:** the benchmark README.
- **Depends on:** T-54.
- **Risk:** medium. Each sample of the benchmark is one synchronous loop in
  one task; a row that takes one snapshot per task does not fit that loop
  (open point 14).

#### T-56. Report a lost write once, in development only

- **Decision:** 36.
- **What:** when a snapshot is asked for and a field of the raw object has
  changed without a write through the store, the library logs it once, with
  the code `lost-write` and the name of the field. The comparison runs at
  most once per task for a store. It is guarded in the form of T-02. It lands
  only if T-55's row with the check in stays below `snapshot.afterWrite` for
  the same store on both engines; otherwise it does not ship in 1.0, and the
  task ends with that result written in the decision record.
- **Tests first** (`snapshot.lostWrite.test.ts`): each row of the table of
  `spike-classes.md`, C4, for (b): an arrow function that writes
  `this.count`, an `async` arrow, one that pushes to `this.rows`, one that
  replaces `this.rows`, a method bound in the constructor, an arrow compiled
  to ES5 are reported; the rows that lose nothing are not; a timer the
  constructor started and a write through the raw object are reported; a
  `ClassyStore` subclass reports nothing; each is reported once per object;
  nothing is logged with `NODE_ENV` set to `production` for the test's
  duration; `productionBundle.test.ts` finds no text of the check in the
  production bundle.
- **Tests that change:** the eight tests that write to a raw object on
  purpose, which would print the report: the report is expected there.
- **Done when:** `bun run benchmark:core --only <T-55's row>,snapshot.afterWrite`
  and the same on Node: the row below `snapshot.afterWrite` on both; both
  `--check` runs pass; `bun test packages/classy-store/tests/size` passes.
- **Files:** `src/snapshot/snapshot.ts`, the new test file, the page of
  codes, the record of decision 4 (the stated cost of the development path).
- **Size:** 168 bytes always on, as spiked with a code only; behind the
  guard, a few bytes in production (not built).
- **Docs:** the page of codes: `lost-write`.
- **Depends on:** T-55.
- **Risk:** high. The once-per-task form was never built; as spiked, the
  check makes a cached snapshot eleven to thirteen times dearer.

#### Checkpoint 11

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`. The mutation run on `snapshot.ts`. Both core benchmarks in
full with `--check`, run as the benchmark loads the built file, with
`NODE_ENV` not set, which is the development path. `bun run test:browser`
and `bun run test:react:compatibility`.

### Step 12. The repository

#### T-57. Add an audit step and say why `proxy-compare` is pinned

- **Decision:** 33.
- **What:** CI gets a `bun audit` step that reports and does not fail.
  `CONTRIBUTING.md` says why `proxy-compare` stays pinned to an exact
  version (`3.0.1` today). The published tarball is accepted as it is.
- **Tests first:** none; repository.
- **Tests that change:** none.
- **Done when:** `bun audit` runs locally; `.github/workflows/ci.yml` has the
  step with `continue-on-error: true`; `bun run check:floor` is clean.
- **Files:** `.github/workflows/ci.yml`, `CONTRIBUTING.md`.
- **Size:** none.
- **Docs:** `CONTRIBUTING.md`.
- **Depends on:** T-56.
- **Risk:** low.

#### T-58. Pin every third-party action, and give three workflows read-only permissions

- **Decision:** 32 (the pins and the permissions only).
- **What:** every third-party action in every workflow is pinned to the
  commit its tag points to, with the tag in a comment, and a Dependabot
  configuration keeps the pins current. `ci.yml`, `react-compatibility.yml`
  and `react-next.yml`, which declare no permissions, get `contents: read`.
  Neither changes what a run does. The split of the release job is after 1.0.
- **Tests first:** none; repository.
- **Tests that change:** none.
- **Done when:** `grep -nE "uses: [^ ]+@v[0-9]" .github/workflows/*.yml`
  finds nothing; each of the three workflows has a `permissions` block; the
  pull request's CI run passes.
- **Files:** `.github/workflows/ci.yml`, `docs.yml`, `react-compatibility.yml`,
  `react-next.yml`, `release.yml`, `.github/dependabot.yml`.
- **Size:** none.
- **Docs:** none.
- **Depends on:** T-57.
- **Risk:** low. A wrong commit id fails the workflow at once, and
  `release.yml` cannot be tried without releasing, so its pins are read, not
  run.

#### T-59. Set every budget to its final size plus 2%, and record the baselines again

- **Decision:** 4.
- **What:** when stage 4 ends, every budget in `budgets.json` is the final
  measured size plus 2%, and `CONSTRAINTS.md` says the same. The size and
  benchmark baselines are recorded again. A cost limit that can be tightened
  is tightened to the highest new run times 1.2; a limit that would have to
  rise gets a line in the decision record. The README and `CLAUDE.md` keep
  "about 3.7 KB" until stage 5.
- **Tests first:** none; the size script's and the guard's tests of T-01
  hold the rule.
- **Tests that change:** none.
- **Done when:** `bun run size` passes with each budget equal to the
  measured size plus 2%; `bun run benchmark:core --check` and
  `bun run benchmark:core:node --check` pass; `bun run check:floor` is
  clean.
- **Files:** `packages/classy-store/tests/size/budgets.json`,
  `packages/classy-store/tests/size/baseline.json`,
  `packages/classy-store/tests/benchmark/baseline.json`,
  `packages/classy-store/tests/benchmark/limits.json`, `CONSTRAINTS.md`.
- **Size:** none.
- **Docs:** `CONSTRAINTS.md` and the record of decision 4.
- **Depends on:** T-58.
- **Risk:** medium. A limit that rises needs its line in the record, and the
  guard of T-01 blocks it otherwise.

#### Checkpoint 12

The full suite, the typecheck, coverage, `bun run size`, `bun run
check:floor`, `bun run check:package`, the mutation run on all seven target
files, both core benchmarks in full with `--check`, and the pull request's CI
run. The full validation matrix of the plan comes after the independent
review of stage 4, on the final commit (REVIEW_PLAN.md, "Stage 4").

## What may run in parallel

The default is one writer, in this checkout, from T-01 to T-59: the plan
allows one writer at a time, and "Depends on" names the task before each one
wherever the order of the decision document fixes it. Only these tasks touch
files that no task between them touches, and need nothing the tasks between
them bring, so a second writer in its own worktree could do them beside the
main line:

- T-05, T-06 and T-07 beside T-04 (different source files, all dead code of
  today); they may not overlap with each other's mutation lists.
- T-57 and T-58 (workflows and `CONTRIBUTING.md`) at any time after T-01.

Everything in steps 3 to 6 touches `core.ts` or `snapshot.ts`, and
everything in step 8 touches `persist.ts`, `cloneSnapshot.ts` or
`history.ts`, so none of it runs in parallel.

## Risks

Taken from the "not run" and "not verified" notes of the decision document
and of the reports it cites.

| Risk                                                                                                                                       | Where                 | What stage 4 does about it                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The decided set was never built as one; every ceiling is an estimate, and two built combinations came out above the sum of their parts     | Decision 4            | `bun run size` in every task; a change that would pass a ceiling is not committed, and the question goes back to a decision                                    |
| The cost limits are a forecast: the whole set was never timed                                                                              | Decision 4            | The `--only` timings each task names, `--check` before every commit to library source, and both full benchmarks at each checkpoint                             |
| The fourth form of the rule for functions and the `persist` rules as built were decided after the last review and never read by a reviewer | Decisions 1, 19 to 24 | The tests first of T-14 and T-34 to T-39 take every row of `spike-functions-3.md` and `spike-persist-2.md`; the independent review of stage 4 reads them first |
| The browser, framework and mutation suites were not run by any spike                                                                       | Most decisions        | The mutation run before each commit to a target file, and the framework suites at checkpoints 3, 4, 5, 6, 9 and 10                                             |
| Decision 10 was never built on the table of decision 12, nor its snapshot rows on decision 43, which removes the closure they rest on      | Decisions 10, 12, 43  | T-17 adds the guard tests first; T-23's rows are run again unchanged in T-25                                                                                   |
| A tracked read through the React hook and a plain read must share one cached result after the snapshot shape changes                       | Decision 43           | T-25's test for the shared result, and every React suite at checkpoint 5                                                                                       |
| The real Redux DevTools extension was never run: the entry ids it sends back, a cyclic state, a payload whose getter threw                 | Decisions 27, 43, 44  | Tests against a fake extension (T-41 to T-45); an unknown id falls back to the JSON path. A run with the real extension is left to the owner                   |
| A real `pagehide` and a real second tab were not run                                                                                       | Decisions 21, 24      | A browser test for `pagehide` in T-39; the cross-tab rows stay on dispatched events unless the persistence spec opens a second page                            |
| The lost-write check in its once-per-task form was never built, and the benchmark cannot yet see a check that runs once per task           | Decision 36           | T-55 adds the row first; T-56 lands only on its stated condition, and otherwise ships nothing                                                                  |
| The 17 compilations ran on the first draft's rule, and the ES5 rows of decision 1 were written by hand in each compiler's shape            | Decisions 1, 11       | T-49 runs the compilations again on the real code; the unit suite covers two of them through `Bun.Transpiler`                                                  |

## Open points

1. **Where the guard's walk starts.** Decision 4 says the guard walks "from
   the merge base with `main`". Today it starts at the commit that added
   `CONSTRAINTS.md`, because the commits before it were made with no bar.
   Starting at the merge base judges the stage 1 commits too, including the
   one that created `budgets.json` and `limits.json`. Which start holds?
2. **Whether the guard still judges the working tree.** Decision 4 says the
   guard judges the commits up to the head, and it is "run before each push".
   Today it judges the working tree, untracked files included, which is what
   makes it useful before a commit. The decision does not say whether that
   stays as a last step after the head.
3. **How the guard judges its own file.** Decision 4 brings the guard's own
   file into scope "for a rule that is removed or loosened", but its rules are
   regular expressions in code, not bullets or rows with a key, and the
   decision does not say how a loosened one is told. Nor does it say how
   T-01, which rewrites the guard, passes that rule: the exception it names
   is for the commit that adds the ceilings.
4. **What the production-bundle test looks for.** Decision 36 says the test
   asserts that "no development text" is left. Before T-56 there is no
   development-only text, and the decision does not say how the test knows
   which text is development text (a list kept by the test, a marker in the
   source, or the codes of warnings).
5. **Which messages get codes, and the codes not named.** Decision 35 speaks
   of "the three messages the library has today" (the getter cycle, "object
   is not a store proxy", the snapshot's circular reference). The source also
   has the Vue, Solid and Angular adapters' scope errors (`devbuild.md`
   proposes `no-scope` for them, with the prefix `@codebelt/classy-store/vue`
   and so on), `persist`'s "Persistence handle has been disposed", and a
   `console.error` in `utilityStatus.ts`. The decision document names only
   `getter-cycle`, `delivery-loop`, `batch-async` and `lost-write`; the codes
   for a getter that writes, a write to the Vue ref, the Angular context
   check, a collection mutator on a snapshot, the `persist` options, the
   `persist` reports and the root that refuses a restore are left to the
   task that adds them.
6. **Which benchmark comes before a redundant check in a loop.** Decision
   20 removes the checks of finding 59 "each after a benchmark where it sits
   in a loop". The core benchmark has no row for a collection lookup
   (`indexOfMember`) or for `shallowEqual`.
7. **Finding 4 and the direct tests.** Decision 20 removes the two traps of
   the React snapshot cache "if deleting them fails no unit test". Stage 1
   covered them with direct tests in `snapshotTargetCache.test.ts`, so
   deleting them fails those tests today. The decision does not say whether
   those tests count.
8. **Where timings recorded "before and after" are kept.** Decision 1 asks
   T-13 and T-14 to record the two new rows before and after, and decision 13
   asks for a confirmation of `store.write.sync`; neither says where the
   figures go. Decision 36 names the decision record for its own figure.
9. **What the rewritten test of finding 68 asserts.** After decision 3 the
   pin of the owner links without `WeakRef` flips, and `own-code.md` ("Not
   done", 4) says the corrected behaviour was never written as a test.
   Guarantee "Unspecified" says only "it works" for such a runtime.
10. **The `activeTracker()` timing.** Decision 20 says the claim for the
    ternary "is timed alone before stage 4 relies on it". `own-code.md`
    records that timing, alone, on 2026-11-25: the line stays. This list
    schedules no task for it.
11. **The baseline of decision 13's condition.** Decision 13 holds
    `store.write.sync` to "the spread of today's". Decision 1 states that its
    baseline is the commit before, because decision 12 has moved the figures
    by then; by step 6 decisions 12, 1 and 10 have changed the write path as
    well. Which baseline does decision 13 mean?
12. **The option list of `devtools`.** `persist-devtools.md`, P7, adds the
    options `maxAge`, `trace`, `traceLimit`, `actionsDenylist` and
    `actionsAllowlist`, and its bytes are inside decision 4's figures.
    Decision 27 does not mention them, so T-41 cannot tell whether the type
    test of the option list changes.
13. **Where the 17 compilations run.** Decision 11 says stage 4 runs them
    again on the real code. The compilers (TypeScript, Oxc, esbuild, SWC,
    Babel) are not dependencies of the repository, and adding them changes
    `bun.lock`. The decision does not say whether the run is a committed test
    or a run in a scratch folder.
14. **How a benchmark row takes one snapshot per task.** Decision 36's row
    "takes one cached snapshot per task", but each sample of the benchmark is
    one synchronous loop in one task. The decision does not say how the row
    yields a task per iteration, or whether the task switch is in its time.
15. **The ceilings in `CONSTRAINTS.md`, and an entry with no ceiling.**
    Decision 4 puts the ceilings in `budgets.json`. It does not say whether the
    size table of `CONSTRAINTS.md` gains them, or whether an entry with no
    ceiling fails the size script as an entry with no budget does.
16. **The adapter flags against decision 20.** The `active` flags of Vue,
    Angular and Svelte guard nothing once T-28 lands, and decision 20 says
    code is removed in the commit that makes it dead. The order of stage 4
    removes them in step 10 (T-54), and decision 42 says "in the adapter
    commits that follow decision 13". This list follows the order; the
    adapter files are not mutation targets, so no rule of `CONSTRAINTS.md`
    fails in between.
17. **The code of the snapshot cycle.** T-03 gives the snapshot's circular
    reference a code (decision 35), and T-26 removes the error (decision 44).
    The decision document does not say whether the code stays on the page as
    reserved or goes with the error.
18. **The DevTools tutorial between T-25 and T-44.** From T-25 a snapshot
    carries no class getter values, and `devtools` sends getter values again
    only from T-44, three steps later. In between, the DevTools tutorial's
    promise of computed values is false. The order of the decision document
    puts the two in steps 5 and 8.
19. **A record nested too deep.** Decision 21 and 23 make such a record one
    with nothing to keep, reported and replaced by the next save;
    `spike-persist-2.md` built the opposite (kept, and the handle never saves
    again). T-38 follows the decision; that part was never built, and
    decision 4 counts it in the 30 bytes of allowance on `./utils`.

## Every decision, and the tasks that implement it

| Decision | Stage 4              | Tasks                                                                                 |
| -------: | -------------------- | ------------------------------------------------------------------------------------- |
|        1 | Yes                  | T-13, T-14, T-50                                                                      |
|        2 | Yes                  | T-11                                                                                  |
|        3 | Yes                  | T-08                                                                                  |
|        4 | Yes, first           | T-01, T-59; every task that moves a budget                                            |
|        5 | Yes                  | T-12                                                                                  |
|        6 | Yes                  | T-15                                                                                  |
|        7 | Yes                  | T-24                                                                                  |
|        8 | Yes                  | T-10                                                                                  |
|        9 | Yes                  | T-16                                                                                  |
|       10 | Yes                  | T-17 to T-23, T-50                                                                    |
|       11 | Yes                  | T-49                                                                                  |
|       12 | Yes                  | T-09                                                                                  |
|       13 | Yes                  | T-28                                                                                  |
|       14 | Yes                  | T-29                                                                                  |
|       15 | Yes                  | T-30                                                                                  |
|       16 | Yes                  | T-31                                                                                  |
|       17 | Docs                 | Docs: the top of the `subscribe` section of the reference (T-29 edits that section)   |
|       18 | No                   | No                                                                                    |
|       19 | Yes                  | T-34, T-50                                                                            |
|       20 | Yes                  | T-04 to T-07; and the code made dead in T-08, T-14, T-19, T-26, T-38 and T-42         |
|       21 | Yes                  | T-35, T-36                                                                            |
|       22 | Yes                  | T-37                                                                                  |
|       23 | Yes                  | T-38                                                                                  |
|       24 | Yes                  | T-39                                                                                  |
|       25 | Yes                  | T-40                                                                                  |
|       26 | No                   | No                                                                                    |
|       27 | Yes                  | T-41 to T-44                                                                          |
|       28 | Yes                  | T-46                                                                                  |
|       29 | Yes                  | T-47                                                                                  |
|       30 | Yes                  | T-45                                                                                  |
|       31 | Yes                  | T-48                                                                                  |
|       32 | Pins and permissions | T-58                                                                                  |
|       33 | Yes                  | T-57                                                                                  |
|       34 | Yes                  | Docs, in each task; the sentence on a named property of an array in stage 5 (no code) |
|       35 | Yes                  | T-03, and every task that adds a message                                              |
|       36 | Yes                  | T-02, T-55, T-56                                                                      |
|       37 | Yes                  | T-51, T-52, T-53                                                                      |
|       38 | Yes                  | T-51                                                                                  |
|       39 | Yes                  | T-52                                                                                  |
|       40 | Docs                 | Docs: the Svelte guide in T-54                                                        |
|       41 | Docs                 | Docs: the sentence in `REACT_SSR.md` in T-34                                          |
|       42 | Yes                  | T-32, T-33, T-54                                                                      |
|       43 | Yes                  | T-25, T-44                                                                            |
|       44 | Yes                  | T-26, T-45                                                                            |
|       45 | Yes                  | T-27                                                                                  |
|       46 | No                   | No                                                                                    |

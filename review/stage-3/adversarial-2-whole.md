# Second adversarial review: delivery, utilities, adapters, and the whole

Decisions 4, 13 to 28 and 31 to 42, guarantee rules 1, 3, 9, 10, 11 and 12,
and the index, the pinned differences, the not-taken list, the issue table,
the stage 4 order and the answers table of `review/stage-3-decisions.md` at
`f5620b1`. `spike-core-2.md` was read as it is in the working tree.

Scripts are in `<scratch>/stage-3-adversarial-2-whole/`. Each ran with Bun
1.4.5 and imports the library's TypeScript source: the unmodified source of
the main checkout, and a throwaway worktree at `57404c3`
(`<scratch>/stage-3-adversarial-2-whole/wt`) with one patch from
`persist-devtools.md` applied at a time (`p5.patch`, then `p2.patch` alone).
No library file in the repository was changed.

## Objections

### 1. Decision 24 makes an older app overwrite a newer record at load, with no edit and no report

- **Decision:** 24, with 21, 19 and rule 10.
- **Objection.** `persist` calls `migrate` whenever the stored version
  differs, also when it is higher than the configured one. A `migrate` that
  handles upgrades returns the newer state unchanged, the restore keeps only
  the fields the old app knows, and decision 24 then writes that back at
  once. So a tab still running the old app, or a rollback of a deploy,
  destroys the newer record as soon as it loads, before the user does
  anything. Nothing is reported. Today the same loss waits for the first
  edit. Without a `migrate`, decision 21 refuses the newer record and "the
  next save" replaces it. No entry and no rule says what happens to a stored
  version above the configured one.
- **Evidence.** `downgrade-p5.ts`: a v2 record
  `{"items":["milk","eggs"],"tags":["x"]}`, a handle at version 1 whose
  `migrate` upgrades from 0 only, no edit made.
  - Unmodified: `migrate` is called with `2`; storage still holds the v2
    record.
  - With `p5.patch`: `migrate` is called with `2`; storage now holds
    `{"version":1,"state":{"todos":[]}}`. No `onError` call.
  - `persist.ts` line 312: `if (storedVersion !== version)`, then
    `migrate(state, storedVersion)`. `PERSIST_TUTORIAL.md` line 459 asks the
    user to validate the versions `migrate` accepts, and decision 24's
    write-back turns every `migrate` that does not into data loss at load.
  - Rule 10 does not forbid it: the newer record was one `persist` could
    read, and it was "replaced", not "deleted". The rule also reads "only an
    elapsed time deletes" next to a public `clear()` that deletes on request.
- **Severity:** wrong. A new silent loss of stored data (contract point 8).
- **What would settle it.** A rule for a stored version above the configured
  one: refuse and report it, never call `migrate` with it, and never write
  over it (neither the write-back nor the next save). Write back only after
  an upgrade (`storedVersion < version`). A test with two handles at
  versions 1 and 2 on one key, and rule 10 worded so that `clear()` and the
  replacement of a refused record are named.

### 2. Decision 21's integer rule refuses every record an app with `version: 1.1` saved itself, and the next edit overwrites it

- **Decision:** 21 and 22.
- **Objection.** The rule "a version is an integer" is checked on the stored
  record only. The `version` option is typed `number`, and nothing checks
  it. An app that configures `version: 1.1` writes `1.1`, and after the
  upgrade to 1.0 every load refuses its own record and the first edit
  replaces it with the defaults. The loss is reported, but it is a loss, and
  it comes from a library upgrade, not from anything the app changed. In the
  same way "an `async` `migrate` is refused before it is called" does not say
  whether that happens when `persist()` is called (loud, nothing lost) or
  per record (every old-version record refused, then overwritten).
- **Evidence.** `version-float.ts`, a stored `{"version":1.1,"state":{"notes":
  ["precious"]}}`, a handle with `version: 1.1`, one edit:
  - Unmodified: `restored: ["precious"]`; storage
    `["precious","edit"]`.
  - With `p2.patch`: `restored: ["default"]`, one report "the stored record
    has a version that is not an integer"; storage `["default","edit"]`.
  - Decision 22 lists what `persist()` refuses when it is called; `version`
    and `migrate` are not among them.
- **Severity:** wrong. A change that destroys stored data for a
  configuration that works today.
- **What would settle it.** Decision 22 also throws when `persist()` is
  called for a `version` that is not a non-negative integer and for a native
  `async` `migrate`, and decision 21 says the record-level refusal of an
  `async` `migrate` does not exist. Tests for both.

### 3. Decision 36's development check puts the cached snapshot far over its cost limits, as the benchmark runs today

- **Decision:** 36, with 4 ("the cost limits are expected to hold").
- **Objection.** The lost-write check compares the raw object's own fields
  with the cached snapshot every time one is handed out, which
  `spike-classes.md` measured as eleven to thirteen times dearer. The guard
  form of decision 36 assumes "a test that is cheap and almost always
  false" in front of the environment read, and this check has none: handing
  out a cached snapshot is the common case, and the comparison is the
  check. `benchmark:core` imports `dist/index.mjs` unbundled with `NODE_ENV`
  unset, so it measures the development branch (`devbuild.md` says so of its
  own runs). The cached snapshot ratio is 7.66 against a limit of 10 on Bun
  and 1.35 against 1.8 on Node; eleven times that is about 84 and 15. Every
  development render and every unit test pays the same, plus 184
  nanoseconds per environment read on unbundled Node.
- **Evidence.** `spike-classes.md`, C4 (b), "What was changed" (the fields
  are compared "when one is handed out") and "Recommendation" ("eleven to
  thirteen times dearer, on the path every render takes"; "It cannot be done
  once per version"). `devbuild.md`, "The cost of reading `process.env`" and
  the note under "The five spikes". `tests/benchmark/runCoreBenchmark.mjs`
  line 15. `CONSTRAINTS.md`, "Cached snapshot cost". Decision 36: "The check
  was measured always on, not behind the guard; stage 4 measures it there
  first."
- **Severity:** wrong. As written the change cannot pass the quality bar,
  and the decision does not say which number gives.
- **What would settle it.** Decide before stage 4 whether the benchmark runs
  with `NODE_ENV=production` (and then what bounds the development path), or
  accept a development cost and write it into `CONSTRAINTS.md` with a record,
  or find a check that runs once per write rather than once per read.

### 4. Nothing in decision 4's tooling stops a ceiling from rising

- **Decision:** 4.
- **Objection.** A ceiling is "a tripwire": a change that would pass one goes
  back to a decision. But the ceiling is a number in `budgets.json`, and the
  guard as described "blocks a number that rises unless the decision record
  changes in the same commit". A commit that raises a ceiling and adds a line
  to the record passes, which is the same condition under which a budget may
  rise. The tripwire is a rule in prose. Three more gaps:
  - `floor-guard.mjs` leaves its own file out of scope (`isSelf`), so the
    commit that rewrites it, and any later one, can weaken it unseen.
  - "Compares each commit with the one before it" says nothing about how:
    CI runs once per pull request to `main`, at its head, and no workflow
    runs on `release/1.0`, so during stage 4 every check is local.
  - Neither script has a test, and the decision names none for the new
    logic.
- **Evidence.** `scripts/floor-guard.mjs`, `inScope` (excludes
  `scripts/floor-guard.mjs`) and the record check at its end;
  `.github/workflows/ci.yml` (`on: pull_request: branches: [main]`);
  `tests/size/runSize.ts` reads `budgets.json` as `Record<string, number>`.
- **Severity:** wrong. The decision says what enforces the ceilings, and
  what it describes does not.
- **What would settle it.** Ceilings fixed outside the files a stage 4
  commit edits (for example a test that asserts them against the record's
  table, where a rise is refused whatever else changes), the guard's own
  file in its scope, a loop over `base..HEAD` with one diff per commit, and a
  test of each new rule.

### 5. The React ceiling is below the document's own figure plus 2%

- **Decision:** 4.
- **Objection.** Stage 4 ends with "every budget the final measured size
  plus 2%", and the size script fails when a budget is above its ceiling.
  `./react` measured 1,693 in the snapshot combination. 1,693 plus 2% is
  1,727, above the ceiling of 1,725, so the final step fails on the reports'
  own numbers. `./vue` (369 for the measured form 3, ceiling 390) leaves 13
  bytes before the same rule trips, and the throwing setter of decision 38
  is not measured. `./angular` (about 381 for A1 and A3, ceiling 400)
  leaves 11, and its own context check of decision 39 is not measured.
- **Evidence.** `spike-snapshots.md`, "The combination", size table
  (`./react` 1,693); `adapters-collections.md`, A1 (`./angular` +40) and A3
  (+70), A2 (form 3, 369); decision 4's first table.
- **Severity:** wrong (the set as decided cannot meet its own rule).
- **What would settle it.** Ceilings set at the estimate plus 2% plus the
  unbuilt parts, with the rounding stated, or the 2% rule capped at the
  ceiling.

### 6. Decision 24 changes a documented sentence and is labelled "can follow 1.0"

- **Decision:** 24, and the index; also 23.
- **Objection.** The tutorial says "Migration and hydration do not
  automatically rewrite storage; a later save writes the configured
  version." Decision 24 rewrites storage at load. By the document's own
  definition that is "before 1.0", the rule the first round applied to 8, 9,
  28 and 37. Decision 23 has the same question: the tutorial says that
  "synchronous subscribers can also edit a different field during
  restoration", and with the restore in one transaction they run after it.
  It is in stage 4, so the cost is the missing doc change in its commit.
- **Evidence.** `PERSIST_TUTORIAL.md` lines 459 and 276;
  `persist-devtools.md`, P4, "What it changes for a user".
- **Severity:** mislabelled.
- **What would settle it.** Label 24 "before 1.0", and change both
  sentences in the commits of 23 and 24.

### 7. Decision 27's method name: the hook reads a name that is empty for a function written to a key, and the evidence names the wrong build

- **Decision:** 27, with 1.
- **Objection.** Decision 27 says "a method takes the name of its key". The
  hook K2 recommends receives the wrapped function and sets
  `currentAction ??= method.name`. A function written through the store to a
  key (clause 3 of decision 1: `store.onSave = () => …`, or `this.onX = () =>
  …` in a constructor) has the name `""`, and `??=` keeps `""`, so its entry
  is named with an empty string, neither its key nor `STORE_UPDATE`.
  `spike-functions.md` says stage 4 must pass the key into `transactional()`
  and that this was not run with the naming; decision 27 does not carry it.
  Separately, decision 27 calls its form "the slot" and cites "K2: the slot
  form, 12 bytes … and 452". In K2 the slot form is the counter build
  (`k2-slot-on-p7.patch`, 40 and 441); 12 and 452 are the hook build. A
  reader who follows the evidence by name takes the rejected patch.
- **Evidence.** `names.ts`: `o.onSave = () => {}` gives `name` `""`, and
  `current ??= ""` keeps `""`. `spike-combos.md`, K2, `k2-hook-on-p7.patch`
  (`currentAction ??= method.name`) and the bytes table;
  `spike-functions.md`, "Objection 17, a name for `devtools`".
- **Severity:** unclear.
- **What would settle it.** The decision says the key is passed to the hook
  for every kind of method, names the hook form as such, and stage 4 tests
  an entry for an arrow written to a new key and for one assigned in a
  constructor.

### 8. Decision 27's "off in production" does not say which way an unknown environment falls

- **Decision:** 27, with 36.
- **Objection.** `enabled` reads `NODE_ENV` "the way decision 36 does",
  behind `typeof process`. For a warning, a missing `process` means "no
  warning", which is safe. For `devtools` the same guard decides whether
  every state goes to any extension. Where nothing replaces the expression
  in a browser bundle, `process` is undefined, and a default of "on unless
  production" leaves `devtools` on. `devbuild.md` lists such builds:
  `bun build --minify` without `--production`, and esbuild without
  `--minify`; Rollup without a replace plugin was not measured.
- **Evidence.** `devbuild.md`, "What each toolchain loads" and "Bun's
  bundler is development by default"; decision 27, `enabled`.
- **Severity:** unclear (two readings with opposite security results).
- **What would settle it.** One sentence: when `process` is undefined the
  default is off (or on), and the guide names the builds where it stays on.

### 9. A throwing getter still spoils the `devtools` entry of a plain-object store

- **Decision:** 27 and 43.
- **Objection.** Both entries say a getter that throws "shows its error text
  and the entry is still sent". That holds for class getters only. A getter
  of an object literal, the other documented input, stays an own enumerable
  accessor of the snapshot (decision 43), and K3 sends a root without class
  getters "as the snapshot itself". Serialising it runs the getter and
  throws, as today; the subscriber's error is logged and the entry is lost.
- **Evidence.** `spike-combos.md`, K3, "The change" ("A root with no class
  getter is sent as the snapshot itself, as today") and the "Today" row of
  the payload table; decision 43, first paragraph.
- **Severity:** unclear (the sentence overclaims for a documented input).
- **What would settle it.** Guard the own accessors of the root too, or say
  in both entries and the tutorial that the guard covers class getters only.

### 10. "Where this differs from `pinned.md`" leaves out a guaranteed row that decision 43 breaks

- **Decision:** the section, with 43.
- **Objection.** `pinned.md` labels "Accessors on an object literal behave
  the same as on a class" guaranteed, because a plain object is a documented
  input. After decision 43 they differ on every snapshot: an object-literal
  getter is an own enumerable key, carried by a spread and by JSON; a class
  getter is neither. The section lists the class rows that change, not this
  one.
- **Evidence.** `pinned.md`, the accessor rows (label G, "Documented
  input"); decision 43, first paragraph.
- **Severity:** unclear.
- **What would settle it.** A line in the section, and the docs sentence
  that says where the two kinds of getter differ.

### 11. Decision 21 says a record with an unusable `expiresAt` is restored; its spike refuses it

- **Decision:** 21.
- **Objection.** "A record without a usable `expiresAt` is restored and
  written back with one." P2 refuses `expiresAt: "yesterday"` as `'parse'`,
  after which decision 21 replaces it at the next save. A reader can build
  either, and one of them deletes the stored data.
- **Evidence.** `persist-devtools.md`, P2 table, rows for a missing, `null`
  and `"yesterday"` `expiresAt`; `p2.patch` (`unreadable('has an expiresAt
  that is not a number')`).
- **Severity:** unclear.
- **What would settle it.** "A record without an `expiresAt`, or with
  `null`, is restored and written back with one; any other value that is not
  a number is refused", or the opposite, with a test for each.

### 12. The answer to W16 does not hold, and two rows of decision 4 are not the figures their reports give

- **Decision:** 4 and 35; answer W16.
- **Objection.** W16 is marked "Changed", but the two figures it named still
  disagree: decision 4 says the codes shorten messages "by about 100 bytes",
  decision 35 that a code "saves those 271 bytes". Decision 4's row for
  decision 1 is +165, the figure of F1b, which is "clause 4 only for a
  definition", listed under "Not taken"; the rule taken, F1, measured +170.
  And "each figure below is one change measured alone against today's
  source" is not so for rows 1, 5, 6, 10 and 27, which are increments over
  other spikes (the strict rule with C1 and T3 (a), T2, the getter
  combination, P7).
- **Evidence.** `spike-functions.md`, "Size" (F1 +170, F1b +165, both
  against strict); decision 1, "Evidence" ("170 more than the strict
  rule"); decisions 4 and 35.
- **Severity:** unclear.
- **What would settle it.** One figure for the codes, 170 in the row, and
  "measured on top of" where a row is an increment.

### 13. Four steps of the order need something a later step brings

- **Decision:** "The order for stage 4", with 5, 19, 27, 35 and 36.
- **Objection.**
  - Step 8 (decision 19) pins `persist()` in a constructor "with the base
    class", which arrives at step 9.
  - Step 8 (decision 27) reads `NODE_ENV` in decision 36's guard form, whose
    floor rule and production-bundle test arrive at step 11.
  - Steps 3 to 10 add coded messages (`delivery-loop`, `batch-async`, the
    Vue setter, the Angular context error), and the one documentation page
    of codes and advice that decision 35 requires is written at step 11.
  - Decision 5 says "Stage 4: yes, with decision 2" and that decision 2
    needs its line; the order lists 2 first and 5 after it as separate
    changes.
- **Evidence.** The order, steps 3, 8, 9 and 11; decisions 5, 19, 27, 35
  and 36.
- **Severity:** unclear (each can be done, but not as the order says).
- **What would settle it.** Move the constructor test to step 9, the guard
  rule and the codes page to step 1 or 2, and say whether 2 and 5 are one
  commit.

### 14. The not-taken list marks two choices final that the document leaves open, and misses three that are final

- **Decision:** "Proposed in a report and not taken"; the issue table; the
  index.
- **Objection.**
  - `reportError()` is marked **(final)**, and the unspecified list says
    "where a subscriber's error is reported" may change in a minor release.
  - Awaiting an `async` `migrate` is marked **(final)**. By decision 16's own
    argument, accepting what was refused is a compatible change.
  - Missing: D1's "a subscriber does not hear its own write" (rule 3 makes
    the choice final), D1's "one microtask per batched round", and
    `enabled: true` as the default of `devtools` (a default, so final).
  - The issue table gives M23 twice: under "M18 to M27, decision 10" and as
    "M23, decision 7". The index uses the kinds "Constraint" and "Docs",
    which its own header does not define.
- **Evidence.** The list, the unspecified list, decision 16 "Why",
  `spike-delivery.md`, D1, "Three choices inside D1"; the issue table.
- **Severity:** unclear.
- **What would settle it.** Correct the two marks, add the three items, and
  give M23 one home.

## Examined and found nothing against

- Decisions 13 to 16 against D1 to D4: the bytes (219 is the combination's
  189 plus the 30 of the fast first round), the test counts and timings; the
  bound on both paths, the removed, late and throwing subscriber, and the
  report of the bound, which fires on each trip. Rules 1 and 3 say what
  happens in each case.
- Decisions 17, 18, 20, 22 (apart from objection 2), 25, 26, 28 and 29;
  decision 19 with the `hydrated` gap; decision 23's rollback keeps an edit
  made while a read is in flight.
- Decision 30 against K1 and the addendum; decision 31 against N5.
- Decisions 32 and 33: the three workflows without permissions are `ci`,
  `react-compatibility` and `react-next`.
- Decision 35, apart from objection 12; decision 36 apart from objection 3.
- Decisions 37 to 42, the adapters: what a component reads between a write
  and the next render (A1), the Vue server path (A2). A Solid server render
  leaves no listener on a module store today (`solid-ssr.tsx`: 0, 0, 0
  after three renders).
- Decision 4's main-entry and `./utils` sums (+1,582 and +1,074) and the
  `./collections` ceiling.
- Rules 9, 11 and 12; the delivery queue keeps no store after the bound.
- Completeness: every M1 to M77 has a decision, and every stage 1 finding is
  in an M issue or in the list after the table.
- The answers to E1 to E22 (apart from objections 1, 2 and 13), and to W2 to
  W7, W10 to W12, W14, W15 (apart from objection 14) and W17.

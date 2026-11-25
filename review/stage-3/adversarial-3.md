# Third adversarial review of the stage 3 decisions

Reviewer of the entries decided again after the second round: decisions 1,
4, 10, 12, 21 to 24, 30 and 36, guarantee rules 2, 4, 6 and 10, and the order
for stage 4. Artifact: `review/stage-3-decisions.md` at `6ecce72`.

Worktrees, all detached at `57404c3` under `<scratch>/stage-3-adversarial-3/`:

- `wt`: the unmodified source ("today").
- `wt-r`: decision 1 as it now stands, `c1-t1strict.patch` then
  `rule-r.patch`.
- `wt-g1`: `g1-base-f4-build.patch` then `g1-delta.patch` of
  `spike-core-3.md` (decision 10 with G1).
- `wt-g2`: `f2-holder-lazy.patch` then `g2c-on-lazy.patch` (decision 12 with
  the cap).
- `wt-p`: `combo.patch` of `persist-devtools.md` (P1 to P8 together).

Scripts are in `<scratch>/stage-3-adversarial-3/repro/` and take a worktree
as their argument (`bun <script> <worktree>`). Nothing was committed.

## Objections

### 1. Decision 1 takes the binding and the transaction away from a `function` method in an object literal, in silence

- **Decision:** 1, with guarantee rule 2 and "How to read this" ("No change
  decided here has a regression").
- **Objection.** Case 2 excludes every function with its own `prototype`.
  That excludes a class, which is the defect the exclusion is for, and also
  `inc: function () { this.n++; }` in an object literal, which today is a
  bound method and one transaction. Under the rule it is neither. Called on
  the store, a synchronous subscriber, so every adapter, hears each write and
  sees the state between them. Taken off the store, as the tutorial does with
  `onClick={counterStore.increment}`, it throws in strict code, and in sloppy
  code it writes to `globalThis` and the store stays unchanged, with no error.
  The entry says the form "adds no silent failure" and gives "today's
  behaviour with today's defects removed". This row is the reverse. The spike
  classes the one test that pins it as a "fix".
- **Evidence.** `fn-rows.ts`, `function` expression `inc` that writes two
  fields:

  | Row                                | Today           | Decision 1                                |
  | ---------------------------------- | --------------- | ----------------------------------------- |
  | Called on the store: sync calls    | 1               | **2**                                     |
  | `const f = store.inc; f()`, strict | works           | **throws `TypeError`**                    |
  | The same, sloppy (`sloppy.ts`)     | `store.count` 1 | **`store.count` 0, `globalThis.count` 1** |

  `website/content/docs/TUTORIAL.md` line 38 passes a method unbound.
  `spike-functions-2.md`, section 3: "a function stored as data is read back
  as one stable wrapper bound to the store … fails as a **fix**". Of the nine
  docs sentences, number 2 says only that such a function is "data".
- **Severity:** wrong. This is a new silent failure (contract point 8), and the
  entry says there is none.
- **What would settle it.** One of two things. (a) Case 2 excludes a class
  and keeps an ordinary `function`, for example by `Function.prototype.toString`
  starting with `class`, or by a `prototype` object that holds more than
  `constructor`. Then measure it and run the T1 rows again. (b) Keep the rule.
  Then "What it costs a user" names the torn notification and the detached
  throw. The test is reclassed as a regression that is accepted, and "no
  regression" and "adds no silent failure" are corrected. A test pins each row
  above.

### 2. The advice "call `clear()` in `onError`" fails in silence on synchronous storage

- **Decision:** 21, with 19.
- **Objection.** Decision 21 tells an application that prefers to drop a
  record it cannot use to call `clear()` from `onError`. Decision 19 makes the
  first read run inside `persist()` when the storage is synchronous. So for
  `localStorage`, the usual case, `onError` runs before `persist()` has
  returned the handle. `handle.clear()` then throws a `ReferenceError` from
  the temporal dead zone. `reportError()` swallows any error from `onError`,
  so the record stays, the handle stays blocked, and nothing says so. Today
  the read comes a microtask later and the same code works. `onError` gets no
  handle, so there is no other way in.
- **Evidence.** `onerror-clear.ts`, a record that is not JSON on a
  synchronous storage, with `onError: () => handle.clear()`:
  - `wt`: `onError(parse)` runs after `persist()` returned, `clear()` runs,
    and the record is removed.
  - `wt-p` (P1 in): `onError(parse)` runs before `persist()` returned,
    `clear()` throws `ReferenceError`, and the record is still in storage. No
    error reaches the caller.
  - `persist.ts` lines 108 to 114: `try { onError(error, operation); } catch {}`.
- **Severity:** wrong. A combination of two entries adds a silent failure on
  the exact path the advice is for.
- **What would settle it.** Give `onError` a way to act on the record, for
  example a third argument with `clear`, or deliver the initial read's report
  after `persist()` returns. Or drop the advice and say what does work. Then
  write a test with a synchronous storage.

### 3. Guarantee rule 10 is false for `skipHydration`, and for an edit made while an asynchronous read is in flight

- **Decision:** rule 10, against 21 and 19.
- **Objection.** Rule 10 lists the only cases in which a record is replaced.
  It leaves out two:
  - **`skipHydration`.** A handle with `skipHydration: true`, which the SSR
    guides teach, reads nothing until `rehydrate()`. Its first edit therefore
    writes over whatever is stored, including a record of a newer version
    and one that could not be migrated. "Not written over by the handle that
    read it" does not reach it, because this handle read nothing.
  - **An edit during a read.** Rule 10 also says "An edit made while a read
    is in flight is not lost". Decision 21 says a handle that finds a newer or
    unmigrated record does not write. With an asynchronous storage, an edit
    made while that read is in flight is then never saved, and the rule says
    it is not lost.
- **Evidence.** `skip-hydration.ts` on `wt` and `wt-p`: a stored
  `{"version":2,…}`, a handle at version 1 with `skipHydration: true`, one
  edit. The record becomes `{"version":1,"state":{"count":1}}`, and there is
  no report. `REACT_SSR.md` line 92 and `PERSIST_TUTORIAL.md` lines 355 to 398
  teach that pattern. Decision 21's list of tests to write first has neither
  case.
- **Severity:** wrong. A guarantee that is false as written.
- **What would settle it.** Either a handle with `skipHydration` reads the
  record's version before its first save, or rule 10 names both cases and the
  guide states them. Then a test for each.

### 4. Decision 24's write-back at load opens two losses that no entry names

- **Decision:** 24, with 21.
- **Objection.** Decision 21 refuses to replace a record that a `migrate`
  failed on, because "a bug in one release" must not become "lost data for
  every user who makes an edit". Decision 24 writes a migrated record back as
  soon as the app loads. Together they open two losses:
  - **A `migrate` that is wrong and does not throw.** It might drop a field
    or map a value wrongly. The wrong result replaces the source record for
    every user who opens the release, edit or no edit, so a corrected
    release has nothing left to migrate. Without the write-back, a user who
    only looked at the app keeps the old record.
  - **A rollback.** Every user who only opened the newer build has a record
    of the newer version. After the rollback, decision 21 stops the older
    build from saving anything for those users, for as long as the rollback
    lasts. Their edits are lost on every visit, and the only signal is one
    console line per load. Without the write-back that would happen only to
    users who edited in the newer build.

  "What it costs a user" names failed migrations and older tabs, not these.
- **Evidence.** Decision 21, "Why", third bullet, and "What it costs a
  user". Decision 24, "Why only after an upgrade". `persist-devtools.md`,
  P5, "What it changes for a user": "Storage is written once at load after a
  migration". Reasoned from the text and the built P5. The rollback path was
  not run.
- **Severity:** wrong. These are paths that lose stored data or edits, and no
  entry names them (contract point 8).
- **What would settle it.** Weigh the write-back against these two paths in
  decision 24's "Why", and state both in "What it costs a user" and the guide.
  Or write back only on the first edit after a migration, as today.

### 5. Decision 1 is slower than today on the call it calls the commonest, and its condition for landing measures another path

- **Decision:** 1.
- **Objection.** The entry compares its timings only with the strict rule and
  the second form. Against today, a call of a method held in a field is
  about 10% slower on Bun and 15% on Node. A read and call of an arrow
  function held in a field is about 1.7 times today's on Bun and 1.8 times on
  Node. The spike calls this call the one "a component makes most". The
  condition for landing is `store.method`, which is a prototype method, the
  path the rule hardly changes, so it cannot catch this. The fast path that
  would take the cost back is put off.
- **Evidence.** `own-method.mjs` (the spike's own script), two rounds per
  engine on the built `wt` and `wt-r`, nanoseconds, median (lowest to
  highest):

  | Metric                     | Engine | Today              | Decision 1         |
  | -------------------------- | ------ | ------------------ | ------------------ |
  | own method call            | Bun    | 177, 183 (177–187) | 195, 197 (194–201) |
  | own method call            | Node   | 244, 243 (243–246) | 280, 280 (280–286) |
  | own arrow, read and called | Bun    | 35.6, 33.8 (33–39) | 58.3, 58.7 (58–62) |
  | own arrow, read and called | Node   | 45.9, 45.9 (46–47) | 84.4, 85.1 (84–86) |

  The ranges are far apart. `spike-functions-2.md`, section 2: the table has
  no "Today" row. Decision 1, "Label": the condition names `store.method`.
- **Severity:** unsupported. The entry's cost statement leaves out the
  comparison a user sees.
- **What would settle it.** State the cost against today in "What it costs a
  user". Make the landing condition also cover an own method call and an own
  arrow read, measured against the commit before. Or take a fast path that
  has no gap.

### 6. The fast path that the entry says "can follow 1.0" changes documented behaviour

- **Decision:** 1, "Not taken".
- **Objection.** The entry names one gap in the fast path: a read-only
  definition made on the raw object throws. Its report names two. The second
  is that a function frozen after its first read stays a method. Decision 1
  and the docs sentence it sends to the reference say that a frozen function
  is handed out as it is. A fast path in 1.x would change that answer, so it
  cannot follow 1.0 as the entry says, unless both gaps are closed.
- **Evidence.** `spike-functions-2.md`, section 2, the last table: "The
  function itself frozen … **false** (stays a method)". Decision 1, "Not
  taken", fourth bullet; docs sentence 2.
- **Severity:** mislabelled.
- **What would settle it.** Name both gaps. Then either "can follow 1.0 if
  both are closed", or say now that the frozen-after-read case is
  unspecified.

### 7. What `save()` and `rehydrate()` resolve to on a handle that does not write is not said

- **Decision:** 21.
- **Objection.** A blocked handle "reports again, as `'write'`" on each
  `save()`. The entry does not say whether that `save()` rejects or resolves.
  The persist guide teaches `await handle.save()` followed by showing success.
  It also says that an active handle reports a failure "before rejecting". If
  stage 4 resolves the promise, the application shows "saved" when nothing
  was saved, which is a new silent failure. The same question is open for a
  `rehydrate()` that finds a newer or unmigrated record, and for the flush on
  `pagehide`.
- **Evidence.** Decision 21, first bullet under the table.
  `PERSIST_TUTORIAL.md` around line 582 ("before rejecting with the original
  error") and line 586.
- **Severity:** unclear. There are two readings, and one of them is silent.
- **What would settle it.** "`save()` rejects with that error", and the same
  for `rehydrate()`, with a test for each. Say also whether the `pagehide`
  flush reports.

### 8. Decisions 21 and 24 disagree about what is written back, and when

- **Decision:** 21 and 24.
- **Objection.**
  - Decision 21 says a record without `expiresAt` "is written back with one
    when `expireIn` is set". Decision 24 says nothing is written back except
    after a migration.
  - Decision 24 says "saved at once". P5 reaches that through `saveAfterRead`
    and `queueAutoSave()`, which waits for the debounce.
  - P5 does not write back a record migrated from a storage event. Decision
    24 does not say so.
- **Evidence.** Decision 21, last bullet. Decision 24, "Decision".
  `persist-devtools.md`, "The combination", second bullet (the `expiresAt`
  write-back by the same path), and P5 "What was changed".
  `persist.ts` lines 436 to 439.
- **Severity:** unclear.
- **What would settle it.** One list of the write-backs (migration,
  `expiresAt`), each saying whether it waits for the debounce and whether the
  cross-tab path does it, with a test for each.

### 9. Decision 21's table has no row for a failing `merge`

- **Decision:** 21.
- **Objection.** The third kind lists `migrate`, `deserialize` and a
  rolled-back restore. A `merge` option that throws, or that returns
  something that is not an object, is in none of the three kinds. The guide
  reports merging as `'parse'`. Stage 4 has to choose between "replace at the
  next save" and "do not write", which is the difference the table exists to
  settle.
- **Evidence.** `persist.ts` lines 330 to 336 (`merge` runs between the
  transforms and the restore). `PERSIST_TUTORIAL.md` around line 582:
  "migrating, merging, and applying restored fields use `'parse'`".
- **Severity:** unclear.
- **What would settle it.** A row for `merge`, presumably the third kind, and
  a test.

### 10. The answer to 2W3 makes the benchmark blind to the check, not the check cheap

- **Decision:** 36, and the answer to 2W3.
- **Objection.** The benchmark runs each sample as one synchronous loop and
  yields to the event loop only between samples. A check made "at most once
  per task" therefore costs one comparison per sample of many thousand
  iterations, and the limits will hold whatever one comparison costs. In an
  application a task usually takes one snapshot per store, and pays the full
  comparison each time. The entry's condition, "the limits have to hold
  there with the check in", cannot tell a cheap check from an expensive one.
- **Evidence.** `tests/benchmark/runCoreBenchmark.mjs`: `snapshot.cached`
  (lines 293 to 303) loops `iterations` times in one task. The function
  `turn()` (line 445) is awaited only between samples (line 476). Decision
  36, "The cost limits come first".
- **Severity:** unsupported. The test the entry names cannot show what the
  entry relies on.
- **What would settle it.** A benchmark row that takes one snapshot per task,
  and a cost for it stated in `CONSTRAINTS.md` or in the record, for the
  development path.

### 11. A getter on a nested object that writes the root of its store goes through on both layers

- **Decision:** 10 and rule 4.
- **Objection.** G1's frame is per node, so the throw covers only the object
  the getter is computed on. A getter on `store.line` that writes
  `store.hits` writes the live store and notifies synchronously, from a
  snapshot read too. That is the hazard objection 3 of the second round was
  about, one level up. Decision 10 lists two things as allowed, "another
  store" and a child object. An ancestor in the same store is neither, and
  the unspecified list names only a child. The message, "cannot write to its
  own store", suggests a wider rule than the code has.
- **Evidence.** `nested-getter.ts` on `wt` and `wt-g1`, the same output on
  both: live `hits 1 sync 1`, snapshot `hits 2 sync 2`, no error.
  `refuseOwnWrite` in `wt-g1`'s `core.ts` compares `frame.internal ===
  internal`.
- **Severity:** unclear.
- **What would settle it.** Put "a write to another object of the same
  store, a parent included" in the unspecified list beside the child. Or say
  it is allowed, and word the message by object, not by store.

### 12. G1 rests on a closure that decision 43 removes

- **Decision:** 10 (G1), with 43 and the order.
- **Objection.** G1 passes each snapshot's node into
  `installMemoizedGetters(snap, target, internal)`, which today installs
  accessors on every snapshot. Decision 43 installs them once per class, on a
  shared derived prototype, so the node has to be found from `this` at each
  run of a getter body. That combination was not built. Decision 43 says its
  own figures are a forecast. Decision 10 says only that its rows were not
  built on decision 1. Step 4 of the order writes G1 on today's snapshot
  layer, and step 5 replaces that layer.
- **Evidence.** `spike-core-3.md`, `g1-delta.patch`, the `snapshot.ts` hunks.
  `spike-snapshots.md`, `snapshotPrototype()`: the accessor calls
  `snapshotSource(this)`, which yields the raw target, not the node.
- **Severity:** unsupported.
- **What would settle it.** One sentence in decision 10 or 43 that G1's rows
  are tests again after decision 43, run on the build of step 5.

### 13. "It takes the name of the key it was read under" is false for a function under two keys

- **Decision:** 1, with 27 (answer to 2W7).
- **Objection.** There is one wrapper per node and function, and its name
  and key are fixed by the first read. `store.b = store.a` stores `a`'s
  function, so `store.b` is the same wrapper, named `a`. One function under
  two keys has the name of whichever key was read first. Decision 27 says
  the key a method was read under "is handed to that function with the
  call". A wrapper has only its first key to hand over, so `store.b()` reaches
  `devtools` as `a`.
- **Evidence.** `fn-rows.ts` on `wt-r`: `{a: f, b: f}`, `b` read first,
  gives the names `["b","b"]`. After `store.b = store.a`, `store.b.name` is
  `"a"`.
- **Severity:** unclear.
- **What would settle it.** Either the key is taken at the read, not stored
  in the wrapper, or both entries say "the key it was first read under". Then
  a test of an entry name for `store.b = store.a`.

### 14. Decision 12's "answers for now" do not match its own spike

- **Decision:** 12, and the unspecified list.
- **Objection.** Decision 12 says a getter added to a prototype after a
  first read "is not seen". G2 found that it is seen on every form, because
  the read falls through to `Reflect.get`. It is not memoized, and its body
  runs at every read. The unspecified list says decision 12 "gives today's
  answers", and decision 12 itself names an answer that differs from today.
- **Evidence.** `proto-later.ts`. On `wt`: values 4, 4, 4 with 1 run of the
  body. On `wt-g2`: values 4, 4, 4 with 3 runs. `spike-core-3.md`, G2, "What
  it changes for a user", last sentence.
- **Severity:** unclear.
- **What would settle it.** Correct the answer to "seen, not memoized", and
  correct "today's answers" in the list.

### 15. The guard in its own scope flags itself, and the first commit breaks the ceiling rule

- **Decision:** 4.
- **Objection.**
  - The guard is to cover its own file. Its rules match text, and the file
    holds that text: the line that lists `biome-ignore`, `@ts-ignore` and
    the rest is flagged as a silenced checker whenever it is added or moved.
    The tests "for each rule of the guard" need fixtures with `it.skip(` and
    `@ts-ignore` in them, and those are in scope too.
  - "The floor guard refuses a commit that changes a ceiling together with
    anything else." The first commit adds the ceilings together with the
    tooling, its tests, the record and the change to `CONSTRAINTS.md`.
    Whether "adds" counts as "changes" is not said.
- **Evidence.** `scripts/floor-guard.mjs`, the `suppressions` regex and
  `isSelf`. Commit `e70a223`, which added that line, would be flagged by a
  guard that covers itself. Decision 4, "How a budget moves in stage 4", and
  the order, step 1.
- **Severity:** unclear.
- **What would settle it.** A rule for the guard's own file: in scope for a
  weakened rule, not for its own pattern text. Fixtures built so that they do
  not match. A sentence that the commit adding a ceiling is exempt.

### 16. The restore's check treats a function field as a key to delete on a JSON jump

- **Decision:** 30 (G3), with 29.
- **Objection.** Decision 29 says a jump the extension sends as JSON never
  deletes a function field. G3's check counts every key of the live snapshot
  that the recorded state lacks as a key to delete. A JSON state lacks every
  function field. So on a sealed or frozen root, a JSON jump fails the root
  check and throws, although the restore would delete nothing. G3 was built
  before decision 29's rule, and stage 4 writes 30 before 29.
- **Evidence.** `g3-on-k1.patch`, `canRestoreInPlace`, the loop over
  `Object.keys(current)`. Decision 30, "Evidence": "Not run: a DevTools jump
  on a frozen root". The order, step 8 (30 before 28 and 29). Reasoned from
  the patch, not run.
- **Severity:** unclear.
- **What would settle it.** The check skips the keys the restore skips. Then
  a test of a JSON jump on a sealed root whose methods are own fields.

### 17. Loose ends in the lists and the order

- **Decision:** "Proposed in a report and not taken", the first answers
  table, and the order.
- **Objection.**
  - The fast path is missing from the not-taken list, although its report
    recommended it. G2's forms (a) and (b) are missing too.
  - The answer to W9 still says "the lost-write check ships in 1.0".
    Decision 36 now says it does not ship if it cannot hold the limits, and
    labels it "can follow". Decision 1's last cost bullet relies on it too
    ("decision 36 reports it").
  - Step 9 of the order collects the tests that need the base class for 19
    and 10, not decision 1's. Those are the overriding arrow field, the names
    of base-class arrows, and `snapshot(k).bump`. Decision 1 lands in step 3.
- **Evidence.** The list, the W9 row, decision 36's "Label", decision 1's
  "What it costs a user", the order, steps 3 and 9.
- **Severity:** unclear.
- **What would settle it.** Add the items, correct W9, make decision 1's
  sentence conditional, and name decision 1's base-class tests in step 9.

## The second round's answers

Checked one by one against the entries as they now read. They hold, except
where listed:

- **2W3** does not hold in substance. See objection 10.
- **2W4** holds for the per-commit walk and the tests, with the two gaps of
  objection 15.
- **2W7** holds for one function under one key. See objection 13.
- **2W1** holds: a newer record is never migrated or written over, and the
  write-back is after an upgrade only. The new losses it opens are objection
  4.
- **2C3** holds for the three rows G1 ran, and for decision 1 by reading. It
  does not cover a write to an ancestor (objection 11) or the layer decision
  43 replaces (objection 12).

## Examined and found nothing against

- Decision 1's figures against `spike-functions-2.md`: 67 and 18 lines; 27
  tests against 28; 3,873 bytes, 155 over the base and 15 under F1; the 28
  and 20 ns against F1; "every range touches the strict rule's". The row of
  150 in decision 4 is 3,873 less 3,661, less 49 and 13.
- The rows of decision 1 that I ran again on `wt-r`: a getter over a replaced
  `function` field (`b1`), and a prototype method written back (one
  notification, as today).
- Decision 4: both sums (+1,636 and +1,285), 5,297 and 3,971, and every
  ceiling by its stated rule (estimate, allowance, 2%, next 25). The rows for
  decisions 5, 6, 10, 12, 27 (+57 is the "adds" figure of K2), 30 and 44
  against their reports. The size script strips development code
  (`define NODE_ENV production`), so decision 36's check does not count
  against the ceiling. The per-commit walk finds no commit since
  `CONSTRAINTS.md` that removes assertion lines.
- Decision 10's G1 figures (18 and 21 lines, 42 bytes, the same 20 tests,
  the 4% on Bun).
- Decision 12's G2 figures (+15 bytes, the heap table, the timings of (c)),
  and its label.
- Decision 30's G3 figures (44 and 5 lines, 211 bytes, seven locked kinds,
  ten rows, not timed on Node) and the frozen root.
- Decisions 22 and 23 against P3 and P4, and the version rule of 21 against
  2W2.
- The index rows and labels of 1, 4, 10, 12, 21 to 24, 30 and 36 against
  their entries; guarantee rules 2, 4 and 6 against decisions 1 and 10,
  apart from objection 11.
- The order: 3 first, 12 before 2 and 1, 5 after 2, 7 after 10, 27 before 30,
  13 before the adapter flags, the guard rule and the codes page before
  their first users.

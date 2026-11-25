# Adversarial review: the stage 3 decisions as a whole

Subject: decisions 4, 20 and 32 to 36, the index, "Proposed in a report and
not taken", the issue table, the guarantee rules and the order for stage 4 of
`review/stage-3-decisions.md` at `cec3e81`. The scratch folder is
`<scratch>/stage-3-adversarial-whole/`. Nothing in the repository was changed
except this file.

## Objections

### 1. Undo and time travel of a store with a cycle never return

- **Decision:** 30 with 44, and the order for stage 4.
- **Objection.** Decision 44 lets a snapshot keep a cycle. Decision 30's
  in-place restore descends into any recorded value whose node is still live,
  with no visited set. On a cycle the recorded snapshot is never the current
  one, because everything on a cycle gets a new snapshot on every write, so
  `restoreValue` and `applyFields` call each other until the stack overflows.
  Decision 44 says `withHistory` is "made safe", but against today's
  `withHistory`; step 7 then replaces it with V4's walk, and the two spikes
  were never built together.
- **Evidence.** `spike-classes-2.md`, appendix `v4-in-place.patch`:
  `restoreValue` calls `applyFields(live, state)` whenever
  `snapshot(live) !== state`, and `applyFields` calls `restoreValue` for every
  key whose snapshot differs. `spike-snapshots.md`, N3: the combination there
  has no V4. A model of the patch's two functions over snapshots that keep a
  cycle, `<scratch>/stage-3-adversarial-whole/cycle-restore-model.mjs`
  (`root = {n: 1, self: root}`, record, write `n = 2`, undo), prints
  `undo: applyFields entered 1000 times: never returns | n = 1`. A DevTools
  jump shares `applyState`, so it fails the same way. This is a model, not the
  library.
- **Severity:** wrong. It adds a stack overflow on undo that is not there
  today, where the store cannot be snapshotted at all.
- **What would settle it.** Apply N3 and V4 to one worktree and undo a write
  to `{n, self}`. The likely fix is a set of nodes already restored in one
  `applyState` call, and a test for it in the commit of decision 30.

### 2. Decision 27 says entries are not sent on the synchronous channel; its evidence sends them there

- **Decision:** 27, and "not taken" ("DevTools entries on the synchronous
  channel (M57)").
- **Objection.** "One entry per outermost method, named after it" cannot be
  built on the batched channel: two methods in one task produce one batched
  notification. The spike the decision cites subscribes with `{sync: true}`
  and sends one snapshot per method. The decision and its "not taken" list say
  the opposite, so a reader can implement two different things, and one of
  them cannot meet the decision's first sentence.
- **Evidence.** `persist-devtools.md`, P7, "Sending": "`devtools` subscribes
  with `{sync: true}`. Inside a method it sends one entry named after the
  method", and the repro row `["rename","birthday","STORE_UPDATE"]` for two
  methods in one task. Its recommendation counts "the synchronous channel" as
  visible behaviour. Today's `devtools.ts:76` subscribes batched.
- **Severity:** wrong (contradicts its own report).
- **What would settle it.** Say what P7 did: synchronous for method entries,
  one batched `STORE_UPDATE` per task for direct writes. What M57 rejected was
  a snapshot per direct write, not the synchronous channel as such.

### 3. The base class is ordered before the restore it needs

- **Decision:** 11, 30, the order for stage 4.
- **Objection.** Decision 11 says "after decisions 1 and 2, and together with
  decision 30, which it needs". The order puts the base class in step 5
  ("after 1, 2 and 30") and decision 30 in step 7, after decision 27. As
  written, the base class lands two steps before the restore it depends on.
  Every commit in between ships an undo that turns each nested base-class
  store into a frozen snapshot, and the V4 tests cannot be written at step 5.
- **Evidence.** `review/stage-3-decisions.md`, decision 11, "Label"; "The
  order for stage 4", steps 5 and 7. `spike-classes-2.md`, V4: "Do it with the
  base class". The classes combination that was run includes P7 and P8, which
  the order also puts after step 5.
- **Severity:** wrong (an order that cannot be followed as written).
- **What would settle it.** Move the base class to after step 7, or move 27
  and 30 ahead of it.

### 4. No tool enforces the ceilings, and any decision record turns the guard off for the rest of the branch

- **Decision:** 4.
- **Objection.** Stage 4 moves budgets in `budgets.json` commit by commit, and
  "never above the ceiling" is a rule in prose only. `floor-guard.mjs` reads
  only `CONSTRAINTS.md`. It ignores `budgets.json` and `limits.json`, which are
  what `bun run size` and the benchmark read. It diffs the whole branch since
  `CONSTRAINTS.md` was added, so once any file exists under `docs/decisions/`,
  every later loosening of `CONSTRAINTS.md` is printed as a note, not blocked.
  That is a silent way past the quality bar. Also, `CONSTRAINTS.md` asks for a
  record "that the owner approved", and its header says the owner has not
  reviewed it. The decision does not say who approves that record.
- **Evidence.** In a throwaway worktree of `cec3e81`: main budget set to
  9,999 in `budgets.json` and the Bun read limit to 99 in `limits.json`.
  `node scripts/floor-guard.mjs` printed `floor-guard: clean` and exited 0.
  Then the size row in `CONSTRAINTS.md` set to 9,999, plus a file
  `docs/decisions/0001-x.md` holding `x`. The guard printed
  `note [threshold-loosened]` and `clean`, and exited 0. See
  `scripts/floor-guard.mjs` lines 120 and 238 to 241 (only `CONSTRAINTS.md`)
  and 295 to 307 (any record turns findings into notes). Also, `ci.yml` runs on
  pull requests to `main` only, so no budget is checked on `release/1.0`
  commits unless they are run by hand.
- **Severity:** wrong. The decision relies on a check that does not exist.
- **What would settle it.** Put the ceilings in a file the size and benchmark
  scripts read, and fail above it. Have the guard compare `budgets.json` and
  `limits.json` with `CONSTRAINTS.md`. Say who approves the record.

### 5. The `./collections` ceiling is set from a wrong number and leaves no room

- **Decision:** 4, 45, 42.
- **Objection.** Decision 45 says the mutator check grows `./collections` by
  32 bytes. The report says the entry then adds 782, which is 55 bytes more
  than 727; 32 is how far 782 is over the old budget. With the snapshot index
  and the membership rule (843 together) and the snapshot combination's other
  bytes, the estimate is about 900, the ceiling itself, before the 2%
  headroom. So the statement that every final budget "will be below these
  ceilings" fails for this entry on the reports' own numbers.
- **Evidence.** `spike-snapshots.md`, N4, size: "With the message cut ... it
  adds 782, which is 32 over"; its combination row: `./collections` 784.
  `adapters-collections.md`, A7: `a7-m39` 740, `a7a` 843. 843 + 55 + 2 ≈ 900.
- **Severity:** wrong (the number does not match the report).
- **What would settle it.** Build A7 `a7a` together with N2 and N4, measure it,
  and set the ceiling from that.

### 6. The release split does not stop what decision 32 says it stops, leaves three steps undecided, and makes the 1.0 publish its first run

- **Decision:** 32.
- **Objection.**
  1. The "Why" says that today a compromised development dependency "could
     publish a version with valid provenance". After the split it still
     can. It runs in job 1 during `bun install` or `bun run build`, rewrites
     `dist`, and job 1 packs that `dist` and hands it to job 2, which
     publishes it with provenance. Security 12 names both routes, "publish
     its own version, or rewrite `dist`". The split removes only the first.
  2. Where the tag step goes is not decided. Today it runs `bunx changeset
     tag` after the publish, with installed packages and a push. In job 2 it
     breaks "installs nothing" and needs `contents: write`. In job 1 the tag
     is pushed before the publish, so a failed publish leaves a tag for a
     version that is not on npm.
  3. "Checkouts that do not push set `persist-credentials: false`" exempts
     the one checkout that matters. The release job pushes, so its
     `contents: write` token stays in `.git/config` while ~1,800 packages
     install and build. Security 12, step 4, asks for
     `persist-credentials: false` there too, with the token passed
     explicitly to the push.
  4. The `npm view ... already published` check is not placed. If job 2
     runs on every push to `main` with no changesets, a required reviewer
     (the owner's step) is asked to approve a publish that does nothing.
  5. Actions pinned to a commit with no Dependabot configuration
     (`.github/` has only `workflows/`) go stale; security 12, step 3, pairs
     the two.
  6. The label is "Can follow 1.0", and it is the last commit. So the first
     run of an untested workflow is the 1.0 publish. Nothing about the split
     has to ship with 1.0.
- **Evidence.** `.github/workflows/release.yml` (one job; publish then
  `bunx changeset tag` and `git push --follow-tags`);
  `review/stage-2/security.md`, finding 12, "What happens" and steps 3 and 4.
- **Severity:** wrong (item 1 overclaims; items 2 to 4 leave it unclear what
  to write).
- **What would settle it.** Correct the "Why". Name the job of each step,
  tags included. Apply `persist-credentials: false` to the release checkout.
  Keep the "already published" check in job 1 as an output that gates job 2.
  Ship the split on the first 1.x release, or after a `workflow_dispatch`
  dry run on a branch, not as the 1.0 publish.

### 7. "Dead code last" breaks the quality bar at the commits that make the code dead

- **Decision:** 20, and steps 7 and 10 of the order.
- **Objection.** Decision 20 removes the bookkeeping that "decisions 22 and
  23 make unreachable" at step 10, but 22 and 23 land at step 7. `persist.ts`
  is a mutation target. From the commit of 22 and 23 until step 10, its dead
  branch gives surviving mutants that nothing explains, and `CONSTRAINTS.md`
  allows none, checked "before a commit that touches a target file". The same
  holds for `node.resumeScope()` in `createClassyStore`, which decision 3 (step
  1. makes redundant (finding 64). The reason given for "last", that "the
     patches of decisions 1 and 2 will not apply", does not hold either: stage 4
     rewrites each change test first and applies no patch (`REVIEW_PLAN.md`,
     stage 3, step 3).
- **Evidence.** `persist-devtools.md`, "Seen in the combination: dead code
  for stage 4" (the `discardEditedFields()` branch and `clearedVersion`);
  `CONSTRAINTS.md`, "Mutation"; `review/stage-1-report.md`, finding 64, third
  item.
- **Severity:** wrong (the order cannot pass the bar as written).
- **What would settle it.** Remove dead code in the commit that makes it dead.
  Keep step 10 for code that is dead today.

### 8. Decision 1 adds the silent failure that decisions 11 and 15 call a defect, and decision 36 leaves it without a word

- **Decision:** 1, 36, against contract point 8.
- **Objection.** Under decision 1 an object-literal method is no longer a
  transaction. Each write inside it notifies a synchronous subscriber, and
  every adapter is one. So a component can be handed half-applied state.
  That is finding 43, which decision 15 fixes for setters. It is also the
  per-write flood that decision 11 gives as its reason for the arrow-method
  exception: "150 milliseconds ... and nothing says so". Only the detached
  call is loud. The decision's "it fails loudly" covers the detached call
  and not the attached one, which is the common use.
- **Evidence.** Decision 1, "What it costs a user"; decision 11, "Why", last
  point; decision 15; `review/stage-1-report.md`, finding 43 ("a subscriber
  sees the half-applied state").
- **Severity:** wrong. It adds a new silent failure, which contract point 8
  calls a defect.
- **What would settle it.** One of these: a rule that an object-literal
  method found at creation is a transaction, as an own function that creates
  a field is in decision 11; or a 1.0 warning; or a sentence in the reference
  and the guarantee list that names the half-applied state.

### 9. After all 46 decisions, the silent failures a 1.0 user still meets with no word

- **Decision:** 36 (and 11's "the base class removes it").
- **Objection.** Decision 11 says the base class removes "the most prominent
  silent failure". It removes it only for a class that is rewritten to extend
  `ClassyStore`. `createClassyStore(new X())` stays documented, and is the
  only way for a class that extends something else. With an arrow-function
  field, its writes still go to the raw object and tell no one. With every
  warning moved to 1.x, these stay silent in 1.0:
  1. An arrow-function field in a class passed to `createClassyStore()`.
  2. An object-literal method's writes, one notification each (objection 8).
  3. A native `Map` or `Set` in a store: `set()` and `add()` notify no one.
  4. An unmarked nested class instance: writes inside it notify no one.
  5. A `Date` changed in place.
  6. A write through the raw object, or through
     `Object.getOwnPropertyDescriptor(store, k).value` (findings 11 and 50).
  7. A getter that reads another store, a static, or a child through an
     outside reference: stale for good (M21, not taken).
  8. A mutated getter result, which leaks into later snapshots (finding 40).
  9. A named property on an array: kept live, dropped from every snapshot
     (M37; its development error needs the build that decision 36 drops).
  10. In a `ClassyStore` subclass, a callback field without an initialiser:
      the function assigned later is wrapped, so `removeEventListener` with
      the original reference does nothing.
  11. ES5 output: arrow methods notify once per write.
  12. `batch(async …)` from JavaScript, or through a cast: only the writes
      before the first `await` are batched. The type is the only guard.
  13. A prototype that gains a getter after its first read through a store,
      which decision 12 makes permanent per prototype.

  A write after an `await`, the second failure the plan names, is not a lost
  write: it notifies, once per write. It is a cost, not a silence.
- **Evidence.** Decisions 1, 10, 11, 12, 16, 42; `devbuild.md`, B3 table
  (`native-collection`, `opaque-instance`, `arrow-method`,
  `array-named-property`); `merged.md`, M37 and M77.
- **Severity:** unsupported. The claim that the base class removes the
  failure holds only for users who change their classes.
- **What would settle it.** Put this list in the docs page that decision 35
  creates, next to the codes. And do one of two things: ship the two
  warnings that decision 36 itself calls precise, or say plainly that 1.0
  catches none of these.

### 10. No environment read in 1.0 locks `devtools({enabled: true})` as the default for all of 1.x

- **Decision:** 36, 27, and "not taken".
- **Objection.** Decision 36 says nothing about warnings has to be settled
  before 1.0. But it also fixes `enabled: true` because "the library reads no
  environment in 1.0". Changing that default later, to on in development
  only, is a change of a default and so breaking. `devbuild.md` says so. That
  door closes with 1.0, and the choice appears in neither the label nor the
  "not taken" list. The default hands every state to any extension on a
  production page.
- **Evidence.** `devbuild.md`, "Contradiction 19": "It is a change of a
  default, so before 1.0 if taken." Security 7 (M57).
- **Severity:** mislabelled (a door that closes is presented as one that can
  follow).
- **What would settle it.** Decide the default as a "Before 1.0" item, and
  add the rejected form to "not taken".

### 11. Decision 42 drops an adapter flag that decision 37 needs, and places that change in two different steps

- **Decision:** 42, 37, 13, the order.
- **Objection.** Decision 42 says the adapters drop their `active` flags,
  except Angular's `destroyed` check, "in the same change as decision 13". The
  order puts it in step 8, with the adapters, long after 13 in step 4. And
  with decision 37, Solid's `active` flag has to stay, because it then
  decides what the accessor returns after disposal. Dropping every flag, as
  42 says, after 37 is the defect the report warns about.
- **Evidence.** `adapters-collections.md`, "The combination I would
  recommend": "With A1, Solid's `active` flag stays ... Vue, Angular and
  Svelte lose theirs." The A6 row: "Do it with D1, never without".
- **Severity:** unclear.
- **What would settle it.** Name the flags that go (Vue, Angular, Svelte) and
  the one that stays (Solid's), and give one place in the order.

### 12. Four labels contradict the document's own definition

- **Decision:** 28, 37, 9, 8.
- **Objection.** The definition is "Before 1.0" when a change alters
  documented behaviour.
  - **28** is "Can follow 1.0, though the history guide describes the old
    behaviour and that sentence goes". By the definition, that makes it
    "Before 1.0".
  - **37** changes the Vue ref from shallow to non-shallow (the `isShallow`
    test). The reference says Vue returns a ref "backed by `shallowRef`".
  - **9**, the realm guard, is "Can follow 1.0" and may fall to 1.x under its
    condition. Today a plain object from another realm is opaque: shared by
    reference with every snapshot, mutable, `snap.obj === raw`. Afterwards it
    is a frozen copy. Code that writes to it through a snapshot, or compares
    identity, breaks in a minor release.
  - **8** is "Can follow 1.0", yet guarantee rule 2 ("A write that changes
    nothing notifies no one") is written into the 1.0 spec and is false
    without it.

  All four are scheduled for stage 4, so the damage is limited to 9 if its
  condition fails.
- **Evidence.** `website/content/docs/API_REFERENCE.md` line 51 to 52;
  `website/content/docs/HISTORY_TUTORIAL.md` lines 164 to 169;
  `adapters-collections.md`, A1 (`isShallow` incidental); decision 9's
  condition.
- **Severity:** mislabelled.
- **What would settle it.** Relabel 28, 37 and 8 "Before 1.0". For 9, either
  ship it in 1.0 or drop it for 1.x and say why it then cannot come.

### 13. The guarantee rules contradict documented behaviour and three decisions

- **Decision:** "What 1.0 guarantees", against 11, 13, 16, 35 and 42.
- **Objection.**
  - **Rule 5**, "A snapshot is frozen", is false for what stays opaque:
    unmarked class instances, native `Map`, `Set` and `Date`, a read-only
    field holding an object (finding 49), and a getter's result, which the
    reference documents as "cached but not automatically frozen".
  - **The unspecified list** says "the text of every error message", while
    decision 35 makes the code inside that text stable and its renaming
    breaking.
  - **Rule 3** ("before the outermost write returns") is false for round 101,
    which decision 13 stops.
  - **Rule 2** omits the arrow-function methods of a `ClassyStore`, which
    decision 11 makes transactions. It also says nothing about an `async`
    method, which decision 16 makes a transaction "up to its first `await`"
    only.
- **Evidence.** Decision document, "Guaranteed" rules 2, 3 and 5,
  "Unspecified" item 3; `review/stage-3/pinned.md`, the getter-result rows
  ("For snapshots only: cached but not automatically frozen (API)").
- **Severity:** wrong (two rules that cannot both be true).
- **What would settle it.** Rule 5 covers the containers the store proxies,
  and opaque leaves are named as shared. Error text is unspecified except its
  code. Rule 3 names the bound. Rule 2 names the arrow methods and the
  `await`.

### 14. Not every finding and issue is decided on purpose

- **Decision:** the issue table, 34, 24, 28.
- **Objection.**
  - **Stage 1 finding 4**, the two React snapshot-cache traps that cannot be
    reached, is decided nowhere. `merged.md` maps it to "None", and decision
    20 covers only the core files, `persist`, `equality`, `history` and
    `collections`.
  - **M37** is mapped to decision 34. But 34 covers only M76 and M77, and
    M37's proposals are a development error and a docs sentence ("arrays
    carry indices and `length` only"). Neither is taken or listed as not
    taken.
  - **Decisions 24 and 28** have no "Decision." paragraph. What 28 does to the
    `restoring` counter (finding 58) is only in the report.
- **Evidence.** `merged.md`, "All 73 stage 1 findings", row 4, and M37;
  `review/stage-1-report.md`, "Coverage"
  (`snapshotTargetCache.ts`, "Candidate for stage 3: they may be redundant").
- **Severity:** unclear.
- **What would settle it.** One line each: keep or remove the two traps, take
  or refuse M37's sentence, and the decision text of 24 and 28.

### 15. "Proposed in a report and not taken" is incomplete, and some of its gaps close doors

- **Decision:** "not taken".
- **Objection.** It introduces itself as one list of what each entry
  rejects, and misses at least these:
  - A `'migrate'` value of the public `PersistOperation` type (contradiction
    20, decision 21). Adding a union member in 1.x breaks a consumer's
    exhaustive `switch`.
  - Refusing the write that closes a cycle (M36 (b), decision 44).
    Refusing it after 1.0 is breaking.
  - Hiding `_entries` and `_items` (M43, decision 45): breaking after 1.0.
  - The environment default of `devtools` (objection 10).
  - Non-enumerable own accessors (decision 43), the source-text arrow check,
    `opaque()` and the mixin (decision 11), D4's runtime check (16), awaiting
    an `async` `migrate` (21), refusing events without `storageArea` (25),
    and the devbuild report's advice to ship five warnings with 1.0 (36).

  Its first item, "Wrapping every stored function and caching the wrapper
  (MobX's way)", is not the alternative decision 1 rejects, which is the
  "lenient" variant.
- **Evidence.** Decisions 1, 11, 16, 21, 25, 36, 43 to 45; `merged.md`,
  contradictions 19 to 21.
- **Severity:** unclear. Three of the gaps are choices that a 1.x release
  cannot undo.
- **What would settle it.** Complete the list, and mark the items that 1.0
  makes final.

### 16. The main-entry figures do not agree with each other and rest on a set that was never built

- **Decision:** 4, 35.
- **Objection.**
  - The table sums to +1,150, which gives 4,811 bytes, 31% above today. The
    text says "near 4,700 bytes, 28%".
  - The codes save "about 100 bytes" in decision 4 and "those 271 bytes" in
    decision 35.
  - The 271 bytes were measured on a first-wave set that includes T3 (b)'s
    refusals and D4's runtime check, neither of which is taken. Decision 4's
    "what was cut" list then counts that text twice: "long error messages
    (271)" and "refusals ... (160), most of it message text".
  - The sums do not reliably overstate. Two combinations that were built
    came out above their parts: traps 650 against 617, snapshots 243
    against 230.
  - The ceiling of 4,850 is 39 bytes above the plain sum.
  - The whole set was never timed. The trap combination's timing in
    `spike-traps.md` is still the placeholder `@@COMBO-TIMING@@`. So "the
    cost limits do not move" is a forecast.
  - "Each limit is tightened to the highest new run times 1.2, which needs
    no decision record" is only true where the new figure is lower.
- **Evidence.** Decision 4's tables; `devbuild.md`, B1 and "The size
  budgets"; `spike-traps.md`, "The combination", size and timings;
  `spike-snapshots.md`, "The combination".
- **Severity:** unsupported.
- **What would settle it.** One build of the decided set on the main entry
  and its four ratios on both engines before the ceilings are written into
  the record. And "loosened needs a record" for any limit that rises.

### 17. What in decision 4's set buys little for its bytes

- **Decision:** 4, 27, 9, 7.
- **Objection.**
  - The action-name hook of decision 27 costs 20 bytes in the main entry and
    in every other entry. On Node it adds 3 to 7% to every method call,
    whether or not `devtools` is used. That is a cost on a hot path for every
    user, for an optional development tool.
  - `devtools` as a whole is 403 of the `./utils` growth, `IMPORT_STATE`
    among it.
  - The realm guard (40 bytes) serves a case that decision 9 calls rare.
  - The `has` and `ownKeys` traps (156 bytes) serve getters that use `in` or
    `Object.keys(this)`.

  All four may be worth it, but decision 4 weighs none of them.
- **Evidence.** `persist-devtools.md`, P7 size and "store.method" (Node 311 to
  321 ns); `spike-classes-2.md`, "The combination" (Node 297 to 317 ns).
- **Severity:** unsupported.
- **What would settle it.** Take the method name only while a `devtools`
  connection exists, for example through a hook that `devtools()` installs.
  Then measure the method path again.

### 18. What `devtools` sends after decision 43 was never built, and it sits outside the `./utils` ceiling

- **Decision:** 43, 4.
- **Objection.** Decision 43 says "`devtools` keeps showing computed values:
  it adds the getters' values to what it sends". The snapshot report lists
  exactly this under "Not done". Its bytes are not in the `./utils` row, and
  a walk that adds getter values to nested snapshots has the same cycle
  problem as objection 1.
- **Evidence.** `spike-snapshots.md`, "Not done": "What `devtools()` should
  send now that a snapshot carries no getter values".
- **Severity:** unsupported.
- **What would settle it.** Spike it with decision 44 in the build. Put its
  bytes in the ceiling. Or drop the promise and change the DevTools tutorial.

## Examined and found nothing against

- The issue table: every id from M1 to M77 appears. M23 appears under both 7
  and 10, which agrees with the text.
- Stage 1 findings 13, 35, 40 and 56: decided in `pinned.md` as unspecified or
  documented, which the guarantee section adopts.
- The main-entry table's arithmetic (+1,150), and the per-change figures for
  decisions 3, 10, 12, 13 to 15 and 20 against their reports.
- The `./react`, `./vue`, `./angular`, `./solid`, `./svelte` and
  `./react/server` ceilings against `adapters-collections.md` and
  `spike-snapshots.md`.
- The order of the trap changes in step 1, against `spike-traps.md`, "Which
  spikes conflict". Getters before `has`/`ownKeys`, the walk first, and
  `M9` before `M1` and `M2`, against `merged.md`'s dependencies 6, 7 and 9.
- Decision 33, and decision 32's `contents: read` for the three workflows that
  declare no permissions: none of them writes.
- Decision 16's asymmetry argument, decision 17, and decision 36's rejection
  of export conditions.
- Decision 1's claim that no doc, example or website page uses an
  object-literal method (searched).

## Counts

Wrong: 9 (objections 1 to 8, 13). Mislabelled: 2 (10, 12). Unsupported: 4 (9,
16, 17, 18). Unclear: 3 (11, 14, 15).

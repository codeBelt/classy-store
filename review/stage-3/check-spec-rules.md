# Check of spec sections 5 to 11 against the decision document

Checked at commit 7a1dec5. Sections 5 to 11 of `review/spec.md` (lines 1340
to 1806) against `review/stage-3-decisions.md`, `CONSTRAINTS.md`,
`budgets.json`, `limits.json`, `REVIEW_PLAN.md` "Stage 4", the messages in
`packages/classy-store/src/` and the pages in `website/content/docs/`. 17
findings, 3 unclear points. Section 12 was read; nothing here repeats it.

Line numbers of `review/stage-3-decisions.md` are those of the committed file
at 7a1dec5. While this check ran, the working tree gained an uncommitted edit
of that file (decisions 4, 13, 18 and 20). Findings 1 to 16 hold against both
versions; finding 17 is against the edit only.

## Findings

### 1. Rule 1.3 does not state what decision 13 guarantees for a subscriber removed during delivery

- **Where:** `review/spec.md:1352`
- **It says:** "A subscriber is not called for a write made after its
  unsubscribe function returned, also when that write is in the round that
  is running."
- **The decision document says:** "A subscriber removed during delivery is
  not called", decision 13, line 991. The label (line 1037) adds that "what a
  removed or a late subscriber gets goes into the spec as guaranteed".
- **Kind:** wrong. A write already in the round that is running was made
  before the unsubscribe, so it is not "a write made after" it. As written,
  1.3 cannot be tested for that case, and the D13 rule is not stated.
- **Correction:** "1.3 A subscriber is not called after its unsubscribe
  function returned, also for a write made before it that the round that is
  running has not delivered to it yet [D13]."

### 2. Rule 11.1 points at spec sections that stage 5 deletes, not at the reference

- **Where:** `review/spec.md:1484`
- **It says:** "Every export of section 2 exists with its signature of
  section 3."
- **The decision document says:** "Every export the reference lists exists
  with its documented signature", guarantee 11, line 2226.
- **Kind:** wrong. The plan's stage 5 deletes `review/`, so a guarantee tied
  to the spec's own sections has nothing behind it after 1.0.
- **Correction:** "11.1 Every export that `API_REFERENCE.md` lists exists
  with the signature it documents. Sections 2 and 3 of this spec are what
  the reference must list when stage 4 ends."

### 3. Section 7 credits decision 35 with a rule about adapter prefixes that it does not contain

- **Where:** `review/spec.md:1530-1531`
- **It says:** "an adapter's prefix names the adapter [D35]"
- **The decision document says:** "An error or a logged report from the
  library reads `@codebelt/classy-store [code]: facts`", decision 35, line
  1968. Decision 39 (line 1868) says only "with the prefix and a code".
- **Kind:** extra. Today Vue and Solid use `@codebelt/classy-store/vue:` and
  `/solid:`, and Angular has no prefix at all
  (`frameworks/angular/angular.ts:17`). Which prefix an adapter uses is not
  decided.
- **Correction:** drop the clause, or mark it "(proposed)" and add it to open
  point 2.

### 4. The `not-a-store` row leaves out three exports that throw it today

- **Where:** `review/spec.md:1541`
- **It says:** Export column "`snapshot`, `subscribe`, `subscribeKey`, the
  React hooks, `createStoreHook`, `prepareStoreForHydration`, every adapter"
- **Today's code:** `withHistory` calls `snapshot()` first
  (`utils/history/history.ts:61`), `persist` calls `snapshot()` and
  `subscribe()` (`utils/persist/persist.ts:56`, `:485`), and `devtools`
  calls `snapshot()` once connected (`utils/devtools/devtools.ts:69`). All
  three reach `getInternal()` and throw the same message.
- **Kind:** missing.
- **Correction:** add "`persist`, `withHistory`, `devtools` (connected),
  through `snapshot` or `subscribe`" to the Export cell.

### 5. Section 9 names an `onError` line in the reference's `persist` entry that does not exist

- **Where:** `review/spec.md:1679`
- **It says:** "`API_REFERENCE.md`, `persist` | The `onError` line: the
  third argument and the default report"
- **The page:** `API_REFERENCE.md` lines 512-525 have no `onError` at all;
  the word does not occur on the page. `onError` is documented in
  `PERSIST_TUTORIAL.md`, in the options block (line 115) and under "Handle
  operation failures" (lines 564 and 582), and in `PERSIST_ARCHITECTURE.md`
  (lines 119, 214, 284).
- **The decision document says:** "`onError` receives the handle as its
  third argument" and "When no `onError` is given, the report goes to
  `console.error`", decision 21, lines 1232 and 1237.
- **Kind:** wrong.
- **Correction:** "`PERSIST_TUTORIAL.md`, the options block and 'Handle
  operation failures'; `PERSIST_ARCHITECTURE.md`, 'Error Handling' | `onError`
  gets the handle as its third argument; without `onError` the report goes
  to `console.error` with its code. Optionally add an `onError` line to the
  reference's `persist` entry | D21".

### 6. The entry-table row puts signatures in a table that holds names, and the Angular adapter sentences are missing

- **Where:** `review/spec.md:1667-1668`
- **It says:** entry table: "the Vue return type; the Angular `options`";
  adapters paragraph: the Vue sentence only.
- **The page:** the entry table (`API_REFERENCE.md:31-41`) lists runtime
  exports and public types only. Vue's return type is in the adapters
  paragraph (line 51). The spec's own open point 13 says the options object
  of `injectClassyStore` is not exported, so it has no place in that table.
  The adapters paragraph also says "Angular returns a readonly signal and
  requires an injection context" (line 54), and the Angular paragraph says
  "It requires a live injection context" (line 68). Decision 39 makes both
  false: "`injectClassyStore(store, {injector})` works outside an injection
  context", line 1866.
- **Kind:** wrong (entry table), missing (Angular).
- **Correction:** entry table row: "Add `ClassyStore`, `ReactiveMapSnapshot`,
  `ReactiveSetSnapshot` | D11, D45". Adapters paragraph row: add "Angular
  'requires an injection context' (line 54) and 'It requires a live
  injection context' (line 68) gain 'or an `injector` option' | D39".

### 7. `README.md` does not say "about 3.7 KB"

- **Where:** `review/spec.md:1716`
- **It says:** "`README.md`, `CLAUDE.md` | 'about 3.7 KB' becomes the measured
  figure, in stage 5"
- **The decision document says:** "The README and `CLAUDE.md` say 'about 3.7
  KB'", decision 4, line 557.
- **The files:** only `CLAUDE.md:7` has it ("core about 3.7 KB … about 4.9 KB
  with the React hooks"). Neither `README.md` nor
  `packages/classy-store/README.md` nor any docs page states a size.
- **Kind:** wrong (the decision document carries the same error).
- **Correction:** "`CLAUDE.md` | 'about 3.7 KB' and 'about 4.9 KB with the
  React hooks' become the measured figures, in stage 5 | D4".

### 8. Decision 19 reverses a sentence of the persist tutorial that section 9 does not list

- **Where:** `review/spec.md` section 9, the `PERSIST_TUTORIAL.md` rows
  (lines 1693-1699)
- **The page:** `PERSIST_TUTORIAL.md:560`, "Hydration is asynchronous even
  with `localStorage`: read results are applied after an `await`, not before
  `persist()` returns."
- **The decision document says:** "`persist()` restores before it returns
  when the storage is synchronous", decision 19, line 1139. Its label is
  "Before 1.0".
- **Kind:** missing.
- **Correction:** add a row "`PERSIST_TUTORIAL.md`, 'Handle operation
  failures' | 'Hydration is asynchronous even with `localStorage` …' is
  reversed: with a synchronous storage the record is restored before
  `persist()` returns | D19".

### 9. Decision 21's version rule makes two persist-tutorial passages false, and section 9 lists neither

- **Where:** `review/spec.md` section 9, the `PERSIST_TUTORIAL.md` rows
- **The page:** `PERSIST_TUTORIAL.md:108-109` ("triggers migrate when
  mismatched", "Return the migrated state when versions differ") and
  `:454-456` ("Migration runs only when stored and configured versions
  differ. Without a `migrate` callback, stored data from another version is
  ignored … and no error is reported").
- **The decision document says:** "`migrate` is called only for a lower
  version", and a record "From a newer version … Reported as `'parse'`.
  `migrate` is not called. The handle does not write while it is there",
  decision 21, lines 1220 and 1243.
- **Kind:** missing.
- **Correction:** add a row "`PERSIST_TUTORIAL.md`, the options block and
  'version, migrate, & merge' | `migrate` runs only for a lower version; a
  newer record is reported and not written over; 'stored data from another
  version is ignored … no error is reported' holds for a lower version only
  | D21".

### 10. The history tutorial's "How It Works" describes three things decisions 28 to 30 change, and section 9 names none of them

- **Where:** `review/spec.md:1700-1702`
- **The page:** `HISTORY_TUTORIAL.md:154-156`: undo "suppresses recording
  during restoration … (skipping getters and methods)"; "State restoration
  … Keys that resolve to a getter or function on the live store are
  skipped … Every other field is assigned a mutable copy through the
  proxy."
- **The decision document says:** undo drops the `restoring` counter and is
  one transaction (decision 28, line 1508); a function in an own field is
  restored by reference (decision 29, line 1520); a restore writes in place
  and puts the live object back (decision 30, line 1552).
- **Kind:** missing. Section 9 lists only the "restoration microtask"
  sentence (lines 168-169) and new sentences.
- **Correction:** add a row "`HISTORY_TUTORIAL.md`, 'How It Works', steps 3
  to 5 | Recording suppression, 'skipping … methods' and 'assigned a mutable
  copy' are rewritten: one transaction per undo, function fields restored by
  reference, nested objects restored in place | D28, D29, D30".

### 11. The DevTools tutorial's description of sending and time travel is not in section 9

- **Where:** `review/spec.md:1703-1705`
- **The page:** `DEVTOOLS_TUTORIAL.md:114` ("On each batched mutation, sends
  `snapshot(store)`"), `:115` (a jump "assigns top-level data fields …
  skipping top-level getters and methods"), `:192-206` (the numbered steps:
  assigns `proxy[key] = value`, "suppresses the batched notification for the
  jump", nested objects replaced by parsed JSON).
- **The decision document says:** entries go on the synchronous channel, one
  per outermost method (decision 27, line 1439); "A jump replaces the state
  exactly, in one transaction, without calling setters" (line 1459), and
  `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled (line 1463);
  the jump shares the in-place restore (decision 30, line 1552).
- **Kind:** missing. The rows cover `enabled`, entry names and getter values
  only.
- **Correction:** add a row "`DEVTOOLS_TUTORIAL.md`, 'How it works' and the
  time-travel steps | Sending on the synchronous channel, one entry per
  outermost method; a jump is one transaction through the shared restore, in
  place, with no setter called and no function field touched; the four
  messages handled | D27, D29, D30".

### 12. `subscribeKey` stops snapshotting the whole store, and its tutorial says it does

- **Where:** `review/spec.md` section 9 (no row for decision 31)
- **The page:** `SUBSCRIBE_KEY_TUTORIAL.md:76-82`: "Captures an initial
  snapshot", "takes a new snapshot and compares `snapshot[key]`".
- **The decision document says:** "It stops taking a snapshot of the whole
  store on every notification … It reads the live value, and takes a
  snapshot of that one node only when the node or its version changed",
  decision 31, line 1644.
- **Kind:** missing.
- **Correction:** add a row "`SUBSCRIBE_KEY_TUTORIAL.md`, 'How it works' |
  It reads the live value and snapshots the watched node only when it
  changed | D31".

### 13. The collection index changes two sentences about linear lookups, and section 9 lists neither

- **Where:** `review/spec.md:1706-1707`
- **The pages:** `REACTIVE_COLLECTIONS_TUTORIAL.md:19` ("Looking up … scans
  the backing array … On live store state and on plain snapshots the scan
  reads the raw array directly"); `API_REFERENCE.md:478` ("Their lookups are
  linear").
- **The decision document says:** "A snapshot of a collection answers
  `has()` and `get()` from an index", decision 42, line 1936; stage 4: yes.
- **Kind:** missing.
- **Correction:** add to the D42 row: "the lookup paragraph (line 19) and the
  reference's 'Their lookups are linear': a snapshot answers `has()` and
  `get()` from an index; the live collection and a tracked read still scan".

### 14. `ARCHITECTURE.md` describes four mechanisms the core changes, and section 9 lists only the cache of methods

- **Where:** `review/spec.md:1692`
- **The page:** `ARCHITECTURE.md:203` (getter detection walks the prototype
  chain with `Object.getOwnPropertyDescriptor`; decision 12 replaces it);
  `:210` (the DEFINE trap only detaches a child when a property becomes
  read-only; decisions 2 and 5 make a definition a write and keep the child);
  `:377` ("A records a computed dependency on B"; decision 10 leaves one
  kind of dependency); `:199` (notify sync listeners, then schedule batched;
  decision 13 adds the queue and the bound).
- **The decision document says:** decision 1 names the architecture page
  (line 300), and decision 34 puts the documentation in each change's commit
  (line 2132). The plan's stage 4 asks for "updated docs" in each commit.
- **Kind:** missing.
- **Correction:** add rows "`ARCHITECTURE.md`, GET trap step 1 | the table
  per prototype | D12"; "`ARCHITECTURE.md`, DEFINE trap | a definition is a
  write; a child stays a child through a freeze | D2, D5"; "`ARCHITECTURE.md`,
  nested getters | one kind of dependency | D10"; "`ARCHITECTURE.md`, SET
  trap step 5 and batching | one delivery queue with a bound of 100 rounds |
  D13".

### 15. Section 10 forbids lowering a number, which for a budget or a cost limit is the tightening the bar allows

- **Where:** `review/spec.md:1754-1755`
- **It says:** "Never: Lower a number of `CONSTRAINTS.md`, or loosen a rule
  there, without a decision record."
- **`CONSTRAINTS.md` says:** "Tightening a rule needs nothing." Decision 4
  (line 553) tightens the cost limits at the end of stage 4 and sets each
  budget to its size plus 2%, and both can go down. What needs a record line
  is a budget or a limit that rises (decision 4, line 436).
- **Kind:** wrong.
- **Correction:** "Loosen a number of `CONSTRAINTS.md` (raise a budget or a
  cost limit, lower a coverage figure) or a rule there without a line in the
  decision record [D4]."

### 16. Sections 10 and 11 leave out what the plan's stage 4 requires of each commit and at the end

- **Where:** `review/spec.md:1738-1748` ("Always") and `:1763-1806` (section
  11)
- **The plan says** (`REVIEW_PLAN.md`, "Stage 4"): each commit has
  "updated docs and examples" and "the mutation run on touched files"; "If
  the approved decision moves a number in `CONSTRAINTS.md`, the same commit
  edits that file and names the decision"; a changed test of public
  behaviour has a commit message that names the decision; a rewritten test
  of internal state has a commit message that names the public-behaviour
  test that covers the same fact. After the last refactor commit: an
  independent review, a second library-comparison pass limited to the
  areas that changed, its findings decided, and the full validation matrix
  on the final commit (browsers, React versions with and without the
  compiler, Node versions, Vue, Svelte, Angular, Next.js, packed consumers).
- **Kind:** missing. "Always" leaves out examples, the mutation run and the
  commit-message rules. Section 11 ends at the refactor and does not list
  the closing steps; its item 8 is the pull-request suites only.
- **Correction:** add to "Always": "Examples are updated with the docs.
  `bun run test:mutation` runs on the touched target files. A changed test of
  public behaviour names its decision in the commit message; a rewritten
  test of internal state names the public test that covers the same fact. A
  moved number of `CONSTRAINTS.md` is edited in the same commit, naming the
  decision." Add to section 11: "19. After the last refactor commit, the
  independent review (it reads decision 1 and the `persist` rules first) and
  a second comparison pass on the changed areas are done, and their findings
  decided. 20. The full validation matrix passes on the final commit, and the
  stage report names that commit."

### 17. Section 8 is stale against the uncommitted edit of decisions 4, 13 and 20

- **Where:** `review/spec.md:1610-1613` (decision 13 condition), `:1635-1640`
  (item 4), `:1625-1627` (item 1), and no condition for decision 20.
- **It says:** decision 13: "stays inside the spread of today's"; item 4:
  the guard walks "from the merge base with `main`", its own file is in scope
  "for a rule that is removed or loosened"; item 1: "`budgets.json` gets a
  `ceiling` beside each budget".
- **The decision document now says** (working tree, not committed): decision
  13, "the spread of the commit before this change on both engines, the same
  baseline as decision 1", figures in the commit message; decision 4, the
  walk starts at the merge base or, while `main` lacks `CONSTRAINTS.md`, at
  the commit that added it; the guard fails on a merge commit and also judges
  the working tree; every change to `scripts/floor-guard.mjs`,
  `packages/classy-store/bunfig.toml` and
  `packages/classy-store/tests/mutation/runMutation.ts` needs a record line;
  a test made smaller needs a `Test-change: <path>: <reason>` line in the
  commit message; `budgets.json` holds `{"budget": …, "ceiling": …}` and the
  size rows of `CONSTRAINTS.md` stop repeating the numbers; decision 20, the
  guard in `indexOfMember` goes only if two new rows,
  `collection.has.primitive` and `collection.has.object`, stay inside the
  spread of the commit before on both engines.
- **Kind:** stale.
- **Correction:** once the edit is committed, rewrite the decision 13
  condition and items 1 and 4 from it, add the three guard rules (own file
  and the two bar files, merge commits and working tree, `Test-change:`
  lines) as items, and add a decision 20 condition with the two benchmark
  rows. Section 10 "Always" then names the `Test-change:` line (it replaces
  the commit-message wording proposed in finding 16).

## Unclear in the decision document

### U1. The baseline of a stage 4 commit

"The order for stage 4" says "each measured against the stage 1 baselines"
(line 2389), and so does the plan ("a comparison with the stage 1
baselines"). Decision 1 says "The baseline is the commit before, not the
figures of stage 1, which decision 12 has moved by then" (line 297), and
decision 4 says every commit is measured against the one before. The spec
took "the commit before" for every commit (line 1731). Reading A: commit
before, for every change (decision 1's reasoning applies to all of them once
decision 12 lands). Reading B: stage 1 baselines, with decision 1's exception
only. The task list's open point 11 raises the same question for decision 13
alone.

### U2. What `save()` and `rehydrate()` reject with on a handle that does not write

Decision 21 says such a handle's `save()` "reports as `'write'` and rejects
with the error", and "a `rehydrate()` that finds such a record again reports
and rejects" (line 1226). It does not say which error: the one `lastError`
holds (the record's `persist-record` report, or the application's own
error), or a new library error with a code. Section 7 has no row for it: the
`persist-record` row (spec line 1549) names only the `'parse'` report.
Reading A: the stored report again, so `persist-record` is also "the
rejection of `save()` and `rehydrate()`, reported as `'write'`". Reading B: a
code of its own. Open point 4 asks the neighbouring question for `save()`
before the first read only.

### U3. "The docs say so" for a sentence the docs do not have, and "the guide says" for one they already have

Decision 3 (line 377): a subscription on a removed container lasts while the
caller holds the store, the container or the unsubscribe function, "The docs
say so". No page says it today; the spec lists it as a new sentence (line
1691), which reads the present tense as a decision. Decision 41 (line 1903):
"The guide says that on the client `prepareStoreForHydration(store)` is
called before `persist(store)`". `REACT_SSR.md:12` and `:70` already say it;
the spec lists it as a change (line 1712). Either way the spec's rows are
harmless, but the `REACT_SSR.md` row is a check, not an edit, and the
decision 19 sentence for `PERSIST_TUTORIAL.md` (spec line 1697) is the one
that is actually new.

## Checked and agrees

- Section 5, rules 1 to 12, against "Guaranteed" (lines 2159-2228) and
  decisions 1, 8, 10, 13, 14, 21, 35: every clause of the decision's rules is
  in a statement, except 1.3 (finding 1) and 11.1 (finding 2). Statement 2.4
  ("also when its callback throws") is not in the decision's rule but is in
  today's reference (`API_REFERENCE.md:354`), so it is already promised.
- Section 6: all 11 unspecified items match the decision's list (lines
  2232-2260); the five cross-references to rows are right; every test file
  named exists, and every quoted test name is found in its file (the seven
  tests under `assigning __proto__ or calling Object.setPrototypeOf on a
  store`, four in `core.functionStores.test.ts`, two in
  `core.typedArrayStores.test.ts`). Rows 5 and 7 leave out the decision's
  "today's answer" sentences; that is a shortening, not an error.
- Section 7: today's texts `circular computed getter dependency`, `object is
  not a store proxy`, `circular reference detected in snapshot` and
  `Persistence handle has been disposed` (no prefix) are exact
  (`core/core.ts:180`, `:207`, `snapshot/snapshot.ts:247`,
  `utils/persist/persist.ts:145`); kinds, conditions and citations of
  `getter-cycle`, `getter-write`, `delivery-loop`, `batch-async`,
  `lost-write`, `snapshot-mutator`, `persist-option`, `persist-unread`,
  `persist-disposed` (save, clear, rehydrate), `restore-locked`,
  `readonly-ref` and `no-scope` agree with decisions 10, 13, 16, 21, 22, 30,
  36, 38, 39 and 45. The three "not library reports" agree with decisions 14
  and 21 and `utilityStatus.ts:45`.
- Section 8, size: all 36 numbers equal decision 4's table (lines 390-400);
  the budgets equal `budgets.json` and `CONSTRAINTS.md`.
- Section 8, cost ratios: all eight equal `limits.json` and `CONSTRAINTS.md`.
- Section 8, conditions: decisions 1 (10%, 1.6 times, commit before), 9, 13,
  29 and 36 (one cached snapshot per task of the 1,000-row store, below
  `snapshot.afterWrite`) agree.
- Section 8, "How a budget moves", items 1 to 9 agree with decision 4 (lines
  423-460) and decision 36; the two `CONSTRAINTS.md` sentences quoted in item
  9 exist in those words.
- Section 9: every quoted sentence exists in the named page in those words:
  `API_REFERENCE.md` ("backed by `shallowRef`", "arrow-function fields cannot
  be rebound", "A live getter that reads an absent field recomputes on
  subsequent reads", the `batch(async …)` paragraph, "their snapshots keep
  the class prototype", "Methods keep their signatures", "changed fields are
  replaced with mutable copies"); `TUTORIAL.md` (all seven sections and the
  four quoted sentences); `PERSIST_TUTORIAL.md` ("It does not delay writes",
  "Migration and hydration do not automatically rewrite storage",
  "Synchronous subscribers can also edit a different field during
  restoration"); `PERSIST_ARCHITECTURE.md` ("Invalid envelope … skipped
  silently"); `HISTORY_TUTORIAL.md` (the restoration-microtask sentence, split
  over lines 168-169); `REACTIVE_COLLECTIONS_TUTORIAL.md` (the `Object.is`
  sentence); `DEVTOOLS_TUTORIAL.md` (the `enabled` row, "Disable in
  production", the `STORE_UPDATE` examples); `SVELTE.md` (`const state`);
  `CONTRIBUTING.md` exists. The "what 1.0 does not catch" list equals
  decision 36's eight items. The decisions cited per row agree, apart from
  findings 5 to 7.
- Section 10, against "The order for stage 4" and the plan: commands, test
  first, one change per commit, the order by reference, no spike patch, dead
  code (D20), docs (D34), the "Never" list (merge, release, spike code,
  ceilings) and "decide again" agree, apart from findings 15 and 16 and U1.
- Section 11, items 1 to 18: agree with decisions 4, 32, 33, 35, 36 and 37
  and with `CONSTRAINTS.md`; the three workflows without permissions are
  `ci.yml`, `react-compatibility.yml` and `react-next.yml`, as item 16
  implies; no Dependabot configuration exists today.

# Check of the decision records against the decision document

Checked at commit 7a1dec5. The 46 records `docs/decisions/0001-*.md` to
`0046-*.md` and `docs/decisions/README.md` were read in full against
decisions 1 to 46, the index table, "What 1.0 guarantees", "Proposed in a
report and not taken" and the order for stage 4 of
`review/stage-3-decisions.md`. Every number in every record was searched
for in the decision document. 19 findings.

The decision document is the version committed at 7a1dec5. Its working copy
was edited while this check ran (114 lines added, 19 removed); line numbers
here are those of the committed version. See U4 for what the edit adds that
the records do not carry.

`<repo>` is the repository root. Notes and the number-search script are in
`<scratch>/check-records/`.

## Findings

### 1. No record carries its label

- **Where:** every record, `docs/decisions/0001-*.md` to `0046-*.md`, lines
  3 to 6 (the field list), and `docs/decisions/README.md:18-19` ("Sections
  of a record").
- **It says:** the field list is Status, Date, Kind and "Changes behaviour
  that 0.11 documents". The words "Before 1.0" or "Can follow 1.0" appear in
  none of records 0002 to 0016 or 0019 to 0046. The label is only in the
  README table.
- **The decision document says:** every entry has a **Label** paragraph
  (for example "**Label.** Can follow 1.0: no documented behaviour
  changes", decision 3, line 368), and the index table has a "Label" column
  (lines 41-88).
- **Kind:** missing
- **Correction:** add `- **Label:** <label>` after the **Kind** line of each
  record, with the text of the README's Label column, which already matches
  the index table except for 0034 (finding 19). Where an entry's own
  **Label** paragraph gives a reason, add it after a colon, for example
  0003: `- **Label:** Can follow 1.0: no documented behaviour changes.`,
  0011: `- **Label:** Before 1.0 for the default of nested instances, which
  needs no code; the base class is an addition.`, 0039: `- **Label:** Can
  follow 1.0 for the fix; the option is an addition.` In the README, change
  line 18 to "A list of fields: **Status**, **Date**, **Kind**, **Label**,
  and whether the decision changes behaviour that 0.11 documents."

### 2. The README table's titles differ from the records' titles in 29 rows

- **Where:** `docs/decisions/README.md:66-111`, rows 0001, 0002, 0004, 0005,
  0006, 0007, 0010, 0011, 0014, 0016, 0018, 0019, 0021, 0022, 0024, 0027,
  0029, 0031, 0033, 0034, 0035, 0036, 0037, 0038, 0039, 0041, 0042, 0043,
  0045.
- **It says:** for example row 0001 "A function in a field is a method when
  it is read through the store", where the record's first line is "A
  function in a field is a method when it is read through the store, and the
  object is never changed"; row 0039 "Angular: `untracked()`, an injector
  option, its own context error", where the record is "Angular: a store
  write inside a `computed` is not lost, and `injectClassyStore` takes an
  injector".
- **The decision document says:** the brief for the records asks for a
  table with the title of each record; the README itself says (line 13)
  "The first line of a record is `# NNNN. Title`". The README took the short
  form of the index table instead.
- **Kind:** wrong
- **Correction:** in each of the 29 rows, replace the link text with the
  text of the record's first line after `# NNNN. `. The other 17 rows
  already match.

### 3. "Final for 1.0" is missing for three alternatives

- **Where:** `0001-…:80` (Strict), `:86` (Born with), `:95` (Every
  function with a `prototype` of its own), `:102` (Lenient);
  `0002-…:46`, `:53` and the `setPrototypeOf` sub-heading after it;
  `0011-…:53` (Wrap nested class instances by default).
- **It says:** none of these sections says "final".
- **The decision document says:** "Four other rules for a function held in
  a field (M1) … **(final)**" (line 2287); "Refusing accessor and read-only
  definitions, `setPrototypeOf`, or `Object.freeze(store)` (M2, M8).
  **(final)**" (line 2296); "Wrapping nested class instances by default
  (M11). **(final)**" (line 2303).
- **Kind:** missing
- **Correction:** end each of the four sections of 0001, each of the three
  sections of 0002 and the section of 0011 with "Not taken, and final for
  1.0."

### 4. A heading of record 0004 names a stage of the review

- **Where:** `docs/decisions/0004-size-ceilings-for-every-entry.md:198`
- **It says:** "## Measured in stage 4"
- **The decision document says:** a kept record must not name a stage of
  the review (the prompt of this check). The writers' brief asked for this
  heading by name, so the two briefs disagree; the rule for kept files wins.
- **Kind:** extra
- **Correction:** `## Measured during the 1.0 work`. The README (line 36-37)
  says "the table of sizes in record 0004" and needs no change.

### 5. Record 0019 says it changes no documented behaviour

- **Where:** `docs/decisions/0019-persist-restores-before-it-returns-on-synchronous-storage.md:6`
- **It says:** "**Changes behaviour that 0.11 documents:** no"
- **The decision document says:** "A store on `localStorage` renders its
  defaults first today" (decision 19, line 1145). The persist tutorial
  documents that timing: "Hydration is asynchronous even with
  `localStorage`: read results are applied after an `await`, not before
  `persist()` returns" (`website/content/docs/PERSIST_TUTORIAL.md:560`).
- **Kind:** wrong
- **Correction:** "**Changes behaviour that 0.11 documents:** yes", and add
  to Consequences: "- The persist tutorial says that hydration is
  asynchronous even with `localStorage`. That sentence changes."

### 6. Record 0027 gives the `./utils` bytes of the hook form wrongly, and a byte count the decision document does not carry

- **Where:** `docs/decisions/0027-devtools-named-entries-exact-time-travel-off-in-production.md:92-94`
  and `:67`
- **It says:** "the hook form measured 452 with them, and 57 bytes of that
  are the naming moved out of the core"; and of the slot form, "costs 40
  bytes on the main entry".
- **The decision document says:** "403 bytes on `./utils`" for P7 and "452
  on `./utils` with P7" for the hook form (decision 27, lines 1494-1497), so
  the hook form adds 49 there, not 57. The +57 is a separate row of the
  `./utils` table, "The naming moved out of the core into `devtools.ts`"
  (decision 4, line 509). The decision document gives no byte figure for
  the slot form; 40 is in a report only.
- **Kind:** wrong (57), extra (40)
- **Correction:** line 92-94: "- Size on `./utils`: 403 bytes for the
  entries, the messages and the jump, and 452 with the hook form. Record
  0004 counts the naming moved out of the core as +57 on `./utils`. The
  getter values add 95." Line 67: "It keeps a counter and the naming in the
  core. The hook form keeps the core to one empty place and costs 12 bytes
  on the main entry."

### 7. Record 0042 says the membership rule is required before the index

- **Where:** `docs/decisions/0042-collections-one-membership-rule-and-a-snapshot-index.md:69`
- **It says:** "The index can follow 1.0; the membership rule is required
  before it."
- **The decision document says:** "The membership rule: before 1.0, because
  the collections guide documents today's `-0`. The index: can follow 1.0."
  (decision 42, line 1959)
- **Kind:** wrong (it reads as an order between the two changes)
- **Correction:** "- The membership rule is required before 1.0, because
  the collections guide documents the behaviour of 0.11 for `-0`. The index
  can follow 1.0."

### 8. Record 0046 has timings the decision document does not carry

- **Where:** `docs/decisions/0046-a-snapshot-after-one-row-changes-still-rebuilds-the-list.md:12-14`
- **It says:** "writing one of 1,000 rows and taking a snapshot took about
  70 microseconds on Node and 150 on Bun on a busy machine, against well
  under a microsecond for a cached snapshot."
- **The decision document says:** decision 46 (lines 1798-1813) gives only
  "three times faster" on Node and "about 80 microseconds" for freezing the
  array on Bun. 150 is nowhere in the document; 70 occurs only as "finding
  70".
- **Kind:** extra
- **Correction:** "The cost grows with the number of rows. On Bun, freezing
  a new 1,000-element array costs about 80 microseconds by itself."

### 9. Record 0033 has a version and a count the decision document does not carry

- **Where:** `docs/decisions/0033-dependencies-exact-pin-and-an-audit-step.md:10-13`
- **It says:** "`proxy-compare` 3.0.1 … It has one maintainer … `bun audit`
  reported 17 advisories in development dependencies, none of which reaches
  the published tarball."
- **The decision document says:** decision 33 (lines 2122-2128) has neither
  figure. `3.0.1` matches `packages/classy-store/package.json:144`; 17
  advisories is in no part of the decision document.
- **Kind:** extra
- **Correction:** "`proxy-compare` is the library's one runtime dependency,
  and it is pinned to an exact version. `bun audit` reports advisories in
  development dependencies; the published tarball is accepted as it is." If
  the version is kept, say it is the one in `package.json` today.

### 10. Record 0017 has call counts the decision document does not carry

- **Where:** `docs/decisions/0017-subscribe-stays-batched-by-default.md:35-37`
- **It says:** "the batched default gives 1 call per turn in every case
  measured. A synchronous default gives 2 for two direct writes and for
  `Object.assign`, and 4 around an `await`."
- **The decision document says:** "`spike-delivery.md`, D5, with the counts
  per case." (decision 17, line 1127). The counts are only in that report,
  and its own table gives 3, not 4, for the `async` case, so the figure is
  not settled even there.
- **Kind:** extra
- **Correction:** "- Counted on a prototype: the batched default gives one
  call per turn in every case measured; a synchronous default gives more
  for two direct writes, for `Object.assign` and around an `await`."

### 11. Record 0010's "Not built" covers more than the entry says

- **Where:** `docs/decisions/0010-getters-one-kind-of-dependency-and-no-writes.md:112`
- **It says:** "Not built: these changes on top of record 0001 and of record
  0043."
- **The decision document says:** "Not built: these rows on top of decision
  1, and on top of decision 43." after the paragraph on the throw around
  `this` (decision 10, line 825); the getter combination itself was built on
  0.11.
- **Kind:** wrong
- **Correction:** "- Not built: the throw around `this` on top of record
  0001 and on top of record 0043."

### 12. Records 0018 and 0036 make the planned warnings a possibility

- **Where:** `docs/decisions/0018-writes-outside-a-method-stay-allowed.md:19-20`,
  `docs/decisions/0036-one-build-and-one-development-only-check.md:54`
- **It says:** "may follow in a 1.x release"; "Other warnings may follow in
  a 1.x release."
- **The decision document says:** "A warning when a synchronous subscriber
  is called many times in one task follows in 1.x (decision 36)." (decision
  18, line 1133); "Other warnings follow in a 1.x release." (decision 36,
  line 2003)
- **Kind:** wrong
- **Correction:** 0018: "… in one task follows in a 1.x release (record
  0036)." 0036: "- Other warnings follow in a 1.x release."

### 13. Record 0009 adds a mechanism to its Decision

- **Where:** `docs/decisions/0009-a-plain-object-from-another-realm-is-state.md:21-22`
- **It says:** "A prototype whose constructor is another realm's `Object` is
  accepted."
- **The decision document says:** decision 9 (lines 708-711) says what is
  state and that the form without the cache is tried first. The test by the
  `constructor` is the prototype's way, and the decision document says the
  work "applies no spike patch" (line 2391).
- **Kind:** extra
- **Correction:** delete the sentence.

### 14. Record 0007 lists an alternative the decision does not name

- **Where:** `docs/decisions/0007-has-and-ownkeys-traps-and-a-missing-property-is-a-value.md:48-51`
- **It says:** "### Leave the getters stale" with a reason.
- **The decision document says:** decision 7 (lines 657-693) names only the
  trap for own-property checks as not taken.
- **Kind:** extra
- **Correction:** delete the section.

### 15. Record 0019 states a limit the decision document does not

- **Where:** `docs/decisions/0019-persist-restores-before-it-returns-on-synchronous-storage.md:48-49`
- **It says:** "Nothing can detect a `persist()` call made inside a
  constructor; the guide forbids it."
- **The decision document says:** "Stage 4 pins what happens with a test, so
  that the sentence stays true." (decision 19, line 1161). It says nothing
  about detection.
- **Kind:** extra
- **Correction:** "- A test pins what a `persist()` call inside a
  constructor of a `ClassyStore` subclass does; the guide forbids the
  call."

### 16. Record 0032 has its "not tried" note in Context

- **Where:** `docs/decisions/0032-workflows-hardened-now-release-job-split-after-1-0.md:14-15`
- **It says:** "That code in the job can take the token comes from how
  GitHub and npm document the mechanism; nobody tried it." (in Context)
- **The decision document says:** the same sentence, as evidence (decision
  32, line 2118). The brief puts what stays unverified under Consequences.
- **Kind:** missing (in Consequences)
- **Correction:** move the sentence to the end of Consequences as "- Not
  tried: that code in the job can take the token. It comes from how GitHub
  and npm document the mechanism."

### 17. Record 0004 shortens what the rule for functions buys

- **Where:** `docs/decisions/0004-size-ceilings-for-every-entry.md:183`
- **It says:** "228 bytes (0001): one rule for every function a store
  holds."
- **The decision document says:** "228 bytes (decision 1): one rule for every
  function a store holds, a method in an object literal that stays a
  transaction, and arrow-function methods that work." (line 536). The other
  seven items keep their whole text.
- **Kind:** missing
- **Correction:** "228 bytes (0001): one rule for every function a store
  holds, a method in an object literal that stays a transaction, and
  arrow-function methods that work."

### 18. Record 0030 leaves out the rows that become its tests

- **Where:** `docs/decisions/0030-undo-and-time-travel-change-a-nested-object-in-place.md:86-97`
- **It says:** six stores with a cycle, four cases of a moved or shared
  object, seven kinds of locked container; it does not say which rows the
  commit turns into tests.
- **The decision document says:** "Its tests are the six rows of K1 for
  undo, redo and a jump, the four rows of the addendum and the ten rows of
  G3." (decision 30, lines 1634-1636)
- **Kind:** missing
- **Correction:** add "- Its tests are the six rows of a store with a cycle
  (undo, redo and a jump), the four rows of an object that moved or is
  shared, and ten rows of a container that would refuse the restore."

### 19. The README gives record 0034 a label the index does not

- **Where:** `docs/decisions/README.md:101`
- **It says:** "With each change"
- **The decision document says:** "With each" (index table, line 79)
- **Kind:** wrong (small)
- **Correction:** "With each", or keep "With each change" and use the same
  words in the record's new **Label** line (finding 1); the index is terse
  and the longer form says the same.

## Unclear in the decision document

### U1. Six entries have no **Label** paragraph, and two have a split one

Decisions 17, 18, 33, 34, 40 and 41 have no **Label** paragraph; only the
index table gives "No change" (17, 18, 40, 41), "Can follow 1.0" (33) and
"With each" (34). Decision 11's paragraph says "The default for nested
instances: before 1.0, and no code. The base class: an addition." and
decision 39's says "The fix: can follow 1.0. The option: an addition.",
where the index gives one label each ("Before 1.0", "Can follow 1.0"). The
README follows the index in every row. Finding 1 proposes the split form for
11 and 39; the orchestrating agent decides which form the records carry.

### U2. Five warnings not taken, or four of five

Decision 36 says "Shipping the five warnings the development-build report
spiked" is not taken (line 2070). "Proposed in a report and not taken" says
"four of the five warnings the development-build report spiked (M72, M73)"
(line 2353). Record 0036 (line 79) took "Four of the five are not taken in
1.0", which reads as if one of the five ships, while decision 36 ships one
check from another report (the lost write of `spike-classes.md`, C4 (b)).

### U3. 57 or 49 bytes for the naming in `./utils`

Decision 4's `./utils` table gives +57 for "The naming moved out of the core
into `devtools.ts`" (line 509); decision 27 gives 403 for P7 and 452 for the
hook form with P7 (lines 1494-1497), a difference of 49. The report reaches
57 as 49 plus 8 bytes moved off the main entry. Record 0004 copies +57
correctly; finding 6 only removes the claim that 57 is part of the 452.

### U4. The working copy of the decision document has moved past the records

While this check ran, `review/stage-3-decisions.md` was edited and not
committed. The records follow the committed text. Among the additions that
a record would have to carry once they stand: decision 4's new guard rules
(its start commit, a linear branch, the working tree, its own file and two
more files as bar files, the `Test-change:` line, the numbers kept in
`budgets.json` only), for record 0004; the committed compilations of
decision 11, for 0011; the baseline of the commit before for
`store.write.sync`, for 0013; the `'AsyncFunction'` test and the type that
is not exported, for 0016; a "Why" for decision 18, for 0018; the benchmark
rows before the guard in `indexOfMember` goes, the two assertions of
`snapshotTargetCache.test.ts`, and the timing of `activeTracker()` alone
(45.3 to 82.6 nanoseconds on Node, 31.9 to 59.2 on Bun), for 0020; what a
`persist` report carries and its codes, for 0021; the `restore-locked` jump
and the five extension options, for 0027; `ReactiveMapSnapshot` and
`ReactiveSetSnapshot`, for 0045; `vue-readonly` and the server test, for
0038; `angular-no-context` and the unexported options type, for 0039; the
`active` flags in the adapter step, for 0042. This check did not compare the
records with the edited text.

## Checked and agrees

- Forbidden names: all 47 files were searched for `review/`, "finding N",
  `M` ids, objection ids (`C2`, `W17`, `2C5`, `3-1`, "objection"), every
  report and spike name of the decision document, patch names (`x2`, `r5`,
  `k2-…`), "stage", "round", "draft", "reviewer", "agent", "the plan".
  The one hit is finding 4. "first draft"-style history is told as "an
  earlier form" throughout.
- Kind: all 46 records match the index table and the README, case aside.
- Labels in the README: all 46 match the index table except finding 19.
- Numbers: every figure of every record was found in the decision document
  except those in findings 6, 8, 9 and 10; each was then read in its own
  sentence.
- "Final for 1.0": carried in 0013 (two), 0014, 0017, 0021 (three, and "not
  final" for an `async` `migrate`), 0024, 0027, 0040, 0041, 0044 and 0045.
- Every item of "Proposed in a report and not taken" is present in its
  record (0001, 0002, 0003, 0006, 0009, 0010, 0011, 0012, 0013, 0014, 0016,
  0017, 0018, 0021, 0024, 0025, 0026, 0027, 0031, 0032, 0036, 0040, 0041,
  0042, 0043, 0044, 0045, 0046), apart from the "final" marks of finding 3.
- 0001: rule, exceptions, write-back rules, short path, landing condition,
  costs, unspecified throw, not-run list.
- 0002, 0003 (with the order "first among the core changes"), 0005, 0006,
  0008, 0012, 0013, 0014, 0015, 0016, 0020, 0021 (table copied exactly),
  0022, 0023, 0024, 0025, 0026, 0028, 0029, 0031, 0034 (every item of the
  two documentation lists), 0035, 0037, 0038, 0039, 0040, 0041, 0043, 0044,
  0045: Decision, Alternatives and Consequences agree with their entries.
- 0004: both ceiling tables, the rule for a ceiling and its allowances, both
  change-by-change tables and their notes, the enforcement rules, the cost
  limits, the delegation sentence, the list of what was cut with its
  records.
- 0010, 0011, 0027, 0030, 0036, 0042: agree apart from the findings above.
- Changes behaviour that 0.11 documents: checked against the label
  paragraphs and, for 0019, 0016 and 0029, against the pages under
  `website/content/docs/`; only finding 5 disagrees.
- README: naming, life of a record, the rule of `CONSTRAINTS.md`, kinds and
  labels agree with the brief and decision 4.

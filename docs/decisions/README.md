# Decision records

This folder holds the decision records of `@codebelt/classy-store`. A record
says what was decided, why, what else was weighed, and what it costs. It
stands on its own: it describes a defect in words, with a short example, and
carries the numbers that were measured for it.

## Naming and numbering

- A record is named `NNNN-short-title.md`: four digits, then the title in
  lower case with hyphens.
- Numbers are given in order and never reused. Records `0001` to `0046` are
  the decisions for 1.0.
- The first line of a record is `# NNNN. Title`, and the title is a
  statement of the decision.

## Sections of a record

- A list of fields: **Status**, **Date**, **Kind**, and whether the decision
  changes behaviour that 0.11 documents.
- **Context:** what the library did, and why that was a problem.
- **Decision:** what the library does now, exact enough to check the code
  against it.
- **Alternatives considered:** each form that was weighed and not taken, and
  why. "Final for 1.0" marks a choice that cannot be taken later without
  breaking a consumer.
- **Consequences:** what changes for a user, what it costs, what stays
  unverified, and what would make the decision worth opening again.

A decision whose answer is "no change" has a record too, so that the
question is not opened again without a new reason.

## The life of a record

- **Accepted:** the decision holds. An accepted record is not rewritten.
  A measured figure may be added in a section that exists for it, such as
  the table of sizes in record 0004.
- **Superseded by NNNN:** a later record replaces it. The old record stays,
  with its status changed and a link to the new one, and the new record names
  the one it replaces.

## Records and `CONSTRAINTS.md`

A rule of `CONSTRAINTS.md` is loosened or removed, and a number there moves,
only together with a decision record under `docs/decisions/`. `bun run
check:floor` blocks the change otherwise. Tightening a rule needs nothing.

Record 0004 is the record for every size budget. A commit that grows an
entry adds a line with the measured size to that record. A ceiling changes
only in a commit of its own, with the new number and the reason in that
record. A cost limit that would have to rise needs a line in that record
too.

## Kinds and labels

- **Kind:** bug, simplification, public API, diagnostics, performance,
  repository (the workflows and dependencies), constraint (the numbers of
  `CONSTRAINTS.md`), or docs.
- **Label:** **Before 1.0** means the change alters the public API or
  documented behaviour, so after 1.0 it would be a breaking change. **Can
  follow 1.0** means it could ship in a 1.x release without breaking a
  consumer. **No change** means the decision keeps what 0.11 does.

## All records

| No.  | Title                                                                                                                                                 | Kind                    | Label                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| 0001 | [A function in a field is a method when it is read through the store](0001-a-function-read-through-the-store-is-a-method.md)                          | public API, bug         | Before 1.0                                     |
| 0002 | [`Object.defineProperty` through a store is a write](0002-define-property-through-a-store-is-a-write.md)                                              | bug                     | Before 1.0                                     |
| 0003 | [Suspension stays; the walk to a detached parent goes](0003-suspension-stays-and-the-walk-to-a-detached-parent-goes.md)                               | bug, simplification     | Can follow 1.0                                 |
| 0004 | [The size budgets move once, to a ceiling](0004-size-ceilings-for-every-entry.md)                                                                     | constraint              | Before 1.0                                     |
| 0005 | [A write stores raw values, one node per raw object](0005-raw-values-on-write-and-one-node-per-raw-object.md)                                         | bug                     | Before 1.0                                     |
| 0006 | [`includes`, `indexOf`, `lastIndexOf` find the object the caller holds](0006-array-searches-find-the-object-the-caller-holds.md)                      | bug                     | Before 1.0                                     |
| 0007 | [`has` and `ownKeys` traps; a missing property is a value](0007-has-and-ownkeys-traps-and-a-missing-property-is-a-value.md)                           | bug                     | Before 1.0                                     |
| 0008 | [A delete that removes nothing is not a change](0008-a-delete-that-removes-nothing-is-not-a-change.md)                                                | bug                     | Before 1.0                                     |
| 0009 | [A plain object from another realm is state](0009-a-plain-object-from-another-realm-is-state.md)                                                      | bug                     | Before 1.0                                     |
| 0010 | [Getters: one kind of dependency, and no writes to their own object](0010-getters-one-kind-of-dependency-and-no-writes.md)                            | bug, simplification     | Before 1.0                                     |
| 0011 | [Nested instances stay opt-in; the base class `ClassyStore`](0011-nested-instances-stay-opt-in-and-a-classystore-base-class.md)                       | public API              | Before 1.0                                     |
| 0012 | [A table per prototype answers "is this key a getter?"](0012-a-table-per-prototype-answers-is-this-key-a-getter.md)                                   | performance             | Can follow 1.0                                 |
| 0013 | [One delivery queue, with a bound](0013-one-delivery-queue-with-a-bound.md)                                                                           | bug                     | Before 1.0                                     |
| 0014 | [A subscriber's error is caught and logged, a rejection too](0014-a-subscriber-error-is-caught-and-logged.md)                                         | public API, bug         | Before 1.0                                     |
| 0015 | [A setter is a transaction](0015-a-setter-is-a-transaction.md)                                                                                        | bug                     | Before 1.0                                     |
| 0016 | [`batch()` refuses a promise by its type and an `async` function when it runs](0016-batch-refuses-a-promise-and-an-async-function.md)                 | public API              | Before 1.0                                     |
| 0017 | [`subscribe()` stays batched by default](0017-subscribe-stays-batched-by-default.md)                                                                  | public API              | No change                                      |
| 0018 | [Writes outside a method stay allowed](0018-writes-outside-a-method-stay-allowed.md)                                                                  | public API              | No change                                      |
| 0019 | [`persist()` restores before it returns on a synchronous storage](0019-persist-restores-before-it-returns-on-synchronous-storage.md)                  | public API              | Before 1.0                                     |
| 0020 | [Dead and redundant code goes, in the commit that makes it dead](0020-dead-code-goes-in-the-commit-that-makes-it-dead.md)                             | simplification          | Can follow 1.0                                 |
| 0021 | [Nothing `persist` cannot use is skipped in silence](0021-persist-skips-nothing-in-silence-and-overwrites-nothing-it-could-not-restore.md)            | bug, diagnostics        | Before 1.0                                     |
| 0022 | [`persist()` validates its options](0022-persist-validates-its-options.md)                                                                            | bug                     | Before 1.0                                     |
| 0023 | [A restore is all or nothing](0023-a-restore-is-all-or-nothing.md)                                                                                    | bug                     | Before 1.0                                     |
| 0024 | [A pending save is flushed; only an expiry stamp is written back at load](0024-a-pending-save-is-flushed-and-only-an-expiry-stamp-is-written-back.md) | bug                     | Before 1.0                                     |
| 0025 | [Cross-tab sync ignores an event from another storage area](0025-cross-tab-sync-ignores-another-storage-area.md)                                      | bug                     | Can follow 1.0                                 |
| 0026 | [`persist` options stay as they are](0026-persist-options-stay-as-they-are.md)                                                                        | public API              | No change                                      |
| 0027 | [`devtools`: named entries, exact time travel, off in production](0027-devtools-named-entries-exact-time-travel-off-in-production.md)                 | public API, bug         | Before 1.0                                     |
| 0028 | [An edit made in the same tick as `undo()` is recorded](0028-an-edit-in-the-same-tick-as-undo-is-recorded.md)                                         | bug                     | Before 1.0                                     |
| 0029 | [`withHistory` restores a function held in an own field](0029-with-history-restores-a-function-field-by-reference.md)                                 | public API              | Before 1.0                                     |
| 0030 | [Undo and time travel change a nested object in place](0030-undo-and-time-travel-change-a-nested-object-in-place.md)                                  | bug, performance        | Before 1.0                                     |
| 0031 | [`subscribeKey` without a snapshot of the whole store](0031-subscribe-key-without-a-snapshot-of-the-whole-store.md)                                   | performance             | Can follow 1.0                                 |
| 0032 | [The workflows are hardened now; the release job is split after 1.0](0032-workflows-hardened-now-release-job-split-after-1-0.md)                      | repository              | Can follow 1.0                                 |
| 0033 | [Dependencies: an exact pin, an audit step](0033-dependencies-exact-pin-and-an-audit-step.md)                                                         | repository              | Can follow 1.0                                 |
| 0034 | [Documentation goes with the change it describes](0034-documentation.md)                                                                              | docs                    | With each change                               |
| 0035 | [Every error carries a stable code](0035-every-error-carries-a-stable-code.md)                                                                        | diagnostics             | Before 1.0                                     |
| 0036 | [One build, and one development-only check](0036-one-build-and-one-development-only-check.md)                                                         | diagnostics             | Before 1.0 for the guard; the check can follow |
| 0037 | [Vue, Angular and Solid build the snapshot when it is read](0037-vue-angular-and-solid-build-the-snapshot-when-it-is-read.md)                         | performance             | Before 1.0 for Vue; the others can follow      |
| 0038 | [Vue: no listener left by a server render; a read-only ref](0038-vue-no-listener-left-by-a-server-render-and-a-read-only-ref.md)                      | bug, public API         | Before 1.0                                     |
| 0039 | [Angular: `untracked()`, an injector option, its own context error](0039-angular-untracked-an-injector-option-and-its-own-context-error.md)           | bug, public API         | Can follow 1.0                                 |
| 0040 | [The adapter names stay](0040-the-adapter-names-stay.md)                                                                                              | public API              | No change                                      |
| 0041 | [`prepareStoreForHydration` stays explicit; `isEqual` stays](0041-prepare-store-for-hydration-stays-explicit.md)                                      | public API              | No change                                      |
| 0042 | [Collections: one membership rule, a snapshot index](0042-collections-one-membership-rule-and-a-snapshot-index.md)                                    | bug, performance        | Before 1.0 for the rule; the index can follow  |
| 0043 | [Class getters on one derived prototype per class](0043-class-getters-on-one-derived-prototype-per-class.md)                                          | public API, performance | Before 1.0                                     |
| 0044 | [A snapshot keeps a cycle](0044-a-snapshot-keeps-a-cycle.md)                                                                                          | bug, public API         | Before 1.0                                     |
| 0045 | [Snapshot types: tuples, collection snapshots without mutators](0045-snapshot-types-tuples-and-collections-without-mutators.md)                       | public API              | Before 1.0                                     |
| 0046 | [A snapshot after one row changes still rebuilds the list](0046-a-snapshot-after-one-row-changes-still-rebuilds-the-list.md)                          | performance             | Can follow 1.0                                 |

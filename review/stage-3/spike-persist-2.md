# Stage 3 spike: the `persist` rules as decided, built once

Helper report for the stage 3 decision document, 2026-11-25. Brief:
`review/stage-3/briefs/spike-persist-2.md`. Built on `combo.patch` of
`persist-devtools.md` (P1 to P8) in a throwaway worktree at `57404c3`
(`<scratch>/stage-3-spike-persist-2/wt`). Nothing in the repository was
changed except this file. Every patch and script is in the appendix.

## Summary

The nine rules can all be built, and they fit in one function's worth of
state: two flags (`hasRead`, `blocked`) and one marker set during a read
(`keepRecord`). Built on `combo.patch`, the change is 98 lines added and 36
removed in `persist.ts` and `persist.types.ts`. It adds 237 bytes to `./utils`:
3,633 against `combo.patch`'s 3,396 and today's 2,686.

Three things the decider should know first:

1. **One loss is in no rule: a first read that throws.** With a storage whose
   `getItem` fails once, the handle reports `'read'`, counts the read as done,
   and the next edit replaces the record nobody read (path 13). It happens
   today, with `combo.patch` and with the rules. The fix is to treat a failed
   read as no read. It costs 8 bytes and fails no test. Guarantee rule 10 is
   false without it.
2. **Rule 3 needs two choices the text does not make.** "An edit made before
   that stays in the store" is false under today's restore, which writes the
   record over an edit made before `rehydrate()`. The spike restores the first
   read over the state at `persist()`, so the edit wins, as for an edit during
   an asynchronous read. Three tests pin the old answer. And the text makes
   `save()` reject only with `skipHydration`. An explicit `save()` during an
   asynchronous first read still replaces a record it has not read, so the
   spike makes it reject there too. Two tests pin the old answer.
3. **Rule 3 changes 26 tests, and 24 of them only use `skipHydration` as
   setup.** They save before any read in order to test write ordering. With
   rule 3 left out, all 26 pass. Stage 4 rewrites them to `await
   rehydrate()` first. The guide's sentence "It does not delay writes" is
   reversed.

Every other rule holds as written. Three smaller corrections are under
"Recommendation for each rule": the `expiresAt` write-back with an `expireIn`
of `Infinity` rewrites the record on every load; an edit made while the handle
does not write is lost when a `rehydrate()` restores; and a record too deep to
restore stops a handle from saving for good.

## Does it hold together?

Yes, with the resolutions below. No two rules contradict each other outright.
Where a rule meets today's documented behaviour, or leaves a case open, this
is how the spike resolved it.

| Where                                                   | The conflict                                                                                                                                                                                                | What the spike did, the smallest change                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule 3, `skipHydration`, "an edit … stays in the store" | Today a read restores over the state when `rehydrate()` is called, so an edit made before then is overwritten. `persist.test.ts` "rehydrate cancels a pending debounced write so loaded state wins" pins it | The first read under `skipHydration` restores over the state at `persist()`. An edited field keeps the edit; other fields are restored. Rule 3 should say so        |
| Rule 3, `save()` during an asynchronous first read      | The text makes `save()` reject only under `skipHydration`. Today `save()` supersedes the read in flight and writes over a record it never saw, newer or unmigrated (path 9)                                 | `save()` rejects until the first read has settled, whatever the storage                                                                                             |
| Rule 1, no row for a failed read                        | A `getItem` that throws on the first read is reported as `'read'`; the handle then writes over the record it did not read (path 13). Rule 10 says this cannot happen                                        | Not in the build. A variant where a failed read leaves the handle "not read" costs 8 bytes and fails no test (`read-failure-blocks.patch`)                          |
| Rule 7 with rule 1, `expiresAt: null`                   | A handle with `expireIn: Infinity` reads its own record (`expiresAt` `null`), writes it back with `null` again, and does so on every load (path 10c)                                                        | Built as written. Change: write back only when `expireIn` is finite                                                                                                 |
| Rule 1, second kind, and decision 21                    | Decision 21 reports a lower version with no `migrate`; the brief says it is not reported                                                                                                                    | Built as the brief says. The test `persist.hydration.test.ts` "stored data from another version is ignored when there is no migrate", which P2 failed, passes again |
| Rule 2 with rule 1, fourth kind, a record too deep      | A record nested beyond the engine's limit cannot be restored by any release. It is rolled back, so the handle stops writing for good, and the report comes back on every load (path 14)                     | Built as written. The guide has to say: call `clear()` from `onError`                                                                                               |
| Rule 2, unblocked by a `rehydrate()` that restores      | Edits made while the handle did not write are restored over and lost, while rule 3 keeps edits made before the first read (path 12b)                                                                        | Built as written; the guide has to say it. Keeping those edits would mix them with a record they were never shown against                                           |

## What was built

On top of `combo.patch`: `persist.ts` 88 lines added and 35 removed,
`persist.types.ts` 10 added and 1 removed (`spike-on-combo.patch`). Against
`57404c3`, with `combo.patch`: `persist.ts` 224 and 97 (`spike-full.patch` is
in the scratch folder; it is `combo.patch` followed by `spike-on-combo.patch`,
checked by applying both to a clean tree).

- **The kinds.** `applyPersistedState()` sets `keepRecord` once the envelope,
  `expiresAt` and version are usable. A throw before that point (not JSON, not
  an envelope, a bad version, a bad `expiresAt`) is nothing to keep. A throw
  after it (a newer version, `migrate`, `deserialize`, `merge`, a copy that is
  too deep, the rollback of P4) keeps the record. A lower version with no
  `migrate` returns without restoring and without a report.
- **A handle that does not write.** `blocked` holds the error, boxed so that
  any thrown value counts. It is set before the report, so a `clear()` called
  from `onError` unblocks. `autoSave()`, which serves edits and the `pagehide`
  flush, returns without a write or a report. `save()` reports the error as
  `'write'` and rejects with it. `clear()`, a read that restores, finds none or
  finds nothing to keep, and a storage event of such a record set it back to
  `null`.
- **A handle writes only after it has read.** `hasRead` is set when a read or a
  storage event settles, and by `clear()`. Before it, an edit sets
  `saveAfterRead`, the same flag an edit during a read uses, and `save()`
  rejects. Under `skipHydration` the state at `persist()` is kept as the first
  read's baseline.
- **Versions.** One `isVersion()`: `Number.isFinite(v) && v >= 0`, for the
  option and the record. A missing `version` is 0; `null` is not.
- **Checked at `persist()`.** A bad `version`, and a `migrate` whose
  `Symbol.toStringTag` is `'AsyncFunction'`. The check names that tag exactly:
  Bun's `mock()` functions carry the tag `'Mock'`, and a looser check refused
  them (two tests failed in a first form).
- **`onError`.** It receives the handle as its third argument. The kick-off of
  the first read moved below the handle's construction, so the handle exists
  when a synchronous read reports. Without `onError`, a report goes to
  `console.error`; a throw from `onError` is logged there too.
- **Write-back.** A migrated record is not written back. `rewrite` is set only
  for a record of the configured version with `expiresAt` missing or `null`
  when `expireIn` is set. The storage event path ignores it, as in
  `combo.patch`.
- **A thenable from `migrate`** gets `then(undefined, () => {})` before it is
  refused, so its rejection is handled. **A `merge` result** that is not a
  plain object is refused.

## The table of paths

Each path was run by `paths.ts` (appendix) on three source trees: the
unmodified source at `57404c3` ("today"), `combo.patch` ("combo"), and the
spike. One synchronous in-memory storage unless the row says otherwise. "Kept"
means the stored record is unchanged at the end.

| No. | Path                                                                                              | Today: storage at the end                                                                                                        | Combo: storage at the end                    | Spike: storage at the end                       | Spike: reports, promises                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | First install, one edit                                                                           | v2 `{n:1}`                                                                                                                       | same                                         | same                                            | none                                                                                                                                        |
| 2   | Upgrade v1 to v2 with `migrate`, no edit, then an edit                                            | no edit: v1 kept; edit: v2 `{n:8}`                                                                                               | no edit: v2 written at load                  | no edit: v1 kept; edit: v2 `{n:8}`              | none                                                                                                                                        |
| 3   | `migrate` throws, an edit, `save()`, then a corrected release                                     | v3 `{n:6}`: the old `7` lost to the edit                                                                                         | v3 `{n:6}`, same loss                        | v1 kept through the edit; fixed release reads 7 | `parse: bug`; `save()` rejects with `bug` and reports `write`. The edit made in the broken release is never saved                           |
| 4   | `migrate` drops a field without throwing; no edit, then an edit                                   | no edit: kept; edit: field lost                                                                                                  | field lost at load, no edit needed           | no edit: kept; edit: field lost                 | none. Undetectable; only users who edit lose it                                                                                             |
| 4b  | `migrate` returns `null`, then an edit                                                            | v2 `{n:9}`, record lost                                                                                                          | v2 `{n:9}`, record lost                      | v1 kept                                         | `parse: … not migrated`; edit not saved                                                                                                     |
| 4c  | `migrate` returns a rejected promise, then an edit                                                | v2 `{n:9}`, no report                                                                                                            | v2 `{n:9}`, reported                         | v1 kept                                         | `parse`; 0 unhandled rejections                                                                                                             |
| 4d  | A native `async` `migrate`                                                                        | accepted                                                                                                                         | accepted                                     | `persist()` throws `TypeError`, nothing read    |                                                                                                                                             |
| 4e  | `merge` throws, then an edit                                                                      | v2 `{n:9}`, record lost                                                                                                          | v2 `{n:9}`, record lost                      | kept                                            | `parse: merge bug`; edit not saved                                                                                                          |
| 5   | Version raised to 2 with no `migrate`, one edit                                                   | v2 `{n:1}`, old record dropped                                                                                                   | same, reported                               | same                                            | none, as rule 1 says                                                                                                                        |
| 6   | Rollback: a v2 record, a v1 handle with `migrate`, no edit                                        | kept                                                                                                                             | replaced at load by v1 `{n:7}`, `extra` lost | kept                                            | `parse: … from a newer version`                                                                                                             |
| 6   | Rollback, with an edit, `save()`, `rehydrate()`                                                   | v1 `{n:1}`, v2 record lost                                                                                                       | v1 `{n:1}`, lost                             | kept                                            | `parse`, `write`, `parse`; `save()` and `rehydrate()` reject. The edit stays in the store, unsaved                                          |
| 7   | Two tabs, v1 loaded first, then v2 migrates and edits, then v1 edits; no `syncTabs`               | v1 `{old:99}`: v2 record lost                                                                                                    | same                                         | same                                            | none. The v1 tab cannot know                                                                                                                |
| 7   | The same with `syncTabs`                                                                          | v1 `{old:99}`, lost                                                                                                              | v1 `{old:99}`, lost, reported                | v2 `{n:4}` kept                                 | B: `parse: … newer`. B's edit is not saved                                                                                                  |
| 7c  | A v1 tab opened after the v2 tab wrote, one edit                                                  | v2 lost                                                                                                                          | v2 lost, reported                            | kept                                            | `parse`                                                                                                                                     |
| 8   | `skipHydration`, a record of the same version, an edit, `save()`, `rehydrate()`                   | `{count:1, other:""}`: `other:"a"` lost                                                                                          | same                                         | `{count:1, other:"a"}`                          | `save()` before the read rejects, `write: nothing was read yet`; `rehydrate()` resolves; the edit wins, `other` restored, then saved        |
| 8   | The same with a newer record (`skip-hydration.ts`)                                                | v1 `{count:1}`, v2 lost                                                                                                          | same                                         | kept                                            | `save()` rejects; `rehydrate()` rejects with `parse: … newer`; edit stays in the store, unsaved                                             |
| 9   | Async storage, an edit and a `save()` during the first read: no record                            | `{a:1,b:0}`                                                                                                                      | same                                         | same                                            | `save()` rejects; the edit is saved after the read                                                                                          |
| 9   | … a restorable record `{a:7,b:7}`                                                                 | `{a:1,b:0}`: `b:7` lost to `save()`                                                                                              | same                                         | `{a:1,b:7}`                                     | `save()` rejects; edit wins for `a`, `b` restored                                                                                           |
| 9   | … not JSON                                                                                        | `{a:1,b:0}`                                                                                                                      | same                                         | same                                            | `parse`; edit saved                                                                                                                         |
| 9   | … a lower version, no `migrate`                                                                   | `{a:1,b:0}`                                                                                                                      | same                                         | same                                            | none; edit saved                                                                                                                            |
| 9   | … a newer record                                                                                  | v1 `{a:1,b:0}`, v2 lost                                                                                                          | same                                         | kept                                            | `parse`; edit in the store, unsaved                                                                                                         |
| 9   | … `migrate` throws                                                                                | `{a:1,b:0}`, lost                                                                                                                | same                                         | kept                                            | `parse: bug`; edit in the store, unsaved                                                                                                    |
| 10  | An expired record of version 0, 1 or 2 (handle 1), with and without `clearOnExpire`, then an edit | replaced by the edit in all six                                                                                                  | same                                         | same; removed at load with `clearOnExpire`      | none; `isExpired` true. Rule 8 holds for a newer version too                                                                                |
| 10b | No `expiresAt`, handle with `expireIn: 1000`, no edit                                             | kept, no `expiresAt`                                                                                                             | written once with an `expiresAt`             | written once with an `expiresAt`                | none                                                                                                                                        |
| 10c | `expiresAt: null`, handle with `expireIn: Infinity`, no edit                                      | kept                                                                                                                             | kept                                         | written again with `null`, on every load        | none. Harmless but useless: see rule 7                                                                                                      |
| 11  | `clear()` from `onError`'s third argument: not JSON or newer, sync or async storage, then an edit | `{n:3}` in all four, but nothing is cleared: `onError` gets no handle, and the edit replaces the record (a newer one unreported) | same                                         | `{n:3}` in all four: cleared, then saved        | one `parse` each                                                                                                                            |
| 12  | Newer record; an edit, `pagehide` (debounce 50), `save()`, `rehydrate()`, `clear()`, an edit      | v1 `{n:2}`                                                                                                                       | v1 `{n:2}`                                   | v1 `{n:2}` only after `clear()`                 | one report after the edit and `pagehide`; `save()` rejects (`write`); `rehydrate()` rejects (`parse`); `clear()` resolves, `lastError` null |
| 12b | Newer record; an edit while blocked; the record becomes v1 `{n:8}`; `rehydrate()`; an edit        | v1 `{n:9}`                                                                                                                       | same                                         | same                                            | `rehydrate()` resolves and restores 8 over the edit (1), which is lost                                                                      |
| 13  | The first `getItem` throws, then an edit                                                          | `{n:1}`: `n:7` lost                                                                                                              | same                                         | same                                            | `read: read failed`. **Not covered by any rule**; the variant keeps `{n:7}`                                                                 |
| 14  | A record nested 30,000 deep, then an edit                                                         | replaced, reported                                                                                                               | replaced, reported                           | kept                                            | `parse: Maximum call stack size exceeded`; the handle never saves again until `clear()`                                                     |
| 15  | A v1 record arrives from another tab; v2 handle with `migrate`                                    | restored, 0 writes                                                                                                               | same                                         | same                                            | none. No write-back from another tab                                                                                                        |
| 16  | `onError` throws                                                                                  | swallowed                                                                                                                        | swallowed                                    | logged with `console.error`                     |                                                                                                                                             |

`no-onerror.ts` (appendix): without `onError`, a newer record is reported to
`console.error` and kept; `version: -1`, `NaN` and `'1'` throw at `persist()`.

### The reviewers' four scripts

| Script                                | Today                                                 | Combo                                                    | Spike                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `downgrade-p5.ts` (2W1)               | `migrate` called with 2; v2 record kept until an edit | `migrate` called with 2; v2 replaced at load, no report  | `migrate` not called; v2 kept; one `parse` report                                                                                                                                                |
| `version-float.ts` (2W2)              | `1.1` restored, edit saved                            | refused as not an integer, the next edit replaced it     | `1.1` restored, edit saved                                                                                                                                                                       |
| `onerror-clear.ts` (adversarial-3 2)  | `onError` after `persist()` returned; `clear()` ran   | `clear()` threw `ReferenceError`, swallowed, record kept | Unchanged by design: the script reaches the returned handle, which is in its dead zone. The `ReferenceError` is now logged by `console.error`. With the third argument (path 11) `clear()` works |
| `skip-hydration.ts` (adversarial-3 3) | v2 record replaced by the edit                        | same                                                     | v2 record kept; `rehydrate()` rejects with `parse` (the script does not catch it, so it ends with that error)                                                                                    |

## Every path on which stored data or an edit is lost

Lost **stored data** (a record replaced or removed while it held data):

1. **A first read that fails, then an edit** (path 13). Not in the rules, not
   reported as a loss. Fix: `read-failure-blocks.patch`.
2. **Two tabs without `syncTabs`**: a tab of the older build that loaded
   before the newer one wrote replaces the newer record at its next edit
   (path 7). Accepted in decision 21; the guide says so.
3. **A version raised with no `migrate`**: the old record is replaced at the
   next save, with no report (path 5). On purpose (rule 1).
4. **A `migrate` that is wrong and does not throw**: the next edit replaces
   the source record with the wrong result (path 4). Only users who edit; the
   write-back that made it every user is gone (rule 7).
5. **An expired record of any version** is replaced at the next save, or
   removed at load with `clearOnExpire` (path 10), also one a newer build
   wrote. On purpose (rule 8).
6. **A record from another tab while an edit is waiting for its debounce**:
   the other tab's record wins for the fields it holds, and the waiting edit
   is dropped. Today's behaviour, pinned by "cross-tab event cancels a pending
   debounced write"; last writer wins. Not run here.
7. **`clear()`**, from `onError` or anywhere. On purpose.

Lost **edits** (made in the store, never saved):

8. **Any edit while the handle does not write**: a newer record (6, 7, 8,
   9), a failed `migrate`, `merge` or `deserialize` (3, 4b, 4c, 4e, 9), a
   rolled-back restore (14). Reported once per read; `lastError` holds it.
   On purpose (rule 2): this is the failure that can be undone.
9. **Those edits again, when a `rehydrate()` restores** (path 12b). Not named
   by any rule.
10. **An edit before `rehydrate()` under `skipHydration`**, if rule 3 is read
    as today's restore: the stored field overwrites it. The spike does not
    lose it (path 8); the rule should say which.

**The handle never saves again**:

11. **A record too deep to restore** (path 14): blocked until `clear()`. It is
    reported, on every load, but no release can read it.
12. **`skipHydration` with no `rehydrate()` call**: nothing is ever saved and
    **nothing is reported**. This is the one silent path the rules add. It
    needs a sentence in the guide, or a report on the first edit made before
    any read when no read is in flight (not built).
13. **A blocked handle whose record another tab removes**: a storage event with
    `newValue: null` is ignored (`onStorageEvent`, first lines), so the handle
    stays blocked over an empty key until a `rehydrate()` or `clear()`.
    Reasoning from the code; not run.

## Tests

**Unit suite**, against `combo.patch`'s 15 failures: 1,293 pass, 48 fail. Of
combo's 15, 14 still fail, classed as in `persist-devtools.md`. The 15th,
`persist.hydration.test.ts` "stored data from another version is ignored when
there is no migrate", passes again: rule 1 makes that record silent.

The 34 new failures, measured by switching rules off one at a time:

| Cause                                        | Count | Class                                                                                                                                |
| -------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------ |
| Rule 3, `skipHydration` used as test setup   |    24 | **Incidental.** Each saves before a read to test something else; with rule 3 off all 24 pass. Rewrite with `await rehydrate()` first |
| Rule 3, `save()` during an async first read  |     2 | **Fixes.** They pin `save()` replacing a record it never read                                                                        |
| Rule 3, the first read keeps an earlier edit |     3 | **Incidental**, and a decision: they pin "the read wins over an edit made before `rehydrate()`"                                      |
| Rule 6, the third argument                   |     5 | **Incidental.** `toHaveBeenCalledWith(error, operation)` with exact arguments                                                        |

The 24: `persist.api.test.ts` (8): "a rejected explicit save does not poison
queued saves", "automatic batched writes report rejection and recover on the
next edit", "automatic debounced writes report rejection and recover on the
next edit", "automatic queued writes cancelled by disposal settle without
reporting errors", "rejects a queued clear skipped by disposal without
invoking its adapter", "rejects a queued save skipped by disposal without
invoking its adapter", "rejects write failures and reports each error once",
"reports serialization failures and preserves the original error if onError
throws". `persist.concurrent.test.ts` (6): "a third write waits for the second
after the first has finished", "clears storage after an already-issued save
finishes", "drops queued saves after dispose while an issued write can
finish", "keeps a newer save behind a failed pending write", "keeps a newer
save behind a successful pending write", "rehydrates from the result of a
previously requested save". `persist.debounce.test.ts` (2): "a removal in
another tab does not cancel a pending debounced save", "after a debounced save
has run, reading the record back writes nothing". `persist.dispose.test.ts`
(2): "a write that finishes after dispose leaves the disposed status as it
was", "clear() on a disposed handle rejects at once, without waiting for a
write still in flight". `persist.errors.test.ts` (1): "an issued save rejects
after disposal without reporting or starting queued work".
`persist.reads.test.ts` (2): "a read still waiting for an earlier write does
not touch storage once the handle is disposed", "save() supersedes every read
in flight, not only the latest". `persist.validation.test.ts` (1): "a record
saved with expireIn: Infinity never expires". `persist.writes.test.ts` (2):
"save() reaches a synchronous adapter before it returns, also after an earlier
write has finished", and the same for `clear()`.

The 2 that fix: `persist.hydration.test.ts` "an explicit save during a slow
read keeps the saved state"; `persist.reads.test.ts` "an explicit save during
a read replaces the save an earlier edit was waiting for".

The 3 that pin today's `skipHydration` restore: `persist.test.ts` "rehydrate
cancels a pending debounced write so loaded state wins";
`persist.debounce.test.ts` "a debounced save cancelled by save() is not
revived by a later read" and "… by clear() …".

The 5: `persist.errors.test.ts` "a failed expiration removal rejects hydration
and releases a queued save", "automatic serialization failure reports once and
a later explicit save recovers", and "clear / rehydrate / save preserves a
synchronous adapter failure when onError throws".

**Tests that pin today's write-back behaviour.** "Hydration does not trigger a
write-back to storage" (`persist.test.ts`), "plain hydration with no local
edit writes nothing back" (`persist.hydration.test.ts`), "a restore in which
one stored field already matches writes nothing back" (`persist.restore.test.ts`)
and "does not write back to storage when applying a remote tab event"
(`persist.test.ts`) all still pass: none has `expireIn`. No test pins that a
migrated record is not written back (P5 failed none), and none pins the
`expiresAt` write-back either way. Stage 4 writes both.

**Typecheck**: two errors, both in `types.utils.test.ts`. One is P7's, as in
`combo.patch`. The other pins `PersistOptions` with the two-argument `onError`
(incidental; it changes with the type).

**Lint**: Biome would reformat `persist.ts` (line length only).

## Size

`bun run size`, `./utils`, bytes gzipped added to the main entry:

| Build                                      |  Adds | Against `combo.patch` |
| ------------------------------------------ | ----: | --------------------: |
| Today (`57404c3`)                          | 2,686 |                       |
| `combo.patch`, measured again here         | 3,396 |                       |
| The spike                                  | 3,633 |                  +237 |
| The spike with `read-failure-blocks.patch` | 3,641 |                  +245 |

By rule, each measured by taking it out of the spike: rule 5 (two checks at
`persist()`) 56; rule 3 (`hasRead`, the first baseline, the `save()` guard) 54;
rule 6's default `console.error` 7, the third argument and the move of the
kick-off about 0. The remaining 120 are rules 1, 2, 4 and 7 together: the
kinds, `blocked`, the newer-version check, the `merge` and thenable checks,
and the narrowed write-back. They share the same lines and were not split.
The main entry and every other entry are unchanged against `combo.patch`.

## The public types that change

Only `onError` changes shape. As built:

```ts
export type PersistOptions<T extends object> = {
  name: string;
  storage: StorageAdapter;
  properties?: Array<keyof T | PropertyTransform<T>>;
  debounce?: number;
  /** A finite number, 0 or more. Checked when persist() is called. */
  version?: number;
  /** Called only for a lower version. A native async function is refused. */
  migrate?: (
    persistedState: Record<string, unknown>,
    oldVersion: number,
  ) => Record<string, unknown>;
  merge?:
    | 'shallow'
    | ((
        persisted: Record<string, unknown>,
        current: Record<string, unknown>,
      ) => Record<string, unknown>);
  skipHydration?: boolean;
  syncTabs?: boolean;
  expireIn?: number;
  clearOnExpire?: boolean;
  /** Without it, a report goes to console.error. A throw here is logged. */
  onError?: (
    error: unknown,
    operation: PersistOperation,
    handle: PersistHandle,
  ) => void;
};

export type PersistOperation = 'write' | 'read' | 'remove' | 'parse';

export type PersistStatus = {
  readonly isHydrated: boolean;
  readonly isExpired: boolean;
  readonly isDisposed: boolean;
  readonly lastError: Readonly<{
    error: unknown;
    operation: PersistOperation;
  }> | null;
};

export type PersistHandle = UtilityStatusSource<PersistStatus> & {
  dispose: () => void;
  hydrated: Promise<void>;
  readonly isHydrated: boolean;
  /** Rejects, with a 'write' report, before the first read has settled and
   *  while the stored record is one this handle must not write over. */
  save: () => Promise<void>;
  /** Works at any time; afterwards the handle writes again. */
  clear: () => Promise<void>;
  /** Rejects, with a 'parse' report, when it finds a newer record or one it
   *  cannot migrate or restore. */
  rehydrate: () => Promise<void>;
  readonly isExpired: boolean;
};
```

`PersistStatus` and `PersistHandle` keep their shape; only their meaning
changes. While a handle does not write, `lastError` stays set, because nothing
that clears it (a successful write, read or removal) can run until the handle
is unblocked; that is reasoning from the code, not a test. A field such as
`isBlocked` is not needed for the blocked state. It would be the only way to
see path 12 (`skipHydration` with no read), and it is an addition that can
follow 1.0.

The third parameter is safe for existing callbacks: a function of two
parameters is assignable to it.

## Recommendation for each rule

1. **Three kinds, and the silent second kind. Keep, and add a row.** A first
   read that throws must count as no read (`read-failure-blocks.patch`, 8
   bytes, no test fails); otherwise rule 10 is false. Decision 21's table
   still lists the lower version with no `migrate` under "reported"; it
   changes to match the brief. The guide says a record too deep to restore
   stops saving until `clear()`. **Before 1.0.**
2. **A handle that does not write. Keep.** The guide names what unblocks it
   and that edits made meanwhile are lost when a `rehydrate()` restores. Say
   whether a removal in another tab unblocks it; today it does not (path
   13 of the loss list). **Before 1.0.**
3. **Writes only after a read. Change the text, keep the behaviour built.**
   Say that the first read under `skipHydration` restores over the state at
   `persist()`, so an earlier edit wins, and that `save()` rejects until the
   first read has settled with any storage. The guide's "It does not delay
   writes" is reversed, and it must say that a handle with `skipHydration`
   saves nothing until `rehydrate()` is called. **Before 1.0.**
4. **Versions. Keep.** Built as written; `1.1` round-trips
   (`version-float.ts`). **Before 1.0.**
5. **Checks at `persist()`. Keep.** 56 bytes. The `migrate` check compares
   `Symbol.toStringTag` with `'AsyncFunction'` exactly; a transpiled `async`
   function is not caught there and falls to the thenable check at read time
   (path 4c). **Before 1.0.**
6. **`onError` with the handle, `console.error` by default. Keep.** It fixes
   adversarial-3 objection 2 for both kinds of storage (path 11). The guide's
   advice becomes `onError: (error, operation, handle) => handle.clear()`.
   **Before 1.0.**
7. **No write-back at load except `expiresAt`. Change one condition**: write
   back only when `expireIn` is finite, so an `Infinity` handle stops
   rewriting its record on every load (path 10c). The rest holds: a migrated
   record waits for the first save (path 2), a wrong `migrate` costs only
   users who edit (path 4), and a rollback blocks only users who edited in
   the newer build. The guide's sentence "Migration and hydration do not
   automatically rewrite storage" gets the one exception. **Before 1.0.**
8. **Expiry first. Keep.** A newer build's expired record is replaced by the
   older build's next save (path 10), which is what the newer build would do.
   **Can follow 1.0** in substance, but it moves with rule 1.
9. **P4, P5's flush, P6, P8 as in `combo.patch`. Keep.** The flush goes
   through `autoSave()`, so a blocked handle neither writes nor reports on
   `pagehide` (path 12).

**Guarantee rule 10 needs three edits** to match the build: name the version
raised with no `migrate` as a case that replaces a record; name a tab of an
older build without `syncTabs` that loaded before the newer one wrote; and
change "an edit made while a read is in flight is not lost" to "is kept in the
store, and saved unless the record is one the handle does not write over".

## Cost for stage 4

- **Files**: `persist.ts`, `persist.types.ts`, `PERSIST_TUTORIAL.md`
  (`skipHydration`, migration, the error section), `REACT_SSR.md` (no change
  to the pattern: it calls `rehydrate()` in the same effect), the API
  reference's `onError` line.
- **Tests to rewrite**: the 29 incidental ones above (24 to `await
  rehydrate()` first, 3 to the new `skipHydration` answer, 5 to the third
  argument; some overlap), the type test, and the two that fix.
- **Tests to write first**: one per row of the table of paths, at least 2,
  3, 4b, 4e, 6, 7 with `syncTabs`, 8 both rows, every row of 9, 10 with a
  newer version, 10b, 11 both storages, 12, 12b, 13, 14; `persist()`
  throwing for each bad `version` and an `async` `migrate`; `console.error`
  without `onError` and on a throw from it.
- **Risk**: medium. `hasRead` touches every write path; the 24 rewritten tests
  are the guard that write ordering is unchanged.
- **Numbers**: the `./utils` budget. The decision document's ceiling has to
  hold 3,641 (with the read-failure fix) or move.

## Verified and not verified

**Verified by running**, in the worktree at `57404c3` with `combo.patch`:

- `bun run test` on `combo.patch` (15 failures, the same list as its report),
  on the spike (48), and on three variants: rule 3 off (22), the `save()`
  guard only under `skipHydration` (46), and the read-failure fix (48, none
  new).
- `bun run --filter @codebelt/classy-store typecheck` on the spike.
- `bun run size` on `combo.patch`, the spike and four variants.
- `paths.ts` on the unmodified source, `combo.patch` and the spike;
  `no-onerror.ts` and the reviewers' four scripts on all three (the first two
  of them through `SRC`, the others through the tree path).
- That `spike-on-combo.patch` applies after `combo.patch` to a clean tree at
  `57404c3` and gives the spike's `persist.ts`.

**Not run:**

- `bun run benchmark:core` and `benchmark:core:node`. The spike changes only
  `persist.ts` and `persist.types.ts` against `combo.patch`, and neither is on
  a benchmarked path; `combo.patch`'s own timings are in its report.
- The browser, framework and mutation suites, as the brief says. No real
  `pagehide`, no real second tab: the cross-tab rows dispatch a plain `Event`
  named `storage` on `globalThis` without `storageArea`.

**Reasoning only:** path 13 of the loss list (a removal from another tab
leaves a blocked handle blocked); that `lastError` stays set for the whole
time a handle does not write; that a transpiled `async` `migrate` reaches the
thenable check (path 4c covers a function returning a rejected promise, which
is what such a function does).

## Appendix: patches and scripts

`combo.patch` is in the appendix of `persist-devtools.md`. Apply it to a
worktree at `57404c3`, then `spike-on-combo.patch`. The variant patch applies
on top of both.

### `spike-on-combo.patch`

```diff
diff --git a/packages/classy-store/src/utils/persist/persist.ts b/packages/classy-store/src/utils/persist/persist.ts
index ddb5f4f..8a2ed3f 100644
--- a/packages/classy-store/src/utils/persist/persist.ts
+++ b/packages/classy-store/src/utils/persist/persist.ts
@@ -80,6 +80,10 @@ function resolveProperties<T extends object>(
   return result;
 }
 
+/** A version, in the option and in a record, is a finite number of 0 or more. */
+const isVersion = (value: unknown) =>
+  Number.isFinite(value) && (value as number) >= 0;
+
 // ── Main implementation ──────────────────────────────────────────────────────
 
 /**
@@ -113,17 +117,22 @@ export function persist<T extends object>(
     onError,
   } = options;
 
-  /** Route a failure through `onError` (or swallow silently if not provided). */
+  // Checked once, before anything is read or written.
+  if (!isVersion(version))
+    throw new TypeError('persist(): version must be a finite number >= 0');
+  if ((migrate as {[Symbol.toStringTag]?: string})?.[Symbol.toStringTag] === 'AsyncFunction')
+    throw new TypeError('persist(): migrate must not be async');
+
+  /** Route a failure through `onError`, or to the console without one. */
   function reportError(error: unknown, operation: PersistOperation): void {
     if (disposed) return;
     lastError = Object.freeze({error, operation});
     status.update(readStatus());
-    if (onError) {
-      try {
-        onError(error, operation);
-      } catch {
-        // User callback failed — nothing more we can do.
-      }
+    try {
+      if (onError) onError(error, operation, handle);
+      else console.error(error);
+    } catch (callbackError) {
+      console.error(callbackError);
     }
   }
 
@@ -140,9 +149,23 @@ export function persist<T extends object>(
   let storageQueue: Promise<void> | undefined;
   let skipAutoSaveVersion: number | undefined;
   let clearedVersion: number | undefined;
-  // Set when a read restored a record that should be stored again: migrated,
-  // or written before `expireIn` was set, so it gets its expiresAt now.
+  // Set when a read restored a record written before `expireIn` was set, so it
+  // gets its expiresAt now. A migrated record is stored by the first save.
   let rewrite = false;
+  // Whether a read has settled: before that, a save could replace a record
+  // nobody has looked at.
+  let hasRead = false;
+  // The report of a record this handle must not write over (newer, or not
+  // migrated or restored), boxed so that any thrown value counts. While it is
+  // set, nothing is saved.
+  let blocked: [unknown] | null = null;
+  // Set by a read once the record is one to keep, so a later throw blocks.
+  let keepRecord = false;
+  // With skipHydration, the first read restores over the state at persist(),
+  // so an edit made before rehydrate() keeps its value.
+  let firstBaseline = skipHydration
+    ? (snapshot(proxyStore) as Record<string, unknown>)
+    : undefined;
   let lastError: PersistStatus['lastError'] = null;
   const readStatus = (): PersistStatus => ({
     isHydrated: hydratedFlag,
@@ -251,10 +274,12 @@ export function persist<T extends object>(
   function autoSave(): void {
     // Writing now would replace the stored record with defaults before the
     // read can restore it. Save the merged state once the read settles.
-    if (reading) {
+    if (reading || !hasRead) {
       saveAfterRead = true;
       return;
     }
+    // The stored record is one this handle must not write over.
+    if (blocked) return;
     // Background writes already report failures through status and onError.
     void writeToStorage().catch(() => {});
   }
@@ -298,6 +323,7 @@ export function persist<T extends object>(
     raw: string,
     baseline = snapshot(proxyStore) as Record<string, unknown>,
   ): boolean {
+    keepRecord = false;
     const envelope = JSON.parse(raw) as PersistEnvelope;
     // Every record that cannot be used is reported as 'parse', never skipped.
     const unreadable: (why: string) => never = (why) => {
@@ -306,12 +332,11 @@ export function persist<T extends object>(
     if (!isPlainObject(envelope) || !isPlainObject(envelope.state))
       unreadable('is not {version, state}');
 
-    // Expiry check — skip hydration if data has expired. JSON stores an
-    // `expireIn` of Infinity as null; a record from before `expireIn` has none.
+    // Expiry comes first, whatever the version. JSON stores an `expireIn` of
+    // Infinity as null; a record from before `expireIn` has none.
     const {expiresAt} = envelope;
     if (expiresAt != null && typeof expiresAt !== 'number')
       unreadable('has an expiresAt that is not a number');
-    if (expireIn != null && expiresAt === undefined) rewrite = true;
     if (typeof expiresAt === 'number' && Date.now() >= expiresAt) {
       expiredFlag = true;
       return true;
@@ -319,21 +344,25 @@ export function persist<T extends object>(
 
     let {state} = envelope;
 
-    // Data stored under another schema version is usable only through
-    // `migrate`. A record with no version counts as the default, version 0;
-    // any other version must be an integer.
-    const storedVersion = envelope.version ?? 0;
-    if (!Number.isInteger(storedVersion))
-      unreadable('has a version that is not an integer');
-    if (storedVersion !== version) {
-      if (!migrate)
-        unreadable(`has version ${storedVersion} and there is no migrate`);
-      state = migrate(state, storedVersion);
-      // A promise, an array or null is not a state.
+    // A record with no version counts as version 0.
+    const storedVersion =
+      envelope.version === undefined ? 0 : (envelope.version as unknown);
+    if (!isVersion(storedVersion)) unreadable('has an unusable version');
+    // From here on the record holds data: a failure keeps it, and blocks.
+    keepRecord = true;
+    // A newer build wrote it; this one cannot read it and must not replace it.
+    if ((storedVersion as number) > version) unreadable('is from a newer version');
+    if ((storedVersion as number) < version) {
+      // A version raised with no migrate discards older records, in silence.
+      if (!migrate) return false;
+      state = migrate(state, storedVersion as number);
+      // A promise, an array or null is not a state. A rejection is handled.
+      const thenable = state as unknown as PromiseLike<unknown> | null;
+      if (typeof thenable?.then === 'function')
+        thenable.then(undefined, () => {});
       if (!isPlainObject(state))
         unreadable('was not migrated: migrate must return a plain object');
-      rewrite = true;
-    }
+    } else if (expireIn != null && expiresAt == null) rewrite = true;
 
     const startVersion = getVersion(proxyStore);
     const current = snapshot(proxyStore) as Record<string, unknown>;
@@ -355,6 +384,8 @@ export function persist<T extends object>(
             Object.fromEntries(propKeys.map((key) => [key, current[key]])),
           )
         : state;
+    if (!isPlainObject(merged))
+      unreadable('was not merged: merge must return a plain object');
     const pending = new Set(
       propKeys.filter((key) => Object.hasOwn(merged, key)),
     );
@@ -429,7 +460,9 @@ export function persist<T extends object>(
     const request = ++hydrationRequest;
     // Stored fields are restored over this state. A field edited after this
     // point keeps its newer local value; every other field is still restored.
-    const baseline = snapshot(proxyStore) as Record<string, unknown>;
+    const baseline =
+      firstBaseline ?? (snapshot(proxyStore) as Record<string, unknown>);
+    firstBaseline = undefined;
     const isCurrent = () => !disposed && request === hydrationRequest;
     reading++;
     try {
@@ -464,9 +497,12 @@ export function persist<T extends object>(
         try {
           expired = applyPersistedState(raw, baseline);
         } catch (error) {
+          // Set before the report, so a clear() in onError unblocks.
+          blocked = keepRecord ? [error] : null;
           fail(error, 'parse');
         }
-        // Store a migrated record, so the next load does not migrate again.
+        blocked = null;
+        // Give a record from before `expireIn` its expiresAt.
         if (rewrite) saveAfterRead = true;
         if (expired && clearOnExpire) {
           const removal = enqueueStorageMutation(
@@ -479,9 +515,11 @@ export function persist<T extends object>(
           succeeded();
         }
       } else {
+        blocked = null;
         succeeded();
       }
     } finally {
+      hasRead = true;
       if (!hydratedFlag) {
         hydratedFlag = true;
         resolveHydrated();
@@ -526,8 +564,12 @@ export function persist<T extends object>(
     }
     // Suppress writes triggered by mutations from this apply, otherwise
     // tabs ping-pong storage events forever.
+    // A record from another tab is never written back.
+    hasRead = true;
     try {
-      if (applyPersistedState(event.newValue) && clearOnExpire) {
+      const expired = applyPersistedState(event.newValue);
+      blocked = null;
+      if (expired && clearOnExpire) {
         void enqueueStorageMutation(
           () => storage.removeItem(name),
           'remove',
@@ -537,6 +579,7 @@ export function persist<T extends object>(
         succeeded();
       }
     } catch (error) {
+      blocked = keepRecord ? [error] : null;
       reportError(error, 'parse');
     }
   }
@@ -567,12 +610,6 @@ export function persist<T extends object>(
   // Subscribe to store mutations.
   const unsubscribeFromStore = subscribe(proxyStore, scheduleWrite);
 
-  // Kick off initial hydration (unless skipped).
-  if (!skipHydration) {
-    // Failures are reported through status and onError.
-    void hydrateFromStorage().catch(() => {});
-  }
-
   // ── Build handle ───────────────────────────────────────────────────────
 
   function dispose() {
@@ -607,6 +644,12 @@ export function persist<T extends object>(
 
     async save() {
       assertActive();
+      // Nothing is written before a read, or over a record that must be kept.
+      if (!hasRead || blocked)
+        fail(
+          blocked ? blocked[0] : new Error('persist(): nothing was read yet'),
+          'write',
+        );
       // Cancel pending debounce and write immediately.
       saveAfterRead = false;
       if (debounceTimer !== null) {
@@ -621,6 +664,9 @@ export function persist<T extends object>(
       hydrationRequest++;
       saveAfterRead = false;
       clearedVersion = getVersion(proxyStore);
+      // Storage is empty from here on, so this handle may write again.
+      hasRead = true;
+      blocked = null;
       if (debounceTimer !== null) {
         clearTimeout(debounceTimer);
         debounceTimer = null;
@@ -636,5 +682,12 @@ export function persist<T extends object>(
     },
   };
 
+  // Kick off initial hydration (unless skipped). The handle exists by now, so
+  // onError can call clear() on it during a synchronous first read.
+  if (!skipHydration) {
+    // Failures are reported through status and onError.
+    void hydrateFromStorage().catch(() => {});
+  }
+
   return handle;
 }
diff --git a/packages/classy-store/src/utils/persist/persist.types.ts b/packages/classy-store/src/utils/persist/persist.types.ts
index 774795f..5ecc760 100644
--- a/packages/classy-store/src/utils/persist/persist.types.ts
+++ b/packages/classy-store/src/utils/persist/persist.types.ts
@@ -138,8 +138,17 @@ export type PersistOptions<T extends object> = {
    *
    * Automatic operations report errors without rejecting. Explicit save,
    * clear, and rehydrate calls also reject their promise with the original error.
+   *
+   * The handle is passed as the third argument, so a report from the first
+   * read, which can come before `persist()` returns, can call `clear()`.
+   * Without `onError`, a report goes to `console.error`; an error thrown here
+   * is logged there too.
    */
-  onError?: (error: unknown, operation: PersistOperation) => void;
+  onError?: (
+    error: unknown,
+    operation: PersistOperation,
+    handle: PersistHandle,
+  ) => void;
 };
 
 /** Operation that can produce an `onError` callback invocation. */
```

### `read-failure-blocks.patch`: a failed read counts as no read

```diff
--- a/packages/classy-store/src/utils/persist/persist.ts	2026-11-25 10:02:35
+++ b/packages/classy-store/src/utils/persist/persist.ts	2026-11-25 10:03:51
@@ -464,6 +464,7 @@
       firstBaseline ?? (snapshot(proxyStore) as Record<string, unknown>);
     firstBaseline = undefined;
     const isCurrent = () => !disposed && request === hydrationRequest;
+    let unread = false;
     reading++;
     try {
       let raw: string | null | Promise<string | null>;
@@ -477,6 +478,8 @@
         if (typeof (raw as Promise<unknown> | null)?.then === 'function')
           raw = await raw;
       } catch (error) {
+        // A read that failed has not read: nothing is saved over the record.
+        unread = true;
         if (isCurrent()) fail(error, 'read');
         return;
       }
@@ -519,7 +522,7 @@
         succeeded();
       }
     } finally {
-      hasRead = true;
+      if (!unread) hasRead = true;
       if (!hydratedFlag) {
         hydratedFlag = true;
         resolveHydrated();
```

### `paths.ts`: the table of paths, run with `SRC=<tree>/packages/classy-store/src bun paths.ts`

```ts
// The table of paths. Run with SRC=<tree>/packages/classy-store/src bun paths.ts
// Each case prints: what storage holds at the end, what was reported, what the
// promises did, and the store's state where it matters.
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {persist} = await import(`${SRC}/utils/index.ts`);

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let logged: string[] = [];
console.error = (...a: unknown[]) =>
  void logged.push(
    a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '),
  );

type Opts = Record<string, unknown>;
function mem(initial?: unknown, async = false) {
  const data = new Map<string, string>();
  if (initial !== undefined)
    data.set(
      'k',
      typeof initial === 'string' ? initial : JSON.stringify(initial),
    );
  let writes = 0;
  const later = <T>(v: T) => (async ? tick(5).then(() => v) : v);
  const storage = {
    getItem: (k: string) => later(data.get(k) ?? null),
    setItem: (k: string, v: string) => {
      writes++;
      data.set(k, v);
      return async ? tick(1) : undefined;
    },
    removeItem: (k: string) => {
      data.delete(k);
      return async ? tick(1) : undefined;
    },
  };
  return {
    data,
    storage,
    get writes() {
      return writes;
    },
    raw: () => data.get('k') ?? '(none)',
  };
}
function open(s: ReturnType<typeof mem>, state: object, opts: Opts) {
  const reports: string[] = [];
  const store = createClassyStore(state);
  const userOnError = opts.onError as ((...a: unknown[]) => void) | undefined;
  const handle = persist(store, {
    name: 'k',
    storage: s.storage,
    ...opts,
    onError: (e: unknown, op: string, h: unknown) => {
      reports.push(
        `${op}: ${e instanceof Error ? e.message.replace('persist(): ', '') : String(e)}`,
      );
      userOnError?.(e, op, h);
    },
  });
  return {store, handle, reports};
}
const settle = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e) =>
      `rejected (${e instanceof Error ? e.message.replace('persist(): ', '') : e})`,
  );
const short = (raw: string) =>
  raw.replace(/"expiresAt":\d+/, '"expiresAt":<n>');
function row(
  name: string,
  s: ReturnType<typeof mem>,
  reports: string[],
  extra = '',
) {
  console.log(
    `${name}\n    storage: ${short(s.raw())}\n    reports: ${reports.length ? reports.join(' | ') : 'none'}${extra ? `\n    ${extra}` : ''}`,
  );
}
const v = (version: number, state: object, more: object = {}) => ({
  version,
  state,
  ...more,
});
const up = (st: Record<string, unknown>, from: number) =>
  from === 1 ? {n: st.old} : st;

async function run(name: string, body: () => Promise<void>) {
  logged = [];
  try {
    await body();
  } catch (e) {
    console.log(`${name}\n    THREW ${(e as Error).message}`);
  }
  if (logged.length)
    console.log(
      `    console.error: ${logged.length} (${logged[0].slice(0, 70)})`,
    );
}

await run('1 first install, one edit', async () => {
  const s = mem();
  const {store, handle, reports} = open(s, {n: 0}, {version: 2});
  await handle.hydrated;
  store.n = 1;
  await tick();
  row('1 first install, one edit', s, reports);
});

await run('2 upgrade with migrate, no edit, then one edit', async () => {
  const s = mem(v(1, {old: 7}));
  const {store, handle, reports} = open(s, {n: 0}, {version: 2, migrate: up});
  await handle.hydrated;
  await tick();
  const before = short(s.raw());
  store.n++;
  await tick();
  row(
    '2 upgrade with migrate',
    s,
    reports,
    `no edit: ${before}; store n=${store.n} after edit`,
  );
});

await run('3 migrate throws, edit, then a corrected release', async () => {
  const s = mem(v(1, {old: 7}));
  const a = open(
    s,
    {n: 0},
    {
      version: 2,
      migrate: () => {
        throw new Error('bug');
      },
    },
  );
  await a.handle.hydrated;
  a.store.n = 5;
  await tick();
  const mid = short(s.raw());
  const pSave = await settle(a.handle.save());
  a.handle.dispose();
  const b = open(
    s,
    {n: 0},
    {
      version: 3,
      migrate: (st: Record<string, unknown>, from: number) =>
        from === 1 ? {n: st.old} : st,
    },
  );
  await b.handle.hydrated;
  await tick();
  b.store.n++;
  await tick();
  row(
    '3 migrate throws, edit, corrected release',
    s,
    [...a.reports, ...b.reports],
    `after the edit in the broken release: ${mid}; save() ${pSave}; fixed release reads n=${b.store.n - 1}`,
  );
});

await run('4 migrate wrong (drops a field), no edit / edit', async () => {
  const s = mem(v(1, {old: 7, keep: 'x'}));
  const {store, handle, reports} = open(
    s,
    {n: 0, keep: ''},
    {version: 2, migrate: (st: Record<string, unknown>) => ({n: st.old})},
  );
  await handle.hydrated;
  await tick();
  const noEdit = short(s.raw());
  store.n++;
  await tick();
  row('4 migrate drops a field', s, reports, `no edit: ${noEdit}`);
});

await run('4b migrate returns null', async () => {
  const s = mem(v(1, {old: 7}));
  const {store, handle, reports} = open(
    s,
    {n: 0},
    {version: 2, migrate: () => null},
  );
  await handle.hydrated;
  store.n = 9;
  await tick();
  row('4b migrate returns null, then an edit', s, reports);
});

await run('4c migrate returns a rejected promise', async () => {
  const s = mem(v(1, {old: 7}));
  let unhandled = 0;
  process.on('unhandledRejection', () => unhandled++);
  const {store, handle, reports} = open(
    s,
    {n: 0},
    {version: 2, migrate: (() => Promise.reject(new Error('later'))) as never},
  );
  await handle.hydrated;
  store.n = 9;
  await tick(10);
  row(
    '4c migrate returns a rejected promise, then an edit',
    s,
    reports,
    `unhandled rejections: ${unhandled}`,
  );
});

await run('4d async migrate', async () => {
  const s = mem(v(1, {old: 7}));
  open(s, {n: 0}, {version: 2, migrate: async (st: unknown) => st});
  row('4d native async migrate', s, []);
});

await run('4e merge throws', async () => {
  const s = mem(v(2, {n: 7}));
  const {store, handle, reports} = open(
    s,
    {n: 0},
    {
      version: 2,
      merge: () => {
        throw new Error('merge bug');
      },
    },
  );
  await handle.hydrated;
  store.n = 9;
  await tick();
  row('4e merge throws, then an edit', s, reports);
});

await run('5 version raised, no migrate', async () => {
  const s = mem(v(1, {n: 7}));
  const {store, handle, reports} = open(s, {n: 0}, {version: 2});
  await handle.hydrated;
  const n0 = store.n;
  store.n++;
  await tick();
  row(
    '5 version raised, no migrate, one edit',
    s,
    reports,
    `store n at load: ${n0}`,
  );
});

for (const edit of [false, true]) {
  await run(`6 rollback, edit=${edit}`, async () => {
    const s = mem(v(2, {n: 7, extra: 'v2 only'}));
    const {store, handle, reports} = open(
      s,
      {n: 0},
      {version: 1, migrate: (st: unknown) => st},
    );
    await handle.hydrated;
    if (edit) store.n = 1;
    await tick();
    const pSave = edit ? await settle(handle.save()) : 'not called';
    const pRe = edit ? await settle(handle.rehydrate()) : 'not called';
    row(
      `6 rollback (v2 record, v1 handle), edit=${edit}`,
      s,
      reports,
      `store n=${store.n}; save() ${pSave}; rehydrate() ${pRe}`,
    );
  });
}

for (const sync of [false, true]) {
  await run(`7 two tabs, syncTabs=${sync}`, async () => {
    // Tab B (v1) loads first, tab A (v2) then loads, migrates and edits.
    const s = mem(v(1, {old: 3}));
    const b = open(s, {old: 0}, {version: 1, syncTabs: sync});
    await b.handle.hydrated;
    const a = open(s, {n: 0}, {version: 2, migrate: up});
    await a.handle.hydrated;
    a.store.n = 4;
    await tick();
    if (sync) {
      // The storage event that tab A's write raises in tab B.
      const e = Object.assign(new Event('storage'), {
        key: 'k',
        newValue: s.data.get('k'),
      });
      globalThis.dispatchEvent(e);
    }
    const afterA = short(s.raw());
    b.store.old = 99;
    await tick();
    row(
      `7 two tabs v1 and v2, syncTabs=${sync}`,
      s,
      [...b.reports.map((r) => `B ${r}`), ...a.reports.map((r) => `A ${r}`)],
      `after A's edit: ${afterA}; then B edits`,
    );
    a.handle.dispose();
    b.handle.dispose();
  });
}

await run('7c two tabs, B opens after A wrote, no syncTabs', async () => {
  const s = mem(v(2, {n: 4}));
  const b = open(s, {old: 0}, {version: 1});
  await b.handle.hydrated;
  b.store.old = 99;
  await tick();
  row('7c v1 tab opened after the v2 tab wrote, one edit', s, b.reports);
});

for (const rec of ['same version', 'newer version']) {
  await run(`8 skipHydration, ${rec}`, async () => {
    const s = mem(
      rec === 'same version' ? v(1, {count: 7, other: 'a'}) : v(2, {count: 41}),
    );
    const {store, handle, reports} = open(
      s,
      {count: 0, other: ''},
      {version: 1, skipHydration: true},
    );
    store.count = 1;
    await tick();
    const before = `${short(s.raw())}`;
    const pSave = await settle(handle.save());
    const pRe = await settle(handle.rehydrate());
    await tick();
    row(
      `8 skipHydration, ${rec} record, edit before rehydrate()`,
      s,
      reports,
      `before rehydrate: ${before}; save() before: ${pSave}; rehydrate() ${pRe}; store ${JSON.stringify({count: store.count, other: store.other})}`,
    );
  });
}

const kinds: Array<[string, unknown, Opts]> = [
  ['none', undefined, {}],
  ['restorable', v(1, {a: 7, b: 7}), {}],
  ['nothing to keep', '{not json', {}],
  ['lower, no migrate', v(0, {a: 7, b: 7}), {}],
  ['newer', v(2, {a: 7, b: 7}), {}],
  [
    'migrate throws',
    v(0, {a: 7, b: 7}),
    {
      migrate: () => {
        throw new Error('bug');
      },
    },
  ],
];
for (const [kind, rec, opts] of kinds) {
  await run(`9 async, ${kind}`, async () => {
    const s = mem(rec, true);
    const {store, handle, reports} = open(
      s,
      {a: 0, b: 0},
      {version: 1, ...opts},
    );
    store.a = 1; // while the first read is in flight
    const pSave = await settle(handle.save());
    await handle.hydrated;
    await tick(20);
    row(
      `9 async storage, edit during the first read: ${kind}`,
      s,
      reports,
      `store ${JSON.stringify({a: store.a, b: store.b})}; save() during the read ${pSave}`,
    );
  });
}

for (const ver of [0, 1, 2]) {
  for (const clearOnExpire of [false, true]) {
    await run(`10 expired v${ver}`, async () => {
      const s = mem(v(ver, {n: 7}, {expiresAt: Date.now() - 1}));
      const {store, handle, reports} = open(
        s,
        {n: 0},
        {
          version: 1,
          expireIn: 1000,
          clearOnExpire,
          migrate: (st: unknown) => st,
        },
      );
      await handle.hydrated;
      await tick();
      const atLoad = short(s.raw());
      store.n = 2;
      await tick();
      row(
        `10 expired record of version ${ver} (handle 1), clearOnExpire=${clearOnExpire}`,
        s,
        reports,
        `at load: ${atLoad}; isExpired ${handle.isExpired}`,
      );
    });
  }
}

await run('10b no expiresAt, expireIn set', async () => {
  const s = mem(v(1, {n: 7}));
  const {handle, reports} = open(s, {n: 0}, {version: 1, expireIn: 1000});
  await handle.hydrated;
  await tick();
  row(
    '10b record without expiresAt, handle with expireIn, no edit',
    s,
    reports,
    `writes at load: ${s.writes}`,
  );
});
await run('10c expireIn Infinity', async () => {
  const s = mem(v(1, {n: 7}, {expiresAt: null}));
  const {handle, reports} = open(
    s,
    {n: 0},
    {version: 1, expireIn: Number.POSITIVE_INFINITY},
  );
  await handle.hydrated;
  await tick();
  row(
    '10c expiresAt null, expireIn Infinity, no edit',
    s,
    reports,
    `writes at load: ${s.writes}`,
  );
});

for (const async of [false, true]) {
  for (const rec of ['{not json', JSON.stringify(v(2, {n: 7}))]) {
    await run(`11 clear() from onError`, async () => {
      const s = mem(rec, async);
      let threw = '';
      const {store, handle, reports} = open(
        s,
        {n: 0},
        {
          version: 1,
          onError: (
            _e: unknown,
            _op: string,
            h: {clear(): Promise<void>} | undefined,
          ) => {
            if (!h) {
              threw = 'no third argument';
              return;
            }
            h.clear().catch((e) => (threw = String(e)));
          },
        },
      );
      await handle.hydrated;
      await tick(10);
      store.n = 3;
      await tick(10);
      row(
        `11 clear() from onError's handle, ${async ? 'async' : 'sync'} storage, ${rec.startsWith('{not') ? 'not JSON' : 'newer record'}, then an edit`,
        s,
        reports,
        threw || '',
      );
    });
  }
}

await run('12 blocked handle: save, rehydrate, pagehide', async () => {
  const s = mem(v(2, {n: 7}));
  const {store, handle, reports} = open(s, {n: 0}, {version: 1, debounce: 50});
  await handle.hydrated;
  store.n = 1;
  await tick();
  globalThis.dispatchEvent(new Event('pagehide'));
  await tick();
  const afterHide = reports.length;
  const pSave = await settle(handle.save());
  const pRe = await settle(handle.rehydrate());
  const pClear = await settle(handle.clear());
  store.n = 2;
  await tick(80);
  row(
    '12 newer record: edit, pagehide, save(), rehydrate(), clear(), edit',
    s,
    reports,
    `reports after the edit and pagehide: ${afterHide}; save() ${pSave}; rehydrate() ${pRe}; clear() ${pClear}; lastError ${handle.lastError?.operation ?? null}`,
  );
});

await run(
  '12b blocked handle unblocked by a rehydrate after a corrected record',
  async () => {
    const s = mem(v(2, {n: 7}));
    const {store, handle, reports} = open(s, {n: 0}, {version: 1});
    await handle.hydrated;
    store.n = 1; // edit while blocked
    await tick();
    s.data.set('k', JSON.stringify(v(1, {n: 8})));
    const pRe = await settle(handle.rehydrate());
    await tick();
    const n = store.n;
    store.n = 9;
    await tick();
    row(
      '12b edit while blocked, the record becomes v1, rehydrate(), edit',
      s,
      reports,
      `rehydrate() ${pRe}; store n after rehydrate ${n} (the edit made while blocked was 1)`,
    );
  },
);

await run('13 first read fails (getItem throws), then an edit', async () => {
  const s = mem(v(1, {n: 7}));
  let fail = true;
  const get = s.storage.getItem;
  s.storage.getItem = (k: string) => {
    if (fail) {
      fail = false;
      throw new Error('read failed');
    }
    return get(k);
  };
  const {store, handle, reports} = open(s, {n: 0}, {version: 1});
  await handle.hydrated;
  store.n = 1;
  await tick();
  row('13 first read throws, then an edit', s, reports);
});

await run('14 record too deep to restore', async () => {
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let i = 0; i < 30000; i++) deep = deep.x = {};
  const s = mem(`{"version":1,"state":{"a":1,"b":${JSON.stringify(root)}}}`);
  const {store, handle, reports} = open(s, {a: 0, b: {}}, {version: 1});
  await handle.hydrated;
  store.a = 2;
  await tick();
  row(
    '14 record too deep to restore, then an edit',
    {
      raw: () => `${s.raw().slice(0, 40)}... (${s.raw().length} chars)`,
    } as never,
    reports,
    `store a=${store.a}`,
  );
});

await run('15 storage event with a lower version, migrate', async () => {
  const s = mem(v(2, {n: 1}));
  const {store, handle, reports} = open(
    s,
    {n: 0},
    {version: 2, syncTabs: true, migrate: up},
  );
  await handle.hydrated;
  s.data.set('k', JSON.stringify(v(1, {old: 5})));
  globalThis.dispatchEvent(
    Object.assign(new Event('storage'), {key: 'k', newValue: s.data.get('k')}),
  );
  await tick();
  row(
    '15 a v1 record arrives from another tab, v2 handle with migrate',
    s,
    reports,
    `store n=${store.n}; writes ${s.writes}`,
  );
  handle.dispose();
});

await run('16 onError throws', async () => {
  const s = mem('{not json');
  open(
    s,
    {n: 0},
    {
      onError: () => {
        throw new Error('handler bug');
      },
    },
  );
  await tick();
  row('16 onError throws', s, ['(see console.error)']);
});
```

### `no-onerror.ts`

```ts
// No onError: a newer record is reported to console.error and kept.
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {persist} = await import(`${SRC}/utils/index.ts`);
const data = new Map([['k', JSON.stringify({version: 2, state: {n: 7}})]]);
const storage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
};
const logged: string[] = [];
console.error = (e: unknown) => void logged.push(String(e));
const store = createClassyStore({n: 0});
persist(store, {name: 'k', storage, version: 1});
store.n = 1;
await new Promise((r) => setTimeout(r, 5));
for (const bad of [-1, Number.NaN, '1']) {
  try {
    persist(createClassyStore({n: 0}), {
      name: 'x',
      storage,
      version: bad as number,
    });
    logged.push(`version ${String(bad)} accepted`);
  } catch (e) {
    logged.push(`version ${String(bad)}: ${(e as Error).message}`);
  }
}
console.log(JSON.stringify(logged, null, 1), '\nstorage:', data.get('k'));
```

### The reviewers' scripts, copied unchanged

`downgrade-p5.ts` and `version-float.ts` take `SRC=<tree>/packages/classy-store/src`;
`onerror-clear.ts` and `skip-hydration.ts` take the tree root as their first
argument.

```ts
// An older app (version 1) loads a record written by a newer app (version 2),
// and makes no edit.
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {persist} = await import(`${SRC}/utils/index.ts`);
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
mem.set(
  'app',
  JSON.stringify({version: 2, state: {items: ['milk', 'eggs'], tags: ['x']}}),
);
const seen: unknown[] = [];
class Old {
  todos: string[] = [];
}
const store = createClassyStore(new Old());
const handle = persist(store, {
  name: 'app',
  storage,
  version: 1,
  migrate: (state: any, from: number) => {
    seen.push(from);
    return from === 0 ? {todos: state.list ?? []} : state;
  },
  onError: (e: unknown, op: string) => seen.push(['onError', op]),
});
await handle.hydrated;
await new Promise((r) => setTimeout(r, 20));
console.log(
  'migrate saw',
  JSON.stringify(seen),
  '| storage, no edit made:',
  mem.get('app'),
);
```

```ts
// The app's own configured version is not an integer (1.1). A record that this
// same app saved is loaded in the next session, then the user edits once.
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/index.ts`);
const {persist} = await import(`${SRC}/utils/index.ts`);
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
mem.set('app', JSON.stringify({version: 1.1, state: {notes: ['precious']}}));
const errors: string[] = [];
const store = createClassyStore({notes: ['default']});
let h: any;
try {
  h = persist(store, {
    name: 'app',
    storage,
    version: 1.1,
    onError: (e: unknown) => errors.push(String(e)),
  });
} catch (e) {
  console.log('persist() threw:', String(e));
  process.exit(0);
}
await h.hydrated;
console.log('restored:', JSON.stringify(store.notes), 'reports:', errors);
store.notes.push('edit');
await h.save();
console.log('storage after one edit:', mem.get('app'));
```

```ts
// Decision 21 advises: "An application that prefers to lose the old record
// calls clear() there" (in onError). With decision 19 the read is synchronous.
const wt = process.argv[2];
const {createClassyStore} = await import(
  `${wt}/packages/classy-store/src/index.ts`
);
const {persist} = await import(
  `${wt}/packages/classy-store/src/utils/index.ts`
);
const data = new Map<string, string>([['k', '{not json']]);
const storage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
};
const store = createClassyStore({count: 0});
let seen = 'onError not called';
const handle = persist(store, {
  name: 'k',
  storage,
  onError: (error: unknown, op: string) => {
    seen = `onError(${op}) called before persist() returned: ${typeof handleRef === 'undefined'}`;
    try {
      handle.clear();
      seen += '; clear() ran';
    } catch (e) {
      seen += `; clear() threw ${(e as Error).constructor.name}`;
      throw e; // as the application's own code would: nothing catches it
    }
  },
});
var handleRef = handle;
console.log('right after persist():', seen);
await new Promise((r) => setTimeout(r, 10));
console.log('after a turn:          ', seen);
console.log('record still in storage:', data.get('k'));
```

```ts
// Rule 10 lists when a record is replaced. A handle with skipHydration has
// read nothing, so it cannot know a record is newer or unmigrated.
const wt = process.argv[2];
const {createClassyStore} = await import(
  `${wt}/packages/classy-store/src/index.ts`
);
const {persist} = await import(
  `${wt}/packages/classy-store/src/utils/index.ts`
);
const newer = JSON.stringify({
  version: 2,
  state: {count: 41, extra: 'from v2'},
});
const data = new Map<string, string>([['k', newer]]);
const storage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
};
const store = createClassyStore({count: 0});
const handle = persist(store, {
  name: 'k',
  storage,
  version: 1,
  skipHydration: true,
  onError: (e: unknown, op: string) => console.log('onError', op),
});
store.count = 1; // an edit before the app calls rehydrate(), e.g. on mount
await new Promise((r) => setTimeout(r, 10));
console.log('record after one edit:', data.get('k'));
await handle.rehydrate();
console.log('after rehydrate(): count', store.count);
```

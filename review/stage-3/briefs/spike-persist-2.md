# Brief: the `persist` rules as decided, built once

- **Report:** `review/stage-3/spike-persist-2.md`
- **Scratch folder:** `<scratch>/stage-3-spike-persist-2/`
- **Spikes:** yes, as the common brief (`review/stage-3/briefs/COMMON.md`)
  describes. Read that file first.

## Why this spike exists

Decisions 19 and 21 to 24 of `review/stage-3-decisions.md` say what
`persist` does with a stored record. Three rounds of adversarial review each
found a way to lose stored data in them, and the rules were changed after
each round without being built. This spike builds the rules as they stand
after the third round, so that their bytes, their tests and their
contradictions are known before stage 4.

Start from `combo.patch` of `review/stage-3/persist-devtools.md` (P1 to P8
together) on a worktree at `57404c3`. Read P1 to P5 there, decisions 19 and
21 to 26 and guarantee rule 10 of the decision document, and the objections
that led here: `adversarial-edges.md` 1, 6 and 20; `adversarial-2-whole.md`
1, 2, 6 and 11; `adversarial-3.md` 2, 3, 4, 7, 8 and 9. The reviewers'
scripts are in `<scratch>/stage-3-adversarial-2-whole/` (`downgrade-p5.ts`,
`version-float.ts`) and `<scratch>/stage-3-adversarial-3/repro/`
(`onerror-clear.ts`, `skip-hydration.ts`). Copy them; do not write to those
folders.

## The rules to build

Where this list and the decision document differ, this list is newer.

1. **Three kinds of record that is read and not restored.**
   - _Nothing to keep_: not JSON; an envelope that is not an object; a
     `state` that is not a plain object; a version that is not a finite
     number of zero or more; an `expiresAt` that is neither a number, `null`
     nor missing. Reported as `'parse'`. The next save replaces it.
   - _A lower version with no `migrate`_: not used, **not reported**, and
     the next save replaces it. This is the documented way to discard an old
     format (`PERSIST_TUTORIAL.md`, "Migration runs only when…").
   - _From a newer version_ (its version is above the configured one):
     `migrate` is not called. Reported as `'parse'`. The handle does not
     write while it is there.
   - _Not migrated or not restored_: `migrate` threw, or returned a thenable
     or something that is not a plain object; `merge` threw or returned
     something that is not a plain object; a `deserialize` threw; the
     restore was rolled back (P4). Reported as `'parse'`. The handle does
     not write while it is there.
2. **A handle that does not write.** It saves nothing on an edit, on
   `pagehide` or on `save()`. An edit does not repeat the report. `save()`
   reports as `'write'` and rejects with that error. It writes again after
   `clear()`, after a `rehydrate()` that restores a record or finds none or
   finds one with nothing to keep, and after such a record arrives from
   another tab. A `rehydrate()` that again finds a record of the last two
   kinds reports and rejects.
3. **A handle writes only after it has read.** With `skipHydration`, nothing
   is saved until the first `rehydrate()` has settled: an edit made before
   that stays in the store and is saved afterwards if the handle may write.
   `save()` before it rejects, with a report. With a storage that returns a
   promise, an edit made while the first read is in flight is kept in the
   store, and saved once the read has restored a record or found none or
   found one with nothing to keep. `clear()` works at any time.
4. **Versions.** A version is a finite number, zero or above. A record with
   no `version` field counts as version 0. `migrate` is called only for a
   lower version.
5. **Checked when `persist()` is called**, with a `TypeError` thrown before
   anything is read or written: a `version` option that is not a finite
   number of zero or more; a `migrate` that is a native `async` function;
   and P3's checks.
6. **`onError`.** It receives the handle as a third argument, so that it can
   call `clear()` even when the report comes while `persist()` is still
   running (decision 19 makes the first read synchronous for a synchronous
   storage). An error thrown by `onError` is logged with `console.error`,
   not swallowed. When no `onError` is given, a report goes to
   `console.error`.
7. **Nothing is written back at load, with one exception.** A migrated
   record is not written back: the first save writes it, as today (this
   reverses the first half of P5). A record that was restored without a
   migration, has no `expiresAt` or `null`, and is read by a handle with
   `expireIn`, is written back with an `expiresAt` through the ordinary save
   path. A record that arrives from another tab is never written back.
8. **Expiry comes first.** A record whose time has elapsed is expired
   whatever its version.
9. P5's `pagehide` flush, P4's all-or-nothing restore, P6 and P8 stay as
   they are in `combo.patch`.

## What to find out

1. **Does it hold together?** Build it. Where two rules cannot both be
   built as written, stop and say which, with the smallest change that
   resolves it. Do not pick silently.
2. **A table of paths**, each run: a first install; an upgrade with a
   `migrate`; a `migrate` that throws, then an edit, then a corrected
   release; a `migrate` that returns a wrong result; a version raised with
   no `migrate`; a rollback of a deployment (a newer record, an older
   handle), with and without an edit; two tabs on different versions with
   and without `syncTabs`; `skipHydration` with an edit before
   `rehydrate()`; an asynchronous storage with an edit during the first
   read, for each kind of record; a record that expired, of each version;
   `clear()` from `onError` on a synchronous and on an asynchronous storage;
   `save()` and `rehydrate()` on a handle that does not write. For each: what
   is in storage afterwards, what was reported, what the promises did.
   Include the reviewers' four scripts.
3. **Is there a path on which stored data is lost, or on which the handle
   never saves again and nothing tells the application?** List every one you
   find, also the ones the rules accept on purpose.
4. **Tests.** The unit suite against the 15 failures of `combo.patch`, each
   new or missing failure classed as the common brief says. The typecheck.
   Name the tests that pin today's `skipHydration` and write-back behaviour.
5. **Size.** `bun run size`: what `./utils` adds, against `combo.patch`
   (3,396) and today (2,686), with the bytes of each rule where you can
   separate them.
6. **The public types** that change: `onError`, `PersistOptions`,
   `PersistHandle`, `PersistStatus`. Write each out.
7. **Recommendation** for each rule: keep, change (how), or drop, and what
   the guide has to say. Say plainly where a rule above is wrong.

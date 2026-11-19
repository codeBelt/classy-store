# Stage 2 report: library comparison

Stage 2 of the pre-1.0 review, 2026-11-18 to 2026-11-19. No library source
was changed. Every commit of this stage adds a report under `review/stage-2/`
or updates the plan, and all of them are pushed to `release/1.0`.

## Summary

- **Reports:** eleven, one per row of the table under "How the work was
  done". Nine compare us with other libraries, one reviews our five adapters
  and one is a security review of `persist`, `devtools` and the release
  workflow.
- **Agreement:** six changes are each reached by three or more reports
  independently. They are listed under "Where the reports agree". Four of
  them are on stage 1's list for stage 3, and three of those four now have a
  sketch that fixed its reproductions.
- **New defects and gaps:** twenty-three that stage 1 did not have, under
  "Defects and gaps new in stage 2". I re-ran ten of them myself and they
  reproduce.
- **API questions:** the eight questions of the plan each have an answer from
  every library that has one, under "The eight API questions", with where I
  lean. Stage 3 decides.
- **Nothing here is decided or implemented.** Every sketch ran against its own
  reproduction only. The stage rules forbid running the repository's suites
  against a changed copy, so no sketch is a tested change.

## Where the reports agree

Each row is a change that several reports reach independently. "Sketch" means
an agent applied the change to a throwaway copy of `src/` and re-ran its
reproductions.

| Change                                                                                                                             | Who does it                                                                                                                                                                                             | Stage 1 findings it bears on | Evidence                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Return a stored function as it is. Bind and group only methods found on a prototype                                                | Valtio (V2), Vue (4), Solid (3) and Svelte (3) return it as it is. MobX wraps it once, when it is written, and its report proposes caching one wrapper per function (9). No library wraps on every read | 5, 6, 42, 62                 | Vue sketch B: 20 lines added, 7 removed, fixed 5, 6, 7, 9, 10 and 42 together                                                   |
| Treat `Object.defineProperty` with a data descriptor as a write                                                                    | Vue (6), Solid (7), Svelte (2), MobX (10)                                                                                                                                                               | 1, 45, 61, 66, 71            | Svelte's sketch, 24 lines added and 9 removed, fixed 1, 45, 66 and 71. What to do with other descriptors is disputed: see below |
| Add `has` and `ownKeys` traps, with a dependency on the set of keys                                                                | Vue (1), Solid (6), Svelte (4), MobX (10)                                                                                                                                                               | 29, 30, 31, 41               | Vue sketch A fixed 29 and 30 on the live store. On a snapshot it cannot be separated from API question 3                        |
| A delete that removes nothing is not a change                                                                                      | Vue (5), Svelte (5), Immer (5)                                                                                                                                                                          | 29                           | Svelte sketch                                                                                                                   |
| Deliver to subscribers from one queue: a write made during delivery is queued, a removed subscriber is skipped, 100 rounds at most | MobX (5), Preact Signals (8), Vue (9), Svelte (11). Zustand skips a removed subscriber (Zustand and Jotai 9)                                                                                            | 18 to 23                     | Read and ported, not sketched on ours                                                                                           |
| A class getter is not an enumerable own property of a snapshot                                                                     | Valtio (V4), MobX, Vue, Solid, Svelte, Immer. None turns an inherited getter into an own enumerable accessor of a copy                                                                                  | 30, 31                       | Ports in each report. On ours, `Object.keys(store)` is `a,b` and `Object.keys(snapshot(store))` is `a,b,entryCount`             |

Three more points have fewer voices and one clear result each:

- **Ownership.** Valtio has no weak references, no suspend and resume and no
  pointer to a detached parent. It gives the same answers as ours in every
  detached-subtree case that was ported except one (defect 5 below), and it
  returns from the read that hangs ours (stage 1 finding 66). This supports stage 1 finding 72: the walk
  to a detached parent can go (Valtio V1).
- **Getters.** A stamp on each cached getter, holding its node's version,
  makes a clean read constant. Recording each property once per run removes
  duplicate dependencies. Both are about ten lines (Signals 1 and 3, MobX 3).
  A thrown error should be cached with its dependencies, and never when it
  recorded none (MobX 2, Signals 4).
- **A development build.** MobX, Vue, Solid, Svelte and Immer all compile
  their diagnostics out of production, and Solid, Svelte and Immer give each
  one a stable code. The TC39 polyfill shows the trap: its production error
  is empty. Keep the message text in production and drop only the extra
  checks (MobX 7, Solid 8 and 9, Svelte 11, Signals question 8).

Corrected on 2026-11-19: the first row said that no library wraps a stored
function. The stage 3 merge (`review/stage-3/merged.md`, contradiction 9)
pointed out that MobX wraps one once.

## Where the reports disagree

- **Signals corrects MobX.** MobX finding 3, step 1, proposes revalidating a
  nested getter by refreshing it and comparing its value. For us that gives a
  stale result, because a getter can return a live store node: with
  `get first() { return this.rows[0] }` and
  `get firstPrice() { return this.first.price }`, `firstPrice` stays 1 after
  `rows[0].price = 2`. The comparison must include the node version of the
  value (Signals 2). Stage 3 should read the two reports together.
- **Opt-in or opt-out for nested class instances.** Valtio, Vue, Solid and
  Legend-State wrap an object unless told not to. MobX, Svelte and Immer
  leave a class instance alone unless the class says otherwise, as we do. The
  cost of our side is silent (defect 1 below); the cost of theirs is a
  `TypeError` on `#private` fields.
- **Native `Map` and `Set`.** Vue makes them reactive in place, and
  Legend-State observes them (read, not run). MobX replaces
  them with its own classes on assignment. Valtio, Solid and Svelte leave
  them alone and offer separate classes, as we do. Immer drafts them through a
  subclass. No library has a frozen native `Map`: a frozen `Map` can still be
  written through `Map.prototype.set`, which is why ours are array-backed.
- **The Proxy target.** Solid (5) and Immer (2) give the Proxy a target of
  their own, so a frozen or read-only user object never meets a Proxy
  invariant. Ours targets the raw object, which is behind stage 1 findings 46
  and 49 and the read-only case in `linkChild`. Both reports call it a large
  change and a design question, not a fix.
- **Descriptors that are not a plain write.** Svelte and Immer throw a named
  error for an accessor or a read-only descriptor, and for `setPrototypeOf`.
  The Immer report proposes we do the same (Immer 3), which would settle
  stage 1 findings 47 and 48 too. The Svelte report proposes we do not: they
  must refuse what they cannot store, and we store everything on the target
  (Svelte 2).
- **Freezing through the store.** MobX and Svelte throw on
  `Object.freeze(store)`. The MobX report suggests we do the same, which
  would remove the read-only branch of our `defineProperty` trap and stage 1
  findings 61, 66 and 67 with it (MobX 10). The Svelte and Immer reports keep
  it working: the calls `Object.freeze` makes to the trap carry no `value`,
  `get` or `set`, so they can be told apart (Immer 3). We added freezing on
  purpose in `f8a012f`, so removing it is a breaking change to decide before
  1.0.
- **Whether `subscribe()` should be synchronous by default.** See question 1
  below.

## The eight API questions

"Lean" is where I would start stage 3 from. It is not a decision.

| Question                                        | What the libraries say                                                                                                                                                                                                                                                        | Lean                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Synchronous `subscribe()` by default         | MobX, Preact, Legend-State, Zustand and Jotai notify synchronously. The first two group by a transaction; Zustand and Jotai make a write of several fields one call. Valtio, Solid and Svelte: no. Vue: synchronous underneath, grouped at the surface, which is what we have | Keep the batched default and `{sync: true}` for bindings. A direct property write has no unit that groups two fields, so the microtask is what gives `store.a = 1; store.b = 2` one notification. Say so at the top of the API reference, because users of five of these libraries expect synchronous delivery. Fix delivery first (stage 1 findings 18 to 23)     |
| 2. Writes outside a method, and `batch()`       | Allowed everywhere except Solid, which ignores them. Only MobX warns, in development. The MobX, Vue, Signals, Legend-State, Zustand and Jotai, and adapters reports say `batch()` belongs. Solid and Svelte note it exists only because bindings are synchronous              | Keep both, with no warning for a write outside a method. Make `batch()` refuse a promise (defect 20). Add a development warning when a synchronous listener is called many times in one task, and name `batch()` in the guides                                                                                                                                     |
| 3. Snapshot getters as enumerable own accessors | No library does this. MobX defines them as not enumerable. Valtio, Vue, Solid and Immer leave them on the prototype                                                                                                                                                           | Change it before 1.0, because `Object.keys`, spread and `JSON.stringify` of a snapshot are visible behaviour. Stage 3 spikes two forms: own and not enumerable, or one derived prototype per class (Valtio V4, Immer question 3)                                                                                                                                   |
| 4. Arrow-function methods and `#private` fields | Only MobX and Svelte make them work, by never wrapping the instance. A base class whose constructor returns the store makes arrow methods notify on our library as it is (MobX script 10, Vue port 8, Svelte 1). `#private` cannot be state                                   | Spike the base class in stage 3. It depends on `defineProperty` being a write. Document that a `#private` field is never state, since a snapshot cannot copy it                                                                                                                                                                                                    |
| 5. Native `Map` and `Set` reactive directly     | Vue yes, Legend-State yes (read, not run), MobX by replacement, the rest no                                                                                                                                                                                                   | Keep `reactiveMap` and `reactiveSet`. Warn in development when a native one is placed in a store. Look at native storage behind the live side: a lookup among 10,000 entries took 17 nanoseconds in Svelte and 45 microseconds in ours (Svelte 8)                                                                                                                  |
| 6. Opt-in or opt-out for nested class instances | Four wrap by default: Valtio, Vue, Solid, Legend-State. Three do not: MobX, Svelte, Immer                                                                                                                                                                                     | Keep `PROXYABLE` as opt-in. Opt-out would make snapshots of a class with `#private` fields throw, and needs a marker kept outside the object (Vue question 6). Add a development warning when an unmarked class instance is placed in a store                                                                                                                      |
| 7. Entry points and adapter names               | Entry points are consistent. Names follow each framework's idiom except Solid, where `use*` means a context lookup                                                                                                                                                            | Rename the Solid adapter to `fromClassyStore`. Add `{injector}` to the Angular adapter. Type the Vue ref as read-only. Keep the other adapter names. Two option names to settle before 1.0, since both break later: `isEqual` against `equalityFn`, which Zustand and Jotai both use, and whether `storage` in `persist` defaults to `localStorage` as theirs does |
| 8. Development diagnostics                      | Listed per library in each report. The security report adds validation of `persist` options, and the Zustand and Jotai report lists what `persist` and `devtools` should say out loud                                                                                         | A development build with stable codes, decided as one item in stage 3 with its size cost measured                                                                                                                                                                                                                                                                  |

## Defects and gaps new in stage 2

None is fixed. "Re-run" means I ran the case myself after the agent reported
it, against the library source, which this stage did not change.

**Core**

1. **A method on a nested class instance without `PROXYABLE` changes state and
   notifies no one.** The snapshot keeps its identity while its content
   changes (Solid 4, Vue port 7). Re-run: count 1, no call to a synchronous
   subscriber, same snapshot object.
2. **A clean read of getters arranged as a diamond doubles in cost per
   level.** Two getters per level, each reading both below (Signals 1, MobX
   3). Re-run: 27 microseconds at depth 8, 24.8 milliseconds at depth 20. A
   plain chain of getters does not show it.
3. **A getter that reads `this.rows[i]` in a loop records every read.** 2,000
   dependencies for 1,000 rows (Signals 3). Re-run: a clean read costs 28
   microseconds, against 0.12 when the getter reads `this.rows` once into a
   local.
4. **A plain object from another realm is opaque.** One made in an iframe or a
   Node `vm` context is kept by reference: writes to it notify no one and its
   snapshot is not frozen (Immer 6). Re-run with `vm.runInNewContext`.
5. **A subscription on a container that has left the store stops being called
   once the garbage collector runs**, if the caller kept only one of its rows
   (Valtio V1).
6. **`has()` on a snapshot of a collection with 10,000 members costs about 245
   microseconds** (Valtio V10).
7. **The cause of stage 1 finding 37 is one line.** `evaluateSnapshotGetter`
   overwrites the memo map that nested getters filled, on a target's first
   getter read (Signals 6).

**Adapters**

8. **Every adapter builds a snapshot per direct write** (adapters A1). Re-run
   with a synchronous subscriber that takes a snapshot: 2,000 row writes take
   639 milliseconds, against 2.7 with no subscriber and 3.8 inside `batch()`.
9. **The Vue adapter leaks one subscription per server render** (adapters V1).
10. **The Angular adapter drops a store write made inside a `computed`**
    (adapters N1). `untracked()` around the `set` fixes it.
11. **The Angular adapter has no `injector` option and a misleading error
    outside an injection context** (adapters N2).

**Persist, devtools and the release workflow**

12. **A deeply nested stored record bricks the store.** At a depth of 16,000
    to 18,000 on Bun, restore succeeds, then every snapshot and every save
    throws, so the record is never replaced (security 3).
13. **A nested `__proto__` key survives restore** as an own data key and is
    written back on the next save (security 2). The store's prototype cannot
    be swapped through `persist`, which settles stage 1 finding 48 (security
    1).
14. **Records that `persist` cannot read are skipped without a report**
    (security 4, Zustand and Jotai 3). Re-run for a stored version that
    differs from `version` with no `migrate`: nothing is restored, `onError`
    is not called and nothing is logged. Also: **a version that is not a
    number counts as version 0** (security 5), and **with `expireIn` set, a
    record without a usable `expiresAt` never expires** (security 6).
15. **DevTools time travel adds unknown fields, never deletes missing ones,
    and calls setter-only accessors** (security 7). A jump notifies a
    synchronous subscriber once per field, a `Date` comes back as a string,
    every entry is named `STORE_UPDATE`, and `RESET`, `COMMIT`, `ROLLBACK` and
    `IMPORT_STATE` are ignored (Zustand and Jotai 6 and 7).
16. **Cross-tab sync applies events from another storage area, and synthetic
    events, under the same key** (security 8).
17. **The release job gives every installed dependency the npm publishing
    identity** (security 12). One job holds `id-token: write`, then runs
    `bun install`, the build and Changesets before `npm publish`. Actions are
    pinned by major tag. I read `release.yml` and it is as described. The
    proposal is a publish-only job that holds the token, actions pinned by
    commit, and `permissions: contents: read` on the three workflows that
    declare none.

**From the two API reads**

18. **`persist()` reads through an `await` even when the storage is
    synchronous** (Legend-State 4). A store on `localStorage` holds its
    defaults when `persist()` returns and the saved state a microtask later,
    so it renders defaults first. Legend-State has the stored value at once.
    Re-run with a synchronous storage: 0 after `persist()` returns, 7 after
    `hydrated` resolves. This belongs with the decision on `skipHydration`.
19. **A debounced save is lost when the tab closes** (Legend-State 5).
    `debounce` has no flush on `pagehide` or `visibilitychange`. Read in the
    code; no page unload was tested.
20. **`batch()` given an `async` function groups only the writes before its
    first `await`**, and hands back the promise as if it had worked
    (Legend-State 3). Re-run: one notification when `batch()` returns, two
    more after.
21. **A store written between the server render and hydration raises React's
    hydration error unless `prepareStoreForHydration` was called** (Zustand
    and Jotai 1). Zustand needs no call, because its hook reads the store's
    initial state as the server snapshot. The proposal is to capture the
    initial snapshot without being asked. Run in happy-dom, not in a browser.
22. **An `async` `migrate` makes `persist` restore nothing and report
    nothing** (Zustand and Jotai 3). Re-run: `migrate` is called once, the
    store keeps its default, `onError` is not called and nothing is logged.
23. **A migrated record is not written back**, so the migration runs on every
    load until the first edit (Zustand and Jotai 4). Re-run: after a restore
    that migrates version 1 to 2, the stored record still says version 1.

## What only the owner can do

Security finding 12 has two steps outside the repository: a GitHub environment
for the publish job with the owner as required reviewer, and the npm settings
that accept only that environment and refuse publishing with a token. The
workflow changes themselves are ordinary commits for stage 4, if approved.

## What stage 3 should do first

In this order, because each later item builds on the one before it:

1. **Merge the eleven reports into one list**, keyed by stage 1 finding where
   there is one. Several fixes are proposed three or four times in different
   words.
2. **Run each sketch against the repository's suites.** Stage 2 could not.
   Five are small and overlap: functions left unwrapped (Vue sketch B),
   `defineProperty` as a write (Svelte), `has` and `ownKeys` (Vue sketch A),
   the getter stamp (Signals), and delete of a missing key. The count of
   failing tests per sketch says which pinned behaviours each one changes.
3. **Decide API question 3 together with the key traps.** They cannot be
   separated: with enumerable own getters, a getter that lists the keys of
   `this` on a snapshot counts the getters too.
4. **Spike `ownership.ts` without the walk to a detached parent** (stage 1
   finding 72, Valtio V1), and decide the hang (finding 66) there.
5. **Spike the snapshot rebuild that copies the previous array and recomputes
   only changed indices** (Immer 1). The measured floor is 6 microseconds
   against 56 on Node for 1,000 rows. On Bun the gain is bounded, because
   freezing a new 1,000-element array costs about 95 microseconds alone. This
   also sets what the adapters can do about defect 8.
6. **Spike the base class for arrow-function methods** (question 4), after
   item 2's `defineProperty` change.
7. **Cost a development build**: bytes per entry, and which of the proposed
   warnings it would hold.
8. **Decide `persist` as one group**, because its items touch the same few
   functions and three of them change documented behaviour: when hydration
   happens (defects 18 and 21, `skipHydration`), what is reported (14, 22),
   what is validated when `persist()` is called (security 1), the write-back
   after a migration (23), and a flush when the page is hidden (19).

## How the work was done

| Report                             | Read                                                                                       | Model                   | Lines | Commit    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------- | ----: | --------- |
| `review/stage-2/valtio.md`         | Valtio 2.3.2, commit `15c64d4`; `proxy-compare` 3.0.1                                      | Fable                   | 3,134 | `ac38f2f` |
| `review/stage-2/mobx.md`           | MobX 7.1.7, commit `f8cf513`                                                               | Fable                   | 3,651 | `ac38f2f` |
| `review/stage-2/vue-reactivity.md` | `@vue/reactivity` 3.5.45, commit `8b479a8`                                                 | Fable                   | 2,958 | `ac38f2f` |
| `review/stage-2/solid.md`          | `@solidjs/signals` 2.0.0, commit `a8186e6`                                                 | Fable                   | 2,811 | `ac38f2f` |
| `review/stage-2/svelte.md`         | Svelte 5.57.3, the installed copy                                                          | Fable, finished by Opus | 2,545 | `12fe57d` |
| `review/stage-2/signals.md`        | `@preact/signals-core` 1.14.5, commit `30a797e`; `signal-polyfill` 0.2.3, commit `958ad56` | Fable, finished by Opus | 3,363 | `04bd91d` |
| `review/stage-2/immer.md`          | Immer 11.2.10, commit `16589b9`                                                            | Fable, finished by Opus | 2,476 | `04bd91d` |
| `review/stage-2/adapters.md`       | Our five adapters; React 19.3.1, Vue 3.5.45, Svelte 5.57.3, Solid 2.0.0, Angular 22.2.6    | Fable, finished by Opus | 1,932 | `912a3e2` |
| `review/stage-2/security.md`       | `persist`, `devtools`, `history`, the workflows, the packed tarball, `proxy-compare`       | Opus                    |   823 | `c59084e` |
| `review/stage-2/legend-state.md`   | `@legendapp/state` 2.1.15, commit `02032f3`, and 3.0.0-next.1, commit `2676125`            | Sonnet at high effort   | 1,442 | `cd6a73f` |
| `review/stage-2/zustand-jotai.md`  | Zustand 5.1.0, commit `9fed2eb`; Jotai 3.0.2, commit `9de9377`                             | Sonnet at high effort   | 1,540 | `2a43f72` |

Each report records the files it read, has the ported tests and their output
in an appendix, and ends with what was run and what was only read. The plan
asks each library agent for five to ten ported tests, and every library
report has at least that many.

**One departure from the plan.** Four reads began on Fable and were cut off
when the usage limit was reached. Each was finished by an Opus agent that
reused the first agent's clone and ports and re-ran them. The security review
ran on Opus from the start. The plan allows Opus to stand in for Fable when
usage is short, except on the three core files, and stage 2 changes no file.

## Verified and not verified

**Verified:**

- Each report passes `biome check`, names the version and commit it read, and
  has the sections the plan asks for.
- I re-ran defects 1, 2, 3, 4, 8, 18, 20, 22 and 23, and the version case
  of 14. All ten reproduce. The scripts and their output are in the appendix.
- I read `release.yml` against security finding 12.

**Not verified:**

- Every other claim in the eleven reports is the agent's, with its own
  reproduction in its appendix. I did not re-run them.
- No sketch was run against the repository's suites, by the stage rules. A
  sketch that fixes its reproduction may still break a pinned test.
- Timings were taken while other agents were running on the same machine.
  They show the shape of a cost, not a baseline.
- Not run anywhere: Svelte 4, React 18 and Vue 3.2 (not installed), Angular on
  the server, and the depth limits of security finding 3 in a browser.
- The claim in security finding 12 that code running in the release job can
  take the publishing token comes from how GitHub and npm document the
  mechanism. Nobody tried it.

Scratch folders, which a reboot can clear: each report names its agent's.
Mine is
`/private/tmp/claude-501/-Users-robertparallax-WebstormProjects-classy-store/9c8c2bbd-bb57-4b12-aa7b-9d06972e3fdd/scratchpad/stage-2-spot/`.

## Appendix: the re-runs

Run with `bun <file>` on Bun 1.4.4, on a machine that was also running other
agents. Each script imports the library source by absolute path.

### `spot.ts`: defects 1, 3, 4 and 8

The first block is a plain chain of getters, which does not show defect 2. The fourth block reproduces stage 1 finding 31, not a new defect.

```ts
import vm from 'node:vm';
import {
  batch,
  createClassyStore,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';

const time = (run: () => void) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

// 1. Signals finding 1: a clean read of a ladder of getters.
function ladder(depth: number) {
  const target: Record<string, unknown> = {base: 1};
  for (let level = 1; level <= depth; level++) {
    const below = level === 1 ? 'base' : `g${level - 1}`;
    Object.defineProperty(target, `g${level}`, {
      get() {
        return (this as Record<string, number>)[below] + 1;
      },
      enumerable: true,
      configurable: true,
    });
  }
  return createClassyStore(target);
}
console.log('## 1. clean read of the top of a getter ladder');
for (const depth of [5, 10, 15, 18, 20]) {
  const store = ladder(depth) as Record<string, number>;
  store[`g${depth}`]; // first read computes
  const ms = time(() => store[`g${depth}`]);
  console.log(
    `depth ${depth}: ${ms.toFixed(3)} ms, value ${store[`g${depth}`]}`,
  );
}

// 1b. the same ladder as class getters
class Ladder {
  base = 1;
  get g1() {
    return this.base + 1;
  }
  get g2() {
    return this.g1 + 1;
  }
  get g3() {
    return this.g2 + 1;
  }
  get g4() {
    return this.g3 + 1;
  }
  get g5() {
    return this.g4 + 1;
  }
  get g6() {
    return this.g5 + 1;
  }
  get g7() {
    return this.g6 + 1;
  }
  get g8() {
    return this.g7 + 1;
  }
  get g9() {
    return this.g8 + 1;
  }
  get g10() {
    return this.g9 + 1;
  }
  get g11() {
    return this.g10 + 1;
  }
  get g12() {
    return this.g11 + 1;
  }
  get g13() {
    return this.g12 + 1;
  }
  get g14() {
    return this.g13 + 1;
  }
  get g15() {
    return this.g14 + 1;
  }
  get g16() {
    return this.g15 + 1;
  }
}
{
  const store = createClassyStore(new Ladder());
  store.g16;
  const clean16 = time(() => store.g16);
  store.g8;
  const clean8 = time(() => store.g8);
  console.log(
    `class ladder: clean g8 ${clean8.toFixed(4)} ms, clean g16 ${clean16.toFixed(4)} ms`,
  );
}

// 2. Adapters A1: 2,000 direct writes with a sync subscriber that snapshots.
console.log('\n## 2. 2,000 row writes, sync subscriber that takes a snapshot');
const makeRows = () =>
  createClassyStore({
    rows: Array.from({length: 2000}, (_, id) => ({id, value: 0})),
  });
{
  const store = makeRows();
  const none = time(() => {
    for (const row of store.rows) row.value++;
  });
  console.log(`no subscriber: ${none.toFixed(1)} ms`);
}
{
  const store = makeRows();
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
      snapshot(store);
    },
    {sync: true},
  );
  const direct = time(() => {
    for (const row of store.rows) row.value++;
  });
  console.log(
    `sync + snapshot, direct writes: ${direct.toFixed(1)} ms, ${calls} calls`,
  );
  calls = 0;
  const grouped = time(() => {
    batch(() => {
      for (const row of store.rows) row.value++;
    });
  });
  console.log(
    `sync + snapshot, inside batch(): ${grouped.toFixed(1)} ms, ${calls} calls`,
  );
}

// 3. Solid finding 4: a method on a nested class instance without PROXYABLE.
console.log('\n## 3. nested class instance without PROXYABLE');
class Counter {
  count = 0;
  increment() {
    this.count++;
  }
}
{
  const store = createClassyStore({counter: new Counter()});
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  const before = snapshot(store);
  store.counter.increment();
  const after = snapshot(store);
  console.log(
    `count ${store.counter.count}, sync calls ${calls}, same snapshot ${before === after}, snapshot count ${after.counter.count}`,
  );
}

// 4. Vue finding 1: a getter that lists the entries of `this`, on a snapshot.
console.log(
  '\n## 4. getter that calls Object.entries(this), read on a snapshot',
);
class Bag {
  a = 1;
  b = 2;
  get entryCount() {
    return Object.entries(this).length;
  }
  get keyCount() {
    return Object.keys(this).length;
  }
}
{
  const store = createClassyStore(new Bag());
  console.log(
    `live: keyCount ${store.keyCount}, entryCount ${store.entryCount}`,
  );
  const snap = snapshot(store);
  console.log(`snapshot keys: ${Object.keys(snap).join(',')}`);
  try {
    console.log(`snapshot keyCount ${snap.keyCount}`);
  } catch (error) {
    console.log(`snapshot keyCount threw ${(error as Error).constructor.name}`);
  }
  try {
    console.log(`snapshot entryCount ${snap.entryCount}`);
  } catch (error) {
    console.log(
      `snapshot entryCount threw ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 60)}`,
    );
  }
}

// 5. Immer finding 6: a plain object from another realm.
console.log('\n## 5. a plain object from another realm');
{
  const foreign = vm.runInNewContext('({n: 1})') as {n: number};
  const store = createClassyStore({local: {n: 1}, foreign});
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  store.local.n++;
  const afterLocal = calls;
  store.foreign.n++;
  console.log(
    `write to local child: ${afterLocal} call; write to foreign child: ${calls - afterLocal} calls; snapshot frozen: local ${Object.isFrozen(snapshot(store).local)}, foreign ${Object.isFrozen(snapshot(store).foreign)}`,
  );
}

// 6. Signals finding 3: a getter that reads this.rows[i] in a loop.
console.log('\n## 6. getter that reads this.rows[i] in a loop, 1,000 rows');
class Table {
  rows = Array.from({length: 1000}, (_, id) => ({id, price: 1}));
  get totalIndexed() {
    let total = 0;
    for (let index = 0; index < this.rows.length; index++)
      total += (this.rows[index] as {price: number}).price;
    return total;
  }
  get totalLocal() {
    const rows = this.rows;
    let total = 0;
    for (let index = 0; index < rows.length; index++)
      total += (rows[index] as {price: number}).price;
    return total;
  }
}
{
  const store = createClassyStore(new Table());
  store.totalIndexed;
  store.totalLocal;
  const rounds = 2000;
  const indexed = time(() => {
    for (let round = 0; round < rounds; round++) store.totalIndexed;
  });
  const local = time(() => {
    for (let round = 0; round < rounds; round++) store.totalLocal;
  });
  console.log(
    `clean read: this.rows[i] ${((indexed / rounds) * 1000).toFixed(2)} µs, local rows ${((local / rounds) * 1000).toFixed(2)} µs`,
  );
}
```

Output:

```text
## 1. clean read of the top of a getter ladder
depth 5: 0.050 ms, value 6
depth 10: 0.003 ms, value 11
depth 15: 0.006 ms, value 16
depth 18: 0.005 ms, value 19
depth 20: 0.006 ms, value 21
class ladder: clean g8 0.0042 ms, clean g16 0.0142 ms

## 2. 2,000 row writes, sync subscriber that takes a snapshot
no subscriber: 2.7 ms
sync + snapshot, direct writes: 638.5 ms, 2000 calls
sync + snapshot, inside batch(): 3.8 ms, 1 calls

## 3. nested class instance without PROXYABLE
count 1, sync calls 0, same snapshot true, snapshot count 1

## 4. getter that calls Object.entries(this), read on a snapshot
live: keyCount 2, entryCount 2
snapshot keys: a,b,entryCount,keyCount
snapshot keyCount 0
snapshot entryCount 0

## 5. a plain object from another realm
write to local child: 1 call; write to foreign child: 0 calls; snapshot frozen: local true, foreign false

## 6. getter that reads this.rows[i] in a loop, 1,000 rows
clean read: this.rows[i] 28.42 µs, local rows 0.12 µs
```

### `diamond.ts`: defect 2

```ts
import {createClassyStore} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';

// Two getters per level, each reading both getters of the level below.
function diamond(depth: number) {
  const target: Record<string, unknown> = {a0: 1, b0: 1};
  for (let level = 1; level <= depth; level++) {
    for (const side of ['a', 'b']) {
      Object.defineProperty(target, `${side}${level}`, {
        get() {
          const self = this as Record<string, number>;
          return (
            (self[`a${level - 1}`] as number) +
            (self[`b${level - 1}`] as number)
          );
        },
        enumerable: true,
        configurable: true,
      });
    }
  }
  return createClassyStore(target) as Record<string, number>;
}
for (const depth of [8, 12, 16, 18, 20]) {
  const store = diamond(depth);
  store[`a${depth}`];
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const start = performance.now();
    store[`a${depth}`];
    best = Math.min(best, performance.now() - start);
  }
  console.log(`depth ${depth}: clean read ${(best * 1000).toFixed(1)} µs`);
}
```

Output:

```text
depth 8: clean read 27.3 µs
depth 12: clean read 136.3 µs
depth 16: clean read 1535.4 µs
depth 18: clean read 6235.5 µs
depth 20: clean read 24766.5 µs
```

### `persist.ts`: defects 18 and 20

```ts
import {
  batch,
  createClassyStore,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {persist} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/utils/index.ts';

// Legend-State finding 4: a synchronous storage, read right after persist() returns.
const memory = new Map<string, string>();
const storage = {
  getItem: (name: string) => memory.get(name) ?? null,
  setItem: (name: string, value: string) => void memory.set(name, value),
  removeItem: (name: string) => void memory.delete(name),
};
{
  const first = createClassyStore({count: 0});
  const handle = persist(first, {name: 'spot', storage});
  await handle.hydrated;
  first.count = 7;
  await new Promise((resolve) => setTimeout(resolve, 20));
  console.log('stored record:', memory.get('spot'));

  const second = createClassyStore({count: 0});
  const secondHandle = persist(second, {name: 'spot', storage});
  console.log('count right after persist() returns:', second.count);
  await secondHandle.hydrated;
  console.log('count after hydrated resolves:', second.count);
}

// Legend-State finding 3: batch() with an async function.
{
  const store = createClassyStore({a: 0, b: 0});
  let calls = 0;
  subscribe(
    store,
    () => {
      calls++;
    },
    {sync: true},
  );
  const result = batch(async () => {
    store.a = 1;
    await Promise.resolve();
    store.a = 2;
    store.b = 2;
  });
  console.log(
    'batch(async) returned a promise:',
    result instanceof Promise,
    '| sync calls when batch returns:',
    calls,
  );
  await result;
  console.log('sync calls after the promise settles:', calls);
}
```

Output:

```text
stored record: {"version":0,"state":{"count":7}}
count right after persist() returns: 0
count after hydrated resolves: 7
batch(async) returned a promise: true | sync calls when batch returns: 1
sync calls after the promise settles: 3
```

### `migrate.ts`: defects 14, 22 and 23

```ts
import {createClassyStore} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';
import {persist} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/utils/index.ts';

const memory = new Map<string, string>();
const storage = {
  getItem: (name: string) => memory.get(name) ?? null,
  setItem: (name: string, value: string) => void memory.set(name, value),
  removeItem: (name: string) => void memory.delete(name),
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const errors: string[] = [];
const logged: string[] = [];
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...parts: unknown[]) => void logged.push(parts.join(' '));
console.warn = (...parts: unknown[]) => void logged.push(parts.join(' '));

// 1. Stored version 1, option version 2, no migrate.
memory.set('mismatch', JSON.stringify({version: 1, state: {count: 7}}));
{
  const store = createClassyStore({count: 0});
  const handle = persist(store, {
    name: 'mismatch',
    storage,
    version: 2,
    onError: (error, operation) => void errors.push(`${operation}: ${error}`),
  });
  await handle.hydrated;
  await settle();
  originalError(
    '1. version mismatch, no migrate: count',
    store.count,
    '| onError calls',
    errors.length,
    '| console calls',
    logged.length,
    '| lastError',
    String((handle as {lastError?: unknown}).lastError),
  );
}

// 2. An async migrate.
errors.length = 0;
logged.length = 0;
memory.set('async', JSON.stringify({version: 1, state: {count: 7}}));
{
  const store = createClassyStore({count: 0});
  let migrateCalls = 0;
  const handle = persist(store, {
    name: 'async',
    storage,
    version: 2,
    // The cast stands in for a JavaScript caller: the types refuse a promise.
    migrate: (async (state: {count: number}) => {
      migrateCalls++;
      return {count: state.count + 1};
    }) as never,
    onError: (error, operation) => void errors.push(`${operation}: ${error}`),
  });
  await handle.hydrated;
  await settle();
  originalError(
    '2. async migrate: count',
    store.count,
    '| migrate calls',
    migrateCalls,
    '| onError calls',
    errors.length,
    '| console calls',
    logged.length,
  );
}

// 3. A sync migrate: is the migrated record written back before any edit?
errors.length = 0;
memory.set('sync', JSON.stringify({version: 1, state: {count: 7}}));
{
  const store = createClassyStore({count: 0});
  let migrateCalls = 0;
  const handle = persist(store, {
    name: 'sync',
    storage,
    version: 2,
    migrate: (state) => {
      migrateCalls++;
      return {count: (state as {count: number}).count + 1};
    },
  });
  await handle.hydrated;
  await settle();
  originalError(
    '3. sync migrate: count',
    store.count,
    '| migrate calls',
    migrateCalls,
    '| stored record now',
    memory.get('sync'),
  );
}
console.error = originalError;
console.warn = originalWarn;
```

Output:

```text
1. version mismatch, no migrate: count 0 | onError calls 0 | console calls 0 | lastError undefined
2. async migrate: count 0 | migrate calls 1 | onError calls 0 | console calls 0
3. sync migrate: count 8 | migrate calls 1 | stored record now {"version":1,"state":{"count":7}}
```

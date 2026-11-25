# Stage 3 spikes: adapters and collections

Stage 3 of the pre-1.0 review, 2026-11-24 and 25. Spikes A1 to A7 of the
brief `review/stage-3/briefs/adapters-collections.md`, run in a throwaway
worktree at `5ab613f` (`<scratch>/stage-3-adapters-collections/wt`), with an
unmodified second worktree beside it (`.../base`) for every "before". Nothing
in the repository was changed apart from this file.

## Summary

| Item                                              | Result                                                                                                                                                                       | Recommendation                                              | Label                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| A1. Snapshot at the read (Vue, Angular, Solid)    | 2,000 direct writes: about 700 ms to 2.4 ms in each. One incidental test (`isShallow`). +34 to +44 bytes per entry                                                           | Do it                                                       | Can follow 1.0                      |
| A2. Vue: no listener on the server, read-only ref | The stage 2 fix (`onMounted`) breaks `onServerPrefetch` data loading. Only A1's read-time ref fixes the leak and keeps it. `Readonly<Ref>` settles contradiction 28          | Do it on top of A1                                          | Before 1.0 (the type)               |
| A3. Angular: `untracked()`, `{injector}`          | Both fixed and run. `untracked()` alone is +19 bytes; the option +51 more                                                                                                    | Do it                                                       | Fix: can follow. Option: before 1.0 |
| A4. Solid rename to `fromClassyStore`             | Eleven files; tests, typecheck and examples pass                                                                                                                             | Rename (owner's call)                                       | Before 1.0                          |
| A5. React: automatic first snapshot               | Breaks the documented server pattern (create, load, render), even with `prepareStoreForHydration`; cyclic stores fail; +19 MB per 100,000 rows                               | Do not. Keep `isEqual`                                      | No change                           |
| A6. One guard                                     | With D1, all four `active` flags can go; Angular's `destroyed` check stays. Saves 13 to 16 bytes per adapter                                                                 | Do it with D1, never without                                | Can follow 1.0                      |
| A7. Collections                                   | Snapshot lookups 160 to 525 µs down to under 0.1 µs; live 100 times faster with a live index, which answers wrong after a raw write. `-0` and constructors fixed in 13 bytes | M39 and the snapshot index: do. Live index: later, with M43 | M39: before 1.0. Index: can follow  |

Three things the owner should know before the detail:

1. **The stage 2 fix for the Vue server leak is wrong as proposed.**
   Subscribing in `onMounted` (or skipping the listener on the server) makes
   a server render miss writes from `onServerPrefetch`, Vue's own way to load
   data. The leak fix needs A1's ref that builds the snapshot when read.
2. **Automatic hydration capture (M70) is breaking, not additive.** Our
   guide says to create the store, load the request data, then prepare.
   An automatic capture fires on that first load write, so the server renders
   the empty store, and an explicit call afterwards cannot undo it.
3. **Every adapter entry that changes goes over its budget**, by 13 to 77
   bytes; `./collections` by 93 with the snapshot index. The decision document
   should set these budgets together with the main entry's.

## Baseline

The unmodified worktree at `5ab613f`, Apple M1 Max, Bun 1.4.5, other agents
running on the machine.

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes (after one
  `bun run build`).
- `bun run size`, bytes gzipped that each entry adds to the main one:

  | Entry           | Bytes | Budget | Room |
  | --------------- | ----: | -----: | ---: |
  | `.` (main)      | 3,661 |  3,750 |   89 |
  | `./collections` |   727 |    750 |   23 |
  | `./react`       | 1,662 |  1,700 |   38 |
  | `./vue`         |   280 |    300 |   20 |
  | `./svelte`      |   182 |    200 |   18 |
  | `./angular`     |   271 |    300 |   29 |
  | `./solid`       |   312 |    335 |   23 |

- The stage 2 adapter scripts no longer exist. I recreated the ones I needed
  from the appendix of `review/stage-2/adapters.md` as two scripts,
  `a1-timing.ts` and `adapter-checks.ts` (appendix), and ran each against both
  worktrees. Their "before" output matches what stage 2 printed.

## A1. Build the snapshot at the read, not in the listener

**Question.** Can the Vue, Angular and Solid adapters stop building a
snapshot on every synchronous notification, and keep every behaviour their
tests pin? Adapters A1, M63, stage 1 finding 2, merged dependency 19.

**What was changed** (`a1.patch`), three files, 75 lines added and 31
removed. Each adapter keeps the last snapshot it handed out and a `stale`
flag. The listener only sets the flag and tells the framework that something
changed; the snapshot is built at the next read, once, however many writes
came before it.

- **Vue** (`vue.ts`): a `customRef` whose getter tracks and builds the
  snapshot if stale; the listener calls `trigger()`. Its setter does nothing.
- **Angular** (`angular.ts`): a private `version` signal bumped by the
  listener, and a `computed` that reads it and builds the snapshot if stale.
  The `computed` is what is returned; it is read-only by construction, so
  `asReadonly()` goes.
- **Solid** (`solid.ts`): a `version` signal bumped by the listener; the
  accessor reads the version and builds the snapshot when the version it sees
  has moved. Because a Solid 2 signal shows a write only after `flush()`, an
  imperative read straight after a write still returns the old value, exactly
  as today. A first try with `createMemo` failed a test: Solid's server
  runtime (which `bun test` resolves) never re-runs a memo, so a live read on
  the server went stale. A plain accessor over the version signal has neither
  problem.
- **Disposal.** Each adapter reads once in its cleanup, so a ref or signal
  read after its scope stopped holds the last write delivered before it
  stopped. That is what the pinned tests for stage 1 finding 20 expect; it
  costs about 10 bytes per adapter. The `active` flags stay (A6).

**Result.**

- **Timing**, 2,000 direct row writes outside a method, then one read,
  median of 7 (`a1-timing.ts`):

  | Attached | Before |                                   A1 |
  | -------- | -----: | -----------------------------------: |
  | nothing  | 1.2 ms |                               1.2 ms |
  | Vue      | 777 ms |                               2.4 ms |
  | Angular  | 710 ms |                               2.4 ms |
  | Solid    | 745 ms |                               2.3 ms |
  | Svelte   | 734 ms | 726 ms (unchanged, not in the spike) |

  Every run ended with the value current and no listener left.
- **Tests**: 1,340 pass, 1 fails. `vue.test.ts`, "returns a shallow ref
  containing the current immutable snapshot": `isShallow(state)` is now
  false, because a `customRef` is not a `shallowRef`. **Incidental.** The
  value is a frozen snapshot, which Vue never makes deep-reactive, so the only
  observable difference is `isShallow()`, and that `watch(state, cb)` now
  compares values (a new snapshot is always a new object, so it fires on every
  change as before). The decision document should say this may change.
- **Typecheck** passes.
- **Size**: `./vue` 324 (+44, 24 over 300), `./angular` 311 (+40, 11 over
  300), `./solid` 346 (+34, 11 over 335). The first form measured +53, +43
  and +34; folding the read into the getter saved the difference.
- **Stage 2 checks, before and after** (`adapter-checks.ts`): Vue `computed`
  granularity unchanged (effect runs `whole 3, count 1, user 1`), Angular
  `computed` granularity unchanged (`count 1, user 1`), Solid timing and
  granularity unchanged (read straight after a write 0, effect on `user` ran
  once after two unrelated writes, 0 listeners after dispose). Vue writing
  the ref: before, the ref shows 99 while the store holds 0; after, the write
  is ignored and the ref shows 0. Angular N1: before, the signal said
  `reads 0` after a write inside a `computed`; after, it says `reads 1`, but
  `console.error` still receives Angular's error, because the version bump is
  itself a signal write. N1 still needs A3's `untracked()`.

**What it changes for a user.** Nothing in the common case: a read after a
write is current in Vue and Angular, and after `flush()` in Solid, as today.
Writing the Vue ref is now a silent no-op instead of a fake value (A2 makes
it a type error too). Vue's `isShallow(ref)` is false.

**Recommendation: do it. Can follow 1.0**, because no documented behaviour or
type changes. Taking it before 1.0 is still better: it removes the
640-millisecond case from three of five adapters, and stage 4 touches these
files for A2 and A3 anyway.

**Cost for stage 4.** Three adapter files; one test changes
(`isShallow`); new tests per adapter: "N direct writes build one snapshot at
the read" (count `snapshot` calls through a spy or count rebuilds of a getter)
and "a read after dispose holds the last delivered value". Risk medium: the
framework suites (Vue, Angular, Solid in Playwright) must run, which I did
not. Budgets: `./vue` to about 330, `./angular` and `./solid` up by about 15,
unless A6 pays for it (see there).

## A2. Vue: no listener after a server render, and a read-only ref

**Question.** Can the Vue adapter stop leaking one listener per server
render (adapters V1, M64), and should the ref be typed read-only (stage 1
finding 17, adapters V2, M65, contradiction 28)?

**What was changed.** Three forms, each in `vue.ts` only, each with the
return type `Readonly<Ref<Snapshot<T>>>`.

1. **`a2.patch`, the stage 2 sketch** (26 added, 11 removed): a component
   that is not mounted subscribes in `onMounted`, and refreshes once there; a
   bare effect scope subscribes at once.
2. **The same with server detection instead** (no patch kept; it is
   `a1a2-vue.patch` without the `customRef`): a component skips the
   subscription when `inject(ssrContextKey)` is set, which stage 2 verified is
   non-null exactly inside `renderToString`, and subscribes at once otherwise.
3. **`a1a2-vue.patch`, on top of A1** (48 added, 14 removed): A1's
   `customRef`, plus server detection as in form 2. On the server it adds no
   listener and its getter reads `snapshot(store)` at every read, which is a
   cached lookup while the store is unchanged.

**Result.** `adapter-checks.ts`, before and after:

| Case                                                       | Before                       | Form 1                         | Form 2         | Form 3 (A1 + A2)  |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------ | -------------- | ----------------- |
| Listeners after three `renderToString` of one module store | 1, 2, 3                      | 0, 0, 0                        | 0, 0, 0        | 0, 0, 0           |
| Store written in `onServerPrefetch`, then rendered (5)     | `<p>5</p>`                   | `<p>0</p>`                     | `<p>0</p>`     | `<p>5</p>`        |
| Client: setup writes the store after the call, then mounts | first render shows 1         | first render shows 0, then 1   | shows 1        | shows 1           |
| Client: mount, write, unmount                              | 1 listener, updates, 0 after | the same                       | the same       | the same          |
| `state.value = {count: 99}`                                | compiles; ref 99, store 0    | type error; at run time ref 99 | type error; 99 | type error; ref 0 |

The second row is the finding of this spike. `onServerPrefetch` is Vue's
documented way to load data during a server render, and it writes the store
after setup. Today the listener carries that write into the ref; forms 1 and 2
render the setup-time value, because without a listener nothing tells the
ref. **A fix for V1 that keeps an eager `shallowRef` breaks server data
loading.** Only a ref that reads the store at the read (A1's shape) can do
without the listener and stay current. Form 1 also costs the client an extra
render when setup writes the store.

- **Tests**: 1,341 pass with forms 1 and 2. Form 3 fails A1's one incidental
  test (`isShallow`), and nothing else.
- **Typecheck** fails in `types.vue.test.ts`, two assertions that compare the
  exact return type, among them the one marked `FINDING` for stage 1 finding
  17. **Fixes**: both flip because the type changed on purpose.
- **Size** of `./vue`: form 1 337 (+57), form 2 329 (+49), form 3 369 (+89,
  69 over the budget of 300). Most of the cost is the names imported from
  `vue`, which stay unminified (`getCurrentInstance`, `inject`,
  `ssrContextKey`, `customRef`).
- **Contradiction 28** (`Readonly<Ref>` against `Readonly<ShallowRef>`). Not
  settled with `tsc` against Vue 3.2.0: that version is not installed and not
  in the local package cache, and I did not download it. Two things settle it
  without the run. `Readonly<Ref<T>>` uses only `Ref`, which every Vue 3
  release exports, and TypeScript's own `Readonly`, so it holds on the floor
  of the peer range by construction. And with A1 the ref is a `customRef`,
  which is not shallow at run time, so `ShallowRef` would be a false type.
  Take `Readonly<Ref<Snapshot<T>>>`.

**What it changes for a user.** A module-level store no longer gains a
listener per request in a Vue server render. Code that assigns the ref stops
compiling. With form 3, a server render reads the store at each read, so
writes from `onServerPrefetch` still show.

**Recommendation: do form 3, that is A2 only together with A1. Before 1.0**
for the type (it changes the documented return type `Ref<Snapshot<T>>`);
the leak fix alone could follow 1.0. Do not take forms 1 or 2.

**Cost for stage 4.** `vue.ts`, `types.vue.test.ts` (two assertions flip),
`vue.test.ts` (new: no listener under `renderToString`; a write in
`onServerPrefetch` renders; the ref refuses a write), `VUE.md` and
`API_REFERENCE.md` (return type, a sentence on server rendering). Risk
medium: run the Vue packed-app suite and a real Nuxt or Vite SSR page, which I
did not. Budget `./vue` to about 370, or 375 with room.

## A3. Angular: `untracked()` and an `{injector}` option

**Question.** Does `untracked()` around the signal write keep a store write
made inside a `computed` (adapters N1, M66), and can the adapter take an
`{injector}` and name itself in the error (adapters N2, M67)?

**What was changed** (`a3.patch`, `angular.ts`, 20 added, 7 removed):
`injectClassyStore(store, options?: {injector?: Injector})`. Without an
injector it calls `assertInInjectionContext(injectClassyStore)` first, as
`toSignal` does; with one it takes `injector.get(DestroyRef)`. The listener
writes inside `untracked()`. Our own message gets the package prefix:
"@codebelt/classy-store/angular: injectClassyStore() requires a live Angular
injection context or injector". `a3-untracked-only.patch` is the one-line
`untracked()` change alone (3 added, 2 removed).

**Result.** `adapter-checks.ts`, before and after:

| Case                                         | Before                                      | A3                                                                         |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Called outside an injection context          | NG0203 naming "The `DestroyRef` token"      | NG0203 naming "injectClassyStore() can only be used…"                      |
| Called with `{injector}` outside a context   | NG0203                                      | works; value current after a write; 0 listeners after `injector.destroy()` |
| Store write inside a `computed`              | `console.error` once; signal says `reads 0` | no error; signal says `reads 1`                                            |
| `computed` granularity, two unrelated writes | downstream runs `count 1, user 1`           | the same                                                                   |

- **Tests**: 1,341 pass. A first wording of the message ("…a live Angular
  injector") failed one test that matches `/live Angular injection context/`;
  that test pins the message text only, so it is **incidental**, and the
  wording above keeps it passing.
- **Typecheck** fails in `types.angular.test.ts` on the assertion of the
  exact signature `(proxyStore: T) => Signal<Snapshot<T>>`. **Fixes**: the
  signature gains its option on purpose.
- **Size** of `./angular`: 341 (+70, 41 over 300). `untracked()` alone is 290
  (+19), inside the budget. The option, the assertion and the longer message
  are the other 51.

**What it changes for a user.** A store method that writes, called inside a
`computed` or a template expression, no longer loses its update and no longer
logs an error. `injectClassyStore` can be called from `ngOnInit` or an event
handler with `{injector: this.injector}`, and the error says which call
failed.

**Recommendation: do it.** The `untracked()` fix **can follow 1.0** (a bug
fix, no API change). The `{injector}` option is additive, but it settles the
documented signature, so take it **before 1.0** while that is free. With A1,
the `untracked()` goes around the version bump instead (A1 alone still logs
the error, see A1).

**Cost for stage 4.** `angular.ts`, `types.angular.test.ts` (one assertion),
`angular.test.ts` (new: write inside `computed`; `{injector}` outside a
context; the NG0203 message names our function), `ANGULAR.md`,
`API_REFERENCE.md`. Risk low. Budget `./angular` to about 345, or about 360
with A1.

## A4. Solid: rename `useClassyStore` to `fromClassyStore`

**Question.** What does the rename touch (adapters Q7, M68, contradiction
27)?

**What was changed** (`a4.patch`, six files, 30 lines changed): the export,
its error message, and every import and call in code.

**Result.** 1,341 tests pass; the whole repository typecheck passes (package,
scoping harness, all examples, the docs site); `./solid` 314 (+2).

**Every place the rename touches:**

| Kind         | File                                                                           | Uses |
| ------------ | ------------------------------------------------------------------------------ | ---: |
| Source       | `packages/classy-store/src/frameworks/solid/solid.ts` (name, message)          |    2 |
| Unit test    | `packages/classy-store/src/frameworks/solid/solid.test.ts`                     |   12 |
| Type test    | `packages/classy-store/src/types.solid.test.ts` (incl. the export list)        |    7 |
| Browser test | `packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx` |    2 |
| Browser test | `packages/classy-store/tests/browser/solid/lifecycleProbe.ts`                  |    5 |
| Example      | `examples/solid/src/App.tsx`                                                   |    2 |
| Guide        | `website/content/docs/SOLID.md`                                                |    8 |
| Reference    | `website/content/docs/API_REFERENCE.md` lines 40 and 59                        |    2 |
| Overview     | `website/content/docs/ABOUT.md` line 40                                        |    1 |
| Readme       | `README.md` line 142                                                           |    1 |
| Agent notes  | `CLAUDE.md` line 29                                                            |    1 |

The docs are not in the patch. `ARCHITECTURE.md` describes the Solid adapter
without naming the function. `llms.txt` and the per-page Markdown are
generated from the docs. No changelog entry exists to change; one is needed.

**What it changes for a user.** Every Solid import breaks. The library has one
user.

**Recommendation: rename, before 1.0, or never.** The scheme the other four
adapters follow is "the framework's idiom", and in Solid `use*` means a
context lookup while `from()` is the primitive this adapter reproduces
(stage 2 O1). The Solid report's objection (contradiction 27) is that the
return type is what a Solid user expects, which is true and unaffected by the
name. The cost is the table above and a changelog line. This is the owner's
call; my lean is to rename.

**Cost for stage 4.** The eleven files above, mechanical. Risk low; the
Solid browser suite must run.

## A5. React: capture the first snapshot without `prepareStoreForHydration`

**Question.** Can the React hooks get their server snapshot without the call,
as Zustand does (Zustand and Jotai finding 1, M70, "proposals I think are
wrong" item 16), captured at creation or just before the first write? What
memory does it hold, and what does a write through a raw reference do? And
P1's claim in `persist-devtools.md`, that either form is captured before
`persist()`'s first restore write.

**What was changed.** Two forms. In both, the React entries (`./react` and
`./react/server`) register a hook in the core when they load, so an app that
does not import React pays only a null check; the capture fills the same
`WeakMap` that `prepareStoreForHydration` fills, which keeps the first
capture.

- **Lazy, before the first write** (`a5-lazy.patch`, 6 files, 51 added, 2
  removed): a `written` flag per node; the `set` and `deleteProperty` traps
  call the hook once per node before its first write, and the hook snapshots
  each store root above it that has no capture yet.
- **At creation** (`a5-creation.patch`, 5 files, 42 added, 2 removed):
  `createClassyStore` calls the hook, which snapshots the new store.

**Result.** `a5-hydration.tsx`, `renderToString` and `hydrateRoot` under
happy-dom, before and after (both forms give the same output):

| Case                                                                             | Before                                    | Either form                        |
| -------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| 1. Server renders "Ada"; client loads "Ada", then a restore writes "Saved Grace" | hydration error, then shows "Saved Grace" | server HTML is `(empty)`; no error |
| 2. Server: create, `load('Ada')`, render, no prepare                             | `<span>Ada</span>`                        | `<span>(empty)</span>`             |
| 3. Server: create, `load('Ada')`, `prepareStoreForHydration`, render (the guide) | `<span>Ada</span>`                        | `<span>(empty)</span>`             |
| 4. Server: data passed to the constructor, then one write, render                | the written value                         | the constructor's value            |

Case 1 is M70, and it is "fixed" only because both sides now render the empty
pre-load state. Cases 2 and 3 are the finding: `REACT_SSR.md` tells users to
prepare "after initializing the store with the data used to render the page",
and the first write of that loading is exactly what an automatic capture
fires on. The server then renders the store as it was before its data
arrived, and an explicit `prepareStoreForHydration` afterwards cannot correct
it, because the first capture wins. Zustand avoids this because its initial
state is whatever the creator function returned: there is no "create, then
load" in Zustand. Ours has one, and the guide uses it.

- **Tests.** Lazy: 1,329 pass, 12 fail. At creation: 1,321 pass, 20 fail. The
  unit suite runs in one process, so once a React test file has loaded the
  entry, the hook is on for every later core test, which is what an app that
  imports React sees. Every failure is a **regression** of the design, not of
  the patch:
  - `react.hydration.lifecycle.test.tsx`, "does not affect an unprepared
    request store": case 2 above.
  - Five tests in "what the collector can free" (both forms) and "putting a
    removed subtree back": the captured snapshot keeps a replaced list or a
    removed subtree alive for the life of the store.
  - "reference cycles" (3 lazy, 5 at creation) and three `snapshot()` tests on
    circular references (at creation): a store that refers to itself (M36)
    throws on its first write (lazy) or cannot be created at all (at
    creation), because the capture takes a snapshot, which throws on a cycle.
  - "a store created from very deeply nested state": the capture's snapshot
    recurses, so the first write at the bottom overflows the stack.
  - At creation also: two "array element redefined" tests and one
    `defineProperty` test, which expect no snapshot cached before their write.
- **Typecheck** passes.
- **Size**, lazy: main 3,705 (+44), `./react` adds 1,707 (+45 over its own
  baseline, 7 over 1,700), `./react/server` 200 (25 over 175). At creation:
  main 3,670 (+9), `./react` 1,708, `./react/server` 200.
- **Memory** (`a5-memory.ts`): ten stores of 10,000 rows each, every row
  written once, one live snapshot held: 141.1 MB before, 160.2 MB with
  either form, 19 MB more, about 190 bytes per row. That is the frozen copy of
  every row's first state, kept for the life of the store whether or not it
  is ever server-rendered. `CONSTRAINTS.md` says retained memory must not
  grow; the memory suite (`tests/memory`, not run) would catch this.
- **A write through a raw reference** (stage 1 finding 11): with the lazy
  form, a raw write made before the first write through the store is not
  seen by any trap, so the "first" snapshot captured later already contains
  it (`raw write`, where the creation form says `initial`). It cannot be
  fixed without a trap on the raw object, which is what finding 11 is about.
- **P1's claim.** Correct as far as it goes: case 1 writes through the `set`
  trap as `persist`'s restore does (`proxyStore[key] = …`), and the lazy form
  captured before it. But the same mechanism captures before the request
  data is loaded, so "capture before `persist()`'s first restore" is not
  enough on its own. Without A5, P1 needs the order the guide already states:
  `prepareStoreForHydration` after loading, before `persist()`.

**What it would change for a user.** The documented server pattern renders
the empty store, with or without the call. Every store in a React app keeps
its first state for life. Stores with cycles stop working.

**Recommendation: do not capture automatically. No change; can follow 1.0
if a better form is found.** The merged document's item 16 called it dearer
than "not breaking" suggests; the spike shows it is breaking. What would
help instead, all additive:

1. A sentence in `REACT_SSR.md` beside P1: with a synchronous storage,
   `persist()` restores inside the call, so `prepareStoreForHydration` must
   come before it. The guide's order already says so; P1 makes it matter.
2. In a development build (M72), a warning from the hooks when React reports
   a recoverable hydration error for a store that was never prepared. Not
   spiked.

**`isEqual` against `equalityFn`** (Zustand and Jotai finding 2, M71, item
17). Keep `isEqual`. React's own `useSyncExternalStoreWithSelector` names the
same parameter `isEqual` (checked in the installed
`use-sync-external-store` 1.7.0); Zustand and Jotai say `equalityFn`. A
breaking rename for a split precedent buys nothing. No change, no label.

**Cost for stage 4.** One paragraph in `REACT_SSR.md`. Nothing else.

## A6. One guard, written once

**Question.** Every adapter keeps an `active` flag so that a listener removed
during a delivery is not called (stage 1 finding 20, adapters A2, merged
dependency 10). Does D1 of `spike-delivery.md`, which makes the core skip a
subscriber removed during delivery, remove the need?

**What was changed.** `d1.patch` from `spike-delivery.md` applies unchanged
to `5ab613f` (no package file changed since `216b3d1`). On top of it,
`a6-on-d1.patch` removes the four flags (4 files, 8 added, 29 removed): each
cleanup becomes the core's unsubscribe function itself, and the Svelte
`subscribe` returns the core's unsubscribe directly. Angular's
`destroyRef.destroyed` and Solid's `isDisposed(owner)` checks stay; I then
removed those two as well, to see what they still do.

**Result.**

- **D1 alone** reproduces its report here: 1,325 pass, the same 16 core
  tests fail, main entry 3,824.
- **D1 and A6**: 1,325 pass and the same 16 fail; every adapter test passes,
  including the four that pin finding 20 per adapter ("does not update a ref
  whose scope is stopped during the same notification", "does not call a
  subscriber removed during the same notification", "ignores delivery after
  disposal during an in-progress notification", "ignores callbacks copied
  before an earlier listener destroys the injector").
- **Without the two framework checks as well**: Solid still passes
  everything, so `isDisposed(owner)` can go too. Angular fails "ignores
  writes from an earlier destroy callback": an `onDestroy` callback
  registered before ours writes the store while our listener is still
  subscribed, which is not a delivery-time removal and which D1 does not
  cover. Angular's `destroyed` check stays.
- **Typecheck** passes.
- **Size**, bytes added over the main entry, D1 alone and D1 with A6:

  | Entry       |  D1 | D1 + A6 | Saved |
  | ----------- | --: | ------: | ----: |
  | `./vue`     | 281 |     268 |    13 |
  | `./svelte`  | 180 |     164 |    16 |
  | `./angular` | 272 |     258 |    14 |
  | `./solid`   | 312 |     298 |    14 |

  Solid's `isDisposed` check would save a few more bytes; not measured on
  its own.

**What it changes for a user.** Nothing.

**Recommendation: yes, D1 removes the need. Do A6 if and only if D1 is
taken**, in the same change; without D1 the flags are the only guard. Can
follow 1.0 (no behaviour change). The 13 to 16 bytes per adapter pay for most
of what A1 and A3 add (see the combination).

**Cost for stage 4.** Four adapter files, no test changes. Risk low, given D1
and the framework suites.

## A7. Collections: an index for snapshots and for live state, and one membership rule

**Question.** Can lookups stop scanning the backing array, on a snapshot (the
lazy index the Valtio agent prototyped, M40 (a)) and on live state (an index
beside the array, M40 (b), contradiction 23, "proposals I think are wrong"
item 14), while keeping `identityOf()` and fixing `-0` and the constructors
(stage 1 findings 33 and 34, M39)? Measured against the `./collections`
budget of 750, which had 23 bytes free.

**What was changed**, `collections.ts` only, three patches, each against
`5ab613f`:

- **`a7-m39.patch`, the membership rule alone** (24 added, 15 removed). One
  function, `keyOf`, gives the key a member is matched by: `identityOf()` for
  an object, the value itself for a primitive, with `-0` read as `0`, as a
  native `Map` and `Set` do. The scan and both constructors use it. The map
  constructor now keeps the first key and the last value of a repeated key,
  as a native `Map` does; it used to keep the last key too.
- **`a7a.patch`, M39 and the snapshot index** (68 added, 26 removed). A
  module-level `WeakMap` from a snapshot's frozen backing array to a native
  `Map` from key to position. The first lookup on a snapshot scans and marks
  the array; the second builds the index, which can never go stale because
  the array cannot change. Two details mattered, both found by measuring:
  - Building on the first lookup made "write one key, then one lookup on the
    new snapshot" 1.6 times slower (3.1 to 4.9 ms), since every write makes a
    new frozen array. Building on the second lookup keeps that case at
    today's cost.
  - `Object.isFrozen` reads every element: about 1 ms on a frozen array of
    10,000 in Bun, twice a full scan. The spike tells a snapshot's array by
    `identityOf(array) !== array` instead, which is a `WeakMap` lookup,
    because every snapshot is registered with its source.
- **`a7b.patch`, the snapshot index and a live index** (134 added, 31
  removed). The same `WeakMap` also holds, for a live backing array, a `Map`
  and the store version of the array it is current for, read with
  `getVersion()`. It is keyed by the raw array, not stored on the instance,
  so a snapshot never shares it (the problem item 14 names). The
  collection's own `set`, `add` and `delete` keep it current in place (an
  append adds one key; a delete moves the later keys down, which is
  O(n − i) like the `splice` it follows). Any other write bumps the version
  and makes the index suspect: a hit is then checked against the array in
  O(1), and a miss scans as today; the index is rebuilt only when that scan
  finds a member the index lacked. `withHistory` and `persist`, which replace
  the backing array, give a new raw array, which simply has no index yet.

**Result.** `a7-lookup.ts`, Bun, the median of five runs of 1,000 calls:

| Case (10,000 members)                                 |  Before | M39 alone |   `a7a` |   `a7b` |
| ----------------------------------------------------- | ------: | --------: | ------: | ------: |
| live `map.get`, last string key                       |   44 µs |     43 µs |   40 µs | 0.42 µs |
| live `map.get`, last object key, raw                  |  251 µs |           |  185 µs | 0.34 µs |
| live `set.has`, last number                           |   21 µs |     26 µs |   23 µs | 0.26 µs |
| live `set.has`, a missing number                      |   21 µs |           |   23 µs | 0.20 µs |
| snapshot `map.get`, last string key                   |  481 µs |           | 0.08 µs | 0.07 µs |
| snapshot `set.has`, last number                       |  160 µs |           | 0.06 µs | 0.06 µs |
| snapshot `set.has` by raw object, last                |  525 µs |           | 0.04 µs | 0.04 µs |
| live `set` of a new key, then its `delete`            |  496 µs |           |  450 µs |  366 µs |
| live `set` of an existing key                         |   68 µs |           |   54 µs | 0.82 µs |
| a value changed in place, then `get` of a present key |   67 µs |           |         |  1.7 µs |
| a value changed in place, then `get` of a missing key |   57 µs |           |         |   61 µs |
| `set` one key, then one `get` on the new snapshot     | 3.08 ms |           | 3.01 ms | 2.90 ms |

The last row is dominated by building the snapshot itself (M35), which none
of this touches. Behaviour, before and after (all three patches):

| Case                                                       | Before                     | After                                                                   |
| ---------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `get` by raw key, its proxy, its snapshot; snapshot by raw | found, found, found; found | the same                                                                |
| `new Set([0])`, then `add(-0)`: size (finding 33)          | 2                          | 1                                                                       |
| constructed from `[0, -0]`: size                           | 1                          | 1                                                                       |
| constructed from `[raw, its proxy]`: size (finding 34)     | 2                          | 1                                                                       |
| `withHistory`: add, undo, redo                             | right                      | right                                                                   |
| `_items[0] = 'z'` through the store, then `has`            | right                      | right                                                                   |
| `_items[0] = 'z'` on the raw array, outside every trap     | right (`has('z')`)         | M39, `a7a`: right. `a7b`: **wrong** (`has('a')` true, `has('z')` false) |

The last row is the price of the live index. A write to the raw array is
invisible to every trap (stage 1 finding 11): today a scan reads the raw
array, so it is right anyway; a version-checked index cannot see the write.
It is the only case I found, and the public `_entries` and `_items` (M43) are
what make it reachable.

- **Tests.** All three: 1,339 pass, 2 fail, both in the core differential
  findings, "+0 and -0 are two members when added and one when constructed"
  and "a collection constructed from a row and its proxy holds the row
  twice". **Fixes**: they pin findings 33 and 34. A first version of `a7b`
  failed two more (a getter over a collection, and the randomized
  differential test) because a suspect index could point past the end of the
  array after a delete; the patch has the bound check, and both pass.
- **Coverage** of `collections.ts` stays at 100% of lines and functions with
  `a7b` (run with `bun test --coverage src`).
- **Typecheck** passes.
- **Size** of `./collections`, against 727 today and a budget of 750:

  | Patch    | Bytes | Over 750 |
  | -------- | ----: | -------: |
  | `a7-m39` |   740 |        — |
  | `a7a`    |   843 |       93 |
  | `a7b`    | 1,066 |      316 |

- **Memory.** Not measured. One native `Map` per indexed array: for a live
  collection for its life, for a snapshot for as long as the snapshot lives
  (the `WeakMap` drops it with the array).
- **Native `Map` and `Set` (M38, contradiction 22).** Not spiked: the merged
  document's run already settles 22, and every report keeps the separate
  classes for 1.0. What this spike adds: the speed argument for native
  storage is answered without it. A native-backed live side would still need
  the array for snapshots, and it would have exactly `a7b`'s blind spot for
  raw writes.

**What it changes for a user.** M39: `-0` and `0` are one member everywhere,
and a collection built from an object and its proxy holds it once, as `add`
already did; `REACTIVE_COLLECTIONS_TUTORIAL.md` documents the opposite for
`-0` and must change. The indexes change no result, only the time, except
`a7b`'s raw-write case.

**Recommendation.**

- **M39 (`a7-m39`): do it. Before 1.0**, because it changes documented
  behaviour. It fits the budget.
- **The snapshot index (`a7a`): do it.** Snapshot reads are what every
  framework adapter renders from, and it turns 160 to 525 microseconds into
  under 0.1, with no case that gets slower and no case that changes. **Can
  follow 1.0.** It needs a budget of about 850.
- **The live index (`a7b`): not for 1.0. Can follow 1.0**, and only together
  with M43 (the backing arrays leave the public type, so a raw write to them
  is no longer something a user can reach by typing a property name). It is
  100 times faster on hits, but it costs 223 bytes more than `a7a`, a second
  validity rule (store versions) that stage 4 must test against history,
  persist, devtools time travel and direct writes, and one wrong answer
  today's code does not give. "Their lookups are linear" is documented, so a
  faster live side is additive whenever it comes.

**Cost for stage 4.** `collections.ts`; flip the two finding tests; new tests:
`-0` in every path, a constructor with an object and its proxy, a snapshot
lookup that builds the index on the second call, a snapshot index that
survives structural sharing (an unchanged collection in a newer snapshot
reuses it). The tutorial sentence on `-0`. Budget `./collections` to about
850.

## The combination I would recommend

Two forms, because A6 depends on D1, which is another report's item.

- **`combo.patch`** (9 files, 203 added, 89 removed): A1 for Vue, Angular
  and Solid; A2 form 3 (Vue on the server, read-only ref); A3 (`untracked()`
  around the version bump, `{injector}`, the message); A4 (the Solid rename,
  code, tests and example); A7 `a7a` (M39 and the snapshot index). Not A5,
  not the live index.
- **`combo-d1.patch`** (11 files, 275 added, 141 removed): the same plus
  `d1.patch` and A6 on the lazy adapters. With A1, Solid's `active` flag
  stays: it now also decides what the accessor returns after disposal. Vue,
  Angular and Svelte lose theirs. Solid's `isDisposed(owner)` check goes (A6
  showed it is covered by D1), Angular's `destroyed` check stays.

**Result.**

- **Tests.** `combo`: 1,338 pass, 3 fail: the two finding tests of M39
  (**fixes**) and `isShallow` (**incidental**, A1). `combo-d1`: 1,322 pass,
  19 fail: those three and D1's 16, which `spike-delivery.md` classifies
  (none a regression).
- **Typecheck** fails on three exact-signature assertions, all **fixes**:
  `types.vue.test.ts` twice (the read-only ref), `types.angular.test.ts` once
  (the new option). Lint: the same 2 warnings as the baseline.
- **Size**, bytes added over the main entry:

  | Entry           | Today | Budget | `combo` | `combo-d1` |
  | --------------- | ----: | -----: | ------: | ---------: |
  | `.` (main)      | 3,661 |  3,750 |   3,661 |      3,824 |
  | `./collections` |   727 |    750 |     843 |        837 |
  | `./vue`         |   280 |    300 |     369 |        362 |
  | `./svelte`      |   182 |    200 |     182 |        164 |
  | `./angular`     |   271 |    300 |     377 |        361 |
  | `./solid`       |   312 |    335 |     348 |        341 |
  | `./react`       | 1,662 |  1,700 |   1,662 |      1,652 |

  `./react` and `./svelte` are unchanged by my items. New budgets I would
  propose, each the combination plus about 3%: `./collections` 870, `./vue`
  380, `./angular` 390, `./solid` 360; `./svelte` and `./react` unchanged.
- **Benchmark** (`bun run benchmark:core`, base and `combo` back to back,
  Bun, nanoseconds, the median of five runs): store read 31.8 and 32.2,
  nested read 108 and 109, write 167 and 166, sync write 179 and 178, batched
  write 181 and 181, snapshot read 0.164 and 0.165, forwarding Proxy read 2.06
  and 2.06. Every difference is inside the spread, as expected: `combo`
  changes no core file. Node was not run (see "Not done"); for `combo-d1` the
  core timings are D1's, in `spike-delivery.md`.
- **Reproductions**, `combo` and `combo-d1` alike (`adapter-checks.ts`,
  `a1-timing.ts`, `solid-probe.ts`, `a7-lookup.ts`):
  - 2,000 direct row writes then one read: Vue 645 to 2.4 ms, Angular 654 to
    2.5 ms, Solid 651 to 2.4 ms; Svelte unchanged at about 650 to 680 ms.
  - Vue: 0 listeners after three server renders (1, 2, 3 before); an
    `onServerPrefetch` write still renders; a client mount, write and unmount
    as before; a write to the ref is ignored (before: shows 99).
  - Angular: the NG0203 message names `injectClassyStore()`; `{injector}`
    works outside a context and cleans up; a store write inside a `computed`
    lands with no error (before: lost, one `console.error`).
  - Solid: a read straight after a write is 0 until `flush()`, 1 after, 1
    after dispose, exactly as before; `createMemo` granularity unchanged.
  - Collections: as `a7a` in A7.

**Cost for stage 4**, in order: A7 M39 (before 1.0, small), A3 and A1 for
Angular together (the `untracked()` goes around the version bump), A1 and A2
for Vue together, A1 for Solid with the rename, the snapshot index, then A6
in the same change as D1. Each adapter change needs its framework's
packed-app and browser suite, which I did not run.

## Verified and not verified

**Run** (scripts and output above, code in the appendix): the unit suite,
the package typecheck (and for A4 the whole repository's typecheck,
examples and docs site included), `bun run size` and Biome, for every spike
alone and for both combinations; the A1 timings on all four non-React
adapters; the recreated stage 2 adapter checks (Vue server leak,
`onServerPrefetch`, client mount, writable ref, `computed` granularity;
Angular NG0203 text, `{injector}`, write inside `computed`, granularity;
Solid timing, `flush()`, dispose, granularity) against the baseline and each
spike; the A5 hydration cases with `renderToString` and `hydrateRoot` under
happy-dom, the A5 heap measurement, the raw-write case; the A7 lookup
timings and behaviour cases, including `withHistory` undo and redo and direct
writes to the backing array; coverage of `collections.ts` with `a7b`;
`d1.patch` applied to `5ab613f` reproduces its own report's 16 failures and
3,824 bytes.

**Only read or reasoned:**

- Vue 3.2.0 was not installed and not downloaded, so contradiction 28 is
  settled by reasoning (A2), not by `tsc` on that version.
- The browser, framework, packed-app, memory and mutation suites were not
  run, as the brief says. The Vue, Angular and Solid changes rest on the unit
  suite under happy-dom and Bun's Solid server runtime, plus my scripts; a
  real Nuxt or Vite SSR page, an Angular application and Solid in a browser
  were not tried. The memory suite would likely catch A5.
- Timings are on one machine with other agents running; the A1 and A7
  differences are orders of magnitude, far outside the spread.
- A5's claim that the creation form fails the same hydration cases as the
  lazy form was run; its claim that a development warning on hydration errors
  would help is reasoning.
- The memory held by the A7 indexes was not measured.

## Not done

1. **The framework suites** for any adapter change (see above).
2. **`tsc` against Vue 3.2.0** for contradiction 28 (no download).
3. **Svelte**: A1 does not apply (the store contract hands the value over
   on notify); a `createSubscriber` binding (M69) that would defer the
   snapshot was not spiked.
4. **A5 alternatives**: the development warning was not built.
5. **A7**: the live index with M43 (private backing arrays) was not tried,
   nor a native `Map` or `Set` subclass (M38 (c)); memory of the indexes not
   measured; devtools time travel over a collection with a live index not
   tested.
6. **`benchmark:core:node`** was not run: one Bun pair took about an hour
   with other agents' benchmarks on the machine, and `combo` touches no core
   file. **Combination benchmarks with D1** were not rerun either; D1's own timings are in
   `spike-delivery.md`. My items do not touch the core except A5, which is
   not recommended.

## Appendix: patches and scripts

Each patch applies with `git apply` to a worktree at `5ab613f`. Scripts run
with `scripts/run.sh <worktree> <script>`, which copies the script into
that worktree so that framework imports resolve there, and sets `SRC` to
its `packages/classy-store/src`.

### `a1.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..636d0ae 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -1,12 +1,12 @@
-import {DestroyRef, inject, type Signal, signal} from '@angular/core';
+import {computed, DestroyRef, inject, type Signal, signal} from '@angular/core';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots as a readonly signal inside an Angular injection
- * context, such as a component field initializer or constructor. The signal
- * updates synchronously; Angular schedules rendering as usual. The injection
- * context's `DestroyRef` owns subscription cleanup.
+ * context, such as a component field initializer or constructor. A store
+ * write marks the signal changed at once; the snapshot is built when it is
+ * read. The injection context's `DestroyRef` owns subscription cleanup.
  */
 export function injectClassyStore<T extends object>(
   proxyStore: T,
@@ -19,21 +19,36 @@ export function injectClassyStore<T extends object>(
     );
   }
 
-  const state = signal(snapshot(proxyStore));
+  let current = snapshot(proxyStore);
+  let stale = false;
   let active = true;
+  const version = signal(0);
+  const state = computed(() => {
+    version();
+    if (stale) {
+      stale = false;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  });
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      if (active && !destroyRef.destroyed) {
+        stale = true;
+        version.update((n) => n + 1);
+      }
     },
     {sync: true},
   );
 
   destroyRef.onDestroy(() => {
+    // Keep the last write delivered before destruction.
+    state();
     active = false;
     unsubscribe();
   });
 
-  return state.asReadonly();
+  return state;
 }
diff --git a/packages/classy-store/src/frameworks/solid/solid.ts b/packages/classy-store/src/frameworks/solid/solid.ts
index a369a61..1d4178c 100644
--- a/packages/classy-store/src/frameworks/solid/solid.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.ts
@@ -4,8 +4,9 @@ import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots inside a Solid 2 component or live reactive root.
- * Store notifications reach Solid synchronously; Solid schedules its own updates.
- * The owner disposes the subscription. Use Solid's flush() for imperative reads.
+ * Store notifications reach Solid synchronously; the snapshot is built when
+ * the accessor is read. The owner disposes the subscription. Use Solid's
+ * flush() for imperative reads.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
@@ -18,27 +19,35 @@ export function useClassyStore<T extends object>(
     );
   }
 
-  // Snapshot construction returns an object/array; select the plain-value overload.
-  const [state, setState] = createSignal<Snapshot<T>>(
-    // biome-ignore lint/complexity/noBannedTypes: Matches Solid's exclusion of all callable initializers.
-    snapshot(proxyStore) as Exclude<Snapshot<T>, Function>,
-    {ownedWrite: true},
-  );
+  // The version is a Solid signal, so a read sees a write after Solid's flush,
+  // as with any signal. The snapshot is built once per version that is read.
+  const [version, setVersion] = createSignal(0, {ownedWrite: true});
+  let builtAt = 0;
+  let current = snapshot(proxyStore);
   let active = true;
+  const read = () => {
+    const seen = version();
+    if (seen !== builtAt) {
+      builtAt = seen;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  };
 
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // Another listener can dispose this owner during the same notification.
-      if (active && !isDisposed(owner)) setState(() => snapshot(proxyStore));
+      if (active && !isDisposed(owner)) setVersion((n) => n + 1);
     },
     {sync: true},
   );
 
   onCleanup(() => {
+    read();
     active = false;
     unsubscribe();
   });
 
-  return state;
+  return () => (active ? read() : current);
 }
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..4a027a4 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -1,11 +1,11 @@
-import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
+import {customRef, getCurrentScope, onScopeDispose, type Ref} from 'vue';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
- * Read immutable snapshots from a shallow ref inside setup() or an active
- * effect scope. Ref updates are synchronous; Vue batches rendering normally.
- * The scope owns subscription cleanup.
+ * Read immutable snapshots from a ref inside setup() or an active effect
+ * scope. A store write marks the ref changed at once; the snapshot is built
+ * when the ref is read. The scope owns subscription cleanup.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
@@ -17,21 +17,41 @@ export function useClassyStore<T extends object>(
     );
   }
 
-  const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
+  let current = snapshot(proxyStore);
+  let stale = false;
   let active = true;
-  const unsubscribe = subscribe(
-    proxyStore,
-    () => {
-      // A prior subscriber may stop this scope during the same notification.
-      if (active) state.value = snapshot(proxyStore);
-    },
-    {sync: true},
-  );
+  let unsubscribe = () => {};
+  const state = customRef((track, trigger) => {
+    unsubscribe = subscribe(
+      proxyStore,
+      () => {
+        // A prior subscriber may stop this scope during the same notification.
+        if (active) {
+          stale = true;
+          trigger();
+        }
+      },
+      {sync: true},
+    );
+    return {
+      get() {
+        track();
+        if (stale) {
+          stale = false;
+          current = snapshot(proxyStore);
+        }
+        return current;
+      },
+      set() {},
+    };
+  });
 
   onScopeDispose(() => {
+    // Keep the last write delivered before the scope stopped.
+    void state.value;
     active = false;
     unsubscribe();
   });
 
-  return state;
+  return state as Ref<Snapshot<T>>;
 }
```

### `a1a2-vue.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..2d28f67 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -1,15 +1,24 @@
-import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
+import {
+  customRef,
+  getCurrentInstance,
+  getCurrentScope,
+  inject,
+  onScopeDispose,
+  type Ref,
+  ssrContextKey,
+} from 'vue';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
- * Read immutable snapshots from a shallow ref inside setup() or an active
- * effect scope. Ref updates are synchronous; Vue batches rendering normally.
- * The scope owns subscription cleanup.
+ * Read immutable snapshots from a read-only ref inside setup() or an active
+ * effect scope. A store write marks the ref changed at once; the snapshot is
+ * built when the ref is read. A component rendered on the server reads the
+ * store at each read and does not subscribe. The scope owns cleanup.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
-): Ref<Snapshot<T>> {
+): Readonly<Ref<Snapshot<T>>> {
   getInternal(proxyStore);
   if (!getCurrentScope()?.active) {
     throw new Error(
@@ -17,18 +26,43 @@ export function useClassyStore<T extends object>(
     );
   }
 
-  const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
+  // A server render never stops the component's scope, so a listener added
+  // there would stay for good.
+  const server = !!getCurrentInstance() && !!inject(ssrContextKey, null);
+  let current = snapshot(proxyStore);
+  let stale: boolean = server;
   let active = true;
-  const unsubscribe = subscribe(
-    proxyStore,
-    () => {
-      // A prior subscriber may stop this scope during the same notification.
-      if (active) state.value = snapshot(proxyStore);
-    },
-    {sync: true},
-  );
+  let unsubscribe = () => {};
+  const state = customRef((track, trigger) => {
+    if (!server) {
+      unsubscribe = subscribe(
+        proxyStore,
+        () => {
+          // A prior subscriber may stop this scope during the same notification.
+          if (active) {
+            stale = true;
+            trigger();
+          }
+        },
+        {sync: true},
+      );
+    }
+    return {
+      get() {
+        track();
+        if (stale) {
+          stale = server;
+          current = snapshot(proxyStore);
+        }
+        return current;
+      },
+      set() {},
+    };
+  });
 
   onScopeDispose(() => {
+    // Keep the last write delivered before the scope stopped.
+    void state.value;
     active = false;
     unsubscribe();
   });
```

### `a2.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..48703a4 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -1,15 +1,24 @@
-import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
+import {
+  getCurrentInstance,
+  getCurrentScope,
+  inject,
+  onScopeDispose,
+  type Ref,
+  shallowRef,
+  ssrContextKey,
+} from 'vue';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots from a shallow ref inside setup() or an active
  * effect scope. Ref updates are synchronous; Vue batches rendering normally.
- * The scope owns subscription cleanup.
+ * A component rendered on the server does not subscribe. The scope owns
+ * subscription cleanup.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
-): Ref<Snapshot<T>> {
+): Readonly<Ref<Snapshot<T>>> {
   getInternal(proxyStore);
   if (!getCurrentScope()?.active) {
     throw new Error(
@@ -18,6 +27,9 @@ export function useClassyStore<T extends object>(
   }
 
   const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
+  // A server render never stops the component's scope, so it would keep the
+  // listener for good. It renders the snapshot taken here.
+  if (getCurrentInstance() && inject(ssrContextKey, null)) return state;
   let active = true;
   const unsubscribe = subscribe(
     proxyStore,
```

### `a3-untracked-only.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..cb7be16 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -1,4 +1,4 @@
-import {DestroyRef, inject, type Signal, signal} from '@angular/core';
+import {DestroyRef, inject, type Signal, signal, untracked} from '@angular/core';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
@@ -25,7 +25,8 @@ export function injectClassyStore<T extends object>(
     proxyStore,
     () => {
       // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      if (active && !destroyRef.destroyed)
+        untracked(() => state.set(snapshot(proxyStore)));
     },
     {sync: true},
   );
```

### `a3.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..6f2a45c 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -1,21 +1,32 @@
-import {DestroyRef, inject, type Signal, signal} from '@angular/core';
+import {
+  assertInInjectionContext,
+  DestroyRef,
+  type Injector,
+  inject,
+  type Signal,
+  signal,
+  untracked,
+} from '@angular/core';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots as a readonly signal inside an Angular injection
- * context, such as a component field initializer or constructor. The signal
- * updates synchronously; Angular schedules rendering as usual. The injection
- * context's `DestroyRef` owns subscription cleanup.
+ * context, such as a component field initializer or constructor, or anywhere
+ * with `{injector}`. The signal updates synchronously; Angular schedules
+ * rendering as usual. The injector's `DestroyRef` owns subscription cleanup.
  */
 export function injectClassyStore<T extends object>(
   proxyStore: T,
+  options?: {injector?: Injector},
 ): Signal<Snapshot<T>> {
   getInternal(proxyStore);
-  const destroyRef = inject(DestroyRef);
+  const injector = options?.injector;
+  if (!injector) assertInInjectionContext(injectClassyStore);
+  const destroyRef = injector ? injector.get(DestroyRef) : inject(DestroyRef);
   if (destroyRef.destroyed) {
     throw new Error(
-      'injectClassyStore requires a live Angular injection context.',
+      '@codebelt/classy-store/angular: injectClassyStore() requires a live Angular injection context or injector',
     );
   }
 
@@ -25,7 +36,9 @@ export function injectClassyStore<T extends object>(
     proxyStore,
     () => {
       // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      // untracked(): a store write made while a computed runs must still land.
+      if (active && !destroyRef.destroyed)
+        untracked(() => state.set(snapshot(proxyStore)));
     },
     {sync: true},
   );
```

### `a4.patch`

```diff
diff --git a/examples/solid/src/App.tsx b/examples/solid/src/App.tsx
index ff18625..b3ca514 100644
--- a/examples/solid/src/App.tsx
+++ b/examples/solid/src/App.tsx
@@ -1,8 +1,8 @@
-import {useClassyStore} from '@codebelt/classy-store/solid';
+import {fromClassyStore} from '@codebelt/classy-store/solid';
 import {counterStore, history} from './store';
 
 export function App() {
-  const snap = useClassyStore(counterStore);
+  const snap = fromClassyStore(counterStore);
 
   return (
     <div
diff --git a/packages/classy-store/src/frameworks/solid/solid.test.ts b/packages/classy-store/src/frameworks/solid/solid.test.ts
index 3937dff..f1b1976 100644
--- a/packages/classy-store/src/frameworks/solid/solid.test.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.test.ts
@@ -2,17 +2,17 @@ import {describe, expect, it} from 'bun:test';
 import {createRoot, getOwner, runWithOwner} from 'solid-js';
 import {createClassyStore, getInternal, subscribe} from '../../core/core';
 import {snapshot} from '../../snapshot/snapshot';
-import {useClassyStore} from './solid';
+import {fromClassyStore} from './solid';
 
 // Bun resolves Solid's server runtime. Client scheduling is tested in Playwright.
-describe('solid useClassyStore', () => {
+describe('solid fromClassyStore', () => {
   it('validates the store before checking ownership', () => {
-    expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
+    expect(() => fromClassyStore({count: 0})).toThrow(/not a store proxy/);
   });
 
   it('rejects calls without an owner before subscribing', () => {
     const store = createClassyStore({count: 0});
-    expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+    expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
   });
@@ -25,7 +25,7 @@ describe('solid useClassyStore', () => {
       return current;
     });
     runWithOwner(owner, () => {
-      expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+      expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     });
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
@@ -35,7 +35,7 @@ describe('solid useClassyStore', () => {
     const store = createClassyStore({count: 5, nested: {label: 'Initial'}});
     createRoot((dispose) => {
       try {
-        const state = useClassyStore(store);
+        const state = fromClassyStore(store);
         expect(state()).toBe(snapshot(store));
         expect(Object.isFrozen(state())).toBe(true);
         expect(Object.isFrozen(state().nested)).toBe(true);
@@ -48,11 +48,11 @@ describe('solid useClassyStore', () => {
   it('cleans up independent roots and reads fresh state on remount', async () => {
     const store = createClassyStore({count: 0});
     const first = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     const second = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     try {
@@ -72,7 +72,7 @@ describe('solid useClassyStore', () => {
     expect(getInternal(store).batchedListeners.size).toBe(0);
     createRoot((dispose) => {
       try {
-        expect(useClassyStore(store)().count).toBe(2);
+        expect(fromClassyStore(store)().count).toBe(2);
       } finally {
         dispose();
       }
@@ -82,8 +82,8 @@ describe('solid useClassyStore', () => {
   it('disposes subscriptions in nested roots with their parent', () => {
     const store = createClassyStore({count: 0});
     const dispose = createRoot((stopParent) => {
-      useClassyStore(store);
-      createRoot(() => useClassyStore(store));
+      fromClassyStore(store);
+      createRoot(() => fromClassyStore(store));
       return stopParent;
     });
     try {
@@ -101,7 +101,7 @@ describe('solid useClassyStore', () => {
     const stop = subscribe(store, () => dispose(), {sync: true});
     const state = createRoot((stopRoot) => {
       dispose = stopRoot;
-      return useClassyStore(store);
+      return fromClassyStore(store);
     });
     try {
       store.count = 1;
diff --git a/packages/classy-store/src/frameworks/solid/solid.ts b/packages/classy-store/src/frameworks/solid/solid.ts
index a369a61..8a48c95 100644
--- a/packages/classy-store/src/frameworks/solid/solid.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.ts
@@ -7,14 +7,14 @@ import type {Snapshot} from '../../types';
  * Store notifications reach Solid synchronously; Solid schedules its own updates.
  * The owner disposes the subscription. Use Solid's flush() for imperative reads.
  */
-export function useClassyStore<T extends object>(
+export function fromClassyStore<T extends object>(
   proxyStore: T,
 ): () => Snapshot<T> {
   getInternal(proxyStore);
   const owner = getOwner();
   if (!owner || isDisposed(owner)) {
     throw new Error(
-      '@codebelt/classy-store/solid: useClassyStore() requires an active Solid owner; call it in a component or createRoot()',
+      '@codebelt/classy-store/solid: fromClassyStore() requires an active Solid owner; call it in a component or createRoot()',
     );
   }
 
diff --git a/packages/classy-store/src/types.solid.test.ts b/packages/classy-store/src/types.solid.test.ts
index 1523541..a704241 100644
--- a/packages/classy-store/src/types.solid.test.ts
+++ b/packages/classy-store/src/types.solid.test.ts
@@ -1,6 +1,6 @@
 import {describe, expect, expectTypeOf, test} from 'bun:test';
 import * as entry from './frameworks/solid/solid';
-import {useClassyStore} from './frameworks/solid/solid';
+import {fromClassyStore} from './frameworks/solid/solid';
 import type {Snapshot} from './index';
 
 // Type tests for `@codebelt/classy-store/solid`. The primitive is never called
@@ -9,19 +9,19 @@ import type {Snapshot} from './index';
 type Counter = {count: number; nested: {label: string}};
 
 describe('solid entry point types', () => {
-  test('the entry exports one value, useClassyStore', () => {
-    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'useClassyStore'>();
-    expect(Object.keys(entry)).toEqual(['useClassyStore']);
+  test('the entry exports one value, fromClassyStore', () => {
+    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'fromClassyStore'>();
+    expect(Object.keys(entry)).toEqual(['fromClassyStore']);
   });
 
-  test('useClassyStore accepts any object and returns an accessor of its Snapshot', () => {
-    expectTypeOf(useClassyStore).toEqualTypeOf<
+  test('fromClassyStore accepts any object and returns an accessor of its Snapshot', () => {
+    expectTypeOf(fromClassyStore).toEqualTypeOf<
       <T extends object>(proxyStore: T) => () => Snapshot<T>
     >();
   });
 
   test('the accessor takes no argument and yields a deeply readonly value', () => {
-    expectTypeOf(useClassyStore<Counter>).toEqualTypeOf<
+    expectTypeOf(fromClassyStore<Counter>).toEqualTypeOf<
       (proxyStore: Counter) => () => {
         readonly count: number;
         readonly nested: {readonly label: string};
diff --git a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
index 99d6249..146cb3a 100644
--- a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
+++ b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
@@ -1,10 +1,10 @@
 import {For} from '@solidjs/web';
 import {createEffect, createMemo, createSignal, flush} from 'solid-js';
-import {useClassyStore} from '../../../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../../../src/frameworks/solid/solid';
 import {formStore, probe} from '../../solid.store';
 
 export function SolidForm() {
-  const state = useClassyStore(formStore);
+  const state = fromClassyStore(formStore);
   const uppercase = createMemo(() => state().text.toUpperCase());
   const summary = createMemo(
     () => `${state().text}:${state().doubled}:${uppercase()}`,
diff --git a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
index ea627d1..14549fe 100644
--- a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
+++ b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
@@ -10,14 +10,14 @@ import {
   getInternal,
   subscribe,
 } from '../../../src/core/core';
-import {useClassyStore} from '../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../src/frameworks/solid/solid';
 
 export function lifecycleProbe() {
   const store = createClassyStore({count: 0});
   const errors: string[] = [];
   function expectRejection() {
     try {
-      useClassyStore(store);
+      fromClassyStore(store);
     } catch (error) {
       errors.push(String(error));
     }
@@ -34,7 +34,7 @@ export function lifecycleProbe() {
   const secondValues: number[] = [];
   const parent = createRoot((dispose) => {
     createRoot(() => {
-      const state = useClassyStore(store);
+      const state = fromClassyStore(store);
       createEffect(
         () => state().count,
         (value) => {
@@ -45,7 +45,7 @@ export function lifecycleProbe() {
     return {dispose, owner: getOwner()};
   });
   const stopSecond = createRoot((dispose) => {
-    const state = useClassyStore(store);
+    const state = fromClassyStore(store);
     createEffect(
       () => state().count,
       (value) => {
@@ -72,7 +72,7 @@ export function lifecycleProbe() {
   const stopKiller = subscribe(store, () => stopVictim(), {sync: true});
   const victim = createRoot((dispose) => {
     stopVictim = dispose;
-    return useClassyStore(store);
+    return fromClassyStore(store);
   });
   store.count = 3;
   flush();
```

### `a5-creation.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..84bd407 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -209,6 +209,16 @@ export function getInternal(proxy: object): StoreInternal {
   return internal;
 }
 
+// ── First write ───────────────────────────────────────────────────────────────
+
+/** Set by the React entries: told about each node once, before its first write. */
+let beforeFirstWrite: ((node: StoreInternal) => void) | undefined;
+
+export function onFirstWrite(hook: (node: StoreInternal) => void): void {
+  beforeFirstWrite = hook;
+}
+
+
 // ── Mutation notification ─────────────────────────────────────────────────────
 
 /**
@@ -567,6 +577,7 @@ export function createClassyStore<T extends object>(instance: T): T {
   const node = createNode(instance);
   node.isStoreRoot = true;
   node.resumeScope();
+  beforeFirstWrite?.(node);
   return node.proxy as T;
 }
 
diff --git a/packages/classy-store/src/frameworks/react/react.ts b/packages/classy-store/src/frameworks/react/react.ts
index f99d288..e24a44d 100644
--- a/packages/classy-store/src/frameworks/react/react.ts
+++ b/packages/classy-store/src/frameworks/react/react.ts
@@ -1,5 +1,9 @@
 'use client';
 
+import {captureBeforeFirstWrite} from '../../storeRuntime';
+
+captureBeforeFirstWrite();
+
 export {useClassyStore} from './hooks/useClassyStore/useClassyStore';
 export type {UseClassyStoreSelectorOptions} from './hooks/useClassyStore/useClassyStore.types';
 export {useHistoryStatus} from './hooks/useHistoryStatus/useHistoryStatus';
diff --git a/packages/classy-store/src/frameworks/react/server.ts b/packages/classy-store/src/frameworks/react/server.ts
index cbdcce5..a8e5e92 100644
--- a/packages/classy-store/src/frameworks/react/server.ts
+++ b/packages/classy-store/src/frameworks/react/server.ts
@@ -1,4 +1,11 @@
-import {getInternal, hydrationSnapshots, snapshot} from '../../storeRuntime';
+import {
+  captureBeforeFirstWrite,
+  getInternal,
+  hydrationSnapshots,
+  snapshot,
+} from '../../storeRuntime';
+
+captureBeforeFirstWrite();
 
 /**
  * Capture the initial snapshot used for server rendering and client hydration.
diff --git a/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts b/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
index da3fb52..4572f2f 100644
--- a/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
+++ b/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
@@ -1,4 +1,18 @@
+import {onFirstWrite} from '../../../../core/core';
+import {snapshot} from '../../../../snapshot/snapshot';
+
 // Shared by the server-safe preparation entry and the client hooks in each
 // module graph. A late Suspense boundary may need initial data after an earlier
 // consumer has hydrated and changed the live store.
 export const hydrationSnapshots = new WeakMap<object, object>();
+
+/** Keep each store's state from before its first write, for hydration. */
+export function captureBeforeFirstWrite(): void {
+  onFirstWrite((node) => {
+    for (const owner of node.ancestors()) {
+      if (owner.isStoreRoot && !hydrationSnapshots.has(owner.proxy)) {
+        hydrationSnapshots.set(owner.proxy, snapshot(owner.proxy));
+      }
+    }
+  });
+}
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..c9fe6bc 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -7,9 +7,13 @@ export {
   getVersion,
   identityOf,
   isTrackingProxy,
+  onFirstWrite,
   registerTrackingProxy,
   subscribe,
   unwrap,
 } from './core/core';
-export {hydrationSnapshots} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
+export {
+  captureBeforeFirstWrite,
+  hydrationSnapshots,
+} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
 export {originalSnapshotAccessor, snapshot} from './snapshot/snapshot';
```

### `a5-lazy.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..7442d73 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -209,6 +209,22 @@ export function getInternal(proxy: object): StoreInternal {
   return internal;
 }
 
+// ── First write ───────────────────────────────────────────────────────────────
+
+/** Set by the React entries: told about each node once, before its first write. */
+let beforeFirstWrite: ((node: StoreInternal) => void) | undefined;
+
+export function onFirstWrite(hook: (node: StoreInternal) => void): void {
+  beforeFirstWrite = hook;
+}
+
+function willWrite(internal: StoreInternal): void {
+  if (beforeFirstWrite && !internal.written) {
+    internal.written = true;
+    beforeFirstWrite(internal);
+  }
+}
+
 // ── Mutation notification ─────────────────────────────────────────────────────
 
 /**
@@ -425,6 +441,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
             (previousChild.proxy === value || previousChild.target === value)))
       )
         return true;
+      willWrite(internal);
       const oldLength =
         Array.isArray(_target) && prop === 'length'
           ? _target.length
@@ -514,6 +531,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      if (Object.hasOwn(_target, prop)) willWrite(internal);
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..5287747 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -6,6 +6,8 @@ type ParentReference = {deref(): StoreInternal | undefined};
 export class StoreInternal {
   version = 0;
   isStoreRoot = false;
+  /** Set before the first write through the proxy, when a hook asks. */
+  written = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
diff --git a/packages/classy-store/src/frameworks/react/react.ts b/packages/classy-store/src/frameworks/react/react.ts
index f99d288..e24a44d 100644
--- a/packages/classy-store/src/frameworks/react/react.ts
+++ b/packages/classy-store/src/frameworks/react/react.ts
@@ -1,5 +1,9 @@
 'use client';
 
+import {captureBeforeFirstWrite} from '../../storeRuntime';
+
+captureBeforeFirstWrite();
+
 export {useClassyStore} from './hooks/useClassyStore/useClassyStore';
 export type {UseClassyStoreSelectorOptions} from './hooks/useClassyStore/useClassyStore.types';
 export {useHistoryStatus} from './hooks/useHistoryStatus/useHistoryStatus';
diff --git a/packages/classy-store/src/frameworks/react/server.ts b/packages/classy-store/src/frameworks/react/server.ts
index cbdcce5..a8e5e92 100644
--- a/packages/classy-store/src/frameworks/react/server.ts
+++ b/packages/classy-store/src/frameworks/react/server.ts
@@ -1,4 +1,11 @@
-import {getInternal, hydrationSnapshots, snapshot} from '../../storeRuntime';
+import {
+  captureBeforeFirstWrite,
+  getInternal,
+  hydrationSnapshots,
+  snapshot,
+} from '../../storeRuntime';
+
+captureBeforeFirstWrite();
 
 /**
  * Capture the initial snapshot used for server rendering and client hydration.
diff --git a/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts b/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
index da3fb52..4572f2f 100644
--- a/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
+++ b/packages/classy-store/src/frameworks/react/utils/hydrationSnapshots/hydrationSnapshots.ts
@@ -1,4 +1,18 @@
+import {onFirstWrite} from '../../../../core/core';
+import {snapshot} from '../../../../snapshot/snapshot';
+
 // Shared by the server-safe preparation entry and the client hooks in each
 // module graph. A late Suspense boundary may need initial data after an earlier
 // consumer has hydrated and changed the live store.
 export const hydrationSnapshots = new WeakMap<object, object>();
+
+/** Keep each store's state from before its first write, for hydration. */
+export function captureBeforeFirstWrite(): void {
+  onFirstWrite((node) => {
+    for (const owner of node.ancestors()) {
+      if (owner.isStoreRoot && !hydrationSnapshots.has(owner.proxy)) {
+        hydrationSnapshots.set(owner.proxy, snapshot(owner.proxy));
+      }
+    }
+  });
+}
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..c9fe6bc 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -7,9 +7,13 @@ export {
   getVersion,
   identityOf,
   isTrackingProxy,
+  onFirstWrite,
   registerTrackingProxy,
   subscribe,
   unwrap,
 } from './core/core';
-export {hydrationSnapshots} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
+export {
+  captureBeforeFirstWrite,
+  hydrationSnapshots,
+} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
 export {originalSnapshotAccessor, snapshot} from './snapshot/snapshot';
```

### `a6-on-d1.patch`

```diff
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..6cb5a60 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -20,20 +20,16 @@ export function injectClassyStore<T extends object>(
   }
 
   const state = signal(snapshot(proxyStore));
-  let active = true;
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      if (!destroyRef.destroyed) state.set(snapshot(proxyStore));
     },
     {sync: true},
   );
 
-  destroyRef.onDestroy(() => {
-    active = false;
-    unsubscribe();
-  });
+  destroyRef.onDestroy(unsubscribe);
 
   return state.asReadonly();
 }
diff --git a/packages/classy-store/src/frameworks/solid/solid.ts b/packages/classy-store/src/frameworks/solid/solid.ts
index a369a61..1abc300 100644
--- a/packages/classy-store/src/frameworks/solid/solid.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.ts
@@ -24,21 +24,17 @@ export function useClassyStore<T extends object>(
     snapshot(proxyStore) as Exclude<Snapshot<T>, Function>,
     {ownedWrite: true},
   );
-  let active = true;
 
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // Another listener can dispose this owner during the same notification.
-      if (active && !isDisposed(owner)) setState(() => snapshot(proxyStore));
+      if (!isDisposed(owner)) setState(() => snapshot(proxyStore));
     },
     {sync: true},
   );
 
-  onCleanup(() => {
-    active = false;
-    unsubscribe();
-  });
+  onCleanup(unsubscribe);
 
   return state;
 }
diff --git a/packages/classy-store/src/frameworks/svelte/svelte.ts b/packages/classy-store/src/frameworks/svelte/svelte.ts
index 3925b6f..2aba9a4 100644
--- a/packages/classy-store/src/frameworks/svelte/svelte.ts
+++ b/packages/classy-store/src/frameworks/svelte/svelte.ts
@@ -23,18 +23,10 @@ export function toSvelteStore<T extends object>(
 
   return {
     subscribe(run: (value: Snapshot<T>) => void): () => void {
-      let active = true;
-      const notify = () => {
-        // Another subscriber can unsubscribe this one during notification.
-        if (active) run(snapshot(proxyStore));
-      };
+      const notify = () => run(snapshot(proxyStore));
       // Subscribe before the initial callback so its mutations are observed too.
       // Svelte requires synchronous delivery; ordinary core subscribers still batch.
-      const unsubscribeCore = coreSubscribe(proxyStore, notify, {sync: true});
-      const unsubscribe = () => {
-        active = false;
-        unsubscribeCore();
-      };
+      const unsubscribe = coreSubscribe(proxyStore, notify, {sync: true});
 
       try {
         notify();
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..faf9fb7 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -18,20 +18,15 @@ export function useClassyStore<T extends object>(
   }
 
   const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
-  let active = true;
   const unsubscribe = subscribe(
     proxyStore,
     () => {
-      // A prior subscriber may stop this scope during the same notification.
-      if (active) state.value = snapshot(proxyStore);
+      state.value = snapshot(proxyStore);
     },
     {sync: true},
   );
 
-  onScopeDispose(() => {
-    active = false;
-    unsubscribe();
-  });
+  onScopeDispose(unsubscribe);
 
   return state;
 }
```

### `a7-m39.patch`

```diff
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..779cb68 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -3,6 +3,19 @@ import {PROXYABLE} from '../utils/internal/internal';
 
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
+/**
+ * The key a member is matched by: one identity for a raw object, its store
+ * proxy and every snapshot of it; a primitive is itself, with `-0` as `0`,
+ * as in a native `Map` or `Set`.
+ */
+function keyOf(member: unknown): unknown {
+  return typeof member === 'object' && member !== null
+    ? identityOf(member)
+    : member === 0
+      ? 0
+      : member;
+}
+
 /**
  * Find a key (map) or value (set) in a backing array.
  *
@@ -18,16 +31,12 @@ function indexOfMember(
   member: unknown,
   keyed: boolean,
 ): number {
-  const wanted = identityOf(member);
+  const wanted = keyOf(member);
   const source = isTrackingProxy(backing) ? backing : unwrap(backing);
   for (let index = 0; index < source.length; index++) {
     const entry = source[index];
     const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
-    const identity =
-      typeof candidate === 'object' && candidate !== null
-        ? identityOf(candidate)
-        : candidate;
-    if (Object.is(identity, wanted)) return index;
+    if (Object.is(keyOf(candidate), wanted)) return index;
   }
   return -1;
 }
@@ -56,14 +65,14 @@ export class ReactiveMap<K, V> {
   /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
   constructor(initial?: Iterable<[K, V]>) {
     if (initial) {
-      // Track key → index for O(1) dedupe instead of O(n) linear scan.
-      const indexByKey = new Map<K, number>();
+      // Match keys as `set` does, with an index for O(1) dedupe.
+      const indexByKey = new Map<unknown, number>();
       for (const [k, v] of initial) {
-        const existing = indexByKey.get(k);
+        const existing = indexByKey.get(keyOf(k));
         if (existing !== undefined) {
-          this._entries[existing] = [k, v];
+          this._entries[existing][1] = v;
         } else {
-          indexByKey.set(k, this._entries.length);
+          indexByKey.set(keyOf(k), this._entries.length);
           this._entries.push([k, v]);
         }
       }
@@ -211,11 +220,11 @@ export class ReactiveSet<T> {
   /** Deduplicates initial values using `Object.is` comparison. */
   constructor(initial?: Iterable<T>) {
     if (initial) {
-      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
-      const seen = new Set<T>();
+      // Match values as `add` does, with a native Set for O(1) dedupe.
+      const seen = new Set<unknown>();
       for (const v of initial) {
-        if (!seen.has(v)) {
-          seen.add(v);
+        if (!seen.has(keyOf(v))) {
+          seen.add(keyOf(v));
           this._items.push(v);
         }
       }
```

### `a7a.patch`

```diff
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..f30acdf 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -3,33 +3,75 @@ import {PROXYABLE} from '../utils/internal/internal';
 
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
+/**
+ * The key a member is matched by: one identity for a raw object, its store
+ * proxy and every snapshot of it; a primitive is itself, with `-0` as `0`,
+ * as in a native `Map` or `Set`.
+ */
+function keyOf(member: unknown): unknown {
+  return typeof member === 'object' && member !== null
+    ? identityOf(member)
+    : member === 0
+      ? 0
+      : member;
+}
+
+/**
+ * Index from key to position for frozen backing arrays (snapshots). `null`
+ * marks an array looked up once: the second lookup builds the index.
+ */
+const snapshotIndexes = new WeakMap<
+  readonly unknown[],
+  Map<unknown, number> | null
+>();
+
+function scan(
+  source: readonly unknown[],
+  keyed: boolean,
+  from: number,
+  visit: (key: unknown, index: number) => boolean | undefined,
+): number {
+  for (let index = from; index < source.length; index++) {
+    const entry = source[index];
+    if (visit(keyOf(keyed ? (entry as readonly unknown[])[0] : entry), index))
+      return index;
+  }
+  return -1;
+}
+
 /**
  * Find a key (map) or value (set) in a backing array.
  *
- * Members are compared by identity, so an object matches whether it is given
- * raw, as a store proxy, or as a snapshot of the same object; primitives use
- * `Object.is`. Live state and plain snapshots are scanned on the raw array,
- * with no proxy work per entry. A tracked read in a React component still goes
- * entry by entry through its proxy, so that the component records what it
- * compared.
+ * A snapshot's array is frozen, so an index built on its second lookup never
+ * goes stale. Live state is scanned on the raw array, with no proxy work per
+ * entry. A tracked read in a React component still goes entry by entry
+ * through its proxy, so that the component records what it compared.
  */
 function indexOfMember(
   backing: readonly unknown[],
   member: unknown,
   keyed: boolean,
 ): number {
-  const wanted = identityOf(member);
-  const source = isTrackingProxy(backing) ? backing : unwrap(backing);
-  for (let index = 0; index < source.length; index++) {
-    const entry = source[index];
-    const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
-    const identity =
-      typeof candidate === 'object' && candidate !== null
-        ? identityOf(candidate)
-        : candidate;
-    if (Object.is(identity, wanted)) return index;
+  const wanted = keyOf(member);
+  const tracked = isTrackingProxy(backing);
+  const source = tracked ? backing : unwrap(backing);
+  let index = tracked ? undefined : snapshotIndexes.get(source);
+  if (index === null) {
+    const built = new Map<unknown, number>();
+    // The first of two equal members wins.
+    scan(source, keyed, 0, (key, at) => {
+      if (!built.has(key)) built.set(key, at);
+    });
+    snapshotIndexes.set(source, built);
+    index = built;
   }
-  return -1;
+  if (index) return index.get(wanted) ?? -1;
+  // A snapshot has a source of its own; `Object.isFrozen` would read every
+  // element.
+  if (!tracked && source === backing && identityOf(source) !== source) {
+    snapshotIndexes.set(source, null);
+  }
+  return scan(source, keyed, 0, (key) => Object.is(key, wanted));
 }
 
 // ── ReactiveMap ───────────────────────────────────────────────────────────────
@@ -56,14 +98,14 @@ export class ReactiveMap<K, V> {
   /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
   constructor(initial?: Iterable<[K, V]>) {
     if (initial) {
-      // Track key → index for O(1) dedupe instead of O(n) linear scan.
-      const indexByKey = new Map<K, number>();
+      // Match keys as `set` does, with an index for O(1) dedupe.
+      const indexByKey = new Map<unknown, number>();
       for (const [k, v] of initial) {
-        const existing = indexByKey.get(k);
+        const existing = indexByKey.get(keyOf(k));
         if (existing !== undefined) {
-          this._entries[existing] = [k, v];
+          this._entries[existing][1] = v;
         } else {
-          indexByKey.set(k, this._entries.length);
+          indexByKey.set(keyOf(k), this._entries.length);
           this._entries.push([k, v]);
         }
       }
@@ -211,11 +253,11 @@ export class ReactiveSet<T> {
   /** Deduplicates initial values using `Object.is` comparison. */
   constructor(initial?: Iterable<T>) {
     if (initial) {
-      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
-      const seen = new Set<T>();
+      // Match values as `add` does, with a native Set for O(1) dedupe.
+      const seen = new Set<unknown>();
       for (const v of initial) {
-        if (!seen.has(v)) {
-          seen.add(v);
+        if (!seen.has(keyOf(v))) {
+          seen.add(keyOf(v));
           this._items.push(v);
         }
       }
```

### `a7b.patch`

```diff
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..b9a5b3e 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -1,35 +1,119 @@
-import {identityOf, isTrackingProxy, unwrap} from '../storeRuntime';
+import {getVersion, identityOf, isTrackingProxy, unwrap} from '../storeRuntime';
 import {PROXYABLE} from '../utils/internal/internal';
 
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
+/**
+ * The key a member is matched by: one identity for a raw object, its store
+ * proxy and every snapshot of it; a primitive is itself, with `-0` as `0`,
+ * as in a native `Map` or `Set`.
+ */
+function keyOf(member: unknown): unknown {
+  return typeof member === 'object' && member !== null
+    ? identityOf(member)
+    : member === 0
+      ? 0
+      : member;
+}
+
+/**
+ * Index from key to position, per backing array. A snapshot's array is frozen,
+ * so its index never goes stale; `null` marks one looked up once, and the
+ * second lookup builds it. A live array's index holds the version it is
+ * current for. The collection's own methods keep it current; any other write
+ * makes it suspect: a hit is checked against the array, a miss rebuilds it.
+ */
+const indexes = new WeakMap<
+  readonly unknown[],
+  {version: number; map: Map<unknown, number>} | null
+>();
+
+function keyAt(source: readonly unknown[], keyed: boolean, at: number) {
+  const entry = source[at];
+  return keyOf(keyed ? (entry as readonly unknown[])[0] : entry);
+}
+
+function build(source: readonly unknown[], keyed: boolean, version: number) {
+  const map = new Map<unknown, number>();
+  // The first of two equal members wins.
+  for (let at = source.length; at--; ) map.set(keyAt(source, keyed, at), at);
+  indexes.set(source, {version, map});
+  return map;
+}
+
 /**
  * Find a key (map) or value (set) in a backing array.
  *
- * Members are compared by identity, so an object matches whether it is given
- * raw, as a store proxy, or as a snapshot of the same object; primitives use
- * `Object.is`. Live state and plain snapshots are scanned on the raw array,
- * with no proxy work per entry. A tracked read in a React component still goes
- * entry by entry through its proxy, so that the component records what it
- * compared.
+ * Members are compared by `keyOf`. Live state and snapshots go through an
+ * index. A tracked read in a React component, and a collection outside every
+ * store, scan entry by entry; the tracked read goes through its proxy, so that
+ * the component records what it compared.
  */
 function indexOfMember(
   backing: readonly unknown[],
   member: unknown,
   keyed: boolean,
 ): number {
-  const wanted = identityOf(member);
-  const source = isTrackingProxy(backing) ? backing : unwrap(backing);
+  const wanted = keyOf(member);
+  const tracked = isTrackingProxy(backing);
+  const source = tracked ? backing : unwrap(backing);
+  const live = source !== backing;
+  const cached = tracked ? undefined : indexes.get(source);
+  const version = live ? getVersion(backing) : 0;
+  if (cached?.version === version) return cached.map.get(wanted) ?? -1;
+  const at = cached?.map.get(wanted);
+  if (
+    at !== undefined &&
+    at < source.length &&
+    Object.is(keyAt(source, keyed, at), wanted)
+  )
+    return at;
+  let found = -1;
   for (let index = 0; index < source.length; index++) {
-    const entry = source[index];
-    const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
-    const identity =
-      typeof candidate === 'object' && candidate !== null
-        ? identityOf(candidate)
-        : candidate;
-    if (Object.is(identity, wanted)) return index;
+    if (Object.is(keyAt(source, keyed, index), wanted)) {
+      found = index;
+      break;
+    }
+  }
+  // Index a live array on its first lookup, and a snapshot's on its second.
+  // A suspect index is rebuilt only when it missed a member that is there.
+  if (!tracked && (live || identityOf(source) !== source)) {
+    if (cached === undefined && !live) indexes.set(source, null);
+    else if (!cached || found !== -1) build(source, keyed, version);
+  }
+  return found;
+}
+
+/** After a removal at `from`, move every later member down one place. */
+function shift(
+  map: Map<unknown, number>,
+  source: unknown[],
+  keyed: boolean,
+  from: number,
+  removed: unknown,
+): void {
+  map.delete(keyOf(removed));
+  for (let at = from; at < source.length; at++)
+    map.set(keyAt(source, keyed, at), at);
+}
+
+/**
+ * Run a write the collection makes to its own live array, and keep the index
+ * current when it was current before the write.
+ */
+function own(
+  backing: unknown[],
+  write: () => void,
+  update?: (map: Map<unknown, number>, source: unknown[]) => void,
+): void {
+  const source = unwrap(backing);
+  const before = source !== backing ? getVersion(backing) : -1;
+  write();
+  const cached = indexes.get(source);
+  if (cached && cached.version === before) {
+    update?.(cached.map, source);
+    cached.version = getVersion(backing);
   }
-  return -1;
 }
 
 // ── ReactiveMap ───────────────────────────────────────────────────────────────
@@ -56,14 +140,14 @@ export class ReactiveMap<K, V> {
   /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
   constructor(initial?: Iterable<[K, V]>) {
     if (initial) {
-      // Track key → index for O(1) dedupe instead of O(n) linear scan.
-      const indexByKey = new Map<K, number>();
+      // Match keys as `set` does, with an index for O(1) dedupe.
+      const indexByKey = new Map<unknown, number>();
       for (const [k, v] of initial) {
-        const existing = indexByKey.get(k);
+        const existing = indexByKey.get(keyOf(k));
         if (existing !== undefined) {
-          this._entries[existing] = [k, v];
+          this._entries[existing][1] = v;
         } else {
-          indexByKey.set(k, this._entries.length);
+          indexByKey.set(keyOf(k), this._entries.length);
           this._entries.push([k, v]);
         }
       }
@@ -93,9 +177,15 @@ export class ReactiveMap<K, V> {
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index !== -1) {
-      entries[index][1] = value;
+      own(entries, () => {
+        entries[index][1] = value;
+      });
     } else {
-      entries.push([key, value]);
+      own(
+        entries,
+        () => entries.push([key, value]),
+        (map, source) => map.set(keyOf(key), source.length - 1),
+      );
     }
     return this;
   }
@@ -105,7 +195,11 @@ export class ReactiveMap<K, V> {
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index === -1) return false;
-    entries.splice(index, 1);
+    own(
+      entries,
+      () => entries.splice(index, 1),
+      (map, source) => shift(map, source, true, index, key),
+    );
     return true;
   }
 
@@ -211,11 +305,11 @@ export class ReactiveSet<T> {
   /** Deduplicates initial values using `Object.is` comparison. */
   constructor(initial?: Iterable<T>) {
     if (initial) {
-      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
-      const seen = new Set<T>();
+      // Match values as `add` does, with a native Set for O(1) dedupe.
+      const seen = new Set<unknown>();
       for (const v of initial) {
-        if (!seen.has(v)) {
-          seen.add(v);
+        if (!seen.has(keyOf(v))) {
+          seen.add(keyOf(v));
           this._items.push(v);
         }
       }
@@ -235,7 +329,12 @@ export class ReactiveSet<T> {
   /** Adds `value` if not already present (no-op for duplicates). */
   add(value: T): this {
     if (!this.has(value)) {
-      this._items.push(value);
+      const items = this._items;
+      own(
+        items,
+        () => items.push(value),
+        (map, source) => map.set(keyOf(value), source.length - 1),
+      );
     }
     return this;
   }
@@ -245,7 +344,11 @@ export class ReactiveSet<T> {
     const items = this._items;
     const index = indexOfMember(items, value, false);
     if (index === -1) return false;
-    items.splice(index, 1);
+    own(
+      items,
+      () => items.splice(index, 1),
+      (map, source) => shift(map, source, false, index, value),
+    );
     return true;
   }
 
```

### `combo-d1.patch`

```diff
diff --git a/examples/solid/src/App.tsx b/examples/solid/src/App.tsx
index ff18625..b3ca514 100644
--- a/examples/solid/src/App.tsx
+++ b/examples/solid/src/App.tsx
@@ -1,8 +1,8 @@
-import {useClassyStore} from '@codebelt/classy-store/solid';
+import {fromClassyStore} from '@codebelt/classy-store/solid';
 import {counterStore, history} from './store';
 
 export function App() {
-  const snap = useClassyStore(counterStore);
+  const snap = fromClassyStore(counterStore);
 
   return (
     <div
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..f30acdf 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -3,33 +3,75 @@ import {PROXYABLE} from '../utils/internal/internal';
 
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
+/**
+ * The key a member is matched by: one identity for a raw object, its store
+ * proxy and every snapshot of it; a primitive is itself, with `-0` as `0`,
+ * as in a native `Map` or `Set`.
+ */
+function keyOf(member: unknown): unknown {
+  return typeof member === 'object' && member !== null
+    ? identityOf(member)
+    : member === 0
+      ? 0
+      : member;
+}
+
+/**
+ * Index from key to position for frozen backing arrays (snapshots). `null`
+ * marks an array looked up once: the second lookup builds the index.
+ */
+const snapshotIndexes = new WeakMap<
+  readonly unknown[],
+  Map<unknown, number> | null
+>();
+
+function scan(
+  source: readonly unknown[],
+  keyed: boolean,
+  from: number,
+  visit: (key: unknown, index: number) => boolean | undefined,
+): number {
+  for (let index = from; index < source.length; index++) {
+    const entry = source[index];
+    if (visit(keyOf(keyed ? (entry as readonly unknown[])[0] : entry), index))
+      return index;
+  }
+  return -1;
+}
+
 /**
  * Find a key (map) or value (set) in a backing array.
  *
- * Members are compared by identity, so an object matches whether it is given
- * raw, as a store proxy, or as a snapshot of the same object; primitives use
- * `Object.is`. Live state and plain snapshots are scanned on the raw array,
- * with no proxy work per entry. A tracked read in a React component still goes
- * entry by entry through its proxy, so that the component records what it
- * compared.
+ * A snapshot's array is frozen, so an index built on its second lookup never
+ * goes stale. Live state is scanned on the raw array, with no proxy work per
+ * entry. A tracked read in a React component still goes entry by entry
+ * through its proxy, so that the component records what it compared.
  */
 function indexOfMember(
   backing: readonly unknown[],
   member: unknown,
   keyed: boolean,
 ): number {
-  const wanted = identityOf(member);
-  const source = isTrackingProxy(backing) ? backing : unwrap(backing);
-  for (let index = 0; index < source.length; index++) {
-    const entry = source[index];
-    const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
-    const identity =
-      typeof candidate === 'object' && candidate !== null
-        ? identityOf(candidate)
-        : candidate;
-    if (Object.is(identity, wanted)) return index;
+  const wanted = keyOf(member);
+  const tracked = isTrackingProxy(backing);
+  const source = tracked ? backing : unwrap(backing);
+  let index = tracked ? undefined : snapshotIndexes.get(source);
+  if (index === null) {
+    const built = new Map<unknown, number>();
+    // The first of two equal members wins.
+    scan(source, keyed, 0, (key, at) => {
+      if (!built.has(key)) built.set(key, at);
+    });
+    snapshotIndexes.set(source, built);
+    index = built;
   }
-  return -1;
+  if (index) return index.get(wanted) ?? -1;
+  // A snapshot has a source of its own; `Object.isFrozen` would read every
+  // element.
+  if (!tracked && source === backing && identityOf(source) !== source) {
+    snapshotIndexes.set(source, null);
+  }
+  return scan(source, keyed, 0, (key) => Object.is(key, wanted));
 }
 
 // ── ReactiveMap ───────────────────────────────────────────────────────────────
@@ -56,14 +98,14 @@ export class ReactiveMap<K, V> {
   /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
   constructor(initial?: Iterable<[K, V]>) {
     if (initial) {
-      // Track key → index for O(1) dedupe instead of O(n) linear scan.
-      const indexByKey = new Map<K, number>();
+      // Match keys as `set` does, with an index for O(1) dedupe.
+      const indexByKey = new Map<unknown, number>();
       for (const [k, v] of initial) {
-        const existing = indexByKey.get(k);
+        const existing = indexByKey.get(keyOf(k));
         if (existing !== undefined) {
-          this._entries[existing] = [k, v];
+          this._entries[existing][1] = v;
         } else {
-          indexByKey.set(k, this._entries.length);
+          indexByKey.set(keyOf(k), this._entries.length);
           this._entries.push([k, v]);
         }
       }
@@ -211,11 +253,11 @@ export class ReactiveSet<T> {
   /** Deduplicates initial values using `Object.is` comparison. */
   constructor(initial?: Iterable<T>) {
     if (initial) {
-      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
-      const seen = new Set<T>();
+      // Match values as `add` does, with a native Set for O(1) dedupe.
+      const seen = new Set<unknown>();
       for (const v of initial) {
-        if (!seen.has(v)) {
-          seen.add(v);
+        if (!seen.has(keyOf(v))) {
+          seen.add(keyOf(v));
           this._items.push(v);
         }
       }
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..aa00017 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -219,39 +219,33 @@ export function getInternal(proxy: object): StoreInternal {
  * children keep their old version, so the snapshot cache returns the same frozen ref.
  */
 function notifyMutation(internal: StoreInternal): void {
-  const owners = internal.ancestors();
   // Invalidate every path before any synchronous subscriber reads a snapshot.
-  for (const node of owners) node.version++;
-  if (transactionDepth) {
-    // Inside a store method or array operation: tell synchronous subscribers
-    // once, when the outermost call returns.
-    for (const node of owners) {
-      if (node.syncListeners.size) pendingSync.add(node);
-    }
-  } else {
-    deliver(owners, 'syncListeners');
+  for (const node of internal.ancestors()) {
+    node.version++;
+    if (node.syncListeners.size) pendingSync.add(node);
+    if (node.batchedListeners.size) pendingBatched.add(node);
   }
-  for (const node of owners) {
-    if (!node.batchedListeners.size) continue;
-    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
-    pendingNotifications.add(node);
+  if (pendingBatched.size && !batchedScheduled) {
+    batchedScheduled = true;
+    queueMicrotask(flushBatched);
   }
+  // Inside a store method, an array operation or `batch()`, synchronous
+  // subscribers are told once, when the outermost call returns.
+  if (!transactionDepth) flushSync();
 }
 
-const pendingNotifications = new Set<StoreInternal>();
+const pendingSync = new Set<StoreInternal>();
+const pendingBatched = new Set<StoreInternal>();
+let batchedScheduled = false;
+let deliveringSync = false;
 
 // ── Transactions ──────────────────────────────────────────────────────────────
 
 let transactionDepth = 0;
-const pendingSync = new Set<StoreInternal>();
 
 /** Close one transaction level; the outermost one notifies sync subscribers. */
 function settleTransaction(): void {
-  if (--transactionDepth === 0 && pendingSync.size) {
-    const owners = new Set(pendingSync);
-    pendingSync.clear();
-    deliver(owners, 'syncListeners');
-  }
+  if (--transactionDepth === 0) flushSync();
 }
 
 /**
@@ -305,24 +299,59 @@ export function batch<T>(run: () => T): T {
   }
 }
 
-function flushNotifications(): void {
-  const owners = new Set(pendingNotifications);
-  pendingNotifications.clear();
-  deliver(owners, 'batchedListeners');
+/**
+ * Call the synchronous subscribers of every node written so far. A write made
+ * by one of them is queued, and delivered when the round that is running ends.
+ */
+function flushSync(): void {
+  if (deliveringSync) return;
+  deliveringSync = true;
+  try {
+    drain(pendingSync, 'syncListeners');
+  } finally {
+    deliveringSync = false;
+  }
 }
 
-function deliver(
-  owners: Set<StoreInternal>,
+function flushBatched(): void {
+  try {
+    drain(pendingBatched, 'batchedListeners');
+  } finally {
+    batchedScheduled = false;
+  }
+}
+
+/** Rounds of delivery one write may cause before it is taken for a loop. */
+const maxRounds = 100;
+
+function drain(
+  pending: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
 ): void {
-  // Copy first: a listener may subscribe or unsubscribe during delivery.
-  const listeners: (() => void)[] = [];
-  for (const node of owners) listeners.push(...node[kind]);
-  for (const listener of listeners) {
-    try {
-      listener();
-    } catch (error) {
-      console.error(error);
+  for (let round = 0; pending.size; round++) {
+    if (round === maxRounds) {
+      const names = Array.from(
+        pending,
+        (node) => node.target.constructor?.name || 'Object',
+      );
+      pending.clear();
+      console.error(
+        new Error(
+          `@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`,
+        ),
+      );
+      return;
+    }
+    // Copy first: a listener may subscribe or unsubscribe during delivery.
+    const listeners: (() => void)[] = [];
+    for (const node of pending) listeners.push(...node[kind]);
+    pending.clear();
+    for (const listener of listeners) {
+      try {
+        listener();
+      } catch (error) {
+        console.error(error);
+      }
     }
   }
 }
@@ -591,8 +620,15 @@ export function subscribe(
   const listeners = options?.sync
     ? internal.syncListeners
     : internal.batchedListeners;
+  // The state this subscription has been told about, or was created in.
+  let seen = internal.version;
   // One entry per call: registering a callback twice gives two subscriptions.
-  const listener = () => callback();
+  const listener = () => {
+    // Removed since the round began, or already called for this state.
+    if (!listeners.has(listener) || seen === internal.version) return;
+    seen = internal.version;
+    callback();
+  };
   listeners.add(listener);
   return () => {
     if (listeners.delete(listener)) internal.suspendIfDetached();
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..5c597fe 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -1,39 +1,66 @@
-import {DestroyRef, inject, type Signal, signal} from '@angular/core';
+import {
+  assertInInjectionContext,
+  computed,
+  DestroyRef,
+  type Injector,
+  inject,
+  type Signal,
+  signal,
+  untracked,
+} from '@angular/core';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots as a readonly signal inside an Angular injection
- * context, such as a component field initializer or constructor. The signal
- * updates synchronously; Angular schedules rendering as usual. The injection
- * context's `DestroyRef` owns subscription cleanup.
+ * context, such as a component field initializer or constructor, or anywhere
+ * with `{injector}`. A store write marks the signal changed at once; the
+ * snapshot is built when it is read. The injector's `DestroyRef` owns
+ * subscription cleanup.
  */
 export function injectClassyStore<T extends object>(
   proxyStore: T,
+  options?: {injector?: Injector},
 ): Signal<Snapshot<T>> {
   getInternal(proxyStore);
-  const destroyRef = inject(DestroyRef);
+  const injector = options?.injector;
+  if (!injector) assertInInjectionContext(injectClassyStore);
+  const destroyRef = injector ? injector.get(DestroyRef) : inject(DestroyRef);
   if (destroyRef.destroyed) {
     throw new Error(
-      'injectClassyStore requires a live Angular injection context.',
+      '@codebelt/classy-store/angular: injectClassyStore() requires a live Angular injection context or injector',
     );
   }
 
-  const state = signal(snapshot(proxyStore));
-  let active = true;
+  let current = snapshot(proxyStore);
+  let stale = false;
+  const version = signal(0);
+  const state = computed(() => {
+    version();
+    if (stale) {
+      stale = false;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  });
   const unsubscribe = subscribe(
     proxyStore,
     () => {
-      // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      // An earlier onDestroy callback can write before ours unsubscribes.
+      if (!destroyRef.destroyed) {
+        stale = true;
+        // A store write made while a computed runs must still land.
+        untracked(() => version.update((n) => n + 1));
+      }
     },
     {sync: true},
   );
 
   destroyRef.onDestroy(() => {
-    active = false;
+    // Keep the last write delivered before destruction.
+    state();
     unsubscribe();
   });
 
-  return state.asReadonly();
+  return state;
 }
diff --git a/packages/classy-store/src/frameworks/solid/solid.test.ts b/packages/classy-store/src/frameworks/solid/solid.test.ts
index 3937dff..f1b1976 100644
--- a/packages/classy-store/src/frameworks/solid/solid.test.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.test.ts
@@ -2,17 +2,17 @@ import {describe, expect, it} from 'bun:test';
 import {createRoot, getOwner, runWithOwner} from 'solid-js';
 import {createClassyStore, getInternal, subscribe} from '../../core/core';
 import {snapshot} from '../../snapshot/snapshot';
-import {useClassyStore} from './solid';
+import {fromClassyStore} from './solid';
 
 // Bun resolves Solid's server runtime. Client scheduling is tested in Playwright.
-describe('solid useClassyStore', () => {
+describe('solid fromClassyStore', () => {
   it('validates the store before checking ownership', () => {
-    expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
+    expect(() => fromClassyStore({count: 0})).toThrow(/not a store proxy/);
   });
 
   it('rejects calls without an owner before subscribing', () => {
     const store = createClassyStore({count: 0});
-    expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+    expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
   });
@@ -25,7 +25,7 @@ describe('solid useClassyStore', () => {
       return current;
     });
     runWithOwner(owner, () => {
-      expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+      expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     });
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
@@ -35,7 +35,7 @@ describe('solid useClassyStore', () => {
     const store = createClassyStore({count: 5, nested: {label: 'Initial'}});
     createRoot((dispose) => {
       try {
-        const state = useClassyStore(store);
+        const state = fromClassyStore(store);
         expect(state()).toBe(snapshot(store));
         expect(Object.isFrozen(state())).toBe(true);
         expect(Object.isFrozen(state().nested)).toBe(true);
@@ -48,11 +48,11 @@ describe('solid useClassyStore', () => {
   it('cleans up independent roots and reads fresh state on remount', async () => {
     const store = createClassyStore({count: 0});
     const first = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     const second = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     try {
@@ -72,7 +72,7 @@ describe('solid useClassyStore', () => {
     expect(getInternal(store).batchedListeners.size).toBe(0);
     createRoot((dispose) => {
       try {
-        expect(useClassyStore(store)().count).toBe(2);
+        expect(fromClassyStore(store)().count).toBe(2);
       } finally {
         dispose();
       }
@@ -82,8 +82,8 @@ describe('solid useClassyStore', () => {
   it('disposes subscriptions in nested roots with their parent', () => {
     const store = createClassyStore({count: 0});
     const dispose = createRoot((stopParent) => {
-      useClassyStore(store);
-      createRoot(() => useClassyStore(store));
+      fromClassyStore(store);
+      createRoot(() => fromClassyStore(store));
       return stopParent;
     });
     try {
@@ -101,7 +101,7 @@ describe('solid useClassyStore', () => {
     const stop = subscribe(store, () => dispose(), {sync: true});
     const state = createRoot((stopRoot) => {
       dispose = stopRoot;
-      return useClassyStore(store);
+      return fromClassyStore(store);
     });
     try {
       store.count = 1;
diff --git a/packages/classy-store/src/frameworks/solid/solid.ts b/packages/classy-store/src/frameworks/solid/solid.ts
index a369a61..d2e1fd7 100644
--- a/packages/classy-store/src/frameworks/solid/solid.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.ts
@@ -4,41 +4,49 @@ import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots inside a Solid 2 component or live reactive root.
- * Store notifications reach Solid synchronously; Solid schedules its own updates.
- * The owner disposes the subscription. Use Solid's flush() for imperative reads.
+ * Store notifications reach Solid synchronously; the snapshot is built when
+ * the accessor is read. The owner disposes the subscription. Use Solid's
+ * flush() for imperative reads.
  */
-export function useClassyStore<T extends object>(
+export function fromClassyStore<T extends object>(
   proxyStore: T,
 ): () => Snapshot<T> {
   getInternal(proxyStore);
   const owner = getOwner();
   if (!owner || isDisposed(owner)) {
     throw new Error(
-      '@codebelt/classy-store/solid: useClassyStore() requires an active Solid owner; call it in a component or createRoot()',
+      '@codebelt/classy-store/solid: fromClassyStore() requires an active Solid owner; call it in a component or createRoot()',
     );
   }
 
-  // Snapshot construction returns an object/array; select the plain-value overload.
-  const [state, setState] = createSignal<Snapshot<T>>(
-    // biome-ignore lint/complexity/noBannedTypes: Matches Solid's exclusion of all callable initializers.
-    snapshot(proxyStore) as Exclude<Snapshot<T>, Function>,
-    {ownedWrite: true},
-  );
+  // The version is a Solid signal, so a read sees a write after Solid's flush,
+  // as with any signal. The snapshot is built once per version that is read.
+  const [version, setVersion] = createSignal(0, {ownedWrite: true});
+  let builtAt = 0;
+  let current = snapshot(proxyStore);
   let active = true;
+  const read = () => {
+    const seen = version();
+    if (seen !== builtAt) {
+      builtAt = seen;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  };
 
   const unsubscribe = subscribe(
     proxyStore,
     () => {
-      // Another listener can dispose this owner during the same notification.
-      if (active && !isDisposed(owner)) setState(() => snapshot(proxyStore));
+      setVersion((n) => n + 1);
     },
     {sync: true},
   );
 
   onCleanup(() => {
+    read();
     active = false;
     unsubscribe();
   });
 
-  return state;
+  return () => (active ? read() : current);
 }
diff --git a/packages/classy-store/src/frameworks/svelte/svelte.ts b/packages/classy-store/src/frameworks/svelte/svelte.ts
index 3925b6f..2aba9a4 100644
--- a/packages/classy-store/src/frameworks/svelte/svelte.ts
+++ b/packages/classy-store/src/frameworks/svelte/svelte.ts
@@ -23,18 +23,10 @@ export function toSvelteStore<T extends object>(
 
   return {
     subscribe(run: (value: Snapshot<T>) => void): () => void {
-      let active = true;
-      const notify = () => {
-        // Another subscriber can unsubscribe this one during notification.
-        if (active) run(snapshot(proxyStore));
-      };
+      const notify = () => run(snapshot(proxyStore));
       // Subscribe before the initial callback so its mutations are observed too.
       // Svelte requires synchronous delivery; ordinary core subscribers still batch.
-      const unsubscribeCore = coreSubscribe(proxyStore, notify, {sync: true});
-      const unsubscribe = () => {
-        active = false;
-        unsubscribeCore();
-      };
+      const unsubscribe = coreSubscribe(proxyStore, notify, {sync: true});
 
       try {
         notify();
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..40ac096 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -1,15 +1,24 @@
-import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
+import {
+  customRef,
+  getCurrentInstance,
+  getCurrentScope,
+  inject,
+  onScopeDispose,
+  type Ref,
+  ssrContextKey,
+} from 'vue';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
- * Read immutable snapshots from a shallow ref inside setup() or an active
- * effect scope. Ref updates are synchronous; Vue batches rendering normally.
- * The scope owns subscription cleanup.
+ * Read immutable snapshots from a read-only ref inside setup() or an active
+ * effect scope. A store write marks the ref changed at once; the snapshot is
+ * built when the ref is read. A component rendered on the server reads the
+ * store at each read and does not subscribe. The scope owns cleanup.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
-): Ref<Snapshot<T>> {
+): Readonly<Ref<Snapshot<T>>> {
   getInternal(proxyStore);
   if (!getCurrentScope()?.active) {
     throw new Error(
@@ -17,19 +26,39 @@ export function useClassyStore<T extends object>(
     );
   }
 
-  const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
-  let active = true;
-  const unsubscribe = subscribe(
-    proxyStore,
-    () => {
-      // A prior subscriber may stop this scope during the same notification.
-      if (active) state.value = snapshot(proxyStore);
-    },
-    {sync: true},
-  );
+  // A server render never stops the component's scope, so a listener added
+  // there would stay for good.
+  const server = !!getCurrentInstance() && !!inject(ssrContextKey, null);
+  let current = snapshot(proxyStore);
+  let stale: boolean = server;
+  let unsubscribe = () => {};
+  const state = customRef((track, trigger) => {
+    if (!server) {
+      unsubscribe = subscribe(
+        proxyStore,
+        () => {
+          stale = true;
+          trigger();
+        },
+        {sync: true},
+      );
+    }
+    return {
+      get() {
+        track();
+        if (stale) {
+          stale = server;
+          current = snapshot(proxyStore);
+        }
+        return current;
+      },
+      set() {},
+    };
+  });
 
   onScopeDispose(() => {
-    active = false;
+    // Keep the last write delivered before the scope stopped.
+    void state.value;
     unsubscribe();
   });
 
diff --git a/packages/classy-store/src/types.solid.test.ts b/packages/classy-store/src/types.solid.test.ts
index 1523541..a704241 100644
--- a/packages/classy-store/src/types.solid.test.ts
+++ b/packages/classy-store/src/types.solid.test.ts
@@ -1,6 +1,6 @@
 import {describe, expect, expectTypeOf, test} from 'bun:test';
 import * as entry from './frameworks/solid/solid';
-import {useClassyStore} from './frameworks/solid/solid';
+import {fromClassyStore} from './frameworks/solid/solid';
 import type {Snapshot} from './index';
 
 // Type tests for `@codebelt/classy-store/solid`. The primitive is never called
@@ -9,19 +9,19 @@ import type {Snapshot} from './index';
 type Counter = {count: number; nested: {label: string}};
 
 describe('solid entry point types', () => {
-  test('the entry exports one value, useClassyStore', () => {
-    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'useClassyStore'>();
-    expect(Object.keys(entry)).toEqual(['useClassyStore']);
+  test('the entry exports one value, fromClassyStore', () => {
+    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'fromClassyStore'>();
+    expect(Object.keys(entry)).toEqual(['fromClassyStore']);
   });
 
-  test('useClassyStore accepts any object and returns an accessor of its Snapshot', () => {
-    expectTypeOf(useClassyStore).toEqualTypeOf<
+  test('fromClassyStore accepts any object and returns an accessor of its Snapshot', () => {
+    expectTypeOf(fromClassyStore).toEqualTypeOf<
       <T extends object>(proxyStore: T) => () => Snapshot<T>
     >();
   });
 
   test('the accessor takes no argument and yields a deeply readonly value', () => {
-    expectTypeOf(useClassyStore<Counter>).toEqualTypeOf<
+    expectTypeOf(fromClassyStore<Counter>).toEqualTypeOf<
       (proxyStore: Counter) => () => {
         readonly count: number;
         readonly nested: {readonly label: string};
diff --git a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
index 99d6249..146cb3a 100644
--- a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
+++ b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
@@ -1,10 +1,10 @@
 import {For} from '@solidjs/web';
 import {createEffect, createMemo, createSignal, flush} from 'solid-js';
-import {useClassyStore} from '../../../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../../../src/frameworks/solid/solid';
 import {formStore, probe} from '../../solid.store';
 
 export function SolidForm() {
-  const state = useClassyStore(formStore);
+  const state = fromClassyStore(formStore);
   const uppercase = createMemo(() => state().text.toUpperCase());
   const summary = createMemo(
     () => `${state().text}:${state().doubled}:${uppercase()}`,
diff --git a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
index ea627d1..14549fe 100644
--- a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
+++ b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
@@ -10,14 +10,14 @@ import {
   getInternal,
   subscribe,
 } from '../../../src/core/core';
-import {useClassyStore} from '../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../src/frameworks/solid/solid';
 
 export function lifecycleProbe() {
   const store = createClassyStore({count: 0});
   const errors: string[] = [];
   function expectRejection() {
     try {
-      useClassyStore(store);
+      fromClassyStore(store);
     } catch (error) {
       errors.push(String(error));
     }
@@ -34,7 +34,7 @@ export function lifecycleProbe() {
   const secondValues: number[] = [];
   const parent = createRoot((dispose) => {
     createRoot(() => {
-      const state = useClassyStore(store);
+      const state = fromClassyStore(store);
       createEffect(
         () => state().count,
         (value) => {
@@ -45,7 +45,7 @@ export function lifecycleProbe() {
     return {dispose, owner: getOwner()};
   });
   const stopSecond = createRoot((dispose) => {
-    const state = useClassyStore(store);
+    const state = fromClassyStore(store);
     createEffect(
       () => state().count,
       (value) => {
@@ -72,7 +72,7 @@ export function lifecycleProbe() {
   const stopKiller = subscribe(store, () => stopVictim(), {sync: true});
   const victim = createRoot((dispose) => {
     stopVictim = dispose;
-    return useClassyStore(store);
+    return fromClassyStore(store);
   });
   store.count = 3;
   flush();
```

### `combo.patch`

```diff
diff --git a/examples/solid/src/App.tsx b/examples/solid/src/App.tsx
index ff18625..b3ca514 100644
--- a/examples/solid/src/App.tsx
+++ b/examples/solid/src/App.tsx
@@ -1,8 +1,8 @@
-import {useClassyStore} from '@codebelt/classy-store/solid';
+import {fromClassyStore} from '@codebelt/classy-store/solid';
 import {counterStore, history} from './store';
 
 export function App() {
-  const snap = useClassyStore(counterStore);
+  const snap = fromClassyStore(counterStore);
 
   return (
     <div
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..f30acdf 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -3,33 +3,75 @@ import {PROXYABLE} from '../utils/internal/internal';
 
 // ── Lookup ────────────────────────────────────────────────────────────────────
 
+/**
+ * The key a member is matched by: one identity for a raw object, its store
+ * proxy and every snapshot of it; a primitive is itself, with `-0` as `0`,
+ * as in a native `Map` or `Set`.
+ */
+function keyOf(member: unknown): unknown {
+  return typeof member === 'object' && member !== null
+    ? identityOf(member)
+    : member === 0
+      ? 0
+      : member;
+}
+
+/**
+ * Index from key to position for frozen backing arrays (snapshots). `null`
+ * marks an array looked up once: the second lookup builds the index.
+ */
+const snapshotIndexes = new WeakMap<
+  readonly unknown[],
+  Map<unknown, number> | null
+>();
+
+function scan(
+  source: readonly unknown[],
+  keyed: boolean,
+  from: number,
+  visit: (key: unknown, index: number) => boolean | undefined,
+): number {
+  for (let index = from; index < source.length; index++) {
+    const entry = source[index];
+    if (visit(keyOf(keyed ? (entry as readonly unknown[])[0] : entry), index))
+      return index;
+  }
+  return -1;
+}
+
 /**
  * Find a key (map) or value (set) in a backing array.
  *
- * Members are compared by identity, so an object matches whether it is given
- * raw, as a store proxy, or as a snapshot of the same object; primitives use
- * `Object.is`. Live state and plain snapshots are scanned on the raw array,
- * with no proxy work per entry. A tracked read in a React component still goes
- * entry by entry through its proxy, so that the component records what it
- * compared.
+ * A snapshot's array is frozen, so an index built on its second lookup never
+ * goes stale. Live state is scanned on the raw array, with no proxy work per
+ * entry. A tracked read in a React component still goes entry by entry
+ * through its proxy, so that the component records what it compared.
  */
 function indexOfMember(
   backing: readonly unknown[],
   member: unknown,
   keyed: boolean,
 ): number {
-  const wanted = identityOf(member);
-  const source = isTrackingProxy(backing) ? backing : unwrap(backing);
-  for (let index = 0; index < source.length; index++) {
-    const entry = source[index];
-    const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
-    const identity =
-      typeof candidate === 'object' && candidate !== null
-        ? identityOf(candidate)
-        : candidate;
-    if (Object.is(identity, wanted)) return index;
+  const wanted = keyOf(member);
+  const tracked = isTrackingProxy(backing);
+  const source = tracked ? backing : unwrap(backing);
+  let index = tracked ? undefined : snapshotIndexes.get(source);
+  if (index === null) {
+    const built = new Map<unknown, number>();
+    // The first of two equal members wins.
+    scan(source, keyed, 0, (key, at) => {
+      if (!built.has(key)) built.set(key, at);
+    });
+    snapshotIndexes.set(source, built);
+    index = built;
   }
-  return -1;
+  if (index) return index.get(wanted) ?? -1;
+  // A snapshot has a source of its own; `Object.isFrozen` would read every
+  // element.
+  if (!tracked && source === backing && identityOf(source) !== source) {
+    snapshotIndexes.set(source, null);
+  }
+  return scan(source, keyed, 0, (key) => Object.is(key, wanted));
 }
 
 // ── ReactiveMap ───────────────────────────────────────────────────────────────
@@ -56,14 +98,14 @@ export class ReactiveMap<K, V> {
   /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
   constructor(initial?: Iterable<[K, V]>) {
     if (initial) {
-      // Track key → index for O(1) dedupe instead of O(n) linear scan.
-      const indexByKey = new Map<K, number>();
+      // Match keys as `set` does, with an index for O(1) dedupe.
+      const indexByKey = new Map<unknown, number>();
       for (const [k, v] of initial) {
-        const existing = indexByKey.get(k);
+        const existing = indexByKey.get(keyOf(k));
         if (existing !== undefined) {
-          this._entries[existing] = [k, v];
+          this._entries[existing][1] = v;
         } else {
-          indexByKey.set(k, this._entries.length);
+          indexByKey.set(keyOf(k), this._entries.length);
           this._entries.push([k, v]);
         }
       }
@@ -211,11 +253,11 @@ export class ReactiveSet<T> {
   /** Deduplicates initial values using `Object.is` comparison. */
   constructor(initial?: Iterable<T>) {
     if (initial) {
-      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
-      const seen = new Set<T>();
+      // Match values as `add` does, with a native Set for O(1) dedupe.
+      const seen = new Set<unknown>();
       for (const v of initial) {
-        if (!seen.has(v)) {
-          seen.add(v);
+        if (!seen.has(keyOf(v))) {
+          seen.add(keyOf(v));
           this._items.push(v);
         }
       }
diff --git a/packages/classy-store/src/frameworks/angular/angular.ts b/packages/classy-store/src/frameworks/angular/angular.ts
index 2bb0756..8c86127 100644
--- a/packages/classy-store/src/frameworks/angular/angular.ts
+++ b/packages/classy-store/src/frameworks/angular/angular.ts
@@ -1,39 +1,68 @@
-import {DestroyRef, inject, type Signal, signal} from '@angular/core';
+import {
+  assertInInjectionContext,
+  computed,
+  DestroyRef,
+  type Injector,
+  inject,
+  type Signal,
+  signal,
+  untracked,
+} from '@angular/core';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots as a readonly signal inside an Angular injection
- * context, such as a component field initializer or constructor. The signal
- * updates synchronously; Angular schedules rendering as usual. The injection
- * context's `DestroyRef` owns subscription cleanup.
+ * context, such as a component field initializer or constructor, or anywhere
+ * with `{injector}`. A store write marks the signal changed at once; the
+ * snapshot is built when it is read. The injector's `DestroyRef` owns
+ * subscription cleanup.
  */
 export function injectClassyStore<T extends object>(
   proxyStore: T,
+  options?: {injector?: Injector},
 ): Signal<Snapshot<T>> {
   getInternal(proxyStore);
-  const destroyRef = inject(DestroyRef);
+  const injector = options?.injector;
+  if (!injector) assertInInjectionContext(injectClassyStore);
+  const destroyRef = injector ? injector.get(DestroyRef) : inject(DestroyRef);
   if (destroyRef.destroyed) {
     throw new Error(
-      'injectClassyStore requires a live Angular injection context.',
+      '@codebelt/classy-store/angular: injectClassyStore() requires a live Angular injection context or injector',
     );
   }
 
-  const state = signal(snapshot(proxyStore));
+  let current = snapshot(proxyStore);
+  let stale = false;
   let active = true;
+  const version = signal(0);
+  const state = computed(() => {
+    version();
+    if (stale) {
+      stale = false;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  });
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // A notification may already be copied when another listener destroys us.
-      if (active && !destroyRef.destroyed) state.set(snapshot(proxyStore));
+      if (active && !destroyRef.destroyed) {
+        stale = true;
+        // A store write made while a computed runs must still land.
+        untracked(() => version.update((n) => n + 1));
+      }
     },
     {sync: true},
   );
 
   destroyRef.onDestroy(() => {
+    // Keep the last write delivered before destruction.
+    state();
     active = false;
     unsubscribe();
   });
 
-  return state.asReadonly();
+  return state;
 }
diff --git a/packages/classy-store/src/frameworks/solid/solid.test.ts b/packages/classy-store/src/frameworks/solid/solid.test.ts
index 3937dff..f1b1976 100644
--- a/packages/classy-store/src/frameworks/solid/solid.test.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.test.ts
@@ -2,17 +2,17 @@ import {describe, expect, it} from 'bun:test';
 import {createRoot, getOwner, runWithOwner} from 'solid-js';
 import {createClassyStore, getInternal, subscribe} from '../../core/core';
 import {snapshot} from '../../snapshot/snapshot';
-import {useClassyStore} from './solid';
+import {fromClassyStore} from './solid';
 
 // Bun resolves Solid's server runtime. Client scheduling is tested in Playwright.
-describe('solid useClassyStore', () => {
+describe('solid fromClassyStore', () => {
   it('validates the store before checking ownership', () => {
-    expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
+    expect(() => fromClassyStore({count: 0})).toThrow(/not a store proxy/);
   });
 
   it('rejects calls without an owner before subscribing', () => {
     const store = createClassyStore({count: 0});
-    expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+    expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
   });
@@ -25,7 +25,7 @@ describe('solid useClassyStore', () => {
       return current;
     });
     runWithOwner(owner, () => {
-      expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
+      expect(() => fromClassyStore(store)).toThrow(/active Solid owner/);
     });
     expect(getInternal(store).syncListeners.size).toBe(0);
     expect(getInternal(store).batchedListeners.size).toBe(0);
@@ -35,7 +35,7 @@ describe('solid useClassyStore', () => {
     const store = createClassyStore({count: 5, nested: {label: 'Initial'}});
     createRoot((dispose) => {
       try {
-        const state = useClassyStore(store);
+        const state = fromClassyStore(store);
         expect(state()).toBe(snapshot(store));
         expect(Object.isFrozen(state())).toBe(true);
         expect(Object.isFrozen(state().nested)).toBe(true);
@@ -48,11 +48,11 @@ describe('solid useClassyStore', () => {
   it('cleans up independent roots and reads fresh state on remount', async () => {
     const store = createClassyStore({count: 0});
     const first = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     const second = createRoot((dispose) => ({
-      state: useClassyStore(store),
+      state: fromClassyStore(store),
       dispose,
     }));
     try {
@@ -72,7 +72,7 @@ describe('solid useClassyStore', () => {
     expect(getInternal(store).batchedListeners.size).toBe(0);
     createRoot((dispose) => {
       try {
-        expect(useClassyStore(store)().count).toBe(2);
+        expect(fromClassyStore(store)().count).toBe(2);
       } finally {
         dispose();
       }
@@ -82,8 +82,8 @@ describe('solid useClassyStore', () => {
   it('disposes subscriptions in nested roots with their parent', () => {
     const store = createClassyStore({count: 0});
     const dispose = createRoot((stopParent) => {
-      useClassyStore(store);
-      createRoot(() => useClassyStore(store));
+      fromClassyStore(store);
+      createRoot(() => fromClassyStore(store));
       return stopParent;
     });
     try {
@@ -101,7 +101,7 @@ describe('solid useClassyStore', () => {
     const stop = subscribe(store, () => dispose(), {sync: true});
     const state = createRoot((stopRoot) => {
       dispose = stopRoot;
-      return useClassyStore(store);
+      return fromClassyStore(store);
     });
     try {
       store.count = 1;
diff --git a/packages/classy-store/src/frameworks/solid/solid.ts b/packages/classy-store/src/frameworks/solid/solid.ts
index a369a61..054b30e 100644
--- a/packages/classy-store/src/frameworks/solid/solid.ts
+++ b/packages/classy-store/src/frameworks/solid/solid.ts
@@ -4,41 +4,50 @@ import type {Snapshot} from '../../types';
 
 /**
  * Read immutable snapshots inside a Solid 2 component or live reactive root.
- * Store notifications reach Solid synchronously; Solid schedules its own updates.
- * The owner disposes the subscription. Use Solid's flush() for imperative reads.
+ * Store notifications reach Solid synchronously; the snapshot is built when
+ * the accessor is read. The owner disposes the subscription. Use Solid's
+ * flush() for imperative reads.
  */
-export function useClassyStore<T extends object>(
+export function fromClassyStore<T extends object>(
   proxyStore: T,
 ): () => Snapshot<T> {
   getInternal(proxyStore);
   const owner = getOwner();
   if (!owner || isDisposed(owner)) {
     throw new Error(
-      '@codebelt/classy-store/solid: useClassyStore() requires an active Solid owner; call it in a component or createRoot()',
+      '@codebelt/classy-store/solid: fromClassyStore() requires an active Solid owner; call it in a component or createRoot()',
     );
   }
 
-  // Snapshot construction returns an object/array; select the plain-value overload.
-  const [state, setState] = createSignal<Snapshot<T>>(
-    // biome-ignore lint/complexity/noBannedTypes: Matches Solid's exclusion of all callable initializers.
-    snapshot(proxyStore) as Exclude<Snapshot<T>, Function>,
-    {ownedWrite: true},
-  );
+  // The version is a Solid signal, so a read sees a write after Solid's flush,
+  // as with any signal. The snapshot is built once per version that is read.
+  const [version, setVersion] = createSignal(0, {ownedWrite: true});
+  let builtAt = 0;
+  let current = snapshot(proxyStore);
   let active = true;
+  const read = () => {
+    const seen = version();
+    if (seen !== builtAt) {
+      builtAt = seen;
+      current = snapshot(proxyStore);
+    }
+    return current;
+  };
 
   const unsubscribe = subscribe(
     proxyStore,
     () => {
       // Another listener can dispose this owner during the same notification.
-      if (active && !isDisposed(owner)) setState(() => snapshot(proxyStore));
+      if (active && !isDisposed(owner)) setVersion((n) => n + 1);
     },
     {sync: true},
   );
 
   onCleanup(() => {
+    read();
     active = false;
     unsubscribe();
   });
 
-  return state;
+  return () => (active ? read() : current);
 }
diff --git a/packages/classy-store/src/frameworks/vue/vue.ts b/packages/classy-store/src/frameworks/vue/vue.ts
index 98ac657..2d28f67 100644
--- a/packages/classy-store/src/frameworks/vue/vue.ts
+++ b/packages/classy-store/src/frameworks/vue/vue.ts
@@ -1,15 +1,24 @@
-import {getCurrentScope, onScopeDispose, type Ref, shallowRef} from 'vue';
+import {
+  customRef,
+  getCurrentInstance,
+  getCurrentScope,
+  inject,
+  onScopeDispose,
+  type Ref,
+  ssrContextKey,
+} from 'vue';
 import {getInternal, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
 
 /**
- * Read immutable snapshots from a shallow ref inside setup() or an active
- * effect scope. Ref updates are synchronous; Vue batches rendering normally.
- * The scope owns subscription cleanup.
+ * Read immutable snapshots from a read-only ref inside setup() or an active
+ * effect scope. A store write marks the ref changed at once; the snapshot is
+ * built when the ref is read. A component rendered on the server reads the
+ * store at each read and does not subscribe. The scope owns cleanup.
  */
 export function useClassyStore<T extends object>(
   proxyStore: T,
-): Ref<Snapshot<T>> {
+): Readonly<Ref<Snapshot<T>>> {
   getInternal(proxyStore);
   if (!getCurrentScope()?.active) {
     throw new Error(
@@ -17,18 +26,43 @@ export function useClassyStore<T extends object>(
     );
   }
 
-  const state = shallowRef(snapshot(proxyStore)) as unknown as Ref<Snapshot<T>>;
+  // A server render never stops the component's scope, so a listener added
+  // there would stay for good.
+  const server = !!getCurrentInstance() && !!inject(ssrContextKey, null);
+  let current = snapshot(proxyStore);
+  let stale: boolean = server;
   let active = true;
-  const unsubscribe = subscribe(
-    proxyStore,
-    () => {
-      // A prior subscriber may stop this scope during the same notification.
-      if (active) state.value = snapshot(proxyStore);
-    },
-    {sync: true},
-  );
+  let unsubscribe = () => {};
+  const state = customRef((track, trigger) => {
+    if (!server) {
+      unsubscribe = subscribe(
+        proxyStore,
+        () => {
+          // A prior subscriber may stop this scope during the same notification.
+          if (active) {
+            stale = true;
+            trigger();
+          }
+        },
+        {sync: true},
+      );
+    }
+    return {
+      get() {
+        track();
+        if (stale) {
+          stale = server;
+          current = snapshot(proxyStore);
+        }
+        return current;
+      },
+      set() {},
+    };
+  });
 
   onScopeDispose(() => {
+    // Keep the last write delivered before the scope stopped.
+    void state.value;
     active = false;
     unsubscribe();
   });
diff --git a/packages/classy-store/src/types.solid.test.ts b/packages/classy-store/src/types.solid.test.ts
index 1523541..a704241 100644
--- a/packages/classy-store/src/types.solid.test.ts
+++ b/packages/classy-store/src/types.solid.test.ts
@@ -1,6 +1,6 @@
 import {describe, expect, expectTypeOf, test} from 'bun:test';
 import * as entry from './frameworks/solid/solid';
-import {useClassyStore} from './frameworks/solid/solid';
+import {fromClassyStore} from './frameworks/solid/solid';
 import type {Snapshot} from './index';
 
 // Type tests for `@codebelt/classy-store/solid`. The primitive is never called
@@ -9,19 +9,19 @@ import type {Snapshot} from './index';
 type Counter = {count: number; nested: {label: string}};
 
 describe('solid entry point types', () => {
-  test('the entry exports one value, useClassyStore', () => {
-    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'useClassyStore'>();
-    expect(Object.keys(entry)).toEqual(['useClassyStore']);
+  test('the entry exports one value, fromClassyStore', () => {
+    expectTypeOf<keyof typeof entry>().toEqualTypeOf<'fromClassyStore'>();
+    expect(Object.keys(entry)).toEqual(['fromClassyStore']);
   });
 
-  test('useClassyStore accepts any object and returns an accessor of its Snapshot', () => {
-    expectTypeOf(useClassyStore).toEqualTypeOf<
+  test('fromClassyStore accepts any object and returns an accessor of its Snapshot', () => {
+    expectTypeOf(fromClassyStore).toEqualTypeOf<
       <T extends object>(proxyStore: T) => () => Snapshot<T>
     >();
   });
 
   test('the accessor takes no argument and yields a deeply readonly value', () => {
-    expectTypeOf(useClassyStore<Counter>).toEqualTypeOf<
+    expectTypeOf(fromClassyStore<Counter>).toEqualTypeOf<
       (proxyStore: Counter) => () => {
         readonly count: number;
         readonly nested: {readonly label: string};
diff --git a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
index 99d6249..146cb3a 100644
--- a/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
+++ b/packages/classy-store/tests/browser/solid/components/solidForm/SolidForm.tsx
@@ -1,10 +1,10 @@
 import {For} from '@solidjs/web';
 import {createEffect, createMemo, createSignal, flush} from 'solid-js';
-import {useClassyStore} from '../../../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../../../src/frameworks/solid/solid';
 import {formStore, probe} from '../../solid.store';
 
 export function SolidForm() {
-  const state = useClassyStore(formStore);
+  const state = fromClassyStore(formStore);
   const uppercase = createMemo(() => state().text.toUpperCase());
   const summary = createMemo(
     () => `${state().text}:${state().doubled}:${uppercase()}`,
diff --git a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
index ea627d1..14549fe 100644
--- a/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
+++ b/packages/classy-store/tests/browser/solid/lifecycleProbe.ts
@@ -10,14 +10,14 @@ import {
   getInternal,
   subscribe,
 } from '../../../src/core/core';
-import {useClassyStore} from '../../../src/frameworks/solid/solid';
+import {fromClassyStore} from '../../../src/frameworks/solid/solid';
 
 export function lifecycleProbe() {
   const store = createClassyStore({count: 0});
   const errors: string[] = [];
   function expectRejection() {
     try {
-      useClassyStore(store);
+      fromClassyStore(store);
     } catch (error) {
       errors.push(String(error));
     }
@@ -34,7 +34,7 @@ export function lifecycleProbe() {
   const secondValues: number[] = [];
   const parent = createRoot((dispose) => {
     createRoot(() => {
-      const state = useClassyStore(store);
+      const state = fromClassyStore(store);
       createEffect(
         () => state().count,
         (value) => {
@@ -45,7 +45,7 @@ export function lifecycleProbe() {
     return {dispose, owner: getOwner()};
   });
   const stopSecond = createRoot((dispose) => {
-    const state = useClassyStore(store);
+    const state = fromClassyStore(store);
     createEffect(
       () => state().count,
       (value) => {
@@ -72,7 +72,7 @@ export function lifecycleProbe() {
   const stopKiller = subscribe(store, () => stopVictim(), {sync: true});
   const victim = createRoot((dispose) => {
     stopVictim = dispose;
-    return useClassyStore(store);
+    return fromClassyStore(store);
   });
   store.count = 3;
   flush();
```

### `scripts/a1-timing.ts`

```ts
// A1: 2,000 direct row writes outside a method, with one adapter attached, then one read.
// Run through run.sh so framework imports resolve inside the worktree.
import {effectScope} from 'vue';
import {Injector, runInInjectionContext} from '@angular/core';
import {createRoot, flush} from 'solid-js';
const SRC = process.env.SRC!;
const {createClassyStore, getInternal} = await import(`${SRC}/core/core`);
const {useClassyStore: useVue} = await import(`${SRC}/frameworks/vue/vue`);
const {injectClassyStore} = await import(`${SRC}/frameworks/angular/angular`);
const solidMod = await import(`${SRC}/frameworks/solid/solid`);
const useSolid = solidMod.fromClassyStore ?? solidMod.useClassyStore;
const {toSvelteStore} = await import(`${SRC}/frameworks/svelte/svelte`);

const ROWS = 2000;
const make = () =>
  createClassyStore({
    rows: Array.from({length: ROWS}, (_, id) => ({id, done: false})),
  });

function time(
  label: string,
  attach: (store: any) => {read: () => any; stop: () => void},
) {
  const runs: number[] = [];
  let ok = true;
  for (let r = 0; r < 7; r++) {
    const store = make();
    const {read, stop} = attach(store);
    read();
    const start = performance.now();
    for (const row of store.rows) row.done = true;
    const value = read();
    runs.push(performance.now() - start);
    ok &&= value.rows.every((row: any) => row.done);
    stop();
    ok &&= getInternal(store).syncListeners.size === 0;
  }
  runs.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(12)} median ${runs[3].toFixed(1)} ms (min ${runs[0].toFixed(1)}, max ${runs[6].toFixed(1)}), current and cleaned up: ${ok}`,
  );
}

time('none', (store) => ({read: () => store, stop: () => {}}));
time('vue', (store) => {
  const scope = effectScope();
  const ref = scope.run(() => useVue(store))!;
  return {read: () => ref.value, stop: () => scope.stop()};
});
time('angular', (store) => {
  const injector = Injector.create({providers: []});
  const sig = runInInjectionContext(injector, () => injectClassyStore(store));
  return {read: () => sig(), stop: () => injector.destroy()};
});
time('solid', (store) => {
  let dispose = () => {};
  const acc = createRoot((d) => ((dispose = d), useSolid(store)));
  return {read: () => (flush(), acc()), stop: () => dispose()};
});
time('svelte', (store) => {
  let last: any;
  const stop = toSvelteStore(store).subscribe((v: any) => (last = v));
  return {read: () => last, stop};
});
```

### `scripts/a5-memory.ts`

```ts
// A5: memory held by the captured first snapshot, and a write through a raw reference.
import {heapSize} from 'bun:jsc';
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/core/core`);
const {snapshot} = await import(`${SRC}/snapshot/snapshot`);
await import(`${SRC}/frameworks/react/react`); // what an app that uses React loads
const {hydrationSnapshots} = await import(`${SRC}/storeRuntime`);

const ROWS = 10_000;
const settle = () => {
  for (let i = 0; i < 5; i++) Bun.gc(true);
  return heapSize();
};
const stores: any[] = [];
const before = settle();
for (let s = 0; s < 10; s++) {
  const store = createClassyStore({
    rows: Array.from({length: ROWS}, (_, id) => ({id, label: `row ${id}`})),
  });
  for (const row of store.rows) row.label += '!';
  snapshot(store); // the live snapshot a component holds
  stores.push(store);
}
const after = settle();
console.log(
  `10 stores of ${ROWS} rows, every row written once, one live snapshot each: ${((after - before) / 1024 / 1024).toFixed(1)} MB held; captured: ${hydrationSnapshots.has(stores[0])}`,
);

// A write through a raw reference before the first write through the store.
const raw = {name: 'initial'};
const store = createClassyStore({user: raw});
raw.name = 'raw write'; // no trap, no capture
store.user.name = 'store write';
const captured: any = hydrationSnapshots.get(store);
console.log(
  'raw write, then a store write: captured first snapshot says',
  captured?.user.name ?? '(none)',
);
```

### `scripts/a7-lookup.ts`

```ts
// A7: lookup cost in the reactive collections, live and on a snapshot, and the
// membership rules of stage 1 findings 33 and 34. Run through run.sh.
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/core/core`);
const {snapshot} = await import(`${SRC}/snapshot/snapshot`);
const {reactiveMap, reactiveSet} = await import(
  `${SRC}/collections/collections`
);
const {withHistory} = await import(`${SRC}/utils/history/history`);

const N = 10_000;
const LOOKUPS = 1_000;
function bench(label: string, fn: () => unknown, reps = LOOKUPS) {
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    for (let i = 0; i < reps; i++) fn();
    runs.push(((performance.now() - start) * 1000) / reps);
  }
  runs.sort((a, b) => a - b);
  const fmt = (us: number) =>
    us < 1 ? `${(us * 1000).toFixed(0)} ns` : `${us.toFixed(1)} µs`;
  console.log(
    `${label.padEnd(58)} ${fmt(runs[2])} per call (min ${fmt(runs[0])}, max ${fmt(runs[4])})`,
  );
}

const keys = Array.from({length: N}, (_, i) => `key${i}`);
const objs = Array.from({length: N}, (_, i) => ({id: i}));
const store = createClassyStore({
  byName: reactiveMap<string, number>(keys.map((k, i) => [k, i])),
  byObj: reactiveMap<object, number>(objs.map((o, i) => [o, i])),
  nums: reactiveSet<number>(Array.from({length: N}, (_, i) => i)),
  rows: reactiveSet<object>(objs),
});
const last = keys[N - 1];
bench('live map.get, last of 10,000 string keys', () => store.byName.get(last));
bench('live map.get, last of 10,000 object keys (raw key)', () =>
  store.byObj.get(objs[N - 1]),
);
bench('live set.has, last of 10,000 numbers', () => store.nums.has(N - 1));
bench('live set.has, a missing number', () => store.nums.has(-5));
const snap: any = snapshot(store);
bench('snapshot map.get, last of 10,000 string keys', () =>
  snap.byName.get(last),
);
bench('snapshot set.has, last of 10,000 numbers', () => snap.nums.has(N - 1));
const rowSnap = snap.rows.values().next().value; // a snapshot member
bench('snapshot set.has by a snapshot member, first of 10,000 objects', () =>
  snap.rows.has(rowSnap),
);
bench('snapshot set.has by raw object, last of 10,000 objects', () =>
  snap.rows.has(objs[N - 1]),
);
// Writes: a set of a new key then its delete, and an update of an existing key.
let k = 0;
bench(
  'live map.set new key + delete it (10,000 present)',
  () => {
    const key = `new${k++}`;
    store.byName.set(key, 1);
    store.byName.delete(key);
  },
  200,
);
bench(
  'live map.set existing key (last of 10,000)',
  () => store.byName.set(last, k++),
  200,
);
// A value changed in place (not through the collection), then a lookup.
const vals = createClassyStore({
  m: reactiveMap<string, {n: number}>(keys.map((key) => [key, {n: 0}])),
});
bench(
  'change a value in place, then get the last key (hit)',
  () => {
    vals.m.get(keys[0])!.n++;
    vals.m.get(last);
  },
  200,
);
bench(
  'change a value in place, then get a missing key',
  () => {
    vals.m.get(keys[0])!.n++;
    vals.m.get('missing');
  },
  200,
);
// Interleaved write and read on a snapshot: the realistic React case, one snapshot per write.
bench(
  'write one key, then snapshot().get (10,000 keys)',
  () => {
    store.byName.set(last, k++);
    (snapshot(store) as any).byName.get(last);
  },
  200,
);

// Correctness: identity, -0, constructor dedupe, history replacing the array.
{
  const raw = {id: 'a'};
  const s = createClassyStore({
    m: reactiveMap<object, string>(),
    set: reactiveSet<number>([0]),
    built: reactiveSet<object>([]),
  });
  s.m.set(raw, 'x');
  const proxy = s.m.keys().next().value;
  const snapKey = (snapshot(s) as any).m.keys().next().value;
  console.log(
    'identity: get by raw, proxy, snapshot key:',
    s.m.get(raw),
    s.m.get(proxy),
    s.m.get(snapKey),
    '| snapshot get by raw:',
    (snapshot(s) as any).m.get(raw),
  );
  s.set.add(-0);
  console.log(
    'finding 33: new Set([0]) then add(-0): size',
    s.set.size,
    '| has(-0)',
    s.set.has(-0),
    '| constructed from [0, -0]: size',
    reactiveSet([0, -0]).size,
  );
  const t = createClassyStore({items: reactiveSet<object>([raw])});
  const tp = t.items.values().next().value;
  console.log(
    'finding 34: constructed from [raw, its proxy]: size',
    reactiveSet([raw, tp]).size,
    '| add(proxy) after raw: size',
    (t.items.add(tp), t.items.size),
  );
  // History replaces the backing array on undo.
  const h = createClassyStore({tags: reactiveSet<string>(['a'])});
  const history = withHistory(h);
  h.tags.has('a');
  h.tags.add('b');
  await new Promise((r) => setTimeout(r, 0));
  history.undo();
  await new Promise((r) => setTimeout(r, 0));
  console.log(
    'history: after add(b) and undo: has(b)',
    h.tags.has('b'),
    'has(a)',
    h.tags.has('a'),
    'size',
    h.tags.size,
  );
  history.redo();
  await new Promise((r) => setTimeout(r, 0));
  console.log('history: after redo: has(b)', h.tags.has('b'));
  history.dispose?.();
  // A write straight into the public backing array, through the store.
  const d = createClassyStore({tags: reactiveSet<string>(['a', 'b'])});
  d.tags.has('a');
  (d.tags as any)._items[0] = 'z';
  console.log(
    'direct write to _items[0] through the store: has(a)',
    d.tags.has('a'),
    'has(z)',
    d.tags.has('z'),
  );
  // A write to the raw backing array, outside every trap (stage 1 finding 11).
  const rawSet = reactiveSet<string>(['a', 'b']);
  const e = createClassyStore({tags: rawSet});
  e.tags.has('a');
  rawSet._items[0] = 'z';
  console.log(
    'raw write to the backing array outside the store: has(a)',
    e.tags.has('a'),
    'has(z)',
    e.tags.has('z'),
  );
}
```

### `scripts/adapter-checks.ts`

```ts
// Adapter checks recreated from review/stage-2/adapters.md (vue-checks, angular-checks,
// angular-computed-write, solid-client), run through run.sh against a worktree.
import {
  onServerPrefetch,
  computed as vComputed,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  watch,
  watchEffect,
  nextTick,
  createApp,
} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {
  computed,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
} from '@angular/core';
import {createEffect, createMemo, createRoot, flush} from 'solid-js';
const SRC = process.env.SRC!;
const {createClassyStore, getInternal} = await import(`${SRC}/core/core`);
const {useClassyStore: useVue} = await import(`${SRC}/frameworks/vue/vue`);
const {injectClassyStore} = await import(`${SRC}/frameworks/angular/angular`);
const solidMod = await import(`${SRC}/frameworks/solid/solid`);
const useSolid = solidMod.fromClassyStore ?? solidMod.useClassyStore;
const listeners = (s: object) => getInternal(s).syncListeners.size;

// Vue 1. SSR leak (V1).
{
  const store = createClassyStore({count: 0});
  const App = defineComponent({
    setup() {
      const st = useVue(store);
      return () => h('p', String(st.value.count));
    },
  });
  const out: string[] = [];
  for (let r = 1; r <= 3; r++)
    out.push(`${await renderToString(createSSRApp(App))}:${listeners(store)}`);
  console.log('vue1 SSR html:listeners after each render', out.join(' '));
}
// Vue 1c. A write made in onServerPrefetch shows in the server HTML.
{
  const store = createClassyStore({count: 0});
  const App = defineComponent({
    setup() {
      const st = useVue(store);
      onServerPrefetch(async () => {
        await Promise.resolve();
        store.count = 5;
      });
      return () => h('p', String(st.value.count));
    },
  });
  console.log(
    'vue1c serverPrefetch write, server html',
    await renderToString(createSSRApp(App)),
    'listeners',
    listeners(store),
  );
}
// Vue 1b. Client mount, write between setup and mount, unmount (V1 sketch).
{
  const store = createClassyStore({count: 0});
  const seen: number[] = [];
  const App = defineComponent({
    setup() {
      const st = useVue(store);
      store.count = 1;
      watch(st, (v) => seen.push(v.count), {flush: 'sync'});
      return () => h('p', String(st.value.count));
    },
  });
  const el = document.createElement('div');
  const app = createApp(App);
  app.mount(el);
  const afterMount = `${el.textContent}:${listeners(store)}`;
  store.count = 2;
  await nextTick();
  const afterWrite = el.textContent;
  app.unmount();
  console.log(
    'vue1b client: after mount html:listeners',
    afterMount,
    'after write',
    afterWrite,
    'after unmount listeners',
    listeners(store),
    'watch saw',
    seen,
  );
}
// Vue 2. Writable ref (V2).
{
  const store = createClassyStore({count: 0});
  const scope = effectScope();
  const st: any = scope.run(() => useVue(store));
  st.value = {count: 99};
  console.log(
    'vue2 after ref write: ref',
    st.value.count,
    'store',
    store.count,
  );
  scope.stop();
}
// Vue 3. computed granularity.
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const scope = effectScope();
  const runs = {whole: 0, count: 0, user: 0};
  scope.run(() => {
    const st = useVue(store);
    const c = vComputed(() => st.value.count);
    const u = vComputed(() => st.value.user);
    watchEffect(
      () => {
        void st.value.count;
        runs.whole++;
      },
      {flush: 'sync'},
    );
    watchEffect(
      () => {
        void c.value;
        runs.count++;
      },
      {flush: 'sync'},
    );
    watchEffect(
      () => {
        void u.value;
        runs.user++;
      },
      {flush: 'sync'},
    );
  });
  store.other++;
  store.other++;
  console.log(
    'vue3 effect runs after two unrelated writes',
    JSON.stringify(runs),
  );
  scope.stop();
}
// Angular 1. Error outside an injection context (N2).
{
  const store = createClassyStore({count: 0});
  try {
    injectClassyStore(store);
  } catch (e) {
    console.log(
      'ng1 outside context:',
      (e as Error).message.split('\n')[0].slice(0, 90),
    );
  }
  console.log('ng1 listeners after the failed call', listeners(store));
}
// Angular 2. Injector option.
{
  const store = createClassyStore({count: 0});
  const injector = Injector.create({providers: []});
  try {
    const st = injectClassyStore(store, {injector});
    store.count = 3;
    console.log(
      'ng2 {injector} works outside a context:',
      st().count,
      'listeners',
      listeners(store),
    );
    injector.destroy();
    console.log('ng2 listeners after destroy', listeners(store));
  } catch (e) {
    console.log(
      'ng2 {injector}:',
      (e as Error).message.split('\n')[0].slice(0, 90),
    );
    injector.destroy();
  }
}
// Angular 3. Store write inside a computed (N1).
{
  const store = createClassyStore({count: 0, reads: 0});
  const injector = Injector.create({providers: []});
  const st = runInInjectionContext(injector, () => injectClassyStore(store));
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) =>
    errors.push(String(a[1] ?? a[0]).split('\n')[0]);
  const trigger = signal(0);
  const derived = computed(() => {
    trigger();
    store.reads++;
    return untracked(() => st().count);
  });
  derived();
  console.error = orig;
  console.log(
    'ng3 write inside computed: store.reads',
    store.reads,
    'signal reads',
    st().reads,
    'console.error count',
    errors.length,
  );
  injector.destroy();
}
// Angular 4. computed granularity.
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const injector = Injector.create({providers: []});
  const runs = {count: 0, user: 0};
  const {c, u} = runInInjectionContext(injector, () => {
    const st = injectClassyStore(store);
    return {c: computed(() => st().count), u: computed(() => st().user)};
  });
  const vc = computed(() => (runs.count++, c()));
  const vu = computed(() => (runs.user++, u().name));
  vc();
  vu();
  store.other++;
  vc();
  vu();
  store.other++;
  vc();
  vu();
  console.log(
    'ng4 downstream runs after two unrelated writes',
    JSON.stringify(runs),
  );
  injector.destroy();
}
// Solid 1. Timing, granularity, cleanup.
{
  const store = createClassyStore({count: 0, other: 0, user: {name: 'Ada'}});
  const runs = {user: 0};
  let readAfterWrite = -1;
  const dispose = createRoot((d) => {
    const st = useSolid(store);
    const user = createMemo(() => st().user);
    createEffect(
      () => user(),
      () => {
        runs.user++;
      },
    );
    store.count = 1;
    readAfterWrite = st().count;
    return d;
  });
  flush();
  store.other++;
  flush();
  store.other++;
  flush();
  console.log(
    'solid1 read straight after write',
    readAfterWrite,
    'effect runs on user after two unrelated writes',
    runs.user,
    'listeners',
    listeners(store),
  );
  dispose();
  console.log('solid1 listeners after dispose', listeners(store));
}
```

### `scripts/run.sh`

```sh
#!/bin/sh
# Usage: run.sh <base|wt> <script> [bun flags]. Runs the script inside that worktree so framework imports resolve there.
S=$(cd "$(dirname "$0")/.." && pwd)
W=$S/$1/packages/classy-store
mkdir -p $W/.probe
cp $S/scripts/$2 $W/.probe/$2
cd $W/.probe && SRC=$W/src timeout 120 bun --conditions browser $3 $2
rm -rf $W/.probe
```

### `scripts/solid-probe.ts`

```ts
import {createRoot, flush} from 'solid-js';
const SRC = process.env.SRC!;
const {createClassyStore} = await import(`${SRC}/core/core`);
const solidMod = await import(`${SRC}/frameworks/solid/solid`);
const useClassyStore = solidMod.fromClassyStore ?? solidMod.useClassyStore;
const store = createClassyStore({count: 0});
const first = createRoot((dispose) => ({
  state: useClassyStore(store),
  dispose,
}));
store.count = 1;
console.log('right after write', first.state().count);
await Promise.resolve();
console.log('after microtask', first.state().count);
flush();
console.log('after flush', first.state().count);
first.dispose();
console.log('after dispose', first.state().count);
```

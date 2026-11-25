# Stage 3 spikes: the base class, checked

Status: **complete for the brief.** Stage 3 of the pre-1.0 review, 2026-11-25. Nothing
here is decided and no library source was changed.

Subject: the points that `review/stage-3/spike-classes.md` left read or
reasoned and not run, before `ClassyStore` is promised for 1.0.

- Worktree: a detached copy at `57404c3` in `<scratch>/stage-3-spike-classes-2/wt`.
- Base: `c1-t1strict-w2.patch` of the first classes report (T3 (a), T1
  strict, the base class and W2 in one patch), copied to
  `<scratch>/stage-3-spike-classes-2/patches/combo-c1.patch`. Called "the C1
  build" below.

## Summary

| Check                      | Result                                                                                                                                                                                                                                                                                                                                                               | What it asks for                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| V1. Real compilers         | Seventeen outputs of TypeScript (both `useDefineForClassFields`), Bun, Oxc as `tsdown` runs it, esbuild, Next.js's own SWC and Babel (spec and loose). Every one: first snapshot right, arrow method one notification, field write and timer's write seen. Only an ES5 output differs: an arrow method is two notifications                                          | One sentence about ES5 output                                 |
| V4. Undo of a nested store | Reproduced, and wider than reported: after one undo **every** row of the list is a frozen snapshot, on `withHistory` and on the P7 DevTools jump. An in-place restore that puts each node back fixes all three cases, and makes undo of one row in 1,000 plain rows 8 times faster (2,315 to 273 µs) with 999 row snapshots kept                                     | Do it with the base class, before 1.0 if the base class ships |
| V3. The edges of W2        | As spiked, a callback assigned later reads back as a wrapper: `===` fails, `removeEventListener` with the other reference leaves the listener, `name` and `length` are lost. W2 cannot be limited to the constructor exactly; "wrap only when the write creates the field" matches it for every field with an initialiser on every compiler, for 3 lines and 7 bytes | Ship W2 in the "on create" form, with one rule in the docs    |
| V2. The other adapters     | Vue, Svelte, Solid, Angular, `createStoreHook` and `useLocalStore`: 7 throwaway tests, all pass. `useLocalStore` under `StrictMode` makes two stores, so a constructor's timer runs twice                                                                                                                                                                            | One sentence in the docs                                      |
| V5. Getters                | With the getter combination (G7a, not G7b) a base-class store made inside a getter or a method it calls works on both layers. G7a refuses only a write to the getter's own `this`. A getter that returns `new Sub()` returns a live store, also on a snapshot                                                                                                        | One sentence in the docs                                      |
| V6. Types and shapes       | Generic, abstract, three levels deep, statics, `instanceof` on store and snapshot, `createClassyStore` twice, `PROXYABLE` as well: all right, checked by the package's own `tsc`                                                                                                                                                                                     | Nothing                                                       |

**Recommendation: ship `ClassyStore` in 1.0**, with W2 in its "on create"
form and the in-place restore of V4. The section "Recommendation" at the end
gives the surface, the sentences for the docs, the tests stage 4 writes first
and the bytes.

## V1. Real compilers

- **Question.** Does a `ClassyStore` subclass behave the same whatever
  compiles it? The first report wrote the assignment form by hand ("Not run
  at all"). M12 in `merged.md`.
- **What was changed.** Nothing in the library beyond the C1 build.
  `repro/v1/sub.ts` (appendix) is one class: two fields with initialisers, a
  field without one that the constructor sets, a TypeScript parameter
  property, an arrow-function field that pushes twice, a prototype method, a
  getter, and a constructor with two arguments that starts a timer.
  `compile.mjs` and `swc-next.cjs` compile it seventeen ways; `run.mjs` runs
  each output against the built C1 library, on Bun and on Node.
- **SWC as Next.js configures it.** `swc-next.cjs` calls Next.js 16.4.6's own
  SWC binding with the options its loader builds (`getLoaderSWCOptions`), the
  `tsconfig.json` of `examples/nextjs` and Next.js's default browser list.
  Next.js reads `useDefineForClassFields` from `tsconfig.json` and passes
  `Boolean(value)`, so the example, which does not set it, gets `false`:
  fields are assigned. Next.js 16 builds with Turbopack by default; I did not
  run a Turbopack build. It does not matter for the result, because both forms
  behave the same below.

### Result

The four checks of the brief, plus whether the store and its snapshot hold
the same arrow method:

| Compiler and settings                                    | Fields emitted as                | First snapshot | Arrow method, 2 pushes | Field write | Timer's write | Store and snapshot share the method |
| -------------------------------------------------------- | -------------------------------- | -------------- | ---------------------- | ----------- | ------------- | ----------------------------------- |
| TypeScript 6.0.3, ES2022, `useDefine…` true              | class fields                     | right          | 1 notification         | seen        | notifies      | yes                                 |
| TypeScript 6.0.3, ES2022, `useDefine…` false             | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| TypeScript 6.0.3, ES2017, `useDefine…` true              | `Object.defineProperty` calls    | right          | 1                      | seen        | notifies      | yes                                 |
| TypeScript 6.0.3, ES2017, default (Next.js tsconfig)     | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| Bun 1.4.5 transpiler, default (the unit suite)           | class fields                     | right          | 1                      | seen        | notifies      | yes                                 |
| Bun transpiler, `useDefine…` false                       | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| Oxc through rolldown 1.3.2 (what `tsdown` runs), default | class fields                     | right          | 1                      | seen        | notifies      | yes                                 |
| Oxc, ES2017                                              | `_defineProperty` helper         | right          | 1                      | seen        | notifies      | yes                                 |
| Oxc, ES2017, `setPublicClassFields`                      | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| esbuild 0.28.2, default                                  | class fields                     | right          | 1                      | seen        | notifies      | yes                                 |
| esbuild, ES2020                                          | `__publicField` helper           | right          | 1                      | seen        | notifies      | yes                                 |
| esbuild, `useDefine…` false                              | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| Next.js 16.4.6 SWC, client and server layer              | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| Babel 7, class properties, spec                          | `_defineProperty` helper         | right          | 1                      | seen        | notifies      | yes                                 |
| Babel 7, class properties, loose                         | assignments                      | right          | 1                      | seen        | notifies      | yes                                 |
| Next.js SWC with an empty browser list (ES5)             | assignments, `_this`, `function` | right          | **2 notifications**    | seen        | notifies      | yes                                 |

`instanceof` the class and `instanceof ClassyStore` were true for every
output. Node gave the same table, except that two outputs could not load
their helper packages (`@oxc-project/runtime`, `@swc/helpers`) from the
scratch folder; Bun installed them on the fly and ran them.

- **Every modern output works.** Class fields, a definition helper and
  assignments all reach the store, because `super()` hands back the proxy
  before any field is set up. With T3 (a) a definition is a write, so the
  first snapshot is right in every form.
- **One gap: code compiled down to ES5.** An arrow function becomes a
  `function` expression over `_this`. It still writes through the store, so
  nothing is lost, but it has a `prototype`, so W2 takes it for data: two
  notifications for one call, as in the first report's limit 8. Only a
  browser list that reaches back to ES5 does this; Next.js's default list
  does not, and TypeScript 6 deprecates the ES5 target. One sentence in the
  docs covers it.

## V4. Undo and time travel of a nested base-class store

- **Question.** The first report's limit 3: after an undo, a base-class store
  inside another store comes back as a frozen copy whose arrow functions
  still write the original. Does an in-place restore (M60) mend it, and what
  does it cost? M60, M56, merged dependency 14.
- **Base.** The C1 build with `p7.patch` and `p8.patch` of
  `review/stage-3/persist-devtools.md` on top (`base-c1-p7-p8.patch`). P7
  conflicts with the C1 build in one line of `storeRuntime.ts`, the export
  list; both names were kept. With them: 1,312 pass and 29 fail, the 28 of
  the C1 build and the one P8 **fixes**.
- **The reproduction.** `repro/v4/v4.ts`: a `List` that extends
  `ClassyStore` and holds three `Row`s that extend it, each with an arrow
  method and a prototype method. Each case keeps the three rows as they were
  made, changes the list, restores it, and then calls both methods of row 0.

### Before: the C1 build with P7 and P8

| Case                                                    | Each row is the store that was made | Row 0 frozen | Row 0 arrow method                                                       | Row 0 prototype method                            |
| ------------------------------------------------------- | ----------------------------------- | ------------ | ------------------------------------------------------------------------ | ------------------------------------------------- |
| `withHistory`: toggle row b, undo                       | no, no, no                          | yes          | list hears nothing; the list's row 0 does not change; the old store does | throws "Attempted to assign to readonly property" |
| `withHistory`: remove row a, undo                       | no, no, no                          | yes          | the same                                                                 | throws                                            |
| `devtools` (P7): two toggles, jump to entry 1 by its id | no, no, no                          | yes          | the same                                                                 | throws                                            |
| `devtools`: a jump by JSON (id unknown)                 | no                                  | no           | gone: the row is a plain object without the method                       | gone                                              |

So the limit is wider than the first report says: **every** row of the
changed list is replaced, not only the one that changed, because the restore
replaces the whole `rows` array and puts each row's frozen snapshot in it. A
row class without `PROXYABLE` is opaque to `cloneSnapshotValue`, so the
snapshot itself goes into the store.

### The spike: put back the node, then change it in place

`v4-in-place.patch`, on the base above: 80 lines added and 48 removed in
`core.ts`, `storeRuntime.ts`, `cloneSnapshot.ts` and `history.ts`.

- `core.ts` gains an internal `liveNodeOf(snapshot)`: the store proxy of the
  node a snapshot was taken of, while that node exists. It is `identityOf()`
  and the existing `targetNodes` map, 11 lines.
- `applyState` in `cloneSnapshot.ts` becomes recursive. A recorded value
  whose node still exists goes back as that node, and the recorded data is
  written into it: field by field for an object, index by index and then the
  length for an array. A node whose current snapshot is the recorded one is
  left alone at once. Anything else is copied, as today.
- `withHistory` drops its own copy of the apply and calls `applyState`, which
  is what P7 already asks for (merged dependency 14). Its own
  `isData(key)` is replaced by `isDataKey`, which also skips a setter-only
  accessor; no test sees the difference.
- A row is matched by its identity, not by its position. A row removed and
  brought back by an undo is the same store again, at its old index, and a
  reordered list gets its rows back in order without one row taking on
  another's data.
- JSON from DevTools (an id it does not know) is untrusted and goes the old
  way, so a row there is still replaced by a plain object. Matching by
  position in that case is the other half of M60 and was not built.

| Case                                       | Each row is the store that was made | Row 0 frozen | Row 0 arrow method               | Row 0 prototype method |
| ------------------------------------------ | ----------------------------------- | ------------ | -------------------------------- | ---------------------- |
| `withHistory`: toggle row b, undo          | yes, yes, yes                       | no           | 1 list notification; row changes | 1 list notification    |
| `withHistory`: remove row a, undo          | yes, yes, yes                       | no           | the same                         | the same               |
| `devtools` (P7): jump to entry 1 by its id | yes, yes, yes                       | no           | the same                         | the same               |
| `devtools`: a jump by JSON                 | no                                  | no           | gone, as before                  | gone                   |

### Result

| Measure                | Base (C1, P7, P8)                              | With the in-place restore                                                                                                                                 |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                  | 1,312 pass, 29 fail                            | The same 29. One more failed in a first draft that skipped writing a missing field whose recorded value was `undefined` (`history.fields.test.ts`); fixed |
| Typecheck              | 2 errors, the two export and option list tests | The same                                                                                                                                                  |
| Main entry, gzipped    | 3,821 bytes                                    | 3,822                                                                                                                                                     |
| `./utils` adds to main | 3,040 bytes                                    | 3,153, +113                                                                                                                                               |

Undo and redo of one edited row in a list of 1,000 (`repro/v4/bench-undo.ts`,
Bun, one restore and the snapshot after it, median of five rounds of 600,
two runs of each build back to back):

| Rows                           | Base                                | In place                    | Row snapshots an undo keeps | A row proxy held from before the edit is still in the list |
| ------------------------------ | ----------------------------------- | --------------------------- | --------------------------- | ---------------------------------------------------------- |
| Plain objects                  | 2,315 and 2,383 µs (2,039 to 2,448) | 273 and 282 µs (268 to 287) | 0 of 1,000, then 999        | no, then yes                                               |
| Rows that extend `ClassyStore` | 324 and 340 µs (318 to 367)         | 308 and 318 µs (307 to 326) | 999, then 999               | no, then yes                                               |

The base is fast for base-class rows only because it puts each frozen
snapshot back as it is, which is the defect. For plain rows the in-place
restore is eight times faster and keeps 999 of the 1,000 row snapshots, so a
list that renders rows by reference renders one row again instead of 1,000.
Node was not run: the script imports the TypeScript source, which Node's
type stripping cannot load.

### What it changes for a user

- After an undo or a jump, a nested store, a row proxy a component holds and
  every untouched row are the objects they were. Today the reference says
  "changed fields are replaced with mutable copies"; that sentence changes.
- A node that left the store and was put somewhere else is put back here as
  well, so after the undo it sits in both places. That is what the recorded
  state says, but it is new. Reasoning; not run.

### Recommendation

**Do it with the base class, before 1.0 if the base class ships in 1.0.**
Without it, undo and DevTools time travel break every nested base-class
store on the first use, with a `TypeError` for a prototype method and silence
for an arrow method. It is also the M60 performance fix for plain rows. The
JSON path of DevTools keeps its limit; say in the docs that a jump the
extension sends as JSON restores data, not class instances.

### Cost for stage 4

`cloneSnapshot.ts` (the recursive apply), `history.ts` (uses it), one
internal export from `core.ts`. Tests: each row of the two tables above, the
1,000-row case as a test that counts kept row snapshots, the field restored
as `undefined`, a row moved to another store. 113 bytes on `./utils`, whose
budget the decision document resets anyway. Risk medium: undo of every store
now goes through the new code.

## V3. The edges of W2

- **Question.** What a user sees when W2 wraps an arrow function written to a
  field of a base-class store; whether W2 can be limited to what the
  constructor installs; what the utilities see. Stage 1 finding 60, M59.
- **Build.** The C1 build with P7, P8 and the in-place restore of V4. None of
  those three touches W2. `repro/v3/v3.ts` (appendix) runs every case; the
  same class body on a plain `createClassyStore({...})` is the control.

### A callback assigned after construction, under W2 as spiked

| What the user writes or checks                                            | Base-class store (W2)                | Plain store (T1 strict) |
| ------------------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| `form.onSave = cb; form.onSave === cb`                                    | **false**                            | true                    |
| `form.onSave === form.onSave`, and the snapshot's `onSave`                | true, the same wrapper on every read | true, `cb` itself       |
| `snapshot(form).onSave === cb`                                            | **false**                            | true                    |
| `form.onSave.name`, `.length`                                             | `""` and `0` (`cb` has `"cb"`, `1`)  | `"cb"`, `1`             |
| `form.onSave = cb` again; `form.onSave = form.onSave`                     | no notification, either              | no notification         |
| `if (form.onSave === cb) form.onSave = null`                              | **never clears**                     | clears                  |
| `addEventListener('x', cb)`, then `removeEventListener('x', form.onSave)` | **listener stays**                   | removed                 |
| `addEventListener('x', form.onSave)`, then `removeEventListener('x', cb)` | **listener stays**                   | removed                 |
| `form.listeners.push(cb)`: `[0] === cb`, `includes`, `indexOf`            | all true: an array is another node   | all true                |

So W2 as spiked breaks three things people write: an identity test, a
`removeEventListener` with the other reference, and `fn.name` and `fn.length`,
which loggers and some libraries read.

### Can W2 be limited to what the constructor installs?

**Not exactly, with any compiler.** The library never learns when a
subclass's constructor ends: `super()` returns first, and the field
initialisers and the constructor body run after it with no further call into
the library. What it can see is whether a write **creates** the property.
`w2-on-create.patch` (3 lines in `core.ts`, +7 bytes) wraps an arrow function
only then, in `set` and in `defineProperty`; a function written to a field
that already exists is data, as on a plain store.

Run against all seventeen outputs of V1, with two callback fields added to
the class, `onSave: (() => void) | null = null` and `onCancel?: () => void`,
each assigned an outside arrow function after construction:

| Compiler output                                                                                                                          | Arrow field the class defines | `onSave` (has an initialiser) | `onCancel` (no initialiser) |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- | --------------------------- |
| W2 as spiked, every output                                                                                                               | 1 notification (2 for ES5)    | wrapped                       | wrapped                     |
| On create: class fields, definition helpers, Babel loose                                                                                 | 1 notification                | kept                          | kept                        |
| On create: assignments from TypeScript (`useDefine…` false or ES2017 default), Bun, esbuild and Oxc with `useDefine…` false, Next.js SWC | 1 notification                | kept                          | **wrapped**                 |

So "on create" matches the constructor for every field that has an
initialiser or that the constructor sets, with every compiler. It differs by
compiler for one case: a field declared with no initialiser and first set
after construction. A compiler that assigns leaves such a field out, so the
later write creates it. The docs can make that case go away with one rule:
"declare a callback field with an initialiser, such as `= null`".

With "on create", the V3 table above reads like the plain store in every
row: identity kept, `removeEventListener` works, the snapshot holds `cb`.
Tests: the same 29 fail. A callback that later replaces an arrow method, as
in `todos.add = otherFn`, is then data, and its writes notify one by one.

### What the utilities see

Under either form, a wrapped field holds the wrapper, so every utility sees
the wrapper and never the original; under "on create" a later callback is
held and seen as itself.

| Utility                         | What it sees or does                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `snapshot()`                    | The value the field holds: the wrapper (W2) or `cb` (on create)                                                                                                                                                    |
| `shallowEqual` of two snapshots | Equal: the same function on both. Against `cb` itself: unequal under W2                                                                                                                                            |
| `cloneSnapshotValue`            | Passes the function through as it is, the wrapper or `cb`                                                                                                                                                          |
| `withHistory`                   | Assigning a new callback notifies, so it **records an entry**. `undo()` skips function fields, so that entry changes nothing: one undo step that does nothing. The same on a plain store; it is finding 60 and M59 |
| `persist`                       | Leaves function fields out of what it writes: `{"value":"saved","listeners":[]}`                                                                                                                                   |
| `devtools`                      | The state it sends is a snapshot; JSON drops the function                                                                                                                                                          |

### Other functions in a field of a base-class store

| Field                                                 | Result                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plainFn = function () {…}` with two writes           | Data, not wrapped: 2 notifications. Called as `form.plainFn()`, `this` is the store, so nothing is lost                                                                                                                                                                                        |
| `this.save = this.save.bind(this)` in the constructor | A bound function has no `prototype`, so W2 wraps it: 1 notification, and destructured it still writes the store                                                                                                                                                                                |
| Another store's bound method assigned to a field      | Kept as it is: the wrapper maps to itself                                                                                                                                                                                                                                                      |
| `Model = Model`, a class as a value                   | Data: `form.Model === Model`, `new form.Model()` works, statics are there                                                                                                                                                                                                                      |
| `parse = JSON.parse`, a native function               | No `prototype`, so W2 wraps it: `nat.parse === JSON.parse` is false; `nat.max(1, 3)` still gives 3. The wrapper calls it with the store as `this`, so a destructured native that checks `this` (`fetch` in a browser) would throw where the bare function would not. Reasoning; no browser run |

### Recommendation

**Ship W2 in its "on create" form, with the base class.** It keeps what W2
is for, an arrow method being one transaction, with every compiler, and it
gives back the identity of every callback a user assigns later. The one
uneven case has a one-line rule in the docs. Plain W2 makes every later
callback a different function from the one assigned, which no rule can
explain away.

### Cost for stage 4

Three lines on top of W2 in `core.ts`; +7 bytes. Tests: every row of the
two tables above, on two compilations (class fields and assignments). Docs:
"An arrow function that a `ClassyStore` subclass sets up as a field is a
method: one transaction per call. A function assigned to an existing field
later is data, kept as it is. Declare a callback field with an initialiser."

## V2. The other adapters

- **Question.** Only React was run with a base-class store. Do Vue, Svelte,
  Solid and Angular, `createStoreHook` and `useLocalStore` work with one?
- **What was changed.** One throwaway test file,
  `adapters.spike.test.tsx` (appendix), modelled on the adapters' own unit
  tests, on the build of V3. One class, `Counter extends ClassyStore`: two
  fields, a constructor argument, a getter, an arrow method that writes
  twice, a prototype method that pushes twice, and a method that starts a
  timer.
- **Result: 7 tests, all pass.**

| Adapter                                 | Checked                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vue `useClassyStore`                    | The ref holds the frozen snapshot; a `computed` over the getter is right; the arrow method called on the snapshot gives one synchronous watcher call; a method and a timer reach the ref; stopping the scope leaves no listener |
| Svelte `toSvelteStore`                  | One delivery for the arrow method and one for the method; the getter is on each value; the timer's write is delivered; unsubscribing leaves no listener                                                                         |
| Solid `useClassyStore` (server runtime) | The accessor returns the store's snapshot; the getter is right before and after the arrow method; one synchronous notification; disposing the root leaves no listener                                                           |
| Angular `injectClassyStore`             | The signal and a `computed` over the getter follow the arrow method at once, with one notification; the timer reaches the signal; destroying the injector leaves no listener                                                    |
| `createStoreHook`, with a selector      | One re-render for the arrow method's two writes                                                                                                                                                                                 |
| `createStoreHook`, auto-tracked         | The arrow method passed straight to `onClick` from the snapshot works                                                                                                                                                           |
| `useLocalStore(() => new Counter(5))`   | Under `StrictMode` the store kept is one of those made, and the arrow method works as a handler                                                                                                                                 |

One thing to say in the docs, seen in the last row: under `StrictMode` in
development React calls the factory twice, so **two** stores are made and
one is thrown away. With the base class a constructor is where a user will
start a timer or a listener, and the discarded store's timer runs anyway.
The same holds for `createClassyStore(new X())` in a factory today; the base
class only makes it more likely. Sentence for the docs: "A constructor runs
once per store made. Start a timer, a listener or a request in a method you
call from an effect, not in the constructor, if the store is made by
`useLocalStore`."

Not run: Solid's client runtime and every browser suite, as the brief says.

## V5. Getters

- **Question.** With the getter report's combination (G3c, the dependency
  half of G4, G5 and G7a, not G7b), does a base-class store made inside a
  getter, or inside a method a getter calls, work on both layers? What does
  a getter that returns `new Sub()` give?
- **What was changed.** The getter combination of `spike-getters.md`
  appendix E, applied on top of the V4 build. It applies with no conflict
  together with every other patch here.
- **Tests:** 1,304 pass, 44 fail. That is the 29 of the V4 build and the 16
  of the getter combination, one of which, the `defineProperty` test of a
  redefined value, is on both lists. No new failure.
- **Typecheck:** the same two errors, the export and option list tests.
- **Size:** main entry 3,983 bytes, `./utils` adds 3,162.
- **The reproduction.** `repro/v5/v5.ts`: a `Shop` with a getter that
  returns `new Item(this.name)`, a getter that calls a method that does, and
  a getter that writes `this.counter`. `Item` extends `ClassyStore` and
  writes and reads its own field in its constructor. Run on the V4 build and
  on this one; the only line that differs is G7a's.

| Case                                              | Live store                                                           | Snapshot                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `get direct() { return new Item(this.name) }`     | An `Item`, a working store, not frozen                               | The same: a live `Item` store, not frozen                                                                                  |
| Read twice                                        | The same `Item`: memoized                                            | The same `Item`                                                                                                            |
| The `Item`'s arrow method                         | 1 notification to the `Item`'s subscribers, none to the shop         | The same                                                                                                                   |
| After the `Item` changes                          | Still the same `Item`: its fields are not dependencies of the getter | The same                                                                                                                   |
| A getter that calls a method that makes an `Item` | Works                                                                | Works                                                                                                                      |
| The shop's subscribers, while `Item`s are made    | 0 notifications                                                      | 0                                                                                                                          |
| After `shop.name` changes                         | A new `Item`, with the new name                                      | A new `Item` on the next snapshot                                                                                          |
| A getter that writes `this.counter`               | Allowed: G7b is not taken                                            | **Throws** (G7a): `TypeError: Proxy object's 'set' trap returned falsy value`; before G7a the write was dropped in silence |

So a base-class store made inside a getter works on both layers, because
its writes go to its own node, never to the getter's `this`, and G7a only
refuses a write to `this`. The getter report's worry about G7b does not
arise.

Two things to say in the docs:

- **A getter that returns a new store returns a live store, on a snapshot
  too.** It is not frozen, it is not part of the snapshot, and the owner
  does not hear of its changes. It is made again whenever a field the getter
  read changes. Keep stores in fields; a getter should return data.
- **The G7a error says nothing about the library.** The message is the
  engine's own Proxy error. Stage 4 could throw its own message instead
  (G7a returns `false` from the trap); that is the getter report's call.

## V6. Types and shapes

- **Question.** `Snapshot<Sub>`, a generic subclass, an abstract subclass, a
  subclass of a subclass, static members, `instanceof` on the store and its
  snapshot, `createClassyStore(new Sub())`, and a subclass that also sets
  `static [PROXYABLE]`.
- **What was changed.** One throwaway test file,
  `classyStore.shapes.spike.test.ts` (appendix), on the V5 build. Its type
  assertions are checked by the package's own `tsc` (TypeScript 7.0.2, the
  `tsc --noEmit` of the package's typecheck script). I checked that this
  `tsc` sees a new file under `src/` by adding one with a type error: it was
  reported.
- **Result.** 7 tests pass under Bun, and `tsc` reports nothing in the file,
  including its two `@ts-expect-error` lines, which would be errors if the
  error they expect did not occur.

| Shape                                | Result                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Snapshot<Todos>`                    | Fields deeply read-only, the getter keeps `number`, the arrow field and the prototype method keep their signatures; `snapshot(todos)` is `Snapshot<Todos>`; `createClassyStore(todos)` is `Todos`                                              |
| `class Box<T> extends ClassyStore`   | `new Box(1)` is `Box<number>`; the arrow method's parameter is `number`, and `box.put('x')` is a type error; `Snapshot<Box<{n: number}>>['value']` is `{readonly n: number}`                                                                   |
| An abstract subclass                 | `new Shape()` is a type error. A concrete subclass works: its abstract getter is right on the store and the snapshot, an arrow method of the abstract class is one notification for two writes                                                 |
| Three levels (`Base`, `Mid`, `Leaf`) | Arrow methods of each level: one notification each; a getter over all three levels right on the snapshot; `instanceof` every level and `ClassyStore`, on the store and on its snapshot                                                         |
| Static members                       | A static factory returns a store typed as the class; a static counter written by the constructor counts; a static getter works; `store.constructor` is the class, so statics are reachable through it and through the snapshot's `constructor` |
| `instanceof`                         | True for the class and for `ClassyStore`, on the store and on the snapshot                                                                                                                                                                     |
| `createClassyStore(new Sub())`       | Returns the same store, also when called twice                                                                                                                                                                                                 |
| `static [PROXYABLE] = true` as well  | Harmless. The store is the same, it nests in a list by its proxy, an arrow method notifies the list once, and an undo with V4 leaves the same row in the list                                                                                  |

- **The type of `ClassyStore`.** It is `new () => object`. So
  `super(args)` is a type error, which is right: the base takes no
  arguments. `value instanceof ClassyStore` narrows only to `object`. A
  user's `class X extends ClassyStore` emits declarations without trouble,
  because the base is an exported value with a construct signature.
- **`abstract` is a type only.** At run time `new Shape()` makes a store, as
  JavaScript would without the base.

## The combination

- **What is in it.** The C1 build (T3 (a), T1 strict, the base class, W2),
  P7 and P8, the in-place restore of V4 and W2 "on create" of V3
  (`recommended.patch` in the scratch folder: 6 files, 355 lines added, 119
  removed). Not the getter combination, which is its own decision; V5 shows
  it combines without conflict.
- **Tests:** with the 14 throwaway tests of V2 and V6, 1,326 pass and 29
  fail of 1,355. The 29 are the 28 of the first report (the 27 **fixes** of
  the two trap patches and the **incidental** export list) and the one P8
  **fixes**. No regression.
- **Typecheck:** two errors, both **incidental** list tests: the main
  entry's export list (`ClassyStore`) and P7's option list.
- **Size,** bytes gzipped:

  | Entry                 | Today | Combination | Budget |
  | --------------------- | ----: | ----------: | -----: |
  | `.`                   | 3,661 |       3,829 |  3,750 |
  | `./utils` adds        | 2,686 |       3,159 |  2,750 |
  | `./collections` adds  |   727 |         722 |    750 |
  | `./react` adds        | 1,662 |       1,659 |  1,700 |
  | `./react/server` adds |   153 |         145 |    175 |
  | `./vue` adds          |   280 |         280 |    300 |
  | `./svelte` adds       |   182 |         176 |    200 |
  | `./angular` adds      |   271 |         278 |    300 |
  | `./solid` adds        |   312 |         311 |    335 |

  Of the main entry's 168: the trap patches 44, the base class 13, W2 83
  (first report), W2 "on create" 7, P7's hook about 20, V4's internal export
  1. Of `./utils`: P7 about 400, V4 113, P8 about -24.
- **Timings.** `runCoreBenchmark.mjs --runs 5` on saved copies of the
  unmodified build and the combination, Bun and Node, two rounds run back to
  back (`bench.sh`). Ratios to a forwarding Proxy, median and range:

  | Ratio           | Bun, unmodified                          | Bun, combination                         | Node, unmodified                         | Node, combination                        | Limit, Bun and Node |
  | --------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | ------------------- |
  | Read            | 14.5 (10.7 to 15.6), 12.3 (12.1 to 14)   | 12.3 (10.9 to 14.2), 14.2 (12.2 to 15.8) | 2.04 (2.00 to 2.10), 2.04 (2.01 to 2.10) | 2.09 (2.03 to 2.14), 2.08 (2.04 to 2.09) | 20 and 2.5          |
  | Write           | 2.59 (2.55 to 2.69), 2.58 (2.56 to 2.62) | 2.58 (2.55 to 2.61), 2.56 (2.55 to 2.62) | 1.32 (0.92 to 1.42), 1.35 (1.33 to 1.38) | 1.37 (1.34 to 1.41), 1.37 (1.33 to 1.38) | 3.2 and 1.7         |
  | Cached getter   | 26.6 (20 to 31.9), 26.8 (22.8 to 27.6)   | 22.8 (20 to 27.6), 28.1 (22.4 to 30.4)   | 3.49 (3.46 to 3.67), 3.52 (3.51 to 3.58) | 3.56 (3.48 to 3.62), 3.58 (3.50 to 3.64) | 41 and 5.3          |
  | Cached snapshot | 7.09 (4.99 to 7.38), 6.10 (5.83 to 6.79) | 6.18 (5.29 to 6.62), 6.60 (5.96 to 7.82) | 1.39 (1.35 to 1.48), 1.36 (1.34 to 1.46) | 1.42 (1.35 to 1.53), 1.26 (1.11 to 1.37) | 10 and 1.8          |

  Every pair of ranges touches: no ratio moved, and every one is inside its
  limit. Per metric, one difference held in both rounds: `store.method` on
  Node, 317 and 315 ns (303 to 319) against 297 and 286 (285 to 304), about
  7 percent. That is the path P7's action-name hook sits on, not the base
  class. `create.small` and `create.rows` on Bun were 5 to 10 percent slower
  in one round each and touched in the other; I count them as not shown.

## Recommendation

**Ship `ClassyStore` in 1.0.** Every point the first report left unrun holds
or has a fix that was run: the compilers (V1), the adapters (V2), getters
(V5) and types (V6) hold as they are; undo and time travel of a nested store
(V4) and the identity of a later callback (V3) need the two patches here.

### The public surface

One value from the main entry, `@codebelt/classy-store`:

```ts
export const ClassyStore: new () => object;
```

A class that extends it is a store from its first line: field initialisers,
the constructor body, arrow-function fields, methods bound in the
constructor and whatever the constructor starts all see the store as
`this`. `createClassyStore(instance)` stays, returns the same store for a
`ClassyStore` instance, and is the way for a class that has to extend
something else.

### W2 ships with it, in the "on create" form

An arrow function (any function without its own `prototype`, which includes
bound and native functions) that **creates** a field of a `ClassyStore`
instance is held as one wrapper that runs it as a transaction. A function
written to a field that already exists is data, kept as it is, as on every
other store. In practice that is every arrow method the class declares,
under every compiler of V1, and no callback assigned later to a declared
field.

### The sentences the docs must carry

1. "Extend `ClassyStore`, or use prototype methods. In a class that extends
   it, an arrow-function field is a method: one transaction per call."
2. "A function assigned later to a field that exists is data and is kept as
   it is. Declare a callback field with an initialiser, such as
   `onSave: (() => void) | null = null`." (V3: without an initialiser,
   whether the field exists depends on the compiler.)
3. "Code compiled to ES5 turns arrow functions into ordinary functions; an
   arrow method then notifies once per write." (V1.)
4. "A `#private` field is never state", with the sentence of the first
   report's C2, and the same for an `accessor` field.
5. "A constructor runs once per store made. Under React's `StrictMode`,
   `useLocalStore` makes two in development; start timers and listeners from
   a method called in an effect." (V2.)
6. "A getter that returns a new store returns a live store, on a snapshot
   too. Keep stores in fields." (V5.)
7. "An arrow method read from a snapshot writes the live store." (First
   report, limit 4.)
8. "A DevTools jump the extension sends as JSON restores data, not class
   instances; a jump to an entry this session sent restores the instances."
   (V4.)
9. "A class that has to extend another class uses
   `createClassyStore(new X())`."

### The tests stage 4 writes first

1. The base class on two compilations of one fixture class: Bun's
   transpiler as it is and with `useDefineForClassFields: false`
   (`Bun.Transpiler` runs inside the unit suite). The four checks of V1 on
   each.
2. The two tables of V4, the 1,000-row case as a count of kept row
   snapshots, a row brought back after removal, a field restored as
   `undefined`.
3. The tables of V3 for both a declared and an undeclared callback field,
   and the function kinds (a `function` expression, a bound method, a class
   as a value, a native function).
4. The seven adapter tests of V2 and the seven shape and type tests of V6.
5. `types.index.test.ts` and `types.exports.test.ts` gain `ClassyStore`.

### Its bytes

The base class is 13 bytes, W2 83 and its "on create" form 7 more: 103 on
the main entry, on top of the 44 of the trap patches it needs. The in-place
restore is 113 on `./utils` and 1 on the main entry. The whole combination
measures 3,829 on the main entry and adds 3,159 for `./utils`, most of the
latter P7's; the decision document sets the new budgets.

### What has to be true first

T3 (a) and T1 strict (the trap report) are prerequisites, as the first
report says. The in-place restore builds on P7's shared `applyState`.

## Verified and not verified

**Run, with the result in this report:**

- V1: seventeen compilations of one class, each run on Bun against the
  built C1 library, and on Node where its helpers loaded; again with two
  callback fields under W2 and under W2 "on create". TypeScript's ES5
  deprecation message, from TypeScript 6.0.3.
- V2 and V6: 14 throwaway tests under Bun; V6's types under the package's
  `tsc`; a declaration emit of a consumer class with `tsc`.
- V3, V4, V5: the reproductions before and after each spike; the undo
  timing on Bun, two runs of each build.
- `bun run test`, `bun run size` and the typecheck for: the base (C1, P7,
  P8), the base with V4, with V4 and W2 "on create", with V4 and the getter
  combination, and the recommended combination with the throwaway tests.
- `runCoreBenchmark.mjs --runs 5` on saved copies of the unmodified build and
  the recommended combination, Bun and Node, two rounds. This is the script
  `bun run benchmark:core` runs after its build.

**Read or reasoned, not run:**

- That Turbopack, Next.js 16's default bundler, compiles class fields the way
  the webpack loader's SWC does. It does not change the result, since both
  forms behave the same.
- That a wrapped native function such as `fetch` throws "Illegal invocation"
  when destructured in a browser (V3). No browser was run.
- That restoring a node that has since moved into another store leaves it in
  both places (V4).
- The classes of the failing tests are taken from the first report, the trap
  report, the getter report and the persist report; I compared the lists by
  name and read the body of the one test my first draft of V4 broke.
- The split of the main entry's bytes between patches is from the reports
  that measured each patch alone, not measured again here.

**Not run at all:**

- The browser, framework, React compatibility, Next.js, Angular, memory and
  mutation suites, `test:coverage`, `check:floor` and `lint` on spike code,
  as the brief says.
- The undo timing on Node: the script imports TypeScript source that Node's
  type stripping cannot load.
- Matching rows by position for a DevTools jump sent as JSON (the other half
  of M60).
- Solid's client runtime.

**Limits of the timings.** Three other agents ran benchmarks and test suites
during every run. I report a difference only where the ranges of both rounds
do not touch.

## Appendix A: how to run it again

1. Make a throwaway worktree at `57404c3`, run `bun install --frozen-lockfile`
   and `bun run build` once.
2. The base: apply `c1-t1strict-w2.patch` from appendix B of
   `review/stage-3/spike-classes.md` (its three steps `t3a-t1strict.patch`,
   `base-class.patch` and `w2.patch` in order give the same tree), then
   `p7.patch` with `git apply --reject` and add `actionName,` by hand to the
   export list of `storeRuntime.ts` (the one rejected hunk), then `p8.patch`,
   both from the appendix of `review/stage-3/persist-devtools.md`. That is
   "the base" of V4.
3. Then, in order: `v4-in-place.patch`, and `w2-on-create.patch` below. That
   is the recommended combination. For V5 add the getter combination from
   appendix E of `review/stage-3/spike-getters.md` to the V4 build with plain
   W2; it applies with no conflict. It was not tried with
   `w2-on-create.patch`.
4. The scripts below take the source folder in `SRC` or the scratch folder
   in `M`; `compile.mjs` needs `@babel/core@7`,
   `@babel/plugin-transform-class-properties@7`, `@babel/preset-typescript@7`
   and `typescript@6.0.3` installed in `<scratch>/stage-3-spike-classes-2/tools`.
   The two test files go into `packages/classy-store/src/` and
   `packages/classy-store/src/frameworks/` and run with `bun test <file>`.

## Appendix B: patches

### `v4-in-place.patch`: V4, the in-place restore, on the base

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 40a76a5..74d33d5 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -647,6 +647,18 @@ export const ClassyStore = function (this: object) {
   return createClassyStore(this);
 } as unknown as new () => object;
 
+/**
+ * @internal The store proxy of the node a snapshot was taken of, while that
+ * node exists; otherwise undefined.
+ */
+export function liveNodeOf(value: unknown): object | undefined {
+  if (typeof value !== 'object' || value === null) return undefined;
+  const raw = identityOf(value);
+  return typeof raw === 'object' && raw !== null
+    ? targetNodes.get(raw)?.proxy
+    : undefined;
+}
+
 /**
  * Subscribe to changes in a store, or in the subtree under one of its nested
  * proxies. By default, the callback fires once per batched mutation turn
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index db5e0d1..09c02af 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -9,6 +9,7 @@ export {
   getVersion,
   identityOf,
   isTrackingProxy,
+  liveNodeOf,
   registerTrackingProxy,
   subscribe,
   unwrap,
diff --git a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
index 7e73592..e13feb0 100644
--- a/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
+++ b/packages/classy-store/src/utils/cloneSnapshot/cloneSnapshot.ts
@@ -1,4 +1,9 @@
-import {batch, originalSnapshotAccessor, snapshot} from '../../storeRuntime';
+import {
+  batch,
+  liveNodeOf,
+  originalSnapshotAccessor,
+  snapshot,
+} from '../../storeRuntime';
 import {canProxy, findPropertyDescriptor} from '../internal/internal';
 
 /**
@@ -61,32 +66,71 @@ export function isDataKey(store: object, key: string): boolean {
 }
 
 /**
- * Make the store's data fields match `state`, as one transaction: a data
+ * A recorded value as it goes back into the store. A snapshot of a node that
+ * still exists goes back as that node, changed in place to match: a nested
+ * store keeps its identity and its arrow methods, and a row the caller holds
+ * stays in the store. Anything else is replaced with a mutable copy.
+ */
+function restoreValue(
+  state: unknown,
+  clones: WeakMap<object, object>,
+  untrusted: boolean | undefined,
+): unknown {
+  const live = untrusted ? undefined : liveNodeOf(state);
+  if (!live) return cloneSnapshotValue(state, clones, untrusted);
+  // Unchanged since it was recorded: nothing below it to write.
+  if (snapshot(live) !== state) {
+    if (Array.isArray(live)) {
+      const recorded = state as unknown[];
+      for (let i = 0; i < recorded.length; i++) {
+        const value = restoreValue(recorded[i], clones, untrusted);
+        if (!Object.is(live[i], value)) live[i] = value;
+      }
+      if (live.length !== recorded.length) live.length = recorded.length;
+    } else {
+      applyFields(live, state as Record<string, unknown>, clones, untrusted);
+    }
+  }
+  return live;
+}
+
+function applyFields(
+  store: object,
+  state: Record<string, unknown>,
+  clones: WeakMap<object, object>,
+  untrusted: boolean | undefined,
+): void {
+  const live = store as Record<string, unknown>;
+  const current = snapshot(store) as Record<string, unknown>;
+  // A field added after this state was taken did not exist in it.
+  for (const key of Object.keys(current)) {
+    if (!Object.hasOwn(state, key) && isDataKey(store, key)) delete live[key];
+  }
+  for (const key of Object.keys(state)) {
+    if (key === '__proto__' || !isDataKey(store, key)) continue;
+    // Data from outside may not add a field the store does not have.
+    if (untrusted && !Object.hasOwn(current, key)) continue;
+    // An untouched branch still has this exact snapshot. Leaving it alone
+    // keeps its identity, so selectors reading it stay quiet.
+    if (Object.hasOwn(current, key) && Object.is(current[key], state[key]))
+      continue;
+    const value = restoreValue(state[key], clones, untrusted);
+    if (!Object.hasOwn(live, key) || !Object.is(live[key], value))
+      live[key] = value;
+  }
+}
+
+/**
+ * Make the store's data fields match `state`, as one transaction. A data
  * field missing from `state` is deleted, a branch that is already the same
- * snapshot is left alone, and every other branch is replaced with a copy.
+ * snapshot is left alone, a branch whose node still exists is changed in
+ * place, and anything else is replaced with a copy.
  */
 export function applyState(
   store: object,
   state: Record<string, unknown>,
   untrusted?: boolean,
 ): void {
-  const live = store as Record<string, unknown>;
-  const current = snapshot(store) as Record<string, unknown>;
   const clones = new WeakMap<object, object>();
-  batch(() => {
-    // A field added after this state was taken did not exist in it.
-    for (const key of Object.keys(current)) {
-      if (!Object.hasOwn(state, key) && isDataKey(store, key)) delete live[key];
-    }
-    for (const key of Object.keys(state)) {
-      if (key === '__proto__' || !isDataKey(store, key)) continue;
-      // Data from outside may not add a field the store does not have.
-      if (untrusted && !Object.hasOwn(current, key)) continue;
-      // An untouched branch still has this exact snapshot. Leaving it alone
-      // keeps its identity, so selectors reading it stay quiet.
-      if (Object.hasOwn(current, key) && Object.is(current[key], state[key]))
-        continue;
-      live[key] = cloneSnapshotValue(state[key], clones, untrusted);
-    }
-  });
+  batch(() => applyFields(store, state, clones, untrusted));
 }
diff --git a/packages/classy-store/src/utils/history/history.ts b/packages/classy-store/src/utils/history/history.ts
index e762df3..4b1bfc9 100644
--- a/packages/classy-store/src/utils/history/history.ts
+++ b/packages/classy-store/src/utils/history/history.ts
@@ -1,7 +1,6 @@
 import {batch, getVersion, snapshot, subscribe} from '../../storeRuntime';
 import type {Snapshot} from '../../types';
-import {cloneSnapshotValue} from '../cloneSnapshot/cloneSnapshot';
-import {findGetterDescriptor} from '../internal/internal';
+import {applyState} from '../cloneSnapshot/cloneSnapshot';
 import {
   createUtilityStatus,
   type UtilityStatusSource,
@@ -75,36 +74,12 @@ export function withHistory<T extends object>(
     isDisposed: disposed,
   });
 
-  const live = proxyStore as Record<string, unknown>;
   // The store revision that the entry under the pointer describes.
   let recordedVersion = getVersion(proxyStore);
 
-  /** Getters and methods are behavior, not state; restoring leaves them alone. */
-  function isData(key: string): boolean {
-    return (
-      !findGetterDescriptor(proxyStore, key)?.get &&
-      typeof live[key] !== 'function'
-    );
-  }
-
   /** Make the store's data fields match a recorded snapshot. */
   function applySnapshot(snap: Snapshot<T>): void {
-    const recorded = snap as Record<string, unknown>;
-    const current = snapshot(proxyStore) as Record<string, unknown>;
-    const clones = new WeakMap<object, object>();
-
-    // A field added after this snapshot was taken did not exist in it.
-    for (const key of Object.keys(current)) {
-      if (!Object.hasOwn(recorded, key) && isData(key)) delete live[key];
-    }
-    for (const key of Object.keys(recorded)) {
-      if (!isData(key)) continue;
-      // An untouched branch still has this exact snapshot. Leaving it alone
-      // keeps its identity, so selectors reading it stay quiet.
-      if (Object.hasOwn(current, key) && Object.is(current[key], recorded[key]))
-        continue;
-      live[key] = cloneSnapshotValue(recorded[key], clones);
-    }
+    applyState(proxyStore, snap as Record<string, unknown>);
   }
 
   /** Append the store's current state as the newest history entry. */
```

### `w2-on-create.patch`: V3, W2 only when a write creates the field, on the V4 build

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 74d33d5..5b88b3c 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -340,8 +340,8 @@ function deliver(
 const arrowMethods = new WeakMap<object, unknown>();
 
 /**
- * An arrow function written to a field of a class that extends `ClassyStore`
- * is a method of it. The field holds one wrapper that runs the function as a
+ * An arrow function that creates a field of a class that extends
+ * `ClassyStore` is a method of it; one written to a field that exists is data. The field holds one wrapper that runs the function as a
  * transaction, and the store, its snapshots and every read share it. An arrow
  * function has no `prototype` of its own; a class or a `function` has one and
  * stays data.
@@ -440,7 +440,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
-          : asMethod(incoming, proxy);
+          : Object.hasOwn(_target, prop)
+            ? incoming
+            : asMethod(incoming, proxy);
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
@@ -535,7 +537,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     defineProperty(_target, prop, descriptor) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
-      if (typeof descriptor.value === 'function')
+      if (!before && typeof descriptor.value === 'function')
         descriptor = {
           ...descriptor,
           value: asMethod(descriptor.value, proxy),
```

## Appendix C: scripts

### `repro/v1/sub.ts`

```ts
import {ClassyStore} from '@codebelt/classy-store';

export class Clock extends ClassyStore {
  ticks = 0;
  items: string[] = [];
  label: string;
  timer: ReturnType<typeof setTimeout> | undefined;
  onSave: (() => void) | null = null;
  onCancel?: () => void;
  constructor(
    label: string,
    public delay: number,
  ) {
    super();
    this.label = label;
    this.timer = setTimeout(() => {
      this.ticks++;
    }, delay);
  }
  addTwo = (a: string, b: string) => {
    this.items.push(a);
    this.items.push(b);
  };
  addOne(a: string) {
    this.items.push(a);
  }
  get count() {
    return this.items.length;
  }
}
```

### `repro/v1/compile.mjs`

```js
// Compiles sub.ts with each compiler into out/<name>.mjs.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const M = process.env.M;
const WT = `${M}/wt`;
const NM = `${WT}/node_modules/.bun`;
const req = createRequire(`${M}/tools/package.json`);
const src = readFileSync(new URL('./sub.ts', import.meta.url), 'utf8');
const lib = `${WT}/packages/classy-store/dist/index.mjs`;
mkdirSync(new URL('./out/', import.meta.url), {recursive: true});
const out = (name, code) => {
  writeFileSync(
    new URL(`./out/${name}.mjs`, import.meta.url),
    code.replaceAll('@codebelt/classy-store', lib),
  );
};
const only = process.argv[2];
const jobs = {
  async 'tsc-define-true-es2022'() {
    const ts = req('typescript');
    return ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        useDefineForClassFields: true,
      },
    }).outputText;
  },
  async 'tsc-define-false-es2022'() {
    const ts = req('typescript');
    return ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        useDefineForClassFields: false,
      },
    }).outputText;
  },
  async 'tsc-default-es2017'() {
    // The Next.js example's target, no useDefineForClassFields: TS defaults it to false below ES2022.
    const ts = req('typescript');
    return ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
  },
  async 'tsc-define-true-es2017'() {
    const ts = req('typescript');
    return ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.ESNext,
        useDefineForClassFields: true,
      },
    }).outputText;
  },
  async 'bun-transpiler-default'() {
    return new Bun.Transpiler({loader: 'ts'}).transformSync(src);
  },
  async 'bun-transpiler-define-false'() {
    return new Bun.Transpiler({
      loader: 'ts',
      tsconfig: {compilerOptions: {useDefineForClassFields: false}},
    }).transformSync(src);
  },
  async 'oxc-rolldown-default'() {
    const {transformSync} = await import(
      `${NM}/rolldown@1.3.2/node_modules/rolldown/dist/experimental-index.mjs`
    );
    return transformSync('sub.ts', src, {}).code;
  },
  async 'oxc-rolldown-es2017'() {
    const {transformSync} = await import(
      `${NM}/rolldown@1.3.2/node_modules/rolldown/dist/experimental-index.mjs`
    );
    return transformSync('sub.ts', src, {target: 'es2017'}).code;
  },
  async 'oxc-rolldown-define-false'() {
    const {transformSync} = await import(
      `${NM}/rolldown@1.3.2/node_modules/rolldown/dist/experimental-index.mjs`
    );
    return transformSync('sub.ts', src, {
      typescript: {removeClassFieldsWithoutInitializer: true},
      assumptions: {setPublicClassFields: true},
      target: 'es2017',
    }).code;
  },
  async 'esbuild-default'() {
    const esbuild = await import(
      `${NM}/esbuild@0.28.2/node_modules/esbuild/lib/main.js`
    );
    return (await esbuild.transform(src, {loader: 'ts', format: 'esm'})).code;
  },
  async 'esbuild-es2020'() {
    const esbuild = await import(
      `${NM}/esbuild@0.28.2/node_modules/esbuild/lib/main.js`
    );
    return (
      await esbuild.transform(src, {
        loader: 'ts',
        format: 'esm',
        target: 'es2020',
      })
    ).code;
  },
  async 'esbuild-define-false'() {
    const esbuild = await import(
      `${NM}/esbuild@0.28.2/node_modules/esbuild/lib/main.js`
    );
    return (
      await esbuild.transform(src, {
        loader: 'ts',
        format: 'esm',
        tsconfigRaw: {compilerOptions: {useDefineForClassFields: false}},
      })
    ).code;
  },
  async 'babel-spec'() {
    const babel = req('@babel/core');
    return babel.transformSync(src, {
      filename: 'sub.ts',
      babelrc: false,
      configFile: false,
      presets: [[req.resolve('@babel/preset-typescript')]],
      plugins: [
        [
          req.resolve('@babel/plugin-transform-class-properties'),
          {loose: false},
        ],
      ],
    }).code;
  },
  async 'babel-loose'() {
    const babel = req('@babel/core');
    return babel.transformSync(src, {
      filename: 'sub.ts',
      babelrc: false,
      configFile: false,
      presets: [[req.resolve('@babel/preset-typescript')]],
      plugins: [
        [
          req.resolve('@babel/plugin-transform-class-properties'),
          {loose: true},
        ],
      ],
    }).code;
  },
};
for (const [name, job] of Object.entries(jobs)) {
  if (only && !name.startsWith(only)) continue;
  try {
    out(name, await job());
    console.log('compiled', name);
  } catch (e) {
    console.log('FAILED', name, e.message);
  }
}
```

### `repro/v1/swc-next.cjs`

```js
// Compiles sub.ts with Next.js's own SWC binding and the options its webpack loader builds.
const fs = require('node:fs');
const M = process.env.M;
const N = `${M}/wt/node_modules/.bun/next@16.4.6+b6dfca821db00fa8/node_modules/next`;
const {loadBindings, transform} = require(`${N}/dist/build/swc/index.js`);
const {getLoaderSWCOptions} = require(`${N}/dist/build/swc/options.js`);
const MODERN_BROWSERSLIST_TARGET = require(
  `${N}/dist/shared/lib/modern-browserslist-target.js`,
);
const jsConfig = JSON.parse(
  fs.readFileSync(`${M}/wt/examples/nextjs/tsconfig.json`, 'utf8'),
);
const src = fs.readFileSync(`${__dirname}/sub.ts`, 'utf8');
const lib = `${M}/wt/packages/classy-store/dist/index.mjs`;
(async () => {
  await loadBindings();
  for (const [name, isServer, browsers] of [
    ['swc-next-client', false, MODERN_BROWSERSLIST_TARGET],
    ['swc-next-server', true, MODERN_BROWSERSLIST_TARGET],
    ['swc-next-client-es5', false, []],
  ]) {
    const opts = getLoaderSWCOptions({
      filename: `${M}/wt/examples/nextjs/src/sub.ts`,
      development: false,
      isServer,
      pagesDir: undefined,
      appDir: `${M}/wt/examples/nextjs/src/app`,
      isPageFile: false,
      hasReactRefresh: false,
      configDir: `${M}/wt/examples/nextjs`,
      jsConfig,
      supportedBrowsers: browsers,
      esm: true,
      bundleLayer: isServer ? 'rsc' : 'app-pages-browser',
      isCacheComponents: false,
      relativeFilePathFromRoot: 'src/sub.ts',
      useCacheEnabled: false,
      taintEnabled: false,
      trackDynamicImports: false,
      serverReferenceHashSalt: '',
      serverComponents: true,
      compilerOptions: {},
      swcCacheDir: `${M}/out/swc-cache`,
      pageExtensions: ['tsx', 'ts'],
    });
    if (name === 'swc-next-client')
      console.log(
        'useDefineForClassFields:',
        opts.jsc.transform.useDefineForClassFields,
        'targets:',
        JSON.stringify(opts.env?.targets),
      );
    const o = {...opts, filename: `${M}/wt/examples/nextjs/src/sub.ts`};
    const j = JSON.stringify(o);
    if (process.env.DUMP) console.log(j.slice(1150, 1300));
    const out = await transform(src, o);
    fs.writeFileSync(
      `${__dirname}/out/${name}.mjs`,
      out.code.replaceAll('@codebelt/classy-store', lib),
    );
    console.log('compiled', name);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `repro/v1/run.mjs`

```js
// Runs each compiled Clock against the C1 build and prints four checks.
import {readdirSync} from 'node:fs';
const lib = await import(
  `${process.env.M}/wt/packages/classy-store/dist/index.mjs`
);
const {snapshot, subscribe} = lib;
const dir = new URL('./out/', import.meta.url);
const tick = () => new Promise((r) => setTimeout(r, 20));
const rows = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .sort()) {
  const row = {compiler: file.replace('.mjs', '')};
  try {
    const {Clock} = await import(new URL(file, dir).href);
    const c = new Clock('a', 5);
    const s0 = snapshot(c);
    row.first =
      Object.isFrozen(s0) &&
      Object.isFrozen(s0.items) &&
      s0.ticks === 0 &&
      s0.label === 'a' &&
      s0.delay === 5 &&
      s0.count === 0 &&
      Array.isArray(s0.items)
        ? 'right'
        : `WRONG frozen=${Object.isFrozen(s0)} itemsFrozen=${Object.isFrozen(s0.items)} label=${s0.label} delay=${s0.delay}`;
    let n = 0;
    subscribe(c, () => n++, {sync: true});
    c.addTwo('x', 'y');
    row.arrow = `${n} notif/call`;
    const s1 = snapshot(c);
    row.arrowSnap =
      s1.count === 2 && s0.count === 0 && s0.items.length === 0
        ? 'ok'
        : `WRONG s1.count=${s1.count} s0.items=${s0.items.length}`;
    n = 0;
    c.addOne('z');
    row.method = `${n}`;
    n = 0;
    c.label = 'b';
    row.field = n === 1 && snapshot(c).label === 'b' ? 'seen' : `WRONG n=${n}`;
    n = 0;
    await tick();
    row.timer =
      n === 1 && snapshot(c).ticks === 1
        ? 'notifies'
        : `WRONG n=${n} ticks=${snapshot(c).ticks}`;
    row.wrapped = c.addTwo === snapshot(c).addTwo ? 'same fn' : 'differs';
    const cb = () => {};
    c.onSave = cb;
    c.onCancel = cb;
    row.laterCb = `onSave ${c.onSave === cb ? 'kept' : 'wrapped'}, onCancel ${c.onCancel === cb ? 'kept' : 'wrapped'}`;
    row.instanceof = c instanceof Clock && c instanceof lib.ClassyStore;
  } catch (e) {
    row.error = String(e.message).slice(0, 80);
  }
  rows.push(row);
}
console.table(rows);
```

### `repro/v3/v3.ts`

```ts
// V3: what a user sees of W2. Run: SRC=<worktree>/packages/classy-store/src bun v3.ts
const SRC = process.env.SRC;
const {ClassyStore, createClassyStore, snapshot, subscribe, shallowEqual} =
  await import(`${SRC}/index.ts`);
const {withHistory, persist} = await import(`${SRC}/utils/index.ts`);
const {cloneSnapshotValue} = await import(
  `${SRC}/utils/cloneSnapshot/cloneSnapshot.ts`
);
const flush = () => new Promise((r) => setTimeout(r, 0));
const line = (k: string, v: unknown) => console.log(`- ${k}: ${v}`);

class Model {
  static kind = 'model';
}
class Form extends ClassyStore {
  value = '';
  onSave: ((v: string) => void) | null = null; // declared with an initialiser
  onCancel?: () => void; // declared without one
  listeners: Array<() => void> = [];
  plainFn = function (this: Form) {
    this.value += 'a';
    this.value += 'b';
  };
  Model = Model;
  constructor() {
    super();
    this.save = this.save.bind(this);
  }
  save() {
    this.value += '1';
    this.value += '2';
  }
}

console.log('\n### A callback assigned after construction');
{
  const form = new Form();
  const plain = createClassyStore({
    onSave: null as null | ((v: string) => void),
  });
  const cb = (v: string) => void v;
  form.onSave = cb;
  plain.onSave = cb;
  line('form.onSave === cb (base class)', form.onSave === cb);
  line('plain.onSave === cb (plain store)', plain.onSave === cb);
  line(
    'form.onSave read twice is the same function',
    form.onSave === form.onSave,
  );
  line(
    'snapshot(form).onSave === form.onSave',
    snapshot(form).onSave === form.onSave,
  );
  line('snapshot(form).onSave === cb', snapshot(form).onSave === cb);
  line(
    'wrapper name and length',
    `"${form.onSave!.name}" ${form.onSave!.length} (cb: "${cb.name}" ${cb.length})`,
  );
  let n = 0;
  subscribe(form, () => n++, {sync: true});
  form.onSave = cb;
  line('assigning cb again notifies', n);
  form.onSave = form.onSave;
  line('assigning the wrapper back notifies', n);
  line(
    'if (form.onSave === cb) form.onSave = null: cleared',
    form.onSave === cb ? ((form.onSave = null), true) : false,
  );
  const c2 = () => {};
  form.onCancel = c2;
  line(
    'form.onCancel === c2 (field declared without initialiser)',
    form.onCancel === c2,
  );

  const t = new EventTarget();
  let calls = 0;
  const handler = () => calls++;
  form.onSave = handler as never;
  t.addEventListener('x', handler);
  t.removeEventListener('x', form.onSave as never);
  t.dispatchEvent(new Event('x'));
  line('add(handler), remove(form.onSave): listener still called', calls === 1);
  calls = 0;
  t.removeEventListener('x', handler);
  t.addEventListener('x', form.onSave as never);
  t.removeEventListener('x', handler);
  t.dispatchEvent(new Event('x'));
  line('add(form.onSave), remove(handler): listener still called', calls === 1);
  t.removeEventListener('x', form.onSave as never);

  form.listeners.push(handler);
  line(
    'a callback in a list field is kept as it is',
    form.listeners[0] === handler &&
      form.listeners.includes(handler) &&
      form.listeners.indexOf(handler) === 0,
  );
}

console.log('\n### What the utilities see for an arrow field');
{
  const form = new Form();
  const cb = (v: string) => void v;
  form.onSave = cb;
  const s1 = snapshot(form);
  form.value = 'x';
  const s2 = snapshot(form);
  line(
    'snapshot holds',
    s1.onSave === cb
      ? 'the original'
      : s1.onSave === form.onSave
        ? 'the wrapper'
        : 'something else',
  );
  line(
    'shallowEqual({f: s1.onSave}, {f: s2.onSave})',
    shallowEqual({f: s1.onSave}, {f: s2.onSave}),
  );
  line(
    'shallowEqual({f: s1.onSave}, {f: cb})',
    shallowEqual({f: s1.onSave}, {f: cb}),
  );
  const clone = cloneSnapshotValue(s1, new WeakMap()) as Form;
  line(
    'cloneSnapshotValue copy holds',
    clone.onSave === cb
      ? 'the original'
      : clone.onSave === form.onSave
        ? 'the wrapper'
        : 'something else',
  );

  const h = withHistory(form);
  const cb2 = () => {};
  const w1 = form.onSave;
  form.onSave = cb2;
  const w2 = form.onSave;
  await flush();
  line('assigning a new callback records a history entry', h.canUndo);
  h.undo();
  line(
    'after undo, onSave is',
    form.onSave === w2
      ? 'still the new callback: the undo step changed nothing'
      : form.onSave === w1
        ? 'the old callback'
        : 'something else',
  );
  h.dispose();

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const p = persist(form, {name: 'v3', storage});
  form.value = 'saved';
  await new Promise((r) => setTimeout(r, 50));
  line('persist writes', [...mem.values()][0]);
  p.unsubscribe?.();
  p.dispose?.();
}

console.log('\n### Other functions in a field of a base-class store');
{
  const form = new Form();
  let n = 0;
  subscribe(form, () => n++, {sync: true});
  form.plainFn();
  line('a function expression field: notifications for 2 writes', n);
  n = 0;
  form.save();
  line('a method bound in the constructor: notifications for 2 writes', n);
  n = 0;
  const {save} = form;
  save();
  line(
    'the bound method destructured: notifications, value',
    `${n} ${form.value}`,
  );
  line('form.Model === Model', form.Model === Model);
  line('new form.Model() instanceof Model', new form.Model() instanceof Model);
  line('form.Model.kind', form.Model.kind);
  const nat = new (class extends ClassyStore {
    parse = JSON.parse;
    max = Math.max;
  })();
  line(
    'a native function in a field: nat.parse === JSON.parse',
    nat.parse === JSON.parse,
  );
  line('nat.max(1, 3)', nat.max(1, 3));
  const other = new Form();
  form.onSave = other.save as never;
  line(
    "another store's bound method assigned: kept as it is",
    form.onSave === other.save,
  );
}
```

### `repro/v4/v4.ts`

```ts
// V4: undo and DevTools time travel of base-class stores nested in a store.
// Run: SRC=<worktree>/packages/classy-store/src bun v4.ts
const SRC = process.env.SRC;
const {ClassyStore, snapshot, subscribe} = await import(`${SRC}/index.ts`);
const {withHistory, devtools} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));

class Row extends ClassyStore {
  done = false;
  title: string;
  constructor(title: string) {
    super();
    this.title = title;
  }
  toggleArrow = () => {
    this.done = !this.done;
  };
  toggleMethod() {
    this.done = !this.done;
  }
}
class List extends ClassyStore {
  rows: Row[] = [];
  add(title: string) {
    this.rows.push(new Row(title));
  }
  remove(i: number) {
    this.rows.splice(i, 1);
  }
}

function report(label: string, list: List, held: Row[]) {
  const r0 = list.rows[0];
  const out: Record<string, unknown> = {
    rows: list.rows.map((r) => `${r.title}:${r.done}`).join(' '),
    'each row is the store that was made': list.rows
      .map((r, i) => r === held[i])
      .join(','),
    'row 0 frozen': Object.isFrozen(r0),
  };
  let n = 0;
  const off = subscribe(list, () => n++, {sync: true});
  const before = r0.done;
  try {
    r0.toggleArrow();
    out['row 0 arrow: list notified'] = n;
    out['row 0 arrow: list.rows[0].done changed'] =
      list.rows[0].done !== before;
    out['row 0 arrow: the held store changed'] = held[0].done !== before;
  } catch (e) {
    out['row 0 arrow'] = `throws ${(e as Error).message.slice(0, 60)}`;
  }
  n = 0;
  try {
    list.rows[0].toggleMethod();
    out['row 0 method: list notified'] = n;
  } catch (e) {
    out['row 0 method'] = `throws ${(e as Error).message.slice(0, 60)}`;
  }
  off();
  console.log(`\n### ${label}`);
  for (const [k, v] of Object.entries(out)) console.log(`- ${k}: ${v}`);
}

{
  const list = new List();
  list.add('a');
  list.add('b');
  list.add('c');
  const held = [...list.rows];
  const h = withHistory(list);
  held[1].toggleArrow();
  await flush();
  h.undo();
  report('withHistory: toggle row b, undo', list, held);
  h.dispose();
}
{
  const list = new List();
  list.add('a');
  list.add('b');
  list.add('c');
  const held = [...list.rows];
  const h = withHistory(list);
  list.remove(0);
  await flush();
  h.undo();
  report('withHistory: remove row a, undo', list, held);
  h.dispose();
}
{
  (globalThis as Record<string, unknown>).window ??= globalThis;
  let listener: ((m: unknown) => void) | null = null;
  (globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: () => ({
      init() {},
      send() {},
      subscribe(fn: (m: unknown) => void) {
        listener = fn;
        return () => {};
      },
    }),
  };
  const list = new List();
  list.add('a');
  list.add('b');
  list.add('c');
  const held = [...list.rows];
  const dt = devtools(list, {name: 'v4'});
  held[1].toggleArrow(); // entry 1
  held[2].toggleArrow(); // entry 2
  await flush();
  listener?.({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE', actionId: 1},
    state: '{}',
  });
  report(
    'devtools (P7): toggle b, toggle c, jump to entry 1 by its id',
    list,
    held,
  );
  listener?.({
    type: 'DISPATCH',
    payload: {type: 'JUMP_TO_STATE'},
    state: JSON.stringify(snapshot(list)),
  });
  console.log(
    '- after a JSON jump (unknown id): row 0 is the store that was made:',
    list.rows[0] === held[0],
    ', frozen:',
    Object.isFrozen(list.rows[0]),
    ', has toggleArrow:',
    typeof list.rows[0].toggleArrow,
  );
  dt.dispose();
}
```

### `repro/v4/bench-undo.ts`

```ts
// Undo and redo of one edited row in a list of 1,000. Run: SRC=<copy>/src bun|node bench-undo.ts
const SRC = process.env.SRC;
const {ClassyStore, createClassyStore, snapshot} = await import(
  `${SRC}/index.ts`
);
const {withHistory} = await import(`${SRC}/utils/index.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));
class Row extends ClassyStore {
  done = false;
  constructor(public id: number) {
    super();
  }
  toggle = () => {
    this.done = !this.done;
  };
}
async function run(kind: string, make: () => {rows: any[]}) {
  const store = make();
  const h = withHistory(store);
  const held = store.rows[3];
  store.rows[500].done = true;
  await flush();
  const before = snapshot(store).rows;
  h.undo();
  const after = snapshot(store).rows;
  let kept = 0;
  for (let i = 0; i < 1000; i++) if (before[i] === after[i]) kept++;
  h.redo();
  const N = 300;
  const times: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    for (let i = 0; i < N; i++) {
      h.undo();
      snapshot(store);
      h.redo();
      snapshot(store);
    }
    times.push(((performance.now() - t) / (2 * N)) * 1000);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${kind}: one restore and its snapshot ${times[2].toFixed(1)} µs (${times[0].toFixed(1)} to ${times[4].toFixed(1)}); row snapshots kept by an undo ${kept} of 1000; the row proxy held from before the edit is still row 3: ${store.rows[3] === held}`,
  );
  h.dispose();
}
await run('plain rows', () =>
  createClassyStore({
    rows: Array.from({length: 1000}, (_, id) => ({id, done: false})),
  }),
);
await run('ClassyStore rows', () =>
  createClassyStore({rows: Array.from({length: 1000}, (_, id) => new Row(id))}),
);
```

### `repro/v5/v5.ts`

```ts
// V5: base-class stores made inside getters. Run: SRC=<worktree>/packages/classy-store/src bun v5.ts
const SRC = process.env.SRC;
const {ClassyStore, snapshot, subscribe} = await import(`${SRC}/index.ts`);
const line = (k: string, v: unknown) => console.log(`- ${k}: ${v}`);
const attempt = (f: () => unknown) => {
  try {
    return f();
  } catch (e) {
    return `throws ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 70)}`;
  }
};

class Item extends ClassyStore {
  done = false;
  label: string;
  constructor(label: string) {
    super();
    this.label = label;
    this.label = `${this.label}!`; // a second write, read back, inside the constructor
  }
  toggle = () => {
    this.done = !this.done;
  };
}
let made = 0;
class Shop extends ClassyStore {
  name = 'shop';
  counter = 0;
  get direct() {
    made++;
    return new Item(this.name);
  }
  get viaMethod() {
    return this.build(this.name);
  }
  build(label: string) {
    made++;
    return new Item(label);
  }
  get writesThis() {
    this.counter = 99;
    return 1;
  }
}

for (const layer of ['live store', 'snapshot'] as const) {
  console.log(`\n### On the ${layer}`);
  const shop = new Shop();
  made = 0;
  const target = () => (layer === 'live store' ? shop : snapshot(shop));
  let n = 0;
  const off = subscribe(shop, () => n++, {sync: true});
  const a = attempt(() => target().direct) as Item | string;
  line(
    'getter that makes `new Item(this.name)`',
    typeof a === 'string' ? a : `an Item: label ${a.label}, done ${a.done}`,
  );
  if (typeof a !== 'string') {
    line(
      'it is a store (snapshot() works on it)',
      attempt(() => typeof snapshot(a) === 'object'),
    );
    line('it is frozen', Object.isFrozen(a));
    line('read twice gives the same Item', target().direct === a);
    let m = 0;
    const offItem = attempt(() => subscribe(a, () => m++, {sync: true}));
    attempt(() => a.toggle());
    line(
      'its arrow method: Item subscribers notified, done',
      `${typeof offItem === 'function' ? m : offItem} ${a.done}`,
    );
    line('the shop heard of it', n);
    line(
      'after the toggle the getter still returns that Item',
      target().direct === a,
    );
    attempt(() => {
      a.label = 'changed';
    });
    line(
      "after a write to the Item's label, read in its constructor, still that Item",
      target().direct === a,
    );
  }
  const b = attempt(() => target().viaMethod) as Item | string;
  line(
    'getter that calls a method that makes an Item',
    typeof b === 'string' ? b : `an Item: label ${b.label}`,
  );
  line('Items made so far', made);
  line('shop notifications from making them', n);
  shop.name = 'renamed';
  const c = attempt(() => target().direct) as Item | string;
  line(
    'after a write the getter depends on',
    typeof c === 'string' ? c : `a new Item: ${c !== a}, label ${c.label}`,
  );
  line(
    'getter that writes to this',
    attempt(() => target().writesThis),
  );
  line('shop.counter afterwards', shop.counter);
  off();
}
```

### `repro/adapters.spike.test.tsx`

```tsx
// SPIKE, throwaway: a base-class store with every adapter.
import {afterEach, describe, expect, mock, test} from 'bun:test';
import {
  Injector,
  computed as ngComputed,
  runInInjectionContext,
} from '@angular/core';
import {act, type ReactNode, StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createRoot as solidRoot} from 'solid-js';
import {computed, effectScope, watch} from 'vue';
import {getInternal} from '../core/core';
import {ClassyStore, snapshot, subscribe} from '../index';
import {injectClassyStore} from './angular/angular';
import {createStoreHook, useClassyStore, useLocalStore} from './react/react';
import {useClassyStore as useSolidStore} from './solid/solid';
import {toSvelteStore} from './svelte/svelte';
import {useClassyStore as useVueStore} from './vue/vue';

class Counter extends ClassyStore {
  count = 0;
  items: string[] = [];
  ticks = 0;
  constructor(start = 0) {
    super();
    this.count = start;
  }
  get double() {
    return this.count * 2;
  }
  incTwice = () => {
    this.count++;
    this.count++;
  };
  add(text: string) {
    this.items.push(text);
    this.items.push(text);
  }
  startTimer() {
    setTimeout(() => {
      this.ticks++;
    }, 1);
  }
}

const listeners = (store: object) => {
  const internal = getInternal(store);
  return internal.syncListeners.size + internal.batchedListeners.size;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('SPIKE base class: Vue', () => {
  test('snapshot, getter, arrow method through the snapshot, cleanup', async () => {
    const store = new Counter(1);
    const scope = effectScope();
    const seen: number[] = [];
    const state = scope.run(() => {
      const s = useVueStore(store);
      watch(s, (v) => seen.push(v.count), {flush: 'sync'});
      return s;
    });
    const doubled = scope.run(() => computed(() => state?.value.double));
    expect(state?.value).toBe(snapshot(store));
    expect(Object.isFrozen(state?.value)).toBe(true);
    expect(doubled?.value).toBe(2);
    state?.value.incTwice();
    expect(seen).toEqual([3]);
    expect(doubled?.value).toBe(6);
    store.add('x');
    expect(seen).toEqual([3, 3]);
    expect(state?.value.items).toEqual(['x', 'x']);
    store.startTimer();
    await wait(10);
    expect(state?.value.ticks).toBe(1);
    scope.stop();
    expect(listeners(store)).toBe(0);
  });
});

describe('SPIKE base class: Svelte', () => {
  test('one delivery per arrow call and per method, getter on the value', async () => {
    const store = new Counter();
    const values: Array<{count: number; double: number}> = [];
    const off = toSvelteStore(store).subscribe((v) => {
      values.push({count: v.count, double: v.double});
    });
    expect(values).toEqual([{count: 0, double: 0}]);
    store.incTwice();
    expect(values).toEqual([
      {count: 0, double: 0},
      {count: 2, double: 4},
    ]);
    store.add('y');
    expect(values.length).toBe(3);
    store.startTimer();
    await wait(10);
    expect(values.length).toBe(4);
    off();
    expect(listeners(store)).toBe(0);
  });
});

describe('SPIKE base class: Solid', () => {
  test('accessor reads the current snapshot, getter right, owner cleanup', async () => {
    const store = new Counter(2);
    let sync = 0;
    const stopSync = subscribe(store, () => sync++, {sync: true});
    const root = solidRoot((dispose) => ({
      state: useSolidStore(store),
      dispose,
    }));
    expect(root.state()).toBe(snapshot(store));
    expect(root.state().double).toBe(4);
    root.state().incTwice();
    await Promise.resolve();
    expect(sync).toBe(1);
    expect(root.state().count).toBe(4);
    expect(root.state().double).toBe(8);
    root.dispose();
    stopSync();
    expect(listeners(store)).toBe(0);
  });
});

describe('SPIKE base class: Angular', () => {
  test('signal and computed follow an arrow method and a timer', async () => {
    const store = new Counter();
    const injector = Injector.create({providers: []});
    let sync = 0;
    const stopSync = subscribe(store, () => sync++, {sync: true});
    const state = runInInjectionContext(injector, () =>
      injectClassyStore(store),
    );
    const total = ngComputed(() => state().double + 1);
    expect(total()).toBe(1);
    state().incTwice();
    expect(sync).toBe(1);
    expect(state().count).toBe(2);
    expect(total()).toBe(5);
    store.startTimer();
    await wait(10);
    expect(state().ticks).toBe(1);
    injector.destroy();
    stopSync();
    expect(listeners(store)).toBe(0);
  });
});

const roots = new Map<Root, HTMLDivElement>();
function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.set(root, container);
  act(() => root.render(element));
  return container;
}
afterEach(() => {
  for (const [root, container] of roots) {
    act(() => root.unmount());
    container.remove();
  }
  roots.clear();
});

describe('SPIKE base class: React', () => {
  test('createStoreHook with a selector re-renders once per arrow call', () => {
    const store = new Counter();
    const useCounter = createStoreHook(store);
    const renders = mock(() => {});
    function View() {
      const double = useCounter((s) => s.double);
      renders();
      return <span>{double}</span>;
    }
    const el = mount(<View />);
    expect(el.textContent).toBe('0');
    const before = renders.mock.calls.length;
    act(() => store.incTwice());
    expect(el.textContent).toBe('4');
    expect(renders.mock.calls.length - before).toBe(1);
  });

  test('createStoreHook without a selector, auto-tracked', () => {
    const store = new Counter();
    const useCounter = createStoreHook(store);
    function View() {
      const s = useCounter();
      return (
        <button type="button" onClick={s.incTwice}>
          {s.count}
        </button>
      );
    }
    const el = mount(<View />);
    act(() => (el.querySelector('button') as HTMLButtonElement).click());
    expect(el.textContent).toBe('2');
  });

  test('useLocalStore(() => new Counter(5)) under StrictMode keeps one store', () => {
    const made: Counter[] = [];
    let local: Counter | undefined;
    function View() {
      const store = useLocalStore(() => {
        const c = new Counter(5);
        made.push(c);
        return c;
      });
      local = store;
      const s = useClassyStore(store);
      return (
        <button type="button" onClick={s.incTwice}>
          {s.count}:{s.double}
        </button>
      );
    }
    const el = mount(
      <StrictMode>
        <View />
      </StrictMode>,
    );
    expect(el.textContent).toBe('5:10');
    act(() => (el.querySelector('button') as HTMLButtonElement).click());
    expect(el.textContent).toBe('7:14');
    expect(local?.count).toBe(7);
    // StrictMode may call the factory twice; one of them is kept.
    console.log('factory calls under StrictMode:', made.length);
    expect(made.length).toBeGreaterThanOrEqual(1);
    expect(made).toContain(local as Counter);
  });
});
```

### `repro/classyStore.shapes.spike.test.ts`

```ts
// SPIKE, throwaway: the types and shapes of ClassyStore subclasses.
import {describe, expect, expectTypeOf, test} from 'bun:test';
import {
  ClassyStore,
  createClassyStore,
  PROXYABLE,
  type Snapshot,
  snapshot,
  subscribe,
} from './index';
import {withHistory} from './utils/index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class Todos extends ClassyStore {
  items: {text: string; done: boolean}[] = [];
  get open(): number {
    return this.items.filter((i) => !i.done).length;
  }
  add = (text: string): void => {
    this.items.push({text, done: false});
  };
  clear(): void {
    this.items = [];
  }
}

class Box<T> extends ClassyStore {
  value: T;
  constructor(value: T) {
    super();
    this.value = value;
  }
  put = (value: T): void => {
    this.value = value;
  };
}

abstract class Shape extends ClassyStore {
  size = 1;
  abstract get area(): number;
  grow = (): void => {
    this.size++;
    this.size++;
  };
}
class Square extends Shape {
  get area(): number {
    return this.size * this.size;
  }
}

class Base extends ClassyStore {
  a = 1;
  incA = (): void => {
    this.a++;
  };
}
class Mid extends Base {
  b = 2;
  incB = (): void => {
    this.b++;
    this.a++;
  };
}
class Leaf extends Mid {
  c = 3;
  constructor(c: number) {
    super();
    this.c = c;
  }
  get sum(): number {
    return this.a + this.b + this.c;
  }
}

class Counted extends ClassyStore {
  static made = 0;
  static create(): Counted {
    return new Counted();
  }
  static get kind(): string {
    return 'counted';
  }
  n = 0;
  constructor() {
    super();
    Counted.made++;
  }
}

class Marked extends ClassyStore {
  static [PROXYABLE] = true;
  done = false;
  toggle = (): void => {
    this.done = !this.done;
  };
}

describe('SPIKE ClassyStore: types', () => {
  test('Snapshot<Sub>', () => {
    expectTypeOf(new Todos()).toEqualTypeOf<Todos>();
    expectTypeOf<Snapshot<Todos>['items']>().toEqualTypeOf<
      ReadonlyArray<{readonly text: string; readonly done: boolean}>
    >();
    expectTypeOf<Snapshot<Todos>['open']>().toEqualTypeOf<number>();
    expectTypeOf<Snapshot<Todos>['add']>().toEqualTypeOf<
      (text: string) => void
    >();
    expectTypeOf<Snapshot<Todos>['clear']>().toEqualTypeOf<() => void>();
    expectTypeOf(snapshot(new Todos())).toEqualTypeOf<Snapshot<Todos>>();
    expectTypeOf(createClassyStore(new Todos())).toEqualTypeOf<Todos>();
  });

  test('a generic subclass', () => {
    const box = new Box(1);
    expectTypeOf(box).toEqualTypeOf<Box<number>>();
    expectTypeOf<Parameters<typeof box.put>[0]>().toEqualTypeOf<number>();
    expectTypeOf<Snapshot<Box<{n: number}>>['value']>().toEqualTypeOf<{
      readonly n: number;
    }>();
    // @ts-expect-error a string is not a number
    box.put('x');
    box.put(2);
    expect(snapshot(box).value).toBe(2);
  });

  test('an abstract subclass', () => {
    // @ts-expect-error an abstract class cannot be made
    expect(() => new Shape()).not.toThrow();
    const sq = new Square();
    let n = 0;
    subscribe(sq, () => n++, {sync: true});
    sq.grow();
    expect(n).toBe(1);
    expect(sq.area).toBe(9);
    expect(snapshot(sq).area).toBe(9);
    expect(sq instanceof Shape && sq instanceof ClassyStore).toBe(true);
  });

  test('a subclass of a subclass', () => {
    const leaf = new Leaf(10);
    expectTypeOf(leaf).toEqualTypeOf<Leaf>();
    expectTypeOf<Snapshot<Leaf>['incA']>().toEqualTypeOf<() => void>();
    let n = 0;
    subscribe(leaf, () => n++, {sync: true});
    leaf.incA();
    leaf.incB();
    expect(n).toBe(2);
    expect(snapshot(leaf)).toMatchObject({a: 3, b: 3, c: 10, sum: 16});
    expect(leaf instanceof Leaf && leaf instanceof Mid).toBe(true);
    expect(leaf instanceof Base && leaf instanceof ClassyStore).toBe(true);
    const snap = snapshot(leaf);
    expect(snap instanceof Leaf && snap instanceof ClassyStore).toBe(true);
  });

  test('static members', () => {
    const before = Counted.made;
    const c = Counted.create();
    expectTypeOf(c).toEqualTypeOf<Counted>();
    expect(Counted.made).toBe(before + 1);
    expect(Counted.kind).toBe('counted');
    expect(c.constructor).toBe(Counted);
    expect((c.constructor as typeof Counted).kind).toBe('counted');
    expect((snapshot(c).constructor as typeof Counted).kind).toBe('counted');
    expect(createClassyStore(c)).toBe(c);
  });

  test('instanceof and createClassyStore(new Sub())', () => {
    const t = new Todos();
    expect(t instanceof Todos).toBe(true);
    expect(t instanceof ClassyStore).toBe(true);
    expect(snapshot(t) instanceof Todos).toBe(true);
    expect(createClassyStore(t)).toBe(t);
    expect(createClassyStore(createClassyStore(t))).toBe(t);
  });

  test('a subclass that also sets static [PROXYABLE]', async () => {
    const m = new Marked();
    expect(createClassyStore(m)).toBe(m);
    const holder = createClassyStore({rows: [m]});
    expect(holder.rows[0]).toBe(m);
    let n = 0;
    subscribe(holder, () => n++, {sync: true});
    m.toggle();
    expect(n).toBe(1);
    expect(snapshot(holder).rows[0].done).toBe(true);
    const h = withHistory(holder);
    m.toggle();
    await flush();
    h.undo();
    expect(holder.rows[0]).toBe(m);
    expect(m.done).toBe(true);
    h.dispose();
  });
});
```

### `mkpatch.sh`

```sh
#!/bin/zsh
# Usage: mkpatch.sh <base.patch> <out.patch>: the diff of the worktree's current state against <base.patch>.
set -e
M=${0:A:h}; WT=$M/wt; base=$1; out=$2
cd $WT
git diff > $M/.full.patch
files=(${(f)"$(git diff --name-only)"})
rm -rf $M/.cur; mkdir -p $M/.cur
for f in $files; do mkdir -p $M/.cur/${f:h}; cp $f $M/.cur/$f; done
git checkout -- .
git apply $base
: > $out
for f in $files; do
  git diff --no-index -- $f $M/.cur/$f | sed "s|^+++ b$M/.cur/|+++ b/|; s|^diff --git a/\(.*\) b.*|diff --git a/\1 b/\1|" >> $out || true
done
git checkout -- .
git apply $M/.full.patch
echo "wrote $out ($(grep -c '' $out) lines)"
```

### `bench.sh`

```sh
#!/bin/zsh
cd <scratch>/stage-3-spike-classes-2/wt/packages/classy-store/_copies
for round in 1 2; do
for c in bench-base bench-combo; do
  echo "## $c bun round $round"; bun $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | tail -40
  echo "## $c node round $round"; node $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | tail -40
done
done
```

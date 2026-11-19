# Stage 3, step 1: the stage 2 reports merged

Stage 3 of the pre-1.0 review, 2026-11-19. No library source was changed and
nothing here is decided. This is the list the decision document is written
from.

Sources: the 73 findings of `review/stage-1-report.md` ("stage 1 finding N"),
`review/stage-2-report.md` ("stage 2 defect N" is its numbered list of new
defects), and the eleven reports under `review/stage-2/`. A report's own
finding is written as the report and its id: "Vue 4", "Valtio V2", "adapters
N1", "security 12". "Q" before a number is that report's answer to one of the
eight API questions.

## Summary

- **77 entries**, `M1` to `M77`, under fourteen headings. Each is one
  distinct issue with every report that addresses it. The index has one line
  per entry. To read this in one sitting, read the index, the
  contradictions, the dependencies and the proposals I doubt, and open an
  entry when a line needs its detail.
- **All 73 stage 1 findings are in one table.** 70 map to an entry.
  Three have no stage 2 counterpart and no entry (4, 35, 59). Of the 70,
  three sit in entries that no stage 2 report addresses (57, 58, 60), three
  sit in an entry that has no proposal for them (13, 23, 44), and two are
  mapped in part (64, 73).
- **Every stage 2 finding is mapped**, in one table per report.
- **29 contradictions** between reports, seven of them already in the stage 2
  report. One was settled by a stage 2 run, one is not a real conflict, and I
  settled three more with short scripts (appendix). The rest need a spike or
  the owner.
- **The four that change most other entries:** how snapshot getters are
  installed (M33), whether `Object.defineProperty` is a write or an error
  (M2), what replaces suspend and resume (M14), and whether there is a
  development build (M72).
- **One number stands behind many entries:** the main entry measures 3,661
  bytes against a budget of 3,750. Almost every core fix adds code.

## How to read an entry

- **Problem** says what the library does today, with the stage 1 findings.
- **Reports** lists every report that addresses it.
- **Proposals** are what is left after removing duplicates. Where two
  proposals cannot both be taken, the entry says "Conflict".
- **Evidence** says what exists: a sketch and where its diff is, a
  reproduction, a measurement, or reasoning only. No sketch was run against
  the repository's suites in stage 2.
- **Kind and API** gives the kind (bug, simplification, performance, API
  design, diagnostics, docs) and whether the change touches the public API or
  documented behaviour. For that I read
  `website/content/docs/API_REFERENCE.md` in full ("the reference") and
  searched the other pages under `website/content/docs/` for the behaviour.
  A quoted sentence is what the docs say today.

## Index

One line per entry. "Conflict" is "Yes" where two reports propose things that
cannot both be taken, "Options" where the proposals differ without excluding
each other or one report leaves a choice, and "None proposed" where no report
proposes a change. The last column is "Yes" where at least one proposal
changes a signature, a public type or a sentence in the docs.

| Entry | Issue                                                              | Kind                    | Stage 1 findings         | Conflict      | Changes the API or documented behaviour     |
| ----- | ------------------------------------------------------------------ | ----------------------- | ------------------------ | ------------- | ------------------------------------------- |
| M1    | A function or class held as data is wrapped on every read          | Bug                     | 5, 6, 42, 62             | Yes           | No. Undocumented behaviour changes          |
| M2    | `Object.defineProperty` through a store is not a write             | Bug                     | 1, 44, 45, 71            | Yes           | Yes                                         |
| M3    | No `has` or `ownKeys` trap on the live store                       | Bug                     | 30                       | No            | No                                          |
| M4    | A delete that removes nothing counts as a write                    | Bug                     | 29                       | No            | No                                          |
| M5    | `includes`, `indexOf`, `lastIndexOf` miss a raw object in a list   | Bug                     | 7                        | Options       | No                                          |
| M6    | Raw objects hold proxies; a store handed over raw is not connected | Bug, simplification     | 9, 10                    | No            | No                                          |
| M7    | A raw object frozen or made read-only behind the store             | Bug, or docs            | 46, 49                   | Yes           | Only with a target of our own               |
| M8    | The prototype can be swapped through a store                       | Hardening               | 47, 48                   | Options       | Yes, if `setPrototypeOf` throws             |
| M9    | Every `get` and `set` looks the property descriptor up             | Performance             | None                     | No            | No                                          |
| M10   | Array methods read every element through the proxy                 | Performance             | 3                        | No            | No                                          |
| M11   | Nested class instances: opt-in or opt-out                          | API design              | None                     | Yes           | Yes, if the default flips                   |
| M12   | Arrow-function methods and `#private` fields                       | API design              | None                     | Options       | An addition                                 |
| M13   | A plain object from another realm is opaque                        | Bug                     | None                     | No            | No                                          |
| M14   | Suspend and resume, the walk, and the read that never returns      | Bug, simplification     | 28, 61, 64 to 68, 72, 73 | Options       | No                                          |
| M15   | What keeps a subscribed node alive                                 | Bug, or docs            | 27                       | Options       | No                                          |
| M16   | The order in which owners are notified                             | Docs                    | 24, 69                   | None proposed | No. Guaranteed or unspecified is to decide  |
| M17   | A raw object changed while out of the store shows old content      | Bug, or limit           | 25                       | None proposed | No                                          |
| M18   | A clean getter read validates every dependency list again          | Performance             | None                     | Options       | No                                          |
| M19   | How a nested getter is revalidated                                 | Performance, bug        | None                     | Yes, settled  | No                                          |
| M20   | A getter that reads one field in a loop records every read         | Performance             | 3                        | No            | No                                          |
| M21   | A getter misses what it reads on another node                      | Bug                     | 36                       | No            | No                                          |
| M22   | A nested getter that throws leaves no dependency                   | Bug                     | 36, 64                   | Options       | No                                          |
| M23   | A live getter over a missing property is recomputed on every read  | Bug                     | 32                       | Options       | Yes. The reference documents the recompute  |
| M24   | The snapshot layer loses nested memoization once per instance      | Bug                     | 37                       | No            | No                                          |
| M25   | A getter cycle on a snapshot overflows the stack                   | Bug, diagnostics        | 38                       | No            | No                                          |
| M26   | A getter that writes                                               | Diagnostics             | 39                       | Yes           | Yes, if it becomes an error                 |
| M27   | Three kinds of getter dependency                                   | Simplification          | None                     | No            | No                                          |
| M28   | Delivery to subscribers                                            | Bug, diagnostics        | 18 to 23                 | Yes           | No. The order of calls changes              |
| M29   | A setter is not a transaction                                      | Bug                     | 43                       | No            | One sentence in the reference               |
| M30   | `batch()`: an `async` callback, and a write that is undone         | Diagnostics             | None                     | Options       | Yes, if the type refuses a promise          |
| M31   | Whether `subscribe()` should be synchronous by default             | API design, docs        | None                     | Yes           | No report proposes a change                 |
| M32   | Writes outside a method, and after an `await`                      | Diagnostics             | None                     | Options       | Only an opt-in switch                       |
| M33   | Class getters are enumerable own accessors of a snapshot           | API design, performance | 70                       | Yes           | Yes                                         |
| M34   | `this` inside a snapshot getter                                    | Bug                     | 31, 41                   | No            | No                                          |
| M35   | A snapshot after one row changed costs time per row                | Performance             | 2                        | No            | No                                          |
| M36   | A store that refers to itself can be written but not read          | Bug, API design         | 8, 13                    | Options       | Yes                                         |
| M37   | Snapshots are incomplete at the edges                              | Diagnostics, docs       | 49                       | No            | No                                          |
| M38   | Native `Map` and `Set`                                             | API design              | 12                       | Yes           | No report proposes a change for 1.0         |
| M39   | One membership rule for the reactive collections                   | Bug                     | 33, 34                   | No            | Yes. The collections guide documents `-0`   |
| M40   | Collection lookups scan an array                                   | Performance             | None                     | Options       | No                                          |
| M41   | `Snapshot` turns a tuple into an array                             | Types                   | 14                       | No            | Yes, a public type                          |
| M42   | A snapshot of a reactive collection keeps its mutators             | Types, diagnostics      | 16                       | No            | Yes, a public type                          |
| M43   | The backing arrays of the reactive collections are public          | Types                   | 15                       | None proposed | Yes, if they leave the type                 |
| M44   | `persist` options are not validated                                | Hardening               | 48, 52, 55               | No            | No. It throws on input that is broken today |
| M45   | Records `persist` cannot read are skipped without a report         | Bug, diagnostics        | 53                       | Yes           | Additive types; new `onError` calls         |
| M46   | Expiry                                                             | Bug, or docs            | None                     | Options       | Yes, if the two options merge               |
| M47   | A migrated record is not written back                              | Bug                     | None                     | No            | No                                          |
| M48   | When hydration happens                                             | API design              | 56                       | Options       | An addition, unless the default changes     |
| M49   | `storage` is a required option                                     | API design              | None                     | No            | An addition                                 |
| M50   | A debounced save is lost when the page goes away                   | Bug                     | None                     | No            | No                                          |
| M51   | A deeply nested record bricks the store                            | Bug, hardening          | 52                       | No            | No                                          |
| M52   | A nested `__proto__` key survives restore                          | Hardening               | None                     | No            | No                                          |
| M53   | Cross-tab sync                                                     | Hardening, docs         | None                     | No            | No                                          |
| M54   | Dead and redundant code in `persist.ts`                            | Simplification          | 54                       | No            | No                                          |
| M55   | A pause switch and an in-flight flag                               | API design              | None                     | No            | An addition, and the report rejects it      |
| M56   | DevTools time travel is not a faithful restore                     | Bug, hardening          | None                     | No            | No                                          |
| M57   | `devtools`: action names, messages, options and `enabled`          | API design              | None                     | Yes           | Yes, if the default of `enabled` changes    |
| M58   | An edit in the same tick as `undo()` is not recorded               | Bug                     | 57, 58                   | None proposed | No                                          |
| M59   | `withHistory` treats a function in an own field as behaviour       | API design              | 60                       | None proposed | Not known                                   |
| M60   | Undo replaces every row of a changed list                          | Performance             | None                     | No            | No. It refines one sentence                 |
| M61   | `subscribeKey` snapshots the whole store per notification          | Performance             | None                     | No            | No                                          |
| M62   | `subscribeKey` takes a top-level key only                          | API design              | None                     | No            | An addition                                 |
| M63   | Every adapter builds a snapshot on each sync notification          | Performance             | 2                        | No            | No                                          |
| M64   | The Vue adapter leaks one subscription per server render           | Bug                     | None                     | No            | No                                          |
| M65   | The Vue adapter returns a writable ref                             | Types                   | 17                       | Options       | Yes, a documented return type               |
| M66   | The Angular adapter drops a store write made inside a `computed`   | Bug                     | None                     | No            | No                                          |
| M67   | The Angular adapter has no `injector` option                       | API design              | None                     | No            | An addition to a documented signature       |
| M68   | Adapter and entry names                                            | API design              | None                     | Yes, mild     | Yes, a rename                               |
| M69   | Svelte 5 runes                                                     | Docs                    | None                     | No            | No                                          |
| M70   | React hydration needs `prepareStoreForHydration`                   | API design              | None                     | Options       | Yes, documented behaviour                   |
| M71   | The equality option is called `isEqual`                            | API design              | None                     | No            | Yes, a rename                               |
| M72   | How a development build is split, and its rules                    | Diagnostics             | None                     | Yes           | Export conditions, under one of the shapes  |
| M73   | Which diagnostics                                                  | Diagnostics             | None                     | Options       | Only the four tools                         |
| M74   | The release job shares the npm publishing identity                 | Hardening               | None                     | No            | No                                          |
| M75   | Dependencies and the published tarball                             | Hardening, docs         | None                     | No            | No                                          |
| M76   | Documentation changes that no report disputes                      | Docs                    | None                     | No            | Docs only                                   |
| M77   | Limits that other libraries share                                  | Docs                    | 11, 26, 40, 50, 51, 63   | None proposed | No                                          |

## The entries

### Proxy traps and identity

#### M1. A function or a class held as data is wrapped on every read

- **Problem.** Every function read through a store is wrapped, to bind `this`
  and open a transaction. An array element gets a new wrapper on each read, so
  `indexOf` never finds a callback and `splice(indexOf(first), 1)` removes the
  last one. A class held as data, and `constructor`, lose their statics and
  `instanceof`. A store made from a function is not recognised by a holder.
  Stage 1 findings 5, 6, 42 and 62.
- **Reports.** Valtio V2, MobX 9, Vue 4, Solid 3, Svelte 3.
- **Proposals.**
  - (a) Four reports agree: wrap only methods. Return untouched an own
    function of an array, `constructor`, and a class. A class is told apart
    by its `prototype` property, which is not writable. An own function on a
    non-array object stays wrapped, because an object-literal store holds its
    methods that way (Solid 3).
  - (b) MobX 9: keep wrapping, cache one wrapper per function, never wrap
    `constructor`, and treat a frozen function as a value.
  - Conflict. Under (b) two reads return the same wrapper, but
    `indexOf(first)` is still -1, because what is read is not what was stored.
  - Open under both: a callback stored as an own property of a plain object
    still reads back as a wrapper. For a store made from a function, no
    report proposes anything; Vue's own `reactive(fn)` returns `fn` and warns
    in development.
- **Evidence.** Vue sketch B (port 15, diff in `vue-reactivity.md` under
  "Sketch B") fixed 5, 6 and 42 and kept a destructured method working. It ran
  against its own reproductions only. The class test was checked on Bun
  (Valtio, Vue) and on Node 24 (Solid). (b) is reasoning.
- **Kind and API.** Bug. No signature changes. `store.Model === Model` and
  `store.list[0] === fn` become true. The reference says "Prototype methods
  are automatically bound", which stays true, and says nothing about stored
  functions.

#### M2. `Object.defineProperty` through a store is not a write

- **Problem.** The trap forwards the definition and handles one case, a
  property that became read-only. A new key is not notified and is missing
  from the next snapshot. A redefined child or array element leaves the old
  child indexed, so store and snapshot disagree. A redefined getter keeps its
  cached result. The trap also does not resume a suspended subtree, which is
  where the hang of M14 begins. Stage 1 findings 1, 44, 45 and 71, and 61, 66
  and 67 through M14.
- **Reports.** Vue 6, Solid 7, Svelte 2, MobX 10, Immer 3. Valtio has the
  same defect.
- **Proposals.**
  - (a) A data descriptor is a write: resume, forward, link or detach the
    child, drop the cached bound method, bump the version, notify. Stay
    silent when nothing a snapshot shows has changed, so `Object.freeze(store)`
    does not notify once per key (Vue 6, Solid 7, Svelte 2, MobX 10). Vue 6
    adds that an accessor definition removes the child.
  - (b) Refuse: throw for any descriptor that carries `value`, `get` or
    `set`, and let through the bare flags that `Object.freeze` sends
    (Immer 3).
  - Conflict. (a) and (b) exclude each other, and (b) rules out M12, because
    class fields reach this trap as data descriptors. I confirmed that with a
    run (appendix).
  - Descriptors that are not a plain write (an accessor, `writable: false`):
    Svelte and Immer throw. The Svelte report says we need not, because we
    store everything on the target.
  - Freezing through the store: MobX 10 suggests refusing
    `Object.freeze(store)`, which removes the read-only branch. Vue, Svelte,
    Immer and Solid 7 keep it working.
  - No report says what clears a redefined getter's cache (finding 44).
- **Evidence.** Svelte spike, 24 lines added and 9 removed in `core.ts` (diff
  in `svelte.md` under "The spike"): the reproductions of 1, 45, 66 and 71
  pass. Stage 1 ran the one-line resume against the suite: 5 failures, all
  tests that pin 61 and 67. Nothing else was run against the suite.
- **Kind and API.** Bug. Changes documented behaviour. `TUTORIAL.md` says
  "using `Object.defineProperty` to change state bypasses assignment/deletion
  tracking" and "After `Object.freeze(store.profile)`, that object reads the
  same way". (a) removes a documented limit. (b) and refusing to freeze are
  breaking. `ARCHITECTURE.md` describes the trap.

#### M3. No `has` or `ownKeys` trap on the live store

- **Problem.** A live getter that reads `Object.keys(this)` or `'b' in this`
  records nothing, so it is stale after a key is added or deleted. Stage 1
  finding 30.
- **Reports.** Vue 1, Solid 6, Svelte 4, MobX 10, Valtio V5.
- **Proposals.** All five agree. Two traps that record a dependency only
  while a getter is being tracked. `has` records the key and whether it was
  present, and is checked with `Reflect.has`. `ownKeys` records a counter per
  node that moves when a key is added or removed, not when a value changes.
  Svelte 4 adds: do not track `getOwnPropertyDescriptor`, or `Object.keys`
  re-runs on every value change. The snapshot side is M34.
- **Evidence.** Vue sketch A, 48 added lines (diff in `vue-reactivity.md`
  under "Sketch A", ports 13 and 14): the live getters are right after a
  delete and an addition. Not run against the suite.
- **Kind and API.** Bug. No API change. Not documented either way.

#### M4. A delete that removes nothing counts as a write

- **Problem.** `delete store.dict.missing` calls every subscriber and
  replaces the snapshot with an equal one. Stage 1 finding 29.
- **Reports.** MobX 11a, Vue 5, Svelte 5, Immer 5, and the Solid table.
  Valtio has the same defect.
- **Proposals.** One: check `Object.hasOwn` before deleting.
- **Evidence.** In the Svelte spike and in Vue sketch A, each run against its
  own reproduction.
- **Kind and API.** Bug. No API change. `ARCHITECTURE.md` describes the
  delete trap and would need a clause. Changes the tests that pin 29.

#### M5. `includes`, `indexOf` and `lastIndexOf` miss a raw object in a list

- **Problem.** The list hands out proxies and the search compares them with
  the raw argument. Stage 1 finding 7.
- **Reports.** Vue 2, Svelte 6. Valtio, MobX and Solid miss in the same way.
- **Proposals.**
  - (a) Compare by `identityOf` in the three searches, so the raw object, its
    proxy and its snapshot row are all found (Vue 2, Svelte 6).
  - (b) It falls out of M10 if read-only array methods run on the raw array,
    provided M6 keeps proxies out of the raw array.
  - Svelte's own answer, a development warning, is rejected by its report.
- **Evidence.** Vue port 15. The sketch maps the whole array on each call; a
  real version would loop once.
- **Kind and API.** Bug. `includes(raw)` changes from `false` to `true`. Not
  documented.

#### M6. Raw objects end up holding proxies, and a store handed over raw is not connected

- **Problem.** After `to.row = from.row`, or `list.reverse()`, the raw object
  holds a proxy. A class instance that is already a store, placed in another
  store by its raw object, fails `canProxy` and stays unconnected: a method
  call through it notifies neither store. Stage 1 findings 9 and 10, and part
  of 34.
- **Reports.** Vue 3. Solid does the same as Vue (table rows 9 and 10).
  Valtio V2 warns against the opposite design, a raw object that holds
  proxies from creation.
- **Proposals.** One: unwrap a store proxy in `set`, and let `linkChild` find
  a node by the raw object as well as by the proxy. The two-form comparison
  in `set` then reduces to one. Two rules must survive: a value under a
  read-only property is returned as it is, and a frozen container keeps the
  form it was given.
- **Evidence.** Vue sketch B, 20 lines added and 7 removed, fixed 9 and 10
  together with M1 and M5. Not run against the suite. It touches attach and
  detach.
- **Kind and API.** Bug and simplification. No API change. Only code that
  keeps the raw object can see it. The reference promises reactivity for a
  store "embedded by its proxy"; embedding by the raw object is not promised.

#### M7. A raw object frozen or made read-only behind the store

- **Problem.** The Proxy targets the raw object, so the engine checks every
  `get` result against it. After `Object.freeze(raw.config)`,
  `s.config.nested` throws. A non-writable, non-configurable field that holds
  an object is shared with snapshots already taken. Stage 1 finding 46 and
  part of 49.
- **Reports.** Solid 5, Immer 2, Svelte 7. Vue lists freezing through the
  proxy among the things we do better.
- **Proposals.**
  - (a) Give the Proxy a target of the library's own (Solid, Immer). It
    removes `isReadOnly` and the freeze branch. It makes `has`, `ownKeys`,
    `getOwnPropertyDescriptor` and `getPrototypeOf` mandatory, and
    `Object.freeze(store)` needs separate support. Solid 5 says reject for
    1.0. Immer 2 says a design question, not a 1.0 blocker.
  - (b) A guard in `get`: when the property has turned read-only, detach the
    child and return the raw value (Svelte 7). It is free only while `get`
    looks the descriptor up on every read, which M9 removes.
  - (c) Document that the raw object must not be frozen or redefined once a
    store holds it (Solid 5, Immer 2).
- **Evidence.** Svelte spike for (b), 9 lines added and 3 removed: the read
  returns 1 instead of throwing. (a) is reasoning.
- **Kind and API.** Bug, or docs. (a) is breaking. The tutorial already says
  that mutating the raw instance bypasses the store.

#### M8. The prototype can be swapped through a store

- **Problem.** `Object.setPrototypeOf(store, …)` and
  `Object.assign(store, JSON.parse('{"__proto__": …}'))` swap the prototype.
  `s.__proto__` is memoized as a getter with no dependencies, and a method
  bound before the swap keeps the old class body. Stage 1 findings 47 and 48.
- **Reports.** Immer 3. Svelte and Solid refuse `setPrototypeOf` (their
  tables). Vue behaves as a plain object does. Security 1 settles the
  `persist` path.
- **Proposals.**
  - (a) A `setPrototypeOf` trap that throws (Immer 3).
  - (b) Also ignore `__proto__` as a written key, as Solid does. The Solid
    report leaves that to the security report, which does not ask for it.
  - (c) Leave it as on a plain object.
  - Security 1: `persist` cannot reach this unless the application lists
    `__proto__` in `properties`, which M44 would refuse.
- **Evidence.** Immer port 5 and the security reproduction, both run. No
  sketch on ours.
- **Kind and API.** Hardening. (a) is breaking for code that swaps a store's
  prototype. Not documented.

#### M9. Every `get` and `set` looks the property descriptor up

- **Problem.** Both traps walk the prototype chain with
  `Object.getOwnPropertyDescriptor` on every access. In Solid's harness a
  field read costs 46.5 nanoseconds on Node and 25.4 on Bun, against 21.7 and
  2.5 for a forwarding Proxy. This is the open performance item in the plan.
- **Reports.** Solid 1. MobX 12 notes that MobX does its class work once per
  prototype. Valtio V2 has the timing: 1.6 nanoseconds against 30.5.
- **Proposals.** One (Solid 1). Decide an own key with `hasOwnProperty` and
  one flag per node, "this object has an own accessor". Answer an inherited
  key from a table per prototype, filled on the first miss. It assumes a
  prototype gains no getter after its first read through a store, which the
  library already does not handle (stage 1 findings 44 and 47).
- **Evidence.** Solid spike, 30 lines (diff in `solid.md` under port 6): a
  field read drops to 38.2 on Node (18% less) and 11.9 on Bun (53% less), a
  cached getter on Bun from 58.2 to 34.3. Not run against the suite.
- **Kind and API.** Performance. No API change. It removes what makes M7 (b)
  free.

#### M10. Array methods read every element through the proxy

- **Problem.** `reduce`, `map`, `includes` and the rest run on the proxy, so
  every index pays for the `get` trap: 126 nanoseconds per row for a `reduce`
  against Vue's 76, and 921 against 57 for `includes` on ten numbers. Bears
  on stage 1 finding 3.
- **Reports.** Vue 7.
- **Proposals.** For the array methods that only read, run the native method
  on the raw array and hand each element's proxy to the callback. A tracked
  getter already holds one version dependency on the array.
- **Evidence.** Vue's numbers (port 11, Bun). Not sketched on ours: the gain
  is an expectation.
- **Kind and API.** Performance. Not breaking if a callback still receives
  proxies. The Vue report names sparse arrays, array subclasses and a
  callback that writes as the risks.

#### M11. Nested class instances: opt-in or opt-out

- **Problem.** A nested class instance without `PROXYABLE` is kept by
  reference. A method called on it changes state, notifies no one, and
  changes snapshots already taken. Stage 2 defect 1. API question 6.
- **Reports.** Solid 4, Valtio V12, Vue (Q6 and port 7), MobX Q6, Svelte Q6,
  Immer Q6, Legend-State Q6.
- **Proposals.**
  - (a) Keep opt-in, add a development warning when an unmarked class
    instance is placed in a store, and document that such an instance is
    shared with every snapshot (Valtio V12, Vue Q8; MobX, Svelte and Immer
    are opt-in themselves).
  - (b) Wrap by default, cache the verdict per prototype, and keep freezing
    and one explicit marker as the ways out (Solid 4).
  - Conflict. Vue Q6 adds two costs of (b) for us: a snapshot of a class with
    `#private` fields fails, and the marker must be kept in a `WeakSet`,
    because internal state never goes on the user's object.
  - (c) A `ref()`-like marker for a plain object can be added after 1.0
    (Valtio V12).
- **Evidence.** The defect was re-run by the orchestrating agent. The
  libraries split four to three: Valtio, Vue, Solid and Legend-State wrap;
  MobX, Svelte and Immer do not. No sketch.
- **Kind and API.** API design. (b) changes documented behaviour: the
  reference says "Ordinary nested class instances remain opaque" and
  documents `PROXYABLE` as the opt-in.

#### M12. Arrow-function methods and `#private` fields

- **Problem.** An arrow-function field captured the raw instance, so its
  writes go around the proxy without a word. A method that touches `#x`
  throws, because `this` is the proxy. API question 4.
- **Reports.** MobX 8, Svelte 1, Vue (Q4 and port 8), Solid 8 and Q4, Valtio
  Q4, Zustand and Jotai Q4.
- **Proposals.**
  - (a) An optional base class whose constructor returns the store, about
    six lines and one new export (MobX 8, Svelte 1, Vue Q4). Arrow methods
    then notify. A `#private` field stops throwing on the live store but is
    never state: a write to it notifies no one, a getter over it is cached
    for good, and a snapshot getter that reads it throws.
  - (b) No base class, and a development warning. Two detectors are
    proposed: at creation, an own property that holds a function with no
    `prototype` (MobX 8); or per call, compare the own data values with the
    node's version (Solid 8).
  - (c) Under either, document that a `#private` field is never state
    (Svelte 1).
- **Evidence.** Three agents ran the base class on the unmodified library
  (MobX script 10, Vue port 8, the Svelte appendix). Arrow methods notify.
  The first snapshot holds the raw, unfrozen array until M2 is fixed; with
  the Svelte spike of M2 it is frozen. `instanceof`, `new.target` and
  `useLocalStore` were not checked.
- **Kind and API.** API design. (a) is an addition. It needs M2 (a) and is
  ruled out by M2 (b). The reference says "arrow-function fields cannot be
  rebound".

#### M13. A plain object from another realm is opaque

- **Problem.** `isPlainObject` accepts only this realm's `Object.prototype`.
  An object made in an iframe or a `vm` context is kept by reference: writes
  to it notify no one and its snapshot is not frozen. Stage 2 defect 4.
- **Reports.** Immer 6.
- **Proposals.** Also accept a prototype whose constructor is another
  realm's `Object`, with the check cached per constructor.
- **Evidence.** Immer port 9 on Node and Bun, re-run by the orchestrating
  agent. No sketch.
- **Kind and API.** Bug. It changes `canProxy`, which `persist` and `history`
  use too. Not documented.

### Ownership and memory

#### M14. Suspend and resume, the walk to a detached parent, and the read that never returns

- **Problem.** A detached, unobserved container is suspended, each suspended
  child points at its former parent, and every trap walks that chain first.
  Stage 1 found that the walk adds nothing to correct behaviour and causes a
  read that never returns (66), a snapshot that is stale once (67) and, where
  there is no `WeakRef`, a held row that keeps its removed list alive (68).
  Stage 1 findings 28, 61, 65 to 68 and 72, and the dead code in 64 (third
  item) and 73.
- **Reports.** Valtio V1. Solid 10 has a note on how Solid does without any
  of it. Svelte 2 and Solid 7 include the resume in their `defineProperty`
  change. MobX, Vue, Svelte and the signal libraries have no ownership graph.
- **Proposals.**
  - (a) One line: `resumeScope()` first in the `defineProperty` trap (stage
    1, Solid 7, Svelte 2). It removes the hang and keeps the walk.
  - (b) Remove the pointer to the detached parent and the walk (stage 1
    finding 72, Valtio V1).
  - (c) Go further: keep one mechanism against "a retained row keeps removed
    lists alive", the weak owner links, and drop suspension with its three
    corrections (Valtio V1).
  - Valtio V1 also says what not to take: Valtio's pull. Our eager version
    bump is what makes a cached snapshot constant.
  - (a) and (b) can both be done. (c) includes (b).
- **Evidence.** Stage 1: with the walk removed, every test passes except the
  ones that pin 66 to 68; with (a), 1,307 pass and 5 fail, all pinning 61 and
  67. Valtio returns from the read that hangs ours and gives our answers in
  every ported detached-subtree case but the one in M15. (c) is reasoning;
  what it leaves to measure is a write to a row with many dead owners.
- **Kind and API.** Bug and simplification. No API change. The memory tests
  and the owner-order tests (M16) pin today's behaviour.

#### M15. What keeps a subscribed node alive, and what a store keeps alive

- **Problem.** After `subscribe(store.list, cb)` and `store.list = []`, a
  caller who kept one row and dropped the unsubscribe function is called
  until the garbage collector runs and never after. A child holds its owners
  weakly, and nothing holds a node that has a listener. Stage 2 defect 5.
  Related: the four things stage 1 found kept alive longer than expected
  (finding 27).
- **Reports.** Valtio V1. MobX 12 rejects the one remedy MobX has for the
  third item of 27, dropping a getter's cache when nobody observes it.
- **Proposals.**
  - (a) Document that a subscription lasts while the caller holds the store,
    the node or the unsubscribe function.
  - (b) Hold a node strongly for as long as it has a listener. A forgotten
    unsubscribe then keeps the node for good.
- **Evidence.** Valtio port 4d, five rounds of five on each library. Finding
  27 is pinned by tests. (b) is not sketched.
- **Kind and API.** Bug, or docs. The reference says a subscription "keeps
  working when the object moves to another field or another store". A
  container removed from every store is not covered by that sentence.
  `CONSTRAINTS.md` says retained memory must not grow, which (b) touches.

#### M16. The order in which owners are notified

- **Problem.** Owners are notified level by level, not from the inside out,
  and the order depends on hidden state: whether a container that left the
  store and came back was observed meanwhile. Stage 1 findings 24 and 69.
- **Reports.** No library has owners (MobX, Vue, Svelte, Signals). MobX 5
  says the order across re-entrant writes should be marked unspecified.
- **Proposals.** None from stage 2. This is an item for "guaranteed or
  unspecified" in the decision document, and M14 changes it.
- **Evidence.** Pinned in `core.ownerOrder.test.ts`.
- **Kind and API.** Docs. Not documented today.

#### M17. A raw object changed while out of the store shows old content when put back

- **Problem.** `delete store.slot; raw.n = 2; store.slot = raw` gives
  `store.slot.n === 2` and `snapshot(store).slot.n === 1`, if a snapshot was
  taken before the delete. Stage 1 finding 25.
- **Reports.** Valtio does the same (table). Svelte and Immer agree with
  themselves only because they cache nothing (Svelte 9).
- **Proposals.** None. It is the raw-write limit of M77 meeting the snapshot
  cache. It belongs with M14, since attaching is where a version could be
  bumped.
- **Evidence.** Pinned by a stage 1 test. Valtio port 4.
- **Kind and API.** Bug, or a documented limit. The tutorial says raw writes
  bypass snapshot invalidation.

### Getters

#### M18. A clean read validates every dependency list again

- **Problem.** Every read of a getter walks its whole dependency list, and a
  dependency on another getter walks that getter's list. With two getters per
  level, each reading both below, a clean read doubles per level: 27
  microseconds at depth 8 and 24.8 milliseconds at depth 20. Stage 2
  defect 2.
- **Reports.** Signals 1, MobX 3 (step 2).
- **Proposals.** A stamp on each cache entry, so that a read at the same
  stamp returns at once. MobX 3 uses a new module-level write counter.
  Signals 1 uses the node's own version, which already moves on any write
  below it, and takes it before the body runs. Both name one edge: a
  primitive written through the raw object is noticed only after the next
  write through a proxy.
- **Evidence.** Signals `spike-stamp` (diff in `signals.md` under "Spike
  diffs"): a clean read at depth 20 takes 0.06 microseconds, and one getter
  over three fields 46 nanoseconds, from 61. Ports 02 to 08 give the same
  output. Not run against the suite. That it is safe for a suspended subtree
  was read, not tested.
- **Kind and API.** Performance. No API change.

#### M19. How a nested getter is revalidated

- **Problem.** A dependency on another getter is valid only if that getter's
  whole list is valid. Whether its value changed is never asked. With `label`
  reading `parity = a % 2`, `label` re-runs when `a` goes from 1 to 3. The
  snapshot layer already compares values.
- **Reports.** MobX 3 (step 1), Signals 2.
- **Proposals.**
  - (a) Refresh the nested getter and compare its value (MobX 3).
  - (b) Compare its value and, when the value is a store node, that node's
    version (Signals 2). Reads made during validation must not be recorded.
  - Conflict, settled by a run: (a) gives a stale result on ours. A getter
    can return a live store node, so `firstPrice`, which reads
    `this.first.price`, stays 1 after `rows[0].price = 2`.
- **Evidence.** `spike-refresh` fails the probe and `spike-one` passes it.
  With M18, a read after the base changed becomes linear: 183 microseconds at
  depth 200, against 832 with the stamp alone.
- **Kind and API.** Performance and bug. No API change. It changes the run
  counts pinned at `core.characterisation.getters.test.ts:133`.

#### M20. A getter that reads one field in a loop records it on every read

- **Problem.** `this.rows[i]` in a loop over 1,000 rows records 2,000
  dependencies. A clean read costs 28 microseconds, against 0.12 when the
  getter reads `this.rows` once. Stage 1 finding 3, stage 2 defect 3.
- **Reports.** Signals 3.
- **Proposals.** Record a property once per run, with a set on the tracker
  frame, as the snapshot layer does already.
- **Evidence.** Signals script 09. The stamp of M18 fixes the clean read and
  not the read after an unrelated write (27.6 microseconds). `spike-one`
  gives 0.26 and 0.39.
- **Kind and API.** Performance. No API change.

#### M21. A getter misses what it reads on another node

- **Problem.** A getter records only reads on its own node. One that reads
  another store, its own child through an outside reference, or a static
  that names its class is cached for good on the live store, while a fresh
  snapshot gives the new value. Stage 1 finding 36 (first three cases) and
  the note under finding 28.
- **Reports.** MobX 1, Vue 8. Svelte and the signal libraries track every
  read (their tables).
- **Proposals.** One: for a read on any other node, record that node's
  version, once per node per run, and skip a node that an already covered
  node handed out. A read into another store is then covered by that store's
  root version, so any write there invalidates the getter.
- **Evidence.** The defect is reproduced (MobX script 03, Vue port 9). The
  fix is reasoning. MobX 1 notes that the snapshot layer has the same gap
  and is harder, and that a suspended container must be resumed before its
  version is compared.
- **Kind and API.** Bug. No API change. The reference says getters "cache
  results from the store properties they read".

#### M22. A nested getter that throws leaves no dependency

- **Problem.** A getter is cached, and recorded as a dependency, only when it
  returns. `try { return this.strict } catch { return 'fallback' }` stays
  `'fallback'` after `strict` stops throwing. A getter that throws runs its
  body again on every read. Stage 1 finding 36 (last case) and the first
  item of 64.
- **Reports.** MobX 2, Signals 4, Vue 8.
- **Proposals.**
  - (a) Record the dependency on the nested getter in a `finally`, or before
    it runs, on both layers. All three agree. The branch stage 1 lists as
    unreachable, `if (!cached) return false`, is then the one that handles
    it.
  - (b) Optionally cache the error with its dependencies. Signals 4 adds a
    rule from a counter-example: never cache an error that recorded no
    dependency, and record the dependency that closes a cycle before
    throwing.
- **Evidence.** `spike-one` does (a) without (b), and the catching getter
  recovers. Under an error cache without that rule, Preact and the TC39
  polyfill stay stuck on a cycle that a write has broken (Signals script 03).
- **Kind and API.** Bug. No API change. It changes the pinned tests at
  `core.characterisation.getters.test.ts:1161` and `:1270-1300`.

#### M23. A live getter that reads a missing property is recomputed on every read

- **Problem.** A dependency on a key that does not exist fails validation
  every time, so a getter that builds an object returns a new one on each
  read. Stage 1 finding 32.
- **Reports.** MobX 10, Vue 8, Svelte 4, Signals 1.
- **Proposals.**
  - (a) A `present` flag on the value dependency: it is valid for as long as
    the key stays missing (Svelte 4, Vue 8, MobX 10).
  - (b) The stamp of M18 alone. Signals 1 reports that it removes the
    finding as a side effect.
- **Evidence.** Svelte spike, 7 lines: the getter ran once for two reads,
  again when the property appeared and again when it was deleted. Signals
  probe: the same object twice on all three spikes. Neither report ran "read,
  unrelated write, read" on the stamp alone.
- **Kind and API.** Bug. Changes documented behaviour: the reference says "A
  live getter that reads an absent field recomputes on subsequent reads".

#### M24. The snapshot layer loses nested memoization once per instance

- **Problem.** `evaluateSnapshotGetter` replaces the memo map that nested
  getters filled, on a target's first getter read. Stage 1 finding 37, stage
  2 defect 7.
- **Reports.** Signals 6.
- **Proposals.** Read the memo map again after the computation. One line.
- **Evidence.** `spike-memo`: total body runs of 60, 60, 80, 80 over four
  steps, against 60, 79, 99, 99.
- **Kind and API.** Bug, performance only. No API change. It changes the
  pinned test of finding 37.

#### M25. A getter cycle on a snapshot overflows the stack

- **Problem.** The live store throws "circular computed getter dependency: a
  → b → a". The snapshot layer has no check and throws a `RangeError`. Stage
  1 finding 38.
- **Reports.** MobX 11b, Signals 5, Vue 8, and the Svelte table.
- **Proposals.** One: give `evaluateSnapshotGetter` the live layer's check
  and message. Keep the live message, which names the path where the other
  libraries' messages do not.
- **Evidence.** Reproduced in four reports. Not sketched.
- **Kind and API.** Bug and diagnostics. No API change.

#### M26. A getter that writes

- **Problem.** On the live store it runs again and notifies on every read.
  On a snapshot the write is dropped without a word. Stage 1 finding 39.
- **Reports.** MobX 6, Solid 8, Svelte 11, Signals 7.
- **Proposals.**
  - (a) A development warning from the `set` trap while a getter is being
    tracked (MobX 6, Solid 8, Signals 7).
  - (b) An error, in every build (Svelte 11).
  - Conflict. Signals 7 says an error is stricter than Preact, the TC39
    polyfill and Vue. The Svelte report itself notes that (b) breaks a getter
    that fills a cache field on its first read.
- **Evidence.** The behaviour is reproduced in four reports. Nothing is
  sketched.
- **Kind and API.** Diagnostics. (b) is breaking. Not documented.

#### M27. Three kinds of getter dependency

- **Problem.** A getter records the version of a child node, the value of a
  primitive field, or another getter. The plan names this among the parts
  hardest to reason about.
- **Reports.** Signals, in "Could our three kinds of dependency become one?".
- **Proposals.** One entry type, `{value, version}`, keyed by property. It
  takes in M19, M20, M22 (a) and M23, and makes M21 one more entry of the
  same shape. The Signals report recommends M18, M20 and M22 (a) first, as
  small changes, and then deciding this with the benchmark in hand.
- **Evidence.** `spike-one`, about 150 lines of diff, ran against the Signals
  ports only. A write to another field followed by the getter costs 300
  nanoseconds against 206, which is 45% more.
- **Kind and API.** Simplification. No API change. It would move the
  cached-getter and write costs in `CONSTRAINTS.md`.

### Subscriber delivery and transactions

#### M28. Delivery to subscribers

- **Problem.** `deliver` runs inside the write. A sync subscriber that writes
  recurses until the stack overflows (stage 1 finding 18). A batched one is
  served again in back-to-back microtasks with no bound (19). A subscriber
  removed during delivery is still called once (20). A subscriber added after
  a write sometimes hears it (21). A re-entrant write delivers the same
  snapshot twice (22). A rejected promise from a subscriber is not reported
  (23).
- **Reports.** MobX 5, Signals 8, Vue 9, Svelte 11, Valtio V6, Zustand and
  Jotai 9, Legend-State 1, adapters A2.
- **Proposals.**
  - Agreed by every report that addresses it: skip a listener that is no
    longer registered (20). Adapters A2: the four `active` flags in the
    adapters can then go.
  - Re-entry, three policies. (a) One queue drained in a loop: a write made
    during delivery is delivered after the current round (MobX 5,
    Signals 8). (b) Skip a listener that is already running, so a subscriber
    does not hear of its own writes (Vue 9). (c) Count the depth and throw
    (Vue 9, as the alternative).
  - The bound: 100 rounds (MobX, Preact, Vue's scheduler) or 1,000 (Svelte).
    It is reported through `console.error`, naming the store (MobX 5,
    Signals 8), or as a named error in every build (Svelte 11), or in
    development only (Vue 9).
  - Findings 21 and 22: each subscription keeps the version it last saw and
    is skipped when that has not moved (MobX 5). Valtio V6 queues the
    listeners that exist at the write, which covers 21 only. Zustand and
    Jotai 9 agrees with the rule for 21 and proposes nothing for 22.
  - Errors: keep the `try` around each listener and `console.error`; do not
    throw to the writer (Signals 8, Legend-State 1, Vue 9, Valtio V6).
    Legend-State 1 offers one replaceable reporter as an option.
  - Finding 23: no library reports a subscriber's rejected promise, and
    nothing is proposed.
- **Evidence.** Ported to MobX, Preact, Vue, Valtio and Zustand. Nothing is
  sketched on ours. MobX 5 estimates 30 lines in `core.ts`.
- **Kind and API.** Bug and diagnostics. No signature changes. The order of
  calls changes when a subscriber writes. The reference does not say what a
  removed or a late subscriber gets. Delivery stays synchronous under all
  three policies, which every adapter relies on.

#### M29. A setter is not a transaction

- **Problem.** A setter that writes two fields gives two sync notifications,
  so a subscriber sees the half-applied state. Stage 1 finding 43.
- **Reports.** Valtio V7, MobX 4, Svelte 10. Vue has the same defect.
- **Proposals.** One: open the transaction around the accessor branch of the
  `set` trap.
- **Evidence.** Svelte spike, 6 lines added and 1 removed: the subscriber
  sees the final state once.
- **Kind and API.** Bug. The reference lists when sync subscribers are
  notified: "once per direct write, and once per store method or array
  operation". A setter would join that list. It changes two pinned tests.

#### M30. `batch()`: an `async` callback, and a write that is undone

- **Problem.** `batch(async () => …)` groups only the writes before the
  first `await` and hands back the promise. Stage 2 defect 20. Separately, a
  value set and set back inside a batch still notifies once.
- **Reports.** Legend-State 3 and 2, Solid 8, Signals 9. The MobX, Vue,
  Signals, Legend-State, Zustand and adapters reports all say `batch()`
  belongs in the API.
- **Proposals.**
  - The `async` case: (a) a development warning when `run()` returns a
    thenable (Legend-State 3, Solid 8); (b) a type that refuses a function
    returning a promise (Legend-State 3). The stage 2 report leans to
    "refuse a promise".
  - The undone write: reject (Signals 9, Legend-State 2). The version has
    moved, and a binding compares snapshot identity.
- **Evidence.** Legend-State port B8, re-run by the orchestrating agent. (b)
  was not tried.
- **Kind and API.** Diagnostics. (b) changes a documented signature. The
  reference says `batch` "Returns whatever `run` returns" and already
  documents that only the synchronous part is covered.

#### M31. Whether `subscribe()` should be synchronous by default

- **Problem.** API question 1. `subscribe()` is batched in a microtask
  unless `{sync: true}` is passed.
- **Reports.** All eleven answer it.
- **Proposals.** MobX, Preact, Legend-State, Zustand and Jotai notify
  synchronously. Valtio, Solid and Svelte batch. Vue is synchronous
  underneath and grouped at the surface, as we are. No report proposes
  changing our default. Valtio V7 rejects a `sync` option on hooks. Zustand
  and Jotai Q1 asks that the batched default be stated at the top of the
  reference, because users of five of these libraries expect synchronous
  delivery. MobX Q1 says a synchronous default would need M28 first.
- **Evidence.** Ports in each report. Valtio's timing shows why sync without
  grouping cannot be a default: sorting 1,000 rows with one sync subscriber
  that takes a snapshot costs 248 milliseconds there and 0.9 on ours.
- **Kind and API.** API design and docs. Changing the default would be
  breaking and is documented.

#### M32. Writes outside a method, and after an `await`

- **Problem.** API question 2. A direct write is allowed anywhere and each
  one notifies sync subscribers. A method is a transaction only up to its
  first `await`. Neither case is reported to the developer.
- **Reports.** MobX 6, Solid 8, adapters Q8, and question 2 in every report.
- **Proposals.** Every report keeps direct writes allowed and keeps
  `batch()`. The diagnostics differ:
  - (a) An opt-in development check for a write outside a transaction to a
    store that has sync subscribers. It catches the `await` case (MobX 6).
  - (b) A development warning when a sync listener is notified many times in
    one task (adapters Q8).
  - (c) Document a method that returns a promise, and do not warn (Solid 8).
- **Evidence.** MobX script 05. Nothing is sketched.
- **Kind and API.** Diagnostics. (a) needs a public switch. No behaviour
  changes.

### Snapshots

#### M33. Class getters are enumerable own accessors of a snapshot

- **Problem.** API question 3. Every snapshot of a class instance gets an own
  enumerable accessor per getter. `Object.keys(store)` is `a,b` and
  `Object.keys(snapshot(store))` is `a,b,entryCount`. A spread or a
  `JSON.stringify` of a snapshot runs every getter. Installing them costs
  about 160 nanoseconds per getter per snapshot. A snapshot also lists every
  data field before any own getter, whatever their order on the store (stage
  1 finding 70).
- **Reports.** Valtio V4, MobX Q3, Vue (Q3 and finding 1), Solid Q3, Svelte
  Q3, Immer Q3. No library turns an inherited getter into an own enumerable
  accessor of a copy.
- **Proposals.**
  - (a) One derived prototype per class, made once and cached. It inherits
    from the class prototype and carries the memoizing accessors, not
    enumerable (Valtio V4, Immer Q3). `instanceof` still holds;
    `Object.getPrototypeOf(snapshot)` becomes the derived object.
  - (b) Own accessors that are not enumerable (MobX Q3).
  - (c) Keep today's shape and document that a snapshot has more keys than
    its store (Valtio V4, as the fallback).
  - An own getter of an object literal stays an own accessor under (a).
  - The stage 2 report asks stage 3 to spike (a) and (b).
- **Evidence.** Ports in each report. Valtio's timing: writing a field and
  taking a snapshot costs 672 nanoseconds with no getter and 1,938 with
  eight. Neither (a) nor (b) is prototyped.
- **Kind and API.** API design and performance. Changes documented
  behaviour. `TUTORIAL.md` says "every getter of the class is installed as an
  enumerable own accessor, so `Object.keys(snapshot)`, object spread and
  `JSON.stringify(snapshot)` include computed values". The reference says
  snapshots of a `PROXYABLE` class "keep the class prototype".

#### M34. `this` inside a snapshot getter

- **Problem.** A snapshot getter runs with `this` set to a Proxy over an
  empty object that has only a `get` trap. `Object.keys(this)` is empty,
  `'b' in this` is `false`, `this instanceof C` is `false`, and `return this`
  hands the proxy out. Stage 1 findings 31 and 41.
- **Reports.** Valtio V5, Vue 1, Solid 6, MobX 10.
- **Proposals.** Make the frozen snapshot the target of the tracking proxy
  and add `has` and `ownKeys` traps that record (Valtio V5, Vue 1). Solid 6
  lists four traps; with the snapshot as the target, only those two are
  needed. Valtio V5 says not to use proxy-compare's `createProxy` for this:
  every object read through it is a tracking proxy, so a getter that returns
  rows would hand out proxies.
- **Tie to M33.** While getters are enumerable own accessors,
  `Object.keys(this).length` counts them (5 where the live store says 2), and
  a getter that calls `Object.entries(this)` reads itself until the stack
  overflows. Either M33 changes, or the tracker's `ownKeys` leaves accessors
  out (Vue 1).
- **Evidence.** Valtio's prototypes A, B and C, on real snapshots that held
  data properties only. Vue sketch A with ports 13 and 14.
- **Kind and API.** Bug. No API change. No report addresses `return this`.

#### M35. A snapshot after one row changed costs time in proportion to the rows

- **Problem.** Writing one of 1,000 rows and taking a snapshot costs about 56
  microseconds on Node and 119 on Bun, against well under a microsecond for a
  cached snapshot. Stage 1 finding 2. Every sync adapter multiplies it (M63).
- **Reports.** Immer 1, adapters A1. Valtio, MobX and Solid are no better.
- **Proposals.** Record which child keys changed since the node's last
  snapshot. Rebuild an array by copying the previous snapshot by index and
  recomputing only those. Fall back to today's walk when many changed, when
  the length changed, or when there is no previous snapshot. Immer 1 also
  says: no switch to turn freezing off.
- **Evidence.** A measured floor, not an implementation: 6 microseconds
  against 56 on Node. On Bun the gain is small, because freezing a new
  1,000-element array dominates. Immer with freezing on costs what we cost.
  My own run adds one fact: on Bun, reading a frozen array is itself slow, 17
  microseconds per 1,000 elements against 2.5 (see the appendix).
- **Kind and API.** Performance. No API change. The set of changed keys must
  survive detach and resume, so this comes after M14.

#### M36. A store that refers to itself can be written but not read

- **Problem.** `store.self = store` succeeds and notifies. Every later
  `snapshot(store)` throws, which inside an adapter means the subscriber
  throws. Stage 1 finding 8. A getter on such a store also recomputes on
  every write (finding 13), for which no report proposes anything.
- **Reports.** Valtio V3, Solid 10, Svelte 9, Immer 11.
- **Proposals.**
  - (a) Support cycles: replace the in-progress set with a map from target
    to the unfinished snapshot, return that on a repeat visit, and freeze
    after filling. All four describe the same mechanism. Valtio V3 adds: not
    through the shared cache, where a getter that throws would leave a
    half-built snapshot. Then make `proxy-compare`'s `isChanged`,
    `cloneSnapshot`, `shallowEqual`, `persist`, `devtools` and `withHistory`
    safe for cycles.
  - (b) Refuse at the write that closes the cycle (the alternative in
    Valtio V3, Svelte 9 and Immer 11).
  - All four agree on one thing: today's state, where the write succeeds and
    the store can no longer be read, is the outcome to remove.
- **Evidence.** Svelte spike, 13 lines added and 9 removed in `snapshot.ts`:
  a store that holds itself, a ring of two and a list that holds itself all
  snapshot, and every node is frozen. The utilities and React's tracked reads
  were not tried with a cyclic snapshot.
- **Kind and API.** Bug and API design. Changes documented behaviour:
  `TUTORIAL.md` says "Circular references in traversed state are rejected by
  `snapshot()`".

#### M37. Snapshots are incomplete at the edges

- **Problem.** An array's own named and symbol-keyed properties are reactive
  on the store and missing from its snapshot. An object inherited from the
  prototype comes back raw and unfrozen. Stage 1 finding 49. (Its third case,
  the read-only field, is M7.)
- **Reports.** Immer 4.
- **Proposals.** A development error for a named property written to or
  deleted from an array, and a sentence in the docs that arrays carry indices
  and `length` only. Immer 4 rejects carrying named properties into
  snapshots: it would cost a `Reflect.ownKeys` of the array on every
  rebuild. Nothing is proposed for the inherited object.
- **Evidence.** Immer port 4. Not sketched.
- **Kind and API.** Diagnostics and docs. It needs M72.

### Collections

#### M38. Native `Map` and `Set`

- **Problem.** API question 5. A native collection in a store is opaque: a
  write to it notifies no one, it holds raw members (stage 1 finding 12), and
  every snapshot shares it.
- **Reports.** Vue 10, Svelte 8, Immer 9, Legend-State 8, and question 5 in
  the MobX, Valtio and Solid reports.
- **Proposals.** No report proposes replacing `reactiveMap` and `reactiveSet`
  for 1.0. Four give the same reason: a frozen native `Map` can still be
  written through `Map.prototype.set`, so a snapshot cannot be one.
  - (a) A development warning when a native `Map` or `Set` is placed in a
    store (Vue 10, MobX Q5).
  - (b) Decide before 1.0 whether "a native `Map` in a store is kept by
    reference" is part of the contract. Making it reactive later would
    change what a snapshot holds (Vue 10).
  - (c) Make the live side a subclass of the native class, so that
    `instanceof Map` holds. Immer 9 says it is possible if every inherited
    method is overridden. Svelte 8 says it is not possible as the store
    stands, because a native method rejects the proxy as `this`.
- **Evidence.** Ports in the Vue, Svelte and Immer reports. Stage 2 did not
  try (c). My run (appendix) shows both statements hold: a method that calls
  `super` throws through the store, and a subclass that overrides every
  method and accessor it uses works on the store and on a snapshot.
- **Kind and API.** API design. Today's behaviour is documented: native
  `Map` and `Set` "retain their references", and `instanceof Map` on a
  reactive collection "returns `false`".

#### M39. One membership rule for the reactive collections

- **Problem.** `+0` and `-0` are two members when added and one when
  constructed (stage 1 finding 33). A collection constructed from one object
  in two forms holds it twice, where `add` holds it once (finding 34).
- **Reports.** Valtio V10, Vue 10, Svelte 8.
- **Proposals.** One: the constructors compare as `add` and `set` do, by
  `identityOf`, and every path treats `+0` and `-0` as one, as a native `Set`
  does. Vue Q8 adds a development warning for both forms of one object.
- **Evidence.** Reproduced in three reports. Not sketched.
- **Kind and API.** Bug. Changes documented behaviour:
  `REACTIVE_COLLECTIONS_TUTORIAL.md` says "Primitive members use `Object.is`,
  which distinguishes `0` and `-0`" and advises against relying on it.

#### M40. Collection lookups scan an array

- **Problem.** A lookup among 10,000 entries costs 45 microseconds on the
  live store and 245 to 346 on a snapshot, against 17 nanoseconds in Svelte.
  Stage 2 defect 6.
- **Reports.** Valtio V10, Svelte 8, Immer 9.
- **Proposals.**
  - (a) For a frozen backing array, build a `Map` from identity to index on
    the first lookup and keep it in a `WeakMap` keyed by the array. It cannot
    go stale, because the array cannot change (Valtio V10). This is the
    snapshot side only.
  - (b) An index kept beside the live array. Svelte 8 calls it "a design
    task, not a patch": it has to stay right when history or persist replace
    the array. Valtio V10 rejects Valtio's own live structure for us. The
    stage 2 report leans to looking at native storage behind the live side.
- **Evidence.** Valtio's prototype over real snapshots: 1,000 lookups among
  10,000 members in 0.8 milliseconds with the index built, against 101 for
  numbers and 251 for objects. (b) is not sketched.
- **Kind and API.** Performance. No API change. The reference says "Their
  lookups are linear".

### Types

#### M41. `Snapshot` turns a tuple into an array

- **Problem.** `Snapshot<[string, number]>` comes out as
  `readonly (string | number)[]`. Stage 1 finding 14.
- **Reports.** Valtio V11, Vue 11, Immer 10.
- **Proposals.** One: delete the array branch. The mapped type handles
  arrays, read-only arrays and tuples.
- **Evidence.** Type-checked in three scratch folders with TypeScript 7.0.2,
  one with a control that fails. Not run against the repository's 54 type
  tests.
- **Kind and API.** A bug in the types. It changes a public type: a tuple's
  snapshot becomes more precise.

#### M42. A snapshot of a reactive collection keeps its mutators

- **Problem.** `snapshot(store).todos.set(...)` compiles, and at run time it
  throws the engine's "Attempted to assign to readonly property", which names
  neither the collection nor the cause. Stage 1 finding 16.
- **Reports.** Valtio V10, Vue 11, Immer 8.
- **Proposals.** Agreed: `Snapshot<T>` maps `ReactiveMap` and `ReactiveSet`
  to read-only interfaces, and each mutator throws a named error when called
  on a snapshot. Valtio V10 suggests a general hook that lets any class name
  its own snapshot type. Keep the frozen backing array.
- **Evidence.** The other libraries' types were checked (Vue port 12, Immer
  port 8). Not sketched on ours.
- **Kind and API.** Types and diagnostics. Breaking at the type level only
  for code that calls a mutator on a snapshot, which throws today.

#### M43. The backing arrays of the reactive collections are public

- **Problem.** `_entries` and `_items` are writable members of the published
  `ReactiveMap` and `ReactiveSet` types. Stage 1 finding 15.
- **Reports.** Svelte 8 and Vue 10 note it. Svelte keeps its storage in
  `#private` fields, which is not open to us (M12).
- **Proposals.** None from stage 2.
- **Evidence.** Stage 1's type test.
- **Kind and API.** Types. Both types are exported, so the two names are
  frozen with 1.0 unless they leave the public type first.

### `persist`

#### M44. Options are not validated when `persist()` is called

- **Problem.** A getter named in `properties` is saved, and restoring it
  fails part-way (stage 1 finding 52). A malformed entry is ignored (55). A
  key named `__proto__`, `constructor` or `prototype` in `properties` is the
  one way `persist` can swap the store's prototype (48).
- **Reports.** Security 1, Legend-State (its options table), Zustand and
  Jotai Q8.
- **Proposals.** One pass when `persist()` is called, which throws for a
  prototype key, a getter, a method, or an entry without both `serialize`
  and `deserialize`.
- **Evidence.** The security reproduction. Not sketched.
- **Kind and API.** Hardening. Breaking only for input that is already
  broken. The reference says an explicit list "should contain writable data
  fields".

#### M45. Records `persist` cannot read are skipped without a report

- **Problem.** None of these reaches `onError` or the status: a JSON value
  that is not an envelope; a `state` that is not an object; a version that
  differs when there is no `migrate`; a `migrate` that returns a string, an
  array or a promise. An array as `state` passes the check (stage 1 finding
  53). A version that is not a number counts as 0, so `"2"` is migrated as if
  from 0. Stage 2 defects 14 and 22.
- **Reports.** Security 4 and 5, Zustand and Jotai 3.
- **Proposals.**
  - One function that returns an envelope or a reason, with every reason
    reported through `onError` (security 4).
  - Only a missing version means 0; anything else that is not an integer is
    unreadable (security 5). Zustand and Jotai 3 agrees on "missing means 0".
  - Conflict on the operation name: `'parse'` with a reason (security 4), or
    a new `'migrate'` (Zustand and Jotai 3).
  - Conflict on an `async` `migrate`: await it (Zustand and Jotai 3), or
    reject any result that is not a plain object (security 4).
- **Evidence.** The version case and the `async` case were re-run by the
  orchestrating agent. Not sketched.
- **Kind and API.** Bug and diagnostics. Additive in the types:
  `PersistOperation` may gain a member, and `migrate`'s return type may
  widen. Applications see new `onError` calls.

#### M46. Expiry

- **Problem.** With `expireIn` set, a record with no usable `expiresAt`
  never expires. Separately, `expireIn` and `clearOnExpire` are two options
  for one concept.
- **Reports.** Security 6, Legend-State (its options table).
- **Proposals.** Security 6 leaves it to the owner: count such a record as
  expired, or document that expiry bounds the age of data this application
  wrote. Legend-State suggests looking at a single option with clearing as
  the default.
- **Evidence.** The security reproduction.
- **Kind and API.** Bug, or docs. Merging the two options is breaking. The
  tutorial documents both.

#### M47. A migrated record is not written back

- **Problem.** After a restore that migrates version 1 to 2, the stored
  record still says version 1, so the migration runs on every load until the
  first edit. Stage 2 defect 23.
- **Reports.** Zustand and Jotai 4.
- **Proposals.** Save once after a successful migration.
- **Evidence.** Zustand port 4e, re-run by the orchestrating agent. Two tabs
  that both migrate, with `syncTabs` on, were not run.
- **Kind and API.** Bug. No API change. Storage is first written at load.

#### M48. When hydration happens

- **Problem.** `persist()` reads through an `await` even when the storage is
  synchronous. A store on `localStorage` holds its defaults when `persist()`
  returns and renders them first. Stage 2 defect 18. When a debounced save
  runs relative to a read is pinned and not decided (stage 1 finding 56).
- **Reports.** Legend-State 4.
- **Proposals.** An option such as `hydrate: 'sync' | 'async'`, defaulting
  to today's behaviour, with a `getItem` that returns a non-promise as the
  signal. The report gives the case against: a synchronous restore runs
  `migrate`, the transforms and `merge` in the caller's stack. Decide it
  together with `skipHydration`.
- **Evidence.** Legend-State port P2, re-run: 0 when `persist()` returns, 7
  after `hydrated` resolves. Not sketched.
- **Kind and API.** API design. Additive as an option. Changing the default
  changes documented behaviour: the tutorial says "Hydration is asynchronous
  even with `localStorage`".

#### M49. `storage` is a required option

- **Problem.** `persist(store, {name: 'x'})` is a type error. Zustand and
  Jotai both default to `localStorage`.
- **Reports.** Zustand and Jotai 5.
- **Proposals.** Make `storage` optional, defaulting to a lazily read
  `globalThis.localStorage`, with no persistence and one development warning
  where it is missing. Keep `properties` and the other option names.
- **Evidence.** Reading only.
- **Kind and API.** API design. Additive.

#### M50. A debounced save is lost when the page goes away

- **Problem.** `debounce` has no flush on `pagehide` or `visibilitychange`.
  Stage 2 defect 19.
- **Reports.** Legend-State 5.
- **Proposals.** While a timer is pending, flush on `pagehide` and on
  `visibilitychange` to hidden, and remove the listeners in `dispose()`.
- **Evidence.** Read in the code. No page unload was tested.
- **Kind and API.** Bug. Additive.

#### M51. A deeply nested record bricks the store, and a failed restore is partial

- **Problem.** A record nested 16,000 to 18,000 deep restores without error
  on Bun. After that every snapshot and every save throws, so the record is
  never replaced. Deeper still, the restore fails part-way: earlier fields
  are restored and later ones are not. Stage 2 defect 12, and the partial
  restore of stage 1 finding 52.
- **Reports.** Security 3.
- **Proposals.** Clone every value before assigning any. Then take one
  `snapshot()` inside the same `try`; if it throws, put the fields back and
  report `'parse'`. Document the depth limit. A depth cap is the alternative,
  and any number would depend on the engine.
- **Evidence.** The security reproductions on Bun. Browser limits were not
  measured.
- **Kind and API.** Bug and hardening. No API change.

#### M52. A nested `__proto__` key survives restore

- **Problem.** `JSON.parse` makes `"__proto__"` an ordinary own key. The
  restored object keeps it as data and the next save writes it back. Stage 2
  defect 13.
- **Reports.** Security 2.
- **Proposals.** Drop own `__proto__` keys at every depth when restoring
  from storage or from DevTools, inside the walk `cloneSnapshotValue` already
  does, behind a parameter that only those callers pass. A `JSON.parse`
  reviver does the same and measured about ten times slower.
- **Evidence.** Run by the security agent.
- **Kind and API.** Hardening. No API change.

#### M53. Cross-tab sync

- **Problem.** The handler applies an event from another storage area under
  the same key, and a synthetic event with no `storageArea`. Stage 2 defect
  16. Two tabs that edit different fields overwrite each other's record.
- **Reports.** Security 8, Legend-State 10.
- **Proposals.** When `storage` is a `Storage`, ignore events from another
  area, and document that `syncTabs` listens to `localStorage` events
  whatever the adapter (security 8). Say in the tutorial that concurrent
  edits in two tabs are last writer wins on the whole record (Legend-State
  10).
- **Evidence.** The security reproduction and Legend-State port P4.
- **Kind and API.** Hardening and docs. No API change.

#### M54. Dead and redundant code in `persist.ts`

- **Problem.** Stage 1 finding 54 lists it: an `assertActive()` that cannot
  throw, a cancel-timer block repeated four times, assignments never read,
  and guards whose removal changes nothing.
- **Reports.** Legend-State 6, security 4.
- **Proposals.** Legend-State 6: do not replace the version bookkeeping with
  a restore flag carried by the core; simplify inside `persist.ts`. Security
  4: the single envelope reader of M45 replaces the scattered guards.
- **Evidence.** Stage 1's list of equivalent mutants.
- **Kind and API.** Simplification. No API change.

#### M55. A pause switch and an in-flight flag

- **Problem.** There is no way to pause saving without disposing the handle,
  and no "a write is in flight" signal.
- **Reports.** Legend-State 9.
- **Proposals.** Reject for now. `pause()` and `resume()`, or an `isSaving`
  field in `PersistStatus`, can be added later without breaking anyone.
- **Evidence.** Reading only.
- **Kind and API.** API design. Additive, whenever it is done.

### `devtools`

#### M56. Time travel is not a faithful restore

- **Problem.** A jump assigns each key of the parsed state in turn. Unknown
  fields are added, missing ones are never deleted, a setter-only accessor is
  called, nested values keep `__proto__` keys, a `Date` comes back as a
  string, and a sync subscriber is notified once per field. Stage 2 defect
  15.
- **Reports.** Security 7, Zustand and Jotai 7.
- **Proposals.** Apply the state with the function `withHistory` uses: only
  keys that are data on the store, delete data fields the state lacks, clone
  with the strip of M52, and skip every accessor (security 7). Wrap the jump
  in `batch()`, and keep a current value that JSON cannot carry, such as a
  `Date` (Zustand and Jotai 7).
- **Evidence.** The security reproduction, and Zustand port 5 through a fake
  extension.
- **Kind and API.** Bug and hardening. No API change.

#### M57. `devtools`: action names, messages, options and `enabled`

- **Problem.** Every entry is named `STORE_UPDATE`. `RESET`, `COMMIT`,
  `ROLLBACK` and `IMPORT_STATE` are ignored. Only `name` reaches the
  extension's `connect()`. `enabled` defaults to `true` everywhere. The
  payload is the snapshot, so every getter is run and sent (M33).
- **Reports.** Valtio V9, Zustand and Jotai 6 and 7, security 7.
- **Proposals.**
  - Name an entry after the outermost store method, through a small hook in
    `transactional()` (Valtio V9, Zustand and Jotai 6). The latter adds:
    send on the synchronous channel, one entry per outermost transaction.
  - Handle `RESET`, `COMMIT` and `ROLLBACK`, and pass the remaining options
    to `connect()` (Valtio V9, Zustand and Jotai 7).
  - Conflict on `enabled`. Require it, or default it from
    `process.env.NODE_ENV` (Valtio V9). Tie it to the environment, or leave
    it (Zustand and Jotai 7). Keep `true`, because the library has no
    portable way to detect production, and document that the extension
    receives every state (security 7).
- **Evidence.** Valtio V9 was read only. Zustand port 5 was run.
- **Kind and API.** API design. Changing the default of `enabled` is
  breaking and documented (the options table in `DEVTOOLS_TUTORIAL.md`). The
  rest is additive. The action-name hook sits on the method-call path of the
  core.

### `history` and `subscribeKey`

#### M58. An edit made in the same tick as `undo()` or `redo()` is not recorded

- **Problem.** After `history.undo(); store.value = 9;` with no flush
  between, `canRedo` stays true and `redo()` discards the 9. The `restoring`
  counter causes it and may be redundant: removing it leaves every other test
  green. Stage 1 findings 57 and 58, and the `history.ts` items of 59.
- **Reports.** None. Zustand and Jotai have no history.
- **Proposals.** None from stage 2.
- **Evidence.** Pinned in `history.sameTick.test.ts`.
- **Kind and API.** Bug. No stage 2 counterpart.

#### M59. `withHistory` treats a function held in an own field as behaviour

- **Problem.** Undo neither removes a function that was added nor restores
  one that was replaced. Stage 1 finding 60.
- **Reports.** None.
- **Proposals.** None from stage 2. It should be decided with M1, which
  makes some stored functions plain data.
- **Evidence.** Pinned by a stage 1 test.
- **Kind and API.** API design. No stage 2 counterpart.

#### M60. Undo replaces every row of a changed list

- **Problem.** `withHistory` restores by top-level key and replaces a
  changed branch with a deep clone. After undoing an edit to one row of
  three, every row is a new object, every row component renders again, and a
  row proxy held by the caller is detached.
- **Reports.** Solid 11. Security 7 wants `devtools` to use the same apply
  function (M56).
- **Proposals.** A recursive apply: go down while both sides are containers
  of the same kind, and write only the leaves that differ. Matching reordered
  rows by key could follow.
- **Evidence.** Solid port 10. Not sketched.
- **Kind and API.** Performance. Solid 11 says it can follow 1.0 unless a
  public `reconcile` is wanted. The reference says "changed fields are
  replaced with mutable copies".

#### M61. `subscribeKey` takes a snapshot of the whole store on every notification

- **Problem.** With `subscribeKey(store, 'count', …, {sync: true})` on a
  store with 1,000 rows, each row write costs 122 microseconds, against 1.0
  for a plain sync subscriber.
- **Reports.** Valtio V8.
- **Proposals.** Read the live value. If it is a store node, compare the
  node and its version, and take a snapshot of that node only when one of
  them changed; otherwise compare with `Object.is`. A key that is a getter
  keeps today's path.
- **Evidence.** Valtio's timing. Not sketched.
- **Kind and API.** Performance. No API change: the callback still receives
  snapshot values.

#### M62. `subscribeKey` takes a top-level key only

- **Problem.** It cannot watch a derived value or a nested field, and it has
  no equality option and no immediate first call.
- **Reports.** Zustand and Jotai 8.
- **Proposals.** Accept a selector as well as a key, with `equalityFn` and
  `fireImmediately`. Say in the reference that the callback of `subscribe`
  receives no arguments, since a Zustand user expects `(state, prev)`.
- **Evidence.** Zustand port 6b.
- **Kind and API.** API design. Additive if the key form stays. The name of
  the equality option should follow M71.

### Adapters

#### M63. Every adapter builds a snapshot on each sync notification

- **Problem.** A sync subscriber is notified once per direct write, and each
  adapter takes a snapshot in its listener. A loop of 2,000 direct row writes
  takes 626 to 764 milliseconds with any adapter attached, against 1 to 3
  with none. Stage 2 defect 8.
- **Reports.** Adapters A1. Immer 1 sets the floor (M35).
- **Proposals.** Build the snapshot at the read where the framework allows
  it: a `customRef` in Vue, a version signal read by a `computed` in Angular,
  the same with `createMemo` in Solid. React and Svelte must hand the value
  over when notified, so for them it is M35, and naming `batch()` beside the
  sync timing in each guide. Adapters Q8 adds a development warning when a
  sync listener sees many notifications in one task.
- **Evidence.** Measured: 2.2 milliseconds with the Vue sketch, 8.2 with the
  Angular sketch including the read, and 2.0 to 2.6 with the writes inside
  `batch()`. The Solid form was not measured.
- **Kind and API.** Performance. No API change. The timing tests in each
  adapter suite pin when the value is current.

#### M64. The Vue adapter leaks one subscription per server render

- **Problem.** Vue does not dispose component scopes during a server render,
  so a module-level store gains one listener per request, and each one builds
  a snapshot on every later write. Stage 2 defect 9.
- **Reports.** Adapters V1.
- **Proposals.** Subscribe in `onMounted` when called inside a component
  that is not mounted, and at once otherwise. Refresh the value once on
  subscribe. Say in `VUE.md` what a server render does.
- **Evidence.** A sketch run on the server (0 listeners after three renders)
  and on the client.
- **Kind and API.** Bug. No API change.

#### M65. The Vue adapter returns a writable ref

- **Problem.** `state.value = {count: 99}` compiles and runs: the ref shows
  99 while the store holds 0. Stage 1 finding 17.
- **Reports.** Adapters V2, Vue 11.
- **Proposals.** Type it `Readonly<Ref<Snapshot<T>>>` (adapters V2). Vue 11
  names `Readonly<ShallowRef<T>>`, which adapters V2 calls more exact but
  did not check against Vue 3.2.0, the floor of the peer range. A runtime
  `readonly()` in development is optional.
- **Evidence.** Adapters V2 checked the `Ref` form with `tsc` against
  `unref`, `toValue`, `watch` and `computed`.
- **Kind and API.** Types. It changes a documented return type: the
  reference says "Vue returns a `Ref<Snapshot<T>>`". Breaking only for code
  that writes the ref.

#### M66. The Angular adapter drops a store write made inside a `computed`

- **Problem.** The listener calls `signal.set()` in a reactive context.
  Angular throws, the core logs it, and the signal stays stale until the next
  write. Stage 2 defect 10.
- **Reports.** Adapters N1.
- **Proposals.** `untracked(() => state.set(...))`.
- **Evidence.** Run, with a bare signal and with a sketch adapter.
- **Kind and API.** Bug. No API change.

#### M67. The Angular adapter has no `injector` option

- **Problem.** Called from `ngOnInit` or an event handler, the error is
  Angular's NG0203 and names `DestroyRef`, not our function. The only way
  round is `runInInjectionContext`. Stage 2 defect 11.
- **Reports.** Adapters N2.
- **Proposals.** `injectClassyStore(store, {injector?})`, an assertion that
  names the caller when no injector is given, as `toSignal` has, and the
  package prefix on the message.
- **Evidence.** Both messages were verified, and a sketch run.
- **Kind and API.** API design and diagnostics. Additive. It settles the
  signature, which is documented as `injectClassyStore(store)`.

#### M68. Adapter and entry names

- **Problem.** API question 7. Names follow each framework's idiom except
  in Solid, where `use*` means a context lookup.
- **Reports.** Adapters Q7, and question 7 in the Solid, Svelte, Vue and
  Zustand and Jotai reports.
- **Proposals.** Keep the entry points. Rename the Solid adapter to
  `fromClassyStore`, after Solid 2's `from()`, which it reproduces (adapters
  Q7). Keep `useClassyStore` for React and Vue, `toSvelteStore` and
  `injectClassyStore`.
- **Conflict, a mild one.** The Solid report does not ask for a rename. It
  says `useClassyStore` returns an accessor, "which is what a Solid user
  expects to get", and calls its naming observations "none strong".
- **Evidence.** Adapters O1 verified that the adapter matches
  `createMemo(() => from(subscribe))` in values, timing and cleanup.
- **Kind and API.** API design. The rename is breaking and documented.

#### M69. Svelte 5 runes

- **Problem.** `$snap` is a compile error in a `.svelte.ts` module, where
  Svelte 5 users keep shared logic.
- **Reports.** Adapters S2.
- **Proposals.** Keep `toSvelteStore`, the only shape that works on Svelte 4
  and 5, and document `fromStore(toSvelteStore(store))` for runes modules. A
  rune-native helper built on `createSubscriber` needs a separate entry or
  dropping Svelte 4. It would also avoid M63 for Svelte.
- **Evidence.** Both bindings were run.
- **Kind and API.** Docs now. A new entry later would be additive.

#### M70. React hydration needs `prepareStoreForHydration`

- **Problem.** A store written between the server render and hydration, for
  example by a `persist` restore, raises React's hydration error unless
  `prepareStoreForHydration` was called. Zustand needs no call. Stage 2
  defect 21.
- **Reports.** Zustand and Jotai 1, and its names table.
- **Proposals.** Capture the initial snapshot without being asked: in
  `createClassyStore`, or lazily just before the first write. Keep
  `prepareStoreForHydration` for a store that was changed before it reached
  React. The report names two risks: a retained snapshot keeps old objects
  alive, and a write through a raw reference bypasses a first-write hook.
- **Evidence.** Zustand port 3 in happy-dom, not a browser. Neither variant
  is prototyped.
- **Kind and API.** API design. Not breaking. It changes documented
  behaviour ("Client-only apps need no preparation") and moves hydration
  state from the React folder into the core.

#### M71. The equality option is called `isEqual`

- **Problem.** Zustand and Jotai name every equivalent `equalityFn`.
- **Reports.** Zustand and Jotai 2.
- **Proposals.** Rename the option to `equalityFn`. Keep `shallowEqual` and
  the hook with no selector, which the report calls the best of the three.
- **Evidence.** Zustand port 1 for the hook's behaviour. The name is
  reading.
- **Kind and API.** API design. Breaking and documented
  (`UseClassyStoreSelectorOptions`).

### Diagnostics and a development build

#### M72. How a development build is split, and its rules

- **Problem.** There is one build with no development branch, and nothing in
  the source reads `NODE_ENV`. Every silent failure stays silent. API
  question 8.
- **Reports.** MobX 7, Solid 8 and 9, Svelte 11, and question 8 in the
  Signals, Vue, Valtio, Legend-State, Immer and Zustand and Jotai reports.
- **Proposals.**
  - The mechanism. (a) Export conditions and a build-time flag. Production
    stays byte for byte what it is. It costs a second build per format, and
    diagnostics are invisible wherever `development` is not set (Solid 9
    prefers it; Svelte does it). (b) `process.env.NODE_ENV !== 'production'`
    guards in one build, removed by the consumer's bundler. One artifact,
    and diagnostics are on by default in tests and scripts. The bytes stay
    for a consumer whose bundler does not replace the expression (MobX,
    Legend-State, Immer and Zustand work this way). Svelte 11 says that what
    it proposes is cheap enough to need neither.
  - Conflict on what development may do. Keep every thrown error and its
    text the same in both builds, and only warn in development (MobX 7,
    Signals Q8). Against that, Immer 4 proposes an error thrown in
    development only.
  - Codes. One stable string code per diagnostic, a `[CODE]` prefix, and a
    warning once per object and key (Solid 8, Svelte 11). MobX 7 says
    numbered codes are not worth having at our size.
- **Evidence.** Solid 9 verified which build Node resolves. No size was
  measured for either shape, and no bundler other than Node was checked.
- **Kind and API.** Diagnostics. Not breaking. (a) adds export conditions to
  `package.json`. (b) needs the size script to measure with the replacement
  applied.

#### M73. Which diagnostics

- **Problem.** The reports name sixteen candidates and four tools. Each
  serves an entry above.
- **Reports and proposals.**

  | Diagnostic                                                                       | Proposed by                                          | Serves        |
  | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
  | A class instance without `PROXYABLE` placed in a store                           | Vue Q8                                               | M11           |
  | A native `Map` or `Set` placed in a store                                        | Vue 10, MobX Q5                                      | M38           |
  | An own arrow-function field on a class instance, at creation                     | MobX 8                                               | M12           |
  | A write that went around the proxy, found per call                               | Solid 8                                              | M12           |
  | A write inside a getter                                                          | MobX 6, Solid 8, Signals 7; Svelte 11 wants an error | M26           |
  | A delivery loop that does not settle                                             | MobX 5, Svelte 11, Vue 9, Signals 8                  | M28           |
  | `batch()` was given a promise                                                    | Legend-State 3, Solid 8                              | M30           |
  | Many sync notifications in one task                                              | Adapters Q8                                          | M32, M63      |
  | A write outside a transaction to an observed store, opt-in                       | MobX 6                                               | M32           |
  | A getter that recorded no dependency, opt-in                                     | MobX Q8                                              | M21           |
  | A named property written to an array                                             | Immer 4                                              | M37           |
  | Both forms of one object in a collection                                         | Vue Q8                                               | M39           |
  | A mutator called on a snapshot of a collection: a named error in every build     | Valtio V10, Immer 8                                  | M42           |
  | `persist`: an unreadable record, a bad `properties` entry: errors in every build | Security Q8, Zustand and Jotai Q8                    | M44, M45      |
  | `syncTabs` with an adapter that is not `localStorage`                            | Security Q8                                          | M53           |
  | A malformed DevTools message, or a key the store does not have                   | Security Q8                                          | M56           |
  | Tool: a supported way to count listeners in tests                                | MobX Q8, adapters (its stage 1 table)                | Test suites   |
  | Tool: the paths a component tracked, through `useDebugValue`                     | Valtio Q8                                            | React binding |
  | Tool: hooks that say which write caused a notification or a recompute            | Vue Q8                                               | Core          |
  | Tool: one replaceable function for reporting a subscriber's error                | Legend-State 1                                       | M28           |

- **Evidence.** None is sketched.
- **Kind and API.** Diagnostics. The four tools would be new public or
  half-public surface. Everything marked "in every build" does not need M72.

### Security and the release workflow

#### M74. The release job gives every installed dependency the npm publishing identity

- **Problem.** One job holds `id-token: write`, then runs `bun install`, the
  build and Changesets before `npm publish`. Actions are pinned by major
  tag. Stage 2 defect 17.
- **Reports.** Security 12.
- **Proposals.** Six steps: a publish-only job that holds the token and
  installs nothing; a GitHub environment with the owner as required
  reviewer; actions pinned by commit; `persist-credentials: false` where
  nothing is pushed; `permissions: contents: read` on the three workflows
  that declare none; npm set to refuse publishing with a token. The
  environment and the npm settings are outside the repository and only the
  owner can do them.
- **Evidence.** `release.yml` was read by the security agent and by the
  orchestrating agent. That code in the job can take the token comes from
  how GitHub and npm document the mechanism; nobody tried it.
- **Kind and API.** Hardening. No library code.

#### M75. Dependencies and the published tarball

- **Problem.** `proxy-compare` 3.0.1 is the one runtime dependency, with one
  maintainer, and is pinned exactly. `bun audit` reports 17 advisories in
  development dependencies, none of which reaches the tarball.
- **Reports.** Security 10, 11 and 13.
- **Proposals.** Keep the exact pin and say why in `CONTRIBUTING.md`. Update
  within ranges at the next dependency refresh, and add a `bun audit` step
  that reports without failing. Accept the tarball as it is.
- **Evidence.** Registry metadata, `bun audit`, and a listing of the packed
  0.11.0 tarball.
- **Kind and API.** Hardening and docs. Nothing a consumer sees.

### Documentation only

#### M76. Documentation changes that no report disputes

- **Problem.** Limits and defaults that the docs do not state.
- **Reports and proposals.**
  - "Frozen objects are values" needs the whole value frozen. The mutable
    contents of a shallowly frozen object are shared with every snapshot
    (Immer 7).
  - An unmarked class instance is shared between the store and every
    snapshot (Valtio V12).
  - A `#private` field is never state (Svelte 1, MobX 8, Vue Q4).
  - The object passed to `createClassyStore` is the store. A Solid user
    expects it to stay untouched, so say it in the Solid guide (Solid 12).
  - `subscribe()` is batched by default, and its callback receives no
    arguments. Say both at the top of the reference (Zustand and Jotai Q1
    and 8).
  - Name `batch()` beside the sync timing in each adapter guide (adapters
    A1).
  - The Svelte guide names its store `state`, which conflicts with the
    `$state` rune. Rename it `snap` (adapters S1).
  - `persist`: recipes for AsyncStorage, IndexedDB and an encrypting wrapper
    (Legend-State 7); a transform each for `Date`, `Map` and `Set`
    (Legend-State 8); unknown stored keys are ignored and removed at the
    next save (Legend-State 11); stored data is untrusted input and `merge`
    is the place to validate it (security 9); a record with no version
    counts as version 0 (Zustand and Jotai 3).
  - `devtools`: the extension receives every state, so secrets do not belong
    in a store with DevTools enabled outside development (security 7).
- **Evidence.** Each is read from a report. I did not check each against the
  tutorials.
- **Kind and API.** Docs.

#### M77. Limits that other libraries share, with no proposal

- **Problem.** Stage 1 findings that the reports confirm and do not propose
  to change.
- **Reports and proposals.**
  - A write through the raw object is invisible until the next proxied write
    to that node (stage 1 finding 11). Valtio, Vue and Solid are the same.
    The tutorial documents it.
  - A subscription follows the object, not the property (26). The reference
    documents it. MobX's `observe` and Valtio do the same.
  - An object returned by a getter is not protected (40). MobX, Vue, Svelte
    and the signal libraries are the same. The reference documents it.
  - `Object.getOwnPropertyDescriptor(store, key).value` is the raw object
    (50). Vue, Solid and Immer are the same.
  - `structuredClone(store)` throws (51). Vue and Solid are the same.
  - A write past the end of a typed-array store notifies and stores nothing
    (63). Vue, Solid and Svelte leave a typed array unwrapped; our root is
    always wrapped.
- **Evidence.** The tables of stage 1 counterparts in each report.
- **Kind and API.** Docs, or "unspecified" in the decision document's list
  of pinned behaviour.

## All 73 stage 1 findings

"None" means no stage 2 report has a counterpart. A second entry in brackets
is one the finding bears on without being its subject.

| Stage 1 | What it is                                                                | Entry                                                                                    |
| ------: | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
|       1 | `Object.defineProperty` on a store is silent                              | M2                                                                                       |
|       2 | A snapshot after one row changed costs time per row                       | M35 (M63)                                                                                |
|       3 | A getter that sums 1,000 rows costs 200 nanoseconds per row to recompute  | M20 (M10)                                                                                |
|       4 | Two traps of the React snapshot cache cannot be reached                   | None                                                                                     |
|       5 | A function read from an array is a new wrapper on every read              | M1                                                                                       |
|       6 | A class held in a store comes back as a bound wrapper                     | M1                                                                                       |
|       7 | `list.includes(raw)` misses an object that is in the list                 | M5 (M6, M10)                                                                             |
|       8 | A store that refers to itself can be written but not read                 | M36                                                                                      |
|       9 | A store placed in another store by its raw object is not connected        | M6                                                                                       |
|      10 | Raw objects end up holding proxies                                        | M6                                                                                       |
|      11 | A write through the raw object is invisible until the next proxied write  | M77 (M17, M18)                                                                           |
|      12 | A native `Set` or `Map` in a store holds raw members                      | M38                                                                                      |
|      13 | A getter on a self-referring store recomputes on every write              | M36, which has no proposal for it                                                        |
|      14 | `Snapshot` turns a tuple into an array                                    | M41                                                                                      |
|      15 | The backing arrays of the reactive collections are public                 | M43                                                                                      |
|      16 | A snapshot of a reactive collection keeps its mutators in the type        | M42                                                                                      |
|      17 | The Vue adapter returns a writable ref                                    | M65                                                                                      |
|      18 | A sync subscriber that writes recurses until the stack overflows          | M28                                                                                      |
|      19 | A batched subscriber that writes is served again with no bound            | M28                                                                                      |
|      20 | A subscriber removed during delivery is still called once                 | M28                                                                                      |
|      21 | A subscriber added after a write sometimes hears that write               | M28                                                                                      |
|      22 | A re-entrant write delivers the same snapshot twice                       | M28                                                                                      |
|      23 | A subscriber that returns a rejected promise is not reported              | M28, which has no proposal for it                                                        |
|      24 | Owners are notified level by level, not from the inside out               | M16                                                                                      |
|      25 | A raw object changed while out of the store shows old content when back   | M17                                                                                      |
|      26 | A subscription follows the object, not the property                       | M77                                                                                      |
|      27 | Four things keep memory alive longer than expected                        | M15                                                                                      |
|      28 | Suspending a detached subtree has no public effect (corrected by 72)      | M14                                                                                      |
|      29 | A delete that removes nothing counts as a write                           | M4                                                                                       |
|      30 | A live getter that reads `Object.keys(this)` or `in` goes stale           | M3                                                                                       |
|      31 | The same getter on a snapshot sees no keys at all                         | M34 (M33)                                                                                |
|      32 | A live getter that reads a missing property is recomputed on every read   | M23                                                                                      |
|      33 | `+0` and `-0` are two members when added and one when constructed         | M39                                                                                      |
|      34 | A collection constructed from one object in two forms holds it twice      | M39 (M6)                                                                                 |
|      35 | A snapshot given as a map key is stored frozen, yet answers for the row   | None. No report looks at it; it sits beside M39                                          |
|      36 | A getter misses some of what it reads, and stays stale                    | M21 for another node; M22 for a caught error                                             |
|      37 | The snapshot getter layer loses nested memoization                        | M24                                                                                      |
|      38 | A getter cycle on a snapshot overflows the stack                          | M25                                                                                      |
|      39 | A getter that writes behaves differently on each layer                    | M26                                                                                      |
|      40 | An object returned by a getter is not protected                           | M77                                                                                      |
|      41 | Inside a snapshot getter, `this` is a tracking proxy over an empty object | M34                                                                                      |
|      42 | `constructor` read through a store is a bound wrapper                     | M1                                                                                       |
|      43 | A setter is not a transaction                                             | M29                                                                                      |
|      44 | A redefined getter keeps the old result                                   | M2, which has no proposal for it (M9 assumes it stays unhandled)                         |
|      45 | `Object.defineProperty` breaks more than notification                     | M2                                                                                       |
|      46 | Freezing a raw object behind the store makes reads throw                  | M7                                                                                       |
|      47 | A cached getter survives a prototype change                               | M8 (M9)                                                                                  |
|      48 | `Object.assign` with a parsed `__proto__` key swaps the prototype         | M8; settled for `persist` by security 1 (M44)                                            |
|      49 | Snapshots can be incomplete or mutable at the edges                       | M37; the read-only field is M7                                                           |
|      50 | A descriptor's `value` is the raw object                                  | M77                                                                                      |
|      51 | `structuredClone(store)` throws                                           | M77                                                                                      |
|      52 | A getter named in `properties` is saved, and restoring fails part-way     | M44, M51                                                                                 |
|      53 | An array as the stored `state` passes the envelope check                  | M45                                                                                      |
|      54 | Dead or redundant code in `persist.ts`                                    | M54                                                                                      |
|      55 | A malformed entry in `properties` is ignored without an error             | M44                                                                                      |
|      56 | When a debounced save runs relative to a read                             | M48 (M50)                                                                                |
|      57 | An edit made in the same tick as `undo()` or `redo()` is not recorded     | M58, which has no stage 2 counterpart                                                    |
|      58 | The `restoring` counter in `history.ts` may be redundant                  | M58, which has no stage 2 counterpart                                                    |
|      59 | Dead or redundant code in `equality.ts`, `history.ts`, `collections.ts`   | None. It is for stage 3's own code review; the `history.ts` items sit with M58           |
|      60 | `withHistory` treats a function in an own field as behaviour              | M59, which has no stage 2 counterpart                                                    |
|      61 | The `defineProperty` trap does not resume a suspended subtree             | M14, M2                                                                                  |
|      62 | A store made from a function is not treated as a store by other stores    | M1                                                                                       |
|      63 | A write past the end of a typed-array store notifies and stores nothing   | M77                                                                                      |
|      64 | Dead or redundant code in `core.ts`                                       | First item: M22 makes it reachable. Third item: M14. Second item (`activeTracker`): none |
|      65 | Five mutants in `core.ts` are caught only through finding 61              | M14                                                                                      |
|      66 | A read that never returns                                                 | M14, M2                                                                                  |
|      67 | The same cause in a milder form: a snapshot stale once                    | M14, M2                                                                                  |
|      68 | Without `WeakRef`, a held row keeps its removed list alive                | M14                                                                                      |
|      69 | The order in which owners are notified depends on hidden state            | M16                                                                                      |
|      70 | A snapshot lists every data field before any own getter                   | M33                                                                                      |
|      71 | An array element redefined to a primitive disagrees with its snapshot     | M2                                                                                       |
|      72 | What suspending and resuming a detached subtree can be seen to do         | M14                                                                                      |
|      73 | Dead or redundant code in `ownership.ts` and `snapshot.ts`                | `ownership.ts`: M14. `snapshot.ts`: none                                                 |

## Every stage 2 finding

One table per report. "No change proposed" marks a finding whose report asks
for nothing, usually because ours is already the better behaviour.

### `valtio.md`

| Finding  | What it says                                                                                                                                                                                        | Entry              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| V1       | Valtio has no weak links, no suspend and resume, no detached-parent pointer, and returns from the read that hangs ours. Remove the pointer and the walk; choose one mechanism against retained rows | M14                |
| V1 (new) | A subscription on a container that left the store stops after a garbage collection                                                                                                                  | M15                |
| V2       | A stored function is returned as it is. Wrap only what is found on a prototype; a class is data                                                                                                     | M1                 |
| V3       | A cycle can be snapshotted: return the unfinished snapshot for a repeat visit, or throw at the write                                                                                                | M36                |
| V4       | Snapshot getters stay on the prototype. One derived prototype per class with non-enumerable memoizing accessors                                                                                     | M33                |
| V5       | `this` in a snapshot getter: proxy the frozen snapshot with `get`, `has`, `ownKeys`; add `has` and `ownKeys` to the store                                                                           | M3, M34            |
| V6       | A flag per subscription fixes finding 20; queue listeners, not nodes, for 21. Keep our error isolation                                                                                              | M28                |
| V7       | Reject a `sync` option on hooks; run a setter inside a transaction                                                                                                                                  | M29, M31           |
| V8       | `subscribeKey` snapshots the whole store per notification: 122 microseconds per row write against 1.0. Compare the live value and node version                                                      | M61                |
| V9       | `devtools`: `enabled` default, options passed to `connect`, action names from the method, `COMMIT`                                                                                                  | M57                |
| V10      | Collections: per-snapshot index for lookups, one membership rule, a snapshot type without mutators and a named error                                                                                | M40, M39, M42      |
| V11      | `Snapshot` turns a tuple into an array; delete the array branch                                                                                                                                     | M41                |
| V12      | Keep opt-in and frozen snapshots; a `ref()`-like marker can follow 1.0; document that an unmarked class instance is shared with every snapshot                                                      | M11                |
| V13      | Keep: the registry of tracking proxies, the work list at creation, `createClassyStore(store) === store`, a throwing getter or subscriber does not poison                                            | no change proposed |
| Q8       | Show the paths a component tracked through `useDebugValue`                                                                                                                                          | M73                |

### `mobx.md`

| Finding | What it says                                                                                                                                                                 | Entry                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1       | A getter records only reads on its own node. Record a dependency on the version of any other node read, once per node per run                                                | M21                    |
| 2       | An inner getter that throws leaves no dependency. Record it in a `finally`; caching the error with its dependencies is optional                                              | M22                    |
| 3       | Every read re-walks the dependency lists. Step 1: validate a nested getter by reading it and comparing the value. Step 2: a module-level write counter stamped on each entry | M18                    |
| 4       | A setter is not a transaction; wrap the accessor branch of the `set` trap                                                                                                    | M29                    |
| 5       | Delivery: one loop, 100 rounds, check registration at the call, each subscription keeps the version it last saw                                                              | M28                    |
| 6       | MobX warns on a write outside an action. For us: opt-in development check, and an always-on development warning for a write inside a getter                                  | M32, M26               |
| 7       | A development build: one constant resolved once; warn only; thrown errors the same in both builds; no numbered codes                                                         | M72                    |
| 8       | Arrow methods and `#private` work when the proxy exists before fields are initialised: a base class whose constructor returns the proxy. Or a development warning            | M12                    |
| 9       | Functions as data: cache wrappers per function, never wrap `constructor`, treat a frozen function as a value                                                                 | M1                     |
| 10      | `has` and `ownKeys` traps with a key counter; a read of a missing key records that it was missing; data descriptor as a write; consider refusing `Object.freeze(store)`      | M3, M23, M2, M2        |
| 11a     | A delete that removes nothing: check `Object.hasOwn` first                                                                                                                   | M4                     |
| 11b     | A getter cycle on a snapshot: a marker per snapshot and key, and the live layer's message                                                                                    | M25                    |
| 12      | Reject: dropping an unobserved getter's cache, copying plain objects in, annotations, subclass rules. Per-prototype work supports the descriptor cache                       | no change proposed; M9 |
| Q5      | A development warning when a native `Map` or `Set` is assigned into a store                                                                                                  | M38, M73               |
| Q8      | Opt-in warning for a getter that recorded no dependency; an error for an in-place `sort` inside a getter; a supported way to count listeners in tests                        | M73                    |

### `vue-reactivity.md`

| Finding | What it says                                                                                                                                                                            | Entry              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1       | `has` and `ownKeys` traps with two new dependency kinds; the snapshot tracker targets the frozen snapshot. Sketch A fixed 29 and 30 live; on a snapshot it is tied to API question 3    | M3, M34, M33       |
| 2       | `includes`, `indexOf`, `lastIndexOf` should compare by `identityOf`                                                                                                                     | M5                 |
| 3       | Store raw values on write and find a node by the raw object. Sketch B fixed 5, 6, 7, 9, 10 and 42 with finding 4                                                                        | M6                 |
| 4       | A function is a value unless it is a method: return array elements, `constructor` and classes as they are                                                                               | M1                 |
| 5       | A delete that removes nothing: check `Object.hasOwn` first                                                                                                                              | M4                 |
| 6       | After any define the store must agree with the target: a data define is a write, an accessor define removes the child                                                                   | M2                 |
| 7       | Run read-only array methods on the raw array and hand out proxies. Not sketched; gain expected from Vue's numbers                                                                       | M10                |
| 8       | Record a nested getter before it runs; record whether a key was present; record another node's version; the snapshot cycle should throw the live message                                | M22, M23, M21, M25 |
| 9       | Skip a removed listener; for re-entry either skip a running listener or count depth and throw; a bound in development                                                                   | M28                |
| 10      | Keep `reactiveMap` and `reactiveSet`; `+0` and `-0` one member; constructors remove duplicates by identity; warn on a native collection; decide whether "kept by reference" is contract | M38, M39, M73      |
| 11      | Drop the array case from `Snapshot`; snapshot types of collections without mutators; type the Vue ref `Readonly<ShallowRef<T>>`                                                         | M41, M42, M65      |
| Keep    | Freezing through the proxy, a read-only property that holds an object, sealed objects stay reactive, transactions, the prototype setter check, the cycle message                        | no change proposed |
| Q6      | Opt-out would need a marker kept in a `WeakSet`, and fails on snapshots of classes with `#private` fields                                                                               | M11                |
| Q8      | Warn for a class instance without `PROXYABLE` and for both forms of one object in a collection; `onTrack` and `onTrigger`-style hooks                                                   | M73                |

### `solid.md`

| Finding  | What it says                                                                                                                                                                                         | Entry                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1        | Solid has no per-prototype getter cache. One shaped for us (own key by `hasOwnProperty` and an own-accessor flag, inherited key from a table per prototype) cut a field read 18% on Node, 53% on Bun | M9                      |
| 2        | Solid's class getters go stale over nested data. Keep ours                                                                                                                                           | no change proposed      |
| 3        | Functions are never wrapped. Wrap inherited functions and own functions of non-array objects; return array elements, classes and `constructor` untouched                                             | M1                      |
| 4        | Class instances wrap by default. Adopt the default, cache the verdict per prototype, keep freezing and one marker as ways out                                                                        | M11                     |
| 5        | The proxy target is an empty shell. Reject for 1.0; document that the raw object must not be frozen or redefined behind the store                                                                    | M7                      |
| 6        | `has`, `ownKeys` and descriptor reads tracked; on the snapshot tracker add `has`, `ownKeys`, `getOwnPropertyDescriptor`, `getPrototypeOf`                                                            | M3, M34                 |
| 7        | `defineProperty` follows the steps of `set`: resume first, link or detach, drop the cached method, notify; silent when nothing a snapshot shows changed                                              | M2                      |
| 8        | Diagnostics with a `[CODE]` prefix, once per object and key. Candidates: `batch()` got a promise, a write around the proxy, a write inside a getter, a subscriber that keeps writing                 | M72, M73, M30, M12, M26 |
| 9        | Splitting the build: A, export conditions and a build-time flag; B, `NODE_ENV` guards in one build. Prefers A                                                                                        | M72                     |
| 10       | Reject Solid's unfrozen `snapshot`; take cycle handling: a map from target to the snapshot under construction                                                                                        | M36                     |
| 11       | `reconcile`: after one undo every row is a new object. A recursive apply in the utilities that writes only leaves that differ                                                                        | M60                     |
| 12       | Reject copy-on-write; a paragraph in the Solid guide that the object passed in is the store                                                                                                          | M76                     |
| Table 48 | Solid ignores `__proto__` as a written key and refuses `setPrototypeOf`                                                                                                                              | M8                      |
| Q7       | `snapshot` means two things to a Solid user; a Solid user expects per-property updates                                                                                                               | M68                     |

### `svelte.md`

| Finding | What it says                                                                                                                                                                                | Entry              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1       | A class instance is never wrapped. For us: an optional base class whose constructor returns the store; document that a `#private` field is never state                                      | M12                |
| 2       | A `defineProperty` with a plain value is a write. Spike, 24 lines added and 9 removed, fixed 1, 45, 66 and 71. Do not refuse other descriptors                                              | M2                 |
| 3       | A function is returned as it is; same proposal as Vue 4                                                                                                                                     | M1                 |
| 4       | Adopt Vue's split for `has` and `ownKeys`; do not track descriptor reads; a `present` flag on a value dependency fixes finding 32 in 7 lines                                                | M3, M23            |
| 5       | A delete of a missing key is no write. Spiked                                                                                                                                               | M4                 |
| 6       | Svelte only warns for `includes(raw)`. Reject that, adopt Vue's fix                                                                                                                         | M5                 |
| 7       | Keep "frozen objects are values". Consider a 9-line guard in `get` for a raw object frozen behind the store; it is free only while `get` looks the descriptor up                            | M7                 |
| 8       | Keep array-backed collections; native equality at the edges; consider an index beside the array (17 nanoseconds against 45 microseconds); backing arrays are public                         | M38, M39, M40, M43 |
| 9       | A cycle is not an error. Spike, 13 lines added and 9 removed, snapshots cycles; `persist`, `devtools`, `withHistory` and tracked reads not tried. Or throw at the write                     | M36                |
| 10      | Wrap a setter in a transaction (spiked, 6 lines). Reject opt-in memoization                                                                                                                 | M29                |
| 11      | A bound on delivery with a named error in every build; an error for a write while a getter computes; stable codes; export conditions only if checks get slow                                | M28, M26, M72, M73 |
| Keep    | One proxy per object, the raw object stays current, frozen values, identity in collections, snapshots of class instances, bound methods, memoized getters, null-prototype objects are state | no change proposed |

### `signals.md`

| Finding | What it says                                                                                                                                                                              | Entry |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1       | A clean read of a diamond of getters doubles per level. A stamp on each cache entry, the node's own version taken before the body runs, makes it constant. Spike `spike-stamp`            | M18   |
| 2       | Revalidate a nested getter by refreshing it and comparing its value and, when the value is a store node, that node's version. Corrects MobX 3 step 1. Spikes `spike-refresh`, `spike-one` | M19   |
| 3       | A getter that reads the same field in a loop records it once per read: 2,000 entries for 1,000 rows. Record a property once per run                                                       | M20   |
| 4       | Record the dependency on a nested getter in a `finally`. If errors are cached, never cache one that recorded no dependency                                                                | M22   |
| 5       | Keep the live cycle message; give the snapshot layer the same check                                                                                                                       | M25   |
| 6       | The cause of stage 1 finding 37 is one line: re-read the memo map after the computation. Spike `spike-memo`                                                                               | M24   |
| 7       | A getter that writes: a development warning only, not an error                                                                                                                            | M26   |
| 8       | Preact confirms MobX's delivery model. Keep `console.error` for a subscriber's error; the loop error should name the store                                                                | M28   |
| 9       | Keep `batch()`; reject skipping the notification when a value is set and set back                                                                                                         | M30   |
| Section | The three kinds of getter dependency can become one `{value, version}` entry. Spike `spike-one`, about 150 lines; a write then a read gets slower, 300 nanoseconds against 206            | M27   |
| Q8      | If a development build is added, keep the error text in production and drop only the extra checks                                                                                         | M72   |

### `immer.md`

| Finding | What it says                                                                                                                                                                                                                                  | Entry              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1       | A snapshot after one of 1,000 rows changed costs the same in Immer while it freezes. Record changed keys per node and rebuild an array from the previous snapshot: floor 6 microseconds against 56 on Node; on Bun freezing alone is about 96 | M35                |
| 2       | A decoy Proxy target keeps the user's object out of Proxy invariants. A design question, not a 1.0 blocker; the smaller alternative is a documented limit                                                                                     | M7                 |
| 3       | Refuse `defineProperty` when the descriptor carries `value`, `get` or `set`, keep `Object.freeze(store)`; add a `setPrototypeOf` trap that throws                                                                                             | M2, M8             |
| 4       | Arrays carry indices and `length` only: a development error for a named property written to an array, and document it                                                                                                                         | M37                |
| 5       | A delete that removes nothing is not a change                                                                                                                                                                                                 | M4                 |
| 6       | A plain object from another realm is opaque to us. Accept it as plain, with a check cached per constructor                                                                                                                                    | M13                |
| 7       | Document that "frozen objects are values" needs the whole value frozen: a shallowly frozen object's mutable contents are shared with every snapshot                                                                                           | M76                |
| 8       | Mutators on a snapshot of a collection should throw a named error; `Snapshot` should map the collections to read-only interfaces                                                                                                              | M42                |
| 9       | Map and Set drafts are subclasses of the native classes. No change for 1.0; the live side could extend the native class                                                                                                                       | M38                |
| 10      | Tuples survive Immer's types: remove the array branch                                                                                                                                                                                         | M41                |
| 11      | Immer's cycle handling is a silent stale reference. Reject; support cycles in the snapshot or raise the error at the write                                                                                                                    | M36                |
| Q3      | A result is data; computed values live on the class. One derived prototype per class                                                                                                                                                          | M33                |
| Keep    | Own getters stay memoized accessors, symbols and non-enumerable properties are kept and frozen, the caller's objects are never frozen, the root may be any class instance                                                                     | no change proposed |

### `legend-state.md`

| Finding | What it says                                                                                                                                                                 | Entry    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1       | Keep `deliver()` and `console.error` for a listener's error. Optional: route the error through one replaceable reporter                                                      | M28, M73 |
| 2       | Legend 3 does not notify a write undone inside a batch. Reject: the version has moved and a binding compares snapshot identity                                               | M30      |
| 3       | `batch()` with an `async` function groups only the writes before the first `await` and returns the promise. A development warning for a thenable, or a type that refuses one | M30      |
| 4       | Hydration is synchronous in Legend and always a microtask late in ours, even on `localStorage`. An option such as `hydrate: 'sync'`, decided with `skipHydration`            | M48      |
| 5       | A debounced save is lost when the tab closes. Flush on `pagehide` and on `visibilitychange` to hidden                                                                        | M50      |
| 6       | Legend tags a restore's writes with a flag. Reject; simplify the version bookkeeping inside `persist.ts` instead                                                             | M54      |
| 7       | Keep the three-method storage contract; add recipes for AsyncStorage, IndexedDB and an encrypting wrapper                                                                    | M76      |
| 8       | Legend revives `Date`, `Map` and `Set` from tagged JSON. Reject the tag format; document a transform for each, optionally export the three                                   | M76      |
| 9       | A pause switch and an in-flight flag. Reject for now; both are additive later                                                                                                | M55      |
| 10      | Say in the tutorial that two tabs editing different fields is last writer wins on the whole record. Reject remote sync                                                       | M76      |
| 11      | Unknown stored keys are dropped in ours. Keep, and say so in the docs                                                                                                        | M76      |
| Options | `expireIn` and `clearOnExpire` are two options for one concept; consider throwing on a `properties` entry that is neither a key nor a complete transform                     | M46, M44 |

### `zustand-jotai.md`

| Finding | What it says                                                                                                                                                                         | Entry              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1       | A store written between the server render and hydration raises React's hydration error unless `prepareStoreForHydration` was called. Capture the initial snapshot automatically      | M70                |
| 2       | Keep the no-selector hook. Rename the `isEqual` option to `equalityFn`, the name both libraries use                                                                                  | M71                |
| 3       | `persist` is silent on a version mismatch with no `migrate` and on an `async` `migrate`. Report through `onError`; await `migrate` or throw on a thenable; keep "no version means 0" | M45                |
| 4       | A migrated record is not written back, so the migration runs on every load until the first edit. Save once after a migration                                                         | M47                |
| 5       | `storage` is required in ours and defaults to `localStorage` in both libraries. Make it optional with a lazy default                                                                 | M49                |
| 6       | Every devtools entry is `STORE_UPDATE`. Name the entry after the outermost store method and send one per transaction on the synchronous channel                                      | M57                |
| 7       | A devtools jump notifies once per field, turns a `Date` into a string, and ignores `RESET`, `COMMIT`, `ROLLBACK`. Wrap in `batch()`; pass options to `connect()`; decide `enabled`   | M56, M57           |
| 8       | `subscribeKey` takes a top-level key only. Accept a selector, `equalityFn` and `fireImmediately`; say in the reference that `subscribe`'s callback gets no arguments                 | M62                |
| 9       | Skip a listener removed before its turn (finding 20). For 21 the rule "a later subscriber does not hear the write" is right. No library does better on 18 and 22                     | M28                |
| 10      | Reject a Provider and an automatic server-write check; keep the scoping docs                                                                                                         | no change proposed |
| Names   | `prepareStoreForHydration` lives in `react/server` and is called in client code too; `subscribe` passes nothing where Zustand passes `(state, prev)`                                 | M70, M76           |
| Q1      | Users of both libraries expect synchronous delivery: if the default stays batched, say so at the top of the API reference                                                            | M31                |
| Q8      | Diagnostics for `persist` and `devtools` need a convention for the development gate first                                                                                            | M72                |

### `adapters.md`

| Finding | What it says                                                                                                                                                                                         | Entry              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A1      | Every adapter builds a snapshot per sync notification: 2,000 direct row writes take 630 to 760 milliseconds against 1 to 3. Vue, Angular and Solid can build it at the read; React and Svelte cannot | M63                |
| A2      | Every adapter has its own `active` flag against stage 1 finding 20. Drop the flags if the core stops calling a removed subscriber                                                                    | M28                |
| V1      | The Vue adapter leaks one subscription per server render. Subscribe in `onMounted` inside an unmounted component                                                                                     | M64                |
| V2      | The Vue ref is writable. Type it `Readonly<Ref<Snapshot<T>>>`                                                                                                                                        | M65                |
| S1      | The Svelte guide names the store `state`, which conflicts with the `$state` rune. Rename to `snap`                                                                                                   | M76                |
| S2      | Keep `toSvelteStore`; document `fromStore(toSvelteStore(store))` for runes modules; a rune-native helper needs a separate entry or dropping Svelte 4                                                 | M69                |
| O1      | No Solid-specific defect. The adapter is Solid 2's `from()`                                                                                                                                          | no change proposed |
| N1      | The Angular adapter drops a store write made inside a `computed`. Wrap the `set` in `untracked()`                                                                                                    | M66                |
| N2      | No `injector` option and a misleading error outside an injection context. Add `{injector}`, assert as `toSignal` does, align the message prefix                                                      | M67                |
| Q7      | Rename the Solid adapter to `fromClassyStore`; keep the other names and the entry points                                                                                                             | M68                |
| Q8      | A development warning when a sync listener sees many notifications in one task; a supported listener count for tests                                                                                 | M73                |

### `security.md`

| Finding | What it says                                                                                                                                                                                           | Entry              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1       | `persist` cannot swap the store's prototype unless the application lists `__proto__` itself. Throw at `persist()` time for a prototype key, a getter, a method or a malformed transform                | M44                |
| 2       | A nested `__proto__` key survives restore as an own data key and is written back. Drop such keys at every depth when restoring from storage or DevTools                                                | M52                |
| 3       | A record nested 16,000 to 18,000 deep restores, then every snapshot and save throws. Clone every value before assigning any, take one snapshot inside the `try`, roll back                             | M51                |
| 4       | Records `persist` cannot read are skipped without a report. One `readEnvelope` that returns an envelope or a reason; report every reason through `onError`                                             | M45                |
| 5       | A version that is not a number counts as version 0. Only a missing version means 0                                                                                                                     | M45                |
| 6       | With `expireIn` set, a record with no usable `expiresAt` never expires. Owner's call between fixing and documenting                                                                                    | M46                |
| 7       | DevTools time travel adds unknown fields, never deletes missing ones, calls setter-only accessors. Apply with history's rule; keep `enabled` true and document that the extension receives every state | M56, M57           |
| 8       | Cross-tab sync applies events from another storage area and synthetic events. Check `storageArea` when `storage` is a `Storage`; document                                                              | M53                |
| 9       | Restored values are not validated against field types. Document that stored data is untrusted and that `merge` is the place to validate; no `validate` option                                          | M76                |
| 10      | `proxy-compare` 3.0.1 is pinned exactly. Accept, and document why                                                                                                                                      | M75                |
| 11      | 17 advisories in development dependencies, none in the tarball. Update at the next refresh; a reporting `bun audit` step                                                                               | M75                |
| 12      | The release job gives every installed dependency the npm publishing identity. Split the job, pin actions by commit, set `permissions`                                                                  | M74                |
| 13      | The tarball holds only `dist` and four files. Accept                                                                                                                                                   | no change proposed |
| Q8      | A development warning for `syncTabs` with an adapter that is not `localStorage`, and for a malformed DevTools message                                                                                  | M73                |

## Contradictions between reports

The first seven are in the stage 2 report. The rest I found with all eleven
reports side by side. "Settles it" names the cheapest thing that would.

| No. | Entry    | One side                                                                                     | The other side                                                                                                                           | Settles it                                                                                                                                                                      |
| --: | -------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | M19      | MobX 3: revalidate a nested getter by comparing its value                                    | Signals 2: that is stale when a getter returns a live store node; compare the node's version too                                         | Settled by a run. Signals' `probe-first.ts` fails on `spike-refresh` and passes on `spike-one`                                                                                  |
|   2 | M11      | Solid 4: wrap class instances by default                                                     | Valtio V12, Vue Q6, MobX, Svelte, Immer: keep opt-in                                                                                     | An owner's decision. A spike would show how many tests a default wrap breaks, and what a snapshot of a class with `#private` fields does                                        |
|   3 | M38      | Vue, Legend-State: native `Map` and `Set` are reactive in place. MobX replaces them          | Valtio, Solid, Svelte: separate classes, as ours. No library has a frozen native `Map`                                                   | An owner's decision. No report asks for a change before 1.0                                                                                                                     |
|   4 | M7       | Solid 5, Immer 2: a Proxy target of the library's own ends the invariant bugs                | Both reports: too large for 1.0. Svelte 7: a guard in `get` covers finding 46                                                            | An owner's decision. The guard's cost depends on M9                                                                                                                             |
|   5 | M2       | Svelte and Immer throw for an accessor or read-only descriptor; Immer 3 proposes we do       | Svelte 2: we need not, because we store everything on the target                                                                         | An owner's decision; see number 8 first                                                                                                                                         |
|   6 | M2       | MobX 10: refuse `Object.freeze(store)`                                                       | Vue, Svelte 2, Immer 3, Solid 7: keep it working                                                                                         | An owner's decision. Freezing through the store is documented in `TUTORIAL.md`                                                                                                  |
|   7 | M31      | MobX, Preact, Legend-State, Zustand, Jotai: synchronous by default                           | Valtio, Solid, Svelte: batched. Vue: as ours                                                                                             | An owner's decision. No report proposes a change                                                                                                                                |
|   8 | M2, M12  | Immer 3: throw for every `defineProperty` that carries a `value`                             | MobX 8, Svelte 1, Vue 6: the base class works because class fields arrive as data descriptors                                            | Settled by a run (appendix): the fields arrive as full data descriptors, and a trap that refuses them throws in the constructor. The two cannot both be taken                   |
|   9 | M1       | Valtio, Vue, Solid, Svelte: return a stored function as it is                                | MobX 9: keep wrapping, cache one wrapper per function. MobX itself wraps a stored function once, which the stage 2 report's table misses | The stage 1 test for finding 5: `indexOf(first)` is 0 under the first and -1 under the second                                                                                   |
|  10 | M1       | Solid 3: its narrowing fixes the `holder.fn === fn` part of finding 62                       | Solid 3's own fifth rule keeps an own function on a non-array object wrapped                                                             | Run the stage 1 test for finding 62 against a sketch                                                                                                                            |
|  11 | M26      | Svelte 11: a write inside a getter is an error in every build                                | MobX 6, Solid 8, Signals 7: a development warning; an error is stricter than the field                                                   | An owner's decision. Count the tests and examples with a getter that writes                                                                                                     |
|  12 | M28      | MobX 5, Signals 8: queue a re-entrant write and drain in a loop, 100 rounds, `console.error` | Vue 9: skip the running listener, or count depth and throw. Svelte 11: 1,000 rounds, a named error in every build                        | An owner's decision. A sketch against the notification tests shows which pinned orders each policy changes                                                                      |
|  13 | M28      | Zustand and Jotai 9: "keep ours" for finding 21                                              | MobX 5, Valtio V6: fix finding 21                                                                                                        | Not a real conflict. Zustand tested a sync subscriber added during delivery, where ours is already right. Finding 21 is the batched case                                        |
|  14 | M23      | Signals 1: the stamp removes finding 32                                                      | Svelte 4, Vue 8, MobX 10: it needs a `present` flag                                                                                      | One probe on `spike-stamp`: read, write an unrelated field, read again, and count the runs                                                                                      |
|  15 | M7, M9   | Svelte 7: a guard for finding 46 is free, because `get` has the descriptor                   | Solid 1: remove that descriptor lookup                                                                                                   | Measure the guard on top of the Solid spike                                                                                                                                     |
|  16 | M18      | MobX 3: a new module-level write counter as the stamp                                        | Signals 1: the node's own version is enough                                                                                              | Signals ran the second. The first is reasoning                                                                                                                                  |
|  17 | M72      | Solid 9, Svelte: export conditions, production bytes untouched                               | MobX, Legend-State, Immer, Zustand: a `NODE_ENV` guard in one build                                                                      | The stage 3 cost spike: bytes per entry both ways, and which of Vite, Next.js, Vitest, Bun and Node select `development`                                                        |
|  18 | M72      | MobX 7, Signals Q8: the same thrown errors in both builds                                    | Immer 4: an error thrown in development only                                                                                             | An owner's decision, made once for all of M73                                                                                                                                   |
|  19 | M57      | Valtio V9: require `enabled`, or default it from `NODE_ENV`                                  | Security 7: keep `true` and document. Zustand and Jotai 7: either                                                                        | Follows from number 17: without a `NODE_ENV` read in the library, only "require" or "keep" are open                                                                             |
|  20 | M45      | Security 4: report an unreadable record as `'parse'` with a reason                           | Zustand and Jotai 3: a new operation, `'migrate'`                                                                                        | An owner's decision. `PersistOperation` is a public type                                                                                                                        |
|  21 | M45      | Zustand and Jotai 3: await an `async` `migrate`                                              | Security 4: reject a `migrate` result that is not a plain object                                                                         | An owner's decision. Awaiting adds a turn between the read and the apply                                                                                                        |
|  22 | M38      | Immer 9: a reactive collection could extend the native class if every method is overridden   | Svelte 8: not as the store stands, because a native method rejects the proxy as `this`                                                   | Settled by a run (appendix). Both hold: a call into `super` throws through the store; a subclass that overrides every method and accessor works, on the store and on a snapshot |
|  23 | M40      | Svelte 8, the stage 2 report: look at an index or native storage beside the live array       | Valtio V10: reject Valtio's live structure; index the frozen snapshot only                                                               | A spike of the live index with `withHistory` and `persist` replacing the array                                                                                                  |
|  24 | M35, M40 | Valtio V10: reading a frozen array is the slow path, 28 times slower on Bun                  | Immer 1: on Bun, `Object.freeze` of a new 1,000-element array costs about 94 microseconds by itself                                      | Settled by my script (appendix). Immer's row without the freeze also reads an unfrozen array, so about 15 of the 94 are the frozen read                                         |
|  25 | M33      | Valtio V4, Immer Q3: one derived prototype per class                                         | MobX Q3: own accessors that are not enumerable                                                                                           | The spike the stage 2 report asks for: tests that fail, bytes, and the cost per snapshot, for each form                                                                         |
|  26 | M14      | Valtio V1: with weak owner links, suspension and its corrections can go                      | Stage 1 finding 72: three parts of suspension are needed for correct snapshots                                                           | The ownership spike. Finding 72's three parts are corrections inside suspension, so the question is what the suite says with none of it                                         |
|  27 | M68      | Adapters Q7: rename the Solid adapter `fromClassyStore`                                      | Solid Q7: `useClassyStore` returns what a Solid user expects                                                                             | An owner's decision                                                                                                                                                             |
|  28 | M65      | Adapters V2: `Readonly<Ref<Snapshot<T>>>`                                                    | Vue 11: `Readonly<ShallowRef<T>>`                                                                                                        | `tsc` against Vue 3.2.0, the floor of the peer range                                                                                                                            |
|  29 | M57, M63 | Zustand and Jotai 6: send DevTools entries on the synchronous channel                        | Adapters A1: a sync listener that takes a snapshot per direct write is the 640-millisecond case                                          | Reasoning is enough: a sync DevTools listener would send one snapshot per direct write. It needs M35, or one entry per task for direct writes                                   |

## Dependencies between entries

"Before" means the first has to be decided or made before the second.

1. **M33 and M34 are one decision.** With enumerable own getters, a snapshot
   getter that lists the keys of `this` counts the getters and can call
   itself. M3, the same traps on the live store, does not depend on either.
2. **M33 before the utilities that enumerate a snapshot.** `persist` builds
   its default property list from `Object.keys(snapshot(store))`.
   `shallowEqual`, the DevTools payload (M57), `structuredClone` of a
   snapshot and `cloneSnapshot` all see the keys change. Under form (a) a
   snapshot and a plain instance of the same class have different
   prototypes, and the reference says `shallowEqual` never calls two such
   values equal. That last point is my reasoning.
3. **M2 before M12.** The base class gives a correct first snapshot only
   once a data descriptor is a write. M2 (b) rules M12 (a) out.
4. **M2 and M14 share a trap.** M2 (a) contains the one-line fix of M14 (a).
   If M14 (b) removes the walk, the hang is gone without that line, and M2 is
   still needed for findings 1, 45 and 71.
5. **M14 before M35, M21 and M16.** A set of changed keys must survive
   detach and resume. A dependency on another node's version must resume a
   suspended container first. The order of owner notifications changes with
   the ownership code.
6. **M14 before M18, or tested with it.** The stamp is the node's version,
   and a suspended subtree's version is reconciled on resume. The Signals
   report read that and did not test it.
7. **M9 before M1 and M2.** With the descriptor cache in place, the `get`
   trap already knows "own or inherited", which is the test M1 needs. The
   cache also adds an own-accessor flag that the `defineProperty` trap has to
   set. M9 removes what makes M7 (b) free.
8. **M6 before M5 (b) and M10.** A search on the raw array finds a raw
   object only if the raw array never holds a proxy.
9. **The getter entries have an order.** M18, M20 and M22 (a) are small and
   independent. M19 needs a version compare. M27 takes in M19, M20, M22 (a)
   and M23, so deciding M27 first would change how each is written. M22 (a)
   makes a branch reachable that stage 1 lists as dead; M27 removes it.
10. **M28 before M31, and before the adapter flags.** A synchronous default
    is only arguable after delivery is bounded. Adapters A2 drops four
    `active` flags once the core skips a removed listener.
11. **M72 before every development-only item in M73**, and before M37, the
    warning in M49, and any `enabled` default in M57 that reads the
    environment. The items marked "in every build" do not wait for it.
12. **M36 (a) before the utilities are safe.** `isChanged` in the React
    hook, `cloneSnapshot`, `shallowEqual`, `persist`, `devtools` and
    `withHistory` each need a check against a cyclic snapshot.
13. **M1 before M59.** Whether a stored function is data decides what
    `withHistory` should do with one.
14. **M60 before M56, or M56 twice.** DevTools is to reuse history's apply
    function. If that function becomes recursive later, time travel changes
    again.
15. **M52 before M51 and M56.** The `__proto__` strip lives in the clone
    walk that the clone-first restore and the DevTools jump would both call.
16. **The `persist` entries touch the same few functions.** M45 and M54 are
    one rewrite of the envelope guards. M51 makes the failure in M44 atomic.
    M48, M49, M70 and `skipHydration` are one question: what a store holds at
    the first render, on the server and on the client. M47 has to be checked
    with M53. M50 belongs with the debounce timing of stage 1 finding 56.
17. **M71 before M62.** A new equality option on `subscribeKey` should take
    whichever name the hook keeps.
18. **M29 and M57.** A setter that becomes a transaction is a second place
    where a transaction opens, so the action-name hook has to say what a
    setter is called.
19. **M35 and M63.** What the React and Svelte adapters can do about a
    snapshot per write is whatever M35 achieves. Vue, Angular and Solid can
    defer the snapshot without it.
20. **M11 (b) touches M13, M38 and the collections.** A default wrap needs a
    test for platform objects, which is where the realm check and the native
    collections are decided, and `ReactiveMap` and `ReactiveSet` use
    `PROXYABLE` today.
21. **The size budget comes before all core fixes.** The main entry measures
    3,661 bytes against 3,750, so 89 bytes are free. M2, M3, M9, M21, M28 and
    M34 add code to it. Only M14 clearly removes some. Each approved change
    has to state the new number, or the budget is decided once for the whole
    set. `CONSTRAINTS.md` allows no silent change.

## Proposals I think are wrong, or not worth their cost

These are my views after reading all eleven reports together. None is a
decision. Where a view rests on reasoning and not on a run, it says so.

1. **M19 (a), value-only revalidation (MobX 3, step 1). Wrong for us.** The
   Signals probe shows a stale result. Take (b) or leave the code as it is.
2. **M2 (b), refusing every data descriptor (Immer 3). Wrong for us if M12
   is wanted.** My run confirms that class fields reach the trap as data
   descriptors, so the base class throws in its constructor. Four reports
   propose the opposite. The `setPrototypeOf` half of Immer 3 stands on its
   own as M8.
3. **Refusing `Object.freeze(store)` (MobX 10). Not worth it.** It reverses
   documented behaviour to delete a branch that M2 (a) already makes safe:
   in the Svelte spike the freeze case "falls out of the same code". The
   hang it would also remove goes with M14.
4. **M1 (b), caching wrappers (MobX 9). A half fix.** Two reads agree, but
   `indexOf(first)` is still -1 and `store.Model === Model` is still false.
   Its third step asks the user to freeze a class before storing it. The
   non-writable `prototype` test needs nothing from the user.
5. **M26 (b), an error for a write inside a getter (Svelte 11). Too
   strict.** A getter that fills a cache field on first read is ordinary
   code, and three reports stop at a warning. What needs fixing is that the
   write is dropped without a word on a snapshot, and a warning does that.
6. **M11 (b), wrapping class instances by default (Solid 4). Costs more
   than the report counts.** Today an unmarked instance is shared with its
   snapshot, so its getters work there. Wrapped, it is copied, and a getter
   that reads a `#private` field throws on the copy. Every third-party class
   instance in a store would need the marker checked. A development warning
   reaches the same silent failure for a few lines. Reasoning, from Vue Q6
   and the base-class runs.
7. **M7 (a), a Proxy target of our own. Not for 1.0.** Both reports that
   describe it say so. It makes four more traps mandatory and reopens M2, M3
   and M8 at once.
8. **M10, array methods on the raw array (Vue 7). Unmeasured on ours.** The
   gain is read off Vue's numbers. M9 and M20 attack the same per-index
   cost and are both sketched. Measure those first.
9. **M27, one kind of dependency. Not yet.** About 150 lines, and a write
   followed by a read gets 45% slower. The Signals report itself says to
   take M18, M20 and M22 (a) first.
10. **M18 with a module-level counter (MobX 3). The weaker form.** A write
    to any store would then invalidate every stamp in every store. The
    node's own version does not have that cost and is the form that was
    run. Reasoning for the first sentence.
11. **M30, "refuse a promise". Too broad.** `batch(() => { store.loading =
    true; return save(); })` returns a promise and batches everything it
    should. Only an `async` callback is the mistake, and a check for a
    thenable cannot tell the two apart. A type that refuses a promise also
    contradicts "Returns whatever `run` returns". A development hint is the
    most the evidence supports. Reasoning.
12. **M35, the changed-keys rebuild. Worth a spike, not yet a
    commitment.** The floor is nine times faster on Node. On Bun the freeze
    and the frozen read are about 95 of 119 microseconds, and Safari shares
    Bun's engine, so the gain there may be small too. That last step is an
    inference. The quadratic case of M63 goes away for Vue, Angular and
    Solid without it.
13. **M36 (b), refusing a cycle at the write. Not free either.** No report
    costs it. To know that a write closes a cycle, the `set` trap has to ask
    whether the new child is an ancestor of the parent, on every assignment
    of an object. (a) is 13 lines in the core plus six utilities to check.
    Reasoning.
14. **M40 (b), an index beside the live array. Can wait.** "Their lookups
    are linear" is documented, so a faster lookup can ship in any later
    release. A native `Map` held in a field of the collection would be an
    opaque leaf shared with every snapshot, so it would answer for the live
    state on an old snapshot. (a) avoids that by keying on the frozen array.
    The second sentence is reasoning.
15. **Sending DevTools entries on the synchronous channel (Zustand and
    Jotai 6). It walks into M63.** One snapshot per direct write is what
    costs about 640 milliseconds for 2,000 writes. Naming entries after methods
    does not need the synchronous channel.
16. **M70, capturing the first snapshot automatically. Dearer than "not
    breaking" suggests.** Either every store keeps its first snapshot for
    life, whether or not React is used, or the write path of the core gains
    a first-write hook for a React-only need, in an entry with 89 bytes of
    room. `CONSTRAINTS.md` says retained memory must not grow. Reasoning.
17. **M71, renaming `isEqual` to `equalityFn`. Weak precedent.** Zustand and
    Jotai say `equalityFn`. React's own `useSyncExternalStoreWithSelector`
    names the same parameter `isEqual`; I checked the copy in
    `node_modules`. A breaking rename for a split precedent.
18. **M48 and M49 do not have to be settled before 1.0.** A new `hydrate`
    option and an optional `storage` are both additions. Only a changed
    default would be breaking. M49 also adds a new silence: `persist()`
    that does nothing where `localStorage` is missing.
19. **M15 (b), holding a subscribed node strongly. Trades a surprise for a
    leak.** A forgotten unsubscribe would then keep the node and everything
    under it for good. A sentence in the docs costs nothing.
20. **M12 (b), the creation-time arrow warning (MobX 8). It collides with
    M1.** Once a stored function is data, an own property that holds an
    arrow function is no longer evidence of a mistake. Reasoning.
21. **The four tools in M73. New surface on the eve of the freeze.** Each
    is an addition and can follow 1.0.

## Verified and not verified

**Read in full:** `CLAUDE.md`, `CONSTRAINTS.md`, the three sections of
`REVIEW_PLAN.md` the brief names, the summary and the 73 findings of
`review/stage-1-report.md`, `review/stage-2-report.md` without its appendix,
`website/content/docs/API_REFERENCE.md`, and in each of the eleven reports
everything from the summary to "verified and not verified". That includes
every findings section, every table of stage 1 counterparts and every answer
to the eight API questions.

**Read in part:** the appendices. I opened one, Immer's port 1d, to see what
its two rows measure. I did not read the diffs of the sketches; each entry
says where its diff is.

**Searched, not read:** the other pages under `website/content/docs/`, with
`grep`, for the sentences quoted under "Kind and API". A behaviour I call
"not documented" is absent from the reference and from those searches. It may
still be described in words I did not search for.

**Ran**, on Bun 1.4.4 and Node 24.21.0, on a machine other agents were
using. The scripts and their output are in the appendix.

- `frozen-read.mjs`: reading a frozen array against an unfrozen one.
- `fields-define.mjs`: whether class fields reach a `defineProperty` trap
  when a base constructor returns a Proxy. It uses a bare Proxy, not the
  library.
- `map-subclass.ts`: a class that extends `Map`, marked `PROXYABLE`, read
  through a store made from the repository's source. Bun only.
- One `grep` in `node_modules` for the parameter name in React's
  `use-sync-external-store`.

**Not run:** no sketch from stage 2, no spike, no suite, no benchmark. The
brief asks for none.

**Taken from the reports, not checked:** every number, reproduction and line
reference attributed to a report. The stage 2 report says which ten defects
the orchestrating agent re-ran.

**Reasoning:** the section "Proposals I think are wrong", except where an
item names a run; the dependencies; and in the entries, the remarks that a
proposal "falls out of" or "rules out" another, except M2 against M12.

**Not done:** the labels "Before 1.0" and "Can follow 1.0". Each entry says
what I checked, so that the decision document can assign them. I did not
check the nine items of M76 against the tutorials.

## Appendix: the three scripts

All three are in the scratch folder
`/private/tmp/claude-501/-Users-robertparallax-WebstormProjects-classy-store/9c8c2bbd-bb57-4b12-aa7b-9d06972e3fdd/scratchpad/stage-3-merge/`,
which a reboot can clear.

### `frozen-read.mjs`: contradiction 24

```js
const now = () => performance.now();
function scan(arr, needle) {
  for (let i = 0; i < arr.length; i++) if (Object.is(arr[i], needle)) return i;
  return -1;
}
function copy(arr) {
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i];
  return out;
}
function bench(label, fn, rounds) {
  let best = Infinity;
  for (let r = 0; r < 7; r++) {
    const t = now();
    for (let i = 0; i < rounds; i++) fn();
    best = Math.min(best, (now() - t) / rounds);
  }
  console.log(label.padEnd(52), (best * 1000).toFixed(2), 'us');
}
for (const n of [1000, 10000]) {
  for (const kind of ['numbers', 'objects']) {
    const make = () =>
      Array.from({length: n}, (_, i) => (kind === 'numbers' ? i : {id: i}));
    const plain = make();
    const frozen = Object.freeze(make());
    const lastPlain = plain[n - 1];
    const lastFrozen = frozen[n - 1];
    const rounds = n === 1000 ? 20000 : 2000;
    bench(
      `${n} ${kind}: scan to the last, plain`,
      () => scan(plain, lastPlain),
      rounds,
    );
    bench(
      `${n} ${kind}: scan to the last, frozen`,
      () => scan(frozen, lastFrozen),
      rounds,
    );
    bench(`${n} ${kind}: copy by index, plain`, () => copy(plain), rounds);
    bench(`${n} ${kind}: copy by index, frozen`, () => copy(frozen), rounds);
  }
}
```

Best of seven rounds, microseconds per call:

| Case                             | Bun, plain | Bun, frozen | Node, plain | Node, frozen |
| -------------------------------- | ---------: | ----------: | ----------: | -----------: |
| 1,000 numbers, scan to the last  |       0.48 |       16.29 |        0.61 |         5.33 |
| 1,000 numbers, copy by index     |       1.03 |       16.70 |        1.11 |         6.17 |
| 1,000 objects, scan to the last  |       1.97 |       16.93 |        6.22 |         6.43 |
| 1,000 objects, copy by index     |       2.55 |       17.44 |        6.61 |         6.90 |
| 10,000 numbers, scan to the last |      19.39 |      156.31 |       65.26 |        59.50 |
| 10,000 numbers, copy by index    |      22.45 |      167.55 |       70.16 |        67.00 |
| 10,000 objects, scan to the last |      19.46 |      158.57 |       62.14 |        64.27 |
| 10,000 objects, copy by index    |      21.57 |      156.06 |       65.63 |        68.66 |

What it shows. On Bun a frozen array costs 16 to 17 nanoseconds per element
to read, whatever it holds, against 0.5 to 2.5 unfrozen. That is 7 to 34
times, so Valtio V10 holds. On Node only the array of 1,000 numbers differs.
Immer's port 1d compares "copy a frozen array by index, then freeze" with a
row that neither freezes nor, after its first round, reads a frozen array.
So the 94 microseconds that Immer 1 puts on `Object.freeze` on Bun include
about 15 for the frozen read. Treat the figures as shape: one run, on a busy
machine.

### `fields-define.mjs`: contradiction 8

```js
const seen = [];
class Base {
  constructor(refuse) {
    return new Proxy(this, {
      defineProperty(target, key, descriptor) {
        seen.push([key, Object.keys(descriptor).sort().join(',')]);
        if (refuse && 'value' in descriptor)
          throw new Error(`refused: ${String(key)}`);
        return Reflect.defineProperty(target, key, descriptor);
      },
    });
  }
}
class Todos extends Base {
  items = [1];
  setFilter = () => {};
}
new Todos(false);
console.log('descriptors seen:', JSON.stringify(seen));
try {
  new Todos(true);
  console.log('refusing trap: constructed');
} catch (error) {
  console.log('refusing trap: THROWS', error.message);
}
```

The same output on Node and on Bun:

```text
descriptors seen: [["items","configurable,enumerable,value,writable"],["setFilter","configurable,enumerable,value,writable"]]
refusing trap: THROWS refused: items
```

### `map-subclass.ts`: contradiction 22

```ts
import {
  createClassyStore,
  PROXYABLE,
  snapshot,
  subscribe,
} from '/Users/robertparallax/WebstormProjects/classy-store/packages/classy-store/src/index.ts';

const attempt = (label: string, run: () => unknown) => {
  try {
    console.log(label, '->', run());
  } catch (error) {
    const failure = error as Error;
    console.log(label, '-> THROWS', failure.constructor.name, failure.message);
  }
};

// A: native storage, reached with super.
class NativeBacked<K, V> extends Map<K, V> {
  static [PROXYABLE] = true;
  get(key: K) {
    return super.get(key);
  }
}
// B: the native type only. Its own array holds the entries.
class ArrayBacked<K, V> extends Map<K, V> {
  static [PROXYABLE] = true;
  entriesList: [K, V][] = [];
  get(key: K) {
    return this.entriesList.find(([k]) => k === key)?.[1];
  }
  set(key: K, value: V) {
    this.entriesList.push([key, value]);
    return this;
  }
}
const a = createClassyStore({m: new NativeBacked([['a', 1]])});
attempt('A instanceof Map', () => a.m instanceof Map);
attempt('A get through the store', () => a.m.get('a'));
const b = createClassyStore({m: new ArrayBacked<string, number>()});
let calls = 0;
subscribe(b, () => calls++, {sync: true});
attempt('B instanceof Map', () => b.m instanceof Map);
attempt(
  'B set then get through the store',
  () => (b.m.set('a', 1), b.m.get('a')),
);
attempt('B sync notifications', () => calls);
attempt('B snapshot instanceof Map, get', () => [
  snapshot(b).m instanceof Map,
  snapshot(b).m.get('a'),
]);
attempt('B snapshot set', () => snapshot(b).m.set('x', 2));
attempt('B snapshot size (native slot)', () => snapshot(b).m.size);
```

Output on Bun. The script that ran had the `subscribe` import on a line of
its own; nothing else differs.

```text
A instanceof Map -> true
A get through the store -> THROWS TypeError Map operation called on non-Map object
B instanceof Map -> true
B set then get through the store -> 1
B sync notifications -> 1
B snapshot instanceof Map, get -> [ true, 1 ]
B snapshot set -> THROWS TypeError Attempted to assign to readonly property.
B snapshot size (native slot) -> THROWS TypeError Map operation called on non-Map object
```

What it shows. Svelte 8 is right about native storage: a call into
`Map.prototype` fails through the store. Immer 9 is right about the native
type: a subclass that never calls `super` works, notifies, and gives a frozen
snapshot that is `instanceof Map`. The last line is the catch. Anything not
overridden, here `size`, throws, and a snapshot that passes `instanceof Map`
is not a `Map` to native code.

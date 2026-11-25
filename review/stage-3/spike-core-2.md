# Spike: four core fixes the adversarial review asks for

Brief: `review/stage-3/briefs/spike-core-2.md`. Worktree:
`<scratch>/stage-3-spike-core-2/wt`, at `release/1.0`, whose library source is
that of `57404c3`. Every patch and script is in the appendix. "Unmodified"
means that worktree with no patch.

## Summary

- **F1, decision 5 with decision 2.** The `defineProperty` trap can put the
  child's proxy into the raw slot just before a property locks, when the
  definition carries no value (`Object.freeze`, `{writable: false,
  configurable: false}`). The regression the reviewer found goes away, and a
  tracked child of a container frozen through the store now stays a child
  in every origin, which today it does only when it was placed by its proxy.
  68 bytes, no test of its own fails. Two cases cannot be fixed because the
  engine compares the value it was given: an object frozen before it reached
  the store, and a read-only definition with an explicit object value.
- **F2, decision 12.** A table that caches only which prototype holds an
  accessor, and asks the holder for the current function only when the getter
  must run, keeps every gain of the full-descriptor table (a cached getter
  read included) and runs a redefined getter's new body on both layers. 165
  bytes, 46 more than the full table. Reading the function at every read
  instead costs 19% on a cached getter read on Node.
- **F3, decision 6.** A node element is found by identity and any other
  element by reference. Built two ways; three native searches beat the one
  loop the brief asked for on size (68 against 110 bytes over `t2`) and on
  time (543 ns against 3,000 on Bun for 1,000 rows; today 95,000). All the
  reviewer's rows now answer as a plain array does.
- **F4, decision 10.** Half A, throwing traps on the snapshot tracker, makes
  sloppy code throw too (37 bytes). Half B, the own-node form on the live
  store, refuses `this.x = …` in a getter and lets a store built inside a
  getter, another store's write, and a child's write through (37 bytes, no
  measurable time). Three incidental tests change. A write to a child still
  works live and throws on a snapshot.
- **Together** (F1, F2 lazy and F3 native on `t2` and `t3a`): 24 tests fail,
  exactly the union of the parts' fixes; the main entry is 4,126 bytes.

## F1. Raw values on write, and a container frozen through the store

**Question.** Decision 5 (`t2a-raw-only.patch`) keeps the raw object in the
raw graph. With decision 2 (`t3a.patch`), `Object.freeze(outer)` then locks a
property whose raw value is the raw child, and the Proxy invariant makes
`outer.inner` hand out that raw object: a write through it notifies no one
(`adversarial-core.md`, objection 2). Can the `defineProperty` trap put the
child's proxy in the raw slot before the property locks? Related:
`adversarial-edges.md`, objection 14 (rule 6), stage 1 findings 9 and 10.

**What was changed.** On top of `t2a-raw-only` and `t3a`, in the
`defineProperty` trap of `core.ts`, 15 lines added and 2 removed
(`f1-delta.patch`):

- When a data property that is not yet read-only becomes read-only, and the
  descriptor carries no `value` (that is `Object.freeze`, or
  `defineProperty(o, k, {writable: false, configurable: false})`), and the
  property holds the raw object of a node, the descriptor is given the node's
  proxy as its value. The engine then demands the proxy, which is what the
  store hands out anyway.
- The "did the value change" test of `t3a` compares `unwrap()` of both sides,
  so that swap stays silent: freezing still notifies no one.

**The swap cannot cover a descriptor that carries a value.** If
`Object.defineProperty(o, k, {value: raw, writable: false, configurable:
false})` stores anything but `raw`, both engines throw: Bun "did not define a
property on its target that is compatible with the trap's input descriptor",
Node "trap returned truish … incompatible" (`f1-invariant.ts`). Nor can it
cover an object frozen before it reached the store: its properties are locked
already. Those two stay raw. A read-only definition that is given a store
proxy keeps the proxy and stays a child, as today.

**Result.** `f1-freeze.ts`, one row per container and origin of the child.
"store" is a separate store placed by its proxy, "plain" a plain object
assigned through the store, "create" a plain object present when the store
was created. Each row writes `got.n++` through what `outer.inner` (or
`outer.rows[0]`) handed out, with a synchronous subscriber on the child's
proxy and one on `outer`.

| Case                                                         | Unmodified                                 | `t2a` + `t3a`                                  | With F1                           |
| ------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------- | --------------------------------- |
| `Object.freeze(outer)`, store                                | proxy, notifies, snapshot updates          | **raw, silent, snapshot holds the raw object** | proxy, notifies, snapshot updates |
| `Object.freeze(outer)`, plain                                | raw, silent, snapshot holds the raw object | raw, silent, raw                               | proxy, notifies, snapshot updates |
| `Object.freeze(outer)`, create                               | raw, silent, raw                           | raw, silent, raw                               | proxy, notifies, snapshot updates |
| frozen list row, store                                       | proxy, notifies                            | **raw, silent**                                | proxy, notifies                   |
| frozen list row, plain or create                             | raw, silent                                | raw, silent                                    | proxy, notifies                   |
| frozen root, store proxy inside                              | proxy, notifies                            | proxy, notifies                                | proxy, notifies                   |
| frozen root, plain object inside                             | raw, silent, raw                           | raw, silent, raw                               | raw, silent, raw                  |
| `Object.seal(outer)`, any                                    | proxy, notifies                            | proxy, notifies                                | proxy, notifies                   |
| one property `{writable: false, configurable: false}`, store | proxy, notifies                            | **raw, silent**                                | proxy, notifies                   |
| the same, plain or create                                    | raw, silent                                | raw, silent                                    | proxy, notifies                   |
| read-only definition given the raw object as `value`         | raw, silent                                | raw, silent                                    | raw, silent                       |
| object frozen before it entered the store (`rule6.ts`)       | raw, silent                                | raw, silent                                    | raw, silent                       |

"Raw, silent" always comes with a snapshot that holds the raw object itself:
mutable, not frozen, and the same object before and after the write. That is
true today too. Freezing notifies no one in all three builds; freezing twice
works; a frozen list still refuses `sort`, and a frozen property still
refuses assignment, with the trap's `TypeError`.

So F1 removes the regression decision 5 brings, and goes further: a child
that was in the store before the freeze stays a child, whether it was placed
by its proxy, assigned, or present at creation. That is a change from today
for "plain" and "create", which read raw after a freeze today. No test pins
today's answer for those.

`raw-freeze.ts` (the reviewer's): unmodified `true, 1, true, 1`; on `t2a` +
`t3a` `false, 0, false, 0`; with F1 `true, 1, true, 1`.

- **Tests.** `t2a` + `t3a` fail 20 tests, the 3 and 17 fixes the trap report
  classed. F1 on top fails the same 20 and no other: no fix, incidental or
  regression of its own.
- **Typecheck and lint.** Pass.
- **Size of `.`.** Unmodified 3,661 bytes; `t2a` + `t3a` 3,740; with F1
  3,808, so F1 costs 68 bytes (56 before the trap's parameter was copied to
  a local, which lint's `noParameterAssign` asks for). A longer first form that also unwrapped a
  writable definition's value came to 3,853 and was dropped: that unwrap
  belongs to decision 5's "one line" and is counted there.
- **Timings.** Not run. F1 changes only the `defineProperty` trap, which no
  benchmark times and no read or write passes through.

**What it changes for a user.** After `Object.freeze(container)` through the
store, a nested object that the store already tracked still notifies and
still appears frozen in snapshots. Today it silently becomes a raw value with
a live, unfrozen object in every snapshot. Two cases stay raw and must be
documented: an object frozen before it reached the store, and a read-only
property defined with an explicit object value.

**The documented rule should read.** "A frozen object is a value: the store
holds it by reference and does not look inside it. Freezing an object through
the store freezes its own properties, not the objects they hold: those stay
part of the store. An object frozen before it reached the store, and a
read-only property defined with an object value, hand that object out as it
is; a write through it is not seen and the snapshot holds it unfrozen."
Rule 6 becomes "one object has one proxy, however it is reached through the
store's proxies, except through an object frozen before it reached the store
or a read-only property defined with an object value".

**Recommendation.** Do it, as part of decision 5. **Before 1.0**, because
decision 5 is, and because it changes what `outer.inner` is after a freeze.

**Cost for stage 4.** `core.ts`, one trap. Tests to write first: the four
lines of `raw-freeze.ts`; one row each for a frozen list, a property made
read-only by `defineProperty` without a value, freeze staying silent, and the
two raw exceptions above. Low risk. It adds 68 bytes to the main entry.

## F2. The table per prototype must not freeze a getter's body

**Question.** Decision 12's table (`review/stage-2/solid.md`, port 6) caches
the whole inherited descriptor, `get` function included. A getter redefined
on the class after the first read then keeps its old body on the live store
while snapshots run the new one (`adversarial-core.md`, objection 6). Does a
table that caches only where the accessor is keep decision 12's gain?

**What was changed.** `f2-accessor-holder-table.patch`, against the
unmodified source: `core.ts` 47 lines added and 9 removed, `ownership.ts` 1
added. The `ownAccessors` flag per node is the full table's, unchanged. The
table per prototype maps a key to the prototype object that holds an accessor
for it, or to `null` when the key is data or absent. At a read of an
inherited accessor the trap asks `Object.getOwnPropertyDescriptor(holder,
key).get`, so the function that runs is the one the class has now. An
inherited data key, which includes every method, costs one map lookup and no
descriptor, as in the full table.

**Result.**

`table.ts` (the reviewer's) and `f2-table-more.ts` (mine), on the three
builds:

| Case                                                                 | Unmodified  | Full-descriptor table | Holder table |
| -------------------------------------------------------------------- | ----------- | --------------------- | ------------ |
| getter redefined on the class, live and snapshot                     | 300, 300    | **30**, 300           | 300, 300     |
| getter replaced by a data value on the class                         | `false`     | **`true`**            | `false`      |
| getter deleted from the class                                        | `undefined` | **5**                 | `undefined`  |
| getter added to the class after a read that found nothing            | 4, 4        | 4, 4                  | 4, 4         |
| a subclass gains an override after the first read, live and snapshot | 200, 200    | **2**, 200            | **2**, 200   |

The fourth row passes on both tables only because the key is then read as a
plain value through `Reflect.get`: the getter runs unmemoized, with the raw
object as `this`. The last row is the case decision 12 already names: a
prototype that gains a getter (here an override nearer the instance) after
its first read. Neither table sees it, and it stays **unspecified**.

- **Tests.** 1,341 pass on the holder table, as on the full table.
- **Typecheck.** Passes. Lint passes.
- **Size of `.`.** Unmodified 3,661 bytes; full table 3,780 (+119); holder
  table 3,803 (+142). The holder costs 23 bytes more than the full table. A
  shorter-looking form that found the holder through
  `findPropertyDescriptor` and a second walk came to 3,810 and was dropped.

**Timings.** The three builds back to back, three rounds of five fresh
processes each per engine, on a machine shared with other agents. Each cell
gives the three medians, then the lowest and highest single run of all
fifteen. Nanoseconds per operation; the read ratio is `store.read` over a
forwarding Proxy.

| Bun (JavaScriptCore)             | Unmodified                      | Full table                          | Holder table                    |
| -------------------------------- | ------------------------------- | ----------------------------------- | ------------------------------- |
| `store.read`                     | 31.9, 31.9, 32.0 (31.5 to 32.6) | 11.5, 11.5, 11.6 (11.3 to 11.6)     | 11.7, 11.5, 11.6 (11.3 to 13.8) |
| `store.read.nested` (three deep) | 108, 108, 108 (106 to 109)      | 48.0, 47.8, 48.4 (39.7 to 49.1)     | 47.5, 47.7, 48.0 (40.0 to 48.6) |
| `getter.cached`                  | 58.5, 58.5, 57.8 (57.4 to 59.1) | **35.5, 35.5, 35.8 (35.5 to 35.9)** | 57.3, 57.2, 57.2 (56.2 to 57.8) |
| `store.method`                   | 232, 227, 227 (217 to 234)      | 187, 187, 189 (181 to 193)          | 183, 183, 183 (179 to 186)      |
| read ratio                       | 15.2, 15.6, 14.0                | 5.59, 5.05, 5.04                    | 5.26, 5.06, 5.51                |

| Node (V8)           | Unmodified                      | Full table                          | Holder table                    |
| ------------------- | ------------------------------- | ----------------------------------- | ------------------------------- |
| `store.read`        | 47.9, 47.5, 47.2 (46.4 to 48.9) | 38.0, 38.2, 37.8 (37.4 to 39.8)     | 37.8, 38.2, 38.5 (37.1 to 39.5) |
| `store.read.nested` | 143, 142, 143 (140 to 144)      | 117, 117, 115 (114 to 118)          | 116, 117, 116 (114 to 117)      |
| `getter.cached`     | 85.7, 84.6, 85.0 (84.1 to 86.3) | **76.3, 77.0, 77.6 (76.2 to 78.4)** | **100, 102, 102 (100 to 103)**  |
| `store.method`      | 297, 293, 294 (291 to 302)      | 277, 276, 282 (274 to 285)          | 278, 282, 280 (275 to 285)      |
| read ratio          | 2.04, 2.04, 2.04                | 1.63, 1.62, 1.61                    | 1.63, 1.63, 1.64                |

Reads, deep reads and methods: the holder table keeps the whole gain of the
full table on both engines; the ranges of the two tables touch everywhere.
A cached getter read is where they part. The full table is fast there only
because it skips the one descriptor the read needs to find the current
function. The holder table pays for that descriptor at every read: on Bun it
is back at today's figure (the ranges touch), on Node it is about 19% slower
than today (100 to 103 against 84.1 to 86.3; the ranges do not touch).

**Two more forms, to win the cached getter back.**

- **`__lookupGetter__` in place of the descriptor**
  (`f2-holder-lookupgetter.patch`). It finds the function without building
  a descriptor object. `getter.cached` on Bun 46.2 to 47.0, between the two;
  on Node 109 to 112, worse than the descriptor. 3,820 bytes, and the
  typecheck fails, because TypeScript's `Object` type does not declare it.
  Dropped.
- **Read the function only when the getter has to run**
  (`f2-holder-lazy.patch`, against the unmodified source: `core.ts` 55 lines
  added and 12 removed, `ownership.ts` 1). The table says "accessor, held
  by this prototype". A read whose memo is still valid needs no function at
  all, so it returns the cached value; only a recompute asks the holder for
  the current `get`. If the holder has no getter any more, the entry is
  dropped and the key is read as data.
  - `getter.cached`, three rounds back to back with the other three builds:
    Bun 34.4 to 35.0 (full table 35.2 to 36.1, unmodified 57.0 to 59.5),
    Node 75.6 to 78.7 (full table 76.1 to 78.5, unmodified 84.5 to 87.9).
    The full table's gain, kept.
  - Reads and methods, two rounds against the unmodified build: Bun
    `store.read` 11.5 to 11.6 against 31.6 to 32.5, `store.read.nested`
    40.2 to 48.3 against 106 to 109, `store.method` 179 to 191 against 219
    to 234; Node 36.8 to 39.9 against 46.3 to 49.0, 113 to 117 against 141
    to 143, 274 to 317 against 292 to 301. The same as the other tables.
  - 1,341 tests pass. Typecheck and lint pass. 3,826 bytes (+165, 46 more
    than the full table).
  - `table.ts`: a redefined getter runs its new body, live 300 and snapshot
    300, as today. That is not a change of meaning: today too a getter whose
    memo is valid returns the cached value whatever the class now says, and
    the redefinition shows at the next recompute. Today's answer and the
    lazy form's are the same in this row.
  - A getter replaced by a data value, or deleted from the class, is still
    served from the memo until one of its dependencies changes; then the
    data value (or `undefined`) is read. Today it is seen at once.
    `f2-lazy.ts`: replaced by data, before and after a write, today `data`
    and `data`, lazy `true` and `data`; deleted, today `undefined` twice,
    lazy `1` then `undefined`. The full table never sees either.

**What it changes for a user.** Nothing in ordinary code: no test changes on
any of the three forms. The difference is only for a class whose prototype
is changed after its first read through a store (hot module reload, test
doubles, monkey-patching).

**Recommendation.** Take decision 12 in the lazy form: it keeps every
measured gain of the full table, including the cached getter, and a getter
redefined on the class runs its new body on both layers, which the full
table breaks. If 46 bytes over the full table is too much for that, the
holder table is the fallback, at the price of a cached getter read 19%
slower on Node than today. Do not take the full-descriptor table. The
unspecified sentence of decision 12 should read: "a prototype changed after
its first read through a store: a getter added to it, or one nearer the
instance that overrides an inherited one, is not seen; a getter removed
from it, or replaced by a data value, is seen at its next recompute".
**Can follow 1.0**, as decision 12 is labelled.

**Cost for stage 4.** `core.ts` (the `get` trap and `evaluateComputed`),
`ownership.ts` (one flag). Tests to write first: the three rows of
`table.ts`, the two of `f2-lazy.ts`, and the override row as a pinned
unspecified behaviour. On the getter combination of decision 10,
`evaluateComputed` takes the holder and reads the function after its own
validation; not built on the combination. Size: 165 bytes on the main entry,
46 more than decision 12 counts today.

## F3. Searches on a list that holds frozen values

**Question.** Decision 6 (`t2.patch`) makes `includes`, `indexOf` and
`lastIndexOf` compare every element by `identityOf`. Every snapshot of one
object has the same identity, so on a list of saved snapshots `indexOf(v2)`
finds `v1`, and a snapshot that was never pushed is "found"
(`adversarial-core.md`, objection 7). Stage 1 finding 7 is the defect decision
6 fixes.

**The rule built.** An element that is a node of a store (its raw object, or
a proxy left in the raw list) is found by identity: its raw object, its proxy
and any snapshot of it find it. Any other element (a frozen snapshot kept as
a value, an object its owner froze, a `Date`) is found by reference, as in a
plain array. A primitive goes to the native method, as in `t2`. The value
searched for is first stripped of a store proxy or a tracking proxy.

**Two forms, both on top of `t2.patch`, `core.ts` only.**

- **One loop** (`f3-loop-delta.patch`, 39 lines added and 14 removed over
  `t2`). Computes the start index as the native methods do and walks the
  raw list once, asking each object element whether it is a node. Allocates
  nothing but the rest array of the call.
- **Three native searches** (`f3-native-delta.patch`, 30 added and 14
  removed). The raw list holds a node by its raw object, or in old lists by
  its proxy, and a value by itself. So the answer is the nearest hit of the
  native `indexOf` (or `lastIndexOf`) for three values: the value searched
  for, and, when that value is a form of a node, the node's raw object and
  its proxy. `fromIndex` is passed to the engine unchanged, so its rules are
  the engine's. It allocates two small arrays per object search.

**Result.** `f3-search.ts`, which holds the reviewer's `search.ts` and the T2
reproduction. Both forms give the same answers on every row.

| Search                                                       | Unmodified     | `t2`     | F3 (both forms) | Plain array     |
| ------------------------------------------------------------ | -------------- | -------- | --------------- | --------------- |
| `versions.indexOf(v2)`, a list of saved snapshots            | 1              | **0**    | 1               | 1               |
| `versions.includes(v3)`, never pushed                        | false          | **true** | false           | false           |
| `versions.lastIndexOf(v1)`                                   | 0              | **1**    | 0               | 0               |
| `versions.includes(store.doc)`, the live object              | false          | **true** | false           | false           |
| `rows.includes(raw)`                                         | **false**      | true     | true            | true            |
| `rows.includes(its proxy)`                                   | true           | true     | true            | true            |
| `rows.indexOf(older snapshot of row 0)`                      | **-1**         | 0        | 0               | 0 (by identity) |
| `rows.indexOf(other, 1)`                                     | **-1**         | 1        | 1               | 1               |
| `rows.indexOf(raw, 1)`                                       | -1             | -1       | -1              | -1              |
| `rows.indexOf(raw, -2)`                                      | **-1**         | 0        | 0               | 0               |
| `rows.lastIndexOf(other, 0)`                                 | -1             | -1       | -1              | -1              |
| `rows.lastIndexOf(raw, -2)`                                  | **-1**         | 0        | 0               | 0               |
| `rows.lastIndexOf(other, -3)`                                | -1             | -1       | -1              | -1              |
| `rows.lastIndexOf(other, undefined)`                         | -1             | -1       | -1              | -1              |
| `rows.includes({id: 2})`, an equal stranger                  | false          | false    | false           | false           |
| `includes(NaN)`, `indexOf(NaN)`                              | true, -1       | true, -1 | true, -1        | true, -1        |
| `indexOf('a', -2)`, `includes(undefined)`                    | 2, true        | 2, true  | 2, true         | 2, true         |
| `includes(date)`, `indexOf(frozen)`, `includes(new Date(0))` | true, 1, false | the same | the same        | the same        |

The "plain array" column of the live-row rows is what a reader expects of a
plain array that holds the row; on a plain array a snapshot of a row is a
different object.

- **Tests.** `t2` fails 7, all fixes (`spike-traps.md`, T2). Each F3 form
  fails the same 7 and no other.
- **Typecheck and lint.** Pass for both.
- **Size of `.`.** Unmodified 3,661 bytes; `t2` 3,797; one loop 3,907
  (+110 over `t2`); three native searches 3,865 (+68 over `t2`). A first
  loop with a separate `typeof` test per element came to 3,921.
- **Time of `includes` on a list of 1,000 rows** (`f3-bench.mjs`), three
  rounds back to back, nanoseconds per call, the found row last:

  | Search                          | Engine |                     Unmodified |             `t2` |        One loop | Native searches | Plain array |
  | ------------------------------- | ------ | -----------------------------: | ---------------: | --------------: | --------------: | ----------: |
  | the last row, by its raw object | Bun    |   94,785 to 95,804 (not found) |   6,770 to 7,249 |  2,993 to 3,120 |      543 to 548 |  151 to 154 |
  | the last row, by its proxy      | Bun    |               95,289 to 95,771 |   6,905 to 7,210 |  2,998 to 3,124 |      548 to 551 |             |
  | an object not in the list       | Bun    |               94,504 to 95,907 |   6,790 to 7,213 |  3,001 to 3,125 |      251 to 254 |             |
  | a number                        | Bun    |               94,207 to 95,664 |   1,276 to 1,299 |  1,301 to 1,320 |  1,307 to 1,313 |             |
  | the last row, by its raw object | Node   | 178,631 to 181,850 (not found) | 35,777 to 36,594 | 9,451 to 10,064 |      851 to 858 |  212 to 221 |
  | the last row, by its proxy      | Node   |             179,236 to 182,201 | 36,033 to 36,951 | 9,567 to 10,204 |      856 to 871 |             |
  | an object not in the list       | Node   |             179,465 to 181,638 | 35,798 to 37,273 | 9,519 to 10,078 |      390 to 392 |             |
  | a number                        | Node   |             177,933 to 180,938 |       816 to 818 |      819 to 831 |      821 to 830 |             |

  Today a search goes through the `get` trap once per element, which is why
  it is near 100 microseconds. The native searches run three engine loops
  over the raw list and come within 3.6 times (Bun) and 4 times (Node) of a
  plain array.

**What it changes for a user.** Against `t2`: a list that holds snapshots as
values answers as a plain array does. Against today: everything decision 6
already changes (a row is found by its raw object and by a snapshot of it),
and nothing else.

**Recommendation.** Do decision 6 with this rule, in the native-searches
form: smaller, five (Bun) to eleven (Node) times faster than the loop, and `fromIndex` left
to the engine. It allocates two short arrays per object search; the brief
asked for a loop that allocates none, and that loop is both larger and
slower. The decision should read: "On a list in a store, `includes`,
`indexOf` and `lastIndexOf` find an element that is part of a store by any
of its forms: its raw object, its proxy or a snapshot of it. Any other
element, such as a snapshot or a frozen object kept as a value, is found by
reference, as in a plain array." **Before 1.0**, as decision 6 is.

**Cost for stage 4.** `core.ts`, the array branch of the `get` trap. Tests to
write first: the three lines of `search.ts`, `includes(store.doc)` on that
list, and the `fromIndex` rows above. 68 bytes on the main entry over
decision 6's 100.

## F4. A getter that writes

**Question.** Decision 10 says a snapshot getter that writes to `this`
throws. In the getter combination the tracker's traps return `false`, which
only strict code turns into an error; a sloppy-mode getter loses the write
in silence (`adversarial-core.md`, objection 12). And decision 10 dropped a
throw on the live store for reasons that apply to the broad form only
(objection 13). Stage 1 finding 39, merged entry M26.

**What was changed,** on top of the getter combination of
`spike-getters.md`, appendix E:

- **Half A, the snapshot** (`f4a-delta.patch`, `snapshot.ts`, 9 lines added
  and 2 removed). The tracker's `set`, `defineProperty` and
  `deleteProperty` traps throw a `TypeError` that names the field: "a getter
  cannot write to a snapshot (cache)".
- **Half B, the live store, own node only** (`f4b-delta.patch`, `core.ts`,
  16 lines added). The `set`, `defineProperty` and `deleteProperty` traps of
  a node throw "a getter cannot write to its own store (cache)" when a getter
  of that same node is on the evaluation stack. A write to any other node
  goes through. The test is one length check per write when no getter runs.

**Result.** `f4-writes.ts`, each case on a fresh store, with the base class
of `spike-classes.md` applied for `new Sub()`. "Live" reads the getter on
the store, "snapshot" on `snapshot(store)`.

| The getter                                        | Unmodified, live | Unmodified, snapshot               | Combination, snapshot             | A, snapshot           | A and B, live             |
| ------------------------------------------------- | ---------------- | ---------------------------------- | --------------------------------- | --------------------- | ------------------------- |
| `this.cache ??= …`                                | 4                | 4, the write lost                  | `TypeError` (trap returned falsy) | throws, names `cache` | **throws, names `cache`** |
| `this.child.x = 1`                                | 1                | `TypeError` (read-only)            | the same                          | the same              | 1                         |
| `this.list.push(1)`                               | 1                | `TypeError` (read-only)            | the same                          | the same              | 1                         |
| `other.n = 1`, another store                      | 1                | 1                                  | 1                                 | 1                     | 1                         |
| `new Sub()` inside the getter                     | 7                | 7                                  | 7                                 | 7                     | 7                         |
| calls a prototype method that writes `this.count` | 1                | **0, the write lost**              | `TypeError` (falsy)               | throws, names `count` | **throws, names `count`** |
| sloppy object-literal getter, `this.n = 5`        | 5                | **1, the write lost**              | **1, the write lost**             | throws, names `n`     | **throws, names `n`**     |
| sloppy, `delete this.n`                           | `undefined`      | **1, lost**                        | **1, lost**                       | throws, names `n`     | **throws, names `n`**     |
| `Object.defineProperty(this, 'n', …)`             | 9                | an unrelated Proxy invariant error | `TypeError` (falsy)               | throws, names `n`     | **throws, names `n`**     |

On the live store the combination and half A alone give today's column.
Every snapshot cell of "A and B" is the same as "A". So:

- Half A closes objection 12: the three sloppy rows lost the write in silence
  in the combination, and now throw.
- Half B makes the two layers agree for a write to `this`, and leaves alone
  the three cases decision 10 gave as reasons: a store constructed inside a
  getter (`new Sub()`), and another store's method or field (`other.n`).
- Half B does not cover a write to a child (`this.child.x`,
  `this.list.push`), because the child is another node. On the live store
  that write still goes through and notifies; on a snapshot it throws
  because the child is frozen. The layers still disagree there, as today.
  To cover it, the test would ask whether the written node is the getter's
  node or under it, which means walking the parents on each write made while
  a getter runs. Not built.

- **Tests.** The combination fails 16, classed in `spike-getters.md`
  (15 fixes, 1 incidental). Half A fails the same 16. A and B fail 3 more,
  all **incidental**, all in "a getter that writes to the store while it
  runs": "re-runs, writes and notifies on every read when it writes a field
  it reads", "writes and notifies once per recomputation when it writes a
  field it does not read" and "reports a circular dependency to a sync
  subscriber that reads the getter during its write". They pin finding 39 on
  the live store. The fourth test G7b broke, "never settles when it pushes
  to an array it reads", still passes: that getter pushes to a child.
- **Typecheck.** Passes for both.
- **Size of `.`.** Unmodified 3,661 bytes; combination 3,826; with A 3,863
  (37 bytes, most of it the message); with A and B 3,900 (37 more).
  `spike-getters.md` measured A's traps without a message at 20 bytes in the
  combination; with decision 35's codes the messages go, which I did not
  measure.
- **Timings,** the combination and A with B back to back, three rounds of
  five runs each. Every figure is inside the other's range. Bun:
  `store.write` 157 to 161 against 157 to 163 ns, `store.write.same` 33.4
  to 35.1 against 34.3 to 35.2, `store.write.nested` 311 to 340 against 314
  to 320, `getter.recompute` 305 to 321 against 304 to 319. Node:
  `store.write` 209 to 227 against 212 to 218, `store.write.same` 57.0 to
  59.8 against 56.7 to 60.1, `store.write.nested` 502 to 553 against 508 to
  522, `getter.recompute` 417 to 427 against 419 to 430.

**What it changes for a user.** Half A: none for strict code, where the
combination already threw; sloppy code that wrote in a snapshot getter now
gets an error instead of a lost write, and every refusal names the field.
Half B: a getter that writes to its own store throws on the live store too.
That breaks `this.cache ??= …` and a getter that calls a method writing
`this`, both of which work on the live store today and already fail through
every adapter. A getter that writes to a child, to another store, or that
builds a store, works as today.

**Recommendation.**

- **Half A: do it.** It is what decision 10 already promises, now true in
  sloppy code too, for 37 bytes. **Before 1.0**, with decision 10.
- **Half B: do it, in this own-node form.** It answers the two reasons of
  decision 10's "Not taken" that it can answer, it costs no measurable time,
  and adding a throw after 1.0 would be breaking. **Before 1.0.** If the
  owner keeps the live store lenient, the decision should say so for the
  third reason alone (strictness against other libraries).

The decision-document paragraph: "A getter must not write to the store it is
computed on. On a snapshot, any write to `this` (assignment, `delete`,
`defineProperty`, also through a method it calls) throws a `TypeError` that
names the field, in strict and sloppy code alike, and a write to a child
throws because the child is frozen. On the live store, a write to the
getter's own node throws the same way; a write to a child node, to another
store, or the construction of a store inside a getter is allowed. A getter
that writes to a child therefore still works on the live store and fails on
a snapshot, which is **unspecified**."

**Cost for stage 4.** `snapshot.ts` (one function), `core.ts` (one function,
three call sites). Tests to write first: the nine rows above on both layers,
with the base class for `new Sub()`, and the three incidental tests
rewritten to expect the error. 74 bytes on the main entry with messages;
decision 35's codes would shorten both.

## The three core fixes together

`t2.patch` with F3's native searches, then `t3a.patch`, then F1, then F2's
lazy holder table (one hunk placed by hand, see the appendix). F4 sits on
the getter combination, which does not apply on `t2`'s `get` trap without
rework (objection 15 of `adversarial-core.md` says the same of decision 7),
so it was not combined.

- **Tests.** 24 fail: the 20 of `t2a` and `t3a` plus the 4 searches of `t2`,
  all fixes, none new.
- **Typecheck and lint.** Pass.
- **Reproductions.** `raw-freeze.ts` `true, 1, true, 1`; `search.ts`
  `1, false, 0`; `f1-freeze.ts` and `f3-search.ts` as the single spikes;
  `table.ts` 300 and 300 for a redefined getter, and the lazy form's
  `true` for a getter replaced by data before a write.
- **Size of `.`.** 4,126 bytes against 3,661 today, 465 more.
- **Timings,** against the unmodified build, two rounds of five runs each,
  with other agents' benchmarks running at the same time. Bun: `store.read`
  11.1 to 11.7 against 31.1 to 32.0 ns, `store.read.nested` 46.8 to 49.5
  against 104 to 111, `getter.cached` 30.5 to 51.9 against 52.4 to 72.2,
  `store.method` 183 to 201 against 248 to 267, `store.write.nested` 271 to
  297 against 308 to 324. Node: `store.read` 35.6 to 39.0 against 45.9 to
  48.0, `store.read.nested` 111 to 115 against 136 to 145, `getter.cached`
  73.5 to 77.3 against 80.2 to 86.1, `store.method` 269 to 280 against 284
  to 299, `store.write.nested` 466 to 490 against 491 to 522. Every other
  write, `create.small`, `create.rows` and `snapshot.cached` is inside the
  other build's range (creation is the noisiest: 999,122 to 1,601,754 ns
  for 1,000 rows on Node). The four ratios `CONSTRAINTS.md` limits: Bun read
  4.0 to 5.71, write 2.62 to 2.8, getter 11.0 to 22.5, snapshot 5.41 to
  7.77; Node 1.58 to 1.7, 1.1 to 1.4, 3.22 to 3.38, 1.36 to 1.51. All are
  inside their limits.

## Verified and not verified

- **Ran,** on the worktree, for every spike and for the combination: the
  unit suite (`bun run test`), the package typecheck, Biome on `core.ts`,
  `bun run size`; the reviewers' `raw-freeze.ts`, `rule6.ts`, `table.ts` and
  `search.ts`; my own scripts in the appendix. Every timing quoted was run
  back to back with its comparison builds from saved copies of `dist`.
- **F1's** claim that the engine refuses a different value for a read-only
  definition that carries one is tested on both engines (`f1-invariant.ts`).
  That F1 changes no timed path is reasoning: the benchmark does not time
  `defineProperty`. F1 was not timed alone.
- **F2's** lazy form was built on the unmodified `evaluateComputed`, not on
  the getter combination's; how it sits there (the holder passed in, the
  function read after validation) is reasoning, not built.
- **F3's** native form allocates two short arrays per object search; I did
  not measure garbage-collection pressure.
- **F4** was built and measured only on the getter combination; it was not
  combined with `t2`, `t3a`, F1 or F3. Half B's gap for a write to a child
  is shown by the probe; the variant that would close it was not built. The
  sloppy-mode rows rest on getters compiled with `Function`.
- **Not run:** the browser, framework and mutation suites, the coverage run
  and `check:floor`. New code paths have no tests yet, so the 100% line and
  function coverage of `CONSTRAINTS.md` would fail until stage 4 writes them.
- **Machine.** Other agents ran benchmarks on the same machine throughout;
  I report a difference only where two ranges do not touch.

## Appendix: patches

The base patches are the reports' own, as cut by the adversarial review into `<scratch>/stage-3-adversarial-core/p/`: `spike-traps__t2a-raw-only.patch`, `spike-traps__t3a.patch`, `spike-traps__t2.patch`, `getters-combination.patch` and `spike-classes__base-class.patch`; the full-descriptor table is the diff of the reviewer's worktree `wt3`. Each patch below applies on top of the base its title names, at `57404c3`, with `git apply --recount`.

### F1, on `t2a-raw-only` and `t3a`

`f1-delta.patch`:

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -503,9 +503,22 @@
       return child ? child.proxy : value;
     },
 
-    defineProperty(_target, prop, descriptor) {
+    defineProperty(_target, prop, given) {
+      let descriptor = given;
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      // A read-only property must hand out what the raw object holds, so a
+      // node's raw object becomes its proxy before the property locks.
+      if (
+        before &&
+        'value' in before &&
+        !('value' in descriptor || descriptor.get || descriptor.set) &&
+        !isReadOnly(before) &&
+        isReadOnly({...before, ...descriptor})
+      ) {
+        const node = targetNodes.get(before.value);
+        if (node) descriptor = {...descriptor, value: node.proxy};
+      }
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
       // The bookkeeping of a write: the property's value is its child, or it
@@ -529,7 +542,7 @@
         'value' in before !== 'value' in own ||
         before.enumerable !== own.enumerable ||
         before.get !== own.get ||
-        !Object.is(before.value, own.value)
+        !Object.is(unwrap(before.value), unwrap(own.value))
       )
         notifyMutation(internal);
       return true;
```

### F2, the lazy holder table (recommended), on the unmodified source

`f2-holder-lazy.patch`:

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..d29cbcc 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -7,6 +7,39 @@ import {
 import type {DepEntry} from './core.types';
 import {StoreInternal} from './ownership';
 
+// Per prototype and key: the prototype object that holds an accessor for the
+// key, or `null` when the key is data or absent. The accessor itself is read
+// at each read, so a getter redefined on its class is the one that runs.
+const hasOwn = Object.prototype.hasOwnProperty;
+const accessorHolders = new WeakMap<
+  object,
+  Map<string | symbol, object | null>
+>();
+function accessorHolder(
+  proto: object | null,
+  prop: string | symbol,
+): object | null | undefined {
+  if (proto === null) return null;
+  let table = accessorHolders.get(proto);
+  if (!table) {
+    table = new Map();
+    accessorHolders.set(proto, table);
+  }
+  let holder = table.get(prop);
+  if (holder === undefined) {
+    holder = null;
+    for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
+      const desc = Object.getOwnPropertyDescriptor(at, prop);
+      if (desc) {
+        if (!('value' in desc)) holder = at;
+        break;
+      }
+    }
+    table.set(prop, holder);
+  }
+  return holder;
+}
+
 // ── Global state ──────────────────────────────────────────────────────────────
 
 /** Maps every store proxy → its internal bookkeeping. */
@@ -160,7 +193,7 @@ function areDepsValid(deps: DepEntry[]): boolean {
 function evaluateComputed(
   internal: StoreInternal,
   prop: string | symbol,
-  getterFn: () => unknown,
+  holder: object,
   receiver: object,
 ): unknown {
   const cached = internal.computedCache.get(prop);
@@ -183,6 +216,12 @@ function evaluateComputed(
     }
   }
 
+  // The getter is read from its holder only when it has to run.
+  const getterFn = Object.getOwnPropertyDescriptor(holder, prop)?.get;
+  if (!getterFn) {
+    internal.computedCache.delete(prop);
+    return Reflect.get(internal.target, prop, receiver);
+  }
   // Push a new tracker frame for this getter evaluation.
   const frame = {internal, prop, deps: [] as DepEntry[]};
   trackerStack.push(frame);
@@ -460,16 +499,17 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     get(_target, prop, receiver) {
       internal.resumeScope();
-      // 1. Check for getters on the prototype chain (computed values).
-      const getterDesc = findPropertyDescriptor(_target, prop);
-      if (getterDesc?.get) {
+      // SPIKE: an own key of a node with no own accessor is data, with no
+      // descriptor allocated. An inherited key is answered per prototype.
+      const holder = hasOwn.call(_target, prop)
+        ? internal.ownAccessors &&
+          Object.getOwnPropertyDescriptor(_target, prop)?.get
+          ? _target
+          : null
+        : accessorHolder(Object.getPrototypeOf(_target), prop);
+      if (holder) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
-        const value = evaluateComputed(
-          internal,
-          prop,
-          getterDesc.get,
-          receiver,
-        );
+        const value = evaluateComputed(internal, prop, holder, receiver);
         // Record as a computed dependency for any parent getter currently tracking.
         // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
         recordComputedDep(internal, prop, value);
@@ -501,6 +541,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     defineProperty(_target, prop, descriptor) {
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && (descriptor.get || descriptor.set))
+        internal.ownAccessors = true;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -538,6 +580,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
         if (desc && 'value' in desc)
           linkChild(owner, key, desc.value, nodes, desc);
+        else if (desc) owner.ownAccessors = true;
       }
     }
   }
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..a633342 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -6,6 +6,7 @@ type ParentReference = {deref(): StoreInternal | undefined};
 export class StoreInternal {
   version = 0;
   isStoreRoot = false;
+  ownAccessors = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
```

### F2, the holder table that reads the descriptor at each read (fallback), on the unmodified source

`f2-accessor-holder-table.patch`:

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..728f337 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -7,6 +7,41 @@ import {
 import type {DepEntry} from './core.types';
 import {StoreInternal} from './ownership';
 
+// Per prototype and key: the prototype object that holds an accessor for the
+// key, or `null` when the key is data or absent. The accessor itself is read
+// at each read, so a getter redefined on its class is the one that runs.
+const hasOwn = Object.prototype.hasOwnProperty;
+const accessorHolders = new WeakMap<
+  object,
+  Map<string | symbol, object | null>
+>();
+function inheritedGetter(
+  proto: object | null,
+  prop: string | symbol,
+): (() => unknown) | undefined {
+  if (proto === null) return undefined;
+  let table = accessorHolders.get(proto);
+  if (!table) {
+    table = new Map();
+    accessorHolders.set(proto, table);
+  }
+  let holder = table.get(prop);
+  if (holder === undefined) {
+    holder = null;
+    for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
+      const desc = Object.getOwnPropertyDescriptor(at, prop);
+      if (desc) {
+        if (!('value' in desc)) holder = at;
+        break;
+      }
+    }
+    table.set(prop, holder);
+  }
+  return holder
+    ? Object.getOwnPropertyDescriptor(holder, prop)?.get
+    : undefined;
+}
+
 // ── Global state ──────────────────────────────────────────────────────────────
 
 /** Maps every store proxy → its internal bookkeeping. */
@@ -460,16 +495,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     get(_target, prop, receiver) {
       internal.resumeScope();
-      // 1. Check for getters on the prototype chain (computed values).
-      const getterDesc = findPropertyDescriptor(_target, prop);
-      if (getterDesc?.get) {
+      // SPIKE: an own key of a node with no own accessor is data, with no
+      // descriptor allocated. An inherited key is answered per prototype.
+      const getter = hasOwn.call(_target, prop)
+        ? internal.ownAccessors
+          ? Object.getOwnPropertyDescriptor(_target, prop)?.get
+          : undefined
+        : inheritedGetter(Object.getPrototypeOf(_target), prop);
+      if (getter) {
         // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
-        const value = evaluateComputed(
-          internal,
-          prop,
-          getterDesc.get,
-          receiver,
-        );
+        const value = evaluateComputed(internal, prop, getter, receiver);
         // Record as a computed dependency for any parent getter currently tracking.
         // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
         recordComputedDep(internal, prop, value);
@@ -501,6 +536,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     defineProperty(_target, prop, descriptor) {
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && (descriptor.get || descriptor.set))
+        internal.ownAccessors = true;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -538,6 +575,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
         if (desc && 'value' in desc)
           linkChild(owner, key, desc.value, nodes, desc);
+        else if (desc) owner.ownAccessors = true;
       }
     }
   }
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..a633342 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -6,6 +6,7 @@ type ParentReference = {deref(): StoreInternal | undefined};
 export class StoreInternal {
   version = 0;
   isStoreRoot = false;
+  ownAccessors = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
```

### F3, three native searches (recommended), on `t2.patch`

`f3-native-delta.patch`:

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -382,22 +382,34 @@
 }
 
 /**
- * `includes`, `indexOf` and `lastIndexOf` on a list find an object by its
- * identity: the raw object, its store proxy and its snapshots are one value.
+ * `includes`, `indexOf` and `lastIndexOf` on a list. An element that is a node
+ * of a store is found by its identity: its raw object, its proxy and its
+ * snapshots are one value. Any other element, such as a frozen snapshot kept
+ * as a value, is found by reference, as in a plain array.
  */
-function searchByIdentity(
+function searchList(
+  list: unknown[],
+  prop: 'includes' | 'indexOf' | 'lastIndexOf',
   method: (...args: unknown[]) => unknown,
-  target: unknown[],
-  args: unknown[],
+  wanted: unknown,
+  from: unknown[],
 ): unknown {
-  const wanted = args[0];
   // A primitive is found by the native search on the raw list.
   if (typeof wanted !== 'object' || wanted === null)
-    return Reflect.apply(method, target, args);
-  return Reflect.apply(method, target.map(identityOf), [
-    identityOf(wanted),
-    ...args.slice(1),
-  ]);
+    return method.call(list, wanted, ...from);
+  const back = prop === 'lastIndexOf';
+  const search = back ? list.lastIndexOf : list.indexOf;
+  const ref = unwrap(wanted);
+  // The element itself, by reference; then, for a node, its raw object and
+  // its proxy, which every form of it shares.
+  let at = search.apply(list, [ref, ...from] as [unknown]);
+  const node = targetNodes.get(snapshotSources.get(ref) ?? ref);
+  if (node)
+    for (const form of [node.target, node.proxy]) {
+      const i = search.apply(list, [form, ...from] as [unknown]);
+      if (i >= 0 && (at < 0 || (back ? i > at : i < at))) at = i;
+    }
+  return prop === 'includes' ? at >= 0 : at;
 }
 
 /** Native array length writes remove indices without invoking DELETE traps. */
@@ -507,9 +519,13 @@
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
         if (Array.isArray(_target)) {
-          if (prop === 'includes' || prop === 'indexOf' || prop === 'lastIndexOf')
-            return (...args: unknown[]) =>
-              searchByIdentity(method, _target, args);
+          if (
+            prop === 'includes' ||
+            prop === 'indexOf' ||
+            prop === 'lastIndexOf'
+          )
+            return (wanted: unknown, ...from: unknown[]) =>
+              searchList(_target, prop, method, wanted, from);
           return transactional(method, receiver);
         }
         const cached = boundMethods.get(prop);
```

### F3, one loop, on `t2.patch`

`f3-loop-delta.patch`:

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -382,22 +382,43 @@
 }
 
 /**
- * `includes`, `indexOf` and `lastIndexOf` on a list find an object by its
- * identity: the raw object, its store proxy and its snapshots are one value.
+ * `includes`, `indexOf` and `lastIndexOf` on a list. An element that is a node
+ * of a store is found by its identity: its raw object, its proxy and its
+ * snapshots are one value. Any other element, such as a frozen snapshot kept
+ * as a value, is found by reference, as in a plain array.
  */
-function searchByIdentity(
+function searchList(
+  list: unknown[],
+  prop: 'includes' | 'indexOf' | 'lastIndexOf',
   method: (...args: unknown[]) => unknown,
-  target: unknown[],
-  args: unknown[],
+  wanted: unknown,
+  from: unknown[],
 ): unknown {
-  const wanted = args[0];
   // A primitive is found by the native search on the raw list.
   if (typeof wanted !== 'object' || wanted === null)
-    return Reflect.apply(method, target, args);
-  return Reflect.apply(method, target.map(identityOf), [
-    identityOf(wanted),
-    ...args.slice(1),
-  ]);
+    return method.call(list, wanted, ...from);
+  const ref = unwrap(wanted);
+  const id = snapshotSources.get(ref) ?? ref;
+  const length = list.length;
+  const back = prop === 'lastIndexOf';
+  const has = prop === 'includes';
+  // The start index as the native methods compute it.
+  let index = from.length
+    ? Math.trunc(+(from[0] as number)) || 0
+    : back
+      ? -1
+      : 0;
+  if (index < 0) index += length;
+  for (
+    index = back ? Math.min(index, length - 1) : Math.max(index, 0);
+    back ? index >= 0 : index < length;
+    index += back ? -1 : 1
+  ) {
+    const element = list[index] as object;
+    const node = targetNodes.get(element) ?? internalsMap.get(element);
+    if (node ? node.target === id : element === ref) return has || index;
+  }
+  return has ? false : -1;
 }
 
 /** Native array length writes remove indices without invoking DELETE traps. */
@@ -507,9 +528,13 @@
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
         if (Array.isArray(_target)) {
-          if (prop === 'includes' || prop === 'indexOf' || prop === 'lastIndexOf')
-            return (...args: unknown[]) =>
-              searchByIdentity(method, _target, args);
+          if (
+            prop === 'includes' ||
+            prop === 'indexOf' ||
+            prop === 'lastIndexOf'
+          )
+            return (wanted: unknown, ...from: unknown[]) =>
+              searchList(_target, prop, method, wanted, from);
           return transactional(method, receiver);
         }
         const cached = boundMethods.get(prop);
```

### F4 half A, on the getter combination

`f4a-delta.patch`:

```diff
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -58,8 +58,15 @@
  */
 const THREW = Symbol('threw');
 
-/** A snapshot is frozen: a getter that writes to `this` is refused. */
-const refuse = () => false;
+/**
+ * A snapshot is frozen: a getter that writes to `this` is refused. It throws,
+ * because a trap that returns `false` is ignored by sloppy-mode code.
+ */
+const refuse = (_target: object, prop: string | symbol): never => {
+  throw new TypeError(
+    `@codebelt/classy-store: a getter cannot write to a snapshot (${String(prop)})`,
+  );
+};
 
 /**
  * Cross-snapshot getter memoization cache.
```

### F4 half B, on the getter combination with half A

`f4b-delta.patch`:

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -83,6 +83,19 @@
   return new Error(
     `@codebelt/classy-store: circular computed getter dependency: ${path.map(String).join(' → ')}`,
   );
+}
+
+/**
+ * A getter must not write to the node it is computed on, on the live store as
+ * on a snapshot. A write to any other node, such as a store constructed or a
+ * method of another store called inside the getter, is allowed.
+ */
+function refuseOwnWrite(internal: StoreInternal, prop: string | symbol): void {
+  for (const frame of trackerStack)
+    if (frame.internal === internal)
+      throw new TypeError(
+        `@codebelt/classy-store: a getter cannot write to its own store (${String(prop)})`,
+      );
 }
 
 /** The version of the store node a value is, or -1 when it is not one. */
@@ -406,6 +419,7 @@
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
+      if (trackerStack.length) refuseOwnWrite(internal, prop);
       // Store the snapshot itself, never the render-tracking proxy around it.
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
@@ -504,6 +518,7 @@
     },
 
     defineProperty(_target, prop, descriptor) {
+      if (trackerStack.length) refuseOwnWrite(internal, prop);
       const defined = Reflect.defineProperty(_target, prop, descriptor);
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
@@ -518,6 +533,7 @@
 
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      if (trackerStack.length) refuseOwnWrite(internal, prop);
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
```

The `__lookupGetter__` form of F2 is the holder table with its last line replaced by `return holder ? lookupGetter.call(holder, prop) : undefined;`, where `lookupGetter = Object.prototype.__lookupGetter__`.

The combination of F1, F2 and F3 is `f3-search-native-on-t2.patch` (that is `t2.patch` with the F3 delta), then `t3a.patch`, then `f1-delta.patch`, then `f2-holder-lazy.patch` with `--reject`; its one rejected hunk is the line `if (descriptor.get || descriptor.set) internal.ownAccessors = true;`, placed after the `Reflect.defineProperty` call of `t3a`'s trap.

## Appendix: scripts

Each takes the worktree to load as its argument, except `f2-bench.sh` and `f2-bench-getter.sh`, which run the builds saved under `<scratch>/stage-3-spike-core-2/builds/` (each a copy of `dist`, its `package.json`, a link to `node_modules` and the benchmark folder), and `f3-bench.mjs`, which takes a build folder.

### `f1-freeze.ts`

```ts
// F1 probe: what a read-only property hands out, before and after.
// Usage: bun f1-freeze.ts <worktree>
const lib = process.argv[2];
const {createClassyStore, subscribe, snapshot} = await import(
  `${lib}/packages/classy-store/src/index.ts`
);

type Row = {
  case: string;
  reads: string;
  writeNotifies: string;
  outerNotified: string;
  snapHolds: string;
};
const rows: Row[] = [];

function describeSnap(v: unknown, proxy: object, raw: object) {
  if (v === raw) return 'raw object';
  if (v === proxy) return 'proxy';
  if (v && Object.isFrozen(v)) return 'frozen snapshot';
  return String(v);
}

// origin: how the child got into the container
//   store: a separate store placed by its proxy
//   plain: a plain object assigned through the store
//   create: a plain object present when the store was created
// how: freeze | seal | define | list | root
function run(origin: 'store' | 'plain' | 'create', how: string) {
  const rawChild = {n: 0};
  let childProxy: any;
  let outer: any;
  let read: () => any;
  if (how === 'root') {
    if (origin === 'plain') return; // cannot assign into a frozen root
    const value = origin === 'store' ? createClassyStore(rawChild) : rawChild;
    outer = createClassyStore(Object.freeze({inner: value}));
    childProxy = origin === 'store' ? value : undefined;
    read = () => outer.inner;
  } else if (how === 'list') {
    if (origin === 'create') {
      outer = createClassyStore({rows: [rawChild]});
    } else {
      outer = createClassyStore({rows: [] as any[]});
      outer.rows.push(
        origin === 'store' ? createClassyStore(rawChild) : rawChild,
      );
    }
    childProxy = outer.rows[0];
    Object.freeze(outer.rows);
    read = () => outer.rows[0];
  } else {
    if (origin === 'create') {
      outer = createClassyStore({inner: rawChild});
    } else {
      outer = createClassyStore({inner: null as any});
      outer.inner = origin === 'store' ? createClassyStore(rawChild) : rawChild;
    }
    childProxy = outer.inner;
    if (how === 'freeze') Object.freeze(outer);
    if (how === 'seal') Object.seal(outer);
    if (how === 'define')
      Object.defineProperty(outer, 'inner', {
        writable: false,
        configurable: false,
      });
    read = () => outer.inner;
  }
  let outerCalls = 0;
  subscribe(outer, () => outerCalls++, {sync: true});
  let childCalls = 0;
  if (childProxy) subscribe(childProxy, () => childCalls++, {sync: true});
  const got = read();
  const reads =
    got === rawChild ? 'raw' : got === childProxy ? 'its proxy' : 'other';
  const snapBefore = snapshot(outer);
  try {
    got.n++;
  } catch (e) {
    rows.push({
      case: `${origin} / ${how}`,
      reads,
      writeNotifies: `threw ${(e as Error).message}`,
      outerNotified: '',
      snapHolds: '',
    });
    return;
  }
  const snapAfter = snapshot(outer);
  const holdBefore = how === 'list' ? snapBefore.rows[0] : snapBefore.inner;
  const holdAfter = how === 'list' ? snapAfter.rows[0] : snapAfter.inner;
  rows.push({
    case: `${origin} / ${how}`,
    reads,
    writeNotifies: childProxy ? `child ${childCalls}` : 'no child proxy',
    outerNotified: String(outerCalls),
    snapHolds: `${describeSnap(holdAfter, childProxy, rawChild)}, n=${(holdAfter as any).n}, new snap: ${snapAfter !== snapBefore}`,
  });
}

for (const how of ['freeze', 'list', 'root', 'seal', 'define'])
  for (const origin of ['store', 'plain', 'create'] as const) run(origin, how);

for (const r of rows)
  console.log(
    `| ${r.case} | ${r.reads} | ${r.writeNotifies} | ${r.outerNotified} | ${r.snapHolds} |`,
  );

// Freezing stays silent?
{
  const outer = createClassyStore({
    inner: {n: 0},
    b: createClassyStore({m: 1}),
  });
  let calls = 0;
  subscribe(outer, () => calls++, {sync: true});
  Object.freeze(outer);
  console.log('freeze notifies outer:', calls);
}
```

### `f1-edges.ts`

```ts
const lib = process.argv[2];
const {createClassyStore, subscribe, snapshot} = await import(
  `${lib}/packages/classy-store/src/index.ts`
);
const t = (name: string, f: () => unknown) => {
  try {
    console.log(name, f());
  } catch (e) {
    console.log(name, 'threw', (e as Error).message);
  }
};
t('freeze twice:', () => {
  const o = createClassyStore({a: {n: 0}});
  Object.freeze(o);
  Object.freeze(o);
  return Object.isFrozen(o);
});
t('read-only define with raw of node, value given:', () => {
  const inner = createClassyStore({n: 0});
  const raw = {n: 0};
  const o = createClassyStore({x: raw});
  const p = o.x;
  Object.defineProperty(o, 'y', {
    value: raw,
    writable: false,
    configurable: false,
  });
  return o.y === p ? 'proxy' : o.y === raw ? 'raw' : 'other';
});
t('read-only define with proxy given:', () => {
  const inner = createClassyStore({n: 0});
  const o = createClassyStore({} as any);
  Object.defineProperty(o, 'y', {
    value: inner,
    writable: false,
    configurable: false,
  });
  let c = 0;
  subscribe(o, () => c++, {sync: true});
  o.y.n++;
  return `${o.y === inner} outer calls ${c}`;
});
t('writable define with proxy given stores raw:', () => {
  const inner = createClassyStore({n: 0});
  const o = createClassyStore({} as any);
  Object.defineProperty(o, 'y', {
    value: inner,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  let c = 0;
  subscribe(o, () => c++, {sync: true});
  o.y.n++;
  return `${o.y === inner} outer calls ${c}`;
});
t('writable:false only (configurable) keeps raw, still child:', () => {
  const o = createClassyStore({x: {n: 0}});
  const p = o.x;
  Object.defineProperty(o, 'x', {writable: false});
  let c = 0;
  subscribe(o, () => c++, {sync: true});
  o.x.n++;
  return `${o.x === p} calls ${c}`;
});
t('frozen list snapshot rows frozen:', () => {
  const o = createClassyStore({rows: [{n: 1}, {n: 2}]});
  Object.freeze(o.rows);
  const s = snapshot(o);
  return Object.isFrozen(s.rows[0]) && s.rows[1].n === 2;
});
t('sort of a frozen list throws:', () => {
  const o = createClassyStore({rows: [{n: 2}, {n: 1}]});
  Object.freeze(o.rows);
  o.rows.sort((a: any, b: any) => a.n - b.n);
  return 'sorted';
});
t('replace a frozen property throws:', () => {
  const o = createClassyStore({x: {n: 0}});
  Object.freeze(o);
  o.x = {n: 5};
  return 'replaced';
});
```

### `f1-invariant.ts`

```ts
// Can a defineProperty trap store a different value than the one given for a read-only property?
const raw = {n: 0};
const proxyOfRaw = new Proxy(raw, {});
const target: any = {};
const p = new Proxy(target, {
  defineProperty(t, k, d) {
    return Reflect.defineProperty(t, k, {...d, value: proxyOfRaw});
  },
});
try {
  Object.defineProperty(p, 'x', {
    value: raw,
    writable: false,
    configurable: false,
  });
  console.log('explicit value swapped: ok');
} catch (e) {
  console.log('explicit value swapped:', (e as Error).message);
}
const t2: any = {x: raw};
const p2 = new Proxy(t2, {
  defineProperty(t, k, d) {
    return Reflect.defineProperty(t, k, {...d, value: proxyOfRaw});
  },
});
try {
  Object.freeze(p2);
  console.log(
    'freeze (no value in descriptor) swapped: ok',
    t2.x === proxyOfRaw,
  );
} catch (e) {
  console.log('freeze swapped:', (e as Error).message);
}
```

### `f2-table-more.ts`

```ts
// F2: prototype changes after the first read, beyond the reviewer's table.ts.
const lib = process.argv[2];
const {createClassyStore, snapshot} = await import(
  `${lib}/packages/classy-store/src/index.ts`
);
// 1. A key first read as absent, then a getter is added to the class.
class A {
  n = 1;
}
const a = createClassyStore(new A()) as any;
a.twice;
Object.defineProperty(A.prototype, 'twice', {
  get() {
    return this.n * 2;
  },
  configurable: true,
});
a.n = 2;
console.log(
  'getter added after a miss: live',
  a.twice,
  'snapshot',
  (snapshot(a) as any).twice,
);
// 2. A subclass gains an override of an inherited getter after the first read.
class B {
  n = 1;
  get v() {
    return this.n;
  }
}
class C extends B {}
const c = createClassyStore(new C()) as any;
c.v;
Object.defineProperty(C.prototype, 'v', {
  get() {
    return this.n * 100;
  },
  configurable: true,
});
c.n = 2;
console.log(
  'override added on the subclass later: live',
  c.v,
  'snapshot',
  (snapshot(c) as any).v,
);
// 3. A getter deleted from the class (falls back to nothing).
class E {
  get w() {
    return 5;
  }
}
const e = createClassyStore(new E()) as any;
e.w;
delete (E.prototype as any).w;
console.log('getter deleted from the class: live', e.w);
```

### `f2-lazy.ts`

```ts
// F2: getter replaced or removed on the class, then a dependency changes.
const lib = process.argv[2];
const {createClassyStore} = await import(
  `${lib}/packages/classy-store/src/index.ts`
);
class Flag {
  x = 1;
  get on(): unknown {
    return this.x > 0;
  }
}
const f = createClassyStore(new Flag());
f.on;
Object.defineProperty(Flag.prototype, 'on', {
  value: 'data',
  configurable: true,
  writable: true,
});
const before = f.on;
f.x = 2;
console.log('replaced by data: before a write', before, 'after a write', f.on);
class G {
  x = 1;
  get w(): unknown {
    return this.x;
  }
}
const g = createClassyStore(new G());
g.w;
delete (G.prototype as any).w;
const b2 = g.w;
g.x = 2;
console.log('deleted: before a write', b2, 'after a write', g.w);
```

### `f2-bench.sh`

```bash
#!/bin/bash
# F2: three builds back to back, both engines, three rounds, five runs each.
D=$(cd "$(dirname "$0")/.." && pwd)
out=$D/f2-bench
mkdir -p $out
for round in 1 2 3; do
  for b in base table holder; do
    cd $D/builds/$b
    for eng in bun node; do
      for only in read getter.cached store.method; do
        $eng packages/classy-store/tests/benchmark/runCoreBenchmark.mjs --runs 5 --only $only 2>&1 \
          | grep -E '^\| (store|proxy)\.|^\| getter|^\| read' \
          | sed "s/^/$round $b $eng /" >> $out/results.txt
      done
    done
  done
done
echo done >> $out/results.txt
```

### `f2-bench-getter.sh`

```bash
#!/bin/bash
# F2, second pass: getter.cached on four builds back to back, both engines, three rounds of five runs.
D=$(cd "$(dirname "$0")/.." && pwd)
out=$D/f2-bench/getter.txt
for round in 1 2 3; do
  for b in ${BUILDS:-base table holder lookup}; do
    cd $D/builds/$b
    for eng in bun node; do
      $eng packages/classy-store/tests/benchmark/runCoreBenchmark.mjs --runs 5 --only getter.cached 2>&1 \
        | grep -E '^\| getter' | sed "s/^/$round $b $eng /" >> $out
    done
  done
done
echo done >> $out
```

### `f3-search.ts`

```ts
// F3: searches on a list in a store, against a plain array holding the same values.
const lib = process.argv[2];
const {createClassyStore, snapshot} = await import(
  `${lib}/packages/classy-store/src/index.ts`
);
const out: string[] = [];
const row = (label: string, got: unknown, plain: unknown) =>
  out.push(
    `| ${label} | ${String(got)} | ${String(plain)} |${Object.is(got, plain) ? '' : ' differs'}`,
  );
// The reviewer's case: a list of saved snapshots of one object.
{
  const store = createClassyStore({doc: {title: 'a'}, versions: [] as any[]});
  const v1 = snapshot(store.doc);
  store.versions.push(v1);
  store.doc.title = 'b';
  const v2 = snapshot(store.doc);
  store.versions.push(v2);
  store.doc.title = 'c';
  const v3 = snapshot(store.doc);
  const plain = [v1, v2];
  row('versions.indexOf(v2)', store.versions.indexOf(v2), plain.indexOf(v2));
  row(
    'versions.includes(v3), never pushed',
    store.versions.includes(v3),
    plain.includes(v3),
  );
  row(
    'versions.lastIndexOf(v1)',
    store.versions.lastIndexOf(v1),
    plain.lastIndexOf(v1),
  );
  row(
    'versions.includes(store.doc)',
    store.versions.includes(store.doc),
    plain.includes(store.doc),
  );
}
// T2's reproduction: live rows.
{
  const raw = {id: 1};
  const other = {id: 2};
  const store = createClassyStore({rows: [] as any[]});
  store.rows.push(raw, other);
  const proxy = store.rows[0];
  const snap = snapshot(store).rows[0];
  store.rows[0].id = 10; // the snapshot is now of an older version
  row('rows.includes(raw)', store.rows.includes(raw), true);
  row('rows.includes(its proxy)', store.rows.includes(proxy), true);
  row('rows.indexOf(older snapshot of row 0)', store.rows.indexOf(snap), 0);
  row('rows.indexOf(other, 1)', store.rows.indexOf(other, 1), 1);
  row('rows.indexOf(raw, 1)', store.rows.indexOf(raw, 1), -1);
  row('rows.indexOf(raw, -2)', store.rows.indexOf(raw, -2), 0);
  row('rows.lastIndexOf(other, 0)', store.rows.lastIndexOf(other, 0), -1);
  row('rows.lastIndexOf(raw, -2)', store.rows.lastIndexOf(raw, -2), 0);
  row('rows.lastIndexOf(other, -3)', store.rows.lastIndexOf(other, -3), -1);
  row(
    'rows.lastIndexOf(other, undefined)',
    store.rows.lastIndexOf(other, undefined),
    [raw, other].lastIndexOf(other, undefined),
  );
  row(
    'rows.includes({id: 2}), an equal object',
    store.rows.includes({id: 2}),
    false,
  );
}
// Primitives and NaN.
{
  const store = createClassyStore({list: [1, NaN, 'a', undefined] as any[]});
  const plain = [1, NaN, 'a', undefined];
  row('includes(NaN)', store.list.includes(NaN), plain.includes(NaN));
  row('indexOf(NaN)', store.list.indexOf(NaN), plain.indexOf(NaN));
  row("indexOf('a', -2)", store.list.indexOf('a', -2), plain.indexOf('a', -2));
  row(
    'includes(undefined)',
    store.list.includes(undefined),
    plain.includes(undefined),
  );
}
// Opaque values: a Date, and an object frozen by its owner.
{
  const date = new Date(0);
  const frozen = Object.freeze({k: 1});
  const store = createClassyStore({list: [date, frozen] as any[]});
  row('includes(date)', store.list.includes(date), true);
  row('indexOf(frozen)', store.list.indexOf(frozen), 1);
  row('includes(new Date(0))', store.list.includes(new Date(0)), false);
}
console.log(out.join('\n'));
```

### `f3-bench.mjs`

```js
// F3: time of `includes` on a list of 1,000 rows. Usage: <engine> f3-bench.mjs <build dir>
const dir = process.argv[2];
const {createClassyStore} = await import(
  `${dir}/packages/classy-store/dist/index.mjs`
);
const rows = Array.from({length: 1000}, (_, id) => ({id}));
const store = createClassyStore({rows: rows.slice()});
const plain = rows.slice();
const last = rows[999];
const lastProxy = store.rows[999];
const missing = {id: -1};
const cases = {
  'plain.includes(last row)': () => plain.includes(last),
  'store.rows.includes(last row, raw)': () => store.rows.includes(last),
  'store.rows.includes(last row, proxy)': () => store.rows.includes(lastProxy),
  'store.rows.includes(missing object)': () => store.rows.includes(missing),
  'store.rows.includes(a number)': () => store.rows.includes(5),
};
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
for (const [name, fn] of Object.entries(cases)) {
  let n = 1;
  for (;;) {
    const t = performance.now();
    for (let i = 0; i < n; i++) fn();
    if (performance.now() - t > 20) break;
    n *= 2;
  }
  const samples = [];
  for (let s = 0; s < 15; s++) {
    const t = performance.now();
    for (let i = 0; i < n; i++) fn();
    samples.push(((performance.now() - t) * 1e6) / n);
  }
  console.log(`${name}\t${median(samples).toFixed(0)} ns\t(result ${fn()})`);
}
```

### `f4-writes.ts`

```ts
// F4: a getter that writes, on the live store and on a snapshot.
const lib = process.argv[2];
const mod = await import(`${lib}/packages/classy-store/src/index.ts`);
const {createClassyStore, snapshot} = mod;
const Base: any =
  mod.ClassyStore ??
  function (this: object) {
    return createClassyStore(this);
  };
const other = createClassyStore({n: 0});
class Sub extends Base {
  n = 7;
}
const cases: Record<string, () => any> = {
  'this.cache ??= …': () =>
    class {
      n = 2;
      cache?: number;
      get v() {
        return (this.cache ??= this.n * 2);
      }
    },
  'this.child.x = 1': () =>
    class {
      child = {x: 0};
      get v() {
        this.child.x = 1;
        return this.child.x;
      }
    },
  'this.list.push(1)': () =>
    class {
      list: number[] = [];
      get v() {
        this.list.push(1);
        return this.list.length;
      }
    },
  'other.n = 1': () =>
    class {
      get v() {
        other.n = 1;
        return other.n;
      }
    },
  'new Sub() inside the getter': () =>
    class {
      get v() {
        return (new Sub() as any).n;
      }
    },
  'calls a prototype method that writes': () =>
    class {
      count = 0;
      bump() {
        this.count++;
      }
      get v() {
        this.bump();
        return this.count;
      }
    },
};
const show = (f: () => unknown) => {
  try {
    return `returns ${JSON.stringify(f())}`;
  } catch (e) {
    return `throws ${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};
for (const [name, make] of Object.entries(cases)) {
  other.n = 0;
  const live = createClassyStore(new (make())());
  const l = show(() => live.v);
  const snapStore = createClassyStore(new (make())());
  const s = show(() => snapshot(snapStore).v);
  console.log(`| ${name} | ${l} | ${s} |`);
}
// Sloppy code: an object-literal getter compiled without "use strict".
const sloppy = Function(
  'return {n: 1, get v() { this.n = 5; return this.n; }}',
);
console.log(
  `| sloppy object-literal getter, this.n = 5 | ${show(() => createClassyStore(sloppy()).v)} | ${show(() => snapshot(createClassyStore(sloppy())).v)} |`,
);
const sloppyDel = Function(
  'return {n: 1, get v() { delete this.n; return this.n; }}',
);
console.log(
  `| sloppy, delete this.n | ${show(() => createClassyStore(sloppyDel()).v)} | ${show(() => snapshot(createClassyStore(sloppyDel())).v)} |`,
);
const sloppyDef = Function(
  'return {n: 1, get v() { Object.defineProperty(this, "n", {value: 9}); return this.n; }}',
);
console.log(
  `| defineProperty(this, …) | ${show(() => createClassyStore(sloppyDef()).v)} | ${show(() => snapshot(createClassyStore(sloppyDef())).v)} |`,
);
```

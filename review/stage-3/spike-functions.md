# Stage 3 spike: one rule for functions held by a store

Status: **complete for the brief.**

- Worktree: a detached copy of `release/1.0` (the library source is the same
  as at `57404c3`) in `<scratch>/stage-3-spike-functions/wt`. Three more for
  the comparison columns: `wt-strict` (the base below), `wt-w2` (the base
  with W2 "on create", decision 11 as written) and `wt-lenient`
  (`t1-lenient.patch` alone). Nothing is committed anywhere.
- Base: `c1-t1strict.patch` of `spike-classes.md`, which is T3 (a), T1
  strict and the base class C1, without W2. On it, 1,313 tests pass and 28
  fail (the 27 of the two trap patches and the export list), and the main
  entry is 3,718 bytes.
- Patches: `<scratch>/stage-3-spike-functions/patches/`, and in appendix B.
- Also taken in, at the orchestrating agent's request:
  `review/stage-3/adversarial-core.md`, objections 3, 4 and 17.

## Summary

| Question                               | Answer                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does the rule work?                    | Yes. 27 tests fail against the base's 28: the incidental object-literal test of T1 strict passes again, and nothing new fails. An object-literal method is one transaction again and works detached                                                                                                                                  |
| Lenient's three defects                | A copied wrapper and a stale getter: both removed. A frozen function: kept as it is. A bound function present at creation: wrapped, so `store.bound !== bound`                                                                                                                                                                       |
| Where the wrapper lives                | In the raw object, as W2 does. Then the store, the raw object, every snapshot and every list it is pushed into hold one function, and `store.cb = store.cb` is no change. The cost: the store rewrites the functions of an object it is given                                                                                        |
| Does the base class still need a rule? | No. "Written to a field that does not exist yet" is W2 "on create" for every store, so `ClassyStore` has no code of its own beyond its 4 lines                                                                                                                                                                                       |
| Objections 3, 4, 17                    | 3 fixed (wrappers per node). 4: the override is fixed by "a function that replaces a method is a method", which costs the identity of a callback that replaces a function default; a cheaper form fixes it only where class fields are definitions. A callback written after `delete` or to a new key is wrapped. 17 fixed (the key) |
| What it costs                          | The identity of any function an object is born with: a callback in the initial state, one written to a new key, a bound function, one that replaces a method. 3,888 bytes: 170 more than strict, 81 more than strict with W2 "on create"                                                                                             |
| Recommendation                         | **This rule, in its full form (F1).** Before 1.0. It replaces decision 1's strict rule and decision 11's exception with one rule, and settles objection 8                                                                                                                                                                            |

## The rule as the code tests it

The brief's wording, made exact by what the patch checks:

> A function is a **method** of the object that holds it, bound to that
> object's store and run as one transaction, when it has no `prototype`
> property of its own (an arrow function, a shorthand method, an `async`
> function, a bound function, most native functions) and it is one of:
>
> 1. found on the prototype chain under any key but `constructor` (as
>    today; this case does not check `prototype`);
> 2. an own property of the object when the object becomes a node of a store
>    (`createClassyStore(obj)`, or a plain object placed in a store);
> 3. written through the store to a key the object does not have yet, by
>    assignment or `Object.defineProperty`;
> 4. written through the store over a method of that same node (F1 only).
>
> Anything else is data and is kept as it is: an element or own property of
> an array, a function with its own `prototype` (a class, a `function`
> declaration or expression, a generator), a frozen function, a store made
> from a function, and any function written over a field that does not hold
> a method.

"An arrow function" is not the test. A shorthand method (`inc() {}`), an
`async function`, a bound function and `JSON.parse` all have no own
`prototype` and are methods under it; `function () {}` has one and is data.

## What was changed

`core.ts` only, on top of the base: `rule-f1.patch`, 71 lines added and 13
removed, of which about 30 are comments and type lines.

- **One wrapper per node and function.** `methodOf(node, fn, receiver, key)`
  keeps a `WeakMap` per node, made on the first method read, from a function
  to its wrapper, and a module `WeakMap` from each wrapper to the node that
  made it. Prototype methods use the same cache, so the per-node `WeakMap`
  that T1 strict made at every node creation is gone.
- **`bornValue(node, key, value)`** returns the method for a function the
  rule covers and the value itself otherwise. It names the wrapper after the
  key it was found under.
- **At node creation**, the loop that already reads every own descriptor
  writes the method into the raw object in place of a writable own function.
- **`set` and `defineProperty`** call `bornValue` when the write creates the
  key, and in F1 when it replaces a method of this node. A setter receives
  the value as it was given. The `get` trap is T1 strict's, unchanged: an own
  function, which is now the wrapper itself, takes the data path, so a read
  records a dependency.

F1b (`rule-f1b.patch`) differs in one place: only `defineProperty` treats a
write over a method as a method; an assignment over a method is data.

## 1. The cases

Each row was run by `repro/cases.ts` (appendix C) on all five builds. "Today"
is the unmodified source. "Strict" is the base: T1 strict and the base class
without W2. "W2 oc" is the base with W2 "on create", which is decision 11 as
written. A blank in "Today" and "Lenient" means the row needs `ClassyStore`,
which they do not have.

### The thirteen rows of T1

| Case                                                        | Today                  | Lenient     | Strict             | W2 oc              | This rule                                   |
| ----------------------------------------------------------- | ---------------------- | ----------- | ------------------ | ------------------ | ------------------------------------------- |
| A prototype method, two writes                              | 1 notification         | 1           | 1                  | 1                  | 1                                           |
| An array method, `list.push === list.push`                  | false                  | true        | true               | true               | true                                        |
| A getter that returns a function                            | memoized               | memoized    | memoized           | memoized           | memoized                                    |
| An own `function`: `store.handler === handler`              | false                  | false       | true               | true               | **true**: it has a `prototype`, so data     |
| An object-literal method, two writes                        | 1, works detached      | 1, detached | 2, detached throws | 2, detached throws | **1, works detached**                       |
| An own arrow at creation: `store.arrow === arrow`           | false                  | false       | true               | true               | **false**: a method                         |
| A function in a list: `indexOf(first)`                      | -1                     | 0           | 0                  | 0                  | 0                                           |
| A class as a value: statics, `instanceof`                   | `undefined`, false     | right       | right              | right              | right                                       |
| A `function` constructor as a value: `===`                  | false                  | false       | true               | true               | true                                        |
| A bound function: `store.bound === bound`                   | false                  | false       | true               | true               | **false**: a method; it still runs as bound |
| A frozen function: `===`                                    | false                  | false       | true               | true               | true                                        |
| `constructor`, on the store and the snapshot                | a wrapper; they differ | the class   | the class          | the class          | the class                                   |
| A store made from a function, held: `holder.fn === fnStore` | false                  | false       | true               | true               | true                                        |

### The rows the brief adds

| Case                                                                         | Today          | Lenient | Strict             | W2 oc              | This rule                                     |
| ---------------------------------------------------------------------------- | -------------- | ------- | ------------------ | ------------------ | --------------------------------------------- |
| An arrow in an object literal that writes two fields through `store`         | 1              | 1       | 2                  | 2                  | **1**                                         |
| A callback in the initial state: `store.onSave === cb`                       | false          | false   | true               | true               | **false**                                     |
| The same, on the snapshot: `snapshot(store).onSave === cb`                   | true           | true    | true               | true               | **false**: the snapshot holds the method      |
| A callback assigned later to a field that exists (`onLater: null`)           | false          | false   | true               | true               | **true**                                      |
| A callback assigned later to a new key                                       | false          | false   | true               | true               | **false**                                     |
| A callback added to a plain object used as a dictionary, `handlers[id] = cb` | false          | false   | true               | true               | **false**                                     |
| A method of a nested plain object, two writes                                | 1, detached ok | 1       | 2, detached throws | 2, detached throws | **1, detached ok**                            |
| The same object placed in the store after creation, two writes               | 1              | 1       | 2                  | 2                  | **1**                                         |
| ... and the raw object still holds its own function                          | true           | true    | true               | true               | **false**: the store wrote the method into it |
| A class without the base class, with an arrow field that writes two fields   | 0, write lands | 0       | 0                  | 0                  | **0**: unchanged, writes go to the raw object |

The last row is objection 9's first item. No rule about which functions are
wrapped can fix it: the arrow's `this` is the raw instance whatever the store
hands out. Only the base class does.

## 2. The three defects the lenient variant keeps

| Defect                                                        | Today and lenient                                           | This rule                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A read wrapper gets stored: `store.inc = store.inc`           | notifies; the field then holds a wrapper                    | **Removed.** No notification, the same function after                                                                                                               |
| ... copied to another field, to a new key, pushed into a list | each copy a new function; a list holds what no read returns | **Removed.** Every copy `=== store.inc`, `includes` finds it. Calling the pushed one writes the store (strict: it writes nothing, `this` is the list)               |
| A getter that calls a function held in a field goes stale     | the store answers `a1`, the snapshot `b1`                   | **Removed.** Both `b1`. The field holds the wrapper as data, so a read records a dependency like any other                                                          |
| A frozen function comes back as a different function          | yes                                                         | **Removed** by one check (`Object.isFrozen`), 5 bytes, consistent with "a frozen object is a value"                                                                 |
| A bound function comes back as a different function           | yes                                                         | **Kept** when it is present at creation or written to a new key. A bound function cannot be told from a method: no own `prototype`, and its `name` is the only sign |

The copy defect goes because the wrapper is itself a function with its own
`prototype` (it is a `function` expression), so the rule treats it as data
wherever it is written: it is never wrapped twice, and a list or another
store keeps it as it is, bound to the store that made it.

To remove the bound-function case, the code would have to test
`fn.name.startsWith('bound ')`, which a user can fake and a minifier does not
change. Not done; the docs sentence covers it.

## 3. Where the wrapper lives

**Spiked: in the raw object.** What each part sees, from `repro/cases.ts`:

| What                            | Wrapper in the raw object (this spike)                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The raw object afterwards       | The wrapper, in place of the function it was given (`raw.inc !== original`). The original is reachable only through the wrapper's closure                                                                      |
| `store.inc === raw.inc`         | true                                                                                                                                                                                                           |
| A snapshot                      | The wrapper: `snapshot(store).inc === store.inc`. Calling it writes the live store as one transaction (today it throws a `TypeError`, writing to a frozen object)                                              |
| `shallowEqual` of two snapshots | Equal on the function field: the same wrapper on both                                                                                                                                                          |
| `store.cb = store.cb`           | No change, no notification                                                                                                                                                                                     |
| `withHistory`                   | `store.inc = other` records an entry, and `undo()` leaves `other` in place: functions are skipped, as on every build (finding 60). Under decision 29 undo would put back the wrapper, which is the right value |
| `persist`                       | Leaves out every own function, wrapper or not (`typeof value === 'function'`). Read in the code, not run                                                                                                       |
| `devtools`                      | Sends a snapshot; JSON drops functions. Read, not run                                                                                                                                                          |

**Not spiked: in a table beside the node**, with the raw object untouched and
the wrapper made on read. The first class report ran this form for base-class
stores (`c1-t1strict-ownmethods.patch`, "wrap on read"), and it brought back
what T1 strict removes: the store and its snapshot hold different functions,
and `form.onSave = form.onSave` notifies and stores a wrapper. Repairing it
takes a reverse table so that a write of a wrapper stores the original, a
dependency recorded on the read, and either a snapshot that also wraps or the
store and the snapshot disagreeing for good. Each is more code than the
in-place write, for one gain: the object the user passed keeps its own
functions. I recommend the raw object.

## 4. Does the base class still need a rule of its own?

**No.** Clause 3 of the rule, a function written to a key that does not exist
yet, is the code path of W2 "on create", applied to every node instead of to
an instance of `ClassyStore`. The `instanceof ClassyStore` test is gone and
`ClassyStore` is the 4 lines of C1. The base-class rows of the case table come
out as under W2 "on create" or better:

| Base-class case                                         | W2 oc                      | This rule               |
| ------------------------------------------------------- | -------------------------- | ----------------------- |
| An arrow field, two writes                              | 1                          | 1                       |
| An arrow assigned in the constructor body, two writes   | 1                          | 1                       |
| A declared callback (`= null`) assigned later: `=== cb` | true                       | true                    |
| One shared shorthand method, called on the second store | **writes the first store** | writes the second       |
| A shared `async function`, awaited on the second store  | **writes the first store** | writes the second       |
| An arrow field that overrides the parent's, two writes  | 2                          | 1 (F1)                  |
| The wrapper's `name`                                    | `""`                       | the key (`bump`, `set`) |

## 5. The three objections of `adversarial-core.md`

**Objection 3, one function in two stores.** Reproduced on W2 "on create":
`d2.touch()` writes `d1` (`1, 0`) and `q2.load()` sets `q1.loading`. Under
this rule both write their own store (`0, 1`; `false, true`), on base-class
stores and on two object-literal stores sharing a method. The cache is per
node, which `methodOf` makes on the node's first method read, so creating a
store makes no table.

**Objection 4, three cases.** Compiled twice by Bun's transpiler, with
`useDefineForClassFields` false (assignments) and true (definitions):

| Case                                                                       | W2 oc, assign / define | F1 (replaces a method → method) | F1b (only a definition over a method) | Without either |
| -------------------------------------------------------------------------- | ---------------------- | ------------------------------- | ------------------------------------- | -------------- |
| A subclass's arrow field overrides the parent's, two writes                | 2 / 2                  | **1 / 1**                       | 2 / **1**                             | 2 / 2          |
| A callback field with a no-op default, `= () => {}`, then `= cb`: `=== cb` | true                   | **false**                       | true                                  | true           |
| A plain store's `onSave: () => {}`, then `= cb`: `=== cb`                  | true                   | **false**                       | true                                  | true           |
| `delete store.onSave`, then `store.onSave = cb`: `=== cb`                  | false                  | false                           | false                                 | false          |
| `store.handler = cb` on a key that never existed: `=== cb`                 | false                  | false                           | false                                 | false          |

So "a function that replaces a method is a method" fixes the override under
every compiler, and does not break the identity of a callback field declared
`= null`. It does break the identity of one declared with a function as its
default: that field was born holding a function, so it is a method field, and
whatever function replaces it is wrapped. F1b keeps that identity and fixes
the override only where class fields are definitions; the Angular example
and, by TypeScript's default, the Next.js example assign. A callback written
after `delete` or to a new key is wrapped under every form: the rule cannot
tell such a write from the creation of a method, which is what clause 3 is
for.

**Objection 17, a name for `devtools`.** The wrapper of a method found as an
own property, or written to a key, takes the key as its `name`: `bump`, `set`
(an arrow assigned in the constructor, whose own `name` is `""`), `go` (an
anonymous arrow in an object literal). A prototype method's wrapper keeps no
name of its own; P7's hook reads `method.name` of the function it wraps, which
is the method's own name. With P7 on top, a `devtools` entry for an own
method would be named after its key if the hook reads the wrapper's name, or
after the function's own name (often `""` for an assigned arrow) if it reads
the wrapped function's. Stage 4 should pass the key into `transactional()`
for both kinds and let P7 read that. Not run with P7: this build does not
contain it. The name costs 19 bytes.

## 6. Measures

### Tests

| Build                        |  Pass | Fail | Against the base                            |
| ---------------------------- | ----: | ---: | ------------------------------------------- |
| Base (T3 (a), T1 strict, C1) | 1,313 |   28 |                                             |
| This rule, F1                | 1,314 |   27 | one fewer: the incidental test passes again |
| This rule, F1b               | 1,314 |   27 | the same                                    |

Of T1 strict's ten: the nine **fixes** still fail as fixes. The one
**incidental**, `core.characterisation.notifications.test.ts`, "a store method
that writes two stores notifies their sync subscribers when it returns, in
the order they were first written", passes again: its object-literal method
is a transaction under this rule. T1 lenient's eight are among the nine.

`core.characterisation.identity.test.ts`, "a function stored as data is read
back as one stable wrapper bound to the store, while the snapshot holds the
original", still fails, now as a **fix** of a different kind: its function is
a `function` declaration, so it is data.

One **regression** on the first run, fixed in the patch: the two tests of
`core.functionStores.test.ts`, "a store made from a function, held by another
store", failed because the held store, a proxy of a function without a
`prototype`, was wrapped. A store is now data (`!internalsMap.has(value)`, 6
bytes).

The base's 17 T3 (a) failures and the export list are unchanged.

### Typecheck

One error, the base's: `types.index.test.ts`, the main entry's export list
gains `ClassyStore` (**incidental**). Nothing new.

### Size

| Entry | Today | Strict (base) | Strict, W2 oc |    F1 |   F1b | Budget |
| ----- | ----: | ------------: | ------------: | ----: | ----: | -----: |
| `.`   | 3,661 |         3,718 |         3,807 | 3,888 | 3,883 |  3,750 |

Against strict: F1 +170, F1b +165. Against strict with W2 "on create": F1
+81. What the parts cost, each taken out of F1 alone: the key as the name 19,
"replaces a method" 17, the store test 6, the frozen test 5. The rest, about
123 bytes, is the per-node cache, the scan at creation and the two write
paths. The other entries move with the main one (each "adds" figure within
a few bytes of the base): `./utils` adds 2,696, `./collections` 717, `./react`
1,658, `./react/server` 150, `./vue` 283, `./svelte` 182, `./angular` 278,
`./solid` 312.

### Timings

`bench.sh`: `runCoreBenchmark.mjs --runs 5` on saved copies of the base
(strict), strict with W2 "on create" and F1, Bun and Node, two rounds back to
back. Nanoseconds, median (lowest to highest); other agents were running.

| Metric               | Strict, rounds 1 and 2                         | W2 oc                                          | F1                                             |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `store.method`, Bun  | 234 (228 to 245), 233 (221 to 235)             | 233 (227 to 239), 235 (234 to 236)             | 232 (229 to 236), 229 (228 to 236)             |
| `store.method`, Node | 299 (296 to 299), 302 (298 to 304)             | 302 (296 to 309), 297 (290 to 301)             | **323 (321 to 333), 314 (310 to 318)**         |
| `store.read`, Bun    | 32.0 (31.5 to 32.2), 32.1 (31.4 to 32.2)       | 31.9 (31.6 to 32.4), 31.8 (31.6 to 32.2)       | 31.9 (31.1 to 32.5), 31.3 (31.1 to 31.5)       |
| `store.read`, Node   | 47.7 (46.9 to 48.6), 48.6 (47.5 to 49.2)       | 47.2 (45.3 to 49.1), 46.2 (45.5 to 46.7)       | 47.7 (46.5 to 49.0), 46.8 (45.7 to 47.7)       |
| `create.small`, Bun  | 1,638 (1,568 to 1,878), 1,687 (1,598 to 1,788) | 1,597 (1,510 to 1,629), 1,600 (1,453 to 1,637) | 1,709 (1,595 to 2,001), 1,672 (1,499 to 1,690) |
| `create.small`, Node | 5,355 (5,252 to 6,428), 5,782 (5,280 to 6,932) | 5,957 (5,220 to 6,184), 5,824 (5,089 to 6,224) | 5,130 (3,749 to 5,349), 5,208 (5,021 to 6,116) |
| `create.rows`, Bun   | 634k (600k to 651k), 639k (599k to 659k)       | 628k (615k to 668k), 653k (633k to 667k)       | 639k (609k to 650k), 596k (582k to 627k)       |
| `create.rows`, Node  | 1.41M (1.04M to 1.48M), 1.31M (1.21M to 1.58M) | 1.44M (1.11M to 1.47M), 1.46M (1.08M to 1.59M) | 1.40M (1.16M to 1.50M), 1.28M (1.09M to 1.47M) |

One difference holds in both rounds: **`store.method` on Node is about 5%
slower under F1** (310 to 333 against 296 to 304). A method read now looks up
the node's table in a module `WeakMap` and then the function in it, where
strict had one closure `WeakMap`. Keeping the table in the node's closure or on
`StoreInternal` should take it back; not run. Everything else touches,
including creation: the scan at creation writes only where a function is, and
the per-node table is made on the first method read, not per node. The four
ratios to a forwarding Proxy are inside the spread of the base and inside
their limits on both engines (read 12.3 to 14 and 2.04 to 2.05, write 2.60 to
2.68 and 1.37 to 1.38, cached getter 24.2 to 29.9 and 3.64, cached snapshot
5.77 to 6.86 and 1.38).

## 7. Recommendation

**Take this rule, in its full form F1, in place of decision 1's strict rule
and decision 11's exception. Before 1.0.**

- It is one rule for every store. Decision 11's "the one exception to
  decision 1" goes away, and so does the `instanceof ClassyStore` test: the
  base class becomes 4 lines with no rule of its own.
- It settles objection 8 and objection 14: an object-literal method, a
  documented input, is a transaction again and works detached, as today.
- It keeps everything strict fixed: findings 5, 6, 42, the copied wrapper,
  the stale getter, a class or `function` as a value, a store held as a value,
  `store.cb = store.cb`. It also fixes objection 3 (strict with W2 has it) and
  objection 17.
- Its cost is one kind of identity, said in one sentence: a function that an
  object is born with is replaced by its method. The common callback case,
  a field declared `= null` and assigned later, keeps its identity, as decision
  11 already asks users to write it. The cases that do not are a callback in
  the initial state, one written to a key the object did not have, a bound
  function, and one written over a method or a function default.
- F1 against F1b: F1 makes an overriding arrow method a transaction under
  every compiler, which is the case decision 11 exists for; F1b only under
  definitions. The price of F1 is a callback field with a function default,
  which the docs sentence on `= null` already steers away from. I take F1.
- Bytes: 81 more than decision 11 as written. Part of that, the per-node
  cache and the name, decision 11 needs anyway to answer objections 3 and 17.

If the owner wants a callback in the initial state of a plain object to keep
its identity, the fallback is strict with the exception repaired (per-node
cache, the key as the name, F1's override clause for base-class stores), and
the reference then says that an object literal's functions are not methods.

### What the reference says under this rule

1. "A method is a function without its own `prototype`: a method of a class,
   a shorthand method or an arrow function in an object literal, an `async`
   function or a bound function. The store binds it to itself and runs each
   call as one transaction: subscribers hear once, when it returns."
2. "A function counts as a method when the object is born with it: on its
   class, in the object you pass to `createClassyStore()` or place in a store,
   or written to a key the object does not have yet. A function written over a
   method is a method too. Every other function is data and is kept as it is."
3. "A `function` declaration or expression, a class and a frozen function are
   always data, and so is every element of a list."
4. "The store replaces a method with its own wrapper, in the object you passed
   in too. `store.onSave === cb` is then false. To store a callback that keeps
   its identity, declare the field first: `onSave: (() => void) | null =
   null`, and assign the callback later."
5. "A method read from a snapshot writes the live store."
6. "A class that does not extend `ClassyStore` and uses an arrow-function
   field writes to the raw object, and no subscriber hears it. Extend
   `ClassyStore` or use a prototype method."

## Cost for stage 4

- `core.ts`, about 40 lines of code on top of decisions 1, 2 and the base
  class; `ClassyStore` drops the `instanceof` test W2 had.
- Tests to write first: every row of the two case tables and of the tables in
  sections 2, 4 and 5, on both compilations for the base-class rows; one
  function in two stores, as a shorthand method and as an `async` function;
  the wrapper's name; a store made from a function held by another store.
- Tests to change: none beyond T1 strict's nine fixes, which already change.
  The one incidental of T1 strict no longer changes.
- Keep the per-node method table in the node's closure or on
  `StoreInternal`, not in a module `WeakMap`: the spike's form costs about 5%
  on `store.method` on Node.
- Risk: low to medium. The new behaviour, the store writing into the object
  it is given, touches every node creation. Decision 29 (history restores a
  function field by reference) and objection 16 of `adversarial-core.md` (a
  JSON jump deleting function fields) apply unchanged: methods are now own
  fields more often, so the "never delete a function field" test of
  objection 16 matters more.
- `CONSTRAINTS.md`: the main entry's budget, inside decision 4's single
  ceiling. +170 bytes on strict, +81 on decision 11 as written.

## Verified and not verified

- **Run:** the unit suite, the typecheck and `bun run size` on F1 and F1b;
  `repro/cases.ts` on all five builds; the override case compiled both ways
  by `Bun.Transpiler`; the core benchmark on saved copies of the base, W2 "on
  create" and F1, Bun and Node.
- **Read only:** what `persist` and `devtools` do with a wrapper (the class
  report ran the same wrapper through them); the table placement of section
  3, except for the "wrap on read" run of the class report.
- **Reasoning:** that no wrapping rule fixes a raw-bound arrow in a class
  without the base; the `devtools` name with P7 on top; that `bound `-name
  detection is unfit.
- **Not run:** the browser, framework and mutation suites; other compilers
  than Bun's transpiler (the class report's seventeen outputs were not rerun;
  the creation path they exercise is the same as W2 "on create"'s); P7.

## Appendix A: how to run it again

1. Make a throwaway worktree of `release/1.0` (library source as at
   `57404c3`), run `bun install --frozen-lockfile`, then `bun run build`.
2. Apply `c1-t1strict.patch` from appendix B of `spike-classes.md` (the base),
   then `rule-f1.patch` below. For F1b, apply `f1b-on-f1.patch` on top. If
   `git apply` calls a patch corrupt at its last line, the blank context line
   at its end lost its single space.
3. Run `bun run test`, `bun run --filter @codebelt/classy-store typecheck`,
   `bun run size`.
4. The case table: put `cases.ts` in `<scratch>/stage-3-spike-functions/repro/`
   beside worktrees named `wt` (this rule), `wt-strict` (the base),
   `wt-w2` (the base plus `w2.patch` and `w2-on-create.patch` of the class
   reports) and `wt-lenient` (`t1-lenient.patch` of `spike-traps.md`), and run
   `CLASSY_REPO=<repo> bun cases.ts <today|lenient|strict|w2|rule>`.
5. The override case: `bun assign/compile.ts`, then
   `bun assign/override-define-<false|true>.mjs <worktree>/packages/classy-store/src/index.ts`.
6. Timings: `bench.sh`, on saved copies of each build (`dist/`,
   `tests/benchmark/` and `package.json` in a folder of their own under the
   package's `_copies/`, so that each resolves `#store-runtime` to itself).

## Appendix B: patches

### `rule-f1.patch`: the rule, full form, on `c1-t1strict.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 056ed3f..6c85123 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -327,6 +327,55 @@ function deliver(
   }
 }
 
+/** Per node, each function and the method made of it. */
+const nodeMethods = new WeakMap<StoreInternal, WeakMap<object, unknown>>();
+/** Each method a node made, and that node. */
+const methodOwners = new WeakMap<object, StoreInternal>();
+
+/** The method of `node` made of `fn`, one per node and function. */
+function methodOf(
+  node: StoreInternal,
+  fn: (...args: unknown[]) => unknown,
+  receiver: object,
+  key?: PropertyKey,
+): (...args: unknown[]) => unknown {
+  let byFn = nodeMethods.get(node);
+  if (!byFn) {
+    byFn = new WeakMap();
+    nodeMethods.set(node, byFn);
+  }
+  let method = byFn.get(fn) as ((...args: unknown[]) => unknown) | undefined;
+  if (!method) {
+    method = transactional(fn, receiver);
+    // The key it was found under names it, for `devtools`.
+    if (key !== undefined)
+      Object.defineProperty(method, 'name', {value: String(key)});
+    byFn.set(fn, method);
+    methodOwners.set(method, node);
+  }
+  return method;
+}
+
+/**
+ * A function an object is born with is a method: a function without its own
+ * `prototype` (an arrow, a shorthand method, an `async` or bound function), on
+ * an object that is not an array, unless it is frozen or a store. Anything
+ * else is data.
+ */
+function bornValue(
+  node: StoreInternal,
+  key: PropertyKey,
+  value: unknown,
+): unknown {
+  return typeof value === 'function' &&
+    !Object.hasOwn(value, 'prototype') &&
+    !Array.isArray(node.target) &&
+    !Object.isFrozen(value) &&
+    !internalsMap.has(value)
+    ? methodOf(node, value as (...args: unknown[]) => unknown, node.proxy, key)
+    : value;
+}
+
 /**
  * Being frozen is permanent, so a positive answer is remembered: asking a large
  * frozen array again would scan every element on each read.
@@ -396,14 +445,11 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const existing = targetNodes.get(target) ?? internalsMap.get(target);
   if (existing) return existing;
 
-  /** One wrapper per method, so every read returns the same reference. */
-  const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
-
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
       // Store the snapshot itself, never the render-tracking proxy around it.
-      const value: unknown =
+      let value: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
           : incoming;
@@ -414,6 +460,12 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         return Reflect.set(_target, prop, value, receiver);
       }
       const oldValue = Reflect.get(_target, prop);
+      // A function that creates a field, or replaces a method, is a method.
+      if (
+        !Object.hasOwn(_target, prop) ||
+        methodOwners.get(oldValue as object) === internal
+      )
+        value = bornValue(internal, prop, value);
       const previousChild = internal.childInternals.get(prop);
       if (
         Object.hasOwn(_target, prop) &&
@@ -481,13 +533,11 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         prop !== 'constructor' &&
         !Object.hasOwn(_target, prop)
       ) {
-        const method = value as (...args: unknown[]) => unknown;
-        let bound = boundMethods.get(method);
-        if (!bound) {
-          bound = transactional(method, receiver);
-          boundMethods.set(method, bound);
-        }
-        return bound;
+        return methodOf(
+          internal,
+          value as (...args: unknown[]) => unknown,
+          receiver,
+        );
       }
 
       // Own data edges are indexed before a retained alias can be mutated.
@@ -498,9 +548,14 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       return child ? child.proxy : value;
     },
 
-    defineProperty(_target, prop, descriptor) {
+    defineProperty(_target, prop, requested) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      const descriptor =
+        'value' in requested &&
+        (!before || methodOwners.get(before.value) === internal)
+          ? {...requested, value: bornValue(internal, prop, requested.value)}
+          : requested;
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
       // The bookkeeping of a write: the property's value is its child, or it
@@ -552,8 +607,13 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     for (const owner of nodes) {
       for (const key of Reflect.ownKeys(owner.target)) {
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
-        if (desc && 'value' in desc)
-          linkChild(owner, key, desc.value, nodes, desc);
+        if (desc && 'value' in desc) {
+          // A function the object is born with becomes its method, in place.
+          const method = desc.writable && bornValue(owner, key, desc.value);
+          if (method && method !== desc.value)
+            (owner.target as Record<PropertyKey, unknown>)[key] = method;
+          else linkChild(owner, key, desc.value, nodes, desc);
+        }
       }
     }
   }
```

### `f1b-on-f1.patch`: F1b, on `rule-f1.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 6c85123..53494c1 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -460,11 +460,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         return Reflect.set(_target, prop, value, receiver);
       }
       const oldValue = Reflect.get(_target, prop);
-      // A function that creates a field, or replaces a method, is a method.
-      if (
-        !Object.hasOwn(_target, prop) ||
-        methodOwners.get(oldValue as object) === internal
-      )
+      // A function that creates a field is a method.
+      if (!Object.hasOwn(_target, prop))
         value = bornValue(internal, prop, value);
       const previousChild = internal.childInternals.get(prop);
       if (
@@ -551,6 +548,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     defineProperty(_target, prop, requested) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      // A definition that creates a field, or redefines a method (a subclass's
+      // field initialiser), holds a method.
       const descriptor =
         'value' in requested &&
         (!before || methodOwners.get(before.value) === internal)
```

## Appendix C: scripts

### `repro/cases.ts`

```ts
// Every case of spike-functions.md. Usage: bun cases.ts <today|lenient|strict|w2|rule>
// today: the unmodified source; lenient: t1-lenient.patch; strict: T3 (a) + T1
// strict + the base class; w2: strict + W2 "on create"; rule: this spike.
const variant = process.argv[2] ?? 'rule';
const F = import.meta.dir + '/..';
const root =
  variant === 'today'
    ? `${process.env.CLASSY_REPO}/packages/classy-store/src`
    : `${F}/${variant === 'rule' ? 'wt' : `wt-${variant}`}/packages/classy-store/src`;
const lib = await import(`${root}/index.ts`);
const {createClassyStore, snapshot, subscribe, shallowEqual} = lib;
const ClassyStore = lib.ClassyStore as (new () => object) | undefined;
const {withHistory} = await import(`${root}/utils/index.ts`);

const out = (label: string, value: unknown) =>
  console.log(
    label.padEnd(70),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
const attempt = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    return `throws ${(error as Error).constructor.name}`;
  }
};
const section = (title: string) => console.log(`\n# ${title}`);
const sync = (store: object, run: () => void) => {
  let calls = 0;
  const stop = subscribe(store, () => calls++, {sync: true});
  try {
    run();
  } finally {
    stop();
  }
  return calls;
};
// biome-ignore lint/suspicious/noExplicitAny: a throwaway script
type Any = any;

section(`${variant}: the thirteen rows of T1`);
class Counter {
  static label = 'counter';
  count = 0;
  other = 0;
  inc() {
    this.count++;
    this.other++;
  }
  get formatter() {
    return (n: number) => `#${n}`;
  }
}
{
  const s: Any = createClassyStore(new Counter());
  out('1. prototype method: s.inc === s.inc', s.inc === s.inc);
  out(
    '1. sync calls for inc() writing two fields',
    sync(s, () => s.inc()),
  );
  const {inc} = s;
  out(
    '1. destructured inc() works',
    attempt(() => (inc(), s.count)),
  );
  out(
    '3. getter returning a function: same on two reads',
    s.formatter === s.formatter,
  );
  out('12. s.constructor === Counter', s.constructor === Counter);
  out(
    '12. snapshot constructor === store constructor',
    snapshot(s).constructor === s.constructor,
  );
}
{
  const s: Any = createClassyStore({list: [1, 2]});
  out(
    '2. array method: s.list.push === s.list.push',
    s.list.push === s.list.push,
  );
}
{
  function handler(this: unknown) {
    return this;
  }
  const s: Any = createClassyStore({handler});
  out('4. own `function`: s.handler === handler', s.handler === handler);
  out('4. called on the store, this === store', s.handler() === s);
}
{
  const s: Any = createClassyStore({
    count: 0,
    other: 0,
    inc() {
      this.count++;
      this.other++;
    },
  });
  out(
    '5. object-literal method: sync calls for two writes',
    sync(s, () => s.inc()),
  );
  const {inc} = s;
  out(
    '5. destructured inc() (detached)',
    attempt(() => (inc(), s.count)),
  );
}
{
  const arrow = () => 1;
  const s: Any = createClassyStore({arrow});
  out('6. own arrow at creation: s.arrow === arrow', s.arrow === arrow);
}
{
  const first = () => 'first';
  const second = () => 'second';
  const s: Any = createClassyStore({fns: [first, second]});
  out('7. function in a list: indexOf(first)', s.fns.indexOf(first));
  out('7. s.fns[0] === first', s.fns[0] === first);
}
{
  class Model {
    static label = 'model';
  }
  const s: Any = createClassyStore({Model});
  out(
    '8. class as value: s.Model.label',
    attempt(() => s.Model.label),
  );
  out(
    '8. new s.Model() instanceof s.Model',
    attempt(() => new s.Model() instanceof s.Model),
  );
}
{
  function Ctor(this: Any) {
    this.x = 1;
  }
  const s: Any = createClassyStore({Ctor});
  out('9. `function` constructor: s.Ctor === Ctor', s.Ctor === Ctor);
}
{
  const target = {n: 1};
  const bound = function (this: Any) {
    return this.n;
  }.bind(target);
  const s: Any = createClassyStore({bound});
  out('10. bound function: s.bound === bound', s.bound === bound);
  out(
    '10. s.bound() still reads its own this',
    attempt(() => s.bound()),
  );
  const frozen = Object.freeze(() => 2);
  const t: Any = createClassyStore({frozen});
  out('11. frozen function: t.frozen === frozen', t.frozen === frozen);
}
{
  const fnStore: Any = createClassyStore(
    Object.assign(() => 'called', {uses: 0}),
  );
  const holder: Any = createClassyStore({fn: fnStore});
  out(
    '13. function store held by another: holder.fn === fnStore',
    holder.fn === fnStore,
  );
}

section(`${variant}: added rows`);
{
  const s: Any = createClassyStore({
    n: 0,
    m: 0,
    both: () => {
      s.n++;
      s.m++;
    },
  });
  out(
    'A2. arrow in an object literal writing two fields: sync calls',
    sync(s, () => s.both()),
  );
}
{
  const cb = () => {};
  const s: Any = createClassyStore({onSave: cb, onLater: null as Any});
  out('A3. callback at creation: s.onSave === cb', s.onSave === cb);
  out('A3. snapshot(s).onSave === cb', snapshot(s).onSave === cb);
  const later = () => {};
  s.onLater = later;
  out(
    'A3. assigned later to an existing field: s.onLater === later',
    s.onLater === later,
  );
  s.onNew = later;
  out('A3. assigned later to a new key: s.onNew === later', s.onNew === later);
  const t: Any = createClassyStore({
    handlers: {} as Record<string, () => void>,
  });
  t.handlers.a = later;
  out(
    'A3. dictionary of callbacks: t.handlers.a === later',
    t.handlers.a === later,
  );
}
{
  const s: Any = createClassyStore({
    counter: {
      n: 0,
      m: 0,
      inc() {
        this.n++;
        this.m++;
      },
    },
  });
  out(
    'A4. nested plain object method: sync calls on root',
    sync(s, () => s.counter.inc()),
  );
  const {inc} = s.counter;
  out(
    'A4. destructured nested inc()',
    attempt(() => (inc(), s.counter.n)),
  );
  const t: Any = createClassyStore({child: null as Any});
  const obj = {
    n: 0,
    m: 0,
    inc() {
      this.n++;
      this.m++;
    },
  };
  const original = obj.inc;
  t.child = obj;
  out(
    'A5. same object placed after creation: sync calls',
    sync(t, () => t.child.inc()),
  );
  out('A5. the raw object still holds its own function', obj.inc === original);
}
{
  class X {
    n = 0;
    m = 0;
    bump = () => {
      this.n++;
      this.m++;
    };
  }
  const s: Any = createClassyStore(new X());
  const calls = sync(s, () => s.bump());
  out(
    'A6. class without the base, arrow field: sync calls, s.n after',
    `${calls}, ${s.n}`,
  );
}

section(`${variant}: the three defects lenient keeps`);
{
  const s: Any = createClassyStore({
    count: 0,
    inc() {
      this.count++;
    },
    copy: null as Any,
    list: [] as Any[],
  });
  const read = s.inc;
  out(
    'D1. s.inc = s.inc: sync calls',
    sync(s, () => (s.inc = s.inc)),
  );
  out('D1. s.inc === read afterwards', s.inc === read);
  s.copy = s.inc;
  out('D1. copied to an existing field: s.copy === s.inc', s.copy === s.inc);
  s.fresh = s.inc;
  out('D1. copied to a new key: s.fresh === s.inc', s.fresh === s.inc);
  s.list.push(s.inc);
  out(
    'D1. pushed: s.list[0] === s.inc, includes',
    `${s.list[0] === s.inc}, ${s.list.includes(s.inc)}`,
  );
  s.list[0]();
  out('D1. calling the pushed one writes the store: count', s.count);
}
{
  class Label {
    count = 1;
    format = (n: number) => `a${n}`;
    get label() {
      return this.format(this.count);
    }
  }
  const s: Any = createClassyStore(new Label());
  s.label;
  s.format = (n: number) => `b${n}`;
  out(
    'D2. getter calling a field function after replace: store, snapshot',
    `${s.label}, ${snapshot(s).label}`,
  );
}

section(`${variant}: where the wrapper lives`);
{
  const raw = {
    count: 0,
    inc() {
      this.count++;
    },
  };
  const original = raw.inc;
  const s: Any = createClassyStore(raw);
  out('W. raw.inc === original after creation', raw.inc === original);
  out('W. raw.inc === s.inc', raw.inc === s.inc);
  const a = snapshot(s);
  out('W. snapshot(s).inc === s.inc', a.inc === s.inc);
  out(
    'W. snapshot(s).inc() writes the live store',
    attempt(() => (a.inc(), s.count)),
  );
  s.count = 5;
  const b = snapshot(s);
  out(
    'W. shallowEqual over inc only',
    shallowEqual({inc: a.inc}, {inc: b.inc}),
  );
  const h: Any = withHistory(s);
  const other = function () {};
  const methodBefore = s.inc;
  const replacement = () => {};
  s.inc = replacement;
  out(
    'W. s.inc = arrow replacing a method: s.inc === replacement',
    s.inc === replacement,
  );
  await new Promise((r) => setTimeout(r, 0));
  out('W. after s.inc = arrow: history can undo', h.canUndo);
  h.undo();
  out('W. after undo, s.inc is the method again', s.inc === methodBefore);
  void other;
}

section(`${variant}: adversarial-core objections 3, 4, 17`);
{
  const shared = {
    touch(this: Any) {
      this.updatedAt = 1;
      this.edits++;
    },
  };
  const a: Any = createClassyStore({
    edits: 0,
    updatedAt: 0,
    touch: shared.touch,
  });
  const b: Any = createClassyStore({
    edits: 0,
    updatedAt: 0,
    touch: shared.touch,
  });
  b.touch();
  out(
    'O3. object literal: b.touch(): a.edits, b.edits',
    `${a.edits}, ${b.edits}`,
  );
  if (ClassyStore) {
    class Doc extends (ClassyStore as Any) {
      edits = 0;
      touch = shared.touch;
    }
    const d1: Any = new Doc();
    const d2: Any = new Doc();
    d2.touch();
    out(
      'O3. base class: d2.touch(): d1.edits, d2.edits',
      `${d1.edits}, ${d2.edits}`,
    );
    async function load(this: Any) {
      this.loading = true;
    }
    class Q extends (ClassyStore as Any) {
      loading = false;
      load = load;
    }
    const q1: Any = new Q();
    const q2: Any = new Q();
    await q2.load();
    out(
      'O3. async fn shared: q1.loading, q2.loading',
      `${q1.loading}, ${q2.loading}`,
    );
    class A extends (ClassyStore as Any) {
      a = 0;
      b = 0;
      bump = () => {
        this.a++;
        this.b++;
      };
    }
    class B extends A {
      bump = () => {
        this.a += 10;
        this.b += 10;
      };
    }
    const pa: Any = new A();
    const pb: Any = new B();
    out(
      'O4. parent arrow method: sync calls',
      sync(pa, () => pa.bump()),
    );
    out(
      'O4. overriding arrow method: sync calls',
      sync(pb, () => pb.bump()),
    );
    class D extends (ClassyStore as Any) {
      onSave: (() => void) | null = null;
    }
    const d: Any = new D();
    const cb = () => {};
    d.onSave = cb;
    out('O4. declared callback assigned: d.onSave === cb', d.onSave === cb);
    delete d.onSave;
    d.onSave = cb;
    out('O4. after delete and re-create: d.onSave === cb', d.onSave === cb);
    class N extends (ClassyStore as Any) {
      onSave: () => void = () => {};
    }
    const nn: Any = new N();
    nn.onSave = cb;
    out(
      'O4. callback field with a no-op default, assigned: nn.onSave === cb',
      nn.onSave === cb,
    );
    const lit2: Any = createClassyStore({onSave: () => {}});
    lit2.onSave = cb;
    out(
      'O4. object literal, no-op default replaced: lit2.onSave === cb',
      lit2.onSave === cb,
    );
    class E extends (ClassyStore as Any) {}
    const e: Any = new E();
    e.handler = cb;
    out('O4. new key later: e.handler === cb', e.handler === cb);
    const doc: Any = new A();
    out('O17. base-class arrow method wrapper name', doc.bump.name);
    class C extends (ClassyStore as Any) {
      n = 0;
      m = 0;
      constructor() {
        super();
        (this as Any).set = () => {
          (this as Any).n++;
          (this as Any).m++;
        };
      }
    }
    const c: Any = new C();
    out(
      'B. arrow assigned in the constructor: sync calls',
      sync(c, () => c.set()),
    );
    out('B. its name', c.set.name);
  }
  const lit: Any = createClassyStore({n: 0, inc() {}});
  out('O17. object-literal method name', lit.inc.name);
  const arrowLit: Any = createClassyStore({n: 0, go: (() => () => {})()});
  out('O17. anonymous arrow at creation: name', arrowLit.go.name);
}
```

### `repro/assign/override.ts`

```ts
// The override case of objection 4, compiled with assignment semantics.
declare const lib: any;
const {ClassyStore, subscribe} = lib;
const sync = (s: object, run: () => void) => {
  let n = 0;
  const u = subscribe(s, () => n++, {sync: true});
  run();
  u();
  return n;
};
class A extends (ClassyStore as any) {
  a = 0;
  b = 0;
  bump = () => {
    this.a++;
    this.b++;
  };
}
class B extends A {
  bump = () => {
    this.a += 10;
    this.b += 10;
  };
}
class N extends (ClassyStore as any) {
  onSave: () => void = () => {};
}
const pa: any = new A(),
  pb: any = new B(),
  nn: any = new N();
const cb = () => {};
nn.onSave = cb;
console.log(
  'assign semantics: parent',
  sync(pa, () => pa.bump()),
  'override',
  sync(pb, () => pb.bump()),
  'no-op default kept',
  nn.onSave === cb,
);
```

### `repro/assign/compile.ts`

```ts
// Compile override.ts with Bun's transpiler, with and without useDefineForClassFields.
const dir = import.meta.dir;
const src = await Bun.file(`${dir}/override.ts`).text();
for (const d of [false, true]) {
  const t = new Bun.Transpiler({
    loader: 'ts',
    tsconfig: {compilerOptions: {useDefineForClassFields: d}},
  });
  await Bun.write(
    `${dir}/override-define-${d}.mjs`,
    `const lib = await import(process.argv[2]);\n${t.transformSync(src)}`,
  );
}
```

### `bench.sh`

```sh
#!/bin/zsh
cd <scratch>/stage-3-spike-functions/wt/packages/classy-store/_copies
for round in 1 2; do
for c in bench-strict bench-w2 bench-rule; do
  echo "## $c bun round $round"; bun $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | grep -E '^\| (store.method|store.read|create.small|create.rows|read:|write:|getter:|snapshot:) '
  echo "## $c node round $round"; node $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | grep -E '^\| (store.method|store.read|create.small|create.rows|read:|write:|getter:|snapshot:) '
done
done
```

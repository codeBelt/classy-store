# Stage 3 spike: a function in a field is a method only when read through the store

Status: **complete for the brief.**

- Worktree: `<scratch>/stage-3-spike-functions-2/wt`, detached at `57404c3`,
  with `c1-t1strict.patch` of `spike-classes.md` (the base: T3 (a), T1 strict,
  the base class C1) and then `rule-r.patch` below. This rule is called **R**
  in this report. Two more worktrees for the comparison columns: `wt-strict`
  (the base alone) and `wt-f1` (the base plus `rule-f1.patch` of
  `spike-functions.md`, decision 1 as written). "Today" is the unmodified
  source. Nothing is committed anywhere.
- Patches and scripts: `<scratch>/stage-3-spike-functions-2/`, and in the
  appendices.

## Summary

| Question                                  | Answer                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the rule work?                       | Yes. 27 tests fail against the base's 28, the same 27 as F1: the base's one incidental (an object-literal method as one transaction) passes again, nothing new fails. Typecheck: the base's one error only                                                                                                                                                                      |
| The five objections of adversarial review | All five removed: a copy of a raw object or a snapshot runs its own store's methods (as today); a callback on a snapshot or the raw object gets its caller's `this` (as today); a literal snapshot getter no longer writes the live store; a restore keeps the callback; a read-only definition no longer throws                                                                |
| What R keeps of F1                        | Every fix F1 has over today: an object-literal method is one transaction, one wrapper per node and function, `store.f = store.f` is no change, a copied wrapper is one function, a getter sees a replaced field function, a class, `function`, frozen function and store stay data, the overriding arrow field                                                                  |
| Where R is worse than F1                  | Two places. `store.onSave === cb` is false for **every** own function read through the store, including a callback assigned to a field declared `= null` (F1: true). A base-class arrow field read from a **snapshot** is a different function from the store's and is not a transaction (2 notifications)                                                                      |
| A read-only property                      | One descriptor lookup per read of an own function. After `Object.freeze(store)`, `Object.freeze(raw)` or a read-only definition, a read returns the function itself, unbound, and never throws. The lookup costs about 20 ns a read on Bun. A fast path for a wrapper already made, guarded by a flag on the node, takes the cost back for 43 bytes and has one gap (section 2) |
| What it costs                             | 3,873 bytes for the main entry: 155 over the base, 15 under F1. The core benchmark: no difference from the base on either engine, and F1's 5% on `store.method` on Node is gone. An own method call: about 28 ns slower than F1 on Bun and 20 ns on Node; with the fast path, the same as F1                                                                                    |
| Recommendation                            | **R with the fast path, in place of F1.** Before 1.0. It is today's behaviour minus today's defects, it never touches the user's objects, and its two losses against F1 are the identity of a store read (which today also lacks) and a snapshot call the docs already steer away from                                                                                          |

## The rule as the code tests it

> A function is a method, bound to the proxy of the object that holds it and
> run as one transaction, in two cases.
>
> 1. It is found on the prototype chain, under any key but `constructor`. Any
>    kind of function. This is today's rule.
> 2. It is the value of an own data property of an object that is not an
>    array, **and it is read through the store**. Not when the function has
>    its own `prototype` property (a class, a `function` declaration or
>    expression, a generator, and every wrapper the store made, which is a
>    `function` expression), is frozen, or is a store, nor when the property
>    is read-only and not configurable.
>
> The rule never changes the object. The raw object and every snapshot hold
> the function as it was written.

## What was changed

`core.ts` only, on top of the base: `rule-r.patch`, 67 lines added and 18
removed, about 15 of the added lines comments.

- **`transactional(method, receiver, key)`** takes the key the method was read
  under and names the wrapper after it (`Object.defineProperty(wrapper,
'name', …)`), for prototype and own methods alike. A module `WeakMap`
  `wrapperSources` maps each wrapper to the function it wraps.
- **One wrapper per node and function**, in the node's closure: `boundMethods`,
  a `WeakMap` made on the node's first method read (the base made it at every
  node creation). `methodOf(fn, receiver, key)` reads and fills it.
- **The get trap**: for a function value it reads the own descriptor once.
  None: a prototype method, as before. One: record a dependency (`recordDep`),
  then return the function itself when the object is an array, the function
  has its own `prototype`, is frozen, is a store, or the property is
  read-only; otherwise return `methodOf(...)`.
- **`unwrap(value)`** in the `set` and `defineProperty` traps: a wrapper this
  node made is written as the function it wraps. A wrapper of another node is
  written as it is (it has its own `prototype`, so it is data there).

Nothing at node creation, no scan, no write into the raw object, no clause on
"a new key" or "replaces a method".

## 1. The cases

`repro/cases.ts` (appendix C): the case script of `spike-functions.md` with
the rows this brief adds. A blank in "Today" means the row needs
`ClassyStore`. "Strict" is the base. "F1" is decision 1 as written.

### The thirteen rows of T1

| Case                                                        | Today                  | Strict             | F1                | R                     |
| ----------------------------------------------------------- | ---------------------- | ------------------ | ----------------- | --------------------- |
| A prototype method, two writes                              | 1 notification         | 1                  | 1                 | 1                     |
| An array method, `list.push === list.push`                  | false                  | true               | true              | true                  |
| A getter that returns a function                            | memoized               | memoized           | memoized          | memoized              |
| An own `function`: `store.handler === handler`              | false                  | true               | true              | true                  |
| An object-literal method, two writes                        | 1, works detached      | 2, detached throws | 1, works detached | **1, works detached** |
| An own arrow at creation: `store.arrow === arrow`           | false                  | true               | false             | false                 |
| A function in a list: `indexOf(first)`                      | -1                     | 0                  | 0                 | 0                     |
| A class as a value: statics, `instanceof`                   | `undefined`, false     | right              | right             | right                 |
| A `function` constructor as a value: `===`                  | false                  | true               | true              | true                  |
| A bound function: `store.bound === bound`                   | false                  | true               | false             | false                 |
| A frozen function: `===`                                    | false                  | true               | true              | true                  |
| `constructor`, on the store and the snapshot                | a wrapper; they differ | the class          | the class         | the class             |
| A store made from a function, held: `holder.fn === fnStore` | false                  | true               | true              | true                  |

### The rows of `spike-functions.md`

| Case                                                                         | Today          | Strict                    | F1                         | R                                     |
| ---------------------------------------------------------------------------- | -------------- | ------------------------- | -------------------------- | ------------------------------------- |
| An arrow in an object literal that writes two fields through `store`         | 1              | 2                         | 1                          | 1                                     |
| A callback in the initial state: `store.onSave === cb`                       | false          | true                      | false                      | false                                 |
| The same, on the snapshot: `snapshot(store).onSave === cb`                   | true           | true                      | **false**                  | **true**                              |
| A callback assigned later to a field that exists (`onLater: null`)           | false          | true                      | **true**                   | **false**                             |
| A callback assigned later to a new key                                       | false          | true                      | false                      | false                                 |
| A callback added to a plain object used as a dictionary, `handlers[id] = cb` | false          | true                      | false                      | false                                 |
| A method of a nested plain object, two writes                                | 1, detached ok | 2, detached throws        | 1, detached ok             | 1, detached ok                        |
| The same object placed in the store after creation, two writes               | 1              | 2                         | 1                          | 1                                     |
| ... and the raw object still holds its own function                          | true           | true                      | **false**                  | **true**                              |
| A class without the base class, with an arrow field that writes two fields   | 0, write lands | 0                         | 0                          | 0 (no wrapping rule can fix it)       |
| `store.inc = store.inc` (own method): notifications                          | 1              | 0                         | 0                          | 0                                     |
| ... copied to a field, a new key, pushed: each `=== store.inc`               | false          | true                      | true                       | true                                  |
| ... calling the pushed one writes the store                                  | yes            | no                        | yes                        | yes                                   |
| A getter calling a field function, after the field is replaced: store, snap  | `a1, b1`       | `b1, b1`                  | `b1, b1`                   | `b1, b1`                              |
| `raw.inc === store.inc`; `snapshot(store).inc === store.inc`                 | false; false   | true; true                | true; true                 | false; false                          |
| `snapshot(store).inc()` (writes `this`)                                      | throws         | throws                    | writes live                | throws (the snapshot is frozen)       |
| `store.inc = arrow`, over an own method: `store.inc === arrow`               | false          | true                      | false                      | false                                 |
| A base-class arrow field, two writes; the overriding arrow field             |                | 2; 2                      | 1; 1                       | 1; 1                                  |
| A base-class callback declared `= null`, assigned: `=== cb`                  |                | true                      | true                       | **false** (snapshot: true)            |
| A callback field with a function default, replaced: `=== cb`                 |                | true                      | false                      | false (snapshot: true)                |
| One shorthand method and one `async function` in two base-class stores       |                | each its own store        | each its own               | each its own                          |
| `name` read on the store: base-class arrow, constructor arrow, literal, anon |                | `bump`, `""`, `inc`, `""` | `bump`, `set`, `inc`, `go` | `bump`, `set`, `inc`, `go` (the keys) |

The override case of objection 4, compiled by Bun's transpiler with class
fields as assignments and as definitions (`repro/assign/`): parent 1 and
override 1 on R under both, as F1; strict 2 and 2 under both.

### The rows this brief adds

| Case                                                                         | Today      | Strict   | F1             | R                                        |
| ---------------------------------------------------------------------------- | ---------- | -------- | -------------- | ---------------------------------------- |
| Field declared `= null`, assigned `cb`: `store.onSave === cb`                | false      | true     | true           | **false**                                |
| ... `snapshot(store).onSave === cb`                                          | true       | true     | true           | **true**                                 |
| ... `store.onSave === store.onSave`                                          | true       | true     | true           | true                                     |
| `copy.ts`: `createClassyStore(defaults)`, then `({...defaults})`: first, 2nd | 0, 1       | 0, 1     | **1, 0**       | **0, 1**                                 |
| `copy.ts`: `createClassyStore({...snapshot(e)})`                             | 0, 1       | 0, 1     | **1, 0**       | **0, 1**                                 |
| `copy.ts`: `createClassyStore({...g})`, a copy of the proxy                  | 1, 0       | 0, 1     | 1, 0           | 1, 0 (as today)                          |
| `copy.ts`: `{config}` in one store, `{...config}` in another; sync calls     | 0, 1, 1    | 0, 1, 1  | **1, 0, 0**    | **0, 1, 1**                              |
| `thiscall.ts`: `snapshot(s).options.ticks.callback.call(scale, 1)`           | `$1`       | `$1`     | `undefined1`   | **`$1`**                                 |
| ... the same on the raw `options`                                            | `$1`       | `$1`     | `undefined1`   | **`$1`**                                 |
| ... the same on the store                                                    | undefined1 | `$1`     | `undefined1`   | `undefined1` (as today)                  |
| ... raw `handlers.onClick === registered` before the store adopted it        | true       | true     | **false**      | **true**                                 |
| `restore-fn.ts`: callback deleted, written back by assignment: snapshot      | true       | true     | **false**      | **true**                                 |
| ... written back by `defineProperty`: snapshot                               | true       | true     | **false**      | **true**                                 |
| ... `withHistory`, undo of a replaced callback: snapshot `=== cb`            | false      | false    | false          | false (functions skipped, finding 60)    |
| `define-ro.ts`: `defineProperty(s, 'toJSON', {value: fn})`; read `=== fn`    | ok; throws | ok; true | **throws**; no | **ok; true**                             |
| `snapgetter.ts`: literal getter calls own method, on a snapshot: live hits   | 0          | 0        | **1**          | **0**                                    |
| ... base-class arrow field, same                                             |            | 1        | 1              | 1 (the arrow's own `this`; out of scope) |
| Base-class arrow field: `snapshot(k).bump === k.bump`                        |            | true     | true           | **false**                                |
| ... `snapshot(k).bump()`, two writes: notifications                          |            | 2        | 1              | **2**                                    |
| ... `k.bump()`: notifications                                                |            | 2        | 1              | 1                                        |
| A wrapper written to another store's field and pushed into its list: `===`   | false      | true     | true           | true                                     |
| ... both called: the first store's counter                                   | 2          | 0        | 2              | 2                                        |
| A prototype method written back, `p.inc = p.inc`: notifications; own after   | 1; yes     | 1; yes   | 1; yes         | 1; yes (stores the method's function)    |
| One shorthand function held by two literal stores: `b.t()` writes            | b          | b        | b              | b; `a.t !== b.t`                         |
| A literal getter calling a field function, field replaced: store, snapshot   | `a1, b1`   | `b1, b1` | `b1, b1`       | `b1, b1`                                 |

`copy.ts` row 5 (a row copied from a store proxy into another store) is the
same case as "a copy of the proxy": `true, false` today, on F1 and on R.

So R reproduces today on every row of the second adversarial review's
scripts, where F1 departs from it, and keeps F1's fixes of today's defects.

## 2. A property that cannot be written

The Proxy rules: when the target's property is a data property that is
neither writable nor configurable, the `get` trap must return its value.

| After                                                   | Today       | F1                                     | R                                                   |
| ------------------------------------------------------- | ----------- | -------------------------------------- | --------------------------------------------------- |
| `Object.freeze(store)`, then `typeof store.inc`         | throws      | `function` (the raw holds the wrapper) | `function`: the function itself                     |
| ... `store.arrow()`                                     | throws      | 1                                      | 1                                                   |
| `Object.freeze(raw)` after creation, `typeof store.inc` | throws      | `function`                             | `function`                                          |
| `Object.defineProperty(store, 'toJSON', {value: fn})`   | read throws | the definition throws, half done       | defined; `store.toJSON === fn`; `JSON.stringify` ok |

**What a user gets.** The function as it was written, not bound and not a
transaction. Called as `store.inc()`, a shorthand method still gets the store
as `this` from the call itself, so its writes go through the store (and fail
on a frozen one); detached, it has no `this`. An arrow keeps its own.

**What it costs.** The get trap of the base asked `Object.hasOwn` for every
function value. R asks `Object.getOwnPropertyDescriptor` instead, once, and
uses the answer both to tell an own function from a prototype method and to
check read-only: no second lookup. On a prototype method the descriptor is
`undefined`; the core benchmark's `store.method` shows no cost (section 4).
On an own function it is a real cost: `repro/own-method.mjs`, two rounds,
nanoseconds, median (lowest to highest):

| Build                                      | Own method call, Bun | Own method call, Node | Own arrow read and called, Bun | Own arrow, Node    |
| ------------------------------------------ | -------------------- | --------------------- | ------------------------------ | ------------------ |
| Base (raw function, not a transaction)     | 196, 194 (192–202)   | 297, 298 (285–341)    | 27.9, 26.8 (26.5–40.6)         | 53.7, 53.1 (53–55) |
| F1 (wrapper stored as data)                | 172, 172 (171–190)   | 268, 263 (262–293)    | 29.9, 29.8 (29.0–32.4)         | 55.4, 55.4 (54–56) |
| R                                          | 200, 200 (197–214)   | 288, 286 (284–293)    | 58.4, 58.8 (57.7–62.5)         | 86.8, 87.9 (86–89) |
| R without the read-only check (unsafe)     | 182, 181 (178–187)   | 293, 283 (275–313)    | 41.9, 39.0 (38.1–59.4)         | 79.8, 80.0 (79–82) |
| R with the fast path (`r-fast-on-r.patch`) | 171, 178 (171–205)   | 261, 268 (260–303)    | 35.5, 35.2 (34.3–38.9)         | 66.7, 68.3 (66–73) |

The descriptor is about 20 ns of R's 30 ns over F1 on Bun and about 8 ns on
Node. The rest is the other tests of case 2 (`hasOwn(fn, 'prototype')`,
`isFrozen`, the store test), which F1 pays once at creation and R pays on
each read.

**A flag on the node.** The spiked form, `r-fast-on-r.patch` (12 lines):
when this node already made a wrapper for the function, the object is still
extensible, and no definition through the store has made a property
read-only (`lockedKeys`, set in the `defineProperty` trap), return the
wrapper without the descriptor or the other tests. A first read takes the full
path. Same 27 failing tests and the same case tables as R. 3,916 bytes, 43
more than R. It makes an own method call as fast as F1. What it misses, from
`repro/readonly-after-read.ts`:

| After a first read through the store                                       | Today  | F1    | R    | R, fast path               |
| -------------------------------------------------------------------------- | ------ | ----- | ---- | -------------------------- |
| `Object.freeze(raw)`: `store.f === fn`                                     | throws | false | true | true                       |
| A read-only definition through the store                                   | throws | false | true | true                       |
| A read-only definition on the raw object (`Object.defineProperty(raw, …)`) | throws | false | true | **throws `TypeError`**     |
| The function itself frozen                                                 | false  | false | true | **false** (stays a method) |

The trap cannot see a change made on the raw object, so a flag cannot cover
it; `Object.isExtensible` covers freeze, seal and `preventExtensions` of the
raw object, not a read-only definition on it. A user who redefines a property
of the raw object behind the store is outside what the store promises
today (today throws on every row), so the gap is small; it should still be a
sentence in the reference if stage 4 takes the fast path.

## 3. What it breaks

### Tests

| Build |  Pass | Fail | Against the base             |
| ----- | ----: | ---: | ---------------------------- |
| Base  | 1,313 |   28 |                              |
| F1    | 1,314 |   27 | one fewer                    |
| R     | 1,314 |   27 | one fewer, the same 27 as F1 |

The one that passes again: `core.characterisation.notifications.test.ts`,
"a store method that writes two stores notifies their sync subscribers when it
returns, in the order they were first written". It was T1 strict's one
**incidental**; its object-literal method is a transaction again under R.

The 27 are the base's other failures, unchanged: the nine **fixes** of T1
strict (`functions read through a store` (5), `static getters` (2), the
prototype swap, the nested array's `Array.isArray`), whose defects R keeps
removed; the 17 of T3 (a); and the export list (`main entry point types`,
**incidental**, the base class export). `core.characterisation.identity.test.ts`
"a function stored as data is read back as one stable wrapper bound to the
store, while the snapshot holds the original" fails as a **fix**, as on F1:
its function is a `function` declaration, which is data. No regression.

### Typecheck

`bun run --filter @codebelt/classy-store typecheck`: one error, the base's
(`types.index.test.ts`, the export list gains `ClassyStore`). Nothing new.

## 4. What it costs

### Size

`bun run size`, gzipped bytes; "adds" is what the entry adds to the main one.

| Entry            | Today |  Base |    F1 |     R | Budget |
| ---------------- | ----: | ----: | ----: | ----: | -----: |
| `.`              | 3,661 | 3,718 | 3,888 | 3,873 |  3,750 |
| `./utils` adds   |       |       | 2,696 | 2,702 |  2,750 |
| `./collections`  |       |       |   717 |   725 |    750 |
| `./react`        |       |       | 1,658 | 1,667 |  1,700 |
| `./react/server` |       |       |   150 |   152 |    175 |
| `./vue`          |       |       |   283 |   279 |    300 |
| `./svelte`       |       |       |   182 |   185 |    200 |
| `./angular`      |       |       |   278 |   279 |    300 |
| `./solid`        |       |       |   312 |   311 |    335 |

R is 155 bytes over the base and 15 under F1. The main entry is over its
budget on every build after the base; decision 4 sets one ceiling. Every
"adds" figure is inside its budget.

### Timings

`bench.sh`: `runCoreBenchmark.mjs --runs 5` on saved copies of the base,
F1 (both copied from `spike-functions.md`'s folder) and R, Bun and Node, two
rounds back to back. Nanoseconds, median (lowest to highest). Another agent
was running benchmarks at the same time.

| Metric               | Base, rounds 1 and 2                     | F1                                       | R                                        |
| -------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `store.method`, Bun  | 233 (227–239), 223 (222–230)             | 234 (230–235), 233 (230–245)             | 249 (236–249), 235 (230–243)             |
| `store.method`, Node | 289 (288–293), 293 (285–296)             | 306 (304–315), 310 (307–320)             | 296 (292–304), 297 (287–299)             |
| `store.read`, Bun    | 31.9 (31.3–32.1), 31.7 (31.4–32.0)       | 31.6 (31.4–32.1), 31.7 (31.5–32.2)       | 31.9 (31.4–32.3), 31.9 (31.7–32.8)       |
| `store.read`, Node   | 46.8 (45.5–47.4), 47.3 (45.4–48.0)       | 45.7 (45.0–46.9), 46.2 (45.7–47.3)       | 46.6 (45.7–47.6), 46.3 (45.3–48.6)       |
| `create.small`, Bun  | 1,521 (1,449–1,664), 1,520 (1,481–1,642) | 1,686 (1,467–1,890), 1,601 (1,499–1,892) | 1,560 (1,436–1,656), 1,547 (1,410–1,729) |
| `create.small`, Node | 5,517 (4,419–6,335), 6,180 (4,495–6,775) | 5,722 (5,111–5,947), 4,811 (3,909–6,269) | 5,726 (4,677–6,119), 5,086 (3,932–6,019) |
| `create.rows`, Bun   | 615k (600k–631k), 623k (606k–663k)       | 637k (604k–655k), 632k (607k–654k)       | 614k (596k–642k), 611k (579k–624k)       |
| `create.rows`, Node  | 1.55M (1.25M–1.61M), 1.45M (1.14M–1.51M) | 1.16M (1.12M–1.36M), 1.33M (1.04M–1.56M) | 1.23M (1.09M–1.53M), 1.32M (1.09M–1.53M) |

Every range of R touches the base's. Against F1, `store.method` on Node: in
round 2 R's range (287–299) is below F1's (307–320) and does not touch it; in
round 1 they touch at 304. So the per-node table in the closure takes back
most or all of the 5% that `spike-functions.md` measured for F1's module
`WeakMap`, as that report predicted. The four ratios to a forwarding Proxy
stay inside their limits on both engines for all three builds (read 14.0 to
16.0 and 2.02 to 2.06; write, getter and snapshot as in the raw output).

An own method, which the core benchmark does not time, is in section 2: R is
about 28 ns a call slower than F1 on Bun and 20 ns on Node, and the fast path
takes that back. The full benchmark was not run on the fast path; its
prototype-method path is the base's code.

## 5. What a user has to know

The sentences the reference would carry under R:

1. "A method is a function the store binds to itself and runs as one
   transaction: synchronous subscribers hear once, when it returns. Every
   function on an object's prototype chain is a method, except
   `constructor`."
2. "A function an object holds in its own field is a method too, when you
   read it through the store: an arrow function, a shorthand method, an
   `async` or bound function. A `function` declaration or expression, a
   class, a frozen function, a store and a function in an array are data,
   and are handed out as they are."
3. "The store never changes your objects. The object you passed in and every
   snapshot hold each function as you wrote it. Only a read through the store
   hands out the method."
4. "So a function read through the store is not the function you stored:
   `store.onSave === cb` is false, and `store.onSave === store.onSave` is
   true. Compare on a snapshot: `snapshot(store).onSave === cb`." This is
   true of today.
5. "A method read through the store ignores the `this` its caller passes; it
   always runs on the store." This is true of today. "A function read from a
   snapshot or from your own object runs with the `this` its caller gives."
6. "Writing a method you read back into the store stores the function it
   wraps: `store.a = store.a` is no change, and `store.b = store.a` stores
   `a`'s function. A method read from one store and written into another, or
   into a list, stays bound to the first store."
7. "Call methods on the live store. A method on a snapshot is the plain
   function: a shorthand method that writes `this` throws there, and an
   arrow-function field of a `ClassyStore` subclass writes the live store
   one write at a time, not as one transaction."
8. "A property that is read-only and not configurable, for example after
   `Object.freeze(store)`, hands out its function as it is, unbound."
9. "A class that does not extend `ClassyStore` and uses an arrow-function
   field writes to the raw object, and no subscriber hears it. Extend
   `ClassyStore` or use a prototype method." (Unchanged from F1.)

Compared with F1's text, R drops the "born with" clause, the `= null` advice,
"the store replaces a method with its own wrapper, in the object you passed
in too" and "a method read from a snapshot writes the live store".

## 6. Recommendation

**Take R in place of F1 for decision 1. Before 1.0.**

- R is today's rule with today's defects removed. Every row where today and
  F1 differ and today is right (the four `copy.ts` rows, `thiscall.ts`, the
  restore, the read-only definition, the literal snapshot getter), R is
  today. Every row where today is wrong (a class, `function`, frozen function
  or store as a value, a function in a list, the copied wrapper,
  `store.f = store.f`, the stale getter, `constructor`, the overriding arrow
  field, one function in two stores, the name), R has F1's fix.
- It never writes into the user's object. That removes objections 1, 2, 6 and
  8 of the second adversarial review by construction, and objection 3's first
  half (an object-literal method called by a snapshot getter).
- Its timings are the base's on the core benchmark, and F1's Node cost on
  `store.method` is gone. An own method call is slower than F1 (about 28 ns
  on Bun) unless stage 4 takes the fast path, which I would: an
  object-literal or base-class arrow method is the call a component makes
  most.
- It has fewer clauses than F1 (no "born with", no "new key", no "replaces a
  method", no creation scan), 15 fewer bytes, and objection 7 does not arise:
  case 1 checks no `prototype`, and the text says so.

**Where R is worse than F1, plainly:**

1. **Identity through the store.** Under F1 a callback assigned to a field
   declared `= null` keeps its identity on the store (`store.onSave === cb`).
   Under R no own function read through the store does, as today. The
   identity is kept on the snapshot and the raw object, which F1 loses for
   every function an object is born with. A user who compares on the store
   must compare on a snapshot.
2. **A base-class arrow field read from a snapshot.** Under F1 it is the
   store's wrapper: `snapshot(k).bump === k.bump`, one transaction. Under R it
   is the raw arrow: a different function, and each write notifies (2 for two
   writes). Calling it still writes the live store. The reference already
   says "call mutating methods on the live store"; the React docs have
   components read a snapshot and call store methods. A component that
   destructures an arrow method from `useClassyStore(store)` and calls it gets
   one render per write instead of one per call. Not run in React.

Neither is a silent wrong value of the kind the adversarial review found in
F1. I take R.

If the owner wants identity on the store for `= null` fields, the
alternative is F1 with the adversarial review's repairs (rebind a foreign
wrapper, exempt read-only definitions, a restore past clauses 3 and 4), and
the `this` and raw-object costs of objection 2 stay. Strict with the base
class's exception is worse than both: an object-literal method is not a
transaction (2 notifications, detached throws).

## Cost for stage 4

- `core.ts`, about 50 lines of code on the base: the get trap's own-function
  branch, `methodOf` and `unwrap` in the node's closure, the key in
  `transactional()`, the `wrapperSources` map. `ownership.ts` untouched.
- Tests to write first: every row of section 1's tables marked in bold and
  the R column of section 2; the override case under both class-field
  compilations; one function in two stores; the wrapper's name for a
  prototype and an own method; `store.a = store.a` and `store.b = store.a`;
  a foreign wrapper written and called; a read after `Object.freeze(raw)`.
- Tests to change: T1 strict's nine fixes, as with F1. Nothing else.
- Risk: low. The get trap is the only path that changes for reads; no
  creation path changes, so the class report's compiler outputs are not at
  stake.
- `CONSTRAINTS.md`: the main entry's budget, inside decision 4's ceiling:
  +155 bytes on the base, +198 with the fast path.
- Choose whether to take the fast path: +43 bytes, an own method call as
  fast as F1, and the two gaps of section 2's last table, which then need a
  test each and a sentence.

## Verified and not verified

- **Run:** the unit suite and the typecheck on R; `bun run size` on R (F1's
  figures are those of `spike-functions.md`, same base, same Bun);
  `repro/cases.ts` on today, the base, F1 and R; the second adversarial
  review's five scripts on the base, F1 and R (and `copy.ts`, `snapgetter.ts`
  on today); the override case compiled both ways by `Bun.Transpiler`.
- **Also run:** `repro/own-method.mjs` on the base, F1, R, R without the
  read-only check and R with the fast path; `repro/readonly-after-read.ts`
  on today, the base, F1, R and the fast path; the unit suite, typecheck,
  size and case script on the fast path.
- **Read only:** the docs sentence "call mutating methods on the live store".
- **Reasoning:** that a component destructuring a base-class arrow method
  from a snapshot renders once per write; that a node flag would miss a
  change made on the raw object (the R row is run, the flag variant is not
  built).
- **Not run:** the full core benchmark on the fast path; the browser,
  framework and mutation suites; P7's naming hook
  (the key reaches `transactional()` and the wrapper's `name`; no hook reads
  it in this build); compilers other than Bun's transpiler.

## Appendix A: how to run it again

1. `git -C <repo> worktree add --detach <scratch>/stage-3-spike-functions-2/wt 57404c3`,
   then `bun install --frozen-lockfile` and `bun run build` in it.
2. Apply `c1-t1strict.patch` of `spike-classes.md` (the base), then
   `rule-r.patch` below. For the comparison columns make `wt-strict` (the base)
   and `wt-f1` (the base plus `rule-f1.patch` of `spike-functions.md`) the
   same way.
3. `bun run test`, `bun run --filter @codebelt/classy-store typecheck`,
   `bun run size` in `wt`.
4. Cases: `CLASSY_REPO=<repo> bun repro/cases.ts <today|strict|f1|r>`. The
   review's scripts: `bun repro/adv/<script>.ts <worktree>` (copies of
   `<scratch>/stage-3-adversarial-2-core/repro/`). The override case:
   `bun repro/assign/compile.ts`, then
   `bun repro/assign/override-define-<false|true>.mjs <worktree>/packages/classy-store/src/index.ts`
   (both scripts are in appendix C of `spike-functions.md`).
5. Timings: `bench.sh` below, on saved copies (`dist/`, `tests/benchmark/`,
   `package.json`) under `wt/packages/classy-store/_copies/`: `bench-strict`
   and `bench-rule` (F1) copied from `spike-functions.md`'s folder,
   `bench-r` saved from this build. `repro/own-method.mjs <copy>` on Bun and
   Node for an own method.

## Appendix B: patches

### `rule-r.patch`: R, on `c1-t1strict.patch`

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -263,8 +263,9 @@
 function transactional(
   method: (...args: unknown[]) => unknown,
   receiver: object,
+  key: PropertyKey,
 ): (...args: unknown[]) => unknown {
-  return function (...args: unknown[]) {
+  const wrapper = function (...args: unknown[]) {
     // A class stored as data stays constructible, as a bound function would.
     if (new.target) return Reflect.construct(method, args);
     transactionDepth++;
@@ -274,8 +275,15 @@
       settleTransaction();
     }
   };
+  // The key it was read under names it, for `devtools` and a naming hook.
+  Object.defineProperty(wrapper, 'name', {value: String(key)});
+  wrapperSources.set(wrapper, method);
+  return wrapper;
 }
 
+/** Each wrapper a read made, and the function it wraps. */
+const wrapperSources = new WeakMap<object, unknown>();
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
@@ -396,8 +404,30 @@
   const existing = targetNodes.get(target) ?? internalsMap.get(target);
   if (existing) return existing;
 
-  /** One wrapper per method, so every read returns the same reference. */
-  const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
+  /** One wrapper per method, made on the first method read of this node. */
+  let boundMethods:
+    | WeakMap<object, (...args: unknown[]) => unknown>
+    | undefined;
+  const methodOf = (
+    method: (...args: unknown[]) => unknown,
+    receiver: object,
+    key: PropertyKey,
+  ) => {
+    boundMethods ??= new WeakMap();
+    let bound = boundMethods.get(method);
+    if (!bound) {
+      bound = transactional(method, receiver, key);
+      boundMethods.set(method, bound);
+    }
+    return bound;
+  };
+  /** A wrapper this node made is written as the function it wraps. */
+  const unwrap = (value: unknown) => {
+    const source = wrapperSources.get(value as object);
+    return source && boundMethods?.get(source as object) === value
+      ? source
+      : value;
+  };
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
@@ -406,7 +436,9 @@
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
-          : incoming;
+          : typeof incoming === 'function'
+            ? unwrap(incoming)
+            : incoming;
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
@@ -474,20 +506,34 @@
 
       // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
       // and run each call as one transaction. A method is a function found on
-      // the prototype chain. A function the object holds itself is data, and
-      // so is `constructor`: both are returned as they are.
-      if (
-        typeof value === 'function' &&
-        prop !== 'constructor' &&
-        !Object.hasOwn(_target, prop)
-      ) {
-        const method = value as (...args: unknown[]) => unknown;
-        let bound = boundMethods.get(method);
-        if (!bound) {
-          bound = transactional(method, receiver);
-          boundMethods.set(method, bound);
+      // the prototype chain, but not `constructor`; or a function an object
+      // that is not an array holds itself, read here, unless it has its own
+      // `prototype` (a class, a `function`, a wrapper), is frozen, is a store,
+      // or sits in a read-only property. The object itself is never changed.
+      if (typeof value === 'function') {
+        const own = Object.getOwnPropertyDescriptor(_target, prop);
+        if (!own) {
+          if (prop !== 'constructor')
+            return methodOf(
+              value as (...args: unknown[]) => unknown,
+              receiver,
+              prop,
+            );
+        } else {
+          // A later replacement of the field must reach a getter that calls it.
+          recordDep(internal, prop, value);
+          return Array.isArray(_target) ||
+            Object.hasOwn(value, 'prototype') ||
+            Object.isFrozen(value) ||
+            internalsMap.has(value) ||
+            isReadOnly(own)
+            ? value
+            : methodOf(
+                value as (...args: unknown[]) => unknown,
+                receiver,
+                prop,
+              );
         }
-        return bound;
       }
 
       // Own data edges are indexed before a retained alias can be mutated.
@@ -498,9 +544,13 @@
       return child ? child.proxy : value;
     },
 
-    defineProperty(_target, prop, descriptor) {
+    defineProperty(_target, prop, requested) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      const descriptor =
+        typeof requested.value === 'function'
+          ? {...requested, value: unwrap(requested.value)}
+          : requested;
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
       // The bookkeeping of a write: the property's value is its child, or it
```

### `r-fast-on-r.patch`: the fast path, on `rule-r.patch`

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -421,6 +421,8 @@
     }
     return bound;
   };
+  /** Set once a definition through the store made a property read-only. */
+  let lockedKeys = false;
   /** A wrapper this node made is written as the function it wraps. */
   const unwrap = (value: unknown) => {
     const source = wrapperSources.get(value as object);
@@ -511,8 +513,7 @@
       // `prototype` (a class, a `function`, a wrapper), is frozen, is a store,
       // or sits in a read-only property. The object itself is never changed.
       if (typeof value === 'function') {
-        const own = Object.getOwnPropertyDescriptor(_target, prop);
-        if (!own) {
+        if (!Object.hasOwn(_target, prop)) {
           if (prop !== 'constructor')
             return methodOf(
               value as (...args: unknown[]) => unknown,
@@ -522,6 +523,12 @@
         } else {
           // A later replacement of the field must reach a getter that calls it.
           recordDep(internal, prop, value);
+          // Seen before, and no property of this object can have become
+          // read-only through the store or by freezing it since.
+          const known = boundMethods?.get(value as object);
+          if (known && !lockedKeys && Object.isExtensible(_target))
+            return known;
+          const own = Object.getOwnPropertyDescriptor(_target, prop);
           return Array.isArray(_target) ||
             Object.hasOwn(value, 'prototype') ||
             Object.isFrozen(value) ||
@@ -553,6 +560,7 @@
           : requested;
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
+      if (isReadOnly(own)) lockedKeys = true;
       // The bookkeeping of a write: the property's value is its child, or it
       // has none. `Object.freeze(proxy)` arrives here once per property, and
       // `linkChild` leaves the value of a read-only property as it is.
```

## Appendix C: scripts

### `repro/cases.ts`

```ts
// The cases of spike-functions.md plus the rows of spike-functions-2.md.
// today: unmodified; strict: the base; f1: rule-f1.patch; r: this spike.
// Usage: CLASSY_REPO=<repo> bun cases.ts <today|strict|f1|r>
const variant = process.argv[2] ?? 'r';
const F = import.meta.dir + '/..';
const root =
  variant === 'today'
    ? `${process.env.CLASSY_REPO}/packages/classy-store/src`
    : `${F}/${variant === 'r' ? 'wt' : `wt-${variant}`}/packages/classy-store/src`;
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

section(`${variant}: rows of spike-functions-2`);
{
  const s: Any = createClassyStore({onSave: null as Any});
  const cb = () => {};
  s.onSave = cb;
  out('N1. declared = null, assigned: s.onSave === cb', s.onSave === cb);
  out('N1. snapshot(s).onSave === cb', snapshot(s).onSave === cb);
  out('N1. s.onSave === s.onSave', s.onSave === s.onSave);
  out(
    'N1. s.onSave() works',
    attempt(() => (s.onSave(), 'ok')),
  );
}
{
  // copy.ts of adversarial-2-core: counters of the first and second store.
  const defaults = {
    n: 0,
    inc() {
      this.n++;
    },
  };
  const c: Any = createClassyStore(defaults);
  const d: Any = createClassyStore({...defaults});
  d.inc();
  out(
    'C1. createClassyStore(defaults), then ({...defaults}): c.n, d.n',
    `${c.n}, ${d.n}`,
  );
  const e: Any = createClassyStore({
    n: 0,
    inc() {
      this.n++;
    },
  });
  const f: Any = createClassyStore({...snapshot(e)});
  f.inc();
  out('C2. createClassyStore({...snapshot(e)}): e.n, f.n', `${e.n}, ${f.n}`);
  const g: Any = createClassyStore({
    n: 0,
    inc() {
      this.n++;
    },
  });
  const h: Any = createClassyStore({...g});
  h.inc();
  out(
    'C3. createClassyStore({...g}), a copy of the proxy: g.n, h.n',
    `${g.n}, ${h.n}`,
  );
  const config = {
    count: 0,
    bump() {
      this.count++;
    },
  };
  const s1: Any = createClassyStore({config});
  const s2: Any = createClassyStore({config: {...config}});
  const heard = sync(s2, () => s2.config.bump());
  out(
    'C4. {config} in one store, {config: {...config}} in another: s1, s2, s2 sync',
    `${s1.config.count}, ${s2.config.count}, ${heard}`,
  );
}
{
  // thiscall.ts
  const options = {
    ticks: {
      callback(v: number) {
        return `${(this as Any).prefix}${v}`;
      },
    },
  };
  const s: Any = createClassyStore({options});
  const scale = {prefix: '$'};
  out(
    'T1. snapshot callback.call(scale, 1)',
    attempt(() => snapshot(s).options.ticks.callback.call(scale, 1)),
  );
  out(
    'T1. raw options callback.call(scale, 1)',
    attempt(() => options.ticks.callback.call(scale, 1)),
  );
  out(
    'T1. store callback.call(scale, 1)',
    attempt(() => s.options.ticks.callback.call(scale, 1)),
  );
  const handlers = {onClick() {}};
  const registered = handlers.onClick;
  createClassyStore({handlers});
  out(
    'T1. raw handlers.onClick === registered earlier',
    handlers.onClick === registered,
  );
}
{
  // restore-fn.ts, with the identity checked where this rule keeps it
  const cb = () => {};
  const s: Any = createClassyStore({onSave: null as Any});
  s.onSave = cb;
  const recorded = snapshot(s).onSave;
  delete s.onSave;
  s.onSave = recorded;
  out('H1. recorded === cb', recorded === cb);
  out(
    'H1. after restore by set: s.onSave === cb (read through store)',
    s.onSave === cb,
  );
  out(
    'H1. after restore by set: snapshot(s).onSave === cb',
    snapshot(s).onSave === cb,
  );
  const v: Any = createClassyStore({onSave: null as Any});
  v.onSave = cb;
  delete v.onSave;
  Object.defineProperty(v, 'onSave', {
    value: cb,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  out(
    'H1. after restore by define: snapshot(v).onSave === cb',
    snapshot(v).onSave === cb,
  );
  // the real withHistory restore
  const w: Any = createClassyStore({onSave: null as Any, n: 0});
  const hist: Any = withHistory(w);
  w.onSave = cb;
  await new Promise((r) => setTimeout(r, 0));
  w.onSave = () => {};
  await new Promise((r) => setTimeout(r, 0));
  hist.undo();
  out(
    'H1. withHistory undo: snapshot(w).onSave === cb',
    snapshot(w).onSave === cb,
  );
}
{
  // define-ro.ts
  const s: Any = createClassyStore({n: 1});
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  const fn = () => 'json';
  const r1 = attempt(
    () => (Object.defineProperty(s, 'toJSON', {value: fn}), 'defined'),
  );
  const r2 = attempt(() => s.toJSON === fn);
  out(
    'R1. defineProperty read-only fn: result, read === fn, sync',
    `${r1}, ${r2}, ${calls}`,
  );
  out(
    'R1. JSON.stringify(s)',
    attempt(() => JSON.stringify(s)),
  );
}
{
  // Object.freeze through the store, then read an own function
  const s: Any = createClassyStore({
    n: 0,
    inc() {
      this.n++;
    },
    arrow: () => 1,
  });
  const before = s.inc;
  const fr = attempt(() => (Object.freeze(s), 'frozen'));
  const raw = attempt(() => typeof s.inc);
  out('R2. freeze(store): result, typeof s.inc', `${fr}, ${raw}`);
  out(
    'R2. after freeze: s.inc === before (the wrapper)',
    attempt(() => s.inc === before),
  );
  out(
    'R2. after freeze: s.arrow() ',
    attempt(() => s.arrow()),
  );
}
{
  // Object.freeze on the raw object, outside the store
  const raw = {
    n: 0,
    inc() {
      this.n++;
    },
  };
  const s: Any = createClassyStore(raw);
  Object.freeze(raw);
  out(
    'R3. freeze(raw) after creation: typeof s.inc',
    attempt(() => typeof s.inc),
  );
}
if (ClassyStore) {
  class K extends (ClassyStore as Any) {
    a = 0;
    b = 0;
    bump = () => {
      this.a++;
      this.b++;
    };
  }
  const k: Any = new K();
  const snap: Any = snapshot(k);
  out(
    'K1. base-class arrow field: snapshot(k).bump === k.bump',
    snap.bump === k.bump,
  );
  out(
    'K1. snapshot(k).bump(): sync calls, k.a',
    `${sync(k, () => snap.bump())}, ${k.a}`,
  );
  out(
    'K1. k.bump(): sync calls',
    sync(k, () => k.bump()),
  );
}
{
  // A wrapper handed to another store's field and pushed into a list
  const s: Any = createClassyStore({
    n: 0,
    inc() {
      this.n++;
    },
  });
  const o: Any = createClassyStore({fn: null as Any, list: [] as Any[]});
  o.fn = s.inc;
  o.list.push(s.inc);
  out(
    'X1. o.fn === s.inc, o.list[0] === s.inc',
    `${o.fn === s.inc}, ${o.list[0] === s.inc}`,
  );
  o.fn();
  o.list[0]();
  out('X1. after calling both: s.n', s.n);
  const own: Any = createClassyStore({
    n: 0,
    go() {
      this.n++;
    },
  });
  const read = own.go;
  own.copy = own.go;
  out(
    'X2. own method copied to another key: own.copy === own.go',
    own.copy === own.go,
  );
  out(
    'X2. sync calls for own.go = own.go',
    sync(own, () => (own.go = own.go)),
  );
  out('X2. own.go === read after', own.go === read);
  const proto: Any = createClassyStore(new Counter());
  out(
    'X3. prototype method written back: sync calls for p.inc = p.inc',
    sync(proto, () => (proto.inc = proto.inc)),
  );
  out('X3. p.inc now own', Object.hasOwn(proto, 'inc'));
}
{
  // One function held by two stores
  const shared = function (this: Any) {
    this.n++;
  };
  const arrowShared = {
    touch(this: Any) {
      this.n++;
    },
  }.touch;
  const a: Any = createClassyStore({n: 0, t: arrowShared});
  const b: Any = createClassyStore({n: 0, t: arrowShared});
  b.t();
  out('S1. shorthand fn in two stores, b.t(): a.n, b.n', `${a.n}, ${b.n}`);
  out('S1. a.t === b.t', a.t === b.t);
  void shared;
}
{
  // A getter that calls a field function sees a replacement (the read records a dependency)
  const s: Any = createClassyStore({
    fmt: (n: number) => `a${n}`,
    count: 1,
    get label() {
      return this.fmt(this.count);
    },
  });
  s.label;
  s.fmt = (n: number) => `b${n}`;
  out(
    'G1. literal getter calling field fn after replace: store, snapshot',
    `${s.label}, ${snapshot(s).label}`,
  );
}
{
  const snapgetter: Any = createClassyStore({
    count: 0,
    hits: 0,
    touch() {
      this.hits++;
    },
    get doubled() {
      this.touch();
      return this.count * 2;
    },
  });
  let calls = 0;
  subscribe(snapgetter, () => calls++, {sync: true});
  const r = attempt(() => snapshot(snapgetter).doubled);
  out(
    'P1. snapgetter literal: result, liveHits, sync',
    `${r}, ${snapgetter.hits}, ${calls}`,
  );
}
```

### `repro/own-method.mjs`

```js
// Time an own (object-literal) method call and an own-function read through a
// store. Usage: node|bun own-method.mjs <copy folder with dist/>
const dir = process.argv[2];
const {createClassyStore} = await import(`${dir}/dist/index.mjs`);
const N = 2_000_000;
const time = (label, run) => {
  const results = [];
  for (let r = 0; r < 7; r++) {
    const t = performance.now();
    run();
    results.push(((performance.now() - t) * 1e6) / N);
  }
  results.sort((a, b) => a - b);
  console.log(
    label.padEnd(18),
    `${results[3].toFixed(1)} (${results[0].toFixed(1)} to ${results[6].toFixed(1)})`,
  );
};
const s = createClassyStore({
  count: 0,
  inc() {
    this.count++;
  },
  fmt: (n) => n,
});
let sink = 0;
time('own.method', () => {
  for (let i = 0; i < N; i++) s.inc();
});
time('own.fn.read', () => {
  for (let i = 0; i < N; i++) sink += s.fmt(i);
});
if (sink === -1) console.log(sink);
```

### `repro/readonly-after-read.ts`

```ts
// A property that becomes read-only after its first read. Usage: bun readonly-after-read.ts <worktree>
const {createClassyStore} = await import(
  `${process.argv[2]}/packages/classy-store/src/index.ts`
);
const t = (run: () => unknown) => {
  try {
    return run();
  } catch (e) {
    return `throws ${(e as Error).constructor.name}`;
  }
};
const fn = () => 1;
const a = {f: fn};
const sa: any = createClassyStore(a);
sa.f;
Object.freeze(a);
const b = {f: fn};
const sb: any = createClassyStore(b);
sb.f;
Object.defineProperty(sb, 'f', {writable: false, configurable: false});
const c = {f: fn};
const sc: any = createClassyStore(c);
sc.f;
Object.defineProperty(c, 'f', {writable: false, configurable: false});
const d = {f: fn};
const sd: any = createClassyStore(d);
sd.f;
Object.freeze(fn);
console.log(
  JSON.stringify({
    'freeze(raw) after a read: s.f === fn': t(() => sa.f === fn),
    'read-only through the store after a read: s.f === fn': t(
      () => sb.f === fn,
    ),
    'read-only on the raw object after a read: s.f === fn': t(
      () => sc.f === fn,
    ),
    'function frozen after a read: s.f === fn': t(() => sd.f === fn),
  }),
);
```

### `bench.sh`

```sh
#!/bin/zsh
cd <scratch>/stage-3-spike-functions-2/wt/packages/classy-store/_copies
for round in 1 2; do
for c in bench-strict bench-rule bench-r; do
  echo "## $c bun round $round"; bun $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | grep -E '^\| (store.method|store.read|create.small|create.rows|read:|write:|getter:|snapshot:) '
  echo "## $c node round $round"; node $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | grep -E '^\| (store.method|store.read|create.small|create.rows|read:|write:|getter:|snapshot:) '
done
done
```

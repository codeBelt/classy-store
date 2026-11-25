# Stage 3 spikes: the proxy traps

Status: **complete for the brief.** The agent that ran these spikes was cut
off by a usage limit on 2026-11-19 with two figures in "The combination" not
yet written. The orchestrating agent filled them on 2026-11-24 from a fresh
worktree and marked them as its own. "Not done" lists what was left out.

- Worktree: a detached copy of `release/1.0` at `57404c3`, in the scratch
  folder `stage-3-spike-traps/wt`. Nothing here is committed anywhere.
- Patches: `stage-3-spike-traps/patches/`, and in the appendix of this file.

## Baseline

The unmodified worktree, measured before any spike:

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes. It needs a
  build first, because two React test helpers import the built package.
- `bun run size`: main entry 3,661 bytes gzipped (budget 3,750). The other
  entries are in the table under "The combination".
- `bun run benchmark:core` (Bun), ratios to a forwarding Proxy, median and
  range of five runs: read 14.6 (11.9 to 16.3), write 2.59 (2.58 to 2.63),
  cached getter 26.9 (23.7 to 31.4), cached snapshot 7.15 (5.5 to 8.24).
- `bun run benchmark:core:node`: read 2.04 (2.02 to 2.05), write 1.34 (1.31
  to 1.37), cached getter 3.53 (3.48 to 3.73), cached snapshot 1.36 (1.1 to
  1.46).

Other agents ran the same benchmark on this machine at the same time, so
every spike below is compared with a baseline build run back to back with it,
not with the figures above. Each timing is the median of three fresh
processes per build, with the lowest and highest run. "Slower" or "faster"
means the two ranges do not touch. The raw output is in appendix E.

**A correction to my own first measurements.** The first back-to-back runs
compared each spike with itself. The built entry loads its runtime through
the package import `#store-runtime`, and without a `package.json` in each
saved build both arms resolved it to the worktree's current build. I found
this when a "baseline" run showed the read time of the descriptor cache. I
gave each saved build its own `package.json` and ran every comparison again.
Every timing in this report is from the second set. Nothing else was
affected: tests, typecheck, size and the reproductions do not go through the
saved builds.

## T1. A stored function is returned as it is

- **Question.** Which functions read through a store should be bound to it
  and run as a transaction? Stage 1 findings 5, 6, 42 and 62; Valtio V2, Vue
  4, Solid 3, Svelte 3, MobX 9.
- **What was changed.** `core.ts` only, the `get` trap and the wrapper cache.
  Two variants, each measured alone:
  - **Strict** (15 lines added, 17 removed): a method is a function found on
    the prototype chain. A function the object holds itself, and
    `constructor`, are returned as they are.
  - **Lenient** (13 added, 16 removed), which is what the stage 2 reports
    propose: every function is still wrapped, except an array element,
    `constructor`, and a class (a function whose `prototype` property is not
    writable).
  - Both keep one wrapper per method and node in a `WeakMap` keyed by the
    function, where today's cache is keyed by property name and arrays have
    none. The two `boundMethods.delete(prop)` calls go away.

### The cases

"Wrapped" means bound to the store and run as one transaction. Each row was
run in `repro/t1.ts`, before and after.

| Case                                                             | Today                                                                                                   | Strict                                                                       | Lenient                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A prototype method                                               | Wrapped, one wrapper per key                                                                            | Wrapped, one wrapper per function                                            | The same as strict                                                         |
| An array method (`list.push`)                                    | Wrapped, a new wrapper on every read                                                                    | Wrapped, `list.push === list.push`                                           | The same as strict                                                         |
| A getter that returns a function                                 | Returned as the getter gave it, memoized                                                                | No change                                                                    | No change                                                                  |
| An own property holding an ordinary function                     | Wrapped: `store.handler !== handler`                                                                    | Returned as it is. Called on the store, `this` is the store                  | Wrapped, as today                                                          |
| An object-literal method (`{count: 0, inc() {...}}`)             | Wrapped: one notification for two writes, works when destructured                                       | Not wrapped: two notifications, and a destructured call throws a `TypeError` | Wrapped, as today                                                          |
| An own property holding an arrow function                        | Wrapped, though binding an arrow does nothing                                                           | Returned as it is                                                            | Wrapped, as today                                                          |
| A function in an array (finding 5)                               | A new wrapper on every read: `indexOf` is -1, and `splice(indexOf(first), 1)` removes the last callback | Returned as it is: `indexOf` is 0 and the splice removes the right one       | The same as strict                                                         |
| A class held as a value (finding 6)                              | A wrapper: `store.Model.label` is `undefined`, `new store.Model() instanceof store.Model` is `false`    | The class: `'model'` and `true`                                              | The same as strict                                                         |
| A constructor written as a `function`, held as a value           | A wrapper without its own properties                                                                    | The function                                                                 | Still a wrapper: its `prototype` is writable, so it is not seen as a class |
| A bound function                                                 | Wrapped: `store.bound !== bound`                                                                        | Returned as it is                                                            | Wrapped, as today                                                          |
| A frozen function                                                | Wrapped                                                                                                 | Returned as it is                                                            | Wrapped, as today                                                          |
| `constructor` (finding 42)                                       | A wrapper: `store.constructor !== Counter`, and it differs from `snapshot(store).constructor`           | The class, on the store and on the snapshot                                  | The same as strict                                                         |
| A store made from a function, held by another store (finding 62) | `holder.fn !== fnStore`; the holder is not told of its writes; a reactive set holds it twice            | `holder.fn === fnStore`. The other two are unchanged                         | Unchanged                                                                  |

Three things the cases showed that stage 1 does not list:

- **Today a read wrapper gets stored.** `store.cb = store.cb` notifies, and
  after `list.push(holder.onChange)` the list holds the wrapper, not the
  function. Each copy from one field to another wraps once more. Strict
  removes this (0 notifications, the list holds the function). Lenient keeps
  it.
- **Today a getter that calls a function held in a field goes stale.** With
  `get label() { return this.format(this.count) }`, after
  `store.format = other` the store still answers with the old function's
  result while a new snapshot uses the new one. A function read records no
  dependency. Strict fixes it, because an own function now takes the ordinary
  data path. Lenient keeps it.
- **A method replaced on the prototype, or a swapped prototype, is picked up**
  under both variants (the method half of stage 1 finding 47), because the
  cache is keyed by the function.

### Result

| Measure               | Strict                             | Lenient                            |
| --------------------- | ---------------------------------- | ---------------------------------- |
| Tests                 | 1,331 pass, 10 fail                | 1,333 pass, 8 fail                 |
| Typecheck             | Passes                             | Passes                             |
| Main entry, gzipped   | 3,661 bytes, +0                    | 3,683 bytes, +22                   |
| `store.method`, Bun   | 236 ns baseline, 224 ns spike      | 227 ns baseline, 226 ns spike      |
| `store.method`, Node  | 294 ns, 297 ns                     | 297 ns, 299 ns                     |
| `array.pushPop`, Bun  | 1,652 ns, 1,666 ns                 | 1,669 ns, 1,708 ns (slower, by 2%) |
| `array.pushPop`, Node | 3,689 ns, 3,758 ns                 | 3,570 ns, 3,623 ns                 |
| `store.read`, Bun     | 33.2 ns, 32.9 ns                   | Not run                            |
| `store.read`, Node    | 47.7 ns, 48.8 ns                   | Not run                            |
| `create.small`, Bun   | 1,683 ns, 1,746 ns (slower, by 4%) | Not run                            |
| `create.small`, Node  | 6,287 ns, 6,086 ns                 | Not run                            |

Everything is inside the spread except two rows. Creating a small store is 4%
slower on Bun under strict (1,672 to 1,711 against 1,742 to 1,807). The spike
makes one `WeakMap` per node where the code today makes one `Map`; making it
on the first method read would take that back. Lenient is 2% slower on
`array.pushPop` on Bun.

The failing tests. Eight fail under both variants and all eight are
**fixes**:

- `core.characterisation.identity.test.ts`, "functions read through a store":
  - "a function held in a store array is not found by includes() or
    indexOf(), even when it was just read from that array" (finding 5).
  - "splice(indexOf(fn), 1) on a store array of functions removes the last
    function, not the one asked for" (finding 5).
  - "a class stored as data is read back as a wrapper without its static
    members" (finding 6).
  - "a method read from a store array is a new function on every read". This
    pins the cause of finding 5.
- `core.characterisation.getters.test.ts`, "static getters": "are not
  reachable through store.constructor, which is not the class" and "read
  through this.constructor are undefined on the store and correct on a
  snapshot" (finding 42).
- `core.characterisation.invariants.test.ts`: "a nested array is an array to
  Array.isArray ... and slice, filter and concat return plain arrays of
  proxies". It stops at `expect(store.items.constructor).not.toBe(Array)`,
  which is finding 42. I ran the rest of it by hand (`repro/t1-extra.ts`):
  `slice`, `filter`, `concat`, `map`, `flat`, `toSorted` and `with` still
  return plain arrays that hold proxies.
- The same file: "a method called before a prototype swap keeps the old body
  for good; one first called after it has the new body" (finding 47).

Two more fail under strict only:

- `core.characterisation.identity.test.ts`: "a function stored as data is
  read back as one stable wrapper bound to the store, while the snapshot holds
  the original". **Fixes**: the store and the snapshot now hold the same
  function.
- `core.characterisation.notifications.test.ts`: "a store method that writes
  two stores notifies their sync subscribers when it returns, in the order
  they were first written". **Incidental**. Its "store method" is a method of
  an object literal, which strict no longer treats as a transaction, so the
  three writes give three notifications. Written with a class the test would
  pass. The decision document must say whether an object-literal method is a
  transaction.

Under strict no test needs the `new.target` branch of `transactional` any
more: I deleted it and the same ten tests failed. It still does something in
one case no test covers, a class held on a prototype and called with `new`
through the store. The combination keeps the two lines; stage 4 can drop them
if the owner accepts that case.

### What it breaks or changes for a user

- Under both: a function in an array, a class held as a value and
  `constructor` come back as themselves. Code that relied on a function in an
  array being bound to that array breaks.
- Under strict only: a function held in a field comes back as itself. An
  object-literal store's methods (`createClassyStore({count: 0, inc() {...}})`)
  still work when called as `store.inc()`, but each write inside notifies
  synchronous subscribers on its own, and `const {inc} = store` or
  `onClick={store.inc}` throws. The docs define stores as classes and show no
  object-literal method; the tutorial already says to use prototype methods.
- A dependency on API question 4. A base class whose constructor returns the
  store makes arrow-function fields work, and those are own functions. Today
  such an arrow method that writes two fields gives one synchronous
  notification (`repro/t3.ts`, last section). Under strict it gives two. If
  the base class is adopted, it has to open the transaction itself, or the
  docs have to point at `batch()`.

### Recommendation

**Do the strict variant. Before 1.0.** One rule that can be said in a
sentence: a method is a function on the prototype chain; a function in a
field or a list is data. It is what every compared library does for data, it
fixes findings 5, 6 and 42 and three defects the lenient variant keeps, it
costs no bytes and it removes code. The price is the object-literal method,
which the docs do not show. If the owner wants object-literal methods to stay
transactions, the lenient variant is the fallback; it then needs one more
step, storing the original function when a wrapper is written back, which was
not spiked.

Finding 62 is not settled by either variant. The remaining question is
whether a function can be a store at all. Vue returns the function unchanged
and warns. That is a separate item for the decision document.

Two contradictions in `merged.md` that these runs bear on:

- **Contradiction 10** (does Solid's narrowing fix the `holder.fn === fn` part
  of finding 62?). Settled: it does not. Lenient is Solid's rule set, and
  under it `holder.fn === fnStore` is still `false`, because an own function
  on a plain object stays wrapped. Under strict it is `true`. The three tests
  in `core.functionStores.test.ts` pass unchanged under both, because they pin
  the other two parts of the finding.
- **Contradiction 9** (return a stored function as it is, or keep wrapping
  and cache one wrapper per function, as the MobX report proposes). Half
  settled. Both variants here return an array element as it is, and
  `indexOf(first)` is 0. I did not spike the MobX form. By reading, it gives
  `callbacks[0] === callbacks[0]` but keeps `callbacks[0] !== first`, and
  `indexOf(first)` stays -1 unless the search runs on the raw list, as T2's
  does.

### Cost for stage 4

`core.ts`, about 15 lines in the `get` trap. Ten tests to rewrite, new tests for each row of the table
above, and the docs (tutorial, architecture page) to state the rule. Low risk.
No number in `CONSTRAINTS.md` moves.

## T2. Raw values on write, and one node per raw object

- **Question.** Can the store keep proxies out of the raw object, treat an
  object that is already a store as that store wherever it turns up, and find
  an object in a list whatever form the caller holds? Stage 1 findings 7, 9
  and 10; Vue 2 and 3.
- **What was changed.** `core.ts` only, in two parts measured separately:
  - **Raw on write and node by raw object** (12 lines added, 8 removed). The
    `set` trap stores what a store proxy wraps. `linkChild` looks an existing
    node up by the raw object as well as by the proxy, before it asks
    `canProxy`. A setter still receives what the caller passed.
  - **Searches** (25 lines added, 1 removed). On a list, `includes`,
    `indexOf` and `lastIndexOf` compare by `identityOf`, as the reactive
    collections do. A primitive is searched for with the native method on the
    raw list.
- **Result.**
  - Reproduction (`repro/t2.ts`), before and after:
    - `list.includes(raw)`, `indexOf(raw)`, `lastIndexOf(raw)`: `false, -1,
      -1` before; `true, 0, 0` after. `includes(snapshot row)`: `false`
      before, `true` after. `includes(raw, 1)`, an equal stranger and `NaN`
      answer as a plain array does.
    - After `to.row = store.list[0]`, `reverse()`, `sort()` and
      `push(list[0])` the raw objects held proxies before and hold raw rows
      after. After `store.self = store`, `raw.self === raw`.
    - A class instance that is already a store, placed in another store by
      its raw object: `outer.inner === inner` was `false` and a method call
      through it told nobody. After, it is `true` and both stores are told
      once. This holds at creation and by assignment. A class instance that
      is not a store stays raw.
    - Unchanged: writing the same child back in either form is no change; a
      store created around a proxy keeps that proxy in its raw object; a
      frozen container keeps the proxy it was given; an assigned snapshot is
      kept.
  - Tests: 1,334 pass, 7 fail, all in
    `core.characterisation.identity.test.ts`, all **fixes**:
    - "a store inside a store > is not connected when the raw class instance
      behind it is embedded instead of its proxy" (finding 9).
    - "the raw objects behind a store, after writes through it": "keep a raw
      object that was assigned, and hold the proxy itself when a proxy was
      assigned" and "hold proxies in place of the raw elements once a store
      array was reversed in place" (finding 10).
    - "looking an object up in a store array": "includes(), indexOf() and
      lastIndexOf() find an element by its proxy and not by its raw object"
      and "an object is not found by includes() or indexOf() right after it
      was pushed" (finding 7).
    - "functions read through a store": "a function held in a store array is
      not found by includes() or indexOf() ..." and "splice(indexOf(fn), 1)
      ... removes the last function". These are finding 5. They flip because
      a function is searched for on the raw list, which holds the original.
      A function that was read from the list is still not found without T1.
    - The first part alone fails the first three; the searches add the other
      four.
  - The randomized test caught a mistake in my first version: writing
    `undefined` to a field that held a primitive was taken for no change. The
    corrected spike passes it. Stage 4 should keep that case as a named test.
  - Typecheck passes.
  - Size: main entry 3,697 bytes (+36) with the first part, 3,797 (+136)
    with both. **The second figure is over the 3,750 budget.**
  - Timings. `store.write`: Bun 159 ns against 159, Node 213 against 213.
    `store.write.same`, a write of the value a field already holds: Bun 34.5
    (34.5 to 34.7) against 34.8 (34.8 to 34.9), which is 0.3 ns slower; Node
    57.8 against 57.4. `store.read`, `store.read.nested`, `array.pushPop`,
    `store.batch10` and the other write metrics are inside the spread on both
    engines.
  - **Creating a store came out slower on Node:** `create.small` 5,320 ns
    (4,481 to 5,403) against 6,443 (6,441 to 6,575), and `create.rows`, a
    store of 1,000 rows, 1.20 ms (1.19 to 1.25) against 1.49 ms (1.46 to
    1.51). On Bun both are inside the spread (1,682 against 1,733 ns; 619
    against 631 microseconds). A second run with five processes per build is pending.
- **What it breaks or changes for a user.**
  - `list.includes(raw)` and `indexOf(raw)` change from "not found" to
    "found". A snapshot row is found too.
  - The raw object behind a store holds raw children after a write. Only
    code that keeps the raw object sees it.
  - A class instance without `PROXYABLE` that is itself a store becomes
    reactive inside another store. Before, it was silently disconnected.
  - Not covered: a list built from proxies and then assigned, as in
    `this.items = this.items.filter(...)`, still holds proxies in its raw
    array. Replacing them would change an array the caller may still hold: a
    method that goes on to write through `next[0]` after `this.items = next`
    would then write to the raw row and notify no one. So the spike leaves
    it. The searches do not depend on it, because they compare identities.
    This bears on M5 in `merged.md`: its option (b), running the search on
    the raw list, would miss every row of such a list, so only option (a),
    comparing by `identityOf`, works. The same holds for M10: an array method
    run on the raw list has to convert each element it hands to a callback,
    proxy or not.
  - Not covered: `reactiveSet([raw, proxy])` holding one object twice (stage 1
    finding 34). That is the collection constructor, not a trap.
- **Recommendation: do both parts.** The first is **Can follow 1.0** in the
  strict sense, since no documented behaviour changes, but it changes what
  `outer.inner === inner` answers, so it is safer **before 1.0**. The
  searches are **Before 1.0**: they change the result of a documented array
  method. The spike maps the whole list on each object search; the real
  version should loop once without allocating.
- **Cost for stage 4.** `core.ts`, about 40 lines. Seven tests to rewrite and
  new ones for a setter that receives a proxy, for `undefined` written over a
  primitive, and for a read-only property that holds a store's raw object.
  Medium risk in `linkChild`, which every read of an unknown object goes
  through: an opaque value (a `Date`, an unmarked class instance) now costs
  one more `WeakMap` lookup on each read. The benchmark has no metric for
  that. Timed by hand on Bun (`repro/t2-extra.ts`, two rounds): a `Date`
  field read cost 34.4 ns before and 35.3 to 36.2 ns after; an unmarked class
  instance 35.5 to 37.2 before and 36.6 to 37.4 after. The same script
  confirms that a read-only property holding a store's raw object still reads
  the raw object, and so does a frozen store root held by another store.
  **Size:** +136 bytes on the main entry, which the budget of 3,750
  cannot hold together with anything else here.

## T3. `Object.defineProperty` with a data descriptor is a write

- **Question.** What should a definition through a store do, and which
  definitions should a store refuse? Stage 1 findings 1, 45, 61, 66, 67 and
  71, and for the refusals 47, 48 and 49; Svelte 2, Vue 6, Solid 7, MobX 10,
  Immer 3.
- **What was changed.** `core.ts` only, the `defineProperty` trap. Three
  variants, each built on the one before it:
  - **(a) A definition is a write** (28 lines added, 9 removed). The trap
    resumes a suspended subtree first, as `get`, `set` and `deleteProperty`
    do. After a successful definition it does the bookkeeping of a write: the
    property's value becomes its child, or the old child is detached. A
    definition of `length` on a list detaches the removed rows. It notifies
    when the value, the getter, the kind of property or its enumerability
    changed, so `Object.freeze(store)`, which arrives as one attribute-only
    definition per key, stays silent. Every descriptor is still forwarded to
    the raw object.
  - **(b) Refuse what is not a write** (44 added, 9 removed in total). On top
    of (a): a descriptor with `get` or `set` throws a named error, and so
    does a descriptor with a `value` that leaves the property not writable. A
    `setPrototypeOf` trap throws. A descriptor with no `value`, `get` or
    `set` is still forwarded, which is what `Object.freeze` and `Object.seal`
    send, so both keep working.
  - **(c) Refuse freezing too** (54 added, 9 removed in total). On top of
    (b): a `preventExtensions` trap throws, which stops `Object.freeze`,
    `Object.seal` and `Object.preventExtensions` at their first step, and an
    attribute-only descriptor with `writable: false` throws.

### Reproductions

`repro/t3.ts`, before and after. "As (a)" means the same output as (a).

| Case                                                                                      | Today                                                        | (a)                                            | (b)                        | (c)                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | -------------------------- | ----------------------------------------- |
| Define a new data key (finding 1): notifications, in a snapshot cached before             | 0, missing                                                   | 1, present                                     | As (a)                     | As (a)                                    |
| The same definition again                                                                 | 0                                                            | 0                                              | As (a)                     | As (a)                                    |
| Redefine a field that holds an object to another object (finding 45)                      | Store and snapshot keep the old object                       | Both show the new one                          | As (a)                     | As (a)                                    |
| Then assign that same object                                                              | Taken for no change                                          | No change, correctly                           | As (a)                     | As (a)                                    |
| Redefine it to `7`                                                                        | Still reads the old object                                   | Reads 7                                        | As (a)                     | As (a)                                    |
| Define `length` 1 on a list of three                                                      | `rows[2]` still reads the removed row, and it still notifies | `rows[2]` is `undefined`; the row is detached  | As (a)                     | As (a)                                    |
| Redefine `rows[0]` to 7 (finding 71)                                                      | Store reads the old row, snapshot 7                          | Both 7                                         | As (a)                     | As (a)                                    |
| `{value: 3}` alone on a new key                                                           | Read-only, hidden, no notification                           | Read-only, hidden, 1 notification              | Throws the read-only error | Throws the read-only error                |
| `{value: 5}` alone on an existing key                                                     | Value 5, no notification                                     | Value 5, 1 notification                        | As (a)                     | As (a)                                    |
| A writable, non-enumerable data key                                                       | Value 1, missing from the cached snapshot                    | Value 1, in the snapshot, not in `Object.keys` | As (a)                     | As (a)                                    |
| An accessor on a new key                                                                  | Store 10, cached snapshot `undefined`                        | Store 10, snapshot 10, 1 notification          | Throws the accessor error  | Throws the accessor error                 |
| An accessor over a field that holds an object                                             | Store 5, snapshot still the object                           | Both 5, 1 notification                         | Throws the accessor error  | Throws the accessor error                 |
| `{writable: false, configurable: false}` on a field that holds an object                  | Reads the raw object, no notification                        | The same                                       | The same                   | Throws the read-only error                |
| `Object.freeze(store)`, `Object.freeze(store.config)`                                     | Work; no notification                                        | Work; no notification                          | Work                       | Throw; the object is left extensible      |
| `Object.seal(store)`, `Object.preventExtensions(store)`, then a write                     | Work; the write shows                                        | The same                                       | The same                   | Throw                                     |
| `Object.setPrototypeOf(store, B.prototype)`, then a getter both classes have              | The old getter's result                                      | The same                                       | Throws the prototype error | Throws the prototype error                |
| `Object.assign(store, JSON.parse('{"__proto__": {...}}'))` (finding 48)                   | Swaps the prototype                                          | The same                                       | Throws the prototype error | Throws the prototype error                |
| Freeze a container that left the store (findings 61, 67): first, second snapshot          | Stale, then current                                          | Current both times                             | As (a)                     | The freeze throws                         |
| The same: a subscriber added right after the freeze hears the next write                  | No                                                           | Yes                                            | As (a)                     | The freeze throws                         |
| The read that never returns (finding 66)                                                  | Killed after 8 seconds                                       | Returns 1                                      | Returns 1                  | The definition throws; the read returns 1 |
| A base class whose constructor returns the store: is `items` frozen in the first snapshot | No                                                           | Yes                                            | Yes                        | Yes                                       |

**The hang (finding 66).** Its cause is that the trap detaches a child of a
suspended container without resuming the container first.

- In (a) and (b) the line `internal.resumeScope()` at the top of the trap
  removes it. I checked this by deleting that one line from (a): the read
  hangs again.
- In (c) the definition that starts it throws, so nothing is detached. With
  the same line deleted from (c) the read still returns.
- All three keep the line, because a data definition on a suspended container
  needs it as `set` does. If the ownership spike removes the walk to a
  detached parent, the hang goes away there too and this line is no longer
  what prevents it.

**The base class, and contradiction 8 in `merged.md`.** Class fields reach
the trap as data descriptors with `writable: true`. All three variants here
accept those, so a derived class's fields are indexed and its first snapshot
is frozen. Variant (b) of this report is the brief's, not the Immer report's:
Immer's proposal refuses every descriptor that carries a `value`, and
`merged.md` showed by a run that such a trap makes the base class constructor
throw. (b) here refuses a `value` only when the property would end up not
writable, and the base class runs under it.

### Result

| Measure             | (a)                 | (b)                            | (c)                            |
| ------------------- | ------------------- | ------------------------------ | ------------------------------ |
| Tests               | 1,324 pass, 17 fail | 1,312 pass, 29 fail            | 1,304 pass, 37 fail            |
| Typecheck           | Passes              | Passes                         | Passes                         |
| Main entry, gzipped | 3,710 bytes, +49    | 3,870 bytes, +209, over budget | 3,924 bytes, +263, over budget |

Timings for (a): `store.write` 160 ns against 161 on Bun and 213 against 213
on Node; `store.read` 32.6 against 32.6 on Bun and 46.8 against 47.5 on Node;
`store.read.nested`, the other write metrics and `create.small` inside the
spread on both. No benchmark metric goes through this trap. (b) and (c) add
code to the same trap only and were not timed.

**(a): 17 failing tests, all fixes.** Each is marked `FINDING` in its file or
pins one of the findings above. The full list is in the appendix.

- `core.characterisation.invariants.test.ts`, 10 tests: the nine under
  "Object.defineProperty on a store" that pin findings 1 and 45, and "a
  length defined with Object.defineProperty empties the raw array in silence,
  and the store still hands out the removed element".
- `snapshot.redefinedElements.test.ts`, 2 tests (finding 71).
- `core.unobservedObjects.test.ts`, 3 tests, and
  `core.removedContainers.test.ts`, 2 tests (findings 61 and 67).
- One test keeps passing for a new reason: "an accessor defined over a nested
  object leaves that object connected: a write to it still notifies the
  store". It counts one notification. Today that is the later write to the
  object the accessor replaced; under (a) it is the definition, and the
  replaced object is detached. Stage 4 has to rewrite it.
- One more line, `internal.computedCache.delete(prop)` in the trap, also
  flips "keeps returning the old result after the getter is redefined, until a
  dependency changes" in `core.characterisation.getters.test.ts` (stage 1
  finding 44, for a getter redefined through the store). It is not in the
  patch, because the getter cache belongs to the getter spike.

**(b): 12 more, 29 in all.**

- **Fixes**, 8: the seven tests under "assigning **proto** or calling
  Object.setPrototypeOf on a store" in
  `core.characterisation.invariants.test.ts`, each marked `FINDING` (findings
  47 and 48); and "an accessor defined over a nested object leaves that object
  connected", also marked `FINDING`, which now throws.
- **Incidental**, 4:
  - `core.refusedDefinition.test.ts`, "leaves the object under that field
    connected: a write to it still notifies the store". It expects
    `Reflect.defineProperty` to return `false` for a field made read-only
    behind the store; (b) throws its own error first.
  - `core.characterisation.getters.test.ts`, "keeps returning the old result
    after the getter is redefined, until a dependency changes". It redefines
    an accessor through the store.
  - `core.characterisation.invariants.test.ts`, "Object.preventExtensions
    closes the raw object: a new key throws, assigned or defined ...". It
    expects a `TypeError` for `{value: 1}` on a new key and gets the store's
    `Error`.
  - The same file, "Object.keys lists the own enumerable string keys in
    property order, at once after an add, a delete or a definition". It
    defines a key with a descriptor (b) refuses.

**(c): 8 more, 37 in all.** All eight pin freezing or sealing through the
store, which works today on purpose (`f8a012f`). The tutorial documents it
("After `Object.freeze(store.profile)`, that object reads the same way; writes
to it throw") and the architecture page describes the trap. They are the
behaviour (c) removes, so the decision document has to count them as a
documented feature given up, not as defects:

- `core.frozenValues.test.ts`, 4 tests: "a root frozen afterwards keeps
  passing them on", "Object.freeze through the proxy leaves it readable",
  "Object.seal through the proxy keeps the object reactive", "a property made
  read-only through the proxy returns its own value".
- `core.unobservedObjects.test.ts`, 2 tests: "hands a nested object over as a
  working store of its own when it is frozen ..." (twice).
- `core.removedContainers.test.ts`: "shows a write to a child it shares with
  the store, made before the container was frozen".
- `core.characterisation.invariants.test.ts`: "Object.seal seals the raw
  object and notifies no one; fields stay reactive, a new key or a delete
  throws".

### What a user loses

- **(a): nothing.** Every definition that works today still works, and the
  store and its snapshots now agree with the raw object afterwards. A
  definition that changes a value or a key notifies, which it did not before.
- **(b):** defining a getter or a setter on a live store, defining a
  read-only value, `Object.defineProperties` with either, and changing the
  prototype of a store. Under (a) the first two work correctly on both
  layers, so (b) refuses something that would otherwise be right.
- **(c):** also `Object.freeze(store)`, `Object.freeze(store.part)`,
  `Object.seal` and `Object.preventExtensions` through a store. The
  replacement is to assign a frozen value. (c) does not remove the read-only
  case from `linkChild`: a frozen root passed to `createClassyStore()` and an
  object frozen behind the store still need it.

### Recommendation

**Do (a). Before 1.0.** The tutorial says today that "using
`Object.defineProperty` to change state bypasses assignment/deletion
tracking". (a) removes that documented limit, and a definition that changes a
value now notifies, so it belongs before the freeze of the API. It fixes
findings 1, 45, 61, 66, 67 and 71 for 49 bytes, every failing test is a
pinned defect, and nothing is taken away. It is also what the base class of
API question 4 needs (M12 in `merged.md`).

**Do not do (b) or (c) as measured.** They cost 160 and 214 bytes more, most
of it the text of three error messages, and both are over the size budget on
their own. (b) refuses accessor definitions that (a) makes work. (c) gives up
a feature the library added on purpose and removes no code path, since the
read-only case stays in `linkChild`.

One part of (b) can be taken alone if the owner wants findings 47 and 48
closed with an error: the `setPrototypeOf` trap. It is five lines and would
flip the seven prototype tests. That is **Before 1.0**, because it turns
something that works today into a throw. I did not measure it on its own.

### Cost for stage 4

`core.ts`, about 30 lines in one trap. 17 tests to rewrite, plus the one that
passes for a new reason, and new tests for each row of the table above. The
architecture page describes the trap as "forward, then detach if read-only"
and needs the new description. Medium risk: `Object.freeze(store)` goes
through the trap once per key. Size +49 bytes on the main entry.

## T4. `has` and `ownKeys` traps

- **Question.** Can a getter that asks `'b' in this` or `Object.keys(this)`
  be kept current, on the store and on a snapshot, and can a getter that reads
  a missing property be memoized? Stage 1 findings 30, 31, 32 and 41 (29 is
  T5); Vue 1, Solid 6, Svelte 4, MobX 10; M3, M23 and M34 in `merged.md`.
- **What was changed.** Three patches, each against the unmodified commit:
  - **The live store** (55 lines added, 7 removed: `core.ts`,
    `core.types.ts`, `ownership.ts`). A `has` trap records the key and whether
    it was present. An `ownKeys` trap records a counter on the node,
    `keysVersion`, which the `set`, `deleteProperty` and `defineProperty`
    traps move when an own key is added or removed and a write to `length`
    moves when it shortens a list. A read of a property records whether the
    property was there, so a missing one is an ordinary dependency. Both
    traps forward and record nothing when no getter of that node is running.
  - **Snapshot variant S1** (90 added, 13 removed in total; adds
    `snapshot.ts`). The Vue sketch: the frozen snapshot becomes the target of
    the tracker a snapshot getter runs against, with `has` and `ownKeys` traps
    that record what they answered.
  - **Snapshot variant S2** (117 added, 11 removed in total). The tracker
    keeps its empty target and gets `has`, `ownKeys`,
    `getOwnPropertyDescriptor`, `getPrototypeOf` and `set` traps. `ownKeys`
    and the descriptor trap leave out the getters the class contributed, so
    `this` lists the keys the store lists.
  - Both snapshot variants also make a getter that returns `this` return the
    snapshot, not the tracker (finding 41).
  - The live patch touches `recordDep` and `areDepsValid`, which the getter
    spike owns: one field on the value record, and two new kinds of record.
    Stage 4 has to merge the two by hand. `spike-getters.md` recommends one
    kind of dependency (its G3c), which already contains the fix for a
    missing property and removes `activeTracker` and the `kind` field. On top
    of G3c the `present` field here is not needed, and the two new records
    have to be said in G3c's single shape, for example as a read of the key
    with a "presence only" flag and a read of a reserved key whose value is
    the key counter. I did not try that.
  - The same report recommends that a snapshot getter that writes to `this`
    throws (its G7a). S2's one-line `set` trap, which keeps the write silent,
    is then left out.

### Reproductions

`repro/t4.ts`. A class with `a = 1; b = 2` and getters for
`Object.keys(this).length`, `'b' in this`, `this instanceof Dict`, and more.

| Step                                                | Store today       | Store, spike                | Snapshot today     | Snapshot, S1                 | Snapshot, S2       |
| --------------------------------------------------- | ----------------- | --------------------------- | ------------------ | ---------------------------- | ------------------ |
| Start: key count, `'b' in`                          | 2, `true`         | 2, `true`                   | 0, `false`         | 8, `true`                    | 2, `true`          |
| After `store.a = 10`                                | 2, `true`         | 2, `true`, no getter re-ran | 0, `false`         | 8, `true`                    | 2, `true`          |
| After `delete store.b`                              | 2, `true` (stale) | 1, `false`                  | 0, `false`         | 7, `false`                   | 1, `false`         |
| After adding `c` and `b`                            | 2, `true` (stale) | 3, `true`                   | 0, `false`         | 9, `true`                    | 3, `true`          |
| `this instanceof Dict`                              | `true`            | `true`                      | `false`            | `true`                       | `true`             |
| A getter that returns `this`                        | The store         | The store                   | The tracker        | The snapshot                 | The snapshot       |
| `Object.entries(this).length`                       | 2                 | 2                           | 0                  | `RangeError`, stack overflow | 2                  |
| `Reflect.ownKeys(this).length`                      | 2                 | 2                           | 0                  | 7                            | 2                  |
| `for...in` count, spread keys                       | 2, `a,b`          | 2, `a,b`                    | 0, none            | 7, `RangeError`              | 2, `a,b`           |
| `Object.getOwnPropertyDescriptor(this, 'a')?.value` | 1                 | 1                           | `undefined`        | 1                            | 1                  |
| An object-literal getter that counts its keys       | 2                 | 2                           | 0                  | 2                            | 2                  |
| A getter that writes a field                        | Writes, notifies  | The same                    | Dropped in silence | `TypeError`                  | Dropped in silence |

Finding 32, a getter that builds an object from a missing property: two reads
gave two objects and two runs before, and one object and one run after. It
re-runs once when the property is added and once when it is deleted, and not
after an unrelated write. `Object.keys(this.list).length` was already right
before, through the list's version, and still is.

**What S1 and S2 show about API question 3.** Under today's enumerable own
accessors, S1 counts the getters as keys (8 where the store says 2) and a
getter that calls `Object.entries(this)` or spreads `this` reads itself until
the stack overflows. S2 gives the store's answers in every row, because it
hides the class getters and can do that only with an empty target: a Proxy may
not hide or alter a property of a frozen target. What the traps need from the
decision:

- **If class getters stay enumerable own accessors:** S2 is the only one that
  works. It costs 172 bytes on top of the live part and leans on the
  `originalAccessors` map to tell a class getter from an object-literal one.
- **If they become own and not enumerable:** S1 is enough. I tried it by
  changing one line of `installMemoizedGetters`: key count, entries, `for...in`
  and spread then match the store. `Reflect.ownKeys(this)` still lists the
  getters (7 against 2).
- **If they move to a derived prototype:** S1 matches the store in every row
  with no filtering. Not run; it follows from the snapshot then having only
  data keys of its own.
- **Under S1 a getter that writes throws a `TypeError` on a snapshot**, and
  cannot be made silent: a Proxy over a frozen target may not pretend a write
  succeeded. That decides part of M26 as a side effect. S2 keeps the silent
  drop with a one-line `set` trap; without that line it throws too.

**A gap that stays under every variant.** `Object.hasOwn(this, 'b')` and a
descriptor read inside a getter record nothing, on the store and on a
snapshot. After `delete store.b` such a getter still says `true` on both
layers. Closing it needs a `getOwnPropertyDescriptor` trap on the store that
records the key-set counter. Not spiked. The Svelte report warns against
recording the value there, because `Object.keys` asks for every descriptor.

### Result

| Measure             | Live store only                | Live and S1                    | Live and S2                    |
| ------------------- | ------------------------------ | ------------------------------ | ------------------------------ |
| Tests               | 1,332 pass, 9 fail             | 1,327 pass, 14 fail            | 1,328 pass, 13 fail            |
| Typecheck           | Passes                         | Passes                         | Passes                         |
| Main entry, gzipped | 3,817 bytes, +156, over budget | 3,903 bytes, +242, over budget | 3,989 bytes, +328, over budget |

Timings for the live part. Bun: `store.write` 161 ns against 162;
`store.write.same` 34.4 (34.2 to 34.4) against 34.6 (34.6 to 35.1), which is
0.2 ns slower; `getter.cached` 58.9 against 58.1; `getter.recompute` 289
against 286; `store.read` 33.8 against 33.5; `array.pushPop` 1,744 against
1,738. Node: `store.write` 216 against 218; `store.write.nested` 512 (509 to
514) against 519 (519 to 535), 1.4% slower; `getter.recompute` 396 (396 to
397) against 402 (400 to 409), 1.5% slower; `getter.cached` 85.5 against
86.1; `store.read` 47.5 against 47.8. Everything else is inside the spread.
The core benchmark has no metric for a snapshot getter, so S1 and S2 were not
timed.

**Live store: 9 failing tests, all fixes.**

- `core.characterisation.getters.test.ts`, "a getter whose result depends on
  which keys the store has": "keeps the first result of Object.keys(this),
  `in` and for...in after a key is added", the same "after a key is deleted",
  and "re-runs Object.entries(this) after a listed key is deleted, but not
  after a key is added" (finding 30).
- The same file, "a getter that reads a property the store does not have":
  "runs on every read while the property is missing", "runs on every read
  again after the property is deleted", "returns a new object on every read
  when it builds one" (finding 32).
- `core.fuzz.findings.test.ts`, "getters": "a live getter that reads a missing
  property is recomputed on every read" and "a live getter that asks for the
  keys of `this` is stale after a delete".
- `core.fuzz.test.ts`, the randomized run. With its switch
  `A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE` set to `false` it passes
  on the spike.

**S2: 4 more, all fixes** (findings 31 and 41):

- `core.characterisation.getters.test.ts`, "a getter that asks for the shape
  of `this` on a snapshot": "sees no own keys: Object.keys(this), `in`,
  for...in, spread and JSON.stringify come back empty", "is not an instance of
  its class inside the getter, though the snapshot is", "returns the store
  from a getter that returns `this`, but not the snapshot".
- `core.fuzz.findings.test.ts`: "a snapshot getter that asks for the keys of
  `this` sees no keys".

**S1: the same four flip, and one more.** Under today's getters the four flip
to another wrong answer, not to a right one. The fifth is **incidental**:
"a getter that writes to the store while it runs > drops the write on a
snapshot: no error, no notification, snapshot and store unchanged". It now
gets a `TypeError`.

### What it breaks or changes for a user

- A getter that lists or tests the keys of `this` is now current. No code
  that was right before changes its answer.
- The reference says today: "A live getter that reads an absent field
  recomputes on subsequent reads". After the spike it is memoized like any
  other. That sentence has to go, which makes this part a change to
  documented behaviour.
- Inside a snapshot getter, `this` has the store's keys and prototype where
  it had none. A getter that relied on `Object.keys(this)` being empty on a
  snapshot would change; no test or doc does.

### Recommendation

- **Do the live part. Before 1.0**, because of the sentence in the reference
  about an absent field. Without that sentence it could follow 1.0.
- **Decide the snapshot part together with API question 3**, as M33 and M34
  in `merged.md` already say. If the getters leave the enumerable own keys of
  a snapshot, take S1. If they stay, take S2. Do not take S1 with today's
  getters: it replaces a wrong answer with a stack overflow.
- The combination below uses S2, because it is the one that is right on
  today's code.

### Cost for stage 4

Three files for the live part, about 55 lines, and `snapshot.ts` for the
other. Nine tests to rewrite for the live part and four for the snapshot
part, two fuzz switches to remove, and new tests for `length`, for a key
defined with `Object.defineProperty`, and for `Object.hasOwn` as a documented
gap. Medium risk: the dependency records are shared with the getter spike.
**Size:** +156 bytes for the live part and +86 or +172 for the snapshot part.
The main entry has 89 bytes free today, so this needs a new budget on its
own.

## T5. A delete that removes nothing is not a change

- **Question.** Can `delete store.dict.missing` stop counting as a write?
  Stage 1 finding 29; Vue 5, Svelte 5, Immer 5.
- **What was changed.** `core.ts`, `deleteProperty` trap: 2 lines added. The
  trap returns `true` before it does anything when the key is not an own key.
- **Result.**
  - Reproduction (`repro/t5.ts`): deleting a missing key, an index past the
    end, or an inherited name gave 1 synchronous call and a new snapshot
    before; 0 calls and the same snapshot after. Deleting a present key still
    gives 1 call.
  - Tests: 1,334 pass, 7 fail. All seven are **fixes**:
    - `core.fuzz.findings.test.ts`, "a delete that removes nothing counts as a
      write": 3 tests (a missing key; an index past the end; `sort` and
      `copyWithin` over holes).
    - `core.characterisation.invariants.test.ts`, "delete on a store": 2 tests
      ("deleting a key the store never had returns true, notifies, and
      replaces the snapshot with an equal one"; "so does deleting an index
      past the end of an array, or a name the store only inherits").
    - `core.characterisation.getters.test.ts`, "a getter that reads one field
      of a nested object > is re-run when a key the object never had is
      deleted".
    - `core.fuzz.test.ts`, the randomized run. It has a switch for this
      finding, `DELETING_NOTHING_IS_A_WRITE`. With the switch set to `false`
      the run passes on the spike.
  - Typecheck passes. Size: main entry 3,672 bytes, +11.
  - Timing: `array.pushPop` is the one metric that deletes. Bun 1,673 ns
    baseline against 1,703 ns; Node 3,770 against 3,621. Both inside the
    spread.
- **What it changes for a user.** A no-op delete no longer notifies or
  replaces the snapshot. Code that used one to force a notification stops
  working; nothing in the docs suggests that use.
- **Recommendation: do it.** **Can follow 1.0**: the docs do not promise a
  notification for a delete that removes nothing. Doing it before 1.0 costs
  nothing extra.
- **Cost for stage 4.** One file, 2 lines. Seven tests to rewrite to the new
  behaviour, and the fuzz switch to remove. Low risk. Size +11 bytes.

## T6. Two small guards

### A plain object from another realm

- **Question.** Can an object made in an iframe or a Node `vm` context be
  state like any other plain object? Immer 6; stage 2 defect 4; M13 in
  `merged.md`.
- **What was changed.** `utils/internal/internal.ts`, 24 lines added, 1
  removed. `isPlainObject` also accepts a prototype that ends its chain and
  whose own `constructor` prints as this realm's `Object` does. The answer is
  kept per prototype in a `WeakMap`. Only an object whose prototype is not
  this realm's `Object.prototype` reaches the new check.
- **Result.**
  - Reproduction (`repro/t6.ts`, with `vm.runInNewContext`): a write to the
    foreign object and to a row of a list inside it gave 0 synchronous calls
    before and 1 after; its snapshot and the snapshot of an object inside it
    were not frozen before and are after. A foreign class instance, a foreign
    `Date` and a foreign `Map` stay opaque. A null-prototype object is
    proxied as before.
  - Tests: 1,341 pass, 0 fail. No test covers another realm.
  - Typecheck passes. Size: main entry 3,742 bytes, +81. `./utils` grows by
    the same amount, because `canProxy` is shared.
- **What it changes for a user.** A foreign plain object becomes reactive and
  its snapshot is frozen. `persist` and `withHistory` use `canProxy` too, so
  they now copy such an object where they kept it by reference.
- **Recommendation: do it. Can follow 1.0.** The failure today is silent, the
  docs promise deep reactivity for "nested plain objects", and nothing pinned
  changes. 81 bytes is a lot for the case; a version without the cache would
  be smaller and was not measured.
- **Cost for stage 4.** One file, about 25 lines, and new tests that build
  their object with `node:vm`. Low risk. Size +81 bytes.

### A property made read-only behind the store

- **Question.** Can a read stop throwing after the raw object was frozen
  behind the store's back? Stage 1 finding 46; Svelte 7; M7 (b) in
  `merged.md`.
- **What was changed.** `core.ts`, the `get` trap, 9 lines added, 2 removed.
  When a child proxy is indexed for a property and that property is now
  non-writable and non-configurable, the trap detaches the child and returns
  the raw value, which is what the engine requires. It uses the descriptor
  `get` already looked up.
- **Result.**
  - Reproduction: after `Object.freeze(raw.config)`, after freezing the raw
    root, and after a read-only definition on the raw object, a read threw a
    `TypeError` before and returns the value after. A write below such a
    value then notifies no one, as for any frozen value.
  - Tests: 1,339 pass, 2 fail, both **fixes**, both in
    `core.characterisation.invariants.test.ts` under "frozen objects: what
    core.frozenValues.test.ts leaves out": "a nested object throws a TypeError
    when read, once its raw parent was frozen behind the store" and "a store
    whose raw root was frozen behind it throws a TypeError when spread or
    passed to JSON.stringify".
  - Typecheck passes. Size: main entry 3,674 bytes, +13.
  - Timings, both guards together. A read of a field: Bun 33.0 ns against
    33.3, Node 47.7 against 47.8, inside the spread. A read three objects
    deep: Bun 111 (111 to 114) against 115 (115 to 116), Node 141 (141 to
    141) against 147 (147 to 150). That is 4% slower, about 2 to 3 ns for
    each read that returns a child, and it comes from the read-only guard:
    the realm guard is not on the path of a read. `create.small`,
    `create.rows` and `snapshot.first` are inside the spread on both
    engines.
- **What it changes for a user.** A read that threw now returns the frozen
  value. Nothing else.

**Contradiction 15 in `merged.md`: is the guard free once the descriptor
lookup is gone?** No. I applied the descriptor cache of the Solid report (M9)
by hand, 37 lines, and timed four builds back to back. The cache passes all
1,341 tests and adds 119 bytes. Median nanoseconds of three runs:

| Build                                                     | `store.read`, Bun | Three objects deep, Bun | `store.read`, Node | Three objects deep, Node |
| --------------------------------------------------------- | ----------------: | ----------------------: | -----------------: | -----------------------: |
| Unmodified                                                |              32.8 |                     111 |               47.8 |                      142 |
| Descriptor cache                                          |              12.8 |                    49.5 |               37.4 |                      117 |
| Cache, and the guard with its own descriptor lookup       |              13.3 |                    97.1 |               38.4 |                      154 |
| Cache, and the guard behind an `Object.isExtensible` test |              12.9 |                    58.9 |               37.8 |                      139 |

- Without the cache the guard is cheap, not free: 4 ns on Bun and 6 on Node
  for a read three objects deep (the timings above). The descriptor is in
  hand, and the guard reads two of its fields for each child it returns.
- With the cache, the guard has to fetch the own descriptor for every read
  that returns a child. That takes back most of the cache's gain on a nested
  read on Bun (49.5 to 97.1 ns) and makes Node slower than today (154 against
  142).
- Asking `Object.isExtensible` first, and fetching the descriptor only when
  the object is closed, keeps most of the gain on Bun (58.9) and little of it
  on Node (139). It covers `Object.freeze` and `Object.seal` behind the
  store, which are the two pinned tests, and not a single property made
  read-only on an object that stays extensible: that read still throws.

- **Recommendation.** Take the guard if M9 is not taken: 13 bytes, and 4% on
  a nested read, for a read that otherwise throws. If M9 is taken, choose
  between the `isExtensible` form, which costs a read three objects deep 9 ns
  on Bun and 22 on Node, and documenting that the raw object must not be
  frozen once a store holds it (M7 (c)). **Can follow 1.0** either way.
- **Cost for stage 4.** `core.ts`, 9 lines, two tests to rewrite. Low risk on
  today's code. It has to be redone if M9 lands.

## The combination

- **What is in it.** T1 strict, T2 with both parts, T3 (a), T4 with the live
  store and snapshot variant S2, T5, and both guards of T6. One patch,
  `combination.patch` in appendix B: five files, 243 lines added, 48 removed.
- **Why these.** Each is the variant recommended above. S2 is in it because
  it is the snapshot variant that is right with today's getters; it is the
  first part to swap out when API question 3 is decided.

### Result

- **Tests: 1,288 pass, 53 fail.** The 53 are exactly the union of the tests
  the six spikes fail alone: none is new and none passes again. By class:
  52 **fixes** and 1 **incidental**, the object-literal method of T1. The
  list is in appendix C.
- **The randomized test** passes with both of its finding switches turned
  off (`DELETING_NOTHING_IS_A_WRITE` and
  `A_MISSING_PROPERTY_DEFEATS_THE_LIVE_GETTER_CACHE`), at the default 60 seeds
  of 300 steps and at 400 seeds.
- **Typecheck** passes.
- **Reproductions.** Every reproduction of T1 to T6 gives the same output on
  the combination as on its spike alone, with one expected difference: the
  arrow method of the base class gives two synchronous notifications, not
  one, because of T1. `repro/combination.ts` adds the cases that need two
  spikes together, before and after:
  - A function read from a list is found in it: `indexOf(callbacks[1])` was
    -1 and is 1.
  - A definition with a proxy as its value stores the raw object.
  - A getter over `Object.keys(this)` follows a key that was defined, and a
    key made non-enumerable, on the store and on a snapshot. The second case
    found a mistake in my first S2: its key record did not include
    enumerability. The patch in the appendix has the fix.
  - A delete of a missing key does not re-run a getter over the keys; a
    delete of a present key does.
  - A base class whose constructor returns the store: its first snapshot is
    frozen; a prototype method that calls an arrow method twice is one
    transaction.
  - An object frozen through the store and one frozen behind it both read
    back, and the snapshot holds both.
- **Size.** Only the main entry's budget fails, and it fails by 561 bytes.

  | Entry            | Today, gzipped | Combination | Adds to main: today, combination | Budget for what it adds |
  | ---------------- | -------------: | ----------: | -------------------------------- | ----------------------: |
  | `.`              |          3,661 |       4,311 |                                  |          3,750 in total |
  | `./utils`        |          6,347 |       6,993 | 2,686, 2,682                     |                   2,750 |
  | `./collections`  |          4,388 |       4,991 | 727, 680                         |                     750 |
  | `./react`        |          5,323 |       5,967 | 1,662, 1,656                     |                   1,700 |
  | `./react/server` |          3,814 |       4,460 | 153, 149                         |                     175 |
  | `./vue`          |          3,941 |       4,594 | 280, 283                         |                     300 |
  | `./svelte`       |          3,843 |       4,491 | 182, 180                         |                     200 |
  | `./angular`      |          3,932 |       4,589 | 271, 278                         |                     300 |
  | `./solid`        |          3,973 |       4,623 | 312, 312                         |                     335 |

  The main entry grows by 650 bytes, 18%. Measured alone, the parts add: T1
  0, T2 136 (36 for the first part, 100 for the searches), T3 (a) 49, T4 328 (156 for the live store and 172 for snapshot variant S2),
  T5 11, T6 93 (81 for the realm guard, 13 for the read-only guard). The main
  entry has 89 bytes free today. If all of this is approved, the budget in
  `CONSTRAINTS.md` has to move to about 4,400, which is the measured size
  plus the 2% headroom stage 1 used. The owner decides that number; no
  subset that includes T2's searches or T4 fits in today's budget.
- **Timings.** Run by the orchestrating agent on 2026-11-25, in a worktree at
  `57404c3` with the combination patch, between two runs of the unmodified
  source, `bun run benchmark:core` and `benchmark:core:node`, five runs each.
  Other agents were using the machine: the second unmodified run came out 3
  to 7% slower than the first on most rows, so only a difference larger than
  that, with ranges that do not touch, is reported.

  | Ratio (limit)             | Node, unmodified twice | Node, combination | Bun, unmodified twice | Bun, combination |
  | ------------------------- | ---------------------- | ----------------- | --------------------- | ---------------- |
  | read (2.5, 20)            | 2.03, 2.09             | 2.07              | 15.7, 15.4            | 15.1             |
  | write (1.7, 3.2)          | 1.32, 1.37             | 1.30              | 2.57, 2.63            | 2.58             |
  | cached getter (5.3, 41)   | 3.57, 3.57             | 3.76              | 28.0, 30.7            | 30.3             |
  | cached snapshot (1.8, 10) | 1.40, 1.36             | 1.42              | 7.36, 7.30            | 7.28             |

  All four ratios stay inside their limits on both engines, and no read or
  write row moves outside the drift. One thing does: **creating a store is
  slower on Bun.** `create.small` is 1,685 nanoseconds against 1,444 and
  1,511, and `create.rows` is 661 microseconds (634 to 685) against 563 (558
  to 567) and 597 (572 to 613). That is 11 to 18%, and the ranges do not
  touch. On Node `create.rows` is 1.45 milliseconds against 1.22 and 1.12,
  but its ranges overlap. Raw values on write alone (`t2a-raw-only.patch`,
  timed in the same queue) does not show it: `create.rows` is inside the
  drift on Bun and 10% lower on Node, as the second unmodified run is. So the
  cost comes from another part of the combination, and the earlier single
  run that blamed raw values on write is not confirmed. Creation has no limit
  in `CONSTRAINTS.md`. Stage 4 times creation as each trap change lands.

### What it breaks or changes for a user

The sum of the entries above, in one list:

- A function in a field or a list, a class held as a value and `constructor`
  come back as themselves. An object-literal method is no longer a
  transaction and cannot be called detached.
- `list.includes(raw)` and `indexOf(raw)` find a row. The raw object behind a
  store holds raw objects after a write. A store placed in another store by
  its raw object is connected.
- `Object.defineProperty` through a store is a write and notifies.
- A getter that tests or lists the keys of `this`, or reads a missing
  property, is current and memoized on both layers.
- A delete that removes nothing does not notify.
- A plain object from another realm is state. A read of a value frozen
  behind the store returns it.

### Which spikes conflict, and which depend on each other

Conflicts, meaning two spikes edit the same lines and the second has to be
written on top of the first:

- **T1 and the searches of T2** both rewrite the function branch of the `get`
  trap. In the combination the three searches are cached per method like any
  other wrapper, so `list.includes === list.includes`.
- **T1 and T3.** T1 keys the wrapper cache by function, so the three
  `boundMethods.delete(prop)` calls go, including the one T3 (a) would add.
- **T2 and T3.** Once a write stores the raw object, a definition has to as
  well. The combination unwraps `descriptor.value` in the trap. Without that
  line a definition puts the proxy back into the raw object.
- **T3 and T4.** A definition adds a key, and can change whether a key is
  enumerable. The trap moves the key counter in both cases. T4 alone moves it
  for a new key only.
- **T4 and T5** both edit `deleteProperty`. With T5 first, T4's bookkeeping
  there is one line.
- **T4 and the getter spike** both edit `recordDep`, `areDepsValid` and
  `DepEntry`. See T4.
- **T6's read-only guard and the descriptor cache (M9).** See T6.

Dependencies:

- **The base class of API question 4 (M12) needs T3 (a)**, and is affected by
  T1: under strict its arrow methods are not transactions.
- **The snapshot half of T4 needs the decision on API question 3 (M33).**
- **M59** (`withHistory` and a function in a field) should be decided after
  T1, because strict makes such a function plain data.
- **T2's searches do not need T2's first part.** They compare identities, so
  they work on a raw list that still holds proxies.
- T5 and T6's realm guard depend on nothing.

Nothing here excludes anything else: all six were applied together.

### The order for stage 4

1. **T5.** Two lines, seven tests. It removes one switch from the fuzz test.
2. **T3 (a).** One trap. It removes the hang, and the base class spike needs
   it. If the ownership change (M14) lands first, the resume line stays and
   is harmless.
3. **T2, first part.** Then add the one-line unwrap to T3's trap.
4. **T1, strict.** It rewrites the function branch once.
5. **T2, the searches**, on top of T1's branch, written as one loop.
6. **T4, the live store**, after T5 and T3 because it touches their traps,
   and after the getter rewrite if that is approved, because it adds to the
   dependency record.
7. **T4, the snapshot half**, after API question 3.
8. **T6.** The realm guard at any time. The read-only guard after the
   decision on M9.

Each step is one commit with its own tests, and each needs the size budget
settled first: the main entry has 89 bytes free and the combination needs
more than that many times over.

## Verified and not verified

**Run, with the result in this report:**

- The unmodified worktree: tests, typecheck, size, and the core benchmark on
  Bun and on Node with five runs each.
- For T1 strict, T1 lenient, T2 (both parts and the first part alone), T3
  (a), (b) and (c), T4 (the live store, with S1, with S2), T5, T6 (each guard
  and both) and the combination: `bun run test`, `bun run size`,
  `bun run --filter @codebelt/classy-store typecheck`, and the reproduction
  before and after.
- Back-to-back timings on both engines for T1 strict, T1 lenient, T2, T3 (a),
  T4's live part, T5, T6 and the combination, for the metrics that go
  through the changed code; every metric for the combination.
- The randomized test with its switch for finding 29 off (T5), with its
  switch for finding 32 off (T4), and with both off on the combination, at 60
  and at 400 seeds.
- The hang of finding 66: on the unmodified source, on each T3 variant, and
  on (a) and (c) with the resume line deleted.
- T3 (a) with one more line that clears the getter cache; T1 strict without
  the `new.target` branch; S1 with class getters made non-enumerable (the
  reproduction only).
- The descriptor cache of the Solid report, applied by hand: tests, size, and
  timings alone and with two forms of the read-only guard.
- Every patch in appendix B was extracted from this file and applied to the
  unmodified commit with `git apply --check`.

**Read or reasoned, not run:**

- Each failing test was classed from its name, from the `FINDING` comment
  above it where there is one, and for the ones quoted in the text from its
  body. I did not rewrite any test to the new behaviour, apart from flipping
  the two switches of the randomized test.
- The MobX form of T1 (keep wrapping, one wrapper per function).
- S1 on a snapshot whose getters live on a derived prototype.
- That the `setPrototypeOf` trap alone flips exactly the seven prototype
  tests. It was measured only as part of (b).
- How T4's records fit the single kind of dependency of the getter spike.

**Not run at all:**

- The browser, framework, React compatibility, Next.js, memory and mutation
  suites, `bun run test:coverage`, `bun run lint` on the spike code, and
  `bun run check:floor`. The brief excludes the first group. Spike code was
  not written to pass lint or coverage.
- `benchmark:react` and the React memory harness.
- The official commands `bun run benchmark:core` and
  `bun run benchmark:core:node` on a spike. The comparisons ran the same
  script directly on a saved copy of each build, so that both builds ran in
  one session; the commands themselves were run on the unmodified worktree
  only.
- No timing of T3 (b) and (c), of S1 and S2, or of a snapshot getter in
  general: the core benchmark has no metric for one.

**Limits of the timings.** Three runs per build, five for the combination,
on a machine that other agents were using. A difference of a few percent
between two ranges that do not touch is reported as such and should be
checked on a quiet machine before a limit in `CONSTRAINTS.md` is moved.

## Not done

For a later agent that starts with an empty scratch folder. Appendix A says
how to rebuild a spike from this file.

1. **T1, the MobX form.** Keep wrapping every function, cache one wrapper per
   function, leave `constructor` alone, treat a frozen function as a value.
   Run the suite and `repro/t1.ts`. Expected by reading: `indexOf(first)`
   stays -1 without T2's searches.
2. **T1 lenient, completed.** Store the original function when a read wrapper
   is written back, so that `store.cb = store.cb` is no change. Only needed
   if the owner prefers lenient.
3. **A store made from a function (stage 1 finding 62).** Decide whether
   `createClassyStore(fn)` is allowed. Not spiked.
4. **T2's searches as one loop**, without mapping the list, and with
   `createNode` told that the lookup already missed. Then time store
   creation on Node again on a quiet machine.
5. **`reactiveSet([raw, proxy])` (stage 1 finding 34).** The collection
   constructor, outside the traps.
6. **The `setPrototypeOf` trap alone** (stage 1 findings 47 and 48): tests
   and bytes.
7. **A `getOwnPropertyDescriptor` trap** on the store and on the snapshot
   tracker that records the key counter, so that `Object.hasOwn(this, key)`
   in a getter is tracked. Check that `Object.keys` does not then re-run on a
   value change.
8. **T4's snapshot half on the form API question 3 chooses.** S1 if the
   getters leave the enumerable own keys, S2 if they stay.
9. **T4 on top of the getter spike's combination**, with the two new records
   in its single shape.
10. **The realm guard without its cache**, to see how many of the 81 bytes
    are the cache.
11. **The combination on top of the other stage 3 spikes** (ownership,
    getters, delivery, the descriptor cache). Each was measured against the
    unmodified commit only.
12. **The suites the brief excludes**, on whatever is approved.

## Appendix A: how to run a spike again

Nothing below depends on the scratch folder still being there.

1. Make a throwaway worktree of `release/1.0` at `57404c3` and run
   `bun install --frozen-lockfile` in it.
2. Save a patch from appendix B to a file and run `git apply <file>` at the
   worktree root. Each patch is against the unmodified commit. Only
   `combination.patch` holds several spikes at once.
3. Run `bun run test`, then `bun run size`, then
   `bun run --filter @codebelt/classy-store typecheck` (the typecheck needs the
   build that `size` makes).
4. For a reproduction, save `lib.ts` and the script from appendix D next to
   each other, set the two paths at the top of `lib.ts`, and run
   `bun <script> before` and `bun <script> after`. `before` imports the
   unmodified source, `after` the worktree.
5. The back-to-back timings were made by copying `dist/` and
   `tests/benchmark/` of each build into a folder of its own inside the
   worktree's package and running
   `bun <copy>/tests/benchmark/runCoreBenchmark.mjs --runs 3 --only <metric>`
   and the same with `node`, first on the baseline copy and then on the spike.

## Appendix B: patches

### `t1-strict.patch`

T1, strict: only a function on the prototype chain is a method.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..e35a756 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -396,11 +396,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const existing = targetNodes.get(target) ?? internalsMap.get(target);
   if (existing) return existing;
 
-  /** Cache for bound methods so we return the same reference each time. */
-  const boundMethods = new Map<
-    string | symbol,
-    (...args: unknown[]) => unknown
-  >();
+  /** One wrapper per method, so every read returns the same reference. */
+  const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
@@ -451,9 +448,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         }
       }
 
-      // Drop any cached bound method — the previous binding is dead now.
-      boundMethods.delete(prop);
-
       notifyMutation(internal);
       return written;
     },
@@ -479,15 +473,20 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const value = Reflect.get(_target, prop);
 
       // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
-      // and run each call as one transaction.
-      if (typeof value === 'function') {
+      // and run each call as one transaction. A method is a function found on
+      // the prototype chain. A function the object holds itself is data, and
+      // so is `constructor`: both are returned as they are.
+      if (
+        typeof value === 'function' &&
+        prop !== 'constructor' &&
+        !Object.hasOwn(_target, prop)
+      ) {
         const method = value as (...args: unknown[]) => unknown;
-        // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
-        const cached = boundMethods.get(prop);
-        if (cached) return cached;
-        const bound = transactional(method, receiver);
-        boundMethods.set(prop, bound);
+        let bound = boundMethods.get(method);
+        if (!bound) {
+          bound = transactional(method, receiver);
+          boundMethods.set(method, bound);
+        }
         return bound;
       }
 
@@ -517,7 +516,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
-        boundMethods.delete(prop);
         notifyMutation(internal);
       }
       return deleted;
```

### `t1-lenient.patch`

T1, lenient: every function is a method except an array element, `constructor` and a class.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..1d521c9 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -396,11 +396,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const existing = targetNodes.get(target) ?? internalsMap.get(target);
   if (existing) return existing;
 
-  /** Cache for bound methods so we return the same reference each time. */
-  const boundMethods = new Map<
-    string | symbol,
-    (...args: unknown[]) => unknown
-  >();
+  /** One wrapper per method, so every read returns the same reference. */
+  const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
@@ -451,9 +448,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         }
       }
 
-      // Drop any cached bound method — the previous binding is dead now.
-      boundMethods.delete(prop);
-
       notifyMutation(internal);
       return written;
     },
@@ -480,14 +474,18 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
       // and run each call as one transaction.
-      if (typeof value === 'function') {
+      if (
+        typeof value === 'function' &&
+        prop !== 'constructor' &&
+        !(Array.isArray(_target) && Object.hasOwn(_target, prop)) &&
+        Object.getOwnPropertyDescriptor(value, 'prototype')?.writable !== false
+      ) {
         const method = value as (...args: unknown[]) => unknown;
-        // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
-        const cached = boundMethods.get(prop);
-        if (cached) return cached;
-        const bound = transactional(method, receiver);
-        boundMethods.set(prop, bound);
+        let bound = boundMethods.get(method);
+        if (!bound) {
+          bound = transactional(method, receiver);
+          boundMethods.set(method, bound);
+        }
         return bound;
       }
 
@@ -517,7 +515,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
-        boundMethods.delete(prop);
         notifyMutation(internal);
       }
       return deleted;
```

### `t2.patch`

T2, both parts: raw values on write, a node found by its raw object, searches by identity.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..d3912d3 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -361,11 +361,14 @@ function linkChild(
   if (typeof value !== 'object' || value === null) return;
   // A store embedded by its proxy is already the value the property holds, so
   // it stays a child wherever it sits, including in a frozen object.
-  const existing = internalsMap.get(value);
-  if (!existing) {
+  const viaProxy = internalsMap.get(value);
+  // One node per raw object: an object that is a store already is that store
+  // here too, whatever `canProxy` says about its class.
+  const existing = viaProxy ?? targetNodes.get(value);
+  if (!viaProxy) {
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
-    if (!canProxy(value) || isImmutableValue(value)) return;
+    if ((!existing && !canProxy(value)) || isImmutableValue(value)) return;
     if (
       isReadOnly(
         descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
@@ -378,6 +381,25 @@ function linkChild(
   return child;
 }
 
+/**
+ * `includes`, `indexOf` and `lastIndexOf` on a list find an object by its
+ * identity: the raw object, its store proxy and its snapshots are one value.
+ */
+function searchByIdentity(
+  method: (...args: unknown[]) => unknown,
+  target: unknown[],
+  args: unknown[],
+): unknown {
+  const wanted = args[0];
+  // A primitive is found by the native search on the raw list.
+  if (typeof wanted !== 'object' || wanted === null)
+    return Reflect.apply(method, target, args);
+  return Reflect.apply(method, target.map(identityOf), [
+    identityOf(wanted),
+    ...args.slice(1),
+  ]);
+}
+
 /** Native array length writes remove indices without invoking DELETE traps. */
 function detachTruncatedChildren(
   internal: StoreInternal,
@@ -405,8 +427,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
-      // Store the snapshot itself, never the render-tracking proxy around it.
-      const value: unknown =
+      // Hand on the snapshot itself, never the render-tracking proxy around it.
+      const given: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
           : incoming;
@@ -414,15 +436,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
         // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        return Reflect.set(_target, prop, given, receiver);
       }
+      // The raw graph holds raw objects: store what a store proxy wraps.
+      const value = unwrap(given);
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
       if (
         Object.hasOwn(_target, prop) &&
         (Object.is(oldValue, value) ||
-          (previousChild &&
-            (previousChild.proxy === value || previousChild.target === value)))
+          (previousChild && previousChild.target === value))
       )
         return true;
       const oldLength =
@@ -483,7 +506,12 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (typeof value === 'function') {
         const method = value as (...args: unknown[]) => unknown;
         // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
+        if (Array.isArray(_target)) {
+          if (prop === 'includes' || prop === 'indexOf' || prop === 'lastIndexOf')
+            return (...args: unknown[]) =>
+              searchByIdentity(method, _target, args);
+          return transactional(method, receiver);
+        }
         const cached = boundMethods.get(prop);
         if (cached) return cached;
         const bound = transactional(method, receiver);
```

### `t2a-raw-only.patch`

T2, first part only.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..55d5418 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -361,11 +361,14 @@ function linkChild(
   if (typeof value !== 'object' || value === null) return;
   // A store embedded by its proxy is already the value the property holds, so
   // it stays a child wherever it sits, including in a frozen object.
-  const existing = internalsMap.get(value);
-  if (!existing) {
+  const viaProxy = internalsMap.get(value);
+  // One node per raw object: an object that is a store already is that store
+  // here too, whatever `canProxy` says about its class.
+  const existing = viaProxy ?? targetNodes.get(value);
+  if (!viaProxy) {
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
-    if (!canProxy(value) || isImmutableValue(value)) return;
+    if ((!existing && !canProxy(value)) || isImmutableValue(value)) return;
     if (
       isReadOnly(
         descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
@@ -405,8 +408,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
-      // Store the snapshot itself, never the render-tracking proxy around it.
-      const value: unknown =
+      // Hand on the snapshot itself, never the render-tracking proxy around it.
+      const given: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
           : incoming;
@@ -414,15 +417,16 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
         // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        return Reflect.set(_target, prop, given, receiver);
       }
+      // The raw graph holds raw objects: store what a store proxy wraps.
+      const value = unwrap(given);
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
       if (
         Object.hasOwn(_target, prop) &&
         (Object.is(oldValue, value) ||
-          (previousChild &&
-            (previousChild.proxy === value || previousChild.target === value)))
+          (previousChild && previousChild.target === value))
       )
         return true;
       const oldLength =
```

### `t3a.patch`

T3 (a): a definition is a write.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..06a211f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -500,16 +500,35 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
-      const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+      internal.resumeScope();
+      const before = Object.getOwnPropertyDescriptor(_target, prop);
+      if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
+      const own = Object.getOwnPropertyDescriptor(_target, prop);
+      // The bookkeeping of a write: the property's value is its child, or it
+      // has none. `Object.freeze(proxy)` arrives here once per property, and
+      // `linkChild` leaves the value of a read-only property as it is.
+      if (
+        !own ||
+        !('value' in own) ||
+        !linkChild(internal, prop, own.value, undefined, own)
+      ) {
+        internal.detach(prop);
       }
-      return defined;
+      if (prop === 'length' && Array.isArray(_target))
+        detachTruncatedChildren(internal, _target.length);
+      boundMethods.delete(prop);
+      // Tell subscribers when a snapshot would show the difference. Freezing
+      // changes neither a value nor a key, so it stays silent.
+      if (
+        !before ||
+        !own ||
+        'value' in before !== 'value' in own ||
+        before.enumerable !== own.enumerable ||
+        before.get !== own.get ||
+        !Object.is(before.value, own.value)
+      )
+        notifyMutation(internal);
+      return true;
     },
 
     deleteProperty(_target, prop) {
```

### `t3b.patch`

T3 (b): (a), and refuse accessors, read-only values and prototype changes.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..c5c4131 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -500,16 +500,51 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
-      const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+      internal.resumeScope();
+      const before = Object.getOwnPropertyDescriptor(_target, prop);
+      // A definition is a write, or it changes attributes only, as
+      // `Object.freeze` and `Object.seal` do. Nothing else is accepted.
+      if ('get' in descriptor || 'set' in descriptor)
+        throw new Error(
+          `@codebelt/classy-store: cannot define the accessor "${String(prop)}" on a store. Define it on the class, or on the object before createClassyStore()`,
+        );
+      if ('value' in descriptor && !(descriptor.writable ?? before?.writable))
+        throw new Error(
+          `@codebelt/classy-store: cannot define "${String(prop)}" on a store as read-only. Pass writable: true, or assign a frozen value`,
+        );
+      if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
+      const own = Object.getOwnPropertyDescriptor(_target, prop);
+      // The bookkeeping of a write: the property's value is its child, or it
+      // has none. `Object.freeze(proxy)` arrives here once per property, and
+      // `linkChild` leaves the value of a read-only property as it is.
+      if (
+        !own ||
+        !('value' in own) ||
+        !linkChild(internal, prop, own.value, undefined, own)
+      ) {
+        internal.detach(prop);
       }
-      return defined;
+      if (prop === 'length' && Array.isArray(_target))
+        detachTruncatedChildren(internal, _target.length);
+      boundMethods.delete(prop);
+      // Tell subscribers when a snapshot would show the difference. Freezing
+      // changes neither a value nor a key, so it stays silent.
+      if (
+        !before ||
+        !own ||
+        'value' in before !== 'value' in own ||
+        before.enumerable !== own.enumerable ||
+        before.get !== own.get ||
+        !Object.is(before.value, own.value)
+      )
+        notifyMutation(internal);
+      return true;
+    },
+
+    setPrototypeOf() {
+      throw new Error(
+        '@codebelt/classy-store: the prototype of a store cannot be changed',
+      );
     },
 
     deleteProperty(_target, prop) {
```

### `t3c.patch`

T3 (c): (b), and refuse freezing.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..99c4a26 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -500,16 +500,61 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
-      const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+      internal.resumeScope();
+      const before = Object.getOwnPropertyDescriptor(_target, prop);
+      // A definition is a write, or it changes attributes only, as
+      // `Object.freeze` and `Object.seal` do. Nothing else is accepted.
+      if ('get' in descriptor || 'set' in descriptor)
+        throw new Error(
+          `@codebelt/classy-store: cannot define the accessor "${String(prop)}" on a store. Define it on the class, or on the object before createClassyStore()`,
+        );
+      if (
+        'value' in descriptor
+          ? !(descriptor.writable ?? before?.writable)
+          : descriptor.writable === false
+      )
+        throw new Error(
+          `@codebelt/classy-store: cannot define "${String(prop)}" on a store as read-only. Pass writable: true, or assign a frozen value`,
+        );
+      if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
+      const own = Object.getOwnPropertyDescriptor(_target, prop);
+      // The bookkeeping of a write: the property's value is its child, or it
+      // has none. `Object.freeze(proxy)` arrives here once per property, and
+      // `linkChild` leaves the value of a read-only property as it is.
+      if (
+        !own ||
+        !('value' in own) ||
+        !linkChild(internal, prop, own.value, undefined, own)
+      ) {
+        internal.detach(prop);
       }
-      return defined;
+      if (prop === 'length' && Array.isArray(_target))
+        detachTruncatedChildren(internal, _target.length);
+      boundMethods.delete(prop);
+      // Tell subscribers when a snapshot would show the difference. Freezing
+      // changes neither a value nor a key, so it stays silent.
+      if (
+        !before ||
+        !own ||
+        'value' in before !== 'value' in own ||
+        before.enumerable !== own.enumerable ||
+        before.get !== own.get ||
+        !Object.is(before.value, own.value)
+      )
+        notifyMutation(internal);
+      return true;
+    },
+
+    preventExtensions() {
+      throw new Error(
+        '@codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a frozen value instead',
+      );
+    },
+
+    setPrototypeOf() {
+      throw new Error(
+        '@codebelt/classy-store: the prototype of a store cannot be changed',
+      );
     },
 
     deleteProperty(_target, prop) {
```

### `t4-live.patch`

T4, the live store: `has` and `ownKeys` traps, the set of keys, a missing key.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a8c75bf 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -100,7 +100,14 @@ function recordDep(
       prop,
     });
   } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
+    tracker.deps.push({
+      kind: 'value',
+      target: internal.target,
+      prop,
+      value,
+      // Only `undefined` can be the value of a property that is not there.
+      present: value !== undefined || Reflect.has(internal.target, prop),
+    });
   }
 }
 
@@ -134,6 +141,10 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
         return false;
       if (dep.internal.version !== dep.version) return false;
+    } else if (dep.kind === 'has') {
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
+    } else if (dep.kind === 'keys') {
+      if (dep.internal.keysVersion !== dep.keysVersion) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
@@ -141,10 +152,9 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
+      // A property that appeared or went away is a change, even when its
+      // value reads `undefined` both times.
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -418,8 +428,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
+      const hadKey = Object.hasOwn(_target, prop);
       if (
-        Object.hasOwn(_target, prop) &&
+        hadKey &&
         (Object.is(oldValue, value) ||
           (previousChild &&
             (previousChild.proxy === value || previousChild.target === value)))
@@ -438,6 +449,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         detachTruncatedChildren(internal, (_target as unknown[]).length);
       }
       if (!written && !truncated) return false;
+      if (truncated || !hadKey) internal.keysVersion++;
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
@@ -500,7 +512,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
+      const hadKey = Object.hasOwn(_target, prop);
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && !hadKey) internal.keysVersion++;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -512,9 +526,30 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       return defined;
     },
 
+    has(_target, prop) {
+      const present = Reflect.has(_target, prop);
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({kind: 'has', target: _target, prop, present});
+      return present;
+    },
+
+    ownKeys(_target) {
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({
+          kind: 'keys',
+          internal,
+          keysVersion: internal.keysVersion,
+        });
+      return Reflect.ownKeys(_target);
+    },
+
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      const hadKey = Object.hasOwn(_target, prop);
       const deleted = Reflect.deleteProperty(_target, prop);
+      if (deleted && hadKey) internal.keysVersion++;
       if (deleted) {
         internal.detach(prop);
         boundMethods.delete(prop);
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..2192cdc 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -17,7 +17,18 @@ export type DepEntry =
       /** Property name on the parent. */
       prop: string | symbol;
     }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
+  | {
+      kind: 'value';
+      target: object;
+      prop: string | symbol;
+      value: unknown;
+      /** Whether the property existed: a missing one is a dependency too. */
+      present: boolean;
+    }
+  /** `prop in this`: valid while the property is present, or absent, as it was. */
+  | {kind: 'has'; target: object; prop: string | symbol; present: boolean}
+  /** `Object.keys(this)` and the like: valid while the node has the same own keys. */
+  | {kind: 'keys'; internal: StoreInternal; keysVersion: number}
   | {
       /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
       kind: 'computed';
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..8795f2c 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -5,6 +5,8 @@ type ParentReference = {deref(): StoreInternal | undefined};
 /** One canonical node per raw object. Each property owns one edge to a child. */
 export class StoreInternal {
   version = 0;
+  /** Moves when an own key is added or removed, not when a value changes. */
+  keysVersion = 0;
   isStoreRoot = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
```

### `t4-snapshot-target.patch`

T4, snapshot variant S1: the frozen snapshot is the tracker's target.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a8c75bf 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -100,7 +100,14 @@ function recordDep(
       prop,
     });
   } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
+    tracker.deps.push({
+      kind: 'value',
+      target: internal.target,
+      prop,
+      value,
+      // Only `undefined` can be the value of a property that is not there.
+      present: value !== undefined || Reflect.has(internal.target, prop),
+    });
   }
 }
 
@@ -134,6 +141,10 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
         return false;
       if (dep.internal.version !== dep.version) return false;
+    } else if (dep.kind === 'has') {
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
+    } else if (dep.kind === 'keys') {
+      if (dep.internal.keysVersion !== dep.keysVersion) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
@@ -141,10 +152,9 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
+      // A property that appeared or went away is a change, even when its
+      // value reads `undefined` both times.
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -418,8 +428,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
+      const hadKey = Object.hasOwn(_target, prop);
       if (
-        Object.hasOwn(_target, prop) &&
+        hadKey &&
         (Object.is(oldValue, value) ||
           (previousChild &&
             (previousChild.proxy === value || previousChild.target === value)))
@@ -438,6 +449,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         detachTruncatedChildren(internal, (_target as unknown[]).length);
       }
       if (!written && !truncated) return false;
+      if (truncated || !hadKey) internal.keysVersion++;
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
@@ -500,7 +512,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
+      const hadKey = Object.hasOwn(_target, prop);
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && !hadKey) internal.keysVersion++;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -512,9 +526,30 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       return defined;
     },
 
+    has(_target, prop) {
+      const present = Reflect.has(_target, prop);
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({kind: 'has', target: _target, prop, present});
+      return present;
+    },
+
+    ownKeys(_target) {
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({
+          kind: 'keys',
+          internal,
+          keysVersion: internal.keysVersion,
+        });
+      return Reflect.ownKeys(_target);
+    },
+
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      const hadKey = Object.hasOwn(_target, prop);
       const deleted = Reflect.deleteProperty(_target, prop);
+      if (deleted && hadKey) internal.keysVersion++;
       if (deleted) {
         internal.detach(prop);
         boundMethods.delete(prop);
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..2192cdc 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -17,7 +17,18 @@ export type DepEntry =
       /** Property name on the parent. */
       prop: string | symbol;
     }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
+  | {
+      kind: 'value';
+      target: object;
+      prop: string | symbol;
+      value: unknown;
+      /** Whether the property existed: a missing one is a dependency too. */
+      present: boolean;
+    }
+  /** `prop in this`: valid while the property is present, or absent, as it was. */
+  | {kind: 'has'; target: object; prop: string | symbol; present: boolean}
+  /** `Object.keys(this)` and the like: valid while the node has the same own keys. */
+  | {kind: 'keys'; internal: StoreInternal; keysVersion: number}
   | {
       /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
       kind: 'computed';
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..8795f2c 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -5,6 +5,8 @@ type ParentReference = {deref(): StoreInternal | undefined};
 /** One canonical node per raw object. Each property owns one edge to a child. */
 export class StoreInternal {
   version = 0;
+  /** Moves when an own key is added or removed, not when a value changes. */
+  keysVersion = 0;
   isStoreRoot = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..1c3cea2 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -39,7 +39,12 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  /** `has`: `prop in this`. `keys`: the own keys of `this`. Otherwise a read. */
+  kind?: 'has' | 'keys';
+  prop: string | symbol;
+  value: unknown;
+};
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -76,7 +81,6 @@ function computeWithTracking(
   const deps: GetterDep[] = [];
   const readProps = new Set<string | symbol>();
 
-  // Use an empty non-frozen target — we delegate everything to `snap`.
   const handler: ProxyHandler<object> = {
     get(_dummyTarget, prop, _receiver) {
       // Delegate to the real snapshot (receiver = snap so installed getters
@@ -88,11 +92,24 @@ function computeWithTracking(
       }
       return value;
     },
+    has(_target, prop) {
+      const value = Reflect.has(snap, prop);
+      deps.push({kind: 'has', prop, value});
+      return value;
+    },
+    ownKeys() {
+      const value = Reflect.ownKeys(snap);
+      deps.push({kind: 'keys', prop: '', value});
+      return value;
+    },
   };
 
-  const tracked = new Proxy({}, handler);
+  // The frozen snapshot is the target, so an operation without a trap
+  // (`instanceof`, a descriptor read) answers for the snapshot itself.
+  const tracked = new Proxy(snap, handler);
   const result = getterFn.call(tracked);
-  return {deps, result};
+  // A getter that returns `this` returns the snapshot, not the tracker.
+  return {deps, result: result === tracked ? snap : result};
 }
 
 /**
@@ -103,8 +120,20 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    if (dep.kind === 'has') {
+      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;
+    } else if (dep.kind === 'keys') {
+      const before = dep.value as (string | symbol)[];
+      const now = Reflect.ownKeys(currentSnap);
+      if (
+        now.length !== before.length ||
+        now.some((key, index) => key !== before[index])
+      )
+        return false;
+    } else if (
+      !Object.is(Reflect.get(currentSnap, dep.prop, currentSnap), dep.value)
+    )
+      return false;
   }
   return true;
 }
```

### `t4.patch`

T4 as recommended: the live store and snapshot variant S2.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a8c75bf 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -100,7 +100,14 @@ function recordDep(
       prop,
     });
   } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
+    tracker.deps.push({
+      kind: 'value',
+      target: internal.target,
+      prop,
+      value,
+      // Only `undefined` can be the value of a property that is not there.
+      present: value !== undefined || Reflect.has(internal.target, prop),
+    });
   }
 }
 
@@ -134,6 +141,10 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
         return false;
       if (dep.internal.version !== dep.version) return false;
+    } else if (dep.kind === 'has') {
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
+    } else if (dep.kind === 'keys') {
+      if (dep.internal.keysVersion !== dep.keysVersion) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
@@ -141,10 +152,9 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
+      // A property that appeared or went away is a change, even when its
+      // value reads `undefined` both times.
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -418,8 +428,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       }
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
+      const hadKey = Object.hasOwn(_target, prop);
       if (
-        Object.hasOwn(_target, prop) &&
+        hadKey &&
         (Object.is(oldValue, value) ||
           (previousChild &&
             (previousChild.proxy === value || previousChild.target === value)))
@@ -438,6 +449,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         detachTruncatedChildren(internal, (_target as unknown[]).length);
       }
       if (!written && !truncated) return false;
+      if (truncated || !hadKey) internal.keysVersion++;
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
@@ -500,7 +512,9 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     },
 
     defineProperty(_target, prop, descriptor) {
+      const hadKey = Object.hasOwn(_target, prop);
       const defined = Reflect.defineProperty(_target, prop, descriptor);
+      if (defined && !hadKey) internal.keysVersion++;
       // `Object.freeze(proxy)` arrives here once per property. A property that
       // is now read-only holds its value as it is, as if frozen all along.
       const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
@@ -512,9 +526,30 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       return defined;
     },
 
+    has(_target, prop) {
+      const present = Reflect.has(_target, prop);
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({kind: 'has', target: _target, prop, present});
+      return present;
+    },
+
+    ownKeys(_target) {
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({
+          kind: 'keys',
+          internal,
+          keysVersion: internal.keysVersion,
+        });
+      return Reflect.ownKeys(_target);
+    },
+
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      const hadKey = Object.hasOwn(_target, prop);
       const deleted = Reflect.deleteProperty(_target, prop);
+      if (deleted && hadKey) internal.keysVersion++;
       if (deleted) {
         internal.detach(prop);
         boundMethods.delete(prop);
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..2192cdc 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -17,7 +17,18 @@ export type DepEntry =
       /** Property name on the parent. */
       prop: string | symbol;
     }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
+  | {
+      kind: 'value';
+      target: object;
+      prop: string | symbol;
+      value: unknown;
+      /** Whether the property existed: a missing one is a dependency too. */
+      present: boolean;
+    }
+  /** `prop in this`: valid while the property is present, or absent, as it was. */
+  | {kind: 'has'; target: object; prop: string | symbol; present: boolean}
+  /** `Object.keys(this)` and the like: valid while the node has the same own keys. */
+  | {kind: 'keys'; internal: StoreInternal; keysVersion: number}
   | {
       /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
       kind: 'computed';
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..8795f2c 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -5,6 +5,8 @@ type ParentReference = {deref(): StoreInternal | undefined};
 /** One canonical node per raw object. Each property owns one edge to a child. */
 export class StoreInternal {
   version = 0;
+  /** Moves when an own key is added or removed, not when a value changes. */
+  keysVersion = 0;
   isStoreRoot = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..91a6197 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -39,7 +39,34 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  /** `has`: `prop in this`. `keys`: the own keys of `this`. Otherwise a read. */
+  kind?: 'has' | 'keys';
+  prop: string | symbol;
+  value: unknown;
+};
+
+/**
+ * A class getter is an own accessor of a snapshot and an inherited one of the
+ * store. Inside a getter, `this` lists the keys the store lists: every own key
+ * of the snapshot except the getters its class contributed.
+ */
+function isOwnKeyOfStore(snap: object, key: string | symbol): boolean {
+  const getter = Object.getOwnPropertyDescriptor(snap, key)?.get;
+  return !getter || originalAccessors.get(getter) !== null;
+}
+
+function storeKeys(snap: object): (string | symbol)[] {
+  return Reflect.ownKeys(snap).filter((key) => isOwnKeyOfStore(snap, key));
+}
+
+/** Those keys, each followed by whether it is enumerable: what `Object.keys` depends on. */
+function keyShape(snap: object): unknown[] {
+  return storeKeys(snap).flatMap((key) => [
+    key,
+    Object.prototype.propertyIsEnumerable.call(snap, key),
+  ]);
+}
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -88,11 +115,37 @@ function computeWithTracking(
       }
       return value;
     },
+    has(_dummyTarget, prop) {
+      const value = Reflect.has(snap, prop);
+      deps.push({kind: 'has', prop, value});
+      return value;
+    },
+    ownKeys() {
+      deps.push({kind: 'keys', prop: '', value: keyShape(snap)});
+      return storeKeys(snap);
+    },
+    getOwnPropertyDescriptor(_dummyTarget, prop) {
+      const descriptor = isOwnKeyOfStore(snap, prop)
+        ? Object.getOwnPropertyDescriptor(snap, prop)
+        : undefined;
+      // The target is an empty object, and a Proxy may report a property its
+      // target does not have only as configurable.
+      return descriptor && {...descriptor, configurable: true};
+    },
+    getPrototypeOf() {
+      return Object.getPrototypeOf(snap);
+    },
+    // A getter that writes is dropped in silence, as before these traps. With
+    // the descriptor trap alone the write would throw a `TypeError`.
+    set() {
+      return true;
+    },
   };
 
   const tracked = new Proxy({}, handler);
   const result = getterFn.call(tracked);
-  return {deps, result};
+  // A getter that returns `this` returns the snapshot, not the tracker.
+  return {deps, result: result === tracked ? snap : result};
 }
 
 /**
@@ -103,8 +156,20 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    if (dep.kind === 'has') {
+      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;
+    } else if (dep.kind === 'keys') {
+      const before = dep.value as unknown[];
+      const now = keyShape(currentSnap);
+      if (
+        now.length !== before.length ||
+        now.some((key, index) => key !== before[index])
+      )
+        return false;
+    } else if (
+      !Object.is(Reflect.get(currentSnap, dep.prop, currentSnap), dep.value)
+    )
+      return false;
   }
   return true;
 }
```

### `t5.patch`

T5: a delete that removes nothing.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..75e7356 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -514,6 +514,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      // Deleting a key that is not there succeeds and changes nothing.
+      if (!Object.hasOwn(_target, prop)) return true;
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
```

### `t6-realm.patch`

T6, first guard: a plain object from another realm.

```diff
diff --git a/packages/classy-store/src/utils/internal/internal.ts b/packages/classy-store/src/utils/internal/internal.ts
index 3a6b73d..f8828f6 100644
--- a/packages/classy-store/src/utils/internal/internal.ts
+++ b/packages/classy-store/src/utils/internal/internal.ts
@@ -56,7 +56,30 @@ export function isPlainObject(
 ): value is Record<string | symbol, unknown> {
   if (typeof value !== 'object' || value === null) return false;
   const proto = Object.getPrototypeOf(value);
-  return proto === objectProto || proto === null;
+  return proto === objectProto || proto === null || isForeignObjectProto(proto);
+}
+
+const objectSource = Function.prototype.toString.call(Object);
+const foreignObjectProtos = new WeakMap<object, boolean>();
+
+/**
+ * `Object.prototype` of another realm: an iframe, or a Node `vm` context. It
+ * ends its prototype chain, and its `constructor` prints as `Object` does.
+ */
+function isForeignObjectProto(proto: object): boolean {
+  let known = foreignObjectProtos.get(proto);
+  if (known === undefined) {
+    const constructor = Object.getOwnPropertyDescriptor(
+      proto,
+      'constructor',
+    )?.value;
+    known =
+      Object.getPrototypeOf(proto) === null &&
+      typeof constructor === 'function' &&
+      Function.prototype.toString.call(constructor) === objectSource;
+    foreignObjectProtos.set(proto, known);
+  }
+  return known;
 }
 
 /**
```

### `t6-readonly.patch`

T6, second guard: a property frozen behind the store.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..72a2b3f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -493,8 +493,15 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Own data edges are indexed before a retained alias can be mutated.
       // An inherited data property becomes an edge on its first proxy read.
-      const child =
-        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
+      let child = internal.childInternals.get(prop);
+      if (child && child.proxy !== value && isReadOnly(getterDesc)) {
+        // The property was made read-only on the raw object after it was
+        // indexed. A Proxy must now return its value as it is.
+        internal.detach(prop);
+        child = undefined;
+      } else {
+        child ??= linkChild(internal, prop, value);
+      }
       recordDep(internal, prop, value);
       return child ? child.proxy : value;
     },
```

### `t6.patch`

T6, both guards.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..72a2b3f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -493,8 +493,15 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
       // Own data edges are indexed before a retained alias can be mutated.
       // An inherited data property becomes an edge on its first proxy read.
-      const child =
-        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
+      let child = internal.childInternals.get(prop);
+      if (child && child.proxy !== value && isReadOnly(getterDesc)) {
+        // The property was made read-only on the raw object after it was
+        // indexed. A Proxy must now return its value as it is.
+        internal.detach(prop);
+        child = undefined;
+      } else {
+        child ??= linkChild(internal, prop, value);
+      }
       recordDep(internal, prop, value);
       return child ? child.proxy : value;
     },
diff --git a/packages/classy-store/src/utils/internal/internal.ts b/packages/classy-store/src/utils/internal/internal.ts
index 3a6b73d..f8828f6 100644
--- a/packages/classy-store/src/utils/internal/internal.ts
+++ b/packages/classy-store/src/utils/internal/internal.ts
@@ -56,7 +56,30 @@ export function isPlainObject(
 ): value is Record<string | symbol, unknown> {
   if (typeof value !== 'object' || value === null) return false;
   const proto = Object.getPrototypeOf(value);
-  return proto === objectProto || proto === null;
+  return proto === objectProto || proto === null || isForeignObjectProto(proto);
+}
+
+const objectSource = Function.prototype.toString.call(Object);
+const foreignObjectProtos = new WeakMap<object, boolean>();
+
+/**
+ * `Object.prototype` of another realm: an iframe, or a Node `vm` context. It
+ * ends its prototype chain, and its `constructor` prints as `Object` does.
+ */
+function isForeignObjectProto(proto: object): boolean {
+  let known = foreignObjectProtos.get(proto);
+  if (known === undefined) {
+    const constructor = Object.getOwnPropertyDescriptor(
+      proto,
+      'constructor',
+    )?.value;
+    known =
+      Object.getPrototypeOf(proto) === null &&
+      typeof constructor === 'function' &&
+      Function.prototype.toString.call(constructor) === objectSource;
+    foreignObjectProtos.set(proto, known);
+  }
+  return known;
 }
 
 /**
```

### `combination.patch`

The combination.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..895f614 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -100,7 +100,14 @@ function recordDep(
       prop,
     });
   } else {
-    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
+    tracker.deps.push({
+      kind: 'value',
+      target: internal.target,
+      prop,
+      value,
+      // Only `undefined` can be the value of a property that is not there.
+      present: value !== undefined || Reflect.has(internal.target, prop),
+    });
   }
 }
 
@@ -134,6 +141,10 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
         return false;
       if (dep.internal.version !== dep.version) return false;
+    } else if (dep.kind === 'has') {
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
+    } else if (dep.kind === 'keys') {
+      if (dep.internal.keysVersion !== dep.keysVersion) return false;
     } else if (dep.kind === 'computed') {
       // Validate through the computed cache — never re-execute the raw getter.
       const cached = dep.internal.computedCache.get(dep.prop);
@@ -141,10 +152,9 @@ function areDepsValid(deps: DepEntry[]): boolean {
       if (!areDepsValid(cached.deps)) return false; // nested deps changed
       if (!Object.is(cached.value, dep.value)) return false; // value changed
     } else {
-      // Check that the property still exists — if it was deleted and
-      // dep.value was `undefined`, Object.is(undefined, undefined) would
-      // incorrectly pass without this guard.
-      if (!Reflect.has(dep.target, dep.prop)) return false;
+      // A property that appeared or went away is a change, even when its
+      // value reads `undefined` both times.
+      if (Reflect.has(dep.target, dep.prop) !== dep.present) return false;
       if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
         return false;
     }
@@ -361,11 +371,14 @@ function linkChild(
   if (typeof value !== 'object' || value === null) return;
   // A store embedded by its proxy is already the value the property holds, so
   // it stays a child wherever it sits, including in a frozen object.
-  const existing = internalsMap.get(value);
-  if (!existing) {
+  const viaProxy = internalsMap.get(value);
+  // One node per raw object: an object that is a store already is that store
+  // here too, whatever `canProxy` says about its class.
+  const existing = viaProxy ?? targetNodes.get(value);
+  if (!viaProxy) {
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
-    if (!canProxy(value) || isImmutableValue(value)) return;
+    if ((!existing && !canProxy(value)) || isImmutableValue(value)) return;
     if (
       isReadOnly(
         descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
@@ -378,6 +391,25 @@ function linkChild(
   return child;
 }
 
+/**
+ * `includes`, `indexOf` and `lastIndexOf` on a list find an object by its
+ * identity: the raw object, its store proxy and its snapshots are one value.
+ */
+function searchByIdentity(
+  method: (...args: unknown[]) => unknown,
+  target: unknown[],
+  args: unknown[],
+): unknown {
+  const wanted = args[0];
+  // A primitive, or a function, is found by the native search on the raw list.
+  if (typeof wanted !== 'object' || wanted === null)
+    return Reflect.apply(method, target, args);
+  return Reflect.apply(method, target.map(identityOf), [
+    identityOf(wanted),
+    ...args.slice(1),
+  ]);
+}
+
 /** Native array length writes remove indices without invoking DELETE traps. */
 function detachTruncatedChildren(
   internal: StoreInternal,
@@ -396,17 +428,14 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   const existing = targetNodes.get(target) ?? internalsMap.get(target);
   if (existing) return existing;
 
-  /** Cache for bound methods so we return the same reference each time. */
-  const boundMethods = new Map<
-    string | symbol,
-    (...args: unknown[]) => unknown
-  >();
+  /** One wrapper per method, so every read returns the same reference. */
+  const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
       internal.resumeScope();
-      // Store the snapshot itself, never the render-tracking proxy around it.
-      const value: unknown =
+      // Hand on the snapshot itself, never the render-tracking proxy around it.
+      const given: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
           : incoming;
@@ -414,15 +443,17 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
         // mutations invalidate their actual owners and notify just once.
-        return Reflect.set(_target, prop, value, receiver);
+        return Reflect.set(_target, prop, given, receiver);
       }
+      // The raw graph holds raw objects: store what a store proxy wraps.
+      const value = unwrap(given);
       const oldValue = Reflect.get(_target, prop);
       const previousChild = internal.childInternals.get(prop);
+      const hadKey = Object.hasOwn(_target, prop);
       if (
-        Object.hasOwn(_target, prop) &&
+        hadKey &&
         (Object.is(oldValue, value) ||
-          (previousChild &&
-            (previousChild.proxy === value || previousChild.target === value)))
+          (previousChild && previousChild.target === value))
       )
         return true;
       const oldLength =
@@ -438,6 +469,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         detachTruncatedChildren(internal, (_target as unknown[]).length);
       }
       if (!written && !truncated) return false;
+      if (truncated || !hadKey) internal.keysVersion++;
 
       // Keep the old child connected when a property rejects the write.
       if (written) {
@@ -451,9 +483,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         }
       }
 
-      // Drop any cached bound method — the previous binding is dead now.
-      boundMethods.delete(prop);
-
       notifyMutation(internal);
       return written;
     },
@@ -479,45 +508,110 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const value = Reflect.get(_target, prop);
 
       // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
-      // and run each call as one transaction.
-      if (typeof value === 'function') {
+      // and run each call as one transaction. A method is a function found on
+      // the prototype chain. A function the object holds itself is data, and
+      // so is `constructor`: both are returned as they are.
+      if (
+        typeof value === 'function' &&
+        prop !== 'constructor' &&
+        !Object.hasOwn(_target, prop)
+      ) {
         const method = value as (...args: unknown[]) => unknown;
-        // Array prototype methods should not be cached the same way as class methods.
-        if (Array.isArray(_target)) return transactional(method, receiver);
-        const cached = boundMethods.get(prop);
-        if (cached) return cached;
-        const bound = transactional(method, receiver);
-        boundMethods.set(prop, bound);
+        let bound = boundMethods.get(method);
+        if (!bound) {
+          bound =
+            Array.isArray(_target) &&
+            (prop === 'includes' || prop === 'indexOf' || prop === 'lastIndexOf')
+              ? (...args: unknown[]) => searchByIdentity(method, _target, args)
+              : transactional(method, receiver);
+          boundMethods.set(method, bound);
+        }
         return bound;
       }
 
       // Own data edges are indexed before a retained alias can be mutated.
       // An inherited data property becomes an edge on its first proxy read.
-      const child =
-        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
+      let child = internal.childInternals.get(prop);
+      if (child && child.proxy !== value && isReadOnly(getterDesc)) {
+        // The property was made read-only on the raw object after it was
+        // indexed. A Proxy must now return its value as it is.
+        internal.detach(prop);
+        child = undefined;
+      } else {
+        child ??= linkChild(internal, prop, value);
+      }
       recordDep(internal, prop, value);
       return child ? child.proxy : value;
     },
 
     defineProperty(_target, prop, descriptor) {
-      const defined = Reflect.defineProperty(_target, prop, descriptor);
-      // `Object.freeze(proxy)` arrives here once per property. A property that
-      // is now read-only holds its value as it is, as if frozen all along.
-      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
-      if (own && isReadOnly(own)) {
-        const child = internal.childInternals.get(prop);
-        // An embedded store's proxy is that value: it remains a child.
-        if (child && child.proxy !== own.value) internal.detach(prop);
+      internal.resumeScope();
+      const before = Object.getOwnPropertyDescriptor(_target, prop);
+      const defined = Reflect.defineProperty(
+        _target,
+        prop,
+        // The raw graph holds raw objects, as after an assignment.
+        'value' in descriptor
+          ? {...descriptor, value: unwrap(descriptor.value)}
+          : descriptor,
+      );
+      if (!defined) return false;
+      const own = Object.getOwnPropertyDescriptor(_target, prop);
+      // The bookkeeping of a write: the property's value is its child, or it
+      // has none. `Object.freeze(proxy)` arrives here once per property, and
+      // `linkChild` leaves the value of a read-only property as it is.
+      if (
+        !own ||
+        !('value' in own) ||
+        !linkChild(internal, prop, own.value, undefined, own)
+      ) {
+        internal.detach(prop);
       }
-      return defined;
+      if (prop === 'length' && Array.isArray(_target))
+        detachTruncatedChildren(internal, _target.length);
+      if (!before || !own || before.enumerable !== own.enumerable)
+        internal.keysVersion++;
+      // Tell subscribers when a snapshot would show the difference. Freezing
+      // changes neither a value nor a key, so it stays silent.
+      if (
+        !before ||
+        !own ||
+        'value' in before !== 'value' in own ||
+        before.enumerable !== own.enumerable ||
+        before.get !== own.get ||
+        !Object.is(before.value, own.value)
+      )
+        notifyMutation(internal);
+      return true;
+    },
+
+    has(_target, prop) {
+      const present = Reflect.has(_target, prop);
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({kind: 'has', target: _target, prop, present});
+      return present;
+    },
+
+    ownKeys(_target) {
+      const tracker = activeTracker();
+      if (tracker && tracker.internal === internal)
+        tracker.deps.push({
+          kind: 'keys',
+          internal,
+          keysVersion: internal.keysVersion,
+        });
+      return Reflect.ownKeys(_target);
     },
 
     deleteProperty(_target, prop) {
       internal.resumeScope();
+      // Deleting a key that is not there succeeds and changes nothing.
+      if (!Object.hasOwn(_target, prop)) return true;
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
+        internal.keysVersion++;
         internal.detach(prop);
-        boundMethods.delete(prop);
         notifyMutation(internal);
       }
       return deleted;
diff --git a/packages/classy-store/src/core/core.types.ts b/packages/classy-store/src/core/core.types.ts
index 2ef9388..2192cdc 100644
--- a/packages/classy-store/src/core/core.types.ts
+++ b/packages/classy-store/src/core/core.types.ts
@@ -17,7 +17,18 @@ export type DepEntry =
       /** Property name on the parent. */
       prop: string | symbol;
     }
-  | {kind: 'value'; target: object; prop: string | symbol; value: unknown}
+  | {
+      kind: 'value';
+      target: object;
+      prop: string | symbol;
+      value: unknown;
+      /** Whether the property existed: a missing one is a dependency too. */
+      present: boolean;
+    }
+  /** `prop in this`: valid while the property is present, or absent, as it was. */
+  | {kind: 'has'; target: object; prop: string | symbol; present: boolean}
+  /** `Object.keys(this)` and the like: valid while the node has the same own keys. */
+  | {kind: 'keys'; internal: StoreInternal; keysVersion: number}
   | {
       /** Dependency on a computed getter — validated via the computed cache, not raw getter re-execution. */
       kind: 'computed';
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..8795f2c 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -5,6 +5,8 @@ type ParentReference = {deref(): StoreInternal | undefined};
 /** One canonical node per raw object. Each property owns one edge to a child. */
 export class StoreInternal {
   version = 0;
+  /** Moves when an own key is added or removed, not when a value changes. */
+  keysVersion = 0;
   isStoreRoot = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..91a6197 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -39,7 +39,34 @@ export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  * prop: the property name read on `this`.
  * value: the value returned (reference).
  */
-type GetterDep = {prop: string | symbol; value: unknown};
+type GetterDep = {
+  /** `has`: `prop in this`. `keys`: the own keys of `this`. Otherwise a read. */
+  kind?: 'has' | 'keys';
+  prop: string | symbol;
+  value: unknown;
+};
+
+/**
+ * A class getter is an own accessor of a snapshot and an inherited one of the
+ * store. Inside a getter, `this` lists the keys the store lists: every own key
+ * of the snapshot except the getters its class contributed.
+ */
+function isOwnKeyOfStore(snap: object, key: string | symbol): boolean {
+  const getter = Object.getOwnPropertyDescriptor(snap, key)?.get;
+  return !getter || originalAccessors.get(getter) !== null;
+}
+
+function storeKeys(snap: object): (string | symbol)[] {
+  return Reflect.ownKeys(snap).filter((key) => isOwnKeyOfStore(snap, key));
+}
+
+/** Those keys, each followed by whether it is enumerable: what `Object.keys` depends on. */
+function keyShape(snap: object): unknown[] {
+  return storeKeys(snap).flatMap((key) => [
+    key,
+    Object.prototype.propertyIsEnumerable.call(snap, key),
+  ]);
+}
 
 /**
  * Cached result of a snapshot getter with the dependencies it read,
@@ -88,11 +115,37 @@ function computeWithTracking(
       }
       return value;
     },
+    has(_dummyTarget, prop) {
+      const value = Reflect.has(snap, prop);
+      deps.push({kind: 'has', prop, value});
+      return value;
+    },
+    ownKeys() {
+      deps.push({kind: 'keys', prop: '', value: keyShape(snap)});
+      return storeKeys(snap);
+    },
+    getOwnPropertyDescriptor(_dummyTarget, prop) {
+      const descriptor = isOwnKeyOfStore(snap, prop)
+        ? Object.getOwnPropertyDescriptor(snap, prop)
+        : undefined;
+      // The target is an empty object, and a Proxy may report a property its
+      // target does not have only as configurable.
+      return descriptor && {...descriptor, configurable: true};
+    },
+    getPrototypeOf() {
+      return Object.getPrototypeOf(snap);
+    },
+    // A getter that writes is dropped in silence, as before these traps. With
+    // the descriptor trap alone the write would throw a `TypeError`.
+    set() {
+      return true;
+    },
   };
 
   const tracked = new Proxy({}, handler);
   const result = getterFn.call(tracked);
-  return {deps, result};
+  // A getter that returns `this` returns the snapshot, not the tracker.
+  return {deps, result: result === tracked ? snap : result};
 }
 
 /**
@@ -103,8 +156,20 @@ function computeWithTracking(
  */
 function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
   for (const dep of deps) {
-    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
-    if (!Object.is(currentValue, dep.value)) return false;
+    if (dep.kind === 'has') {
+      if (Reflect.has(currentSnap, dep.prop) !== dep.value) return false;
+    } else if (dep.kind === 'keys') {
+      const before = dep.value as unknown[];
+      const now = keyShape(currentSnap);
+      if (
+        now.length !== before.length ||
+        now.some((key, index) => key !== before[index])
+      )
+        return false;
+    } else if (
+      !Object.is(Reflect.get(currentSnap, dep.prop, currentSnap), dep.value)
+    )
+      return false;
   }
   return true;
 }
diff --git a/packages/classy-store/src/utils/internal/internal.ts b/packages/classy-store/src/utils/internal/internal.ts
index 3a6b73d..f8828f6 100644
--- a/packages/classy-store/src/utils/internal/internal.ts
+++ b/packages/classy-store/src/utils/internal/internal.ts
@@ -56,7 +56,30 @@ export function isPlainObject(
 ): value is Record<string | symbol, unknown> {
   if (typeof value !== 'object' || value === null) return false;
   const proto = Object.getPrototypeOf(value);
-  return proto === objectProto || proto === null;
+  return proto === objectProto || proto === null || isForeignObjectProto(proto);
+}
+
+const objectSource = Function.prototype.toString.call(Object);
+const foreignObjectProtos = new WeakMap<object, boolean>();
+
+/**
+ * `Object.prototype` of another realm: an iframe, or a Node `vm` context. It
+ * ends its prototype chain, and its `constructor` prints as `Object` does.
+ */
+function isForeignObjectProto(proto: object): boolean {
+  let known = foreignObjectProtos.get(proto);
+  if (known === undefined) {
+    const constructor = Object.getOwnPropertyDescriptor(
+      proto,
+      'constructor',
+    )?.value;
+    known =
+      Object.getPrototypeOf(proto) === null &&
+      typeof constructor === 'function' &&
+      Function.prototype.toString.call(constructor) === objectSource;
+    foreignObjectProtos.set(proto, known);
+  }
+  return known;
 }
 
 /**
```

## Appendix C: the failing tests of each spike

As printed by `bun run test`, grouped by file. The unmodified worktree has 1,341 passing tests and none failing.

### T1, strict

```text
10 failing tests in 4 files

src/core/core.characterisation.identity.test.ts
  - functions read through a store > a function stored as data is read back as one stable wrapper bound to the store, while the snapshot holds the original
  - functions read through a store > a method read from a store array is a new function on every read
  - functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array
  - functions read through a store > splice(indexOf(fn), 1) on a store array of functions removes the last function, not the one asked for
  - functions read through a store > a class stored as data is read back as a wrapper without its static members

src/core/core.characterisation.getters.test.ts
  - static getters > are not reachable through store.constructor, which is not the class
  - static getters > read through this.constructor are undefined on the store and correct on a snapshot

src/core/core.characterisation.invariants.test.ts
  - the well-known symbols a store is asked for > a nested array is an array to Array.isArray and Object.prototype.toString, and slice, filter and concat return plain arrays of proxies
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body

src/core/core.characterisation.notifications.test.ts
  - notification order across stores > a store method that writes two stores notifies their sync subscribers when it returns, in the order they were first written
```

### T1, lenient

```text
8 failing tests in 3 files

src/core/core.characterisation.identity.test.ts
  - functions read through a store > a method read from a store array is a new function on every read
  - functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array
  - functions read through a store > splice(indexOf(fn), 1) on a store array of functions removes the last function, not the one asked for
  - functions read through a store > a class stored as data is read back as a wrapper without its static members

src/core/core.characterisation.getters.test.ts
  - static getters > are not reachable through store.constructor, which is not the class
  - static getters > read through this.constructor are undefined on the store and correct on a snapshot

src/core/core.characterisation.invariants.test.ts
  - the well-known symbols a store is asked for > a nested array is an array to Array.isArray and Object.prototype.toString, and slice, filter and concat return plain arrays of proxies
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body
```

### T2, both parts

```text
7 failing tests in 1 files

src/core/core.characterisation.identity.test.ts
  - a store inside a store > is not connected when the raw class instance behind it is embedded instead of its proxy
  - looking an object up in a store array > includes(), indexOf() and lastIndexOf() find an element by its proxy and not by its raw object
  - looking an object up in a store array > an object is not found by includes() or indexOf() right after it was pushed
  - functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array
  - functions read through a store > splice(indexOf(fn), 1) on a store array of functions removes the last function, not the one asked for
  - the raw objects behind a store, after writes through it > keep a raw object that was assigned, and hold the proxy itself when a proxy was assigned
  - the raw objects behind a store, after writes through it > hold proxies in place of the raw elements once a store array was reversed in place
```

### T2, first part only

```text
3 failing tests in 1 files

src/core/core.characterisation.identity.test.ts
  - a store inside a store > is not connected when the raw class instance behind it is embedded instead of its proxy
  - the raw objects behind a store, after writes through it > keep a raw object that was assigned, and hold the proxy itself when a proxy was assigned
  - the raw objects behind a store, after writes through it > hold proxies in place of the raw elements once a store array was reversed in place
```

### T3 (a)

```text
17 failing tests in 4 files

src/snapshot/snapshot.redefinedElements.test.ts
  - an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
  - an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object

src/core/core.unobservedObjects.test.ts
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
  - an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store

src/core/core.removedContainers.test.ts
  - an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
  - an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

src/core/core.characterisation.invariants.test.ts
  - writing the length of an array > a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element
  - Object.defineProperty on a store: a new data property > is live at once, notifies no one, and is missing from the snapshot cached before it
  - Object.defineProperty on a store: a new data property > reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds
  - Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
  - Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
  - Object.defineProperty on a store: an existing property > a redefined object is ignored: reads, writes and snapshots stay on the old object, even after it is assigned
  - Object.defineProperty on a store: an existing property > a field redefined from an object to a primitive keeps returning the old object
  - Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one
```

### T3 (b)

```text
29 failing tests in 6 files

src/snapshot/snapshot.redefinedElements.test.ts
  - an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
  - an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object

src/core/core.refusedDefinition.test.ts
  - a definition that the object behind a store refuses > leaves the object under that field connected: a write to it still notifies the store

src/core/core.unobservedObjects.test.ts
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
  - an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store

src/core/core.characterisation.getters.test.ts
  - a getter on an object literal passed to createClassyStore > keeps returning the old result after the getter is redefined, until a dependency changes

src/core/core.removedContainers.test.ts
  - an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
  - an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

src/core/core.characterisation.invariants.test.ts
  - sealing or closing a store through its proxy > Object.preventExtensions closes the raw object: a new key throws, assigned or defined, and a delete still notifies
  - assigning __proto__ or calling Object.setPrototypeOf on a store > store.__proto__ = x swaps the prototype of the raw object and notifies no one
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a snapshot taken before Object.setPrototypeOf is still returned after it, until the next ordinary write
  - assigning __proto__ or calling Object.setPrototypeOf on a store > store.__proto__ keeps returning the prototype it first read, after a swap and after a write
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a getter read before a prototype swap keeps its old result until a dependency changes
  - assigning __proto__ or calling Object.setPrototypeOf on a store > Object.assign with a JSON __proto__ key swaps the prototype, as on a plain object, and notifies for the other keys only
  - assigning __proto__ or calling Object.setPrototypeOf on a store > an object inherited from the new prototype is a proxy on the store, and the raw unfrozen object on a snapshot
  - writing the length of an array > a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element
  - Object.defineProperty on a store: a new data property > is live at once, notifies no one, and is missing from the snapshot cached before it
  - Object.defineProperty on a store: a new data property > reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds
  - Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
  - Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
  - Object.defineProperty on a store: an existing property > a redefined object is ignored: reads, writes and snapshots stay on the old object, even after it is assigned
  - Object.defineProperty on a store: an existing property > a field redefined from an object to a primitive keeps returning the old object
  - Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > an accessor defined over a nested object leaves that object connected: a write to it still notifies the store
  - Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one
  - the in operator and Object.keys on a store > Object.keys lists the own enumerable string keys in property order, at once after an add, a delete or a definition
```

### T3 (c)

```text
37 failing tests in 7 files

src/snapshot/snapshot.redefinedElements.test.ts
  - an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
  - an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object

src/core/core.refusedDefinition.test.ts
  - a definition that the object behind a store refuses > leaves the object under that field connected: a write to it still notifies the store

src/core/core.unobservedObjects.test.ts
  - a store created from an object that had left another store > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
  - a store whose only subscriber has left > hands a nested object over as a working store of its own when it is frozen: its snapshot is current after a change under it
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
  - an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
  - an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store

src/core/core.characterisation.getters.test.ts
  - a getter on an object literal passed to createClassyStore > keeps returning the old result after the getter is redefined, until a dependency changes

src/core/core.frozenValues.test.ts
  - a frozen object that holds another store > a root frozen afterwards keeps passing them on
  - freezing an object that is already in a store > Object.freeze through the proxy leaves it readable
  - freezing an object that is already in a store > Object.seal through the proxy keeps the object reactive
  - freezing an object that is already in a store > a property made read-only through the proxy returns its own value

src/core/core.removedContainers.test.ts
  - an object held from a container that left the store > shows a write to a child it shares with the store, made before the container was frozen
  - an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
  - an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store

src/core/core.characterisation.invariants.test.ts
  - sealing or closing a store through its proxy > Object.seal seals the raw object and notifies no one; fields stay reactive, a new key or a delete throws
  - sealing or closing a store through its proxy > Object.preventExtensions closes the raw object: a new key throws, assigned or defined, and a delete still notifies
  - assigning __proto__ or calling Object.setPrototypeOf on a store > store.__proto__ = x swaps the prototype of the raw object and notifies no one
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a snapshot taken before Object.setPrototypeOf is still returned after it, until the next ordinary write
  - assigning __proto__ or calling Object.setPrototypeOf on a store > store.__proto__ keeps returning the prototype it first read, after a swap and after a write
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body
  - assigning __proto__ or calling Object.setPrototypeOf on a store > a getter read before a prototype swap keeps its old result until a dependency changes
  - assigning __proto__ or calling Object.setPrototypeOf on a store > Object.assign with a JSON __proto__ key swaps the prototype, as on a plain object, and notifies for the other keys only
  - assigning __proto__ or calling Object.setPrototypeOf on a store > an object inherited from the new prototype is a proxy on the store, and the raw unfrozen object on a snapshot
  - writing the length of an array > a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element
  - Object.defineProperty on a store: a new data property > is live at once, notifies no one, and is missing from the snapshot cached before it
  - Object.defineProperty on a store: a new data property > reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds
  - Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
  - Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
  - Object.defineProperty on a store: an existing property > a redefined object is ignored: reads, writes and snapshots stay on the old object, even after it is assigned
  - Object.defineProperty on a store: an existing property > a field redefined from an object to a primitive keeps returning the old object
  - Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write
  - Object.defineProperty on a store: accessors, and several properties at once > an accessor defined over a nested object leaves that object connected: a write to it still notifies the store
  - Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one
  - the in operator and Object.keys on a store > Object.keys lists the own enumerable string keys in property order, at once after an add, a delete or a definition
```

### T4, the live store

```text
9 failing tests in 3 files

src/core/core.characterisation.getters.test.ts
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is added
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is deleted
  - a getter whose result depends on which keys the store has > re-runs Object.entries(this) after a listed key is deleted, but not after a key is added
  - a getter that reads a property the store does not have > runs on every read while the property is missing
  - a getter that reads a property the store does not have > runs on every read again after the property is deleted
  - a getter that reads a property the store does not have > returns a new object on every read when it builds one

src/core/core.fuzz.findings.test.ts
  - core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
  - core — findings of the differential test > getters > a live getter that asks for the keys of `this` is stale after a delete

src/core/core.fuzz.test.ts
  - core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### T4 with snapshot variant S1

```text
14 failing tests in 3 files

src/core/core.characterisation.getters.test.ts
  - a getter that writes to the store while it runs > drops the write on a snapshot: no error, no notification, snapshot and store unchanged
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is added
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is deleted
  - a getter whose result depends on which keys the store has > re-runs Object.entries(this) after a listed key is deleted, but not after a key is added
  - a getter that reads a property the store does not have > runs on every read while the property is missing
  - a getter that reads a property the store does not have > runs on every read again after the property is deleted
  - a getter that reads a property the store does not have > returns a new object on every read when it builds one
  - a getter that asks for the shape of `this` on a snapshot > sees no own keys: Object.keys(this), `in`, for...in, spread and JSON.stringify come back empty
  - a getter that asks for the shape of `this` on a snapshot > is not an instance of its class inside the getter, though the snapshot is
  - a getter that asks for the shape of `this` on a snapshot > returns the store from a getter that returns `this`, but not the snapshot

src/core/core.fuzz.findings.test.ts
  - core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
  - core — findings of the differential test > getters > a live getter that asks for the keys of `this` is stale after a delete
  - core — findings of the differential test > getters > a snapshot getter that asks for the keys of `this` sees no keys

src/core/core.fuzz.test.ts
  - core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### T4 as recommended

```text
13 failing tests in 3 files

src/core/core.characterisation.getters.test.ts
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is added
  - a getter whose result depends on which keys the store has > keeps the first result of Object.keys(this), `in` and for...in after a key is deleted
  - a getter whose result depends on which keys the store has > re-runs Object.entries(this) after a listed key is deleted, but not after a key is added
  - a getter that reads a property the store does not have > runs on every read while the property is missing
  - a getter that reads a property the store does not have > runs on every read again after the property is deleted
  - a getter that reads a property the store does not have > returns a new object on every read when it builds one
  - a getter that asks for the shape of `this` on a snapshot > sees no own keys: Object.keys(this), `in`, for...in, spread and JSON.stringify come back empty
  - a getter that asks for the shape of `this` on a snapshot > is not an instance of its class inside the getter, though the snapshot is
  - a getter that asks for the shape of `this` on a snapshot > returns the store from a getter that returns `this`, but not the snapshot

src/core/core.fuzz.findings.test.ts
  - core — findings of the differential test > getters > a live getter that reads a missing property is recomputed on every read
  - core — findings of the differential test > getters > a live getter that asks for the keys of `this` is stale after a delete
  - core — findings of the differential test > getters > a snapshot getter that asks for the keys of `this` sees no keys

src/core/core.fuzz.test.ts
  - core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### T5

```text
7 failing tests in 4 files

src/core/core.characterisation.getters.test.ts
  - a getter that reads one field of a nested object > is re-run when a key the object never had is deleted

src/core/core.fuzz.findings.test.ts
  - core — findings of the differential test > a delete that removes nothing counts as a write > deleting a key that is not there notifies and replaces the snapshot
  - core — findings of the differential test > a delete that removes nothing counts as a write > deleting an index past the end of a list notifies and replaces the snapshot
  - core — findings of the differential test > a delete that removes nothing counts as a write > sort and copyWithin over holes notify though the list does not change

src/core/core.characterisation.invariants.test.ts
  - delete on a store > deleting a key the store never had returns true, notifies, and replaces the snapshot with an equal one
  - delete on a store > so does deleting an index past the end of an array, or a name the store only inherits

src/core/core.fuzz.test.ts
  - core — randomized differential test > snapshots, sharing, notifications and getters match a plain mirror under random edits
```

### T6, first guard

```text
0 failing tests in 0 files
```

### T6, second guard

```text
2 failing tests in 1 files

src/core/core.characterisation.invariants.test.ts
  - frozen objects: what core.frozenValues.test.ts leaves out > a nested object throws a TypeError when read, once its raw parent was frozen behind the store
  - frozen objects: what core.frozenValues.test.ts leaves out > a store whose raw root was frozen behind it throws a TypeError when spread or passed to JSON.stringify
```

### T6, both guards

```text
2 failing tests in 1 files

src/core/core.characterisation.invariants.test.ts
  - frozen objects: what core.frozenValues.test.ts leaves out > a nested object throws a TypeError when read, once its raw parent was frozen behind the store
  - frozen objects: what core.frozenValues.test.ts leaves out > a store whose raw root was frozen behind it throws a TypeError when spread or passed to JSON.stringify
```

## Appendix D: reproductions

Run with Bun 1.4.4.

### `lib.ts`

Shared helpers.

```ts
// Shared by the reproductions. `before` imports the unmodified source of the
// main checkout; `after` imports the throwaway worktree, with a spike applied.
export const variant = process.argv[2] ?? 'after';
const scratch = '<scratch>/stage-3-spike-traps';
const root =
  variant === 'before'
    ? '<repo>/packages/classy-store/src'
    : `${scratch}/wt/packages/classy-store/src`;
export const {createClassyStore, snapshot, subscribe, batch} = await import(
  `${root}/index.ts`
);
export const {reactiveSet, reactiveMap} = await import(
  `${root}/collections/index.ts`
);
export const out = (label: string, value: unknown) =>
  console.log(
    label.padEnd(66),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
export const attempt = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    const e = error as Error;
    return `throws ${e.constructor.name}: ${e.message.slice(0, 90)}`;
  }
};
export const section = (title: string) => console.log(`\n# ${title}`);
/** Count synchronous notifications of `store` while `run` executes. */
export const syncCalls = (store: object, run: () => void) => {
  let calls = 0;
  const stop = subscribe(store, () => calls++, {sync: true});
  try {
    run();
  } finally {
    stop();
  }
  return calls;
};
```

### `t1.ts`

T1.

```ts
// T1: which functions read through a store are wrapped.
import {
  attempt,
  createClassyStore,
  out,
  reactiveSet,
  section,
  snapshot,
  subscribe,
  syncCalls,
  variant,
} from './lib';

section(`${variant}: 1. a prototype method`);
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
  const store = createClassyStore(new Counter());
  out('store.inc === store.inc', store.inc === store.inc);
  out(
    'store.inc === Counter.prototype.inc',
    store.inc === Counter.prototype.inc,
  );
  out(
    'sync calls for one inc() that writes two fields',
    syncCalls(store, () => store.inc()),
  );
  const {inc} = store;
  out(
    'destructured inc() works',
    attempt(() => (inc(), store.count)),
  );
  section(`${variant}: 2. a getter that returns a function`);
  out(
    'store.formatter === store.formatter',
    store.formatter === store.formatter,
  );
  out('store.formatter(1)', store.formatter(1));
  section(`${variant}: 9. constructor (finding 42)`);
  out('store.constructor === Counter', store.constructor === Counter);
  out(
    'store.constructor.label',
    attempt(() => (store.constructor as typeof Counter).label),
  );
  out(
    'snapshot(store).constructor === store.constructor',
    snapshot(store).constructor === store.constructor,
  );
  out(
    'plain store: store.constructor === Object',
    createClassyStore({a: 1}).constructor === Object,
  );
}

section(`${variant}: 3. an own property holding an ordinary function`);
{
  const handler = function (this: unknown) {
    return this;
  };
  const raw = {count: 0, other: 0, handler};
  const store = createClassyStore(raw);
  out('store.handler === handler', store.handler === handler);
  out('store.handler === store.handler', store.handler === store.handler);
  out(
    'store.handler() === store (called on the store)',
    store.handler() === store,
  );
  const taken = store.handler;
  out(
    'taken off the store, this is',
    attempt(() => (taken() === store ? 'the store' : String(taken()))),
  );
}

section(`${variant}: 10. an object-literal store with a method`);
{
  const store = createClassyStore({
    count: 0,
    other: 0,
    inc() {
      this.count++;
      this.other++;
    },
  });
  out(
    'sync calls for one inc() that writes two fields',
    syncCalls(store, () => store.inc()),
  );
  const {inc} = store;
  out(
    'destructured inc()',
    attempt(() => (inc(), store.count)),
  );
  out('store.inc === store.inc', store.inc === store.inc);
}

section(`${variant}: 4. an own property holding an arrow function`);
{
  class WithArrow {
    count = 0;
    inc = () => {
      this.count++;
    };
  }
  const raw = new WithArrow();
  const store = createClassyStore(raw);
  out('store.inc === raw.inc', store.inc === raw.inc);
  out(
    'sync calls for inc() (writes the raw object)',
    syncCalls(store, () => store.inc()),
  );
  out('store.count after inc()', store.count);
  const onChange = () => 1;
  const holder = createClassyStore({onChange, list: [] as (() => number)[]});
  out('holder.onChange === onChange', holder.onChange === onChange);
  holder.list.push(holder.onChange);
  out(
    'list.push(holder.onChange); list[0] === onChange',
    holder.list[0] === onChange,
  );
}

section(`${variant}: 5. a function in an array (finding 5)`);
{
  const first = () => 1;
  const second = () => 2;
  const store = createClassyStore({callbacks: [first, second]});
  out(
    'callbacks[0] === callbacks[0]',
    store.callbacks[0] === store.callbacks[0],
  );
  out('callbacks[0] === first', store.callbacks[0] === first);
  out(
    'callbacks.indexOf(first), includes(first)',
    `${store.callbacks.indexOf(first)}, ${store.callbacks.includes(first)}`,
  );
  store.callbacks.splice(store.callbacks.indexOf(first), 1);
  out(
    'after splice(indexOf(first), 1): kept second',
    store.callbacks.length === 1 && store.callbacks[0] === second,
  );
  out(
    'list.push === list.push (array method)',
    store.callbacks.push === store.callbacks.push,
  );
  out(
    'sync calls for one unshift on 3 elements',
    (() => {
      const list = createClassyStore({rows: [1, 2, 3]});
      return syncCalls(list, () => list.rows.unshift(0));
    })(),
  );
  const {push} = store.callbacks;
  out(
    'destructured push()',
    attempt(() => (push(first), store.callbacks.length)),
  );
}

section(`${variant}: 6. a class held as a value (finding 6)`);
{
  class Model {
    static label = 'model';
    constructor(readonly name = 'x') {}
  }
  const store = createClassyStore({Model, made: 0});
  out('store.Model === Model', store.Model === Model);
  out(
    'store.Model.label',
    attempt(() => store.Model.label),
  );
  out(
    'new store.Model("x") instanceof store.Model',
    attempt(() => new store.Model('x') instanceof store.Model),
  );
  out(
    'new store.Model("x") instanceof Model',
    attempt(() => new store.Model('x') instanceof Model),
  );
  function Legacy(this: {name: string}) {
    this.name = 'legacy';
  }
  Legacy.label = 'legacy';
  const old = createClassyStore({Legacy});
  out(
    'function constructor: store.Legacy === Legacy, label',
    `${old.Legacy === Legacy}, ${attempt(() => old.Legacy.label)}`,
  );
}

section(`${variant}: 7. a bound function`);
{
  const context = {name: 'context'};
  const bound = function (this: {name: string}) {
    return this.name;
  }.bind(context);
  const store = createClassyStore({bound});
  out('store.bound === bound', store.bound === bound);
  out('store.bound()', store.bound());
}

section(`${variant}: 8. a frozen function`);
{
  const frozen = Object.freeze(function (this: unknown) {
    return this;
  });
  const store = createClassyStore({frozen, list: [frozen]});
  out('store.frozen === frozen', store.frozen === frozen);
  out('store.list[0] === frozen', store.list[0] === frozen);
}

section(`${variant}: 11. a store made from a function (finding 62)`);
{
  const fn = Object.assign(() => 1, {n: 0});
  const fnStore = createClassyStore(fn);
  const holder = createClassyStore({fn: fnStore as typeof fn});
  out('holder.fn === fnStore', holder.fn === fnStore);
  out(
    'holder told of fnStore.n = 1',
    syncCalls(holder, () => {
      fnStore.n = 1;
    }),
  );
  const set = createClassyStore({set: reactiveSet<unknown>()});
  set.set.add(fn);
  set.set.add(fnStore);
  out('reactiveSet: add(fn) then add(fnStore): size', set.set.size);
}

section(`${variant}: 12. a getter that calls a function held in a field`);
{
  class Labelled {
    count = 1;
    format = (n: number) => `a${n}`;
    get label() {
      return this.format(this.count);
    }
  }
  const store = createClassyStore(new Labelled());
  out('label', store.label);
  store.format = (n: number) => `b${n}`;
  out('label after store.format = other', store.label);
  out('snapshot label after store.format = other', snapshot(store).label);
}

section(
  `${variant}: 13. a method on a nested plain object and on a nested class instance`,
);
{
  const store = createClassyStore({
    child: {
      a: 0,
      b: 0,
      bump() {
        this.a++;
        this.b++;
      },
    },
  });
  out(
    'sync calls for store.child.bump() (own function, two writes)',
    syncCalls(store, () => store.child.bump()),
  );
  out('store.child.a after bump()', store.child.a);
}

section(
  `${variant}: 14. history-style check: a function field is behaviour or data?`,
);
{
  const store = createClassyStore({cb: (() => 1) as () => number});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const same = store.cb;
  store.cb = same;
  out('store.cb = store.cb notifies', calls);
}
```

Before:

```text
# before: 1. a prototype method
store.inc === store.inc                                            true
store.inc === Counter.prototype.inc                                false
sync calls for one inc() that writes two fields                    1
destructured inc() works                                           2

# before: 2. a getter that returns a function
store.formatter === store.formatter                                true
store.formatter(1)                                                 #1

# before: 9. constructor (finding 42)
store.constructor === Counter                                      false
store.constructor.label                                            undefined
snapshot(store).constructor === store.constructor                  false
plain store: store.constructor === Object                          false

# before: 3. an own property holding an ordinary function
store.handler === handler                                          false
store.handler === store.handler                                    true
store.handler() === store (called on the store)                    true
taken off the store, this is                                       the store

# before: 10. an object-literal store with a method
sync calls for one inc() that writes two fields                    1
destructured inc()                                                 2
store.inc === store.inc                                            true

# before: 4. an own property holding an arrow function
store.inc === raw.inc                                              false
sync calls for inc() (writes the raw object)                       0
store.count after inc()                                            1
holder.onChange === onChange                                       false
list.push(holder.onChange); list[0] === onChange                   false

# before: 5. a function in an array (finding 5)
callbacks[0] === callbacks[0]                                      false
callbacks[0] === first                                             false
callbacks.indexOf(first), includes(first)                          -1, false
after splice(indexOf(first), 1): kept second                       false
list.push === list.push (array method)                             false
sync calls for one unshift on 3 elements                           1
destructured push()                                                2

# before: 6. a class held as a value (finding 6)
store.Model === Model                                              false
store.Model.label                                                  undefined
new store.Model("x") instanceof store.Model                        false
new store.Model("x") instanceof Model                              true
function constructor: store.Legacy === Legacy, label               false, undefined

# before: 7. a bound function
store.bound === bound                                              false
store.bound()                                                      context

# before: 8. a frozen function
store.frozen === frozen                                            false
store.list[0] === frozen                                           false

# before: 11. a store made from a function (finding 62)
holder.fn === fnStore                                              false
holder told of fnStore.n = 1                                       0
reactiveSet: add(fn) then add(fnStore): size                       2

# before: 12. a getter that calls a function held in a field
label                                                              a1
label after store.format = other                                   a1
snapshot label after store.format = other                          b1

# before: 13. a method on a nested plain object and on a nested class instance
sync calls for store.child.bump() (own function, two writes)       1
store.child.a after bump()                                         1

# before: 14. history-style check: a function field is behaviour or data?
store.cb = store.cb notifies                                       1
```

After, strict:

```text
# after: 1. a prototype method
store.inc === store.inc                                            true
store.inc === Counter.prototype.inc                                false
sync calls for one inc() that writes two fields                    1
destructured inc() works                                           2

# after: 2. a getter that returns a function
store.formatter === store.formatter                                true
store.formatter(1)                                                 #1

# after: 9. constructor (finding 42)
store.constructor === Counter                                      true
store.constructor.label                                            counter
snapshot(store).constructor === store.constructor                  true
plain store: store.constructor === Object                          true

# after: 3. an own property holding an ordinary function
store.handler === handler                                          true
store.handler === store.handler                                    true
store.handler() === store (called on the store)                    true
taken off the store, this is                                       undefined

# after: 10. an object-literal store with a method
sync calls for one inc() that writes two fields                    2
destructured inc()                                                 throws TypeError: undefined is not an object (evaluating 'this.count')
store.inc === store.inc                                            true

# after: 4. an own property holding an arrow function
store.inc === raw.inc                                              true
sync calls for inc() (writes the raw object)                       0
store.count after inc()                                            1
holder.onChange === onChange                                       true
list.push(holder.onChange); list[0] === onChange                   true

# after: 5. a function in an array (finding 5)
callbacks[0] === callbacks[0]                                      true
callbacks[0] === first                                             true
callbacks.indexOf(first), includes(first)                          0, true
after splice(indexOf(first), 1): kept second                       true
list.push === list.push (array method)                             true
sync calls for one unshift on 3 elements                           1
destructured push()                                                2

# after: 6. a class held as a value (finding 6)
store.Model === Model                                              true
store.Model.label                                                  model
new store.Model("x") instanceof store.Model                        true
new store.Model("x") instanceof Model                              true
function constructor: store.Legacy === Legacy, label               true, legacy

# after: 7. a bound function
store.bound === bound                                              true
store.bound()                                                      context

# after: 8. a frozen function
store.frozen === frozen                                            true
store.list[0] === frozen                                           true

# after: 11. a store made from a function (finding 62)
holder.fn === fnStore                                              true
holder told of fnStore.n = 1                                       0
reactiveSet: add(fn) then add(fnStore): size                       2

# after: 12. a getter that calls a function held in a field
label                                                              a1
label after store.format = other                                   b1
snapshot label after store.format = other                          b1

# after: 13. a method on a nested plain object and on a nested class instance
sync calls for store.child.bump() (own function, two writes)       2
store.child.a after bump()                                         1

# after: 14. history-style check: a function field is behaviour or data?
store.cb = store.cb notifies                                       0
```

After, lenient:

```text
# after: 1. a prototype method
store.inc === store.inc                                            true
store.inc === Counter.prototype.inc                                false
sync calls for one inc() that writes two fields                    1
destructured inc() works                                           2

# after: 2. a getter that returns a function
store.formatter === store.formatter                                true
store.formatter(1)                                                 #1

# after: 9. constructor (finding 42)
store.constructor === Counter                                      true
store.constructor.label                                            counter
snapshot(store).constructor === store.constructor                  true
plain store: store.constructor === Object                          true

# after: 3. an own property holding an ordinary function
store.handler === handler                                          false
store.handler === store.handler                                    true
store.handler() === store (called on the store)                    true
taken off the store, this is                                       the store

# after: 10. an object-literal store with a method
sync calls for one inc() that writes two fields                    1
destructured inc()                                                 2
store.inc === store.inc                                            true

# after: 4. an own property holding an arrow function
store.inc === raw.inc                                              false
sync calls for inc() (writes the raw object)                       0
store.count after inc()                                            1
holder.onChange === onChange                                       false
list.push(holder.onChange); list[0] === onChange                   false

# after: 5. a function in an array (finding 5)
callbacks[0] === callbacks[0]                                      true
callbacks[0] === first                                             true
callbacks.indexOf(first), includes(first)                          0, true
after splice(indexOf(first), 1): kept second                       true
list.push === list.push (array method)                             true
sync calls for one unshift on 3 elements                           1
destructured push()                                                2

# after: 6. a class held as a value (finding 6)
store.Model === Model                                              true
store.Model.label                                                  model
new store.Model("x") instanceof store.Model                        true
new store.Model("x") instanceof Model                              true
function constructor: store.Legacy === Legacy, label               false, undefined

# after: 7. a bound function
store.bound === bound                                              false
store.bound()                                                      context

# after: 8. a frozen function
store.frozen === frozen                                            true
store.list[0] === frozen                                           true

# after: 11. a store made from a function (finding 62)
holder.fn === fnStore                                              false
holder told of fnStore.n = 1                                       0
reactiveSet: add(fn) then add(fnStore): size                       2

# after: 12. a getter that calls a function held in a field
label                                                              a1
label after store.format = other                                   a1
snapshot label after store.format = other                          b1

# after: 13. a method on a nested plain object and on a nested class instance
sync calls for store.child.bump() (own function, two writes)       1
store.child.a after bump()                                         1

# after: 14. history-style check: a function field is behaviour or data?
store.cb = store.cb notifies                                       1
```

### `t1-extra.ts`

T1: the rest of two tests that stop early, and an object-literal method.

```ts
// The rest of two tests that stop at an assertion T1 is meant to flip.
import {
  createClassyStore,
  out,
  section,
  snapshot,
  subscribe,
  variant,
} from './lib';

section(`${variant}: derived arrays after constructor reads as Array`);
{
  const store = createClassyStore({items: [{id: 1}, {id: 2}]});
  const none: {id: number}[] = [];
  const sliced = store.items.slice();
  out('store.items.constructor === Array', store.items.constructor === Array);
  out('sliced.constructor === Array', sliced.constructor === Array);
  out(
    'sliced is a plain array of proxies',
    sliced !== store.items && sliced[0] === store.items[0],
  );
  out(
    'filter and concat keep proxies',
    store.items.filter(() => true)[1] === store.items[1] &&
      none.concat(store.items)[0] === store.items[0],
  );
  out(
    'map, flat, toSorted, with return plain arrays',
    [
      store.items.map((x) => x),
      store.items.flat(),
      store.items.toSorted(),
      store.items.with(0, store.items[1]),
    ].every((list) => Array.isArray(list) && list !== store.items),
  );
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  sliced.push({id: 3});
  out('a push to the sliced copy notifies the store', calls);
}

section(`${variant}: a method after a prototype swap`);
{
  class A {
    n = 0;
    name() {
      return 'a';
    }
  }
  class B {
    name() {
      return 'b';
    }
  }
  const store = createClassyStore(new A());
  out('name() before', store.name());
  Object.setPrototypeOf(store, B.prototype);
  out('name() after the swap', store.name());
  A.prototype.name = () => 'patched';
  const again = createClassyStore(new A());
  out('a method replaced on the prototype', again.name());
}

section(`${variant}: an object-literal method that writes two stores`);
{
  const second = createClassyStore({value: 0});
  const first = createClassyStore({
    value: 0,
    writeBoth() {
      second.value = 1;
      this.value = 1;
      second.value = 2;
    },
  });
  const calls: string[] = [];
  const values = () =>
    `first=${snapshot(first).value} second=${snapshot(second).value}`;
  subscribe(first, () => calls.push(`first: ${values()}`), {sync: true});
  subscribe(second, () => calls.push(`second: ${values()}`), {sync: true});
  first.writeBoth();
  out('sync calls', calls);
}
```

Before:

```text
# before: derived arrays after constructor reads as Array
store.items.constructor === Array                                  false
sliced.constructor === Array                                       true
sliced is a plain array of proxies                                 true
filter and concat keep proxies                                     true
map, flat, toSorted, with return plain arrays                      true
a push to the sliced copy notifies the store                       0

# before: a method after a prototype swap
name() before                                                      a
name() after the swap                                              a
a method replaced on the prototype                                 patched

# before: an object-literal method that writes two stores
sync calls                                                         ["second: first=1 second=2","first: first=1 second=2"]
```

After, strict:

```text
# after: derived arrays after constructor reads as Array
store.items.constructor === Array                                  true
sliced.constructor === Array                                       true
sliced is a plain array of proxies                                 true
filter and concat keep proxies                                     true
map, flat, toSorted, with return plain arrays                      true
a push to the sliced copy notifies the store                       0

# after: a method after a prototype swap
name() before                                                      a
name() after the swap                                              b
a method replaced on the prototype                                 patched

# after: an object-literal method that writes two stores
sync calls                                                         ["second: first=0 second=1","first: first=1 second=1","second: first=1 second=2"]
```

### `t2.ts`

T2.

```ts
// T2: raw values on write, one node per raw object, searches on a list.
import {
  attempt,
  createClassyStore,
  out,
  reactiveSet,
  section,
  snapshot,
  syncCalls,
  variant,
} from './lib';

section(`${variant}: finding 7, searches on a list`);
{
  const raw = {id: 1};
  const store = createClassyStore({
    list: [raw, {id: 2}],
    nums: [1, Number.NaN, 3, 1],
  });
  out(
    'includes(raw), indexOf(raw), lastIndexOf(raw)',
    `${store.list.includes(raw)}, ${store.list.indexOf(raw)}, ${store.list.lastIndexOf(raw)}`,
  );
  out(
    'includes(list[0]), includes(snapshot row)',
    `${store.list.includes(store.list[0])}, ${store.list.includes(snapshot(store).list[0])}`,
  );
  out('includes(raw, 1) (from index 1)', store.list.includes(raw, 1));
  out('includes({id: 1}) (an equal stranger)', store.list.includes({id: 1}));
  out(
    'nums: includes(NaN), indexOf(NaN), indexOf(1), lastIndexOf(1)',
    `${store.nums.includes(Number.NaN)}, ${store.nums.indexOf(Number.NaN)}, ${store.nums.indexOf(1)}, ${store.nums.lastIndexOf(1)}`,
  );
  out(
    'findIndex((x) => x === raw) (a callback sees proxies)',
    store.list.findIndex((x) => x === raw),
  );
  const inner = createClassyStore({id: 9});
  const around = createClassyStore({list: [inner]});
  out(
    'list built around a proxy: includes(proxy)',
    around.list.includes(inner),
  );
}

section(`${variant}: finding 10, what the raw object holds`);
{
  const raw = {id: 1};
  const store = createClassyStore({list: [raw]});
  const rawTo: {row?: {id: number}} = {};
  const to = createClassyStore(rawTo);
  to.row = store.list[0];
  out('raw target holds the raw row after to.row = list[0]', rawTo.row === raw);
  out('to.row === list[0] (one proxy for the row)', to.row === store.list[0]);
  out(
    'a write through list[0] notifies the second owner',
    syncCalls(to, () => {
      store.list[0].id = 2;
    }),
  );
  const rawList = [{id: 1}, {id: 2}, {id: 3}];
  const listStore = createClassyStore({list: rawList});
  const proxies = [...listStore.list];
  listStore.list.reverse();
  out(
    'raw list holds no proxy after reverse()',
    rawList.every((row) => !proxies.includes(row)),
  );
  listStore.list.sort((a, b) => a.id - b.id);
  out(
    'raw list holds no proxy after sort()',
    rawList.every((row) => !proxies.includes(row)),
  );
  listStore.list.push(listStore.list[0]);
  out(
    'raw list holds no proxy after push(list[0])',
    rawList.every((row) => !proxies.includes(row)),
  );
  out(
    'snapshot after reverse, sort, push',
    JSON.stringify(snapshot(listStore).list),
  );
  const rawSelf: {self?: unknown; n: number} = {n: 1};
  const self = createClassyStore(rawSelf);
  self.self = self;
  out('store.self = store: raw.self === raw', rawSelf.self === rawSelf);
  out('store.self === store', self.self === self);
}

section(
  `${variant}: finding 9, a store placed in another store by its raw object`,
);
{
  class Inner {
    n = 0;
    inc() {
      this.n++;
    }
  }
  const raw = new Inner();
  const inner = createClassyStore(raw);
  const outer = createClassyStore({
    inner: raw,
    later: undefined as Inner | undefined,
  });
  out('at creation: outer.inner === inner', outer.inner === inner);
  let innerCalls = 0;
  const outerCalls = syncCalls(outer, () => {
    innerCalls = syncCalls(inner, () => outer.inner.inc());
  });
  out(
    'calls after outer.inner.inc(): outer, inner',
    `${outerCalls}, ${innerCalls}`,
  );
  out('snapshot(outer).inner.n', snapshot(outer).inner.n);
  outer.later = raw;
  out('by assignment: outer.later === inner', outer.later === inner);
  out(
    'calls after outer.later.inc(): outer',
    syncCalls(outer, () => outer.later?.inc()),
  );
  class Plain {
    n = 0;
  }
  const never = new Plain();
  const holder = createClassyStore({never});
  out('a class instance that is not a store stays raw', holder.never === never);
}

section(`${variant}: the same value in another form is no change`);
{
  const rawChild = {n: 1};
  const store = createClassyStore({child: rawChild});
  out(
    'store.child = store.child: sync calls',
    syncCalls(store, () => {
      store.child = store.child;
    }),
  );
  out(
    'store.child = rawChild: sync calls',
    syncCalls(store, () => {
      store.child = rawChild;
    }),
  );
  const p = createClassyStore({n: 1});
  const rawHolder = {p};
  const holder = createClassyStore(rawHolder);
  out('created around a proxy: holder.p === p', holder.p === p);
  out(
    'holder.p = p: sync calls',
    syncCalls(holder, () => {
      holder.p = p;
    }),
  );
  out('the raw holder still holds what it was given', rawHolder.p === p);
}

section(`${variant}: places that must keep the form they were given`);
{
  const p = createClassyStore({n: 1});
  const frozen = Object.freeze({inner: p});
  const store = createClassyStore({frozen});
  out(
    'a frozen container keeps the proxy: store.frozen.inner === p',
    store.frozen.inner === p,
  );
  const snap = snapshot(p);
  const keeps = createClassyStore({snap: undefined as unknown});
  keeps.snap = snap;
  out(
    'a snapshot assigned into a store is kept: keeps.snap === snap',
    keeps.snap === snap,
  );
  const set = createClassyStore({set: reactiveSet<object>()});
  const row = {id: 1};
  const rowHolder = createClassyStore({row});
  set.set.add(rowHolder.row);
  set.set.add(row);
  out('reactiveSet: add(proxy) then add(raw): size', set.set.size);
  out(
    'reactiveSet([raw, proxy]).size (finding 34)',
    attempt(() => reactiveSet<object>([row, rowHolder.row]).size),
  );
}

section(`${variant}: a list built from proxies and then assigned`);
{
  const first = {id: 1};
  const store = createClassyStore({items: [first, {id: 2}]});
  const proxy = store.items[0];
  const next = store.items.filter(() => true);
  store.items = next;
  out(
    'the assigned array still holds the proxies it was built from',
    next[0] === proxy,
  );
  out(
    'items.includes(raw), includes(proxy), indexOf(raw)',
    `${store.items.includes(first)}, ${store.items.includes(proxy)}, ${store.items.indexOf(first)}`,
  );
  out(
    'a write through next[0] after the assignment notifies',
    syncCalls(store, () => {
      next[0].id = 10;
    }),
  );
}
```

Before:

```text
# before: finding 7, searches on a list
includes(raw), indexOf(raw), lastIndexOf(raw)                      false, -1, -1
includes(list[0]), includes(snapshot row)                          true, false
includes(raw, 1) (from index 1)                                    false
includes({id: 1}) (an equal stranger)                              false
nums: includes(NaN), indexOf(NaN), indexOf(1), lastIndexOf(1)      true, -1, 0, 3
findIndex((x) => x === raw) (a callback sees proxies)              -1
list built around a proxy: includes(proxy)                         true

# before: finding 10, what the raw object holds
raw target holds the raw row after to.row = list[0]                false
to.row === list[0] (one proxy for the row)                         true
a write through list[0] notifies the second owner                  1
raw list holds no proxy after reverse()                            false
raw list holds no proxy after sort()                               false
raw list holds no proxy after push(list[0])                        false
snapshot after reverse, sort, push                                 [{"id":1},{"id":2},{"id":3},{"id":1}]
store.self = store: raw.self === raw                               false
store.self === store                                               true

# before: finding 9, a store placed in another store by its raw object
at creation: outer.inner === inner                                 false
calls after outer.inner.inc(): outer, inner                        0, 0
snapshot(outer).inner.n                                            1
by assignment: outer.later === inner                               false
calls after outer.later.inc(): outer                               0
a class instance that is not a store stays raw                     true

# before: the same value in another form is no change
store.child = store.child: sync calls                              0
store.child = rawChild: sync calls                                 0
created around a proxy: holder.p === p                             true
holder.p = p: sync calls                                           0
the raw holder still holds what it was given                       true

# before: places that must keep the form they were given
a frozen container keeps the proxy: store.frozen.inner === p       true
a snapshot assigned into a store is kept: keeps.snap === snap      true
reactiveSet: add(proxy) then add(raw): size                        1
reactiveSet([raw, proxy]).size (finding 34)                        2

# before: a list built from proxies and then assigned
the assigned array still holds the proxies it was built from       true
items.includes(raw), includes(proxy), indexOf(raw)                 false, true, -1
a write through next[0] after the assignment notifies              1
```

After:

```text
# after: finding 7, searches on a list
includes(raw), indexOf(raw), lastIndexOf(raw)                      true, 0, 0
includes(list[0]), includes(snapshot row)                          true, true
includes(raw, 1) (from index 1)                                    false
includes({id: 1}) (an equal stranger)                              false
nums: includes(NaN), indexOf(NaN), indexOf(1), lastIndexOf(1)      true, -1, 0, 3
findIndex((x) => x === raw) (a callback sees proxies)              -1
list built around a proxy: includes(proxy)                         true

# after: finding 10, what the raw object holds
raw target holds the raw row after to.row = list[0]                true
to.row === list[0] (one proxy for the row)                         true
a write through list[0] notifies the second owner                  1
raw list holds no proxy after reverse()                            true
raw list holds no proxy after sort()                               true
raw list holds no proxy after push(list[0])                        true
snapshot after reverse, sort, push                                 [{"id":1},{"id":2},{"id":3},{"id":1}]
store.self = store: raw.self === raw                               true
store.self === store                                               true

# after: finding 9, a store placed in another store by its raw object
at creation: outer.inner === inner                                 true
calls after outer.inner.inc(): outer, inner                        1, 1
snapshot(outer).inner.n                                            1
by assignment: outer.later === inner                               true
calls after outer.later.inc(): outer                               1
a class instance that is not a store stays raw                     true

# after: the same value in another form is no change
store.child = store.child: sync calls                              0
store.child = rawChild: sync calls                                 0
created around a proxy: holder.p === p                             true
holder.p = p: sync calls                                           0
the raw holder still holds what it was given                       true

# after: places that must keep the form they were given
a frozen container keeps the proxy: store.frozen.inner === p       true
a snapshot assigned into a store is kept: keeps.snap === snap      true
reactiveSet: add(proxy) then add(raw): size                        1
reactiveSet([raw, proxy]).size (finding 34)                        2

# after: a list built from proxies and then assigned
the assigned array still holds the proxies it was built from       true
items.includes(raw), includes(proxy), indexOf(raw)                 true, true, 0
a write through next[0] after the assignment notifies              1
```

### `t2-extra.ts`

T2: read-only places, and the cost of an opaque read.

```ts
import {attempt, createClassyStore, out, section, variant} from './lib';

section(
  `${variant}: read-only and frozen places that hold a store's raw object`,
);
{
  class Inner {
    n = 0;
  }
  const raw = new Inner();
  const inner = createClassyStore(raw);
  const host: {inner?: Inner} = {};
  Object.defineProperty(host, 'inner', {
    value: raw,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  const outer = createClassyStore(host);
  out(
    "read-only property holding a store's raw object reads",
    attempt(() =>
      outer.inner === raw
        ? 'the raw object'
        : outer.inner === inner
          ? 'the store'
          : 'something else',
    ),
  );
  const frozenRaw = Object.freeze({n: 1});
  createClassyStore(frozenRaw);
  const holder = createClassyStore({frozenRaw});
  out(
    'a frozen store root held by another store reads',
    attempt(() =>
      holder.frozenRaw === frozenRaw ? 'the raw object' : 'a proxy',
    ),
  );
}

section(`${variant}: cost of reading an opaque value`);
{
  class Opaque {
    n = 1;
  }
  const store = createClassyStore({
    date: new Date(0),
    thing: new Opaque(),
    count: 1,
  });
  const time = (run: () => number) => {
    let best = Infinity;
    for (let round = 0; round < 7; round++) {
      const start = performance.now();
      run();
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  const N = 2_000_000;
  const date = time(() => {
    let sum = 0;
    for (let index = 0; index < N; index++) sum += store.date === null ? 0 : 1;
    return sum;
  });
  const thing = time(() => {
    let sum = 0;
    for (let index = 0; index < N; index++) sum += store.thing.n;
    return sum;
  });
  const count = time(() => {
    let sum = 0;
    for (let index = 0; index < N; index++) sum += store.count;
    return sum;
  });
  out(
    'ns per read: Date field, unmarked class instance, number',
    `${((date / N) * 1e6).toFixed(1)}, ${((thing / N) * 1e6).toFixed(1)}, ${((count / N) * 1e6).toFixed(1)}`,
  );
}
```

Before:

```text
# before: read-only and frozen places that hold a store's raw object
read-only property holding a store's raw object reads              the raw object
a frozen store root held by another store reads                    the raw object

# before: cost of reading an opaque value
ns per read: Date field, unmarked class instance, number           36.2, 37.2, 29.7
```

After:

```text
# after: read-only and frozen places that hold a store's raw object
read-only property holding a store's raw object reads              the raw object
a frozen store root held by another store reads                    the raw object

# after: cost of reading an opaque value
ns per read: Date field, unmarked class instance, number           38.0, 37.1, 29.7
```

### `t3.ts`

T3.

```ts
// T3: Object.defineProperty through a store, freezing, and the prototype.
import {
  attempt,
  createClassyStore,
  out,
  section,
  snapshot,
  subscribe,
  syncCalls,
  variant,
} from './lib';

const data = (value: unknown) => ({
  value,
  writable: true,
  enumerable: true,
  configurable: true,
});

section(`${variant}: finding 1, define a new data property`);
{
  const store = createClassyStore<Record<string, unknown>>({a: 1});
  snapshot(store);
  const calls = syncCalls(store, () =>
    Object.defineProperty(store, 'b', data(2)),
  );
  out(
    'store.b, sync calls, snapshot has b',
    `${store.b}, ${calls}, ${'b' in snapshot(store)}`,
  );
  out(
    'the same definition again: sync calls',
    syncCalls(store, () => Object.defineProperty(store, 'b', data(2))),
  );
}

section(`${variant}: finding 45, redefine a property that holds an object`);
{
  const other = {n: 2};
  const s = createClassyStore<{child: {n: number} | number}>({child: {n: 1}});
  s.child;
  Object.defineProperty(s, 'child', data(other));
  out('s.child.n after redefining to {n: 2}', (s.child as {n: number}).n);
  out('snapshot(s).child.n', (snapshot(s).child as {n: number}).n);
  out(
    'a later s.child = other: sync calls',
    syncCalls(s, () => {
      s.child = other;
    }),
  );
  Object.defineProperty(s, 'child', data(7));
  out('s.child after redefining to 7', JSON.stringify(s.child));
  const list = createClassyStore({rows: [{id: 1}, {id: 2}, {id: 3}]});
  const third = list.rows[2];
  Object.defineProperty(list.rows, 'length', {value: 1});
  out(
    'rows.length after defining length 1, rows[2]',
    `${list.rows.length}, ${JSON.stringify(list.rows[2])}`,
  );
  out('snapshot rows', JSON.stringify(snapshot(list).rows));
  out(
    'a write to the removed row notifies the list: sync calls',
    syncCalls(list, () => {
      third.id = 30;
    }),
  );
}

section(`${variant}: finding 71, an array element redefined to a primitive`);
{
  const store = createClassyStore<{rows: unknown[]}>({rows: [{id: 1}]});
  store.rows[0];
  Object.defineProperty(store.rows, 0, data(7));
  out(
    'store.rows[0], snapshot(store).rows[0]',
    `${JSON.stringify(store.rows[0])}, ${JSON.stringify(snapshot(store).rows[0])}`,
  );
}

section(`${variant}: other descriptors`);
{
  const s = createClassyStore<Record<string, unknown>>({n: 1, child: {x: 1}});
  out(
    '{value: 3} only, on a new key',
    attempt(() => {
      const calls = syncCalls(s, () =>
        Object.defineProperty(s, 'c', {value: 3}),
      );
      const d = Object.getOwnPropertyDescriptor(s, 'c');
      return `value ${s.c}, writable ${d?.writable}, enumerable ${d?.enumerable}, sync calls ${calls}`;
    }),
  );
  out(
    '{value: 5} only, on an existing key',
    attempt(() => {
      const calls = syncCalls(s, () =>
        Object.defineProperty(s, 'n', {value: 5}),
      );
      return `value ${s.n}, snapshot ${snapshot(s).n}, sync calls ${calls}`;
    }),
  );
  out(
    'hidden: {value, writable: true, enumerable: false, configurable: true}',
    attempt(() => {
      const calls = syncCalls(s, () =>
        Object.defineProperty(s, 'hidden', {
          value: 1,
          writable: true,
          enumerable: false,
          configurable: true,
        }),
      );
      return `value ${s.hidden}, in keys ${Object.keys(snapshot(s)).includes('hidden')}, snapshot value ${snapshot(s).hidden}, sync calls ${calls}`;
    }),
  );
  out(
    'an accessor on a new key',
    attempt(() => {
      const calls = syncCalls(s, () =>
        Object.defineProperty(s, 'double', {
          get(this: {n: number}) {
            return this.n * 2;
          },
          enumerable: true,
          configurable: true,
        }),
      );
      return `value ${s.double}, snapshot ${snapshot(s).double}, sync calls ${calls}`;
    }),
  );
  out(
    'an accessor over a field that holds an object',
    attempt(() => {
      s.child;
      const calls = syncCalls(s, () =>
        Object.defineProperty(s, 'child', {
          get: () => 5,
          enumerable: true,
          configurable: true,
        }),
      );
      return `value ${JSON.stringify(s.child)}, snapshot ${JSON.stringify(snapshot(s).child)}, sync calls ${calls}`;
    }),
  );
  const r = createClassyStore<Record<string, unknown>>({
    config: {deep: {x: 1}},
  });
  out(
    'read-only: {writable: false, configurable: false} on a field',
    attempt(() => {
      const rawConfig = (snapshot(r), r.config);
      const calls = syncCalls(r, () =>
        Object.defineProperty(r, 'config', {
          writable: false,
          configurable: false,
        }),
      );
      return `reads ${JSON.stringify(r.config)}, still a proxy ${r.config === rawConfig}, sync calls ${calls}`;
    }),
  );
}

section(`${variant}: freezing, sealing and the prototype`);
{
  const f = createClassyStore({n: 1, child: {x: 1}});
  out(
    'Object.freeze(store)',
    attempt(() => {
      const calls = syncCalls(f, () => Object.freeze(f));
      return `frozen ${Object.isFrozen(f)}, child.x ${f.child.x}, sync calls ${calls}, snapshot ${JSON.stringify(snapshot(f))}`;
    }),
  );
  out('target left extensible after the attempt', Object.isExtensible(f));
  const nested = createClassyStore({config: {deep: {x: 1}}, n: 0});
  out(
    'Object.freeze(store.config)',
    attempt(() => {
      Object.freeze(nested.config);
      return `frozen ${Object.isFrozen(nested.config)}, deep.x ${nested.config.deep.x}`;
    }),
  );
  const sealed = createClassyStore({n: 1});
  out(
    'Object.seal(store), then a write',
    attempt(() => {
      Object.seal(sealed);
      sealed.n = 2;
      return `sealed ${Object.isSealed(sealed)}, n ${sealed.n}, snapshot n ${snapshot(sealed).n}`;
    }),
  );
  const fixed = createClassyStore({n: 1});
  out(
    'Object.preventExtensions(store), then a write',
    attempt(() => {
      Object.preventExtensions(fixed);
      fixed.n = 2;
      return `extensible ${Object.isExtensible(fixed)}, n ${fixed.n}`;
    }),
  );
  class A {
    n = 1;
    get kind() {
      return 'a';
    }
  }
  class B {
    get kind() {
      return 'b';
    }
  }
  const p = createClassyStore(new A());
  p.kind;
  out(
    'Object.setPrototypeOf(store, B.prototype): kind',
    attempt(() => {
      Object.setPrototypeOf(p, B.prototype);
      return p.kind;
    }),
  );
  const q = createClassyStore<Record<string, unknown>>({n: 1});
  out(
    'Object.assign(store, JSON.parse(\'{"__proto__": {"polluted": 1}}\'))',
    attempt(() => {
      Object.assign(q, JSON.parse('{"__proto__": {"polluted": 1}}'));
      return `polluted ${q.polluted}, prototype swapped ${Object.getPrototypeOf(q) !== Object.prototype}`;
    }),
  );
}

section(
  `${variant}: findings 61 and 67, freezing a container that left the store`,
);
{
  const make = () => {
    const leaf = {x: 1};
    return createClassyStore<{
      outer?: {inner: {leaf: {x: number}}};
      pinned: {x: number};
    }>({outer: {inner: {leaf}}, pinned: leaf});
  };
  out(
    'first and second snapshot of inner after the freeze',
    attempt(() => {
      const store = make();
      const outer = store.outer as {inner: {leaf: {x: number}}};
      const inner = outer.inner;
      snapshot(inner);
      delete store.outer;
      store.pinned.x = 2;
      Object.freeze(outer);
      return `${JSON.stringify(snapshot(inner))}, ${JSON.stringify(snapshot(inner))}`;
    }),
  );
  out(
    'a subscriber added right after the freeze hears a write',
    attempt(() => {
      const store = make();
      const outer = store.outer as {inner: {leaf: {x: number}}};
      const inner = outer.inner;
      delete store.outer;
      Object.freeze(outer);
      let calls = 0;
      subscribe(inner, () => calls++, {sync: true});
      store.pinned.x = 2;
      return calls;
    }),
  );
}

section(`${variant}: finding 66, the read that never returns`);
{
  const child = Bun.spawnSync(
    ['bun', `${import.meta.dir}/t3-hang.ts`, variant],
    {timeout: 8000},
  );
  out(
    'child process',
    child.exitCode === 0
      ? child.stdout.toString().trim()
      : `killed after 8 s (exit ${child.exitCode}, signal ${child.signalCode}); printed "${child.stdout.toString().trim()}"`,
  );
}

section(`${variant}: a base class whose constructor returns the store`);
{
  class Base {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the case under test
      return createClassyStore(this);
    }
  }
  class Todos extends Base {
    items: string[] = [];
    count = 0;
    add = (text: string) => {
      this.items.push(text);
      this.count++;
    };
  }
  const todos = new Todos();
  out(
    'snapshot(todos).items is frozen before any read',
    Object.isFrozen(snapshot(todos).items),
  );
  out(
    'sync calls for the arrow method add()',
    syncCalls(todos, () => todos.add('x')),
  );
  out('snapshot after add()', JSON.stringify(snapshot(todos)));
}
```

Before:

```text
# before: finding 1, define a new data property
store.b, sync calls, snapshot has b                                2, 0, false
the same definition again: sync calls                              0

# before: finding 45, redefine a property that holds an object
s.child.n after redefining to {n: 2}                               1
snapshot(s).child.n                                                1
a later s.child = other: sync calls                                0
s.child after redefining to 7                                      {"n":1}
rows.length after defining length 1, rows[2]                       1, {"id":3}
snapshot rows                                                      [{"id":1}]
a write to the removed row notifies the list: sync calls           1

# before: finding 71, an array element redefined to a primitive
store.rows[0], snapshot(store).rows[0]                             {"id":1}, 7

# before: other descriptors
{value: 3} only, on a new key                                      value 3, writable false, enumerable false, sync calls 0
{value: 5} only, on an existing key                                value 5, snapshot 5, sync calls 0
hidden: {value, writable: true, enumerable: false, configurable: true} value 1, in keys false, snapshot value undefined, sync calls 0
an accessor on a new key                                           value 10, snapshot undefined, sync calls 0
an accessor over a field that holds an object                      value 5, snapshot {"x":1}, sync calls 0
read-only: {writable: false, configurable: false} on a field       reads {"deep":{"x":1}}, still a proxy false, sync calls 0

# before: freezing, sealing and the prototype
Object.freeze(store)                                               frozen true, child.x 1, sync calls 0, snapshot {"n":1,"child":{"x":1}}
target left extensible after the attempt                           false
Object.freeze(store.config)                                        frozen true, deep.x 1
Object.seal(store), then a write                                   sealed true, n 2, snapshot n 2
Object.preventExtensions(store), then a write                      extensible false, n 2
Object.setPrototypeOf(store, B.prototype): kind                    a
Object.assign(store, JSON.parse('{"__proto__": {"polluted": 1}}')) polluted 1, prototype swapped true

# before: findings 61 and 67, freezing a container that left the store
first and second snapshot of inner after the freeze                {"leaf":{"x":1}}, {"leaf":{"x":2}}
a subscriber added right after the freeze hears a write            0

# before: finding 66, the read that never returns
child process                                                      killed after 8 s (exit null, signal SIGTERM); printed ""

# before: a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    false
sync calls for the arrow method add()                              1
snapshot after add()                                               {"items":["x"],"count":1}
```

After, (a):

```text
# after: finding 1, define a new data property
store.b, sync calls, snapshot has b                                2, 1, true
the same definition again: sync calls                              0

# after: finding 45, redefine a property that holds an object
s.child.n after redefining to {n: 2}                               2
snapshot(s).child.n                                                2
a later s.child = other: sync calls                                0
s.child after redefining to 7                                      7
rows.length after defining length 1, rows[2]                       1, undefined
snapshot rows                                                      [{"id":1}]
a write to the removed row notifies the list: sync calls           0

# after: finding 71, an array element redefined to a primitive
store.rows[0], snapshot(store).rows[0]                             7, 7

# after: other descriptors
{value: 3} only, on a new key                                      value 3, writable false, enumerable false, sync calls 1
{value: 5} only, on an existing key                                value 5, snapshot 5, sync calls 1
hidden: {value, writable: true, enumerable: false, configurable: true} value 1, in keys false, snapshot value 1, sync calls 1
an accessor on a new key                                           value 10, snapshot 10, sync calls 1
an accessor over a field that holds an object                      value 5, snapshot 5, sync calls 1
read-only: {writable: false, configurable: false} on a field       reads {"deep":{"x":1}}, still a proxy false, sync calls 0

# after: freezing, sealing and the prototype
Object.freeze(store)                                               frozen true, child.x 1, sync calls 0, snapshot {"n":1,"child":{"x":1}}
target left extensible after the attempt                           false
Object.freeze(store.config)                                        frozen true, deep.x 1
Object.seal(store), then a write                                   sealed true, n 2, snapshot n 2
Object.preventExtensions(store), then a write                      extensible false, n 2
Object.setPrototypeOf(store, B.prototype): kind                    a
Object.assign(store, JSON.parse('{"__proto__": {"polluted": 1}}')) polluted 1, prototype swapped true

# after: findings 61 and 67, freezing a container that left the store
first and second snapshot of inner after the freeze                {"leaf":{"x":2}}, {"leaf":{"x":2}}
a subscriber added right after the freeze hears a write            1

# after: finding 66, the read that never returns
child process                                                      inner.x returned 1

# after: a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    true
sync calls for the arrow method add()                              1
snapshot after add()                                               {"items":["x"],"count":1}
```

After, (b):

```text
# after: finding 1, define a new data property
store.b, sync calls, snapshot has b                                2, 1, true
the same definition again: sync calls                              0

# after: finding 45, redefine a property that holds an object
s.child.n after redefining to {n: 2}                               2
snapshot(s).child.n                                                2
a later s.child = other: sync calls                                0
s.child after redefining to 7                                      7
rows.length after defining length 1, rows[2]                       1, undefined
snapshot rows                                                      [{"id":1}]
a write to the removed row notifies the list: sync calls           0

# after: finding 71, an array element redefined to a primitive
store.rows[0], snapshot(store).rows[0]                             7, 7

# after: other descriptors
{value: 3} only, on a new key                                      throws Error: @codebelt/classy-store: cannot define "c" on a store as read-only. Pass writable: true, or
{value: 5} only, on an existing key                                value 5, snapshot 5, sync calls 1
hidden: {value, writable: true, enumerable: false, configurable: true} value 1, in keys false, snapshot value 1, sync calls 1
an accessor on a new key                                           throws Error: @codebelt/classy-store: cannot define the accessor "double" on a store. Define it on the c
an accessor over a field that holds an object                      throws Error: @codebelt/classy-store: cannot define the accessor "child" on a store. Define it on the cl
read-only: {writable: false, configurable: false} on a field       reads {"deep":{"x":1}}, still a proxy false, sync calls 0

# after: freezing, sealing and the prototype
Object.freeze(store)                                               frozen true, child.x 1, sync calls 0, snapshot {"n":1,"child":{"x":1}}
target left extensible after the attempt                           false
Object.freeze(store.config)                                        frozen true, deep.x 1
Object.seal(store), then a write                                   sealed true, n 2, snapshot n 2
Object.preventExtensions(store), then a write                      extensible false, n 2
Object.setPrototypeOf(store, B.prototype): kind                    throws Error: @codebelt/classy-store: the prototype of a store cannot be changed
Object.assign(store, JSON.parse('{"__proto__": {"polluted": 1}}')) throws Error: @codebelt/classy-store: the prototype of a store cannot be changed

# after: findings 61 and 67, freezing a container that left the store
first and second snapshot of inner after the freeze                {"leaf":{"x":2}}, {"leaf":{"x":2}}
a subscriber added right after the freeze hears a write            1

# after: finding 66, the read that never returns
child process                                                      inner.x returned 1

# after: a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    true
sync calls for the arrow method add()                              1
snapshot after add()                                               {"items":["x"],"count":1}
```

After, (c):

```text
# after: finding 1, define a new data property
store.b, sync calls, snapshot has b                                2, 1, true
the same definition again: sync calls                              0

# after: finding 45, redefine a property that holds an object
s.child.n after redefining to {n: 2}                               2
snapshot(s).child.n                                                2
a later s.child = other: sync calls                                0
s.child after redefining to 7                                      7
rows.length after defining length 1, rows[2]                       1, undefined
snapshot rows                                                      [{"id":1}]
a write to the removed row notifies the list: sync calls           0

# after: finding 71, an array element redefined to a primitive
store.rows[0], snapshot(store).rows[0]                             7, 7

# after: other descriptors
{value: 3} only, on a new key                                      throws Error: @codebelt/classy-store: cannot define "c" on a store as read-only. Pass writable: true, or
{value: 5} only, on an existing key                                value 5, snapshot 5, sync calls 1
hidden: {value, writable: true, enumerable: false, configurable: true} value 1, in keys false, snapshot value 1, sync calls 1
an accessor on a new key                                           throws Error: @codebelt/classy-store: cannot define the accessor "double" on a store. Define it on the c
an accessor over a field that holds an object                      throws Error: @codebelt/classy-store: cannot define the accessor "child" on a store. Define it on the cl
read-only: {writable: false, configurable: false} on a field       throws Error: @codebelt/classy-store: cannot define "config" on a store as read-only. Pass writable: tru

# after: freezing, sealing and the prototype
Object.freeze(store)                                               throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 
target left extensible after the attempt                           true
Object.freeze(store.config)                                        throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 
Object.seal(store), then a write                                   throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 
Object.preventExtensions(store), then a write                      throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 
Object.setPrototypeOf(store, B.prototype): kind                    throws Error: @codebelt/classy-store: the prototype of a store cannot be changed
Object.assign(store, JSON.parse('{"__proto__": {"polluted": 1}}')) throws Error: @codebelt/classy-store: the prototype of a store cannot be changed

# after: findings 61 and 67, freezing a container that left the store
first and second snapshot of inner after the freeze                throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 
a subscriber added right after the freeze hears a write            throws Error: @codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a 

# after: finding 66, the read that never returns
child process                                                      the definition throws Error: @codebelt/classy-store: cannot define "inner" on a store as read-only.;
inner.x returned 1

# after: a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    true
sync calls for the arrow method add()                              1
snapshot after add()                                               {"items":["x"],"count":1}
```

### `t3-hang.ts`

T3: the read that never returns, run as a child process by `t3.ts`.

```ts
import {createClassyStore, snapshot, subscribe} from './lib';

const store = createClassyStore<{outer?: {inner: {x: number; back?: unknown}}}>(
  {outer: {inner: {x: 1}}},
);
const outer = store.outer as {inner: {x: number; back?: unknown}};
const inner = outer.inner;
delete store.outer;
try {
  Object.defineProperty(outer, 'inner', {writable: false, configurable: false});
} catch (error) {
  console.log(
    `the definition throws ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 70)};`,
  );
}
snapshot(inner);
snapshot(inner);
inner.back = outer;
subscribe(inner, () => {})();
console.log(`inner.x returned ${inner.x}`);
```

### `t4.ts`

T4.

```ts
// T4: `in` and key enumeration inside a getter, on the store and on a snapshot.
import {
  attempt,
  createClassyStore,
  out,
  section,
  snapshot,
  variant,
} from './lib';

let runs: Record<string, number> = {};
const ran = (name: string) => {
  runs[name] = (runs[name] ?? 0) + 1;
};
class Dict {
  [key: string]: unknown;
  a = 1;
  b = 2;
  get keyCount() {
    ran('keyCount');
    return Object.keys(this).length;
  }
  get hasB() {
    ran('hasB');
    return 'b' in this;
  }
  get isDict() {
    return this instanceof Dict;
  }
  get missing() {
    ran('missing');
    return {value: this.nope};
  }
  get ownsB() {
    ran('ownsB');
    return Object.hasOwn(this, 'b');
  }
  get self() {
    return this;
  }
}
const read = (from: Dict) =>
  `keyCount=${attempt(() => from.keyCount)} hasB=${from.hasB} ownsB=${from.ownsB} isDict=${from.isDict}`;

section(`${variant}: findings 30, 31 and 41`);
{
  const store = createClassyStore(new Dict());
  out('start, live', read(store));
  out('start, snapshot', read(snapshot(store)));
  runs = {};
  store.a = 10;
  out('after store.a = 10, live', read(store));
  out('after store.a = 10, snapshot', read(snapshot(store)));
  out('getter runs for a value write (live + snapshot)', runs);
  runs = {};
  delete store.b;
  out('after delete store.b, live', read(store));
  out('after delete store.b, snapshot', read(snapshot(store)));
  store.c = 3;
  store.b = 5;
  out('after adding c and b, live', read(store));
  out('after adding c and b, snapshot', read(snapshot(store)));
  out('getter runs for one delete and two additions', runs);
  out(
    'snapshot: getter that returns this === the snapshot',
    snapshot(store).self === snapshot(store),
  );
  out('live: Reflect.ownKeys(store)', Reflect.ownKeys(store).join(','));
  out(
    'snapshot: Object.keys(snapshot)',
    Object.keys(snapshot(store)).join(','),
  );
}

section(`${variant}: a getter that lists the entries of this`);
{
  class Bag {
    a = 1;
    b = 2;
    get entryCount() {
      return Object.entries(this).length;
    }
    get ownCount() {
      return Reflect.ownKeys(this).length;
    }
    get forIn() {
      let count = 0;
      for (const _key in this) count++;
      return count;
    }
    get spread() {
      return Object.keys({...this}).join(',');
    }
    get described() {
      return Object.getOwnPropertyDescriptor(this, 'a')?.value;
    }
  }
  const store = createClassyStore(new Bag());
  const each = (from: Bag) =>
    `entries ${attempt(() => from.entryCount)}, ownKeys ${attempt(() => from.ownCount)}, for-in ${attempt(() => from.forIn)}, spread ${attempt(() => from.spread)}, descriptor ${attempt(() => from.described)}`;
  out('live', each(store));
  out('snapshot', each(snapshot(store)));
  const literal = createClassyStore({
    a: 1,
    get keyCount(): number {
      return Object.keys(this).length;
    },
  });
  out(
    'object-literal getter, live: keyCount',
    attempt(() => literal.keyCount),
  );
  out(
    'object-literal getter, snapshot: keyCount',
    attempt(() => snapshot(literal).keyCount),
  );
}

section(
  `${variant}: finding 32, a getter that reads a property which does not exist`,
);
{
  const store = createClassyStore(new Dict());
  runs = {};
  const first = store.missing;
  const second = store.missing;
  out(
    'two reads: same object, getter runs',
    `${first === second}, ${runs.missing}`,
  );
  store.nope = 7;
  out(
    'after store.nope = 7: value, runs',
    `${(store.missing as {value: unknown}).value}, ${runs.missing}`,
  );
  delete store.nope;
  out(
    'after delete store.nope: value, runs',
    `${(store.missing as {value: unknown}).value}, ${runs.missing}`,
  );
  store.a = 99;
  store.missing;
  out('after an unrelated write: runs', runs.missing);
}

section(`${variant}: keys of a list, and length`);
{
  class Lists {
    list = [1, 2, 3];
    get listKeys() {
      ran('listKeys');
      return Object.keys(this.list).length;
    }
  }
  const store = createClassyStore(new Lists());
  runs = {};
  out('Object.keys(this.list).length', store.listKeys);
  store.list.length = 1;
  out('after list.length = 1', store.listKeys);
  store.list.push(4, 5);
  out('after push(4, 5)', store.listKeys);
  store.list[0] = 9;
  out(
    'after list[0] = 9 (same keys): value, runs',
    `${store.listKeys}, ${runs.listKeys}`,
  );
}

section(`${variant}: Object.defineProperty and the set of keys`);
{
  const store = createClassyStore(new Dict());
  out('keyCount', store.keyCount);
  Object.defineProperty(store, 'z', {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  out('keyCount after defining z', store.keyCount);
}
```

Before:

```text
# before: findings 30, 31 and 41
start, live                                                        keyCount=2 hasB=true ownsB=true isDict=true
start, snapshot                                                    keyCount=0 hasB=false ownsB=false isDict=false
after store.a = 10, live                                           keyCount=2 hasB=true ownsB=true isDict=true
after store.a = 10, snapshot                                       keyCount=0 hasB=false ownsB=false isDict=false
getter runs for a value write (live + snapshot)                    {}
after delete store.b, live                                         keyCount=2 hasB=true ownsB=true isDict=true
after delete store.b, snapshot                                     keyCount=0 hasB=false ownsB=false isDict=false
after adding c and b, live                                         keyCount=2 hasB=true ownsB=true isDict=true
after adding c and b, snapshot                                     keyCount=0 hasB=false ownsB=false isDict=false
getter runs for one delete and two additions                       {}
snapshot: getter that returns this === the snapshot                false
live: Reflect.ownKeys(store)                                       a,c,b
snapshot: Object.keys(snapshot)                                    a,c,b,keyCount,hasB,isDict,missing,ownsB,self

# before: a getter that lists the entries of this
live                                                               entries 2, ownKeys 2, for-in 2, spread a,b, descriptor 1
snapshot                                                           entries 0, ownKeys 0, for-in 0, spread , descriptor undefined
object-literal getter, live: keyCount                              2
object-literal getter, snapshot: keyCount                          0

# before: finding 32, a getter that reads a property which does not exist
two reads: same object, getter runs                                false, 2
after store.nope = 7: value, runs                                  7, 3
after delete store.nope: value, runs                               undefined, 4
after an unrelated write: runs                                     5

# before: keys of a list, and length
Object.keys(this.list).length                                      3
after list.length = 1                                              1
after push(4, 5)                                                   3
after list[0] = 9 (same keys): value, runs                         3, 4

# before: Object.defineProperty and the set of keys
keyCount                                                           2
keyCount after defining z                                          2
```

After, the live store only:

```text
# after: findings 30, 31 and 41
start, live                                                        keyCount=2 hasB=true ownsB=true isDict=true
start, snapshot                                                    keyCount=0 hasB=false ownsB=false isDict=false
after store.a = 10, live                                           keyCount=2 hasB=true ownsB=true isDict=true
after store.a = 10, snapshot                                       keyCount=0 hasB=false ownsB=false isDict=false
getter runs for a value write (live + snapshot)                    {}
after delete store.b, live                                         keyCount=1 hasB=false ownsB=true isDict=true
after delete store.b, snapshot                                     keyCount=0 hasB=false ownsB=false isDict=false
after adding c and b, live                                         keyCount=3 hasB=true ownsB=true isDict=true
after adding c and b, snapshot                                     keyCount=0 hasB=false ownsB=false isDict=false
getter runs for one delete and two additions                       {"keyCount":2,"hasB":2}
snapshot: getter that returns this === the snapshot                false
live: Reflect.ownKeys(store)                                       a,c,b
snapshot: Object.keys(snapshot)                                    a,c,b,keyCount,hasB,isDict,missing,ownsB,self

# after: a getter that lists the entries of this
live                                                               entries 2, ownKeys 2, for-in 2, spread a,b, descriptor 1
snapshot                                                           entries 0, ownKeys 0, for-in 0, spread , descriptor undefined
object-literal getter, live: keyCount                              2
object-literal getter, snapshot: keyCount                          0

# after: finding 32, a getter that reads a property which does not exist
two reads: same object, getter runs                                true, 1
after store.nope = 7: value, runs                                  7, 2
after delete store.nope: value, runs                               undefined, 3
after an unrelated write: runs                                     3

# after: keys of a list, and length
Object.keys(this.list).length                                      3
after list.length = 1                                              1
after push(4, 5)                                                   3
after list[0] = 9 (same keys): value, runs                         3, 4

# after: Object.defineProperty and the set of keys
keyCount                                                           2
keyCount after defining z                                          3
```

After, with snapshot variant S1:

```text
# after: findings 30, 31 and 41
start, live                                                        keyCount=2 hasB=true ownsB=true isDict=true
start, snapshot                                                    keyCount=8 hasB=true ownsB=true isDict=true
after store.a = 10, live                                           keyCount=2 hasB=true ownsB=true isDict=true
after store.a = 10, snapshot                                       keyCount=8 hasB=true ownsB=true isDict=true
getter runs for a value write (live + snapshot)                    {}
after delete store.b, live                                         keyCount=1 hasB=false ownsB=true isDict=true
after delete store.b, snapshot                                     keyCount=7 hasB=false ownsB=true isDict=true
after adding c and b, live                                         keyCount=3 hasB=true ownsB=true isDict=true
after adding c and b, snapshot                                     keyCount=9 hasB=true ownsB=true isDict=true
getter runs for one delete and two additions                       {"keyCount":4,"hasB":4}
snapshot: getter that returns this === the snapshot                true
live: Reflect.ownKeys(store)                                       a,c,b
snapshot: Object.keys(snapshot)                                    a,c,b,keyCount,hasB,isDict,missing,ownsB,self

# after: a getter that lists the entries of this
live                                                               entries 2, ownKeys 2, for-in 2, spread a,b, descriptor 1
snapshot                                                           entries throws RangeError: Maximum call stack size exceeded., ownKeys 7, for-in 7, spread throws RangeError: Maximum call stack size exceeded., descriptor 1
object-literal getter, live: keyCount                              2
object-literal getter, snapshot: keyCount                          2

# after: finding 32, a getter that reads a property which does not exist
two reads: same object, getter runs                                true, 1
after store.nope = 7: value, runs                                  7, 2
after delete store.nope: value, runs                               undefined, 3
after an unrelated write: runs                                     3

# after: keys of a list, and length
Object.keys(this.list).length                                      3
after list.length = 1                                              1
after push(4, 5)                                                   3
after list[0] = 9 (same keys): value, runs                         3, 4

# after: Object.defineProperty and the set of keys
keyCount                                                           2
keyCount after defining z                                          3
```

After, as recommended (snapshot variant S2):

```text
# after: findings 30, 31 and 41
start, live                                                        keyCount=2 hasB=true ownsB=true isDict=true
start, snapshot                                                    keyCount=2 hasB=true ownsB=true isDict=true
after store.a = 10, live                                           keyCount=2 hasB=true ownsB=true isDict=true
after store.a = 10, snapshot                                       keyCount=2 hasB=true ownsB=true isDict=true
getter runs for a value write (live + snapshot)                    {}
after delete store.b, live                                         keyCount=1 hasB=false ownsB=true isDict=true
after delete store.b, snapshot                                     keyCount=1 hasB=false ownsB=true isDict=true
after adding c and b, live                                         keyCount=3 hasB=true ownsB=true isDict=true
after adding c and b, snapshot                                     keyCount=3 hasB=true ownsB=true isDict=true
getter runs for one delete and two additions                       {"keyCount":4,"hasB":4}
snapshot: getter that returns this === the snapshot                true
live: Reflect.ownKeys(store)                                       a,c,b
snapshot: Object.keys(snapshot)                                    a,c,b,keyCount,hasB,isDict,missing,ownsB,self

# after: a getter that lists the entries of this
live                                                               entries 2, ownKeys 2, for-in 2, spread a,b, descriptor 1
snapshot                                                           entries 2, ownKeys 2, for-in 2, spread a,b, descriptor 1
object-literal getter, live: keyCount                              2
object-literal getter, snapshot: keyCount                          2

# after: finding 32, a getter that reads a property which does not exist
two reads: same object, getter runs                                true, 1
after store.nope = 7: value, runs                                  7, 2
after delete store.nope: value, runs                               undefined, 3
after an unrelated write: runs                                     3

# after: keys of a list, and length
Object.keys(this.list).length                                      3
after list.length = 1                                              1
after push(4, 5)                                                   3
after list[0] = 9 (same keys): value, runs                         3, 4

# after: Object.defineProperty and the set of keys
keyCount                                                           2
keyCount after defining z                                          3
```

### `t5.ts`

T5.

```ts
// T5: a delete that removes nothing.
import {
  createClassyStore,
  out,
  section,
  snapshot,
  syncCalls,
  variant,
} from './lib';

section(`${variant}: finding 29`);
{
  const store = createClassyStore<{
    dict: Record<string, number>;
    list: number[];
  }>({dict: {a: 1}, list: [1, 2]});
  const before = snapshot(store);
  out(
    'delete store.dict.missing: sync calls',
    syncCalls(store, () => {
      delete store.dict.missing;
    }),
  );
  out(
    'delete store.list[5]: sync calls',
    syncCalls(store, () => {
      delete store.list[5];
    }),
  );
  out('same snapshot afterwards', snapshot(store) === before);
  out(
    'delete store.dict.a (present): sync calls',
    syncCalls(store, () => {
      delete store.dict.a;
    }),
  );
  out(
    'delete store.dict.toString (inherited): sync calls, result',
    (() => {
      let result = false;
      const calls = syncCalls(store, () => {
        result = delete (store.dict as Record<string, unknown>).toString;
      });
      return `${calls}, ${result}`;
    })(),
  );
  out(
    'delete store.list[1] (present): sync calls, list',
    `${syncCalls(store, () => {
      delete store.list[1];
    })}, ${JSON.stringify(snapshot(store).list)}`,
  );
}
```

Before:

```text
# before: finding 29
delete store.dict.missing: sync calls                              1
delete store.list[5]: sync calls                                   1
same snapshot afterwards                                           false
delete store.dict.a (present): sync calls                          1
delete store.dict.toString (inherited): sync calls, result         1, true
delete store.list[1] (present): sync calls, list                   1, [1,null]
```

After:

```text
# after: finding 29
delete store.dict.missing: sync calls                              0
delete store.list[5]: sync calls                                   0
same snapshot afterwards                                           true
delete store.dict.a (present): sync calls                          1
delete store.dict.toString (inherited): sync calls, result         0, true
delete store.list[1] (present): sync calls, list                   1, [1,null]
```

### `t6.ts`

T6.

```ts
// T6: a plain object from another realm, and a property frozen behind the store.
import vm from 'node:vm';
import {
  attempt,
  createClassyStore,
  out,
  section,
  snapshot,
  syncCalls,
  variant,
} from './lib';

section(`${variant}: Immer finding 6, a plain object from another realm`);
{
  const foreign = vm.runInNewContext(
    '({n: 1, rows: [{id: 1}], nested: {deep: 1}})',
  ) as {n: number; rows: {id: number}[]; nested: {deep: number}};
  const store = createClassyStore({local: {n: 1}, foreign});
  out(
    'write to a local child: sync calls',
    syncCalls(store, () => {
      store.local.n++;
    }),
  );
  out(
    'write to the foreign child: sync calls',
    syncCalls(store, () => {
      store.foreign.n++;
    }),
  );
  out(
    'write to a row of the foreign list: sync calls',
    syncCalls(store, () => {
      store.foreign.rows[0].id++;
    }),
  );
  out(
    'snapshot frozen: local, foreign, foreign.nested',
    `${Object.isFrozen(snapshot(store).local)}, ${Object.isFrozen(snapshot(store).foreign)}, ${Object.isFrozen(snapshot(store).foreign.nested)}`,
  );
  const ForeignClass = vm.runInNewContext(
    '(class Thing { constructor() { this.n = 1 } })',
  ) as new () => {n: number};
  const withInstance = createClassyStore({thing: new ForeignClass()});
  out(
    'a foreign class instance stays opaque: sync calls on write',
    syncCalls(withInstance, () => {
      withInstance.thing.n++;
    }),
  );
  const foreignDate = vm.runInNewContext('new Date(0)') as Date;
  const foreignMap = vm.runInNewContext('new Map([[1, 2]])') as Map<
    number,
    number
  >;
  const opaque = createClassyStore({date: foreignDate, map: foreignMap});
  out(
    'a foreign Date and Map stay opaque',
    attempt(
      () =>
        `${opaque.date === foreignDate}, ${opaque.map === foreignMap}, ${opaque.map.get(1)}`,
    ),
  );
  const nullProto = Object.assign(Object.create(null), {n: 1}) as {n: number};
  const withNull = createClassyStore({bare: nullProto});
  out(
    'a null-prototype object is still proxied: sync calls on write',
    syncCalls(withNull, () => {
      withNull.bare.n++;
    }),
  );
}

section(`${variant}: finding 46, a property frozen behind the store`);
{
  const raw = {config: {nested: {x: 1}}, n: 0};
  const s = createClassyStore(raw);
  s.config.nested.x;
  Object.freeze(raw.config);
  out(
    's.config.nested after Object.freeze(raw.config)',
    attempt(() => JSON.stringify(s.config.nested)),
  );
  out(
    'snapshot(s).config.nested',
    attempt(() => JSON.stringify(snapshot(s).config.nested)),
  );
  const raw2 = {config: {nested: {x: 1}}};
  const s2 = createClassyStore(raw2);
  Object.freeze(raw2);
  out(
    's2.config after Object.freeze(raw2) (the root)',
    attempt(() => JSON.stringify(s2.config)),
  );
  const raw3 = {config: {nested: {x: 1}}};
  const s3 = createClassyStore(raw3);
  Object.defineProperty(raw3, 'config', {writable: false, configurable: false});
  out(
    's3.config after a read-only definition on the raw object',
    attempt(() => JSON.stringify(s3.config)),
  );
  out(
    's3.config.nested.x = 2 then notifies s3: sync calls',
    attempt(() =>
      syncCalls(s3, () => {
        s3.config.nested.x = 2;
      }),
    ),
  );
}
```

Before:

```text
# before: Immer finding 6, a plain object from another realm
write to a local child: sync calls                                 1
write to the foreign child: sync calls                             0
write to a row of the foreign list: sync calls                     0
snapshot frozen: local, foreign, foreign.nested                    true, false, false
a foreign class instance stays opaque: sync calls on write         0
a foreign Date and Map stay opaque                                 true, true, 2
a null-prototype object is still proxied: sync calls on write      1

# before: finding 46, a property frozen behind the store
s.config.nested after Object.freeze(raw.config)                    throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
snapshot(s).config.nested                                          {"x":1}
s2.config after Object.freeze(raw2) (the root)                     throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
s3.config after a read-only definition on the raw object           throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
s3.config.nested.x = 2 then notifies s3: sync calls                throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
```

After, both guards:

```text
# after: Immer finding 6, a plain object from another realm
write to a local child: sync calls                                 1
write to the foreign child: sync calls                             1
write to a row of the foreign list: sync calls                     1
snapshot frozen: local, foreign, foreign.nested                    true, true, true
a foreign class instance stays opaque: sync calls on write         0
a foreign Date and Map stay opaque                                 true, true, 2
a null-prototype object is still proxied: sync calls on write      1

# after: finding 46, a property frozen behind the store
s.config.nested after Object.freeze(raw.config)                    {"x":1}
snapshot(s).config.nested                                          {"x":1}
s2.config after Object.freeze(raw2) (the root)                     {"nested":{"x":1}}
s3.config after a read-only definition on the raw object           {"nested":{"x":1}}
s3.config.nested.x = 2 then notifies s3: sync calls                0
```

### `combination.ts`

The combination: cases that need two spikes together.

```ts
// Cases that need two of the spikes together.
import {
  attempt,
  createClassyStore,
  out,
  section,
  snapshot,
  syncCalls,
  variant,
} from './lib';

const data = (value: unknown) => ({
  value,
  writable: true,
  enumerable: true,
  configurable: true,
});

section(`${variant}: T1 with T2, a function read from a list is found in it`);
{
  const first = () => 1;
  const second = () => 2;
  const store = createClassyStore({callbacks: [first, second]});
  out(
    'indexOf(first), indexOf(callbacks[1])',
    `${store.callbacks.indexOf(first)}, ${store.callbacks.indexOf(store.callbacks[1])}`,
  );
  out(
    'callbacks.includes === callbacks.includes',
    store.callbacks.includes === store.callbacks.includes,
  );
}

section(`${variant}: T2 with T3, a definition stores the raw object`);
{
  const row = {id: 1};
  const from = createClassyStore({row});
  const rawTo: {row?: {id: number}} = {};
  const to = createClassyStore(rawTo);
  Object.defineProperty(to, 'row', data(from.row));
  out(
    'raw target holds the raw row after a definition with a proxy',
    rawTo.row === row,
  );
  out('to.row === from.row', to.row === from.row);
  out(
    'a write through from.row notifies the second owner',
    syncCalls(to, () => {
      from.row.id = 2;
    }),
  );
}

section(`${variant}: T3 with T4, a definition changes the set of keys`);
{
  class Dict {
    [key: string]: unknown;
    a = 1;
    get keyCount() {
      return Object.keys(this).length;
    }
  }
  const store = createClassyStore(new Dict());
  out('keyCount', store.keyCount);
  Object.defineProperty(store, 'z', data(1));
  out(
    'after defining z: store, snapshot',
    `${store.keyCount}, ${snapshot(store).keyCount}`,
  );
  Object.defineProperty(store, 'z', {enumerable: false});
  out(
    'after making z non-enumerable: store, snapshot',
    `${store.keyCount}, ${snapshot(store).keyCount}`,
  );
}

section(
  `${variant}: T4 with T5, a delete of a missing key and a getter over the keys`,
);
{
  let runs = 0;
  class Dict {
    [key: string]: unknown;
    a = 1;
    get keyCount() {
      runs++;
      return Object.keys(this).length;
    }
  }
  const store = createClassyStore(new Dict());
  store.keyCount;
  delete store.missing;
  store.keyCount;
  out('getter runs after a delete of a missing key', runs);
  delete store.a;
  out('keyCount after delete store.a, runs', `${store.keyCount}, ${runs}`);
}

section(
  `${variant}: T1 with T3, a base class whose constructor returns the store`,
);
{
  class Base {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the case under test
      return createClassyStore(this);
    }
  }
  class Todos extends Base {
    items: string[] = [];
    count = 0;
    add = (text: string) => {
      this.items.push(text);
      this.count++;
    };
    addTwice(text: string) {
      this.add(text);
      this.add(text);
    }
  }
  const todos = new Todos();
  out(
    'snapshot(todos).items is frozen before any read',
    Object.isFrozen(snapshot(todos).items),
  );
  out(
    'sync calls for the arrow method add() (two writes)',
    syncCalls(todos, () => todos.add('x')),
  );
  out(
    'sync calls for a prototype method that calls add() twice',
    syncCalls(todos, () => todos.addTwice('y')),
  );
  out(
    'todos.add === todos.add, snapshot',
    `${todos.add === todos.add}, ${JSON.stringify(snapshot(todos))}`,
  );
}

section(`${variant}: T3 with T6, frozen through the store and behind it`);
{
  const raw = {config: {nested: {x: 1}}, other: {nested: {x: 1}}};
  const store = createClassyStore(raw);
  store.config.nested;
  store.other.nested;
  Object.freeze(store.config);
  Object.freeze(raw.other);
  out(
    'frozen through the store: config.nested',
    attempt(() => JSON.stringify(store.config.nested)),
  );
  out(
    'frozen behind the store: other.nested',
    attempt(() => JSON.stringify(store.other.nested)),
  );
  out(
    'snapshot',
    attempt(() => JSON.stringify(snapshot(store))),
  );
}

section(`${variant}: T2, a list built from proxies, assigned, then searched`);
{
  const first = {id: 1};
  const store = createClassyStore({items: [first, {id: 2}]});
  store.items = store.items.filter((item) => item.id === 1);
  out(
    'items.includes(first), indexOf(items[0])',
    `${store.items.includes(first)}, ${store.items.indexOf(store.items[0])}`,
  );
}
```

Before:

```text
# before: T1 with T2, a function read from a list is found in it
indexOf(first), indexOf(callbacks[1])                              -1, -1
callbacks.includes === callbacks.includes                          false

# before: T2 with T3, a definition stores the raw object
raw target holds the raw row after a definition with a proxy       false
to.row === from.row                                                true
a write through from.row notifies the second owner                 1

# before: T3 with T4, a definition changes the set of keys
keyCount                                                           1
after defining z: store, snapshot                                  1, 0
after making z non-enumerable: store, snapshot                     1, 0

# before: T4 with T5, a delete of a missing key and a getter over the keys
getter runs after a delete of a missing key                        1
keyCount after delete store.a, runs                                1, 1

# before: T1 with T3, a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    false
sync calls for the arrow method add() (two writes)                 1
sync calls for a prototype method that calls add() twice           1
todos.add === todos.add, snapshot                                  true, {"items":["x","y","y"],"count":3}

# before: T3 with T6, frozen through the store and behind it
frozen through the store: config.nested                            {"x":1}
frozen behind the store: other.nested                              throws TypeError: Proxy handler's 'get' result of a non-configurable and non-writable property should be the
snapshot                                                           {"config":{"nested":{"x":1}},"other":{"nested":{"x":1}}}

# before: T2, a list built from proxies, assigned, then searched
items.includes(first), indexOf(items[0])                           false, 0
```

After:

```text
# after: T1 with T2, a function read from a list is found in it
indexOf(first), indexOf(callbacks[1])                              0, 1
callbacks.includes === callbacks.includes                          true

# after: T2 with T3, a definition stores the raw object
raw target holds the raw row after a definition with a proxy       true
to.row === from.row                                                true
a write through from.row notifies the second owner                 1

# after: T3 with T4, a definition changes the set of keys
keyCount                                                           1
after defining z: store, snapshot                                  2, 2
after making z non-enumerable: store, snapshot                     1, 1

# after: T4 with T5, a delete of a missing key and a getter over the keys
getter runs after a delete of a missing key                        1
keyCount after delete store.a, runs                                0, 2

# after: T1 with T3, a base class whose constructor returns the store
snapshot(todos).items is frozen before any read                    true
sync calls for the arrow method add() (two writes)                 2
sync calls for a prototype method that calls add() twice           1
todos.add === todos.add, snapshot                                  true, {"items":["x","y","y"],"count":3}

# after: T3 with T6, frozen through the store and behind it
frozen through the store: config.nested                            {"x":1}
frozen behind the store: other.nested                              {"x":1}
snapshot                                                           {"config":{"nested":{"x":1}},"other":{"nested":{"x":1}}}

# after: T2, a list built from proxies, assigned, then searched
items.includes(first), indexOf(items[0])                           true, 0
```

## Appendix E: timings as printed

Each line is a metric, then the unmodified build and the spike: the median of the runs with the lowest and highest run, in nanoseconds per operation. The two builds ran back to back, each as fresh processes. "slower" and "faster" mean the two ranges do not touch.

### Each spike alone against the unmodified build

```text
=== t5
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
array.pushPop | 1673 (1656-1688) | 1703 (1672-1729) | same
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
array.pushPop | 3770 (3511-4082) | 3621 (3460-3895) | same
=== t1-strict
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.method | 236 (222-237) | 224 (222-232) | same
array.pushPop | 1652 (1644-1742) | 1666 (1664-1676) | same
store.read | 33.2 (32.9-33.5) | 32.9 (32.7-33.2) | same
store.read.nested | 111 (111-112) | 112 (111-112) | same
create.small | 1683 (1672-1711) | 1746 (1742-1807) | slower
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.method | 294 (291-297) | 297 (296-302) | same
array.pushPop | 3689 (3644-3805) | 3758 (3331-3807) | same
store.read | 47.7 (47-48) | 48.8 (47.7-48.8) | same
store.read.nested | 143 (141-145) | 142 (141-142) | same
create.small | 6287 (5452-6743) | 6086 (5522-6310) | same
=== t1-lenient
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.method | 227 (221-228) | 226 (226-228) | same
array.pushPop | 1669 (1666-1674) | 1708 (1707-1725) | slower
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.method | 297 (293-300) | 299 (298-300) | same
array.pushPop | 3570 (3567-3690) | 3623 (3537-3728) | same
=== t2
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 159 (159-160) | 159 (158-162) | same
store.write.same | 34.5 (34.5-34.7) | 34.8 (34.8-34.9) | slower
store.write.sync | 175 (174-176) | 175 (175-178) | same
store.write.batched | 170 (169-175) | 170 (168-174) | same
store.write.nested | 319 (317-320) | 318 (318-318) | same
array.pushPop | 1670 (1662-1718) | 1690 (1677-1709) | same
create.small | 1682 (1651-1731) | 1733 (1640-1742) | same
create.rows | 618766 (611216-622185) | 631282 (621598-644548) | same
store.read | 33 (32.8-33.4) | 33.1 (33-33.2) | same
store.read.nested | 112 (111-113) | 112 (112-113) | same
store.batch10 | 1521 (1357-1523) | 1524 (1515-1526) | same
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 213 (210-214) | 213 (211-214) | same
store.write.same | 57.8 (57.2-57.8) | 57.4 (57.4-57.8) | same
store.write.sync | 247 (247-248) | 247 (245-247) | same
store.write.batched | 214 (214-216) | 216 (214-217) | same
store.write.nested | 510 (509-511) | 515 (509-517) | same
array.pushPop | 3789 (3683-3932) | 3718 (3382-3733) | same
create.small | 5320 (4481-5403) | 6443 (6441-6575) | slower
create.rows | 1.19938e+06 (1.19398e+06-1.25367e+06) | 1.4927e+06 (1.45509e+06-1.5122e+06) | slower
store.read | 48.2 (46.8-49.7) | 48.6 (47.7-50.3) | same
store.read.nested | 142 (141-144) | 141 (139-143) | same
store.batch10 | 1656 (1656-1696) | 1724 (1684-1731) | same
=== t3a
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 160 (158-162) | 161 (161-163) | same
store.write.same | 34.5 (34.3-34.7) | 34.4 (34.4-34.8) | same
store.write.sync | 177 (173-178) | 179 (176-180) | same
store.write.batched | 171 (168-172) | 173 (170-177) | same
store.write.nested | 321 (321-330) | 321 (319-325) | same
store.read | 32.6 (32.5-32.8) | 32.6 (32.6-32.8) | same
store.read.nested | 110 (110-110) | 110 (110-110) | same
create.small | 1678 (1662-1716) | 1684 (1654-1696) | same
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 213 (212-215) | 213 (210-216) | same
store.write.same | 58.1 (57.6-58.9) | 58.1 (57-59.8) | same
store.write.sync | 248 (246-249) | 247 (245-250) | same
store.write.batched | 217 (215-220) | 216 (214-218) | same
store.write.nested | 509 (507-512) | 511 (509-514) | same
store.read | 46.8 (46.8-47.4) | 47.5 (46.6-47.6) | same
store.read.nested | 143 (141-143) | 141 (141-142) | same
create.small | 5551 (4227-6606) | 4909 (4775-5490) | same
=== t4-live
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 161 (159-161) | 162 (159-163) | same
store.write.same | 34.4 (34.2-34.4) | 34.6 (34.6-35.1) | slower
store.write.sync | 176 (175-177) | 171 (171-171) | faster
store.write.batched | 171 (171-171) | 172 (171-173) | same
store.write.nested | 318 (318-333) | 320 (320-332) | same
array.pushPop | 1744 (1727-1801) | 1738 (1708-1740) | same
getter.cached | 58.9 (58.9-58.9) | 58.1 (57.4-59.2) | same
getter.recompute | 289 (282-295) | 286 (286-289) | same
getter.rows.recompute | 156709 (154957-160717) | 153554 (150713-162666) | same
store.read | 33.8 (33.1-34.8) | 33.5 (33.3-34.3) | same
store.read.nested | 112 (112-117) | 113 (113-118) | same
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.write | 216 (213-217) | 218 (212-219) | same
store.write.same | 59 (57.9-59.8) | 59.2 (58.5-59.5) | same
store.write.sync | 250 (249-251) | 249 (247-258) | same
store.write.batched | 218 (218-218) | 218 (216-224) | same
store.write.nested | 512 (509-514) | 519 (519-535) | slower
array.pushPop | 3811 (3582-3964) | 3717 (3447-3845) | same
getter.cached | 85.5 (85.4-86.1) | 86.1 (86-86.2) | same
getter.recompute | 396 (396-397) | 402 (400-409) | slower
getter.rows.recompute | 284781 (282859-292001) | 279914 (278665-288368) | same
store.read | 47.5 (46.5-48.2) | 47.8 (47.4-49.8) | same
store.read.nested | 141 (140-145) | 144 (143-145) | same
=== t6
```

### The descriptor cache of the Solid report, alone and with two forms of the read-only guard

```text
=== solid
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 32.8 (32.8-32.9) | 12.8 (12.8-12.8) | faster
store.read.nested | 111 (110-111) | 49.5 (41.9-49.6) | faster
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 47.8 (47.7-48.9) | 37.4 (37.4-37.5) | faster
store.read.nested | 142 (140-143) | 117 (116-136) | faster
=== solid-guard
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 33.2 (33-33.5) | 13.3 (12.9-15.1) | faster
store.read.nested | 115 (114-120) | 97.1 (96.2-97.5) | faster
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 47.6 (46.8-47.8) | 38.4 (38.3-39.8) | faster
store.read.nested | 142 (140-143) | 154 (153-158) | slower
=== solid-cheap-guard
## bun: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 33 (32.9-33.1) | 12.9 (12.8-12.9) | faster
store.read.nested | 111 (111-112) | 58.9 (58.8-59) | faster
## node: metric | baseline median (low-high) | spike median (low-high) | verdict
store.read | 47.8 (47.5-48.9) | 37.8 (37.7-38.5) | faster
store.read.nested | 141 (141-143) | 139 (138-139) | faster
```

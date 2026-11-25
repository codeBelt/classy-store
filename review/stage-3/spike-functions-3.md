# Stage 3 spike: only a class is data, and the fast path with the frozen test

Status: **complete for the brief.**

- Worktrees under `<scratch>/stage-3-spike-functions-3/`, all detached at
  `57404c3`. `wt-today`: the unmodified source. `wt`: **R**,
  `c1-t1strict.patch` then `rule-r.patch`. `wt-c1`: **R+1**, R with change 1
  (`change1-on-r.patch`). `wt-c12`: **R+1+2**, R with `r-fast-on-r.patch`,
  change 1 and change 2 (`change2-on-c1.patch`). Nothing is committed
  anywhere.
- R's built runtime (`dist/storeRuntime.mjs`) is byte for byte the one
  `spike-functions-2.md` measured, and its size is the same (3,873 bytes).
  Every figure for R below was still measured again, back to back with the
  other builds.
- Patches and scripts: `<scratch>/stage-3-spike-functions-3/`, and in the
  appendices.

## Summary

| Question                          | Answer                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does change 1 close objection 1?  | Yes. `inc: function () {…}` in an object literal is one transaction again (1 notification, R: 2), works detached in strict code (R: throws `TypeError`) and in sloppy code writes the store (R: writes `globalThis`). The same holds for a generator method and for a shorthand method written as ES5 emits it. On every row of the reviewer's `fn-rows.ts` and `sloppy.ts`, R+1 gives today's answer or R's fix |
| What change 1 gives back to today | A constructor written as a `function`, a `function` declaration and a class compiled to ES5 by TypeScript, held as a value, are methods again: `store.Ctor === Ctor` is false, its statics are lost, `instanceof store.Ctor` is false. That is today's answer. A real class, a class compiled by Babel and a built-in constructor (`Date`) stay data, as under R                                                 |
| Tests                             | R+1 and R+1+2: 26 failures against R's 27. The one that passes again is the identity test the brief names; R had classed it a **fix**, and it is today's behaviour. Nothing fails anew. Typecheck: the base's one error only                                                                                                                                                                                     |
| Change 2                          | The frozen test works: a function frozen after its first read is handed out as it is (R's answer). The fast path keeps one gap: a read-only definition made on the raw object after a first read throws `TypeError` (R: hands out the function; today: throws)                                                                                                                                                   |
| Size, main entry                  | R 3,873; R+1 3,901 (+28); R+1+2 3,951 (+78 on R, +290 on today). Every other entry's "adds" is inside its budget                                                                                                                                                                                                                                                                                                 |
| Timings                           | Change 1: no difference from R anywhere. An own method call, today, R, R+1+2: Bun 177, 194, 177 ns; Node 246 to 254, 285, 269 to 272. An own arrow read: Bun 35, 58, 38 to 40; Node 47, 87, 74. `store.method`: R+1+2 touches today on both engines; R and R+1 sit 2 to 3% above today on Node, at the edge of the spread                                                                                        |
| Recommendation                    | **R with both changes.** Before 1.0. Change 1 removes the silent failure of objection 1 for 28 bytes; change 2 takes back most of the cost against today and closes the frozen gap; its one remaining gap throws where today throws too                                                                                                                                                                          |

## What was changed

`core.ts` only.

- **Change 1** (`change1-on-r.patch`, on R): 21 lines added, 6 removed, 10 of
  the added lines comments. A new function `isClassOrWrapper(fn)`:
  `Object.hasOwn(fn, 'prototype')` and then, only when it has one, either the
  `prototype` property is not writable (a class, a built-in constructor) or
  the function is in `wrapperSources` (a method some store handed out). It
  replaces `Object.hasOwn(value, 'prototype')` in the get trap's case 2. An
  arrow function, a shorthand method, an `async` and a bound function pay
  one `hasOwn` and nothing more, as under R. The write side needs no change:
  `unwrap()` in the `set` and `defineProperty` traps already finds a wrapper
  through `wrapperSources`, and a foreign wrapper written as it is is now
  recognised on the read by the same map. A first draft tested
  `wrapperSources.has` for every own function; I moved it inside the
  `prototype` branch before timing so the common functions do not pay it.
- **Change 2** (`change2-on-c1.patch`, on `r-fast-on-r.patch` and change 1):
  `r-fast-on-r.patch` as it is (12 lines), plus `!Object.isFrozen(value)` in
  the fast path's condition: 8 lines added, 2 removed.

## 1. The cases

`repro/cases.ts` (appendix C): the case script of `spike-functions-2.md`,
with the rows this brief asks for added at the end. It is run on all four
builds. A blank in "Today" means the row needs `ClassyStore`. **Bold** marks
every row where R+1 or R+1+2 differs from R. R+1 and R+1+2 agree on every row
of this script: each row reads a function once or twice, and change 2 only
matters after a first read that is followed by a freeze or a definition
(section 2).

### The thirteen rows of T1

| Case                                                        | Today                  | R                 | R+1               | R+1+2     |
| ----------------------------------------------------------- | ---------------------- | ----------------- | ----------------- | --------- |
| A prototype method, two writes                              | 1 notification         | 1                 | 1                 | 1         |
| An array method, `list.push === list.push`                  | false                  | true              | true              | true      |
| A getter that returns a function                            | memoized               | memoized          | memoized          | memoized  |
| **An own `function`: `store.handler === handler`**          | false                  | true              | **false**         | **false** |
| ... called on the store, `this === store`                   | true                   | true              | true              | true      |
| An object-literal method, two writes                        | 1, works detached      | 1, works detached | 1, works detached | same      |
| An own arrow at creation: `store.arrow === arrow`           | false                  | false             | false             | false     |
| A function in a list: `indexOf(first)`                      | -1                     | 0                 | 0                 | 0         |
| A class as a value: statics, `instanceof`                   | `undefined`, false     | right             | right             | right     |
| **A `function` constructor as a value: `===`**              | false                  | true              | **false**         | **false** |
| A bound function: `store.bound === bound`                   | false                  | false             | false             | false     |
| A frozen function: `===`                                    | false                  | true              | true              | true      |
| `constructor`, on the store and the snapshot                | a wrapper; they differ | the class         | the class         | the class |
| A store made from a function, held: `holder.fn === fnStore` | false                  | true              | true              | true      |

### The rows of `spike-functions.md` and `spike-functions-2.md`

Every row of these two tables in `spike-functions-2.md` was run again on the
four builds (rows A2 to A6, D1, D2, W, O3, O4, O17, B, N1, C1 to C4, T1, H1,
R1 to R3, K1, X1 to X3, S1, G1 and P1 of the script). **R+1 and R+1+2 give
R's answer on every one of them**, and R's column is the one
`spike-functions-2.md` printed. The raw output is `out/joined.txt` in the
scratch folder.

### The rows this brief adds

| Case                                                                              | Today                    | R                                   | R+1                    | R+1+2      |
| --------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- | ---------------------- | ---------- |
| **`inc: function () {…}` in an object literal, two writes: sync notifications**   | 1                        | 2                                   | **1**                  | **1**      |
| **... detached, strict code: result**                                             | works (count 2)          | throws `TypeError`                  | **works**              | **works**  |
| **... detached, sloppy code (`sloppy.ts`): `store.count`, `globalThis.count`**    | 1, unset                 | 0, 1                                | **1, unset**           | **same**   |
| ... `store.inc === store.inc`                                                     | true                     | true                                | true                   | true       |
| **... the snapshot holds the raw function, distinct from the store's**            | true                     | false (the store hands out the raw) | **true**               | **true**   |
| A class as a value: `store.Model === Model`                                       | false                    | true                                | true                   | true       |
| ... a static field and a static method                                            | `undefined`, `undefined` | right                               | right                  | right      |
| ... `new store.Model()`: `instanceof Model`, `instanceof store.Model`             | true, false              | true, true                          | true, true             | true, true |
| **A `function` constructor as a value: `store.Ctor === Ctor`**                    | false                    | true                                | **false**              | **false**  |
| **... a static (`Ctor.kind`)**                                                    | `undefined`              | `ctor`                              | **`undefined`**        | **same**   |
| **... `new store.Ctor(5)`: `instanceof Ctor`, `instanceof store.Ctor`, `x`**      | true, false, 5           | true, true, 5                       | **true, false, 5**     | **same**   |
| ... does `new store.Ctor(5)` touch the store: `store.x`, sync notifications       | 0, 0                     | 0, 0                                | 0, 0                   | 0, 0       |
| ... `store.Ctor(7)` called as a function: `store.x`                               | 7                        | 7                                   | 7                      | 7          |
| A built-in constructor (`Date`): `store.D === Date`                               | false                    | true                                | true                   | true       |
| ... `new store.D(0) instanceof Date`, `typeof store.D.now`                        | true, `undefined`        | true, `function`                    | true, `function`       | same       |
| A generator method in an object literal: `store.gen === store.gen`                | true                     | true                                | true                   | true       |
| ... `[...store.gen()]`, two writes in the body: sync notifications                | 2                        | 2                                   | 2                      | 2          |
| **... detached `[...gen()]`**                                                     | works                    | throws `TypeError`                  | **works**              | **works**  |
| An `async` method in an object literal, two writes before an `await`: sync        | 1                        | 1                                   | 1                      | 1          |
| ... detached                                                                      | works                    | works                               | works                  | works      |
| A method written to another store's field and into its list: each `=== store.inc` | false                    | true                                | true                   | true       |
| ... the same for a `function` expression method: each `=== store.f`               | false                    | true                                | true                   | true       |
| **... all four called through the other store, two writes each: `store.n`, sync** | 4, 4                     | 2, 2                                | **4, 4**               | **4, 4**   |
| `store.a = store.a`: sync; `store.a` the same after                               | 1, false                 | 0, true                             | 0, true                | 0, true    |
| `store.f = store.f`, `f` a `function` expression: sync; the same after            | 1, false                 | 0, true                             | 0, true                | 0, true    |
| `store.b = store.a`: `store.b === store.a`; raw `b` is `a`'s function             | false, false             | true, true                          | true, true             | true, true |
| `store.c = store.f` (`function`): the same                                        | false, false             | true, true                          | true, true             | true, true |
| **A class in the shape TypeScript emits for ES5, as a value: `===`, static**      | false, `undefined`       | true, `ts`                          | **false, `undefined`** | **same**   |
| A class in the shape Babel emits (`prototype` made read-only): `===`, static      | false, `undefined`       | true, `babel`                       | true, `babel`          | same       |
| **A shorthand method in the shape ES5 emits (a `function`), two writes: sync**    | 1                        | 2                                   | **1**                  | **1**      |

Rows 4 and 9 of T1 and the `Ctor` rows move from R's answer back to today's.
The `function`-method rows move from R's answer back to today's too. No row
moves to an answer that both today and R lack.

`fn-rows.ts` of the third review, on the four builds: R+1 and R+1+2 print
R's answers for its rows 1, 2, 5 and 6 (two keys, the name after
`store.b = store.a`, a prototype method written back, the getter over a
`function` field that sees the replacement: `b1`, today `a1`) and today's
answers for rows 3 and 4 (the `function` expression: 1 notification and a
detached call that works; the sloppy function: `store.count` 1, `globalThis`
untouched).

The ES5 rows are hand-written in the shape each compiler emits, not
compiled: no ES5 compiler is installed in the worktree. The Babel shape
(`Object.defineProperty(C, 'prototype', {writable: false})` in
`_createClass`) is from memory of Babel 7's helper, not checked here.

## 2. A property that cannot be written, after a first read

`repro/readonly-after-read-2.ts`: the brief's four rows. The original
`readonly-after-read.ts` shares one function across the four cases and
freezes it in the last, so with change 2 the frozen test hid the third row's
throw. The copy uses one function per case.

| After a first read through the store                       | Today  | R    | R+1  | R+1+2                  |
| ---------------------------------------------------------- | ------ | ---- | ---- | ---------------------- |
| `Object.freeze(raw)`: `store.f === fn`                     | throws | true | true | true                   |
| A read-only definition through the store                   | throws | true | true | true                   |
| A read-only definition on the raw object, behind the store | throws | true | true | **throws `TypeError`** |
| **The function itself frozen**                             | false  | true | true | **true** (R's answer)  |

`r-fast-on-r.patch` alone gave **false** on the last row
(`spike-functions-2.md`, section 2). Change 2 closes that gap. The other gap
stays: the trap cannot see a definition made on the raw object, and the
engine's own invariant check throws when the trap returns the wrapper. Only
reading the descriptor on every read closes it, which is what the fast path
skips. So under R+1+2 that case is no worse than today (today throws on
every row of this table) and worse than R.

## 3. Tests

| Build |  Pass | Fail | Against R              |
| ----- | ----: | ---: | ---------------------- |
| R     | 1,314 |   27 |                        |
| R+1   | 1,315 |   26 | one fewer, nothing new |
| R+1+2 | 1,315 |   26 | the same 26 as R+1     |

The one that passes again: `core.characterisation.identity.test.ts`,
"functions read through a store > a function stored as data is read back as
one stable wrapper bound to the store, while the snapshot holds the
original". Its function is a `function` declaration. `spike-functions-2.md`
classed its failure under R as a **fix**; the third review's objection 1
says it pins behaviour that is right. Under R+1 it passes, so it is neither a
fix nor an incidental change: it is today's behaviour, kept.

The 26 are R's others, unchanged: the four remaining **fixes** of T1 strict
in "functions read through a store" (a class's statics, `includes` and
`indexOf` on a list of functions, an array method stable on reads, `splice`
by `indexOf`), "static getters" (2), the prototype swap and the nested
array's `Array.isArray` (**fixes**); the 17 of T3 (a); and the export list
(`main entry point types`, **incidental**, the base class export). No
regression.

Typecheck, `bun run --filter @codebelt/classy-store typecheck`: one error on
each form, the base's (`types.index.test.ts`, the export list gains
`ClassyStore`).

## 4. Cost

### Size

`bun run size`, gzipped bytes; "adds" is what the entry adds to the main one.

| Entry            | Today |     R |   R+1 | R+1+2 | Budget |
| ---------------- | ----: | ----: | ----: | ----: | -----: |
| `.`              | 3,661 | 3,873 | 3,901 | 3,951 |  3,750 |
| `./utils` adds   | 2,686 | 2,702 | 2,697 | 2,708 |  2,750 |
| `./collections`  |   727 |   725 |   723 |   732 |    750 |
| `./react`        | 1,662 | 1,667 | 1,662 | 1,663 |  1,700 |
| `./react/server` |   153 |   152 |   150 |   148 |    175 |
| `./vue`          |   280 |   279 |   275 |   280 |    300 |
| `./svelte`       |   182 |   185 |   178 |   185 |    200 |
| `./angular`      |   271 |   279 |   274 |   276 |    300 |
| `./solid`        |   312 |   311 |   313 |   312 |    335 |

Change 1 costs 28 bytes, change 2 50 more (43 for `r-fast-on-r.patch` in
`spike-functions-2.md`, 7 for the frozen test). The main entry is over its
budget on every form after today's; decision 4 sets one ceiling.

### Timings

`bench.sh` (appendix C): on saved copies of the four builds, in the order
today, R, R+1, R+1+2, first `own-method.mjs` and then the core benchmark
(`runCoreBenchmark.mjs --runs 5`) on Bun and on Node; two rounds back to
back, 10:04 to 11:19, load average 2.5 to 3.6. Nanoseconds, median (lowest to
highest), round 1 then round 2. Bun 1.4.5, Node 24.21.0.

**An own method and an own arrow, `own-method.mjs`:**

| Metric                     | Engine | Today                              | R                                  | R+1                                | R+1+2                              |
| -------------------------- | ------ | ---------------------------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- |
| Own method call            | Bun    | 177 (177–182), 177 (176–183)       | 194 (194–199), 193 (193–197)       | 195 (195–201), 200 (199–204)       | 177 (176–181), 181 (180–186)       |
| Own method call            | Node   | 246 (245–249), 254 (252–263)       | 285 (282–286), 286 (285–287)       | 288 (284–290), 286 (282–289)       | 269 (265–271), 272 (272–274)       |
| Own arrow, read and called | Bun    | 34.9 (34.4–37.7), 35.7 (34.9–37.8) | 58.3 (57.8–60.0), 58.7 (57.6–60.9) | 58.3 (57.6–61.8), 58.4 (57.6–60.5) | 38.4 (37.5–42.1), 39.7 (38.3–42.9) |
| Own arrow, read and called | Node   | 46.6 (46.3–47.0), 48.0 (47.4–48.6) | 86.5 (85.9–86.7), 87.1 (86.7–87.3) | 85.5 (84.7–85.7), 88.7 (88.1–94.0) | 73.8 (72.9–74.2), 74.1 (73.6–75.2) |

- **Change 1 costs nothing measurable.** Every range of R+1 touches R's.
- **Change 2 takes back all of the own method call on Bun** (R+1+2's ranges
  touch today's in both rounds) **and about half of it on Node**: 269 and 272
  against today's 246 and 254 and R's 285 and 286. The ranges do not touch
  either neighbour, so R+1+2 is about 8% slower than today and 5% faster
  than R on Node.
- **The own arrow read:** R and R+1 take 1.6 to 1.8 times today's time on
  both engines, as the third review measured. R+1+2 takes about 1.1 times
  today's on Bun (round 1 touches today's range, round 2 does not) and about
  1.55 times on Node (ranges far apart). The fast path still runs
  `recordDep`, `hasOwn`, the table lookup, `isExtensible` and `isFrozen` on
  each read; on Node that is about 26 ns over today.

**The core benchmark** (prototype-method path and creation):

| Metric               | Today                                    | R                                        | R+1                                      | R+1+2                                    |
| -------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `store.method`, Bun  | 232 (226–232), 227 (227–230)             | 230 (229–235), 232 (231–236)             | 232 (231–245), 231 (229–233)             | 221 (220–236), 221 (220–232)             |
| `store.method`, Node | 279 (276–281), 282 (281–287)             | 288 (283–292), 288 (286–295)             | 288 (283–292), 291 (288–294)             | 286 (278–332), 289 (281–295)             |
| `store.read`, Bun    | 31.9 (31.7–32.7), 32.0 (31.4–32.5)       | 32.1 (31.7–32.9), 32.1 (32.0–32.3)       | 32.1 (31.5–32.5), 32.0 (31.5–32.3)       | 31.9 (31.2–32.2), 32.0 (31.9–32.8)       |
| `store.read`, Node   | 45.0 (44.2–45.6), 45.5 (45.4–45.8)       | 45.2 (44.5–45.8), 44.8 (44.0–46.6)       | 46.2 (44.6–46.8), 45.7 (45.6–46.9)       | 44.8 (44.1–45.9), 45.6 (44.8–47.9)       |
| `create.small`, Bun  | 1,441 (1,390–1,545), 1,391 (1,391–1,550) | 1,467 (1,320–1,498), 1,407 (1,315–1,812) | 1,483 (1,328–1,580), 1,509 (1,340–1,533) | 1,488 (1,306–1,639), 1,530 (1,422–1,559) |
| `create.small`, Node | 5,369 (4,892–5,542), 5,531 (3,418–6,358) | 4,831 (4,282–5,639), 5,500 (4,637–5,810) | 5,588 (4,698–5,603), 5,125 (4,173–5,636) | 4,899 (4,661–5,840), 5,269 (4,939–6,144) |

- `store.read` and `create.small`: every range touches today's, on both
  engines, for all three forms.
- `store.method` on Bun: every range touches today's.
- `store.method` on Node: R and R+1 sit 2 to 3% above today. In round 1
  both ranges (283–292) lie above today's (276–281) and do not touch it; in
  round 2 R's (286–295) touches today's (281–287) and R+1's (288–294) does
  not. Change 1 does not touch the prototype-method path, so R and R+1 run
  the same code there and the spread between them is noise. R+1+2 touches
  today in both rounds. So decision 1's landing condition ("`store.method`
  inside the spread of the commit before") may fail for R and R+1 on Node by
  a hair. The benchmark's own verdict against its stored baseline says
  "slower" for R and R+1 on Node and Bun and "same" for R+1+2 in both rounds.
- The four ratios to a forwarding Proxy stay inside their limits for every
  build and round (read 14.6 to 16.5 against 20 on Bun, 2.00 to 2.06 against
  2.5 on Node; write, getter and snapshot in `out/bench.txt`).

Why R+1+2 is also back at today's figure on `store.method`, a prototype
method: `r-fast-on-r.patch` tells an own function from an inherited one with
`Object.hasOwn` and reads the descriptor only for an own function. R reads
the descriptor for every function, so a prototype method pays for it too.

## 5. What stays wrong

**What each form still gets wrong that today gets wrong too.**

- **R+1 and R+1+2:** a constructor written as a `function`, and a class
  compiled to ES5 by a compiler that leaves `prototype` writable
  (TypeScript's output), held as a value and read through the store: not
  `===` to itself, no statics, `instanceof store.Ctor` false. `new
  store.Ctor()` still builds a real `Ctor` and does not touch the store, and
  the snapshot holds the original. R fixed this row; change 1 gives it back.
  No test in the suite pins it (the class test that R fixes is a real
  `class`, and stays fixed).
- **All three:** a bound function and an arrow read through the store are
  not the function stored (`store.onSave === cb` false); a callback on the
  store ignores the caller's `this`; `withHistory` skips functions (finding
  60); a class without the base class and with an arrow field writes the raw
  object. A generator method's body runs on `next()`, after the call
  returned, so its writes are not one transaction (2 notifications for two
  writes on today and every form).

**What a form gets wrong that today gets right.**

- **R:** the three rows of objection 1 (a `function` method: 2
  notifications, a detached call that throws in strict code and writes
  `globalThis` in sloppy code), the same for a generator method and an ES5
  shorthand method, and a `function` method passed to another store and
  called from there writes that store, not its own (X4: `store.n` 2, today
  4).
- **R+1:** none found on any row run.
- **R+1+2:** one, and only against R, not today: after a first read, a
  read-only definition made on the raw object behind the store throws on
  the next read. Today throws there too, on the first read already.

## 6. Recommendation

**Take R with both changes (R+1+2) for decision 1. Before 1.0.**

- **Change 1 is needed.** Without it decision 1 adds a silent failure to a
  form that works today: `inc: function () {…}`, a generator method, and
  every shorthand method or arrow function in code compiled to ES5, lose the
  binding and the transaction. A detached call throws in strict code and
  writes `globalThis` in sloppy code. Change 1 restores today's answer on
  each of those rows for 28 bytes and no measurable time. It costs one of
  R's fixes: a constructor written as a `function` (or a class compiled by
  TypeScript to ES5) held as a value is wrapped again, as today. That row
  is today's behaviour, not a new failure, and its symptoms are loud
  (`undefined` statics), not silent writes elsewhere.
- **Change 2 is worth taking now.** It takes back all of R's cost on an own
  method call on Bun and half of it on Node, most of the own arrow read on
  Bun, and puts `store.method` back on today's figure on both engines, so the
  landing condition holds. The frozen test closes the gap the third review's
  objection 6 named. The gap that stays is a `TypeError` on a read after a
  read-only definition made on the raw object behind the store, which today
  throws on as well (on the first read already): a loud failure, not a
  silent one, on a path the store never promised.
- If the owner wants every read of a read-only property never to throw,
  take R+1 instead and accept the own-call cost against today (about 10% on
  Bun and 15% on Node for a method call, 1.7 to 1.8 times for an arrow
  read), and say so in "What it costs a user".
- Against today, R+1+2 still costs about 8% on an own method call on Node
  and 1.55 times on an own arrow read on Node (about 26 ns). Decision 1's
  landing condition should name `own-method.mjs` on both engines, measured
  against the commit before, besides `store.method`.

**The reference sentences that change** (numbered as in
`spike-functions-2.md`, section 5; the others stay):

- **2, replaced:** "A function an object holds in its own field is a method
  too, when you read it through the store: an arrow function, a shorthand
  method, a `function` declaration or expression, a generator, an `async` or
  a bound function. A class, a built-in constructor such as `Date`, a frozen
  function, a store and a function in an array are data, and are handed out
  as they are."
- **2a, new:** "A class is told by its `prototype`, which a class has
  read-only. A constructor written as a `function`, or a class compiled to
  ES5 with a writable `prototype`, is a method: read through the store, its
  static members are missing and `instanceof` against what you read is
  false, though `new store.Ctor()` still builds a `Ctor` and leaves the store
  alone. Hold such a constructor outside the store, or freeze it." This is
  true of today.
- **8, extended (fast path only):** "… hands out its function as it is,
  unbound. Make a property read-only through the store, or freeze the
  object: a property made read-only on your own object behind the store,
  after the store has handed out its method, throws on the next read."
- In decision 1's text, case 2's list of exceptions changes from "the
  function has its own `prototype` property (a class, a `function`
  declaration or expression, a generator, and every method a store handed
  out before)" to "the function is a class or a built-in constructor (its
  own `prototype` is read-only), or is a method a store handed out before".
  "What it costs a user" drops its `inc: function` bullet, and "Not taken"
  moves the fast path into the decision with its one remaining gap named.

## Cost for stage 4

- `core.ts`: change 1 is one helper and one changed condition (about 10
  lines of code); change 2 is `r-fast-on-r.patch` plus one condition (about
  14 lines of code). `ownership.ts` untouched.
- Tests to write first, beyond `spike-functions-2.md`'s list: every bold row
  of section 1 (`inc: function` on the store, detached strict, detached
  sloppy through `new Function`; a generator method detached; a `function`
  method passed to another store and called there; a `function` constructor
  held as a value, its `new` and its statics as today's answer; a class and
  `Date` held as values; the Babel shape with a read-only `prototype`); the
  four rows of section 2 with one function per case.
- Tests to change: none beyond R's. The identity test of section 3 stays as
  it is.
- Risk: low. The read path only changes for a function with its own
  `prototype`, which is the rare case.
- `CONSTRAINTS.md`: the main entry inside decision 4's ceiling: +240 bytes on
  today for R+1, +290 for R+1+2.

## Verified and not verified

- **Run, on today, R, R+1 and R+1+2:** `repro/cases.ts` (every row of
  `spike-functions-2.md`'s case tables plus the rows this brief adds), the
  third review's `fn-rows.ts` and `sloppy.ts`, and
  `readonly-after-read-2.ts` (the original `readonly-after-read.ts` was run
  only on the first draft of change 1). On R, R+1 and R+1+2: the unit suite,
  the typecheck, all on the final forms. On
  all four: `bun run size`; `own-method.mjs` and the core benchmark's
  `store.method`, `store.read`, `create.small`, two rounds back to back on
  Bun and Node.
- **Not compiled:** the ES5 rows are hand-written in each compiler's shape;
  no TypeScript or Babel down-leveller is installed in the worktree. That
  Babel's `_createClass` makes `prototype` read-only is from memory.
- **Reasoning:** that only a descriptor read on every read can close the
  fast path's last gap (the engine's invariant check needs the descriptor;
  the trap cannot see a change on the raw object).
- **Not run:** the browser, framework and mutation suites; the full core
  benchmark's other rows beyond the ratios printed; `create.rows`.

## Appendix A: how to run it again

1. `git -C <repo> worktree add --detach <scratch>/stage-3-spike-functions-3/<wt> 57404c3`
   for `wt-today`, `wt`, `wt-c1` and `wt-c12`, then `bun install --frozen-lockfile`
   and `bun run build` in each.
2. In `wt`, `wt-c1` and `wt-c12`: `git apply` `c1-t1strict.patch`
   (`spike-classes.md`), then `rule-r.patch` (`spike-functions-2.md`,
   appendix B). In `wt-c1`: `patch -p1 < change1-on-r.patch`. In `wt-c12`:
   `r-fast-on-r.patch` (`spike-functions-2.md`, appendix B), then
   `change1-on-r.patch` and `change2-on-c1.patch` with `patch -p1`.
3. `bun run test`, `bun run --filter @codebelt/classy-store typecheck`,
   `bun run size` in each.
4. Cases: `bun repro/cases.ts <today|r|c1|c12>` for each, then
   `python3 join.py <scratch>/stage-3-spike-functions-3`. `bun repro/<script>.ts <worktree>`
   for `fn-rows.ts`, `sloppy.ts` and `readonly-after-read-2.ts`.
5. Timings: copy `dist/`, `tests/benchmark/` and `package.json` of each
   worktree's package to `copies/bench-<today|r|c1|c12>`, link
   `copies/node_modules` to a worktree's `packages/classy-store/node_modules`
   (Node needs `proxy-compare`), then run `bench.sh <scratch>/stage-3-spike-functions-3`.
   `own-method.mjs` is the one in `spike-functions-2.md`, appendix C.

## Appendix B: patches

`c1-t1strict.patch` is in `spike-classes.md`; `rule-r.patch` and
`r-fast-on-r.patch` are in `spike-functions-2.md`, appendix B. Both were used
as they are.

### `change1-on-r.patch`: change 1, on `rule-r.patch`

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -285,6 +285,20 @@
 const wrapperSources = new WeakMap<object, unknown>();
 
 /**
+ * Data, not a method: a class or a built-in constructor, whose own `prototype`
+ * is read-only, or a method a store handed out. A `function` and a generator
+ * have a writable `prototype`; an arrow function, a shorthand method, an
+ * `async` and a bound function have none, and pay one `hasOwn` only.
+ */
+function isClassOrWrapper(fn: object): boolean {
+  return (
+    Object.hasOwn(fn, 'prototype') &&
+    (!Object.getOwnPropertyDescriptor(fn, 'prototype')?.writable ||
+      wrapperSources.has(fn))
+  );
+}
+
+/**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
  * every framework binding, are notified once when `run` returns or throws,
@@ -507,9 +521,10 @@
       // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
       // and run each call as one transaction. A method is a function found on
       // the prototype chain, but not `constructor`; or a function an object
-      // that is not an array holds itself, read here, unless it has its own
-      // `prototype` (a class, a `function`, a wrapper), is frozen, is a store,
-      // or sits in a read-only property. The object itself is never changed.
+      // that is not an array holds itself, read here, unless it is a class or
+      // a built-in constructor (a read-only `prototype`), a method a store
+      // handed out, is frozen, is a store, or sits in a read-only property.
+      // The object itself is never changed.
       if (typeof value === 'function') {
         const own = Object.getOwnPropertyDescriptor(_target, prop);
         if (!own) {
@@ -523,7 +538,7 @@
           // A later replacement of the field must reach a getter that calls it.
           recordDep(internal, prop, value);
           return Array.isArray(_target) ||
-            Object.hasOwn(value, 'prototype') ||
+            isClassOrWrapper(value) ||
             Object.isFrozen(value) ||
             internalsMap.has(value) ||
             isReadOnly(own)
```

### `change2-on-c1.patch`: change 2, on `r-fast-on-r.patch` and change 1

```diff
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -539,9 +539,15 @@
           // A later replacement of the field must reach a getter that calls it.
           recordDep(internal, prop, value);
           // Seen before, and no property of this object can have become
-          // read-only through the store or by freezing it since.
+          // read-only through the store or by freezing it since, and the
+          // function itself has not been frozen since.
           const known = boundMethods?.get(value as object);
-          if (known && !lockedKeys && Object.isExtensible(_target))
+          if (
+            known &&
+            !lockedKeys &&
+            Object.isExtensible(_target) &&
+            !Object.isFrozen(value)
+          )
             return known;
           const own = Object.getOwnPropertyDescriptor(_target, prop);
           return Array.isArray(_target) ||
```

## Appendix C: scripts

### `repro/cases.ts`, as a diff on the script in `spike-functions-2.md`, appendix C

```diff
--- a/repro/cases.ts (spike-functions-2.md, appendix C)
+++ b/repro/cases.ts
@@ -1,12 +1,9 @@
 // The cases of spike-functions.md plus the rows of spike-functions-2.md.
-// today: unmodified; strict: the base; f1: rule-f1.patch; r: this spike.
-// Usage: CLASSY_REPO=<repo> bun cases.ts <today|strict|f1|r>
+// today: unmodified; r: R; c1: R with change 1; c12: R with changes 1 and 2.
+// Usage: bun cases.ts <today|r|c1|c12>  (worktrees wt-today, wt, wt-c1, wt-c12)
 const variant = process.argv[2] ?? 'r';
 const F = import.meta.dir + '/..';
-const root =
-  variant === 'today'
-    ? `${process.env.CLASSY_REPO}/packages/classy-store/src`
-    : `${F}/${variant === 'r' ? 'wt' : `wt-${variant}`}/packages/classy-store/src`;
+const root = `${F}/${variant === 'r' ? 'wt' : `wt-${variant}`}/packages/classy-store/src`;
 const lib = await import(`${root}/index.ts`);
 const {createClassyStore, snapshot, subscribe, shallowEqual} = lib;
 const ClassyStore = lib.ClassyStore as (new () => object) | undefined;
@@ -524,4 +521,150 @@
   subscribe(snapgetter, () => calls++, {sync: true});
   const r = attempt(() => snapshot(snapgetter).doubled);
   out('P1. snapgetter literal: result, liveHits, sync', `${r}, ${snapgetter.hits}, ${calls}`);
+}
+
+section(`${variant}: rows of spike-functions-3`);
+{
+  const s: Any = createClassyStore({
+    count: 0,
+    other: 0,
+    inc: function (this: Any) {
+      this.count++;
+      this.other++;
+    },
+  });
+  out('F1. `inc: function` literal, two writes: sync calls', sync(s, () => s.inc()));
+  const detached = s.inc;
+  out('F1. detached call (strict module): result, count', attempt(() => (detached(), s.count)));
+  out('F1. s.inc === s.inc', s.inc === s.inc);
+  out('F1. snapshot(s).inc === raw function', snapshot(s).inc !== s.inc);
 }
+{
+  class Model {
+    static label = 'model';
+    static make() {
+      return new Model();
+    }
+    v = 1;
+  }
+  const s: Any = createClassyStore({Model});
+  out('M1. class as value: s.Model === Model', s.Model === Model);
+  out('M1. s.Model.label, typeof s.Model.make', attempt(() => `${s.Model.label}, ${typeof s.Model.make}`));
+  out('M1. new s.Model() instanceof Model, instanceof s.Model', attempt(() => { const m = new s.Model(); return `${m instanceof Model}, ${m instanceof s.Model}`; }));
+}
+{
+  function Ctor(this: Any, x: number) {
+    this.x = x;
+  }
+  (Ctor as Any).kind = 'ctor';
+  const s: Any = createClassyStore({x: 0, Ctor});
+  out('M2. `function` constructor: s.Ctor === Ctor', s.Ctor === Ctor);
+  out('M2. s.Ctor.kind (a static)', attempt(() => s.Ctor.kind));
+  let made: Any;
+  const heard = sync(s, () => { made = attempt(() => new s.Ctor(5)); });
+  out('M2. new s.Ctor(5): instanceof Ctor, instanceof s.Ctor, made.x', attempt(() => `${made instanceof Ctor}, ${made instanceof s.Ctor}, ${made.x}`));
+  out('M2. ... touches the store: s.x after, sync calls', `${s.x}, ${heard}`);
+  out('M2. s.Ctor(7) called as a function: s.x after', attempt(() => (s.Ctor(7), s.x)));
+}
+{
+  const s: Any = createClassyStore({D: Date});
+  out('M3. built-in Date: s.D === Date', s.D === Date);
+  out('M3. new s.D(0) instanceof Date, typeof s.D.now', attempt(() => `${new s.D(0) instanceof Date}, ${typeof s.D.now}`));
+}
+{
+  const s: Any = createClassyStore({
+    n: 0,
+    m: 0,
+    *gen(this: Any) {
+      this.n++;
+      this.m++;
+      yield this.n;
+    },
+  });
+  out('G1. generator method: s.gen === s.gen', s.gen === s.gen);
+  out('G1. [...s.gen()]: sync calls, s.n', `${sync(s, () => [...s.gen()])}, ${s.n}`);
+  const g = s.gen;
+  out('G1. detached [...g()]: result, s.n', attempt(() => `${[...g()]}, ${s.n}`));
+  const t: Any = createClassyStore({
+    a: 0,
+    b: 0,
+    async load(this: Any) {
+      this.a++;
+      this.b++;
+    },
+  });
+  let heard = 0;
+  subscribe(t, () => heard++, {sync: true});
+  const pr = t.load();
+  out('G2. async method, two writes before an await: sync calls', heard);
+  await pr;
+  const l = t.load;
+  out('G2. detached async: result, t.a', await l().then(() => `ok, ${t.a}`, (e: Error) => `rejects ${e.constructor.name}`));
+}
+{
+  const s: Any = createClassyStore({
+    n: 0,
+    m: 0,
+    inc() {
+      this.n++;
+      this.m++;
+    },
+    f: function (this: Any) {
+      this.n++;
+      this.m++;
+    },
+  });
+  const o: Any = createClassyStore({fn: null as Any, fx: null as Any, list: [] as Any[]});
+  o.fn = s.inc;
+  o.fx = s.f;
+  o.list.push(s.inc, s.f);
+  out('X4. shorthand: o.fn === s.inc, o.list[0] === s.inc', `${o.fn === s.inc}, ${o.list[0] === s.inc}`);
+  out('X4. `function`: o.fx === s.f, o.list[1] === s.f', `${o.fx === s.f}, ${o.list[1] === s.f}`);
+  const heard = sync(s, () => { o.fn(); o.fx(); o.list[0](); o.list[1](); });
+  out('X4. four calls through o, each two writes: s.n, sync calls on s', `${s.n}, ${heard}`);
+  out('X4. snapshot(o).fn === s.inc (a wrapper of s in the snapshot)', snapshot(o).fn === s.inc);
+}
+{
+  const s: Any = createClassyStore({
+    n: 0,
+    a() { this.n++; },
+    f: function (this: Any) { this.n++; },
+    b: null as Any,
+    c: null as Any,
+  });
+  const ra = s.a;
+  const rf = s.f;
+  out('Y1. s.a = s.a: sync calls; s.a === read', `${sync(s, () => (s.a = s.a))}, ${s.a === ra}`);
+  out('Y1. s.f = s.f (`function`): sync calls; s.f === read', `${sync(s, () => (s.f = s.f))}, ${s.f === rf}`);
+  s.b = s.a;
+  s.c = s.f;
+  out('Y1. s.b = s.a: s.b === s.a; raw b is a\'s function', `${s.b === s.a}, ${snapshot(s).b === snapshot(s).a}`);
+  out('Y1. s.c = s.f: s.c === s.f; raw c is f\'s function', `${s.c === s.f}, ${snapshot(s).c === snapshot(s).f}`);
+}
+{
+  // Hand-written in the shapes a compiler to ES5 emits (not compiled here).
+  // TypeScript: a class is an IIFE around a `function`, prototype writable.
+  var TsModel = (function () {
+    function TsModel(this: Any) { this.v = 1; }
+    (TsModel as Any).label = 'ts';
+    return TsModel;
+  })();
+  // Babel's _createClass also makes `prototype` read-only.
+  var BabelModel = (function () {
+    function BabelModel(this: Any) { this.v = 1; }
+    (BabelModel as Any).label = 'babel';
+    Object.defineProperty(BabelModel, 'prototype', {writable: false});
+    return BabelModel;
+  })();
+  const s: Any = createClassyStore({
+    n: 0,
+    m: 0,
+    TsModel,
+    BabelModel,
+    // ES5 output of `inc() {…}` and of `bump: () => {…}` (with _this captured)
+    inc: function (this: Any) { this.n++; this.m++; },
+  });
+  out('E1. ES5 TS-shaped class as value: === , .label', `${s.TsModel === TsModel}, ${s.TsModel.label}`);
+  out('E1. ES5 Babel-shaped class as value: === , .label', `${s.BabelModel === BabelModel}, ${s.BabelModel.label}`);
+  out('E1. ES5 shorthand method (a `function`): sync calls', sync(s, () => s.inc()));
+}
```

### `repro/readonly-after-read-2.ts`

```ts
// readonly-after-read.ts with one function per case: the original shares one
// `fn`, so freezing it in the last case also changes the first three.
// Usage: bun readonly-after-read-2.ts <worktree>
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
const fa = () => 1,
  fb = () => 1,
  fc = () => 1,
  fd = () => 1;
const a = {f: fa};
const sa: any = createClassyStore(a);
sa.f;
Object.freeze(a);
const b = {f: fb};
const sb: any = createClassyStore(b);
sb.f;
Object.defineProperty(sb, 'f', {writable: false, configurable: false});
const c = {f: fc};
const sc: any = createClassyStore(c);
sc.f;
Object.defineProperty(c, 'f', {writable: false, configurable: false});
const d = {f: fd};
const sd: any = createClassyStore(d);
sd.f;
Object.freeze(fd);
console.log(
  JSON.stringify({
    'freeze(raw)': t(() => sa.f === fa),
    'read-only through the store': t(() => sb.f === fb),
    'read-only on the raw object': t(() => sc.f === fc),
    'function frozen': t(() => sd.f === fd),
  }),
);
```

### `repro/fn-rows.ts` (third review, copied unchanged)

```ts
// Rows for decision 1 that the spike's tables do not hold.
// Usage: bun fn-rows.ts <worktree>
const wt = process.argv[2];
const lib = await import(`${wt}/packages/classy-store/src/index.ts`);
const {createClassyStore, snapshot, subscribe} = lib;
const out = (label: string, value: unknown) =>
  console.log(
    label.padEnd(64),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
const attempt = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    return `throws ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 60)}`;
  }
};
const syncCount = (store: object, run: () => void) => {
  let calls = 0;
  const stop = subscribe(store, () => calls++, {sync: true});
  try {
    run();
  } finally {
    stop();
  }
  return calls;
};

// 1. One function under two keys: the name, and what a hook keyed by the wrapper sees.
const shared = () => {};
const two = createClassyStore({a: shared, b: shared});
out('two keys, one function: read b first, then a.name', [
  two.b.name,
  two.a.name,
]);
out('... two.a === two.b', two.a === two.b);

// 2. store.b = store.a: b's name afterwards
const s2 = createClassyStore({
  n: 0,
  a() {
    this.n++;
  },
  b: null as null | (() => void),
});
s2.b = s2.a;
out('store.b = store.a; store.b.name', (s2.b as () => void).name);

// 3. A `function` expression in an object literal, detached (onClick={store.inc})
const s3 = createClassyStore({
  count: 0,
  other: 0,
  inc: function () {
    this.count++;
    this.other++;
  },
});
const detached = s3.inc;
out(
  'function expression, detached call',
  attempt(() => detached()),
);
out(
  '... called on the store: sync notifications',
  syncCount(s3, () => s3.inc()),
);

// 4. The same written in sloppy mode (a classic script): detached call
const sloppyInc = new Function('this.count++; this.other++;') as () => void;
const s4 = createClassyStore({count: 0, other: 0, inc: sloppyInc});
const d4 = s4.inc;
const before = (globalThis as Record<string, unknown>).count;
out(
  'sloppy function, detached call',
  attempt(() => d4()),
);
out('... store.count after, globalThis.count after', [
  s4.count,
  (globalThis as Record<string, unknown>).count,
  before,
]);

// 5. A prototype method written back: is it "no change"?
class P {
  n = 0;
  inc() {
    this.n++;
  }
}
const p = createClassyStore(new P());
out(
  'p.inc = p.inc: sync notifications',
  syncCount(p, () => {
    p.inc = p.inc;
  }),
);
out('... own key now in snapshot keys', Object.keys(snapshot(p)));
P.prototype.inc = function () {
  this.n += 100;
};
p.inc();
out('... prototype replaced afterwards, p.inc() gives n', p.n);

// 6. A getter that calls a function held in a field which is a `function` expression
const s6 = createClassyStore({
  fmt: function (x: number) {
    return `a${x}`;
  } as (x: number) => string,
  x: 1,
  get label() {
    return this.fmt(this.x);
  },
});
out('getter over a function-expression field', s6.label);
s6.fmt = function (x: number) {
  return `b${x}`;
};
out('... after the field is replaced', s6.label);
```

### `repro/sloppy.ts` (third review, copied unchanged)

```ts
const {createClassyStore} = await import(
  `${process.argv[2]}/packages/classy-store/src/index.ts`
);
const inc = new Function('this.count = (this.count || 0) + 1;') as () => void; // a sloppy-mode `function`
const s = createClassyStore({count: 0, inc});
const onClick = s.inc;
onClick();
console.log(
  'store.count',
  s.count,
  'globalThis.count',
  (globalThis as any).count,
);
```

### `bench.sh`

```sh
#!/bin/zsh
# Two rounds back to back: own-method.mjs and the core benchmark on four saved builds.
# Usage: bench.sh <folder with copies/ and repro/>
cd $1/copies
for round in 1 2; do
for c in bench-today bench-r bench-c1 bench-c12; do
  for e in bun node; do
    echo "## $c $e round $round own"; $e ../repro/own-method.mjs $PWD/$c 2>&1
    echo "## $c $e round $round core"; $e $c/tests/benchmark/runCoreBenchmark.mjs --runs 5 2>&1 | grep -E '^\| (store.method|store.read|create.small|read:|write:|getter:|snapshot:) '
  done
done
done
```

### `join.py`

```python
import sys
vs=['today','r','c1','c12']; d={}; order=[]
for v in vs:
    for line in open(f'{sys.argv[1]}/out/cases-{v}.txt'):
        line=line.rstrip('\n')
        if not line or line.startswith('#'): continue
        k=line[:70].rstrip(); val=line[71:]
        if k not in order: order.append(k)
        d[(k,v)]=val
for k in order:
    r=[d.get((k,v),'') for v in vs]
    mark=' *' if (r[2]!=r[1] or r[3]!=r[1]) else ''
    print(f"{k} | "+" | ".join(r)+mark)
```

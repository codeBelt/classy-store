# Stage 3 spikes: classes

Status: **complete for the brief.** Stage 3 of the pre-1.0 review,
2026-11-24. Nothing here is decided and no library source was changed.

Subject: API questions 4 and 6 of `REVIEW_PLAN.md`. Arrow-function methods,
`#private` fields, and whether a nested class instance is wrapped by default.
Entries M11 and M12 of `review/stage-3/merged.md`, stage 2 defect 1.

- Worktree: a detached copy of `release/1.0` at `74966f1`, in the scratch
  folder `<scratch>/stage-3-spike-classes/wt`. Its library source is the same
  as `57404c3`, the commit the first-wave patches were made against: the two
  commits differ in `scripts/scrub-paths.mjs` and in reports only. Nothing
  here is committed anywhere.
- Patches: `<scratch>/stage-3-spike-classes/patches/`, and appendix B of this
  file.
- Base for C1: `t3a.patch` from appendix B of `review/stage-3/spike-traps.md`
  (a data descriptor given to `defineProperty` is a write), taken from that
  report because the trap agent's scratch folder is gone.

## Summary

| Item                                       | Result                                                                                                                                                                                                       | Recommendation                                | Label                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------- |
| C1. The base class `ClassyStore`           | Four lines of code and 13 bytes. Arrow-function fields, bound methods and what the constructor starts all write through the store. It works with the hooks, the utilities and the types. Needs T3 (a)        | Do it                                         | Decide before 1.0; the code can follow                    |
| C1, W2. An arrow method as a transaction   | Under T1 strict an arrow method notifies once per write: 1,000 writes take 150 ms on Bun against 1. Wrapping an arrow function when it is written to a field of such a store costs 83 bytes and one identity | Do it with the base class                     | With C1                                                   |
| C2. `#private` fields                      | Never state. With the base class they can be used on the live store. A getter over one is stale there and throws on a snapshot                                                                               | One sentence in the docs                      | Can follow 1.0                                            |
| C3 (a). Keep opt-in, warn once per class   | No test changes. 108 to 209 bytes if it is always on. It warns for seven kinds of object that are no mistake                                                                                                 | Keep opt-in. Warn in a development build only | The default: before 1.0, no code. The warning: can follow |
| C3 (b). Wrap class instances by default    | 8 tests change, 6 of them the documented rule. 83 bytes. A class with `#private` fields throws, an object that changes itself leaves a stale snapshot, a graph of 5,461 objects costs 20 ms                  | Do not                                        |                                                           |
| C4 (a). An arrow function by its source    | Finds 6 of 7 lost writes, reports 2 fields that lose nothing. 256 to 342 bytes                                                                                                                               | Do not                                        |                                                           |
| C4 (b). A lost write, seen at the snapshot | Finds 6 of 7 and nothing else. Also sees a constructor's timer and a write to the raw object. 168 to 309 bytes                                                                                               | Do it in a development build only             | Can follow 1.0                                            |
| The combination                            | T3 (a), T1 strict, the base class and W2. 28 tests change: 27 are the trap patches' and 1 is the export list. Main entry 3,801 bytes, 140 more than today                                                    | As above                                      |                                                           |

Three things to know before the detail:

1. **The base class answers question 6 as well as question 4.** A class that
   extends it is a store by itself, so another store connects to it wherever
   it is placed, with no `PROXYABLE`. What stays opaque by default is then
   what the user does not own, and for those objects opaque is the right
   default.
2. **T1 strict and the base class pull against each other, and W2 is the
   price.** T1 strict says a function in a field is data. The base class
   exists so that an arrow function in a field can be a method. Left alone,
   the arrow method works and is 30 to 150 times slower in a loop. W2 makes
   it a transaction for 83 bytes, and an arrow callback assigned to a field
   of such a store then reads back as its wrapper.
3. **Two things the stage 2 runs did not have.** A plain class has a second
   silent failure of the arrow-function kind: whatever its constructor
   starts (a timer, a listener, a promise) writes to the raw instance. And a
   base-class store that sits inside another store does not survive an undo:
   the row comes back as a frozen copy whose arrow functions still write the
   original.

## Baseline

The unmodified worktree, measured before any spike. Bun 1.4.5.

- `bun run test`: 1,341 pass, 0 fail, 95 files.
- `bun run --filter @codebelt/classy-store typecheck`: passes, after one
  `bun run build`.
- `bun run size`: main entry 3,661 bytes gzipped (budget 3,750).
- `bun run benchmark:core`, ratios to a forwarding Proxy, median and range
  of five runs: read 14.2 (10.2 to 18.9), write 2.79 (2.70 to 3.41), cached
  getter 31.9 (11.4 to 956), cached snapshot 7.08 (3.07 to 12.2).
- `bun run benchmark:core:node`: read 2.00 (0.43 to 2.52), write 1.31 (0.81
  to 1.63), cached getter 3.53 (1.43 to 3.81), cached snapshot 1.46 (0.13 to
  2.32).

The ranges of that baseline run are as wide as they look: other agents were
using all ten cores. Every timing below compares saved copies of two builds
run one after the other, and "slower" or "faster" means the two ranges do not
touch.

## C1. A base class whose constructor returns the store

- **Question.** Can arrow-function methods be made to work by a base class
  whose constructor returns the store, and what does it take to ship one?
  API question 4; M12 in `merged.md`; MobX 8 and script 10, Vue Q4 and port
  8, Svelte 1.
- **Base.** `t3a.patch` (a definition is a write) and `t1-strict.patch` (a
  function in a field is data) from appendix B of `spike-traps.md`. The brief
  names the first; the orchestrating agent has since taken the second, so C1
  is built on both. They apply together once the line
  `boundMethods.delete(prop)` that T3 (a) adds to the `defineProperty` trap is
  dropped, as the trap report says. Together they measure 3,705 bytes, 44
  more than today, and account for 27 of the failing tests below: the 17 and
  the 10 that report lists.
- **What was changed.** Two steps, each saved as a patch on that base:
  - **The base class** (`c1-t1strict.patch`): 30 lines added and 1 removed in
    `core.ts`, `storeRuntime.ts` and `index.ts`. Four of the lines are code;
    the rest is the doc comment and the export lists.
  - **W2, arrow methods as transactions** (`c1-t1strict-w2.patch`): 31 more
    lines in `core.ts`. See "The arrow method as a transaction" below.

### The name, the entry point and the form

One new export from the main entry, `@codebelt/classy-store`:

```ts
export const ClassyStore = function (this: object) {
  return createClassyStore(this);
} as unknown as new () => object;
```

```ts
class Todos extends ClassyStore {
  items: string[] = [];
  add = (text: string) => {
    this.items.push(text);
  };
}
const todos = new Todos(); // already a store
```

- **Why it works.** JavaScript runs a subclass's field initialisers and
  constructor body after `super()` returns, with whatever `super()` returned
  as `this`. So every field, every arrow function and everything the
  constructor starts sees the store, never the raw instance.
- **Why `ClassyStore`.** It reads with `createClassyStore` and
  `useClassyStore`, and `class Todos extends ClassyStore` says what it is.
  `Store` is too general for an import, and a mixin (`classy(Base)`) cannot
  give the same guarantee: the parent's own fields and constructor would
  still run on the raw instance.
- **Why a function and not a class.** Written as
  `class ClassyStore { constructor() { return createClassyStore(this); } }`
  it fails the lint rule `noConstructorReturn`, and the floor in
  `CONSTRAINTS.md` forbids the comment that would silence it. The function
  form passes lint and the typecheck, gives the same output on every
  reproduction, and is 6 bytes smaller. One difference: called without `new`
  it throws "A Proxy's 'target' should be an Object" where a class would say
  "cannot be invoked without 'new'".

### What the brief asks to check

Run on the base, the base class and W2 together: `repro/c1.ts`,
`repro/c1-callbacks.ts`, `repro/c1-undo.ts`, and seven throwaway tests in
`classyStore.spike.test.tsx` (appendix D). All seven pass.

| Item                               | Result                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createClassyStore(new Sub())`     | Returns the same store: `createClassyStore(todos) === todos`. The node is found by its proxy, so wrapping twice is harmless                                                                                                                      |
| Subclasses                         | Three levels deep, with constructor arguments, a TypeScript parameter property, a static counter, a static factory, `super.label` in a getter and a getter read inside the constructor: all correct. `instanceof` is true for each level         |
| `instanceof`, prototype            | `todos instanceof Todos` and `instanceof ClassyStore` are true; `Object.getPrototypeOf(todos) === Todos.prototype`; a snapshot is an instance of the class too. `todos.constructor === Todos` is true with T1 strict and false without it        |
| `useLocalStore(() => new Todos())` | Works under `StrictMode`. An arrow method taken from the hook's snapshot works as a click handler, and a selector hook re-renders after a destructured arrow method is called                                                                    |
| `persist`                          | Saves the data fields and leaves the arrow method out. Restores into a second instance, whose arrow method then writes the second instance                                                                                                       |
| `devtools`                         | Sends the state without the arrow method. A jump restores the fields and leaves the method in place                                                                                                                                              |
| `withHistory`                      | Undo and redo of a root store work, and its arrow method still writes the store afterwards. A nested base-class store is another matter: see "What still does not work"                                                                          |
| `subscribeKey`, `subscribe`        | Both hear a write made by an arrow function                                                                                                                                                                                                      |
| Types                              | `new Todos()` has type `Todos`. `Snapshot<Todos>` is deeply read-only, a getter keeps its type, an arrow field keeps its signature, and `createClassyStore(todos)` is `Todos`                                                                    |
| The first snapshot                 | Frozen, before any read. Without T3 (a) it holds the raw array, and a later write then changes that snapshot: `first.items.length` is 1 after one `add()`. That is a snapshot that changes after it was taken, not only one that is not frozen   |
| `this` kept by the constructor     | A timer started in the constructor writes through the store and notifies. The same class wrapped with `createClassyStore(new PlainClock())` writes the raw instance: no notification, and the snapshot keeps its old object and value            |
| A base-class store in a store      | Connected without `PROXYABLE`, because it is embedded by its proxy: `item.toggle()` notifies the list, the list's snapshot holds a frozen copy of the row with its getters, and `list.items[0] === item`. The same holds in a plain-object store |
| Built inside a method              | A method of another store that makes a base-class store and keeps it gives one notification, and the new store's fields are in the snapshot                                                                                                      |

Two findings this turned up that the stage 2 runs did not have:

- **The constructor is a second silent failure of the same kind as the arrow
  function.** Anything a plain class starts in its constructor captures the
  raw instance: a timer, an event listener, a `fetch().then(...)`. The plan
  names arrow-function methods and writes after an `await`; this one is not
  on the list. The base class removes it.
- **A class compiled with assignments already works today.** With
  `useDefineForClassFields: false` a field is assigned in the constructor,
  which goes through the `set` trap, so the first snapshot is right on the
  unmodified library. `examples/angular/tsconfig.json` sets that option, and
  `examples/nextjs/tsconfig.json` targets ES2017, where `false` is
  TypeScript's default (whether the Next.js compiler follows it was not
  checked). The defect that T3 (a) removes shows only where fields are
  defined, which is what Bun does and what the Vue, Svelte and Solid examples
  ask for.

### The arrow method as a transaction

Under T1 strict an arrow-function field is data, so the store hands it out as
it is and nothing opens a transaction around the call. Its writes notify,
each on its own. `repro/c1-callbacks.ts` and `repro/bench-create.mjs`, with
one synchronous subscriber that takes a snapshot, which is what every adapter
does:

| A loop of 1,000 row writes with one synchronous subscriber | Bun           | Node          |
| ---------------------------------------------------------- | ------------- | ------------- |
| In a prototype method                                      | 1.0 to 2.4 ms | 2.4 to 2.7 ms |
| In an arrow method, no transaction                         | 149 to 151 ms | 79 to 84 ms   |
| In an arrow method that calls `batch()` itself             | 1.0 to 1.3 ms | 2.3 to 2.7 ms |
| In an arrow method under W2                                | 1.8 to 2.8 ms | 2.2 to 2.7 ms |

Each cell is the median of two runs of each build; appendix E has every
line. So without a transaction the arrow method works and is 30 to 150 times
slower in a loop, and a synchronous subscriber sees each half-applied step. That is
a new silent failure inside the feature that exists to remove one. Four ways
to open the transaction were run:

| Way                                                                               | Arrow field the class defines | The same field assigned in the constructor | `form.onSave === callback` after `form.onSave = callback` | Store and snapshot hold the same function | `form.onSave = form.onSave` | A `function` expression in a field | Main entry |
| --------------------------------------------------------------------------------- | ----------------------------: | -----------------------------------------: | --------------------------------------------------------- | ----------------------------------------- | --------------------------- | ---------------------------------: | ---------: |
| Nothing (`c1-t1strict.patch`)                                                     |               2 notifications |                                          2 | Yes                                                       | Yes                                       | No change                   |                                  2 |      3,718 |
| Wrap on read, by a flag on the node (`c1-t1strict-ownmethods.patch`)              |                             1 |                                          1 | No                                                        | No                                        | Notifies, stores a wrapper  |                                  1 |      3,744 |
| W1: wrap an arrow function when a field is defined (`c1-t1strict-w1.patch`)       |                             1 |                                          2 | Yes                                                       | Yes                                       | No change                   |                                  2 |      3,794 |
| W2: wrap an arrow function when it is written, defined or assigned (`…-w2.patch`) |                             1 |                                          1 | No                                                        | Yes                                       | No change                   |                                  2 |      3,801 |

- **Wrap on read** is the cheapest, 26 bytes, and it is wrong: it brings back
  on base-class stores the three defects T1 strict removes. What is read is
  not what was stored, a read wrapper gets written back, and the store and
  its snapshot disagree.
- **W1** keeps every identity and depends on the compiler: one notification
  where fields are defined, two where they are assigned. The Angular example
  in this repository assigns, and by TypeScript's default so does the
  Next.js one.
- **W2** is what the base class has to do. In the `set` and `defineProperty`
  traps of a node whose target is an instance of `ClassyStore`, a function
  with no `prototype` property of its own is replaced by one wrapper that
  runs it as a transaction, and the wrapper is what the field holds. The
  store, its snapshots and every read then share that one function. A class
  or a `function` expression has a `prototype` and stays data, so
  `holder.Model === Model` still holds. The wrapper is remembered per
  function, so writing the same callback again, or writing a wrapper back, is
  no change.
- **What W2 costs.** 31 lines and 83 bytes on the main entry. One check on
  every write of a value that is not an object, which no write metric can
  see (table below). And one identity: an arrow function assigned to a field
  of a base-class store reads back as its wrapper, so
  `form.onSave === callback` is false. It is the same wrapper on every read
  and on the snapshot. A function in a list or in a nested object of such a
  store is untouched, because those are other nodes.
- **The rule it adds to the docs.** "In a class that extends `ClassyStore`,
  an arrow function held in a field is a method: the store runs it as one
  transaction." Everywhere else the rule of T1 strict stands.

### What still does not work

1. **`#private` fields are not state.** C2 has the table.
2. **`accessor` fields.** `accessor value = 1` keeps its value in a private
   slot. A write through the store notifies no one and a snapshot read throws
   "Cannot read from private field". Same cause as 1.
3. **Undo and DevTools time travel of a nested base-class store.**
   `withHistory` restores a changed list by putting copies back
   (`repro/c1-undo.ts`). After an undo that reaches into a row, the row is no
   longer the store that was made: it is the frozen snapshot, so
   `row.toggleMethod()` throws "Attempted to assign to readonly property". If
   the class also sets `PROXYABLE` the row is a mutable copy and its prototype
   methods work. In both cases the copy carries the original's arrow
   functions, and they write the original instance, which is no longer in the
   list: `row.toggleArrow()` gives 0 notifications and leaves the row as it
   was. A root store is not affected, because its fields are restored into
   the same instance. This is M60 in `merged.md` (undo replaces every row)
   with a sharper symptom, and it holds for any class with arrow-function
   fields, with or without the base class.
4. **An arrow function on a snapshot writes the live store.**
   `snapshot(counter).arrow()` adds one to the live count, where
   `snapshot(counter).method()` throws because `this` is the frozen snapshot.
   That is convenient for a click handler and has to be said in the docs.
5. **`structuredClone(snapshot)` throws** for a class with an arrow-function
   field, base class or not, because a function cannot be cloned. Stage 1
   finding 51 says a snapshot clones.
6. **Construction goes through the proxy.** Each field is one definition
   through the trap. On the build with W2, a class of five fields, one of
   them an arrow function: `new Based5()` takes 3.0 to 3.2 µs against 1.4
   for `createClassyStore(new Plain5())` on Bun, and 6.9 to 7.0 against 4.8
   to 4.9 on Node. Twenty primitive fields: 5.3 to 5.6 µs against 1.1 on
   Bun, 9.3 to 9.6 against 2.6 to 4.1 on Node. That is about 250 nanoseconds
   a field on Bun. With the first snapshot included the gap is smaller: 5.5
   against 4.0 µs on Bun, 13.6 to 14.8 against 12.1 to 12.5 on Node. It
   matters for a row class made by the thousand, not for an application
   store.
7. **A class that has to extend something else** cannot use it and stays on
   `createClassyStore(new X())`.
8. **A `function` expression in a field** is data under W2 and gives two
   notifications. Nobody writes methods that way; the rule is still uneven.

### Result

| Measure                            | Base class on T3 (a) and T1 strict                                 | With W2                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Tests, of 1,348 with the spike's 7 | 1,320 pass, 28 fail                                                | The same 28                                                                                                                  |
| Typecheck                          | One error, in the test that pins the export list                   | The same                                                                                                                     |
| Main entry, gzipped                | 3,718 bytes: 3,705 for the two trap patches, 13 for the base class | 3,801 bytes, 83 more                                                                                                         |
| Other entries                      | Not looked at                                                      | Every one inside its budget for what it adds: `./utils` 2,680 of 2,750, `./collections` 722 of 750, `./react` 1,658 of 1,700 |

The 28 failing tests:

- 17 are the **fixes** of T3 (a) and 10 are those of T1 strict (9 **fixes**
  and the 1 **incidental** object-literal method). They are the tests
  `spike-traps.md` names for those two spikes; appendix C here lists them.
- 1 is new and **incidental**: `types.index.test.ts`, "main entry point
  types > the entry exports six values and no others". The typecheck fails on
  the same assertion. An approved export changes that list by design.

Measured alone on the unmodified library (`c1-alone.patch`, in the class
form), the base class is 22 bytes and that one test.

Write timings, the base against the full C1 build, three runs each, from
saved copies of both builds (`out/bench-write.txt`): `store.write` 164 and
165 ns against 163 and 171 on Bun, 213 against 210 and 213 on Node;
`store.write.sync`, `.batched`, `.nested` and `.same` inside the spread on
both engines. The check W2 adds to `set` cannot be measured. The full
benchmark of both builds is under "The combination".

### What it breaks or changes for a user

Nothing breaks: it is one new export, and `createClassyStore(new X())` works
as before. What changes is what the docs can say. Today the reference says
"arrow-function fields cannot be rebound". With the base class that sentence
becomes "extend `ClassyStore`, or use prototype methods".

### Recommendation

**Do it, with W2. Can follow 1.0 as code; decide it before 1.0.** The export
is an addition and could ship in a 1.x release. It should be decided now for
three reasons:

- It needs T3 (a), which is before 1.0.
- It is the answer to API question 6 as well as 4 (see C3): a class that
  extends it is reactive wherever it is put, with no marker.
- It changes what the guides teach first. A guide that opens with
  `class Todos extends ClassyStore` has no "do not write arrow functions"
  warning to give, and no constructor trap.

If the owner does not want W2's identity exception, take the base class
without it and say in the docs that an arrow method notifies once per write
and should call `batch()` when it loops. I would not: it trades a silent
wrong result for a silent slow one.

### Cost for stage 4

- `core.ts`: 4 lines for the base class, about 30 for W2. `index.ts` and
  `storeRuntime.ts`: one name each.
- Tests to write: every row of the first table, the four rows of the
  transaction table, the eight limits. `types.index.test.ts` and
  `types.exports.test.ts` gain the name.
- Docs: the API reference, the tutorial's section on arrow functions, the
  architecture page, and `CLAUDE.md` ("No arrow function methods").
- Size: 13 bytes, and 83 for W2, on top of the 44 the two trap patches add
  together. The main entry's budget moves with the rest of the first wave.
- Risk: low for the base class. Medium for W2, which adds a second place
  where a stored value is not the value given.

## C2. `#private` fields

- **Question.** What does a `#private` field do with and without the base
  class: reads, writes, getters over private state, methods, snapshots? Can
  it be state? API question 4; M12 (c) in `merged.md`; MobX 8, Vue Q4, Svelte
  1, Solid port 9.
- **What was changed.** Nothing in the library. `repro/c2.ts` builds one
  class body twice, on no base and on the base class. It gave the same output
  on the unmodified source, with the four-line base class of stage 2, and on
  the C1 build.

### Result

| Case                                                                    | No base class: `createClassyStore(new Vault())` | Base class: `new Vault()`                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| A getter that reads `#secret`, on the store                             | `TypeError`                                     | Works the first time, then stale for good: it still read 1 when the field held 3      |
| A method that writes `#secret`                                          | `TypeError`                                     | Runs. 0 notifications                                                                 |
| A getter that reads `#secret` and a public field                        | `TypeError`                                     | Right only after the public field changes                                             |
| A private method called by a public one                                 | `TypeError`                                     | Works                                                                                 |
| An arrow field that writes `#secret`                                    | Runs on the raw instance. 0 notifications       | Runs. 0 notifications                                                                 |
| `#secret in store`, asked by a method                                   | `false`                                         | `true`                                                                                |
| A method that pushes to a `#private` array                              | `TypeError`                                     | Runs. 0 notifications: the array is not part of the store                             |
| `snapshot(store)`                                                       | No throw                                        | No throw                                                                              |
| `snapshot.secret`, a getter over `#secret`                              | `TypeError`                                     | `TypeError`                                                                           |
| `snapshot.viaPrivateMethod()`                                           | `TypeError`                                     | `TypeError`                                                                           |
| `JSON.stringify(snapshot)`, `{...snapshot}`, `Object.entries(snapshot)` | `TypeError`                                     | `TypeError`                                                                           |
| `withHistory(store)`                                                    | No throw                                        | No throw                                                                              |
| An `accessor` field                                                     | Not run                                         | A write notifies no one; a snapshot read throws                                       |
| The TypeScript `private` keyword                                        | Not run                                         | State like any field: notifies, the getter is right on both layers, the key is listed |

The same class nested in a plain store, three ways:

| Nested as                          | A method that writes `#secret` and a public field | The getter over `#secret` on the holder's snapshot |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| An unmarked instance (opaque)      | Runs on the raw instance. 0 notifications         | Works: the snapshot shares the live instance       |
| A class with `PROXYABLE`           | `TypeError`                                       | `TypeError`                                        |
| A class that extends `ClassyStore` | Runs. 1 notification, for the public field        | `TypeError`                                        |

### Why

- A private field belongs to the object the class's constructor set up. With
  the base class that object is the store, so code that runs with the store
  as `this` reaches it. Without the base class it is the raw instance, and
  every method and getter runs with the proxy as `this`.
- A write to a private field does not go through a Proxy, so the store never
  hears of it. A getter that read nothing the store can see is cached with no
  dependency, which is why it is stale for good.
- A snapshot is a new object made with `Object.create`. It never went through
  the class's constructor, so it holds no private field, and a snapshot
  getter runs with a tracking proxy as `this`.
- **It cannot be fixed on the snapshot side.** The only way to give another
  object a class's private fields is to run that class's constructor on it,
  which runs every field initialiser and the constructor body again and gives
  the initial values, not the current ones. This is reasoning from the
  language; I did not build it.
- **One part depends on M33.** `JSON.stringify(snapshot)`, a spread and
  `Object.entries(snapshot)` throw only because a class getter is an
  enumerable own accessor of a snapshot today. If M33 takes getters off the
  enumerable keys, those three stop throwing. Reading the getter still
  throws.

### The sentence for the docs

> A `#private` field is never state. The store cannot see it and a snapshot
> cannot hold it: a write to it notifies no one, a getter that reads it is
> not recomputed, and reading that getter on a snapshot, which is what every
> framework binding does, throws a `TypeError`. In a class that extends
> `ClassyStore`, a `#private` field or method can be used by code that runs
> on the live store, for example to hold a timer or an abort controller. For
> state that should be private, use TypeScript's `private` keyword: it is an
> ordinary field.

### Recommendation

**No code. Put the sentence in the reference and the tutorial. Can follow
1.0**, though it belongs with the rewrite of the arrow-function section that
C1 causes.

A development build could add a hint when a snapshot getter throws. I would
not match on the message: Bun says "Cannot access invalid private field",
Node says "Cannot read private member #x from an object whose class did not
declare it", and for a private method Node says "Receiver must be an instance
of class A", with no "private" in it.

### Cost for stage 4

Docs only. One test that pins the table above would keep the sentence true.

## C3. A nested class instance without `PROXYABLE`

- **Question.** Should a nested class instance stay opaque unless its class
  says otherwise, with the silent case detected, or be wrapped unless told
  not to? API question 6; stage 2 defect 1; M11 and contradiction 2 in
  `merged.md`; Solid 4, Valtio V12, Vue Q6.
- **The defect today** (`repro/c3.ts`, before). For
  `createClassyStore({inner: new Counter()})`, after
  `store.inner.increment()`: the count is 1, a synchronous subscriber was
  called 0 times, `snapshot(store)` is the same object as before the call,
  and the snapshot taken before the call now says 1. The snapshot holds the
  raw instance, unfrozen.
- Both spikes were made on the unmodified worktree, each alone.

### (a) Keep opt-in, and say so once per class

- **What was changed.** `c3a.patch`: 29 lines added and 1 removed in
  `core.ts`. `linkChild` calls a new `reportOpaqueInstance` for a value it
  leaves unproxied, and only where a value enters the store: when a store is
  created, in `set` and in `defineProperty`. Those are the calls that pass a
  descriptor. A read never reaches it.
- **What it reports.** One `console.warn` per class, remembered by prototype
  in a `WeakSet`. It stays silent for:
  - a platform object, meaning anything whose tag is not `[object Object]`;
  - a frozen instance, which is a value by the existing rule;
  - a store, which covers every class that extends `ClassyStore`;
  - a class that defines `PROXYABLE` either way. `static [PROXYABLE] = false`
    is then the way to say "opaque on purpose". It needs no code: `canProxy`
    already reads the marker by its truth.
- **Result.**

  | Measure                         | (a)                                                                                                      |
  | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
  | Tests                           | 1,341 pass, 0 fail. The suite itself prints 7 warnings, for classes named `Task`, `Opaque` and `Counter` |
  | Typecheck                       | Passes                                                                                                   |
  | Main entry, gzipped             | 3,870 bytes, +209, with the sentence below. 3,769, +108, with a code and the class name only             |
  | Read of an opaque field         | Unchanged on both engines: the check is not on the read path                                             |
  | Write of a `Date` field         | Bun 174 to 175 ns against 169 to 181. Node 278 to 280 against 257 to 261, slower by 8%                   |
  | Write of a class-instance field | Bun 172 to 174 ns against 176 to 178. Node 277 to 284 against 254, slower by 10%                         |
  | Create a small store            | Inside the spread on both                                                                                |

  The text of the warning: "a Counter instance is in a store. It is kept by
  reference: a change to it notifies no one and shows in snapshots already
  taken. Set static [PROXYABLE] on the class to true to make it reactive, or
  to false to keep it as it is."
- **Where it is wrong.** `repro/c3.ts` places 27 kinds of object in a store
  and (a) warns for eight classes. One is the mistake it is for, `Counter`.
  The other seven stand for objects a user keeps opaque on purpose or cannot
  mark: Node's `EventEmitter`, a value class and a service class with
  `#private` fields, two stand-ins for a library's client object, and a
  plain object from another realm and `Object.create(proto)`, both reported
  as "a Object instance". The warning is once per class, so the noise is
  bounded, but a third-party class can be silenced only by defining the
  marker on it from outside or by keeping the object out of the store.
- **What it costs without a development build.** 108 to 209 bytes in every
  production bundle, 8 to 10% on a write of an opaque value on Node, and a
  `console.warn` in production. With a development build (M72) it costs
  production nothing.

### (b) Wrap by default, with a marker kept outside the object

- **What was changed.** `c3b.patch`: 36 lines added and 11 removed, in
  `utils/internal/internal.ts` and `index.ts`. `canProxy` now answers, in
  this order:
  1. an object passed to the new export `opaque(value)`: no. The marker is a
     `WeakSet`, so nothing is written on the user's object;
  2. an array, or an object with no prototype: yes;
  3. otherwise one verdict per prototype, remembered in a `WeakMap`: the
     class's `PROXYABLE` if it defines one, true or false, else whether the
     tag is `[object Object]`.
- **Result.**

  | Measure                                               | (b)                                                                                                     |
  | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
  | Tests                                                 | 1,333 pass, 8 fail                                                                                      |
  | Typecheck                                             | One error, in the test that pins the export list                                                        |
  | Main entry, gzipped                                   | 3,744 bytes, +83. Six bytes under today's budget                                                        |
  | The defect                                            | Gone: 1 notification, a new snapshot, the earlier snapshot still says 0, the copy is frozen             |
  | Read of a `Date` or `Map` field                       | Bun 43 to 45 ns against 40 to 42, about 3 ns more, ranges touch. Node unchanged                         |
  | Read of a class-instance field                        | Bun unchanged. Node 52 to 54 ns against 83, faster: it is a child now, not looked at again on each read |
  | Write of a class-instance field                       | Bun 339 to 342 ns against 176 to 178. Node 453 against 254. It costs what a plain object costs          |
  | Create a store with a `Date`, a `Map` and an instance | Bun 794 to 811 ns against 379 to 388. Node 4.3 µs against 1.5, in a wide spread                         |
  | The same with its first snapshot                      | Bun 2.2 to 2.3 µs against 1.0. Node 6.8 to 7.1 against 3.5 to 3.8                                       |

- **The 8 failing tests.**
  - 6 pin the rule (b) reverses, which the reference states: "Ordinary nested
    class instances remain opaque". They are a documented behaviour given
    up, not defects:
    - `internal.test.ts`: "canProxy > returns false for regular class
      instances" and "canProxy — additional > is not fooled by an own
      `constructor` data field on a plain object".
    - `core.snapshotValues.test.ts`: "PROXYABLE > a class that opts in is
      reactive when nested, and keeps its prototype in snapshots", which
      ends by checking that a class without the marker is opaque.
    - `core.gettersAcrossNodes.test.ts`, three tests under "a getter that
      reads a Date, a Map, a frozen object or an unmarked class instance".
  - 1 is a **fix**: "a store inside a store > is not connected when the raw
    class instance behind it is embedded instead of its proxy" (stage 1
    finding 9).
  - 1 is **incidental**: the export list of the main entry gains `opaque`.

- **What it does to objects of every kind** (`repro/c3.ts`, and a throwaway
  test under happy-dom for the DOM rows). "Wrapped" means the store hands out
  a proxy and the snapshot holds a frozen copy.

  | Object                                                                                              | Tag               | Today         | Under (b)                                                                                  |
  | --------------------------------------------------------------------------------------------------- | ----------------- | ------------- | ------------------------------------------------------------------------------------------ |
  | `Date`, `RegExp`, `Map`, `Set`, `WeakMap`, `Promise`, `Error`                                       | Its own           | Opaque        | Opaque                                                                                     |
  | `URL`, `URLSearchParams`, `Blob`, `Headers`, `AbortController`, `TextEncoder`, `Intl.NumberFormat`  | Its own           | Opaque        | Opaque                                                                                     |
  | `Uint8Array`, `ArrayBuffer`, `DataView`                                                             | Its own           | Opaque        | Opaque                                                                                     |
  | A DOM element, a text node, `document` (happy-dom)                                                  | Its own           | Opaque        | Opaque                                                                                     |
  | `Event`, `File`, `FormData`, `element.style`, `element.classList`, a bounding rectangle (happy-dom) | `[object Object]` | Opaque        | Wrapped. A browser gives each its own tag, by the Web IDL rules; no browser was run        |
  | A class with `Symbol.toStringTag`                                                                   | Its own           | Opaque        | Opaque: the sharp edge the Solid report names                                              |
  | A plain class (`Counter`)                                                                           | `[object Object]` | Opaque        | Wrapped. A method called on the snapshot throws when it writes                             |
  | A value class with `#private` fields (`Money`)                                                      | `[object Object]` | Opaque, works | Wrapped. `store.price.add(...)` throws a `TypeError`, and so does the snapshot             |
  | A service class with `#private` fields (`Client`)                                                   | `[object Object]` | Opaque, works | Wrapped. `store.client.request()` throws a `TypeError`. Passed through `opaque()` it works |
  | Node's `EventEmitter`                                                                               | `[object Object]` | Opaque        | Wrapped. Works on the store; `on()` called on the snapshot throws                          |
  | A plain object from another realm                                                                   | `[object Object]` | Opaque (M13)  | Wrapped, which is the fix M13 asks for                                                     |
  | `Object.create(proto)`                                                                              | `[object Object]` | Opaque        | Wrapped                                                                                    |
  | A frozen instance, a store, a class with `PROXYABLE` true or false                                  |                   | As marked     | The same as today                                                                          |

- **The two costs the Solid report does not count.**
  - **An object that changes itself goes stale, in silence.** A client
    object updates its own fields from its own callbacks, on the raw
    instance. `repro/c3.ts` has a `Socket` whose status goes from
    "connecting" to "open" that way. Under (b) the store reads "open", the
    snapshot stays "connecting" for good, its list of received messages
    stays empty, and no subscriber is called. Today the snapshot shares the
    object, so it reads "open". (b) fixes the silent case of a method called
    through the store and adds the silent case of a change made behind it.
  - **The store takes in everything the object can reach.** A node is made
    for every object reachable through plain objects, arrays and now class
    instances, when the value is assigned. For a stand-in graph of 5,461
    objects, each holding an array and a `Map`, creating the store went from
    0.01 ms to 9 ms and the first snapshot from 0 to 11 ms, and the snapshot
    is a frozen copy of the whole graph. A map view, an editor or a scene
    held in a store is that case.
- **`#private` under (b).** A class with private fields throws as soon as a
  method is called through the store, where today it works. That is loud,
  and it is the same `TypeError` on the snapshot. Every such class needs
  `opaque()`, or `static [PROXYABLE] = false` if the user owns it.

### What this says about the arguments in `merged.md`

- **Item 6 of "Proposals I think are wrong"** says (b) costs more than the
  Solid report counts: a getter over a `#private` field throws on the copy,
  and every third-party instance needs the marker checked. Both hold in the
  run. It understates the case: the stale copy of a self-changing object is
  the larger cost, and nothing reports it.
- **It says a development warning reaches the same silent failure for a few
  lines.** True for the failure, 29 lines. Not true for the cost if there is
  no development build: (a) is 108 to 209 bytes against 83 for (b), and it
  warns about five kinds of object that are not mistakes.
- **Contradiction 2** asked how many tests a default wrap breaks: 8, six of
  them the documented rule. The suite is not the evidence here, because it
  holds no third-party object.

### Recommendation

**Keep opt-in. Do (a) only inside a development build. Do not do (b).** The
decision is **before 1.0**, because the default cannot flip later. It changes
no code.

- The two defaults fail in mirror image. Opt-in is silent when a method is
  called through the store on an unmarked instance. Opt-out is silent when an
  object changes itself, is loud for `#private`, and walks into every graph.
  Opt-in's failure is the one a once-per-class warning can catch; opt-out's
  cannot be caught at all.
- **C1 changes the weight of the question.** A class the user owns becomes
  reactive wherever it is put by extending `ClassyStore`, with no marker, and
  it is then a store on its own as well. `PROXYABLE` stays for a class that
  has to extend something else and for `ReactiveMap` and `ReactiveSet`. What
  is left opaque by default is what should be: objects the user does not own.
- **`static [PROXYABLE] = false`** should be documented as "this class is
  opaque on purpose". It works today and costs nothing. **Can follow 1.0.**
- **`opaque(value)`**: not for 1.0. Under opt-in its only use is to silence
  the warning for a third-party class. It is 30 bytes or so and can be added
  when the warning ships and someone needs it.
- **Without a development build**, do not ship the warning. Put the sentence
  in the reference instead: "An instance of a class without `PROXYABLE` is
  kept by reference. A change to it notifies no one and shows in snapshots
  already taken."

### Cost for stage 4

- If (a) goes into a development build: about 30 lines in `core.ts`, tests
  for each case in the list of what it reports and what it leaves alone, and
  a stable code for the message. No production bytes.
- Docs: the sentence above, `static [PROXYABLE] = false`, and a pointer to
  `ClassyStore` in the section on nested class instances.
- No number in `CONSTRAINTS.md` moves.

## C4. Detecting an arrow-function method

- **Question.** For a class that does not extend the base class: can a field
  that holds an arrow function be told from other functions cheaply enough to
  warn about? M12 (b) in `merged.md`; MobX 8 (a function with no `prototype`,
  at creation); Solid 8 (compare the fields with the version, per call); item
  20 of "Proposals I think are wrong".
- **What was changed.** Two detectors, each alone on the unmodified
  worktree:
  - **(a) At creation, by the source text** (`c4.patch`): 39 lines added in
    `core.ts`. When a node is made for the first instance of a class, each
    own field that holds a function with no `prototype` is looked at. It is
    reported if its source is an arrow function that mentions `this`, or if
    its name is `bound x` and `x` is a method of the class. One warning per
    class, naming the fields. Plain objects and arrays return at the first
    test.
  - **(b) At the snapshot, by comparing** (`c4b.patch`): 31 lines added and 1
    removed in `snapshot.ts`. A cached snapshot is valid while its node's
    version stands. When one is handed out, the raw object's own fields are
    compared with it: a different value, a different object, or a list of a
    different length means something wrote to the raw object and not to the
    store. One warning per object, naming the first field.

### What each test says

Fourteen kinds of function field on one class (`repro/c4-cases.ts`, run by
`repro/c4.ts` for (a) and `repro/c4b.ts` for (b)). "Lost" means the field was
called through the store, state changed, and no subscriber was called.

| Field                                                        | A write is lost | No `prototype` (the MobX test) | (a) reports it   | (b) reports it |
| ------------------------------------------------------------ | --------------- | ------------------------------ | ---------------- | -------------- |
| An arrow function that writes `this.count`                   | Yes             | Yes                            | Yes              | Yes            |
| An `async` arrow function that writes                        | Yes             | Yes                            | Yes              | Yes            |
| An arrow function that pushes to `this.rows`                 | Yes             | Yes                            | Yes              | Yes            |
| An arrow function that replaces `this.rows`                  | Yes             | Yes                            | Yes              | Yes            |
| An arrow function that writes `this.deep[0].done`            | Yes             | Yes                            | Yes              | No             |
| A method bound in the constructor                            | Yes             | Yes                            | Yes, by its name | Yes            |
| An arrow function compiled to ES5 (`var _this = this`)       | Yes             | No                             | No               | Yes            |
| An arrow function that only reads `this`                     | No              | Yes                            | Yes              | No             |
| An arrow function that does not use `this`                   | No              | Yes                            | No               | No             |
| An arrow function with defaults, `(a = (1, 2), b = () => 3)` | No              | Yes                            | No               | No             |
| An arrow function made elsewhere, over another `this`        | No              | Yes                            | Yes, wrongly     | No             |
| An arrow function made elsewhere, without `this`             | No              | Yes                            | No               | No             |
| A method borrowed from another object                        | No              | Yes                            | No               | No             |
| A `function` expression assigned in the constructor          | No              | No                             | No               | No             |

Three more cases for (b), which (a) cannot see at all:

- A timer the constructor started that writes `this.ticks`: reported.
- A write through a reference to the raw object (stage 1 finding 11):
  reported.
- A class that extends `ClassyStore`: nothing to report, and nothing
  reported by either detector.

So:

- **The bare test of the MobX report is not usable.** It marks twelve of the
  fourteen, six of them harmless.
- **(a) finds six of the seven lost writes** and reports two fields that lose
  nothing. One of the two is a real false alarm: an arrow function handed in
  from outside that uses its own `this`. Its two tests cost 27 nanoseconds a
  function field, once per class; the `prototype` test alone costs 3.
- **(b) finds six of the seven and reports nothing that is not a lost
  write.** It misses a write two levels down, and it speaks only when a
  snapshot of that object is next asked for, which a framework binding does
  on every render.

### Result

| Measure                       | (a) at creation                                                    | (b) at the snapshot                                                                                         |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tests                         | 1,341 pass. The suite prints 1 warning                             | 1,341 pass. The suite prints 8 warnings                                                                     |
| Typecheck                     | Passes                                                             | Passes                                                                                                      |
| Main entry, with its sentence | 4,003 bytes, +342                                                  | 3,970 bytes, +309                                                                                           |
| Main entry, with a code only  | 3,917 bytes, +256                                                  | 3,829 bytes, +168                                                                                           |
| Timing                        | `create.small` and `create.rows` inside the spread on both engines | `snapshot.cached` on a store of four fields: 152 to 154 ns against 14 on Bun, 368 to 371 against 28 on Node |

### Item 20 of "Proposals I think are wrong"

It says that once a stored function is data, an own property that holds an
arrow function is no longer evidence of a mistake. Tested:

- **It holds against the bare test.** Half of what that test marks is
  harmless, and under T1 strict a callback in a field is exactly what the
  rule calls data.
- **It does not hold against (a) or (b).** T1 strict changes what the store
  does with a function in a field. It does not change what the function
  captured. An arrow function in a class field that mentions `this` still
  holds the raw instance, and its writes are still lost. `repro/c4.ts` gave
  the same warning on the build that has T1 strict in it as on the one that
  has not.
- What the item gets right is the shape of the answer: evidence has to be
  about a write that was lost, not about a kind of function. That is (b).

### Recommendation

**Do (b), in a development build only. Can follow 1.0.**

- It is exact, it covers the constructor's timer and the raw reference as
  well as the arrow function, and it survives a compiler that rewrites arrow
  functions.
- Without a development build, do neither. Each costs 170 to 340 bytes in
  production, a production bundle should not print, and (b) makes a cached
  snapshot eleven to thirteen times dearer, on the path every render takes.
  It cannot be done once per version: the write it looks for can come at any
  time after the snapshot was cached.
- (a) is not worth adding beside (b): 256 bytes more for one case (b) misses,
  a write two levels down, and one false alarm of its own.
- The detector of the Solid report (compare the fields before and after each
  call of a function field) was not built. It needs a wrapper around a
  function in a field, which T1 strict removes, so a development build would
  hand out a different function than production does.

### Cost for stage 4

- `snapshot.ts`, about 30 lines behind the development flag, and a stable
  code for the message.
- Tests: each row of the table, the three extra cases, once per object.
- The eight tests that write to a raw object on purpose would print the
  warning in a development run; they need the warning silenced or expected.
- No production bytes, no number in `CONSTRAINTS.md`.

## The combination

- **What is in it.** The two trap patches the orchestrating agent has taken
  (T3 (a), T1 strict), the base class, and W2. One patch,
  `c1-t1strict-w2.patch`: three files, 103 lines added, 28 removed. The two
  warnings recommended above (C3 (a) and C4 (b)) are for a development build
  and are not in it.
- **Tests:** 1,320 pass and 28 fail of 1,348, with the seven throwaway tests
  of the base class among the passes. The 28 are the 27 of the two trap
  patches and the export list. None is a regression.
- **Typecheck:** one error, in the test that pins the export list.
- **Size:** main entry 3,801 bytes, 140 more than today and 51 over the
  budget. Every other entry is inside its budget for what it adds. Of the
  140, the trap patches are 44, the base class 13 and W2 83.
- **Timings.** The whole core benchmark on saved copies of the unmodified
  build and of the combination, three runs each, the Bun pair run twice
  because the first was disturbed. Ratios to a forwarding Proxy, median and
  range:

  | Ratio           | Bun, unmodified                             | Bun, combination                            | Node, unmodified    | Node, combination   | Limit, Bun and Node |
  | --------------- | ------------------------------------------- | ------------------------------------------- | ------------------- | ------------------- | ------------------- |
  | Read            | 14.2 (13.9 to 14.5) and 15.5 (13.9 to 16.1) | 15.1 (12.6 to 29.9) and 13.9 (12.2 to 15.4) | 2.05 (2.01 to 2.06) | 2.09 (2.05 to 2.22) | 20 and 2.5          |
  | Write           | 2.74 (2.66 to 2.76) and 2.68 (2.64 to 2.69) | 2.76 (1.79 to 3.32) and 2.62 (2.61 to 2.69) | 1.35 (1.34 to 1.39) | 1.35 (1.25 to 1.36) | 3.2 and 1.7         |
  | Cached getter   | 31.1 (29.7 to 32.9) and 30.2 (30.0 to 31.3) | 24.8 (14.6 to 30.0) and 26.3 (23.8 to 31.8) | 3.58 (3.55 to 3.77) | 3.50 (3.41 to 3.58) | 41 and 5.3          |
  | Cached snapshot | 6.49 (6.49 to 7.02) and 7.36 (6.58 to 7.39) | 10.4 (5.38 to 10.7) and 6.37 (5.96 to 7.15) | 1.40 (1.35 to 1.42) | 1.35 (1.35 to 1.37) | 10 and 1.8          |

  Every pair of ranges touches, so no ratio moved. One median is over its
  limit, the cached snapshot in the disturbed Bun run, 10.4 against 10; the
  second run gave 6.37, and no patch here touches `snapshot.ts`. Per metric,
  three differences showed outside the spread in that session and two of
  them did not repeat when the builds were run back to back:
  - `array.pushPop` on Node, 4,030 ns against 3,337: repeated as 3,672 and
    3,857 against 3,642 and 4,004. No difference.
  - `store.method` on Node, 309 ns against 300: repeated as 303 and 303
    against 301 and 302. No difference.
  - `store.read` on Node, 50.7 ns (49.6 to 52.7) against 48.6 (47.5 to 48.9).
    Not repeated. The trap report timed T1 strict alone at 48.8 against 47.7,
    inside its spread.
- **With both warnings in the same build** (`all-with-warnings.patch`, for
  the size only): 4,313 bytes, 512 more. The same 28 tests fail and every
  reproduction gives the output it gave alone. That number is the case for
  keeping them out of production.

## Recommendation for API questions 4 and 6

### Question 4: arrow-function methods and `#private` fields

1. **Add `ClassyStore`, a base class, to the main entry.** A class that
   extends it is a store from its first line. Arrow-function fields, methods
   bound in the constructor and anything the constructor starts all write
   through the store. `createClassyStore(new X())` stays for a class that
   cannot extend it. It needs T3 (a). Decide before 1.0; the code can follow.
2. **Make an arrow-function field of such a class a transaction (W2).**
   Without it a loop in an arrow method is 30 to 150 times slower than the
   same loop in a method, and nothing says so.
3. **Say that a `#private` field is never state**, with the sentence in C2.
   No code.
4. **For a class that does not extend it, report a lost write in a
   development build** (C4 (b)). No warning in production.

### Question 6: opt-in or opt-out for nested class instances

1. **Keep opt-in.** `PROXYABLE` stays. Wrapping by default trades the silent
   failure we have for one no check can see (a stale copy of an object that
   changes itself), a `TypeError` for every class with `#private` fields,
   and a walk through every object graph placed in a store.
2. **A class that extends `ClassyStore` needs no marker.** It is reactive
   wherever it is put, because it is embedded by its proxy. That is the
   answer for a class the user owns.
3. **Document `static [PROXYABLE] = false`** as "opaque on purpose". It works
   today.
4. **Warn once per unmarked class in a development build** (C3 (a)). Without
   a development build, document the limit and do not warn.

### The public API this adds

| Addition                                                               | Entry                    | Kind                                                | Label                                 |
| ---------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------- |
| `ClassyStore`                                                          | `@codebelt/classy-store` | A value to extend, typed `new () => object`         | Decide before 1.0; can follow as code |
| "An arrow function in a field of a `ClassyStore` subclass is a method" | Docs                     | A rule beside the one of T1 strict                  | With `ClassyStore`                    |
| `static [PROXYABLE] = false`                                           | Docs                     | A documented meaning for a value that already works | Can follow 1.0                        |
| "A `#private` field is never state"                                    | Docs                     | A documented limit                                  | Can follow 1.0                        |
| Two warnings with stable codes                                         | A development build      | Diagnostics                                         | Can follow 1.0; needs M72             |

Not added: `opaque()`, a mixin form of the base class, and any warning in a
production build.

### What depends on what

- **`ClassyStore` needs T3 (a).** Where a compiler defines class fields, the
  first snapshot of a base-class store is wrong without it, and a later write
  changes that snapshot.
- **W2 sits on T1 strict.** On today's code an arrow field is wrapped on
  every read and is a transaction already, with the defects T1 removes.
- **G7b of the getter report conflicts with the base class as spiked.** It
  makes `set` and `deleteProperty` throw "while any getter is running". A
  base-class store made inside a getter, or inside a method a getter calls,
  writes its own fields while that getter runs. If G7b is taken it has to
  exempt a write to a node other than the getter's own, and it has to cover
  `defineProperty` once T3 (a) makes that a write. Reasoning from the getter
  report's description; not run.
- **M60 (undo replaces every row) decides limit 3 of C1.** If undo and
  DevTools restore a nested object in place, a nested base-class store stays
  the store it was and its arrow functions stay right.
- **M33 (where snapshot getters live) decides one row of C2**: whether
  `JSON.stringify(snapshot)` of a class with a getter over `#private` throws.
- **M72 (a development build) decides whether the two warnings exist.**

### The order for stage 4

1. T3 (a) and T1 strict, as the trap report orders them.
2. `ClassyStore`: the export, its tests, the export-list tests.
3. W2, as its own commit, with the transaction table as its tests.
4. Docs: the arrow-function section, the `#private` sentence, the nested
   class section with `PROXYABLE` true and false and the base class.
5. After M72: the lost-write check, then the unmarked-class warning.

## Verified and not verified

**Run, with the result in this report:**

- The unmodified worktree: `bun run test`, the typecheck, `bun run size`,
  `bun run benchmark:core` and `bun run benchmark:core:node` with five runs
  each.
- `bun run test` and `bun run size` for: the base class alone; the base
  class on T3 (a); the two trap patches together; the base class on both;
  the same with wrap on read, with W1 and with W2; C3 (a) and (b); C4 (a)
  and (b); and everything recommended in one build. Size only, for the two
  shorter forms of each warning.
- The typecheck for: the base class on T3 (a), the combination, C3 (a), C3
  (b), C4 (a) and C4 (b).
- Every reproduction in appendix D, before and after, and the seven
  throwaway tests of the base class with React, `persist`, `devtools`,
  `withHistory` and `subscribeKey`, on the base class with and without T3
  (a) and on the combination.
- The reproductions of C1, C3 and C4 again on the build that holds
  everything: the same output as each spike alone.
- Timings on saved copies of each build, on both engines: construction and
  the 1,000-write loop (two rounds), reads and writes of opaque values (two
  rounds), the write metrics of the core benchmark (three runs), and the
  whole core benchmark on the unmodified build and on the combination
  (three runs).
- Both forms of the base class, as a class and as a function: lint, types,
  size and the reproduction.
- Every patch in appendix B was made by `git diff` in the worktree. I did
  not extract them from this file again and apply them.

**Read or reasoned, not run:**

- That a browser gives `Event`, `File`, `FormData`, a style object and a
  class list a tag of their own. happy-dom does not; no browser was run.
- That private fields cannot be put on a snapshot (C2).
- That G7b of the getter report would throw when a base-class store is made
  inside a getter. I read its description; I did not apply its patch.
- That in-place restore (M60) would mend undo of a nested base-class store.
- That the Next.js example compiles class fields to assignments. Its
  `tsconfig.json` targets ES2017; I did not check what its compiler does
  with that.
- The detector of the Solid report (compare fields before and after a call).
- Each failing test was classed from its name and from the trap report's
  reading of it. I read the body of the eight that fail under C3 (b) and of
  the export-list test, and no other.
- The warnings were written as always-on code. None was built behind a
  development flag, so "no production bytes" is what a development build
  would give by construction, not a measurement.

**Not run at all:**

- The browser, framework, React compatibility, Next.js, Angular, memory and
  mutation suites, `bun run test:coverage`, `bun run check:floor`, and
  `bun run lint` on the spike code, except the three files of the base
  class. The brief excludes the first group. Spike code was not written to
  pass lint or coverage: W2 as written trips `noParameterAssign` once.
- `benchmark:react` and the React memory harness. W2 keeps one wrapper per
  arrow function in a `WeakMap`; that it holds nothing alive is reasoning.
- The official commands `bun run benchmark:core` and
  `bun run benchmark:core:node` on a spike. The comparisons ran the same
  script on a saved copy of each build, so that both builds ran in one
  session.
- A class compiled by TypeScript with `useDefineForClassFields: false`, by
  Babel or by SWC. The reproduction writes the assignments by hand, which is
  what those compilers emit.
- The base class under Vue, Svelte, Solid and Angular adapters. Only React
  was run.

**Limits of the timings.** The machine ran other agents the whole time, with
a load average between 25 and 50 on ten cores. A baseline run of the core
benchmark gave a cached getter anywhere from 11 to 956 times a forwarding
Proxy on Bun. I report a difference only where two ranges do not touch, and
the large ones (150 ms against 1 ms) do not depend on the noise. Nothing here
is fit to set a limit in `CONSTRAINTS.md`.

## Appendix A: how to run a spike again

Nothing below depends on the scratch folder still being there.

1. Make a throwaway worktree of `release/1.0` at `57404c3` or later (the
   library source is the same up to `74966f1`) and run
   `bun install --frozen-lockfile` in it, then `bun run build` once.
2. Save a patch from appendix B to a file and run `git apply <file>` at the
   worktree root. Each patch says what it applies to. The four patches for
   C1 after the first are steps: apply `t3a-t1strict.patch`, then
   `base-class.patch`, then one of `w2.patch`, `w1.patch` or
   `wrap-on-read.patch`. The patches for C3 and C4 apply to the unmodified
   commit. To put the two warnings on top of the C1 build, apply `c3a.patch`
   and `c4.patch` with `patch -p1`, which accepts the moved lines.
3. Run `bun run test`, then `bun run size`, then
   `bun run --filter @codebelt/classy-store typecheck`.
4. For a reproduction, save `lib.ts` and the script from appendix D next to
   each other in a folder beside the worktree folder `wt`, set `CLASSY_REPO`
   to the unmodified checkout, and run `bun <script> before` and
   `bun <script> after`. `before` imports the unmodified source, `after` the
   worktree. The two test files go into `packages/classy-store/src/core/` of
   the worktree and run with `bun test <file>` from the package folder.
5. The timings were made on saved copies of each build: `dist/`,
   `tests/benchmark/` and `package.json` copied into a folder of its own
   under the worktree's package, so that each copy resolves `#store-runtime`
   to itself. `bench-create.mjs` and `bench-opaque.mjs` take such a folder as
   their argument and run under `bun` and `node`.

## Appendix B: patches

### `t3a-t1strict.patch`

The base for C1: `t3a.patch` and `t1-strict.patch` of `spike-traps.md` together, with the one line dropped that the two cannot share. Applies to the unmodified commit.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..a33e42b 100644
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
 
@@ -500,16 +499,34 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
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
@@ -517,7 +534,6 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const deleted = Reflect.deleteProperty(_target, prop);
       if (deleted) {
         internal.detach(prop);
-        boundMethods.delete(prop);
         notifyMutation(internal);
       }
       return deleted;
```

### `base-class.patch`

C1, the base class. Applies on top of `t3a-t1strict.patch`.

````diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index a33e42b..056ed3f 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -586,6 +586,28 @@ export function createClassyStore<T extends object>(instance: T): T {
   return node.proxy as T;
 }
 
+/**
+ * A base class whose constructor returns the store. A class that extends it is
+ * a store from its first line: field initialisers, the constructor body and
+ * arrow-function fields all see the store as `this`.
+ *
+ * @example
+ * ```ts
+ * class Todos extends ClassyStore {
+ *   items: string[] = [];
+ *   add = (text: string) => {
+ *     this.items.push(text);
+ *   };
+ * }
+ * const todos = new Todos(); // already a store
+ * ```
+ */
+// A function, not a class: a class constructor that returns a value is what
+// the lint rule `noConstructorReturn` forbids, and this one has to.
+export const ClassyStore = function (this: object) {
+  return createClassyStore(this);
+} as unknown as new () => object;
+
 /**
  * Subscribe to changes in a store, or in the subtree under one of its nested
  * proxies. By default, the callback fires once per batched mutation turn
diff --git a/packages/classy-store/src/index.ts b/packages/classy-store/src/index.ts
index c98dc14..8117a25 100644
--- a/packages/classy-store/src/index.ts
+++ b/packages/classy-store/src/index.ts
@@ -5,7 +5,13 @@
  *
  * @module @codebelt/classy-store
  */
-export {batch, createClassyStore, snapshot, subscribe} from './storeRuntime';
+export {
+  batch,
+  ClassyStore,
+  createClassyStore,
+  snapshot,
+  subscribe,
+} from './storeRuntime';
 export type {Snapshot, SubscribeOptions} from './types';
 export {shallowEqual} from './utils/equality/equality';
 export {PROXYABLE} from './utils/internal/internal';
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..aa86fa1 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -2,6 +2,7 @@
 export {createProxy, isChanged} from 'proxy-compare';
 export {
   batch,
+  ClassyStore,
   createClassyStore,
   getInternal,
   getVersion,
````

### `w2.patch`

C1, W2: an arrow function written to a field of a base-class store becomes one transaction wrapper. Applies on top of `base-class.patch`. Recommended.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 056ed3f..3635087 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -327,6 +327,31 @@ function deliver(
   }
 }
 
+/** An arrow function and the method made of it; a method maps to itself. */
+const arrowMethods = new WeakMap<object, unknown>();
+
+/**
+ * An arrow function written to a field of a class that extends `ClassyStore`
+ * is a method of it. The field holds one wrapper that runs the function as a
+ * transaction, and the store, its snapshots and every read share it. An arrow
+ * function has no `prototype` of its own; a class or a `function` has one and
+ * stays data.
+ */
+function asMethod(value: unknown, store: object): unknown {
+  if (
+    typeof value !== 'function' ||
+    Object.hasOwn(value, 'prototype') ||
+    !(store instanceof ClassyStore)
+  )
+    return value;
+  let method = arrowMethods.get(value);
+  if (!method) {
+    method = transactional(value as (...args: unknown[]) => unknown, store);
+    arrowMethods.set(value, method).set(method as object, method);
+  }
+  return method;
+}
+
 /**
  * Being frozen is permanent, so a positive answer is remembered: asking a large
  * frozen array again would scan every element on each read.
@@ -406,7 +431,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       const value: unknown =
         typeof incoming === 'object' && incoming !== null
           ? (trackedSnapshots.get(incoming) ?? incoming)
-          : incoming;
+          : asMethod(incoming, proxy);
       const descriptor = findPropertyDescriptor(_target, prop);
       if (descriptor && !('value' in descriptor)) {
         // Setters perform their own writes. Use the proxy as `this` so nested
@@ -501,6 +526,11 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     defineProperty(_target, prop, descriptor) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      if (typeof descriptor.value === 'function')
+        descriptor = {
+          ...descriptor,
+          value: asMethod(descriptor.value, proxy),
+        };
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
       // The bookkeeping of a write: the property's value is its child, or it
```

### `w1.patch`

C1, W1: the same wrapper, made only when a field is defined. Applies on top of `base-class.patch`. Not recommended.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 056ed3f..0ffc6a6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -398,6 +398,25 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
 
   /** One wrapper per method, so every read returns the same reference. */
   const boundMethods = new WeakMap<object, (...args: unknown[]) => unknown>();
+  /**
+   * An arrow function written to a field of a class that extends
+   * `ClassyStore` is a method of it: the field holds one transaction wrapper,
+   * which the store, its snapshots and every read then share.
+   */
+  const asField = (value: unknown): unknown => {
+    if (
+      typeof value !== 'function' ||
+      Object.hasOwn(value, 'prototype') ||
+      !(target instanceof ClassyStore)
+    )
+      return value;
+    let bound = boundMethods.get(value);
+    if (!bound) {
+      bound = transactional(value as (...args: unknown[]) => unknown, proxy);
+      boundMethods.set(value, bound);
+    }
+    return bound;
+  };
 
   const proxy = new Proxy(target, {
     set(_target, prop, incoming, receiver) {
@@ -501,6 +520,8 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
     defineProperty(_target, prop, descriptor) {
       internal.resumeScope();
       const before = Object.getOwnPropertyDescriptor(_target, prop);
+      if (typeof descriptor.value === 'function')
+        descriptor = {...descriptor, value: asField(descriptor.value)};
       if (!Reflect.defineProperty(_target, prop, descriptor)) return false;
       const own = Object.getOwnPropertyDescriptor(_target, prop);
       // The bookkeeping of a write: the property's value is its child, or it
```

### `wrap-on-read.patch`

C1, wrap on read: a flag on the node makes the `get` trap treat an own function as a method. Applies on top of `base-class.patch`. Not recommended.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 056ed3f..70bd13d 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -479,7 +479,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
       if (
         typeof value === 'function' &&
         prop !== 'constructor' &&
-        !Object.hasOwn(_target, prop)
+        (internal.ownMethods || !Object.hasOwn(_target, prop))
       ) {
         const method = value as (...args: unknown[]) => unknown;
         let bound = boundMethods.get(method);
@@ -605,7 +605,10 @@ export function createClassyStore<T extends object>(instance: T): T {
 // A function, not a class: a class constructor that returns a value is what
 // the lint rule `noConstructorReturn` forbids, and this one has to.
 export const ClassyStore = function (this: object) {
-  return createClassyStore(this);
+  const node = createNode(this);
+  // A function in a field of such a class is an arrow-function method.
+  node.ownMethods = node.isStoreRoot = true;
+  return node.proxy;
 } as unknown as new () => object;
 
 /**
diff --git a/packages/classy-store/src/core/ownership.ts b/packages/classy-store/src/core/ownership.ts
index 69843a3..0e91508 100644
--- a/packages/classy-store/src/core/ownership.ts
+++ b/packages/classy-store/src/core/ownership.ts
@@ -6,6 +6,7 @@ type ParentReference = {deref(): StoreInternal | undefined};
 export class StoreInternal {
   version = 0;
   isStoreRoot = false;
+  ownMethods = false;
   // Each subscribe() call owns one entry, so the same callback can be
   // registered more than once and released independently.
   readonly batchedListeners = new Set<() => void>();
```

### `c1-alone.patch`

C1 on the unmodified commit, in the class form that the lint rule refuses. Used for the size and the test count of the base class alone.

````diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..b9f12a6 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -570,6 +570,28 @@ export function createClassyStore<T extends object>(instance: T): T {
   return node.proxy as T;
 }
 
+/**
+ * A base class whose constructor returns the store. A class that extends it is
+ * a store from its first line: field initialisers, the constructor body and
+ * arrow-function fields all see the store as `this`.
+ *
+ * @example
+ * ```ts
+ * class Todos extends ClassyStore {
+ *   items: string[] = [];
+ *   add = (text: string) => {
+ *     this.items.push(text);
+ *   };
+ * }
+ * const todos = new Todos(); // already a store
+ * ```
+ */
+export class ClassyStore {
+  constructor() {
+    return createClassyStore(this);
+  }
+}
+
 /**
  * Subscribe to changes in a store, or in the subtree under one of its nested
  * proxies. By default, the callback fires once per batched mutation turn
diff --git a/packages/classy-store/src/index.ts b/packages/classy-store/src/index.ts
index c98dc14..8117a25 100644
--- a/packages/classy-store/src/index.ts
+++ b/packages/classy-store/src/index.ts
@@ -5,7 +5,13 @@
  *
  * @module @codebelt/classy-store
  */
-export {batch, createClassyStore, snapshot, subscribe} from './storeRuntime';
+export {
+  batch,
+  ClassyStore,
+  createClassyStore,
+  snapshot,
+  subscribe,
+} from './storeRuntime';
 export type {Snapshot, SubscribeOptions} from './types';
 export {shallowEqual} from './utils/equality/equality';
 export {PROXYABLE} from './utils/internal/internal';
diff --git a/packages/classy-store/src/storeRuntime.ts b/packages/classy-store/src/storeRuntime.ts
index 400807d..aa86fa1 100644
--- a/packages/classy-store/src/storeRuntime.ts
+++ b/packages/classy-store/src/storeRuntime.ts
@@ -2,6 +2,7 @@
 export {createProxy, isChanged} from 'proxy-compare';
 export {
   batch,
+  ClassyStore,
   createClassyStore,
   getInternal,
   getVersion,
````

### `c3a.patch`

C3 (a): a warning once per unmarked class. Applies to the unmodified commit.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..3befc5e 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -3,6 +3,7 @@ import {
   canProxy,
   findPropertyDescriptor,
   getArrayIndex,
+  PROXYABLE,
 } from '../utils/internal/internal';
 import type {DepEntry} from './core.types';
 import {StoreInternal} from './ownership';
@@ -346,6 +347,28 @@ function isReadOnly(descriptor: PropertyDescriptor | undefined): boolean {
   return descriptor?.configurable === false && descriptor.writable === false;
 }
 
+/** Classes whose instances were looked at once already, by prototype. */
+const checkedClasses = new WeakSet<object>();
+
+/**
+ * An unmarked class instance is kept by reference: a change to it notifies no
+ * one and shows in snapshots already taken. Say so once per class.
+ */
+function reportOpaqueInstance(value: object): void {
+  const proto = Object.getPrototypeOf(value);
+  if (!proto || checkedClasses.has(proto) || Object.isFrozen(value)) return;
+  checkedClasses.add(proto);
+  const ctor = proto.constructor;
+  if (
+    (ctor && PROXYABLE in ctor) ||
+    Object.prototype.toString.call(value) !== '[object Object]'
+  )
+    return;
+  console.warn(
+    `@codebelt/classy-store: a ${ctor?.name} instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.`,
+  );
+}
+
 /**
  * Make `value` a child of `owner` at `key`, creating its proxy on first sight.
  * Returns nothing when the value stays as it is: a primitive, an opaque type,
@@ -365,7 +388,12 @@ function linkChild(
   if (!existing) {
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
-    if (!canProxy(value) || isImmutableValue(value)) return;
+    if (!canProxy(value)) {
+      // A descriptor is passed where a value enters the store, not on a read.
+      if (descriptor) reportOpaqueInstance(value);
+      return;
+    }
+    if (isImmutableValue(value)) return;
     if (
       isReadOnly(
         descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
```

### `c3b.patch`

C3 (b): wrap class instances by default, with `opaque()`. Applies to the unmodified commit.

```diff
diff --git a/packages/classy-store/src/index.ts b/packages/classy-store/src/index.ts
index c98dc14..491b4f3 100644
--- a/packages/classy-store/src/index.ts
+++ b/packages/classy-store/src/index.ts
@@ -8,4 +8,4 @@
 export {batch, createClassyStore, snapshot, subscribe} from './storeRuntime';
 export type {Snapshot, SubscribeOptions} from './types';
 export {shallowEqual} from './utils/equality/equality';
-export {PROXYABLE} from './utils/internal/internal';
+export {opaque, PROXYABLE} from './utils/internal/internal';
diff --git a/packages/classy-store/src/utils/internal/internal.ts b/packages/classy-store/src/utils/internal/internal.ts
index 3a6b73d..3458fc4 100644
--- a/packages/classy-store/src/utils/internal/internal.ts
+++ b/packages/classy-store/src/utils/internal/internal.ts
@@ -59,26 +59,51 @@ export function isPlainObject(
   return proto === objectProto || proto === null;
 }
 
+/** Objects their owner marked with `opaque()`. Kept here, not on the object. */
+const opaqueValues = new WeakSet<object>();
+
+/**
+ * Keep one object out of the store's reach: it is held by reference, never
+ * proxied and never copied into a snapshot.
+ */
+export function opaque<T extends object>(value: T): T {
+  opaqueValues.add(value);
+  return value;
+}
+
+/** The verdict for every instance of a class, by prototype. */
+const proxyableClasses = new WeakMap<object, boolean>();
+const tagOf = Object.prototype.toString;
+
 /**
  * Central gatekeeper for the proxy system: determines which values get wrapped
  * in child proxies (`core.ts`) or deep-cloned in snapshots (`snapshot.ts`).
  *
- * Returns `true` for arrays, plain objects, and class instances that opt-in
- * via `static [PROXYABLE] = true`. Everything else (Date, Map, Set, class
- * instances without PROXYABLE, primitives) is left as-is.
+ * Returns `true` for arrays, plain objects and ordinary class instances. A
+ * platform object (`Date`, `Map`, a DOM node: anything whose tag is not
+ * `[object Object]`), an object marked with `opaque()` and an instance of a
+ * class with `static [PROXYABLE] = false` are left as they are.
  */
 export function canProxy(value: unknown): value is object {
   if (typeof value !== 'object' || value === null) return false;
+  if (opaqueValues.has(value)) return false;
   if (Array.isArray(value)) return true;
-  // Allow class instances that opt-in via the PROXYABLE symbol.
-  // Read constructor from the prototype, NOT the instance, so that user data
-  // with a `constructor` field of its own can't trick the check.
   const proto = Object.getPrototypeOf(value);
-  const ctor = proto?.constructor;
-  if (ctor && (ctor as Record<symbol, unknown>)[PROXYABLE]) {
-    return true;
+  if (proto === null) return true;
+  let verdict = proxyableClasses.get(proto);
+  if (verdict === undefined) {
+    // Read constructor from the prototype, NOT the instance, so that user data
+    // with a `constructor` field of its own can't trick the check.
+    const marker = (proto.constructor as Record<symbol, unknown> | undefined)?.[
+      PROXYABLE
+    ];
+    verdict =
+      marker === undefined
+        ? tagOf.call(value) === '[object Object]'
+        : Boolean(marker);
+    proxyableClasses.set(proto, verdict);
   }
-  return isPlainObject(value);
+  return verdict;
 }
 
 /**
```

### `c4.patch`

C4 (a): report arrow-function fields and bound methods by their source, at creation. Applies to the unmodified commit.

```diff
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..550e2bf 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -389,6 +389,44 @@ function detachTruncatedChildren(
   }
 }
 
+/** Classes whose first instance was looked at, by prototype. */
+const inspectedClasses = new WeakSet<object>();
+const sourceOf = Function.prototype.toString;
+
+/**
+ * A function in a field that reaches the raw instance instead of the store:
+ * an arrow function that uses `this`, or a method bound in the constructor.
+ * Its writes notify no one. Looked for once per class, on its first instance.
+ */
+function reportRawThis(target: object): void {
+  const proto = Object.getPrototypeOf(target);
+  if (
+    !proto ||
+    proto === Object.prototype ||
+    Array.isArray(target) ||
+    inspectedClasses.has(proto)
+  )
+    return;
+  inspectedClasses.add(proto);
+  const fields = Reflect.ownKeys(target).filter((key) => {
+    const value = Object.getOwnPropertyDescriptor(target, key)?.value;
+    if (typeof value !== 'function' || Object.hasOwn(value, 'prototype'))
+      return false;
+    // `this.save = this.save.bind(this)` names the result "bound save".
+    if (value.name.startsWith('bound '))
+      return typeof proto[value.name.slice(6)] === 'function';
+    const source = sourceOf.call(value);
+    return (
+      /^(async\s+)?(\(|[\p{ID_Start}$_][\p{ID_Continue}$]*\s*=>)/u.test(source) &&
+      /\bthis\b/.test(source)
+    );
+  });
+  if (fields.length)
+    console.warn(
+      `@codebelt/classy-store: ${proto.constructor?.name}.${fields.map(String).join(', ')} is an arrow function or a bound method that uses \`this\`. There \`this\` is the raw instance, not the store, so its writes notify no one. Write it as a method, or extend ClassyStore.`,
+    );
+}
+
 // ── Create proxy (recursive) ──────────────────────────────────────────────────
 
 /** Register one write proxy for the target and index its outgoing data edges. */
@@ -534,6 +572,7 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
   } else {
     const nodes = [internal];
     for (const owner of nodes) {
+      reportRawThis(owner.target);
       for (const key of Reflect.ownKeys(owner.target)) {
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
         if (desc && 'value' in desc)
```

### `c4b.patch`

C4 (b): report a write that went around the store, when a cached snapshot is handed out. Applies to the unmodified commit.

```diff
diff --git a/packages/classy-store/src/snapshot/snapshot.ts b/packages/classy-store/src/snapshot/snapshot.ts
index afd3c51..9ccbcf6 100644
--- a/packages/classy-store/src/snapshot/snapshot.ts
+++ b/packages/classy-store/src/snapshot/snapshot.ts
@@ -1,5 +1,5 @@
 import {markToTrack} from 'proxy-compare';
-import {getInternal, registerSnapshot} from '../core/core';
+import {getInternal, identityOf, registerSnapshot} from '../core/core';
 import type {StoreInternal} from '../core/ownership';
 import type {Snapshot} from '../types';
 import {mapOwnArrayElements} from '../utils/internal/internal';
@@ -161,6 +161,35 @@ function evaluateSnapshotGetter(
   return result;
 }
 
+/** Objects already reported, so one mistake is one warning. */
+const reportedTargets = new WeakSet<object>();
+
+/**
+ * A snapshot is current while its node's version stands. If the raw object
+ * no longer matches it, something wrote to the raw object and not to the
+ * store: an arrow-function field, a method bound in the constructor, a timer
+ * the constructor started, or a reference to the raw instance.
+ */
+function reportBypassedWrite(target: object, snap: object): void {
+  if (Array.isArray(target) || reportedTargets.has(target)) return;
+  for (const key of Reflect.ownKeys(target)) {
+    const descriptor = Object.getOwnPropertyDescriptor(target, key);
+    if (!descriptor || !('value' in descriptor)) continue;
+    const now: unknown = descriptor.value;
+    const then: unknown = (snap as Record<string | symbol, unknown>)[key];
+    if (
+      Object.is(identityOf(now), identityOf(then)) &&
+      !(Array.isArray(now) && now.length !== (then as unknown[]).length)
+    )
+      continue;
+    reportedTargets.add(target);
+    console.warn(
+      `@codebelt/classy-store: ${Object.getPrototypeOf(target)?.constructor?.name}.${String(key)} changed without the store being told, so no subscriber was called. The write reached the raw object: an arrow-function field, a method bound in the constructor, a timer or callback the constructor started, or a reference to the instance kept from before createClassyStore(). Write it as a method, or extend ClassyStore.`,
+    );
+    return;
+  }
+}
+
 // ── Internal helpers ──────────────────────────────────────────────────────────
 
 function markSnapshotForTracking(value: object): void {
@@ -240,6 +269,7 @@ function createSnapshotRecursive<T extends object>(
   // Cache hit: version unchanged → return the same frozen snapshot reference.
   const cached = snapshotCache.get(target);
   if (cached && cached[0] === internal.version) {
+    reportBypassedWrite(target, cached[1]);
     return cached[1] as T;
   }
 
```

## Appendix C: the failing tests of each spike

As `bun run test` prints them, sorted.

### The combination: the base class and W2 on T3 (a) and T1 strict

28 tests. The same 28 fail without W2, and with both warnings added.

```text
(fail) Object.defineProperty on a store: a new data property > holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy
(fail) Object.defineProperty on a store: a new data property > is live at once, notifies no one, and is missing from the snapshot cached before it
(fail) Object.defineProperty on a store: a new data property > reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds
(fail) Object.defineProperty on a store: accessors, and several properties at once > Object.defineProperties defines each property and notifies no one
(fail) Object.defineProperty on a store: accessors, and several properties at once > a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write
(fail) Object.defineProperty on a store: an existing property > a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write
(fail) Object.defineProperty on a store: an existing property > a field redefined from an object to a primitive keeps returning the old object
(fail) Object.defineProperty on a store: an existing property > a redefined object is ignored: reads, writes and snapshots stay on the old object, even after it is assigned
(fail) Object.defineProperty on a store: an existing property > a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind
(fail) an array element redefined from an object to a value that is not an object > shows a number in a snapshot while the store still returns the old object
(fail) an array element redefined from an object to a value that is not an object > shows null in a snapshot while the store still returns the old object
(fail) an object held from a container that left the store > does not tell a subscriber added right after the container was frozen about a write to a child it shares with the store
(fail) an object held from a container that left the store > gives a stale first snapshot, and a current second one, once the container was frozen
(fail) an object under a field that was frozen on a parent that had already left the store > does not tell a subscriber added after the freeze about a change under it
(fail) an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot in the same way when the parent lost its last subscriber after it left the store
(fail) an object under a field that was frozen on a parent that had already left the store > returns its earlier snapshot once after a change under it, and a current one from then on
(fail) assigning __proto__ or calling Object.setPrototypeOf on a store > a method called before a prototype swap keeps the old body for good; one first called after it has the new body
(fail) functions read through a store > a class stored as data is read back as a wrapper without its static members
(fail) functions read through a store > a function held in a store array is not found by includes() or indexOf(), even when it was just read from that array
(fail) functions read through a store > a function stored as data is read back as one stable wrapper bound to the store, while the snapshot holds the original
(fail) functions read through a store > a method read from a store array is a new function on every read
(fail) functions read through a store > splice(indexOf(fn), 1) on a store array of functions removes the last function, not the one asked for
(fail) main entry point types > the entry exports six values and no others
(fail) notification order across stores > a store method that writes two stores notifies their sync subscribers when it returns, in the order they were first written
(fail) static getters > are not reachable through store.constructor, which is not the class
(fail) static getters > read through this.constructor are undefined on the store and correct on a snapshot
(fail) the well-known symbols a store is asked for > a nested array is an array to Array.isArray and Object.prototype.toString, and slice, filter and concat return plain arrays of proxies
(fail) writing the length of an array > a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element
```

### C3 (b)

```text
(fail) PROXYABLE > a class that opts in is reactive when nested, and keeps its prototype in snapshots
(fail) a getter that reads a Date, a Map, a frozen object or an unmarked class instance > is not re-run, and no one is notified, when the value is mutated in place
(fail) a getter that reads a Date, a Map, a frozen object or an unmarked class instance > is still not re-run after a later unrelated write, on the store or on the next snapshot
(fail) a getter that reads a Date, a Map, a frozen object or an unmarked class instance > keeps its result on the snapshot, whose own data does show the mutation
(fail) a store inside a store > is not connected when the raw class instance behind it is embedded instead of its proxy
(fail) canProxy > returns false for regular class instances
(fail) canProxy — additional > is not fooled by an own `constructor` data field on a plain object
(fail) main entry point types > the entry exports six values and no others
```

C1 alone, C3 (a), C4 (a) and C4 (b) fail no test except, for C1 alone, "main entry point types > the entry exports six values and no others".

## Appendix D: reproductions

Run with Bun 1.4.5. Each script takes `before` or `after`.

### `lib.ts`

```ts
// Shared by the reproductions. `before` imports the unmodified source of the
// main checkout; `after` imports the throwaway worktree, with a spike applied.
export const variant = process.argv[2] ?? 'after';
const scratch = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const repo = process.env.CLASSY_REPO ?? '<repo>';
export const root =
  variant === 'before'
    ? `${repo}/packages/classy-store/src`
    : `${scratch}/wt/packages/classy-store/src`;
const main = await import(`${root}/index.ts`);
export const {createClassyStore, snapshot, subscribe, batch, PROXYABLE} = main;
/** The export when the worktree has it; the stage 2 four-liner when it has not. */
export const ClassyStore: new () => object =
  main.ClassyStore ??
  class {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: the case under test
      return createClassyStore(this);
    }
  };
export const hasExport = Boolean(main.ClassyStore);
export const opaque: undefined | (<T extends object>(value: T) => T) =
  main.opaque;
export const {reactiveSet, reactiveMap} = await import(
  `${root}/collections/index.ts`
);
export const utils = await import(`${root}/utils/index.ts`);
export const out = (label: string, value: unknown) =>
  console.log(
    label.padEnd(72),
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
export const section = (title: string) =>
  console.log(`\n# ${variant}: ${title}`);
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
export const flush = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

### `c1.ts`

```ts
import {
  attempt,
  ClassyStore,
  createClassyStore,
  flush,
  hasExport,
  out,
  section,
  snapshot,
  subscribe,
  syncCalls,
} from './lib';

section('the export');
out('the main entry exports ClassyStore', hasExport);

section('a class that extends the base is a store');
{
  class Todos extends ClassyStore {
    items: {text: string; done: boolean}[] = [];
    filter = 'all';
    get open() {
      return this.items.filter((item) => !item.done).length;
    }
    add = (text: string) => {
      this.items.push({text, done: false});
    };
    rename(index: number, text: string) {
      this.items[index].text = text;
    }
  }
  const todos = new Todos();
  out(
    'subscribe(new Todos(), cb) is accepted',
    attempt(() => typeof subscribe(todos, () => {})),
  );
  out('createClassyStore(todos) === todos', createClassyStore(todos) === todos);
  out('todos instanceof Todos, instanceof ClassyStore', [
    todos instanceof Todos,
    todos instanceof ClassyStore,
  ]);
  out(
    'Object.getPrototypeOf(todos) === Todos.prototype',
    Object.getPrototypeOf(todos) === Todos.prototype,
  );
  out('todos.constructor === Todos', todos.constructor === Todos);
  out('Object.keys(todos)', Object.keys(todos));
  const first = snapshot(todos);
  out(
    'first snapshot: items frozen, before any read',
    Object.isFrozen(first.items),
  );
  out('first snapshot keys', Object.keys(first));
  out(
    'sync calls: arrow add(), called on the store',
    syncCalls(todos, () => todos.add('a')),
  );
  const {add} = todos;
  out(
    'sync calls: arrow add(), destructured',
    syncCalls(todos, () => add('b')),
  );
  out('snapshot after two adds: items.length, open', [
    snapshot(todos).items.length,
    snapshot(todos).open,
  ]);
  out('a new snapshot object after add()', snapshot(todos) !== first);
  out('store.add === store.add', todos.add === todos.add);
  out(
    'sync calls: prototype method rename()',
    syncCalls(todos, () => todos.rename(0, 'z')),
  );
  out(
    'live getter open after a row write',
    ((todos.items[0].done = true), todos.open),
  );
}

section('an arrow method that writes two fields');
{
  class Counter extends ClassyStore {
    count = 0;
    last = '';
    bump = () => {
      this.count++;
      this.last = 'bump';
    };
    bumpMethod() {
      this.count++;
      this.last = 'method';
    }
    bumpTwice() {
      this.bump();
      this.bump();
    }
  }
  const counter = new Counter();
  out(
    'sync calls: arrow that writes two fields',
    syncCalls(counter, () => counter.bump()),
  );
  out(
    'sync calls: prototype method that writes two fields',
    syncCalls(counter, () => counter.bumpMethod()),
  );
  out(
    'sync calls: prototype method that calls the arrow twice',
    syncCalls(counter, () => counter.bumpTwice()),
  );
  let batched = 0;
  subscribe(counter, () => batched++);
  counter.bump();
  await flush();
  out('batched calls: arrow that writes two fields', batched);
}

section('`this` kept by the constructor');
{
  const registry: object[] = [];
  class Clock extends ClassyStore {
    ticks = 0;
    constructor() {
      super();
      registry.push(this);
      setTimeout(() => {
        this.ticks++;
      }, 0);
    }
  }
  const clock = new Clock();
  out('the reference the constructor kept is the store', registry[0] === clock);
  let calls = 0;
  subscribe(clock, () => calls++, {sync: true});
  await flush();
  out('a timer started in the constructor: ticks, sync calls, snapshot', [
    clock.ticks,
    calls,
    snapshot(clock).ticks,
  ]);

  class PlainClock {
    ticks = 0;
    constructor() {
      setTimeout(() => {
        this.ticks++;
      }, 0);
    }
  }
  const plain = createClassyStore(new PlainClock());
  let plainCalls = 0;
  subscribe(plain, () => plainCalls++, {sync: true});
  const before = snapshot(plain);
  await flush();
  out('the same class without the base: ticks, sync calls, snapshot', [
    plain.ticks,
    plainCalls,
    snapshot(plain).ticks,
    snapshot(plain) === before,
  ]);
}

section('subclasses');
{
  class Base extends ClassyStore {
    id = 1;
    tags: string[] = ['a'];
    get label() {
      return `${this.id}:${this.tags.join()}`;
    }
    static made = 0;
    constructor() {
      super();
      Base.made++;
    }
  }
  class Derived extends Base {
    extra = {deep: {n: 1}};
    seen: string;
    constructor(readonly name: string) {
      super();
      this.seen = this.label; // a getter read while the store is being built
      this.tags.push(name);
    }
    get label() {
      return `${super.label}!${this.extra.deep.n}`;
    }
    static create(name: string) {
      return new this(name);
    }
  }
  const derived = Derived.create('x');
  out('derived instanceof Derived, Base, ClassyStore', [
    derived instanceof Derived,
    derived instanceof Base,
    derived instanceof ClassyStore,
  ]);
  out('static counter, constructor parameter property', [
    Base.made,
    derived.name,
  ]);
  out('getter read in the constructor, and now', [derived.seen, derived.label]);
  const snap = snapshot(derived);
  out('snapshot: tags frozen, extra.deep frozen, label', [
    Object.isFrozen(snap.tags),
    Object.isFrozen(snap.extra.deep),
    snap.label,
  ]);
  out(
    'sync calls: a deep write',
    syncCalls(derived, () => (derived.extra.deep.n = 2)),
  );
  out('label after the deep write: live, snapshot', [
    derived.label,
    snapshot(derived).label,
  ]);
  out('snapshot instanceof Derived', snapshot(derived) instanceof Derived);
}

section('a base-class store held in another store');
{
  class Item extends ClassyStore {
    done = false;
    constructor(public text: string) {
      super();
    }
    toggle = () => {
      this.done = !this.done;
    };
    get shout() {
      return this.text.toUpperCase();
    }
  }
  class List extends ClassyStore {
    items: Item[] = [];
    selected: Item | null = null;
    get remaining() {
      return this.items.filter((item) => !item.done).length;
    }
  }
  const list = new List();
  const item = new Item('milk');
  list.items.push(item);
  list.selected = item;
  out('list.items[0] === item, list.selected === item', [
    list.items[0] === item,
    list.selected === item,
  ]);
  const before = snapshot(list);
  out(
    'sync calls on the list: item.toggle() (no PROXYABLE)',
    syncCalls(list, () => item.toggle()),
  );
  const after = snapshot(list);
  out('list snapshot replaced, row snapshot frozen, row done, remaining', [
    after !== before,
    Object.isFrozen(after.items[0]),
    after.items[0].done,
    after.remaining,
  ]);
  out('row snapshot: getter, instanceof Item', [
    after.items[0].shout,
    after.items[0] instanceof Item,
  ]);
  out(
    'snapshot(list).selected === snapshot(list).items[0]',
    after.selected === after.items[0],
  );
  out(
    'snapshot(item) === snapshot(list).items[0]',
    snapshot(item) === after.items[0],
  );
  const plainHolder = createClassyStore({item});
  out(
    'held by a plain store: sync calls for item.toggle()',
    syncCalls(plainHolder, () => item.toggle()),
  );
}

section('functions on a snapshot');
{
  class Counter extends ClassyStore {
    count = 0;
    arrow = () => {
      this.count++;
    };
    method() {
      this.count++;
    }
  }
  const counter = new Counter();
  const snap = snapshot(counter);
  out('snapshot.arrow(): result, live count after', [
    attempt(() => snap.arrow()),
    counter.count,
  ]);
  out('snapshot.method(): result, live count after', [
    attempt(() => snap.method()),
    counter.count,
  ]);
  out('JSON.stringify(snapshot)', JSON.stringify(snapshot(counter)));
  out(
    'structuredClone(snapshot)',
    attempt(() => JSON.stringify(structuredClone(snapshot(counter)))),
  );
}

section(
  'construction inside a transaction, and a write in a field initialiser',
);
{
  const outer = createClassyStore({made: 0, child: null as null | object});
  class Child extends ClassyStore {
    n = 1;
    list = [1, 2];
  }
  class Maker {
    made = 0;
    child: Child | null = null;
    make() {
      this.child = new Child();
      this.made++;
    }
  }
  const maker = createClassyStore(new Maker());
  out(
    'sync calls: a method that builds a base-class store and keeps it',
    syncCalls(maker, () => maker.make()),
  );
  out(
    'snapshot(maker).child.list frozen',
    Object.isFrozen(snapshot(maker).child?.list),
  );
  void outer;
}

section('accessor fields, frozen in the constructor, a returned object');
{
  const made = attempt(() => {
    class WithAccessor extends ClassyStore {
      accessor value = 1;
    }
    const store = new WithAccessor();
    const calls = syncCalls(store, () => (store.value = 2));
    return `value after a write: ${store.value}, sync calls ${calls}, snapshot ${attempt(() => snapshot(store).value)}`;
  });
  out('`accessor value = 1`', made);
  class Frozen extends ClassyStore {
    n = 1;
    constructor() {
      super();
      Object.freeze(this);
    }
  }
  const frozen = new Frozen();
  out('Object.freeze(this) in the constructor: n, write', [
    frozen.n,
    attempt(() => ((frozen as {n: number}).n = 2)),
  ]);
}

section('undo and a nested base-class store');
{
  const {utils} = await import('./lib');
  class Item extends ClassyStore {
    done = false;
    toggleArrow = () => {
      this.done = !this.done;
    };
    toggleMethod() {
      this.done = !this.done;
    }
  }
  class List extends ClassyStore {
    items: Item[] = [];
    title = 'a';
  }
  const list = new List();
  const history = utils.withHistory(list);
  const original = new Item();
  list.items.push(original);
  await flush();
  list.title = 'b';
  await flush();
  history.undo();
  const row = list.items[0];
  out('after undo: the row is the same store', row === original);
  out('after undo: the row is frozen', Object.isFrozen(row));
  out(
    'after undo: row.toggleMethod()',
    attempt(
      () =>
        `sync calls on the list ${syncCalls(list, () => row.toggleMethod())}, row.done ${row.done}`,
    ),
  );
  out(
    'after undo: row.toggleArrow()',
    attempt(
      () =>
        `sync calls on the list ${syncCalls(list, () => row.toggleArrow())}, row.done ${row.done}, original.done ${original.done}`,
    ),
  );
  history.dispose();

  // The same with a root store: its own arrow method after an undo.
  class Root extends ClassyStore {
    n = 0;
    inc = () => {
      this.n++;
    };
  }
  const root = new Root();
  const rootHistory = utils.withHistory(root);
  root.inc();
  await flush();
  root.inc();
  await flush();
  rootHistory.undo();
  out('a root store after undo: n, then inc(), sync calls', [
    root.n,
    syncCalls(root, () => root.inc()),
    root.n,
  ]);
  rootHistory.dispose();
}

section('a snapshot taken before the first read, then a write');
{
  class Todos extends ClassyStore {
    items: string[] = [];
    add = (text: string) => {
      this.items.push(text);
    };
  }
  const todos = new Todos();
  const first = snapshot(todos);
  todos.add('a');
  out('the first snapshot still has no items', first.items.length === 0);
  out('the second snapshot has one', snapshot(todos).items.length);
}
```

Before, on the unmodified source with the four-line base class of stage 2:

```text

# before: the export
the main entry exports ClassyStore                                       false

# before: a class that extends the base is a store
subscribe(new Todos(), cb) is accepted                                   function
createClassyStore(todos) === todos                                       true
todos instanceof Todos, instanceof ClassyStore                           [true,true]
Object.getPrototypeOf(todos) === Todos.prototype                         true
todos.constructor === Todos                                              false
Object.keys(todos)                                                       ["items","filter","add"]
first snapshot: items frozen, before any read                            false
first snapshot keys                                                      ["items","filter","add","open"]
sync calls: arrow add(), called on the store                             1
sync calls: arrow add(), destructured                                    1
snapshot after two adds: items.length, open                              [2,2]
a new snapshot object after add()                                        true
store.add === store.add                                                  true
sync calls: prototype method rename()                                    1
live getter open after a row write                                       1

# before: an arrow method that writes two fields
sync calls: arrow that writes two fields                                 1
sync calls: prototype method that writes two fields                      1
sync calls: prototype method that calls the arrow twice                  1
batched calls: arrow that writes two fields                              1

# before: `this` kept by the constructor
the reference the constructor kept is the store                          true
a timer started in the constructor: ticks, sync calls, snapshot          [1,1,1]
the same class without the base: ticks, sync calls, snapshot             [1,0,0,true]

# before: subclasses
derived instanceof Derived, Base, ClassyStore                            [true,true,true]
static counter, constructor parameter property                           [1,"x"]
getter read in the constructor, and now                                  ["1:a!1","1:a,x!1"]
snapshot: tags frozen, extra.deep frozen, label                          [true,true,"1:a,x!1"]
sync calls: a deep write                                                 1
label after the deep write: live, snapshot                               ["1:a,x!2","1:a,x!2"]
snapshot instanceof Derived                                              true

# before: a base-class store held in another store
list.items[0] === item, list.selected === item                           [true,true]
sync calls on the list: item.toggle() (no PROXYABLE)                     1
list snapshot replaced, row snapshot frozen, row done, remaining         [true,true,true,0]
row snapshot: getter, instanceof Item                                    ["MILK",true]
snapshot(list).selected === snapshot(list).items[0]                      true
snapshot(item) === snapshot(list).items[0]                               true
held by a plain store: sync calls for item.toggle()                      1

# before: functions on a snapshot
snapshot.arrow(): result, live count after                               [null,1]
snapshot.method(): result, live count after                              ["throws TypeError: Attempted to assign to readonly property.",1]
JSON.stringify(snapshot)                                                 {"count":1}
structuredClone(snapshot)                                                throws DOMException: The object can not be cloned.

# before: construction inside a transaction, and a write in a field initialiser
sync calls: a method that builds a base-class store and keeps it         1
snapshot(maker).child.list frozen                                        false

# before: accessor fields, frozen in the constructor, a returned object
`accessor value = 1`                                                     value after a write: 2, sync calls 0, snapshot throws TypeError: Cannot read from private field
Object.freeze(this) in the constructor: n, write                         [1,"throws TypeError: Proxy object's 'set' trap returned falsy value for property 'n'"]

# before: undo and a nested base-class store
after undo: the row is the same store                                    true
after undo: the row is frozen                                            false
after undo: row.toggleMethod()                                           sync calls on the list 1, row.done true
after undo: row.toggleArrow()                                            sync calls on the list 1, row.done false, original.done false
a root store after undo: n, then inc(), sync calls                       [1,1,2]

# before: a snapshot taken before the first read, then a write
the first snapshot still has no items                                    false
the second snapshot has one                                              1
```

After, on the combination:

```text

# after: the export
the main entry exports ClassyStore                                       true

# after: a class that extends the base is a store
subscribe(new Todos(), cb) is accepted                                   function
createClassyStore(todos) === todos                                       true
todos instanceof Todos, instanceof ClassyStore                           [true,true]
Object.getPrototypeOf(todos) === Todos.prototype                         true
todos.constructor === Todos                                              true
Object.keys(todos)                                                       ["items","filter","add"]
first snapshot: items frozen, before any read                            true
first snapshot keys                                                      ["items","filter","add","open"]
sync calls: arrow add(), called on the store                             1
sync calls: arrow add(), destructured                                    1
snapshot after two adds: items.length, open                              [2,2]
a new snapshot object after add()                                        true
store.add === store.add                                                  true
sync calls: prototype method rename()                                    1
live getter open after a row write                                       1

# after: an arrow method that writes two fields
sync calls: arrow that writes two fields                                 1
sync calls: prototype method that writes two fields                      1
sync calls: prototype method that calls the arrow twice                  1
batched calls: arrow that writes two fields                              1

# after: `this` kept by the constructor
the reference the constructor kept is the store                          true
a timer started in the constructor: ticks, sync calls, snapshot          [1,1,1]
the same class without the base: ticks, sync calls, snapshot             [1,0,0,true]

# after: subclasses
derived instanceof Derived, Base, ClassyStore                            [true,true,true]
static counter, constructor parameter property                           [1,"x"]
getter read in the constructor, and now                                  ["1:a!1","1:a,x!1"]
snapshot: tags frozen, extra.deep frozen, label                          [true,true,"1:a,x!1"]
sync calls: a deep write                                                 1
label after the deep write: live, snapshot                               ["1:a,x!2","1:a,x!2"]
snapshot instanceof Derived                                              true

# after: a base-class store held in another store
list.items[0] === item, list.selected === item                           [true,true]
sync calls on the list: item.toggle() (no PROXYABLE)                     1
list snapshot replaced, row snapshot frozen, row done, remaining         [true,true,true,0]
row snapshot: getter, instanceof Item                                    ["MILK",true]
snapshot(list).selected === snapshot(list).items[0]                      true
snapshot(item) === snapshot(list).items[0]                               true
held by a plain store: sync calls for item.toggle()                      1

# after: functions on a snapshot
snapshot.arrow(): result, live count after                               [null,1]
snapshot.method(): result, live count after                              ["throws TypeError: Attempted to assign to readonly property.",1]
JSON.stringify(snapshot)                                                 {"count":1}
structuredClone(snapshot)                                                throws DOMException: The object can not be cloned.

# after: construction inside a transaction, and a write in a field initialiser
sync calls: a method that builds a base-class store and keeps it         1
snapshot(maker).child.list frozen                                        true

# after: accessor fields, frozen in the constructor, a returned object
`accessor value = 1`                                                     value after a write: 2, sync calls 0, snapshot throws TypeError: Cannot read from private field
Object.freeze(this) in the constructor: n, write                         [1,"throws TypeError: Proxy object's 'set' trap returned falsy value for property 'n'"]

# after: undo and a nested base-class store
after undo: the row is the same store                                    true
after undo: the row is frozen                                            false
after undo: row.toggleMethod()                                           sync calls on the list 1, row.done true
after undo: row.toggleArrow()                                            sync calls on the list 1, row.done false, original.done false
a root store after undo: n, then inc(), sync calls                       [1,1,2]

# after: a snapshot taken before the first read, then a write
the first snapshot still has no items                                    true
the second snapshot has one                                              1
```

### `c1-callbacks.ts`

```ts
import {
  ClassyStore,
  createClassyStore,
  out,
  section,
  snapshot,
  syncCalls,
} from './lib';

section('a callback held in a field of a base-class store');
{
  const callback = () => 1;
  class Form extends ClassyStore {
    onSave: (() => number) | null = null;
    handlers: (() => number)[] = [];
    submit = () => this.onSave?.();
  }
  const form = new Form();
  form.onSave = callback;
  form.handlers.push(callback);
  out('form.onSave === callback', form.onSave === callback);
  out('form.onSave === form.onSave', form.onSave === form.onSave);
  out('form.handlers[0] === callback', form.handlers[0] === callback);
  out(
    'sync calls for form.onSave = form.onSave',
    syncCalls(form, () => {
      // biome-ignore lint/correctness/noSelfAssign: the case under test
      form.onSave = form.onSave;
    }),
  );
  out('snapshot(form).onSave === callback', snapshot(form).onSave === callback);
  out(
    'form.submit === snapshot(form).submit',
    form.submit === snapshot(form).submit,
  );
  const plain = createClassyStore({onSave: callback});
  out('a plain store: store.onSave === callback', plain.onSave === callback);
}

section(
  'how the fields arrive: defined by the class, or assigned in the constructor',
);
{
  // What TypeScript emits with `useDefineForClassFields: false`, which the
  // Angular CLI sets, and what Babel emits with `setPublicClassFields`.
  class Assigned extends ClassyStore {
    a!: number;
    b!: number;
    both!: () => void;
    constructor() {
      super();
      this.a = 0;
      this.b = 0;
      this.both = () => {
        this.a++;
        this.b++;
      };
    }
  }
  class Defined extends ClassyStore {
    a = 0;
    b = 0;
    both = () => {
      this.a++;
      this.b++;
    };
    viaFunction = function (this: Defined) {
      this.a++;
      this.b++;
    };
  }
  const assigned = new Assigned();
  const defined = new Defined();
  out(
    'defined field: sync calls for an arrow that writes two fields',
    syncCalls(defined, () => defined.both()),
  );
  out(
    'assigned field: sync calls for the same arrow',
    syncCalls(assigned, () => assigned.both()),
  );
  out(
    'defined field holding a function expression: sync calls',
    syncCalls(defined, () => defined.viaFunction()),
  );
  out('store.both === snapshot(store).both, defined and assigned', [
    defined.both === snapshot(defined).both,
    assigned.both === snapshot(assigned).both,
  ]);
  const {both} = defined;
  out(
    'destructured: sync calls',
    syncCalls(defined, () => both()),
  );
  out(
    'snapshot(defined).both(): sync calls',
    syncCalls(defined, () => snapshot(defined).both()),
  );
}

section(
  'a class and a function expression held in a field of a base-class store',
);
{
  class Model {
    static label = 'model';
  }
  class Holder extends ClassyStore {
    Model = Model;
    make = function () {
      return 1;
    };
  }
  const holder = new Holder();
  out('holder.Model === Model, holder.Model.label', [
    holder.Model === Model,
    holder.Model.label,
  ]);
  out(
    'new holder.Model() instanceof Model',
    new holder.Model() instanceof Model,
  );
}
```

On the base class with nothing more (`base-class.patch`):

```text

# after: a callback held in a field of a base-class store
form.onSave === callback                                                 true
form.onSave === form.onSave                                              true
form.handlers[0] === callback                                            true
sync calls for form.onSave = form.onSave                                 0
snapshot(form).onSave === callback                                       true
form.submit === snapshot(form).submit                                    true
a plain store: store.onSave === callback                                 true

# after: how the fields arrive: defined by the class, or assigned in the constructor
defined field: sync calls for an arrow that writes two fields            2
assigned field: sync calls for the same arrow                            2
defined field holding a function expression: sync calls                  2
store.both === snapshot(store).both, defined and assigned                [true,true]
destructured: sync calls                                                 2
snapshot(defined).both(): sync calls                                     2

# after: a class and a function expression held in a field of a base-class store
holder.Model === Model, holder.Model.label                               [true,"model"]
new holder.Model() instanceof Model                                      true
```

With `wrap-on-read.patch`:

```text

# after: a callback held in a field of a base-class store
form.onSave === callback                                                 false
form.onSave === form.onSave                                              true
form.handlers[0] === callback                                            true
sync calls for form.onSave = form.onSave                                 1
snapshot(form).onSave === callback                                       false
form.submit === snapshot(form).submit                                    false
a plain store: store.onSave === callback                                 true

# after: how the fields arrive: defined by the class, or assigned in the constructor
defined field: sync calls for an arrow that writes two fields            1
assigned field: sync calls for the same arrow                            1
defined field holding a function expression: sync calls                  1
store.both === snapshot(store).both, defined and assigned                [false,false]
destructured: sync calls                                                 1
snapshot(defined).both(): sync calls                                     2

# after: a class and a function expression held in a field of a base-class store
holder.Model === Model, holder.Model.label                               [false,null]
new holder.Model() instanceof Model                                      true
```

With `w1.patch`:

```text

# after: a callback held in a field of a base-class store
form.onSave === callback                                                 true
form.onSave === form.onSave                                              true
form.handlers[0] === callback                                            true
sync calls for form.onSave = form.onSave                                 0
snapshot(form).onSave === callback                                       true
form.submit === snapshot(form).submit                                    true
a plain store: store.onSave === callback                                 true

# after: how the fields arrive: defined by the class, or assigned in the constructor
defined field: sync calls for an arrow that writes two fields            1
assigned field: sync calls for the same arrow                            2
defined field holding a function expression: sync calls                  2
store.both === snapshot(store).both, defined and assigned                [true,true]
destructured: sync calls                                                 1
snapshot(defined).both(): sync calls                                     1

# after: a class and a function expression held in a field of a base-class store
holder.Model === Model, holder.Model.label                               [true,"model"]
new holder.Model() instanceof Model                                      true
```

With `w2.patch`:

```text

# after: a callback held in a field of a base-class store
form.onSave === callback                                                 false
form.onSave === form.onSave                                              true
form.handlers[0] === callback                                            true
sync calls for form.onSave = form.onSave                                 0
snapshot(form).onSave === callback                                       false
form.submit === snapshot(form).submit                                    true
a plain store: store.onSave === callback                                 true

# after: how the fields arrive: defined by the class, or assigned in the constructor
defined field: sync calls for an arrow that writes two fields            1
assigned field: sync calls for the same arrow                            1
defined field holding a function expression: sync calls                  2
store.both === snapshot(store).both, defined and assigned                [true,true]
destructured: sync calls                                                 1
snapshot(defined).both(): sync calls                                     1

# after: a class and a function expression held in a field of a base-class store
holder.Model === Model, holder.Model.label                               [true,"model"]
new holder.Model() instanceof Model                                      true
```

### `c1-undo.ts`

```ts
import {
  attempt,
  ClassyStore,
  flush,
  out,
  PROXYABLE,
  section,
  snapshot,
  syncCalls,
  utils,
} from './lib';

for (const marked of [false, true]) {
  section(
    `undo of a change inside a nested base-class store${marked ? ', class also marked PROXYABLE' : ''}`,
  );
  class Item extends ClassyStore {
    static [PROXYABLE] = marked;
    done = false;
    toggleArrow = () => {
      this.done = !this.done;
    };
    toggleMethod() {
      this.done = !this.done;
    }
  }
  class List extends ClassyStore {
    items: Item[] = [];
    selected: Item | null = null;
  }
  const list = new List();
  const history = utils.withHistory(list);
  const original = new Item();
  list.items.push(original);
  list.selected = original;
  await flush();
  original.toggleMethod();
  await flush();
  out('before undo: row.done', list.items[0].done);
  history.undo();
  const row = list.items[0];
  out('after undo: row.done', row.done);
  out('after undo: the row is the original store', row === original);
  out('after undo: the row is frozen', Object.isFrozen(row));
  out('after undo: selected is the row', list.selected === row);
  out('after undo: row instanceof Item', row instanceof Item);
  out(
    'after undo: row.toggleMethod()',
    attempt(
      () =>
        `sync calls on the list ${syncCalls(list, () => row.toggleMethod())}, row.done ${row.done}`,
    ),
  );
  out(
    'after undo: row.toggleArrow()',
    attempt(
      () =>
        `sync calls on the list ${syncCalls(list, () => row.toggleArrow())}, row.done ${row.done}, original.done ${original.done}`,
    ),
  );
  out('after undo: snapshot row done', snapshot(list).items[0].done);
  history.dispose();
}
```

On the combination. The unmodified source gives the same lines.

```text

# after: undo of a change inside a nested base-class store
before undo: row.done                                                    true
after undo: row.done                                                     false
after undo: the row is the original store                                false
after undo: the row is frozen                                            true
after undo: selected is the row                                          true
after undo: row instanceof Item                                          true
after undo: row.toggleMethod()                                           throws TypeError: Attempted to assign to readonly property.
after undo: row.toggleArrow()                                            sync calls on the list 0, row.done false, original.done false
after undo: snapshot row done                                            false

# after: undo of a change inside a nested base-class store, class also marked PROXYABLE
before undo: row.done                                                    true
after undo: row.done                                                     false
after undo: the row is the original store                                false
after undo: the row is frozen                                            false
after undo: selected is the row                                          true
after undo: row instanceof Item                                          true
after undo: row.toggleMethod()                                           sync calls on the list 1, row.done true
after undo: row.toggleArrow()                                            sync calls on the list 0, row.done true, original.done false
after undo: snapshot row done                                            true
```

### `classyStore.spike.test.tsx`

```tsx
// SPIKE, throwaway: the base class with the hooks and the utilities.
import {afterEach, describe, expect, expectTypeOf, mock, test} from 'bun:test';
import {act, type ReactNode, StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {useClassyStore, useLocalStore} from '../frameworks/react/react';
import {
  ClassyStore,
  createClassyStore,
  type Snapshot,
  snapshot,
  subscribe,
} from '../index';
import {devtools, persist, subscribeKey, withHistory} from '../utils/index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class Todos extends ClassyStore {
  items: {text: string; done: boolean}[] = [];
  filter: 'all' | 'open' = 'all';
  get open() {
    return this.items.filter((item) => !item.done).length;
  }
  add = (text: string) => {
    this.items.push({text, done: false});
  };
  clear() {
    this.items = [];
  }
}

const roots = new Map<Root, HTMLDivElement>();
function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.set(root, container);
  act(() => root.render(element));
  return {root, container};
}
afterEach(() => {
  for (const [root, container] of roots) {
    act(() => root.unmount());
    container.remove();
  }
  roots.clear();
});

describe('SPIKE base class: types', () => {
  test('new Todos() is typed as Todos, and its snapshot is deeply readonly', () => {
    const todos = new Todos();
    expectTypeOf(todos).toEqualTypeOf<Todos>();
    expectTypeOf<Snapshot<Todos>['items']>().toEqualTypeOf<
      ReadonlyArray<{readonly text: string; readonly done: boolean}>
    >();
    expectTypeOf<Snapshot<Todos>['open']>().toEqualTypeOf<number>();
    expectTypeOf<Snapshot<Todos>['add']>().toEqualTypeOf<
      (text: string) => void
    >();
    expectTypeOf(createClassyStore(todos)).toEqualTypeOf<Todos>();
    // A snapshot's field cannot be assigned in the type.
    const snap = snapshot(todos);
    expect(() => {
      // @ts-expect-error readonly
      snap.filter = 'open';
    }).toThrow(TypeError);
  });
});

describe('SPIKE base class: React', () => {
  test('useLocalStore(() => new Todos()) under StrictMode, arrow method as a handler', () => {
    let local: Todos | undefined;
    const renders = mock(() => {});
    function View() {
      const store = useLocalStore(() => new Todos());
      local = store;
      const state = useClassyStore(store);
      renders();
      return (
        <button type="button" onClick={() => state.add('x')}>
          {state.items.length}:{state.open}
        </button>
      );
    }
    const {container} = mount(
      <StrictMode>
        <View />
      </StrictMode>,
    );
    expect(container.textContent).toBe('0:0');
    const button = container.querySelector('button');
    act(() => button?.dispatchEvent(new MouseEvent('click', {bubbles: true})));
    expect(container.textContent).toBe('1:1');
    // The arrow method handed out by the store, with no component in between.
    act(() => local?.add('y'));
    expect(container.textContent).toBe('2:2');
    expect(createClassyStore(local as Todos)).toBe(local as Todos);
  });

  test('a selector re-renders after a detached arrow method', () => {
    const todos = new Todos();
    function Count() {
      return (
        <span>{useClassyStore(todos, (state) => state.items.length)}</span>
      );
    }
    const {container} = mount(<Count />);
    const {add} = todos;
    act(() => add('a'));
    expect(container.textContent).toBe('1');
  });
});

describe('SPIKE base class: utilities', () => {
  test('persist saves data fields only and restores into a new instance', async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (name: string) => data.get(name) ?? null,
      setItem: (name: string, value: string) => void data.set(name, value),
      removeItem: (name: string) => void data.delete(name),
    };
    const first = new Todos();
    const handle = persist(first, {name: 'todos', storage});
    await handle.hydrated;
    first.add('milk');
    first.filter = 'open';
    await flush();
    expect(JSON.parse(data.get('todos') as string).state).toEqual({
      items: [{text: 'milk', done: false}],
      filter: 'open',
    });
    handle.dispose();

    const second = new Todos();
    const restored = persist(second, {name: 'todos', storage});
    await restored.hydrated;
    expect(second.items).toEqual([{text: 'milk', done: false}]);
    expect(second.filter).toBe('open');
    // The arrow method still belongs to the second store.
    second.add('eggs');
    expect(snapshot(second).items.length).toBe(2);
    expect(first.items.length).toBe(1);
    restored.dispose();
  });

  test('withHistory undoes and redoes a write made by an arrow method', async () => {
    const todos = new Todos();
    const history = withHistory(todos);
    todos.add('a');
    await flush();
    todos.add('b');
    await flush();
    expect(todos.items.length).toBe(2);
    history.undo();
    expect(todos.items.length).toBe(1);
    expect(typeof todos.add).toBe('function');
    history.redo();
    expect(todos.items.length).toBe(2);
    // The arrow method still writes this store after a restore.
    todos.add('c');
    expect(snapshot(todos).items.length).toBe(3);
    history.dispose();
  });

  test('devtools sends the state without the arrow method and jumps back', async () => {
    let listener: ((message: unknown) => void) | undefined;
    const connection = {
      init: mock((_state: unknown) => {}),
      send: mock((_action: unknown, _state: unknown) => {}),
      subscribe: (next: (message: unknown) => void) => {
        listener = next;
        return () => {};
      },
    };
    (
      window as unknown as Record<string, unknown>
    ).__REDUX_DEVTOOLS_EXTENSION__ = {
      connect: () => connection,
    };
    const todos = new Todos();
    const tools = devtools(todos, {name: 'todos'});
    todos.add('a');
    await flush();
    expect(connection.send).toHaveBeenCalledTimes(1);
    const sent = connection.send.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.parse(JSON.stringify(sent))).toEqual({
      items: [{text: 'a', done: false}],
      filter: 'all',
      open: 1,
    });
    listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({items: [], filter: 'open'}),
    });
    expect(todos.items.length).toBe(0);
    expect(todos.filter).toBe('open');
    expect(typeof todos.add).toBe('function');
    tools.dispose();
    delete (window as unknown as Record<string, unknown>)
      .__REDUX_DEVTOOLS_EXTENSION__;
  });

  test('subscribeKey and subscribe see an arrow write', async () => {
    const todos = new Todos();
    const seen: string[] = [];
    const stop = subscribeKey(todos, 'filter', (value) => seen.push(value));
    const setOpen = () => {
      todos.filter = 'open';
    };
    setOpen();
    await flush();
    expect(seen).toEqual(['open']);
    stop();
    const calls = mock(() => {});
    subscribe(todos, calls, {sync: true});
    todos.add('x');
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
```

All seven pass on the combination, and on the base class without T3 (a).

### `c2.ts`

```ts
import {
  attempt,
  ClassyStore,
  createClassyStore,
  out,
  PROXYABLE,
  section,
  snapshot,
  syncCalls,
  utils,
} from './lib';

// One class body, built twice: once on no base and once on the base class.
// biome-ignore lint/suspicious/noExplicitAny: a mixin over two bases
const vault = (Base: new () => object): any =>
  class Vault extends Base {
    count = 0;
    #secret = 1;
    #rows: number[] = [];
    static #made = 0;
    constructor() {
      super();
      Vault.#made++;
    }
    get secret() {
      return this.#secret;
    }
    get mixed() {
      return this.#secret + this.count;
    }
    get rowCount() {
      return this.#rows.length;
    }
    bump() {
      this.#secret++;
    }
    bumpBoth() {
      this.#secret++;
      this.count++;
    }
    addRow() {
      this.#rows.push(1);
    }
    #double() {
      return this.count * 2;
    }
    viaPrivateMethod() {
      return this.#double();
    }
    bumpArrow = () => {
      this.#secret++;
    };
    isVault(other: object) {
      return #secret in other;
    }
    static get made() {
      return Vault.#made;
    }
  };

const Plain = vault(Object as unknown as new () => object);
const Based = vault(ClassyStore);

for (const [name, make] of [
  [
    'no base class, createClassyStore(new Vault())',
    () => createClassyStore(new Plain()),
  ],
  ['base class, new Vault()', () => new Based()],
] as const) {
  section(`#private: ${name}`);
  const store = make();
  out(
    'read a getter over #secret',
    attempt(() => store.secret),
  );
  out(
    'a method that writes #secret: result, sync calls',
    attempt(() => {
      const calls = syncCalls(store, () => store.bump());
      return `no throw, ${calls} sync calls`;
    }),
  );
  out(
    'the getter after that write (2 is current)',
    attempt(() => store.secret),
  );
  out(
    'a getter over #secret and a public field',
    attempt(() => store.mixed),
  );
  out(
    'a method that writes both: sync calls',
    attempt(() => syncCalls(store, () => store.bumpBoth())),
  );
  out(
    'the mixed getter after it (4 is current)',
    attempt(() => store.mixed),
  );
  out(
    'the #secret-only getter after it (3 is current)',
    attempt(() => store.secret),
  );
  out(
    'a private method called by a public one',
    attempt(() => store.viaPrivateMethod()),
  );
  out(
    'an arrow field that writes #secret: sync calls',
    attempt(() => syncCalls(store, () => store.bumpArrow())),
  );
  out(
    '`#secret in store`, asked by a method',
    attempt(() => store.isVault(store)),
  );
  out(
    'a method that pushes to a #private array: sync calls',
    attempt(() => syncCalls(store, () => store.addRow())),
  );
  out(
    'a getter over that array (1 is current)',
    attempt(() => store.rowCount),
  );
  const snap = attempt(() => snapshot(store)) as Record<string, unknown>;
  out('snapshot(store) itself', typeof snap === 'string' ? snap : 'no throw');
  if (typeof snap !== 'string') {
    out('Object.keys(snapshot)', Object.keys(snap));
    out(
      'snapshot.count',
      attempt(() => snap.count),
    );
    out(
      'snapshot.secret',
      attempt(() => snap.secret),
    );
    out(
      'snapshot.mixed',
      attempt(() => snap.mixed),
    );
    out(
      'snapshot.viaPrivateMethod()',
      attempt(() => (snap.viaPrivateMethod as () => number)()),
    );
    out(
      'snapshot.isVault(snapshot)',
      attempt(() => (snap.isVault as (o: object) => boolean)(snap)),
    );
    out(
      'JSON.stringify(snapshot)',
      attempt(() => JSON.stringify(snap)),
    );
    out(
      '{...snapshot}',
      attempt(() => Object.keys({...snap}).join()),
    );
    out(
      'utils.shallowEqual-style walk: Object.entries(snapshot)',
      attempt(() => Object.entries(snap).length),
    );
  }
  const history = attempt(() => {
    const handle = utils.withHistory(store);
    return handle;
  });
  out('withHistory(store)', typeof history === 'string' ? history : 'no throw');
}

section('#private: a nested instance');
{
  const Inner = vault(Object as unknown as new () => object);
  class Marked extends Inner {
    static [PROXYABLE] = true;
  }
  const BasedInner = vault(ClassyStore);
  const holder = createClassyStore({
    opaque: new Inner(),
    marked: new Marked(),
    based: new BasedInner(),
  });
  for (const key of ['opaque', 'marked', 'based'] as const) {
    out(
      `${key}: bumpBoth() result, sync calls on the holder`,
      attempt(() => {
        const calls = syncCalls(holder, () => holder[key].bumpBoth());
        return `no throw, ${calls} sync calls, count ${holder[key].count}`;
      }),
    );
    out(
      `${key}: snapshot(holder).${key}.secret`,
      attempt(() => snapshot(holder)[key].secret),
    );
    out(
      `${key}: snapshot(holder).${key}.count`,
      attempt(() => snapshot(holder)[key].count),
    );
    out(
      `${key}: snapshot(holder).${key} is the live object`,
      snapshot(holder)[key] === holder[key],
    );
  }
}

section('#private: the TypeScript `private` keyword');
{
  class Soft extends ClassyStore {
    private secret = 1;
    get doubled() {
      return this.secret * 2;
    }
    bump() {
      this.secret++;
    }
  }
  const soft = new Soft();
  out(
    'sync calls for a method that writes it',
    syncCalls(soft, () => soft.bump()),
  );
  out('getter: live, snapshot', [soft.doubled, snapshot(soft).doubled]);
  out('Object.keys(snapshot)', Object.keys(snapshot(soft)));
}
```

The output is the same on the unmodified source and on the combination:

```text

# after: #private: no base class, createClassyStore(new Vault())
read a getter over #secret                                               throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
a method that writes #secret: result, sync calls                         throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
the getter after that write (2 is current)                               throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
a getter over #secret and a public field                                 throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
a method that writes both: sync calls                                    throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
the mixed getter after it (4 is current)                                 throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
the #secret-only getter after it (3 is current)                          throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
a private method called by a public one                                  throws TypeError: Cannot access private method or acessor (evaluating 'this.#double')
an arrow field that writes #secret: sync calls                           0
`#secret in store`, asked by a method                                    false
a method that pushes to a #private array: sync calls                     throws TypeError: Cannot access invalid private field (evaluating 'this.#rows')
a getter over that array (1 is current)                                  throws TypeError: Cannot access invalid private field (evaluating 'this.#rows')
snapshot(store) itself                                                   no throw
Object.keys(snapshot)                                                    ["count","bumpArrow","secret","mixed","rowCount"]
snapshot.count                                                           0
snapshot.secret                                                          throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
snapshot.mixed                                                           throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
snapshot.viaPrivateMethod()                                              throws TypeError: Cannot access private method or acessor (evaluating 'this.#double')
snapshot.isVault(snapshot)                                               false
JSON.stringify(snapshot)                                                 throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
{...snapshot}                                                            throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
utils.shallowEqual-style walk: Object.entries(snapshot)                  throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
withHistory(store)                                                       no throw

# after: #private: base class, new Vault()
read a getter over #secret                                               1
a method that writes #secret: result, sync calls                         no throw, 0 sync calls
the getter after that write (2 is current)                               1
a getter over #secret and a public field                                 2
a method that writes both: sync calls                                    1
the mixed getter after it (4 is current)                                 4
the #secret-only getter after it (3 is current)                          1
a private method called by a public one                                  2
an arrow field that writes #secret: sync calls                           0
`#secret in store`, asked by a method                                    true
a method that pushes to a #private array: sync calls                     0
a getter over that array (1 is current)                                  1
snapshot(store) itself                                                   no throw
Object.keys(snapshot)                                                    ["count","bumpArrow","secret","mixed","rowCount"]
snapshot.count                                                           1
snapshot.secret                                                          throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
snapshot.mixed                                                           throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
snapshot.viaPrivateMethod()                                              throws TypeError: Cannot access private method or acessor (evaluating 'this.#double')
snapshot.isVault(snapshot)                                               false
JSON.stringify(snapshot)                                                 throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
{...snapshot}                                                            throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
utils.shallowEqual-style walk: Object.entries(snapshot)                  throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
withHistory(store)                                                       no throw

# after: #private: a nested instance
opaque: bumpBoth() result, sync calls on the holder                      no throw, 0 sync calls, count 1
opaque: snapshot(holder).opaque.secret                                   2
opaque: snapshot(holder).opaque.count                                    1
opaque: snapshot(holder).opaque is the live object                       true
marked: bumpBoth() result, sync calls on the holder                      throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
marked: snapshot(holder).marked.secret                                   throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
marked: snapshot(holder).marked.count                                    0
marked: snapshot(holder).marked is the live object                       false
based: bumpBoth() result, sync calls on the holder                       no throw, 1 sync calls, count 1
based: snapshot(holder).based.secret                                     throws TypeError: Cannot access invalid private field (evaluating 'this.#secret')
based: snapshot(holder).based.count                                      1
based: snapshot(holder).based is the live object                         false

# after: #private: the TypeScript `private` keyword
sync calls for a method that writes it                                   1
getter: live, snapshot                                                   [4,4]
Object.keys(snapshot)                                                    ["secret","doubled"]
```

### `c3.ts`

```ts
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {
  attempt,
  ClassyStore,
  createClassyStore,
  opaque,
  out,
  PROXYABLE,
  section,
  snapshot,
  syncCalls,
} from './lib';

const warnings: string[] = [];
const realWarn = console.warn;
console.warn = (...args: unknown[]) =>
  void warnings.push(args.map(String).join(' '));

class Counter {
  count = 0;
  increment() {
    this.count++;
  }
  get double() {
    return this.count * 2;
  }
}

section('stage 2 defect 1: a nested class instance without PROXYABLE');
{
  const inner = new Counter();
  const store = createClassyStore({inner, other: new Counter()});
  const before = snapshot(store);
  const calls = syncCalls(store, () => store.inner.increment());
  const after = snapshot(store);
  out('count after increment(), sync calls', [store.inner.count, calls]);
  out('the same snapshot object after the call', before === after);
  out('the earlier snapshot now says', (before.inner as Counter).count);
  out('snapshot(store).inner is the raw instance', after.inner === inner);
  out('store.inner is the raw instance', store.inner === inner);
  out('snapshot(store).inner is frozen', Object.isFrozen(after.inner));
  out('snapshot getter', (after.inner as Counter).double);
  out('warnings so far', warnings.length);
  out('first warning', warnings[0] ?? 'none');
  // The second instance of the same class, and a second store.
  createClassyStore({again: new Counter()});
  out('warnings after a second store with the same class', warnings.length);
}

section('ways to say what is meant');
{
  class Marked extends Counter {
    static [PROXYABLE] = true;
  }
  class Refused extends Counter {
    static [PROXYABLE] = false;
  }
  class Based extends ClassyStore {
    count = 0;
    increment() {
      this.count++;
    }
  }
  const before = warnings.length;
  const raw = new Counter();
  const store = createClassyStore({
    marked: new Marked(),
    refused: new Refused(),
    based: new Based(),
    frozen: Object.freeze(new Counter()),
    wrapped: opaque ? opaque(raw) : raw,
  });
  for (const key of ['marked', 'refused', 'based', 'wrapped'] as const) {
    const calls = attempt(() => syncCalls(store, () => store[key].increment()));
    out(`${key}: sync calls for increment(), snapshot is a copy`, [
      calls,
      snapshot(store)[key] !== (store[key] as object),
    ]);
  }
  out('frozen: read back as itself', Object.isFrozen(store.frozen));
  out('warnings for these five', warnings.length - before);
}

section('platform and library objects placed in a store');
{
  const realm = vm.runInNewContext('({n: 1, list: [1]})');
  class Tagged {
    get [Symbol.toStringTag]() {
      return 'Tagged';
    }
    n = 1;
  }
  class Money {
    #cents: number;
    constructor(cents: number) {
      this.#cents = cents;
    }
    add(other: Money) {
      return new Money(this.#cents + other.#cents);
    }
    get cents() {
      return this.#cents;
    }
  }
  class Client {
    #token = 't';
    calls = 0;
    request() {
      this.calls++;
      return this.#token;
    }
  }
  const values: [string, object, (value: never) => unknown][] = [
    ['Date', new Date(0), (v: Date) => v.getTime()],
    ['RegExp', /a/g, (v: RegExp) => v.test('a')],
    ['Map', new Map([[1, 2]]), (v: Map<number, number>) => v.get(1)],
    ['Set', new Set([1]), (v: Set<number>) => v.has(1)],
    ['WeakMap', new WeakMap(), (v: WeakMap<object, number>) => v.has({})],
    [
      'Promise',
      Promise.resolve(1),
      (v: Promise<number>) => typeof v.then(() => {}),
    ],
    ['Error', new RangeError('x'), (v: Error) => v.message],
    [
      'URL',
      new URL('https://a.test/p?q=1'),
      (v: URL) => v.searchParams.get('q'),
    ],
    [
      'URLSearchParams',
      new URLSearchParams('a=1'),
      (v: URLSearchParams) => v.get('a'),
    ],
    ['Uint8Array', new Uint8Array([1, 2]), (v: Uint8Array) => v.length],
    ['ArrayBuffer', new ArrayBuffer(4), (v: ArrayBuffer) => v.byteLength],
    [
      'DataView',
      new DataView(new ArrayBuffer(4)),
      (v: DataView) => v.getInt8(0),
    ],
    ['Blob', new Blob(['x']), (v: Blob) => v.size],
    ['Headers', new Headers({a: '1'}), (v: Headers) => v.get('a')],
    [
      'AbortController',
      new AbortController(),
      (v: AbortController) => v.signal.aborted,
    ],
    [
      'Intl.NumberFormat',
      new Intl.NumberFormat('en'),
      (v: Intl.NumberFormat) => v.format(1),
    ],
    [
      'TextEncoder',
      new TextEncoder(),
      (v: TextEncoder) => v.encode('a').length,
    ],
    [
      'EventEmitter (node)',
      new EventEmitter(),
      (v: EventEmitter) => v.on('x', () => {}).listenerCount('x'),
    ],
    ['a class with Symbol.toStringTag', new Tagged(), (v: Tagged) => v.n],
    [
      'a value class with #private (Money)',
      new Money(5),
      (v: Money) => v.add(v).cents,
    ],
    [
      'a service class with #private (Client)',
      new Client(),
      (v: Client) => v.request(),
    ],
    [
      'a plain class (Counter)',
      new Counter(),
      (v: Counter) => (v.increment(), v.count),
    ],
    ['a plain object from another realm', realm, (v: {n: number}) => v.n],
    [
      'Object.create({shared: 1})',
      Object.create({shared: 1}),
      (v: {shared: number}) => v.shared,
    ],
  ];
  if (typeof document !== 'undefined') {
    values.push([
      'a DOM element',
      document.createElement('div'),
      (v: HTMLElement) => v.tagName,
    ]);
  }
  for (const [name, value, use] of values) {
    const tag = Object.prototype.toString.call(value);
    const store = createClassyStore({value});
    const wrapped = store.value !== value;
    const live = attempt(() => use(store.value as never));
    const snap = attempt(() => use(snapshot(store).value as never));
    const shared = attempt(() => snapshot(store).value === value);
    out(
      `${name} ${tag}`,
      `wrapped ${wrapped} | use on the store: ${JSON.stringify(live)} | on the snapshot: ${JSON.stringify(snap)} | snapshot shares it: ${shared}`,
    );
  }
  if (opaque) {
    const client = new Client();
    const store = createClassyStore({client: opaque(client)});
    out('Client marked opaque: request(), same object', [
      attempt(() => store.client.request()),
      store.client === client,
    ]);
  }
}

section('how much of a library object a default wrap takes in');
{
  // A stand-in for a client object that holds a graph of its own.
  class Node_ {
    children: Node_[] = [];
    listeners = new Map();
    constructor(depth: number, width: number) {
      if (depth > 0)
        for (let i = 0; i < width; i++)
          this.children.push(new Node_(depth - 1, width));
    }
  }
  const graph = new Node_(6, 4); // 5,461 objects, each with one array
  const start = performance.now();
  const store = createClassyStore({scene: graph as unknown});
  const created = performance.now() - start;
  const startSnap = performance.now();
  const snap = snapshot(store);
  const snapped = performance.now() - startSnap;
  out('store.scene is the raw object', store.scene === graph);
  out('ms to create the store, ms for the first snapshot', [
    Number(created.toFixed(2)),
    Number(snapped.toFixed(2)),
  ]);
  out('snapshot shares the graph', snap.scene === graph);
}
section('a library object that changes itself');
{
  // A stand-in for a client that updates its own fields from a callback.
  class Socket {
    status = 'connecting';
    received: string[] = [];
    open() {
      this.status = 'open';
    }
    onMessage = (text: string) => {
      this.received.push(text);
    };
  }
  const socket = new Socket();
  const store = createClassyStore({socket});
  const first = snapshot(store);
  // The library calls these itself, on the object it made, not through the store.
  socket.open();
  socket.onMessage('hello');
  const calls = syncCalls(store, () => socket.onMessage('again'));
  out('sync calls for a change the object made itself', calls);
  out('store.socket.status, snapshot(store).socket.status', [
    store.socket.status,
    snapshot(store).socket.status,
  ]);
  out('received on the store and on the snapshot', [
    store.socket.received.length,
    snapshot(store).socket.received.length,
  ]);
  out('the snapshot is the one taken before', snapshot(store) === first);
  out('the snapshot is frozen', Object.isFrozen(snapshot(store).socket));
}

section('every warning the library printed');
for (const warning of warnings)
  out('warning', warning.replace(/ It is kept.*/, ' ...'));
console.warn = realWarn;
```

Before:

```text

# before: stage 2 defect 1: a nested class instance without PROXYABLE
count after increment(), sync calls                                      [1,0]
the same snapshot object after the call                                  true
the earlier snapshot now says                                            1
snapshot(store).inner is the raw instance                                true
store.inner is the raw instance                                          true
snapshot(store).inner is frozen                                          false
snapshot getter                                                          2
warnings so far                                                          0
first warning                                                            none
warnings after a second store with the same class                        0

# before: ways to say what is meant
marked: sync calls for increment(), snapshot is a copy                   [1,true]
refused: sync calls for increment(), snapshot is a copy                  [0,false]
based: sync calls for increment(), snapshot is a copy                    [1,true]
wrapped: sync calls for increment(), snapshot is a copy                  [0,false]
frozen: read back as itself                                              true
warnings for these five                                                  0

# before: platform and library objects placed in a store
Date [object Date]                                                       wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
RegExp [object RegExp]                                                   wrapped false | use on the store: true | on the snapshot: false | snapshot shares it: true
Map [object Map]                                                         wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
Set [object Set]                                                         wrapped false | use on the store: true | on the snapshot: true | snapshot shares it: true
WeakMap [object WeakMap]                                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Promise [object Promise]                                                 wrapped false | use on the store: "object" | on the snapshot: "object" | snapshot shares it: true
Error [object Error]                                                     wrapped false | use on the store: "x" | on the snapshot: "x" | snapshot shares it: true
URL [object URL]                                                         wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
URLSearchParams [object URLSearchParams]                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
Uint8Array [object Uint8Array]                                           wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
ArrayBuffer [object ArrayBuffer]                                         wrapped false | use on the store: 4 | on the snapshot: 4 | snapshot shares it: true
DataView [object DataView]                                               wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
Blob [object Blob]                                                       wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
Headers [object Headers]                                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
AbortController [object AbortController]                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Intl.NumberFormat [object Intl.NumberFormat]                             wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
TextEncoder [object TextEncoder]                                         wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
EventEmitter (node) [object Object]                                      wrapped false | use on the store: 1 | on the snapshot: 2 | snapshot shares it: true
a class with Symbol.toStringTag [object Tagged]                          wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
a value class with #private (Money) [object Object]                      wrapped false | use on the store: 10 | on the snapshot: 10 | snapshot shares it: true
a service class with #private (Client) [object Object]                   wrapped false | use on the store: "t" | on the snapshot: "t" | snapshot shares it: true
a plain class (Counter) [object Object]                                  wrapped false | use on the store: 1 | on the snapshot: 2 | snapshot shares it: true
a plain object from another realm [object Object]                        wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
Object.create({shared: 1}) [object Object]                               wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true

# before: how much of a library object a default wrap takes in
store.scene is the raw object                                            true
ms to create the store, ms for the first snapshot                        [0.01,0.01]
snapshot shares the graph                                                true

# before: a library object that changes itself
sync calls for a change the object made itself                           0
store.socket.status, snapshot(store).socket.status                       ["open","open"]
received on the store and on the snapshot                                [2,2]
the snapshot is the one taken before                                     true
the snapshot is frozen                                                   false

# before: every warning the library printed
```

After, (a):

```text

# after: stage 2 defect 1: a nested class instance without PROXYABLE
count after increment(), sync calls                                      [1,0]
the same snapshot object after the call                                  true
the earlier snapshot now says                                            1
snapshot(store).inner is the raw instance                                true
store.inner is the raw instance                                          true
snapshot(store).inner is frozen                                          false
snapshot getter                                                          2
warnings so far                                                          1
first warning                                                            @codebelt/classy-store: a Counter instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.
warnings after a second store with the same class                        1

# after: ways to say what is meant
marked: sync calls for increment(), snapshot is a copy                   [1,true]
refused: sync calls for increment(), snapshot is a copy                  [0,false]
based: sync calls for increment(), snapshot is a copy                    [1,true]
wrapped: sync calls for increment(), snapshot is a copy                  [0,false]
frozen: read back as itself                                              true
warnings for these five                                                  0

# after: platform and library objects placed in a store
Date [object Date]                                                       wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
RegExp [object RegExp]                                                   wrapped false | use on the store: true | on the snapshot: false | snapshot shares it: true
Map [object Map]                                                         wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
Set [object Set]                                                         wrapped false | use on the store: true | on the snapshot: true | snapshot shares it: true
WeakMap [object WeakMap]                                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Promise [object Promise]                                                 wrapped false | use on the store: "object" | on the snapshot: "object" | snapshot shares it: true
Error [object Error]                                                     wrapped false | use on the store: "x" | on the snapshot: "x" | snapshot shares it: true
URL [object URL]                                                         wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
URLSearchParams [object URLSearchParams]                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
Uint8Array [object Uint8Array]                                           wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
ArrayBuffer [object ArrayBuffer]                                         wrapped false | use on the store: 4 | on the snapshot: 4 | snapshot shares it: true
DataView [object DataView]                                               wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
Blob [object Blob]                                                       wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
Headers [object Headers]                                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
AbortController [object AbortController]                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Intl.NumberFormat [object Intl.NumberFormat]                             wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
TextEncoder [object TextEncoder]                                         wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
EventEmitter (node) [object Object]                                      wrapped false | use on the store: 1 | on the snapshot: 2 | snapshot shares it: true
a class with Symbol.toStringTag [object Tagged]                          wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
a value class with #private (Money) [object Object]                      wrapped false | use on the store: 10 | on the snapshot: 10 | snapshot shares it: true
a service class with #private (Client) [object Object]                   wrapped false | use on the store: "t" | on the snapshot: "t" | snapshot shares it: true
a plain class (Counter) [object Object]                                  wrapped false | use on the store: 1 | on the snapshot: 2 | snapshot shares it: true
a plain object from another realm [object Object]                        wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
Object.create({shared: 1}) [object Object]                               wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true

# after: how much of a library object a default wrap takes in
store.scene is the raw object                                            true
ms to create the store, ms for the first snapshot                        [0.01,0]
snapshot shares the graph                                                true

# after: a library object that changes itself
sync calls for a change the object made itself                           0
store.socket.status, snapshot(store).socket.status                       ["open","open"]
received on the store and on the snapshot                                [2,2]
the snapshot is the one taken before                                     true
the snapshot is frozen                                                   false

# after: every warning the library printed
warning                                                                  @codebelt/classy-store: a Counter instance is in a store. ...
warning                                                                  @codebelt/classy-store: a EventEmitter instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Money instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Client instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Object instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Object instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Node_ instance is in a store. ...
warning                                                                  @codebelt/classy-store: a Socket instance is in a store. ...
```

After, (b):

```text

# after: stage 2 defect 1: a nested class instance without PROXYABLE
count after increment(), sync calls                                      [1,1]
the same snapshot object after the call                                  false
the earlier snapshot now says                                            0
snapshot(store).inner is the raw instance                                false
store.inner is the raw instance                                          false
snapshot(store).inner is frozen                                          true
snapshot getter                                                          2
warnings so far                                                          0
first warning                                                            none
warnings after a second store with the same class                        0

# after: ways to say what is meant
marked: sync calls for increment(), snapshot is a copy                   [1,true]
refused: sync calls for increment(), snapshot is a copy                  [0,false]
based: sync calls for increment(), snapshot is a copy                    [1,true]
wrapped: sync calls for increment(), snapshot is a copy                  [0,false]
frozen: read back as itself                                              true
warnings for these five                                                  0

# after: platform and library objects placed in a store
Date [object Date]                                                       wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
RegExp [object RegExp]                                                   wrapped false | use on the store: true | on the snapshot: false | snapshot shares it: true
Map [object Map]                                                         wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
Set [object Set]                                                         wrapped false | use on the store: true | on the snapshot: true | snapshot shares it: true
WeakMap [object WeakMap]                                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Promise [object Promise]                                                 wrapped false | use on the store: "object" | on the snapshot: "object" | snapshot shares it: true
Error [object Error]                                                     wrapped false | use on the store: "x" | on the snapshot: "x" | snapshot shares it: true
URL [object URL]                                                         wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
URLSearchParams [object URLSearchParams]                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
Uint8Array [object Uint8Array]                                           wrapped false | use on the store: 2 | on the snapshot: 2 | snapshot shares it: true
ArrayBuffer [object ArrayBuffer]                                         wrapped false | use on the store: 4 | on the snapshot: 4 | snapshot shares it: true
DataView [object DataView]                                               wrapped false | use on the store: 0 | on the snapshot: 0 | snapshot shares it: true
Blob [object Blob]                                                       wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
Headers [object Headers]                                                 wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
AbortController [object AbortController]                                 wrapped false | use on the store: false | on the snapshot: false | snapshot shares it: true
Intl.NumberFormat [object Intl.NumberFormat]                             wrapped false | use on the store: "1" | on the snapshot: "1" | snapshot shares it: true
TextEncoder [object TextEncoder]                                         wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
EventEmitter (node) [object Object]                                      wrapped true | use on the store: 1 | on the snapshot: "throws TypeError: Attempted to assign to readonly property." | snapshot shares it: false
a class with Symbol.toStringTag [object Tagged]                          wrapped false | use on the store: 1 | on the snapshot: 1 | snapshot shares it: true
a value class with #private (Money) [object Object]                      wrapped true | use on the store: "throws TypeError: Cannot access invalid private field (evaluating 'this.#cents')" | on the snapshot: "throws TypeError: Cannot access invalid private field (evaluating 'this.#cents')" | snapshot shares it: false
a service class with #private (Client) [object Object]                   wrapped true | use on the store: "throws TypeError: Cannot access invalid private field (evaluating 'this.#token')" | on the snapshot: "throws TypeError: Attempted to assign to readonly property." | snapshot shares it: false
a plain class (Counter) [object Object]                                  wrapped true | use on the store: 1 | on the snapshot: "throws TypeError: Attempted to assign to readonly property." | snapshot shares it: false
a plain object from another realm [object Object]                        wrapped true | use on the store: 1 | on the snapshot: 1 | snapshot shares it: false
Object.create({shared: 1}) [object Object]                               wrapped true | use on the store: 1 | on the snapshot: 1 | snapshot shares it: false
Client marked opaque: request(), same object                             ["t",true]

# after: how much of a library object a default wrap takes in
store.scene is the raw object                                            false
ms to create the store, ms for the first snapshot                        [10.46,12.98]
snapshot shares the graph                                                false

# after: a library object that changes itself
sync calls for a change the object made itself                           0
store.socket.status, snapshot(store).socket.status                       ["open","connecting"]
received on the store and on the snapshot                                [2,0]
the snapshot is the one taken before                                     true
the snapshot is frozen                                                   true

# after: every warning the library printed
```

### `c3dom.spike.test.ts`

```ts
// SPIKE, throwaway: DOM nodes and other happy-dom objects under a default wrap.
import {expect, test} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';
import {canProxy} from '../utils/internal/internal';

test('SPIKE: DOM objects in a store', () => {
  const element = document.createElement('div');
  element.innerHTML = '<span>a</span>';
  const values: [string, object][] = [
    ['an element', element],
    ['a text node', document.createTextNode('x')],
    ['document', document],
    ['window', window],
    ['an Event', new Event('click')],
    ['a DOMRect-like getBoundingClientRect()', element.getBoundingClientRect()],
    ['element.style', element.style],
    ['element.classList', element.classList],
    ['a FormData', new FormData()],
    ['a File', new File(['x'], 'a.txt')],
  ];
  const lines: string[] = [];
  for (const [name, value] of values) {
    const tag = Object.prototype.toString.call(value);
    let verdict: unknown;
    try {
      verdict = canProxy(value);
    } catch (error) {
      verdict = `throws ${(error as Error).message}`;
    }
    lines.push(`${name.padEnd(40)} ${tag.padEnd(30)} canProxy ${verdict}`);
  }
  const store = createClassyStore({el: element as HTMLElement | null});
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  lines.push(`store.el === element: ${store.el === element}`);
  store.el?.appendChild(document.createElement('p'));
  lines.push(
    `children after appendChild through the store: ${element.children.length}, sync calls ${calls}`,
  );
  lines.push(
    `snapshot(store).el === element: ${snapshot(store).el === element}`,
  );
  console.log(`\n${lines.join('\n')}`);
  expect(lines.length).toBeGreaterThan(0);
});
```

Under happy-dom, on (b) and then on the unmodified source:

```text
# on (b)
an element                               [object HTMLDivElement]        canProxy false
a text node                              [object Text]                  canProxy false
document                                 [object HTMLDocument]          canProxy false
window                                   [object Object]                canProxy true
an Event                                 [object Object]                canProxy true
a DOMRect-like getBoundingClientRect()   [object Object]                canProxy true
element.style                            [object Object]                canProxy true
element.classList                        [object Object]                canProxy true
a FormData                               [object Object]                canProxy true
a File                                   [object Object]                canProxy true
store.el === element: true
children after appendChild through the store: 2, sync calls 0
snapshot(store).el === element: true

# on the unmodified source
an element                               [object HTMLDivElement]        canProxy false
a text node                              [object Text]                  canProxy false
document                                 [object HTMLDocument]          canProxy false
window                                   [object Object]                canProxy true
an Event                                 [object Object]                canProxy false
a DOMRect-like getBoundingClientRect()   [object Object]                canProxy false
element.style                            [object Object]                canProxy false
element.classList                        [object Object]                canProxy false
a FormData                               [object Object]                canProxy false
a File                                   [object Object]                canProxy false
store.el === element: true
children after appendChild through the store: 2, sync calls 0
snapshot(store).el === element: true
```

### `c4-cases.ts`

```ts
// One class with every kind of function field, shared by c4.ts and c4b.ts.
export const outside = {
  refresh() {},
  make() {
    return () => this.refresh();
  },
};

export class Cases {
  count = 0;
  rows: number[] = [];
  deep = [{done: false}];
  arrowWrites = () => {
    this.count++;
  };
  asyncArrow = async () => {
    this.count++;
  };
  arrowPushes = () => {
    this.rows.push(1);
  };
  arrowReplaces = () => {
    this.rows = [1];
  };
  arrowDeep = () => {
    this.deep[0].done = true;
  };
  bound: () => void;
  transpiled: () => void;
  arrowReads = () => this.count;
  arrowPure = (n: number) => n * 2;
  arrowDefaults = (a = (1, 2), b = () => 3) => a + b();
  fromOutsideWithThis = outside.make();
  fromOutsidePlain = () => 1;
  borrowed = outside.refresh;
  fnExpression: () => void;
  method() {
    this.count++;
  }
  constructor() {
    this.bound = this.method.bind(this);
    this.fnExpression = function (this: Cases) {
      this.count++;
    };
    // What a compiler that targets ES5 emits for an arrow function.
    const _this = this;
    this.transpiled = function () {
      _this.count++;
    };
  }
}

export const fieldNames = [
  'arrowWrites',
  'asyncArrow',
  'arrowPushes',
  'arrowReplaces',
  'arrowDeep',
  'bound',
  'transpiled',
  'arrowReads',
  'arrowPure',
  'arrowDefaults',
  'fromOutsideWithThis',
  'fromOutsidePlain',
  'borrowed',
  'fnExpression',
] as const;
```

### `c4.ts`

```ts
import {Cases, fieldNames} from './c4-cases';
import {ClassyStore, createClassyStore, out, section, syncCalls} from './lib';

// The tests of detector (a), as they sit in the library.
type Fn = (...args: never[]) => unknown;
const noPrototype = (fn: Fn) => !Object.hasOwn(fn, 'prototype');
const isArrow = (fn: Fn) =>
  noPrototype(fn) &&
  /^(async\s+)?(\(|[\p{ID_Start}$_][\p{ID_Continue}$]*\s*=>)/u.test(
    Function.prototype.toString.call(fn),
  );
const usesThis = (fn: Fn) =>
  /\bthis\b/.test(Function.prototype.toString.call(fn));

const warnings: string[] = [];
const realWarn = console.warn;
console.warn = (...args: unknown[]) =>
  void warnings.push(args.map(String).join(' '));

section('what each test says about each kind of function field');
{
  const raw = new Cases();
  createClassyStore(raw);
  for (const name of fieldNames) {
    const fn = raw[name] as Fn;
    out(
      name,
      `no prototype ${noPrototype(fn)} | arrow by source ${isArrow(fn)} | mentions this ${usesThis(fn)} | name ${JSON.stringify(fn.name)}`,
    );
  }
  out('warnings from the library', warnings.length);
  for (const warning of warnings) out('  warning', warning);
  createClassyStore(new Cases());
  out('warnings after a second instance of the class', warnings.length);
}

section('the same kind of field on the base class');
{
  const before = warnings.length;
  class Based extends ClassyStore {
    count = 0;
    arrowWrites = () => {
      this.count++;
    };
  }
  const based = new Based();
  out(
    'sync calls for the arrow method',
    syncCalls(based, () => based.arrowWrites()),
  );
  createClassyStore(based);
  out('warnings from the library', warnings.length - before);
}

section('an arrow function in an object literal');
{
  const before = warnings.length;
  createClassyStore({count: 0, onDone: () => this});
  out('warnings from the library', warnings.length - before);
}

section('cost of the source check, per function field');
{
  const fns = fieldNames.map((name) => new Cases()[name] as Fn);
  const rounds = 100_000;
  const results: number[] = [];
  const cheap: number[] = [];
  let hits = 0;
  for (let sample = 0; sample < 7; sample++) {
    let start = performance.now();
    for (let i = 0; i < rounds; i++)
      for (const fn of fns) if (isArrow(fn) && usesThis(fn)) hits++;
    results.push(((performance.now() - start) * 1e6) / (rounds * fns.length));
    start = performance.now();
    for (let i = 0; i < rounds; i++)
      for (const fn of fns) if (noPrototype(fn)) hits++;
    cheap.push(((performance.now() - start) * 1e6) / (rounds * fns.length));
  }
  results.sort((a, b) => a - b);
  cheap.sort((a, b) => a - b);
  out(
    'ns, source and `this`: median (lowest-highest) of 7',
    `${results[3].toFixed(0)} (${results[0].toFixed(0)}-${results[6].toFixed(0)})`,
  );
  out(
    'ns, the prototype test alone',
    `${cheap[3].toFixed(1)} (${cheap[0].toFixed(1)}-${cheap[6].toFixed(1)})`,
  );
  void hits;
}
console.warn = realWarn;
```

Before:

```text

# before: what each test says about each kind of function field
arrowWrites                                                              no prototype true | arrow by source true | mentions this true | name "arrowWrites"
asyncArrow                                                               no prototype true | arrow by source true | mentions this true | name "asyncArrow"
arrowPushes                                                              no prototype true | arrow by source true | mentions this true | name "arrowPushes"
arrowReplaces                                                            no prototype true | arrow by source true | mentions this true | name "arrowReplaces"
arrowDeep                                                                no prototype true | arrow by source true | mentions this true | name "arrowDeep"
bound                                                                    no prototype true | arrow by source false | mentions this false | name "bound method"
transpiled                                                               no prototype false | arrow by source false | mentions this false | name ""
arrowReads                                                               no prototype true | arrow by source true | mentions this true | name "arrowReads"
arrowPure                                                                no prototype true | arrow by source true | mentions this false | name "arrowPure"
arrowDefaults                                                            no prototype true | arrow by source true | mentions this false | name "arrowDefaults"
fromOutsideWithThis                                                      no prototype true | arrow by source true | mentions this true | name ""
fromOutsidePlain                                                         no prototype true | arrow by source true | mentions this false | name "fromOutsidePlain"
borrowed                                                                 no prototype true | arrow by source false | mentions this false | name "refresh"
fnExpression                                                             no prototype false | arrow by source false | mentions this true | name ""
warnings from the library                                                0
warnings after a second instance of the class                            0

# before: the same kind of field on the base class
sync calls for the arrow method                                          1
warnings from the library                                                0

# before: an arrow function in an object literal
warnings from the library                                                0

# before: cost of the source check, per function field
ns, source and `this`: median (lowest-highest) of 7                      28 (27-35)
ns, the prototype test alone                                             2.6 (2.5-5.3)
```

After, (a):

```text

# after: what each test says about each kind of function field
arrowWrites                                                              no prototype true | arrow by source true | mentions this true | name "arrowWrites"
asyncArrow                                                               no prototype true | arrow by source true | mentions this true | name "asyncArrow"
arrowPushes                                                              no prototype true | arrow by source true | mentions this true | name "arrowPushes"
arrowReplaces                                                            no prototype true | arrow by source true | mentions this true | name "arrowReplaces"
arrowDeep                                                                no prototype true | arrow by source true | mentions this true | name "arrowDeep"
bound                                                                    no prototype true | arrow by source false | mentions this false | name "bound method"
transpiled                                                               no prototype false | arrow by source false | mentions this false | name ""
arrowReads                                                               no prototype true | arrow by source true | mentions this true | name "arrowReads"
arrowPure                                                                no prototype true | arrow by source true | mentions this false | name "arrowPure"
arrowDefaults                                                            no prototype true | arrow by source true | mentions this false | name "arrowDefaults"
fromOutsideWithThis                                                      no prototype true | arrow by source true | mentions this true | name ""
fromOutsidePlain                                                         no prototype true | arrow by source true | mentions this false | name "fromOutsidePlain"
borrowed                                                                 no prototype true | arrow by source false | mentions this false | name "refresh"
fnExpression                                                             no prototype false | arrow by source false | mentions this true | name ""
warnings from the library                                                1
  warning                                                                @codebelt/classy-store: Cases.arrowWrites, asyncArrow, arrowPushes, arrowReplaces, arrowDeep, bound, arrowReads, fromOutsideWithThis is an arrow function or a bound method that uses `this`. There `this` is the raw instance, not the store, so its writes notify no one. Write it as a method, or extend ClassyStore.
warnings after a second instance of the class                            1

# after: the same kind of field on the base class
sync calls for the arrow method                                          1
warnings from the library                                                0

# after: an arrow function in an object literal
warnings from the library                                                0

# after: cost of the source check, per function field
ns, source and `this`: median (lowest-highest) of 7                      28 (27-34)
ns, the prototype test alone                                             2.5 (2.5-6.0)
```

### `c4b.ts`

```ts
import {Cases, fieldNames} from './c4-cases';
import {
  ClassyStore,
  createClassyStore,
  flush,
  out,
  section,
  snapshot,
  subscribe,
} from './lib';

const warnings: string[] = [];
const realWarn = console.warn;
console.warn = (...args: unknown[]) =>
  void warnings.push(args.map(String).join(' '));

section(
  'a check when a cached snapshot is handed out: which lost writes it sees',
);
for (const name of [...fieldNames, 'method'] as const) {
  const raw = new Cases();
  const store = createClassyStore(raw);
  let calls = 0;
  subscribe(store, () => calls++, {sync: true});
  const first = snapshot(store);
  const before = warnings.length;
  (store[name] as (n: number) => unknown)(1);
  await Promise.resolve();
  const lost = calls === 0 && JSON.stringify(raw) !== JSON.stringify(first);
  snapshot(store);
  snapshot(store);
  out(
    name,
    `a write was lost ${lost} | warnings at the next two snapshots ${warnings.length - before}`,
  );
}

section('other ways a write goes around the store');
{
  class Clock {
    ticks = 0;
    constructor() {
      setTimeout(() => {
        this.ticks++;
      }, 0);
    }
  }
  const clock = createClassyStore(new Clock());
  snapshot(clock);
  let before = warnings.length;
  await flush();
  snapshot(clock);
  out('a timer the constructor started: warnings', warnings.length - before);

  const raw = {n: 0, child: {n: 0}};
  const store = createClassyStore(raw);
  snapshot(store);
  before = warnings.length;
  raw.n = 5;
  snapshot(store);
  out(
    'a write through the raw object (stage 1 finding 11): warnings',
    warnings.length - before,
  );

  class Based extends ClassyStore {
    count = 0;
    inc = () => {
      this.count++;
    };
  }
  const based = new Based();
  snapshot(based);
  before = warnings.length;
  based.inc();
  snapshot(based);
  snapshot(based);
  out('the base class: warnings', warnings.length - before);
}
section('the text');
out('first warning', warnings[0] ?? 'none');
console.warn = realWarn;
```

Before:

```text

# before: a check when a cached snapshot is handed out: which lost writes it sees
arrowWrites                                                              a write was lost true | warnings at the next two snapshots 0
asyncArrow                                                               a write was lost true | warnings at the next two snapshots 0
arrowPushes                                                              a write was lost true | warnings at the next two snapshots 0
arrowReplaces                                                            a write was lost true | warnings at the next two snapshots 0
arrowDeep                                                                a write was lost true | warnings at the next two snapshots 0
bound                                                                    a write was lost true | warnings at the next two snapshots 0
transpiled                                                               a write was lost true | warnings at the next two snapshots 0
arrowReads                                                               a write was lost false | warnings at the next two snapshots 0
arrowPure                                                                a write was lost false | warnings at the next two snapshots 0
arrowDefaults                                                            a write was lost false | warnings at the next two snapshots 0
fromOutsideWithThis                                                      a write was lost false | warnings at the next two snapshots 0
fromOutsidePlain                                                         a write was lost false | warnings at the next two snapshots 0
borrowed                                                                 a write was lost false | warnings at the next two snapshots 0
fnExpression                                                             a write was lost false | warnings at the next two snapshots 0
method                                                                   a write was lost false | warnings at the next two snapshots 0

# before: other ways a write goes around the store
a timer the constructor started: warnings                                0
a write through the raw object (stage 1 finding 11): warnings            0
the base class: warnings                                                 0

# before: the text
first warning                                                            none
```

After, (b):

```text

# after: a check when a cached snapshot is handed out: which lost writes it sees
arrowWrites                                                              a write was lost true | warnings at the next two snapshots 1
asyncArrow                                                               a write was lost true | warnings at the next two snapshots 1
arrowPushes                                                              a write was lost true | warnings at the next two snapshots 1
arrowReplaces                                                            a write was lost true | warnings at the next two snapshots 1
arrowDeep                                                                a write was lost true | warnings at the next two snapshots 0
bound                                                                    a write was lost true | warnings at the next two snapshots 1
transpiled                                                               a write was lost true | warnings at the next two snapshots 1
arrowReads                                                               a write was lost false | warnings at the next two snapshots 0
arrowPure                                                                a write was lost false | warnings at the next two snapshots 0
arrowDefaults                                                            a write was lost false | warnings at the next two snapshots 0
fromOutsideWithThis                                                      a write was lost false | warnings at the next two snapshots 0
fromOutsidePlain                                                         a write was lost false | warnings at the next two snapshots 0
borrowed                                                                 a write was lost false | warnings at the next two snapshots 0
fnExpression                                                             a write was lost false | warnings at the next two snapshots 0
method                                                                   a write was lost false | warnings at the next two snapshots 0

# after: other ways a write goes around the store
a timer the constructor started: warnings                                1
a write through the raw object (stage 1 finding 11): warnings            1
the base class: warnings                                                 0

# after: the text
first warning                                                            @codebelt/classy-store: Cases.count changed without the store being told, so no subscriber was called. The write reached the raw object: an arrow-function field, a method bound in the constructor, a timer or callback the constructor started, or a reference to the instance kept from before createClassyStore(). Write it as a method, or extend ClassyStore.
```

## Appendix E: timings as printed

Apple M1 Max, Bun 1.4.5 and Node 24.21.0. Other agents were running: the load average was between 25 and 50 throughout. A build name is the patch it was made from: `base` is the unmodified commit, `c1-t1strict` the base class without W2, `c1-w2c` the combination.

### `bench-create.mjs`

```js
// Construction cost: `createClassyStore(new Plain())` against `new Based()`.
// Usage: bun|node bench-create.mjs <folder that holds dist/> [label]
const folder = process.argv[2];
const label = process.argv[3] ?? '';
const lib = await import(`${folder}/dist/index.mjs`);
const {createClassyStore, snapshot, subscribe, batch} = lib;
const Base =
  lib.ClassyStore ??
  class {
    constructor() {
      return createClassyStore(this);
    }
  };

class Plain5 {
  count = 0;
  label = 'a';
  rows = [];
  nested = {deep: 1};
  add = () => {
    this.count++;
  };
  get double() {
    return this.count * 2;
  }
  inc() {
    this.count++;
  }
}
class Based5 extends Base {
  count = 0;
  label = 'a';
  rows = [];
  nested = {deep: 1};
  add = () => {
    this.count++;
  };
  get double() {
    return this.count * 2;
  }
  inc() {
    this.count++;
  }
}
class Plain20 {
  a0 = 0;
  a1 = 1;
  a2 = 2;
  a3 = 3;
  a4 = 4;
  a5 = 5;
  a6 = 6;
  a7 = 7;
  a8 = 8;
  a9 = 9;
  b0 = 'x';
  b1 = 'x';
  b2 = 'x';
  b3 = 'x';
  b4 = 'x';
  b5 = 'x';
  b6 = 'x';
  b7 = 'x';
  b8 = 'x';
  b9 = 'x';
}
class Based20 extends Base {
  a0 = 0;
  a1 = 1;
  a2 = 2;
  a3 = 3;
  a4 = 4;
  a5 = 5;
  a6 = 6;
  a7 = 7;
  a8 = 8;
  a9 = 9;
  b0 = 'x';
  b1 = 'x';
  b2 = 'x';
  b3 = 'x';
  b4 = 'x';
  b5 = 'x';
  b6 = 'x';
  b7 = 'x';
  b8 = 'x';
  b9 = 'x';
}

const rowsOf = (n) => Array.from({length: n}, (_, id) => ({id, done: false}));
class PlainRows {
  rows = rowsOf(1000);
  markAllMethod() {
    for (const row of this.rows) row.done = !row.done;
  }
}
class BasedRows extends Base {
  rows = rowsOf(1000);
  markAllMethod() {
    for (const row of this.rows) row.done = !row.done;
  }
  markAllArrow = () => {
    for (const row of this.rows) row.done = !row.done;
  };
  markAllArrowBatched = () => {
    batch(() => {
      for (const row of this.rows) row.done = !row.done;
    });
  };
}

let sink = 0;
const metrics = {
  'raw new Plain5()': () => {
    sink += new Plain5().count;
  },
  'createClassyStore(new Plain5())': () => {
    sink += createClassyStore(new Plain5()).count;
  },
  'new Based5()': () => {
    sink += new Based5().count;
  },
  'createClassyStore(new Plain5()) + first snapshot': () => {
    sink += snapshot(createClassyStore(new Plain5())).count;
  },
  'new Based5() + first snapshot': () => {
    sink += snapshot(new Based5()).count;
  },
  'createClassyStore(new Plain20())': () => {
    sink += createClassyStore(new Plain20()).a1;
  },
  'new Based20()': () => {
    sink += new Based20().a1;
  },
};

const withSubscriber = (store) => {
  subscribe(
    store,
    () => {
      sink += snapshot(store).rows.length;
    },
    {sync: true},
  );
  return store;
};
const plainRows = withSubscriber(createClassyStore(new PlainRows()));
const basedRows = withSubscriber(new BasedRows());
const heavy = {
  '1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)':
    () => plainRows.markAllMethod(),
  '1,000 row writes in a prototype method, sync subscriber + snapshot (base class)':
    () => basedRows.markAllMethod(),
  '1,000 row writes in an arrow method, sync subscriber + snapshot (base class)':
    () => basedRows.markAllArrow(),
  '1,000 row writes in an arrow method that calls batch() (base class)': () =>
    basedRows.markAllArrowBatched(),
};

const now = () => Number(process.hrtime.bigint());
function time(run, targetMs = 20, samples = 15) {
  let iterations = 1;
  for (;;) {
    const start = now();
    for (let i = 0; i < iterations; i++) run();
    const elapsed = (now() - start) / 1e6;
    if (elapsed >= targetMs / 4 || iterations >= 1e7) break;
    iterations *= 4;
  }
  const warm = now();
  while ((now() - warm) / 1e6 < 100) run();
  const results = [];
  for (let s = 0; s < samples; s++) {
    const start = now();
    for (let i = 0; i < iterations; i++) run();
    results.push((now() - start) / iterations);
  }
  results.sort((a, b) => a - b);
  return {
    median: results[samples >> 1],
    low: results[0],
    high: results[samples - 1],
  };
}
const engine = globalThis.Bun
  ? `bun ${Bun.version}`
  : `node ${process.versions.node}`;
console.log(`## ${label} on ${engine}`);
for (const [name, run] of Object.entries(metrics)) {
  const {median, low, high} = time(run);
  console.log(
    `${name.padEnd(52)} ${median.toFixed(0).padStart(8)} ns  (${low.toFixed(0)}-${high.toFixed(0)})`,
  );
}
for (const [name, run] of Object.entries(heavy)) {
  const {median, low, high} = time(run, 20, 7);
  console.log(
    `${name.padEnd(84)} ${(median / 1e3).toFixed(0).padStart(8)} µs  (${(low / 1e3).toFixed(0)}-${(high / 1e3).toFixed(0)})`,
  );
}
if (sink === 42.5) console.log(sink);
```

On Bun:

```text
## base round 1 on bun 1.4.5
raw new Plain5()                                            8 ns  (5-22)
createClassyStore(new Plain5())                          1244 ns  (995-1382)
new Based5()                                             1007 ns  (941-1332)
createClassyStore(new Plain5()) + first snapshot         4700 ns  (3815-6343)
new Based5() + first snapshot                            2756 ns  (2418-3499)
createClassyStore(new Plain20())                         1312 ns  (1181-1486)
new Based20()                                            3723 ns  (3261-11716)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1846 µs  (992-2705)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          1002 µs  (917-6010)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2653 µs  (1709-5558)
1,000 row writes in an arrow method that calls batch() (base class)                       908 µs  (856-4111)
## c1-t1strict round 1 on bun 1.4.5
raw new Plain5()                                            9 ns  (5-25)
createClassyStore(new Plain5())                          1461 ns  (1103-1544)
new Based5()                                             2799 ns  (2602-3119)
createClassyStore(new Plain5()) + first snapshot         3924 ns  (3501-4136)
new Based5() + first snapshot                            5385 ns  (4714-6983)
createClassyStore(new Plain20())                         1121 ns  (1095-1142)
new Based20()                                            5994 ns  (5452-6648)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1770 µs  (919-2022)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          1075 µs  (931-6036)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)           151373 µs  (121357-152651)
1,000 row writes in an arrow method that calls batch() (base class)                      1260 µs  (1197-1375)
## c1-w2c round 1 on bun 1.4.5
raw new Plain5()                                            8 ns  (5-26)
createClassyStore(new Plain5())                          1424 ns  (1119-1537)
new Based5()                                             3237 ns  (2834-4559)
createClassyStore(new Plain5()) + first snapshot         4168 ns  (3695-7207)
new Based5() + first snapshot                            5547 ns  (5142-7061)
createClassyStore(new Plain20())                         1142 ns  (1111-1174)
new Based20()                                            5633 ns  (5155-6556)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1941 µs  (1003-2286)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2448 µs  (1069-2537)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             1820 µs  (881-3617)
1,000 row writes in an arrow method that calls batch() (base class)                      1159 µs  (1132-1304)
## base round 2 on bun 1.4.5
raw new Plain5()                                            8 ns  (5-24)
createClassyStore(new Plain5())                          1211 ns  (936-1323)
new Based5()                                              981 ns  (917-1160)
createClassyStore(new Plain5()) + first snapshot         3845 ns  (2552-5246)
new Based5() + first snapshot                            2353 ns  (2161-2638)
createClassyStore(new Plain20())                         1113 ns  (983-1242)
new Based20()                                            3035 ns  (2902-3115)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1877 µs  (981-2172)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          1041 µs  (1002-6125)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2671 µs  (1086-2834)
1,000 row writes in an arrow method that calls batch() (base class)                       901 µs  (839-1085)
## c1-t1strict round 2 on bun 1.4.5
raw new Plain5()                                            8 ns  (6-28)
createClassyStore(new Plain5())                          1459 ns  (1213-1565)
new Based5()                                             2796 ns  (2682-2994)
createClassyStore(new Plain5()) + first snapshot         4022 ns  (2476-4419)
new Based5() + first snapshot                            5063 ns  (4691-6607)
createClassyStore(new Plain20())                         1056 ns  (1021-1093)
new Based20()                                            5432 ns  (5081-6433)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1889 µs  (919-2476)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)           963 µs  (907-6351)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)           148949 µs  (127495-158614)
1,000 row writes in an arrow method that calls batch() (base class)                      1105 µs  (1046-1169)
## c1-w2c round 2 on bun 1.4.5
raw new Plain5()                                            8 ns  (5-25)
createClassyStore(new Plain5())                          1438 ns  (1350-1525)
new Based5()                                             3023 ns  (2794-3276)
createClassyStore(new Plain5()) + first snapshot         3930 ns  (3540-4115)
new Based5() + first snapshot                            5568 ns  (5022-7459)
createClassyStore(new Plain20())                         1132 ns  (1035-1350)
new Based20()                                            5338 ns  (5122-6112)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         1815 µs  (908-2379)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          1016 µs  (981-6387)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2752 µs  (1050-2773)
1,000 row writes in an arrow method that calls batch() (base class)                       980 µs  (913-1799)
```

On Node:

```text
## base round 1 on node 24.21.0
raw new Plain5()                                            1 ns  (1-3)
createClassyStore(new Plain5())                          4598 ns  (3771-33348)
new Based5()                                             3072 ns  (2810-14177)
createClassyStore(new Plain5()) + first snapshot        13570 ns  (11072-32454)
new Based5() + first snapshot                            7262 ns  (6512-33040)
createClassyStore(new Plain20())                         4057 ns  (2470-19760)
new Based20()                                            7541 ns  (7398-15516)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2392 µs  (2259-4132)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2334 µs  (2279-4880)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2400 µs  (2159-9568)
1,000 row writes in an arrow method that calls batch() (base class)                      2494 µs  (2273-4101)
## c1-t1strict round 1 on node 24.21.0
raw new Plain5()                                            1 ns  (1-3)
createClassyStore(new Plain5())                          8206 ns  (4229-20510)
new Based5()                                             6535 ns  (6357-18645)
createClassyStore(new Plain5()) + first snapshot        13048 ns  (11549-87145)
new Based5() + first snapshot                           13101 ns  (12429-60159)
createClassyStore(new Plain20())                         3349 ns  (2519-29947)
new Based20()                                            9768 ns  (9414-13760)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2540 µs  (2368-4896)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2744 µs  (2593-10288)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)            83688 µs  (81695-90000)
1,000 row writes in an arrow method that calls batch() (base class)                      2598 µs  (2475-4078)
## c1-w2c round 1 on node 24.21.0
raw new Plain5()                                            1 ns  (1-15)
createClassyStore(new Plain5())                          4889 ns  (4093-37139)
new Based5()                                             6986 ns  (6153-27438)
createClassyStore(new Plain5()) + first snapshot        12075 ns  (10567-25570)
new Based5() + first snapshot                           13574 ns  (12602-101948)
createClassyStore(new Plain20())                         2615 ns  (2430-14355)
new Based20()                                            9642 ns  (9175-90190)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2399 µs  (2223-3625)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2458 µs  (2385-4259)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2161 µs  (2068-7960)
1,000 row writes in an arrow method that calls batch() (base class)                      2312 µs  (2163-13573)
## base round 2 on node 24.21.0
raw new Plain5()                                            1 ns  (1-3)
createClassyStore(new Plain5())                          7421 ns  (4624-13739)
new Based5()                                             3990 ns  (2697-21530)
createClassyStore(new Plain5()) + first snapshot        14846 ns  (13470-104708)
new Based5() + first snapshot                            6319 ns  (5283-31389)
createClassyStore(new Plain20())                         2770 ns  (2436-5309)
new Based20()                                            7464 ns  (7161-14633)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2231 µs  (2095-2821)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2328 µs  (2168-2434)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             3034 µs  (2213-8728)
1,000 row writes in an arrow method that calls batch() (base class)                      2497 µs  (2273-3069)
## c1-t1strict round 2 on node 24.21.0
raw new Plain5()                                            1 ns  (1-3)
createClassyStore(new Plain5())                          4421 ns  (4055-49110)
new Based5()                                             6382 ns  (5509-26199)
createClassyStore(new Plain5()) + first snapshot        12039 ns  (11030-36152)
new Based5() + first snapshot                           12859 ns  (12335-23460)
createClassyStore(new Plain20())                         4084 ns  (2249-23095)
new Based20()                                            9799 ns  (9566-13647)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2462 µs  (2139-4391)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2544 µs  (2330-4130)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)            79021 µs  (78502-80704)
1,000 row writes in an arrow method that calls batch() (base class)                      2721 µs  (2436-14410)
## c1-w2c round 2 on node 24.21.0
raw new Plain5()                                            1 ns  (1-3)
createClassyStore(new Plain5())                          4767 ns  (4167-55423)
new Based5()                                             6913 ns  (6303-29063)
createClassyStore(new Plain5()) + first snapshot        12485 ns  (10847-27347)
new Based5() + first snapshot                           14814 ns  (12825-32943)
createClassyStore(new Plain20())                         4108 ns  (2448-23444)
new Based20()                                            9345 ns  (9068-12675)
1,000 row writes in a prototype method, sync subscriber + snapshot (plain class)         2390 µs  (2307-4720)
1,000 row writes in a prototype method, sync subscriber + snapshot (base class)          2449 µs  (2292-4208)
1,000 row writes in an arrow method, sync subscriber + snapshot (base class)             2684 µs  (2420-8639)
1,000 row writes in an arrow method that calls batch() (base class)                      2361 µs  (2281-4926)
```

### `bench-opaque.mjs`

```js
// Read and write cost of values the store keeps by reference, and creation cost.
// Usage: bun|node bench-opaque.mjs <folder that holds dist/> [label]
const folder = process.argv[2];
const label = process.argv[3] ?? '';
const {createClassyStore, snapshot} = await import(`${folder}/dist/index.mjs`);
class Point {
  x = 1;
  y = 2;
}
const store = createClassyStore({
  when: new Date(0),
  lookup: new Map([[1, 1]]),
  point: new Point(),
  plain: {x: 1, y: 2},
  n: 1,
});
const dates = [new Date(1), new Date(2)];
const points = [new Point(), new Point()];
let flip = 0;
let sink = 0;
const metrics = {
  'read a Date field': () => {
    sink += store.when === null ? 1 : 0;
  },
  'read a Map field': () => {
    sink += store.lookup === null ? 1 : 0;
  },
  'read a field holding a class instance': () => {
    sink += store.point === null ? 1 : 0;
  },
  'read a field holding a plain object': () => {
    sink += store.plain === null ? 1 : 0;
  },
  'write a Date field': () => {
    store.when = dates[(flip ^= 1)];
  },
  'write a field holding a class instance': () => {
    store.point = points[(flip ^= 1)];
  },
  'create a store with a Date, a Map and a class instance': () => {
    sink += createClassyStore({
      when: dates[0],
      lookup: new Map(),
      point: new Point(),
      n: 1,
    }).n;
  },
  'create, then first snapshot': () => {
    sink += snapshot(
      createClassyStore({
        when: dates[0],
        lookup: new Map(),
        point: new Point(),
        n: 1,
      }),
    ).n;
  },
};
const now = () => Number(process.hrtime.bigint());
function time(run, targetMs = 20, samples = 15) {
  let iterations = 1;
  for (;;) {
    const start = now();
    for (let i = 0; i < iterations; i++) run();
    if ((now() - start) / 1e6 >= targetMs / 4 || iterations >= 1e8) break;
    iterations *= 4;
  }
  const warm = now();
  while ((now() - warm) / 1e6 < 100) run();
  const results = [];
  for (let s = 0; s < samples; s++) {
    const start = now();
    for (let i = 0; i < iterations; i++) run();
    results.push((now() - start) / iterations);
  }
  results.sort((a, b) => a - b);
  return {
    median: results[samples >> 1],
    low: results[0],
    high: results[samples - 1],
  };
}
const engine = globalThis.Bun
  ? `bun ${Bun.version}`
  : `node ${process.versions.node}`;
console.log(`## ${label} on ${engine}`);
for (const [name, run] of Object.entries(metrics)) {
  const {median, low, high} = time(run);
  console.log(
    `${name.padEnd(56)} ${median.toFixed(1).padStart(8)} ns  (${low.toFixed(1)}-${high.toFixed(1)})`,
  );
}
if (sink === 42.5) console.log(sink);
```

`base`, `c3a` and `c3b`, two rounds on each engine:

```text
## base round 1 on bun 1.4.5
read a Date field                                            41.8 ns  (40.1-44.3)
read a Map field                                             39.7 ns  (38.6-41.1)
read a field holding a class instance                        40.3 ns  (39.2-41.6)
read a field holding a plain object                          42.7 ns  (41.9-45.2)
write a Date field                                          181.1 ns  (171.2-191.2)
write a field holding a class instance                      177.5 ns  (167.3-241.7)
create a store with a Date, a Map and a class instance      387.9 ns  (368.7-441.7)
create, then first snapshot                                1019.7 ns  (952.4-1220.9)
@codebelt/classy-store: a Point instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.
## c3a round 1 on bun 1.4.5
read a Date field                                            41.5 ns  (40.3-45.7)
read a Map field                                             40.1 ns  (38.3-41.3)
read a field holding a class instance                        40.7 ns  (39.1-41.5)
read a field holding a plain object                          42.9 ns  (41.3-44.0)
write a Date field                                          173.8 ns  (167.0-178.0)
write a field holding a class instance                      172.3 ns  (168.0-177.2)
create a store with a Date, a Map and a class instance      393.7 ns  (364.2-435.0)
create, then first snapshot                                1008.2 ns  (956.2-1401.6)
## c3b round 1 on bun 1.4.5
read a Date field                                            44.9 ns  (41.3-50.0)
read a Map field                                             42.9 ns  (41.1-46.3)
read a field holding a class instance                        39.7 ns  (38.1-41.0)
read a field holding a plain object                          41.4 ns  (40.0-52.8)
write a Date field                                          183.3 ns  (178.9-188.5)
write a field holding a class instance                      341.6 ns  (302.4-364.9)
create a store with a Date, a Map and a class instance      793.8 ns  (744.5-846.2)
create, then first snapshot                                2275.7 ns  (2056.8-2635.2)
## base round 2 on bun 1.4.5
read a Date field                                            41.7 ns  (41.0-45.5)
read a Map field                                             39.8 ns  (39.4-40.6)
read a field holding a class instance                        40.6 ns  (38.7-41.5)
read a field holding a plain object                          43.2 ns  (41.8-44.5)
write a Date field                                          169.0 ns  (165.4-174.2)
write a field holding a class instance                      176.4 ns  (171.8-180.2)
create a store with a Date, a Map and a class instance      378.9 ns  (363.5-429.2)
create, then first snapshot                                1013.7 ns  (929.6-1239.7)
@codebelt/classy-store: a Point instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.
## c3a round 2 on bun 1.4.5
read a Date field                                            41.5 ns  (40.3-45.8)
read a Map field                                             40.2 ns  (39.1-41.9)
read a field holding a class instance                        39.9 ns  (38.3-41.3)
read a field holding a plain object                          42.5 ns  (41.4-43.7)
write a Date field                                          175.0 ns  (171.5-184.8)
write a field holding a class instance                      174.4 ns  (169.6-181.7)
create a store with a Date, a Map and a class instance      403.8 ns  (387.1-449.6)
create, then first snapshot                                1052.8 ns  (961.5-1317.1)
## c3b round 2 on bun 1.4.5
read a Date field                                            43.8 ns  (40.9-46.9)
read a Map field                                             42.9 ns  (40.9-44.5)
read a field holding a class instance                        39.5 ns  (38.0-40.3)
read a field holding a plain object                          39.7 ns  (38.3-40.8)
write a Date field                                          182.2 ns  (178.9-195.9)
write a field holding a class instance                      339.0 ns  (297.0-361.0)
create a store with a Date, a Map and a class instance      810.5 ns  (776.4-883.4)
create, then first snapshot                                2203.8 ns  (2032.4-2704.8)
## base round 1 on node 24.21.0
read a Date field                                            79.1 ns  (76.9-87.0)
read a Map field                                             83.3 ns  (80.4-89.1)
read a field holding a class instance                        82.8 ns  (80.5-88.1)
read a field holding a plain object                          52.1 ns  (51.3-53.0)
write a Date field                                          256.7 ns  (248.8-262.9)
write a field holding a class instance                      254.4 ns  (252.2-258.2)
create a store with a Date, a Map and a class instance     1498.1 ns  (1126.4-8515.5)
create, then first snapshot                                3813.8 ns  (3445.1-8226.1)
@codebelt/classy-store: a Point instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.
## c3a round 1 on node 24.21.0
read a Date field                                            78.6 ns  (76.7-89.6)
read a Map field                                             82.9 ns  (79.8-89.1)
read a field holding a class instance                        84.1 ns  (81.5-90.2)
read a field holding a plain object                          52.0 ns  (51.0-53.1)
write a Date field                                          279.7 ns  (266.0-291.2)
write a field holding a class instance                      277.3 ns  (272.7-281.8)
create a store with a Date, a Map and a class instance     1605.9 ns  (1308.0-10168.7)
create, then first snapshot                                3749.9 ns  (3507.8-8185.9)
## c3b round 1 on node 24.21.0
read a Date field                                            77.8 ns  (74.9-84.2)
read a Map field                                             82.9 ns  (80.3-90.6)
read a field holding a class instance                        52.4 ns  (51.5-53.9)
read a field holding a plain object                          52.3 ns  (50.9-53.4)
write a Date field                                          257.9 ns  (249.9-264.6)
write a field holding a class instance                      452.9 ns  (442.1-529.7)
create a store with a Date, a Map and a class instance     4315.1 ns  (2277.8-8343.6)
create, then first snapshot                                6836.0 ns  (6217.1-20177.1)
## base round 2 on node 24.21.0
read a Date field                                            80.1 ns  (76.1-89.5)
read a Map field                                             83.1 ns  (80.3-90.0)
read a field holding a class instance                        83.5 ns  (81.2-90.2)
read a field holding a plain object                          52.3 ns  (50.7-53.4)
write a Date field                                          261.0 ns  (251.4-272.5)
write a field holding a class instance                      254.3 ns  (252.6-258.5)
create a store with a Date, a Map and a class instance     1453.1 ns  (1232.0-11378.3)
create, then first snapshot                                3499.0 ns  (3339.7-9524.1)
@codebelt/classy-store: a Point instance is in a store. It is kept by reference: a change to it notifies no one and shows in snapshots already taken. Set static [PROXYABLE] on the class to true to make it reactive, or to false to keep it as it is.
## c3a round 2 on node 24.21.0
read a Date field                                            78.4 ns  (76.3-86.1)
read a Map field                                             84.9 ns  (82.7-93.8)
read a field holding a class instance                        84.5 ns  (81.8-91.7)
read a field holding a plain object                          53.6 ns  (52.2-54.4)
write a Date field                                          277.9 ns  (266.9-288.8)
write a field holding a class instance                      284.1 ns  (280.3-291.4)
create a store with a Date, a Map and a class instance     1623.5 ns  (1212.8-9718.3)
create, then first snapshot                                4008.4 ns  (3631.8-8235.6)
## c3b round 2 on node 24.21.0
read a Date field                                            77.9 ns  (74.0-85.4)
read a Map field                                             84.5 ns  (80.8-90.0)
read a field holding a class instance                        54.3 ns  (53.5-55.4)
read a field holding a plain object                          52.8 ns  (52.0-53.9)
write a Date field                                          254.5 ns  (246.6-264.0)
write a field holding a class instance                      452.9 ns  (429.5-519.8)
create a store with a Date, a Map and a class instance     4292.1 ns  (2697.5-14185.4)
create, then first snapshot                                7085.6 ns  (6236.3-15905.8)
```

The write metrics of the core benchmark, three runs per build: engine, build, metric, median (lowest-highest) in nanoseconds.

```text
bun   base           store.write                   164 (163-168)
bun   base           store.write.same             34.8 (34.5-34.9)
bun   base           store.write.sync              179 (171-182)
bun   base           store.write.batched           176 (172-244)
bun   base           store.write.nested            329 (325-489)
bun   t3a-t1strict   store.write                   161 (160-167)
bun   t3a-t1strict   store.write.same             35.1 (35.1-35.1)
bun   t3a-t1strict   store.write.sync              178 (173-180)
bun   t3a-t1strict   store.write.batched           173 (172-179)
bun   t3a-t1strict   store.write.nested            341 (341-342)
bun   c1-w2c         store.write                   163 (159-165)
bun   c1-w2c         store.write.same             34.8 (34.8-34.9)
bun   c1-w2c         store.write.sync              175 (169-177)
bun   c1-w2c         store.write.batched           172 (170-178)
bun   c1-w2c         store.write.nested            325 (317-329)
bun   base           store.write                   165 (161-308)
bun   base           store.write.same             35.3 (34.9-63.5)
bun   base           store.write.sync              177 (173-226)
bun   base           store.write.batched           175 (174-277)
bun   base           store.write.nested            426 (327-471)
bun   c1-w2c         store.write                   171 (166-375)
bun   c1-w2c         store.write.same             35.5 (34.4-62.8)
bun   c1-w2c         store.write.sync              258 (175-274)
bun   c1-w2c         store.write.batched           257 (170-421)
bun   c1-w2c         store.write.nested            326 (319-566)
node  base           store.write                   314 (217-412)
node  base           store.write.same               86 (85.6-103)
node  base           store.write.sync              365 (252-463)
node  base           store.write.batched           300 (291-420)
node  base           store.write.nested            711 (521-998)
node  t3a-t1strict   store.write                   208 (206-213)
node  t3a-t1strict   store.write.same             57.9 (56.9-59.8)
node  t3a-t1strict   store.write.sync              240 (238-253)
node  t3a-t1strict   store.write.batched           212 (211-240)
node  t3a-t1strict   store.write.nested            506 (504-510)
node  c1-w2c         store.write                   210 (204-211)
node  c1-w2c         store.write.same             59.1 (57.7-59.6)
node  c1-w2c         store.write.sync              244 (235-247)
node  c1-w2c         store.write.batched           214 (212-214)
node  c1-w2c         store.write.nested            512 (500-514)
node  base           store.write                   213 (212-222)
node  base           store.write.same             58.3 (57-60.8)
node  base           store.write.sync              249 (247-260)
node  base           store.write.batched           217 (215-220)
node  base           store.write.nested            520 (517-528)
node  c1-w2c         store.write                   213 (207-215)
node  c1-w2c         store.write.same             58.2 (57.9-59)
node  c1-w2c         store.write.sync              244 (242-247)
node  c1-w2c         store.write.batched           212 (211-214)
node  c1-w2c         store.write.nested            512 (510-520)
```

The creation metrics for C4 (a) and the cached snapshot for C4 (b), the same columns.

```text
bun   base           create.small                 1656 (1647-1672)
bun   base           create.rows                649494 (609587-657243)
bun   c4             create.small                 1671 (1613-1680)
bun   c4             create.rows                604906 (600391-672674)
bun   base           create.small                 1681 (1600-1738)
bun   base           create.rows                612724 (602436-698964)
bun   c4             create.small                 1639 (1633-1754)
bun   c4             create.rows                683023 (601141-722731)
node  base           create.small                 6346 (5643-6372)
node  base           create.rows               1298838 (1204502-1441656)
node  c4             create.small                 4553 (3981-5390)
node  c4             create.rows               1112021 (1033057-1461524)
node  base           create.small                 5086 (4169-6040)
node  base           create.rows               1536068 (1118319-1647471)
node  c4             create.small                 6032 (5225-6717)
node  c4             create.rows               1501897 (1200306-1617081)
bun   base           snapshot.cached              14.3 (14.3-14.4)
bun   c4b            snapshot.cached               152 (151-154)
bun   base           snapshot.cached              14.4 (14.1-14.4)
bun   c4b            snapshot.cached               154 (151-155)
node  base           snapshot.cached              28.4 (28.3-28.4)
node  c4b            snapshot.cached               368 (367-370)
node  base           snapshot.cached              27.6 (27.3-27.8)
node  c4b            snapshot.cached               371 (365-377)
```

The whole core benchmark on `base` and on the combination, the ratio rows: engine, build, ratio, median, lowest, highest.

```text
bun (first run)   base     read: store.read / proxy.read            median  14.2  lowest  13.9  highest  14.5 
bun (first run)   base     write: store.write / proxy.write         median  2.74  lowest  2.66  highest  2.76 
bun (first run)   base     getter: getter.cached / proxy.read       median  31.1  lowest  29.7  highest  32.9 
bun (first run)   base     snapshot: snapshot.cached / proxy.read   median  6.49  lowest  6.49  highest  7.02 
bun (first run)   c1-w2c   read: store.read / proxy.read            median  15.1  lowest  12.6  highest  29.9 
bun (first run)   c1-w2c   write: store.write / proxy.write         median  2.76  lowest  1.79  highest  3.32 
bun (first run)   c1-w2c   getter: getter.cached / proxy.read       median  24.8  lowest  14.6  highest  30 
bun (first run)   c1-w2c   snapshot: snapshot.cached / proxy.read   median  10.4  lowest  5.38  highest  10.7 
bun (second run)  base     read: store.read / proxy.read            median  15.5  lowest  13.9  highest  16.1 
bun (second run)  base     write: store.write / proxy.write         median  2.68  lowest  2.64  highest  2.69 
bun (second run)  base     getter: getter.cached / proxy.read       median  30.2  lowest  30    highest  31.3 
bun (second run)  base     snapshot: snapshot.cached / proxy.read   median  7.36  lowest  6.58  highest  7.39 
bun (second run)  c1-w2c   read: store.read / proxy.read            median  13.9  lowest  12.2  highest  15.4 
bun (second run)  c1-w2c   write: store.write / proxy.write         median  2.62  lowest  2.61  highest  2.69 
bun (second run)  c1-w2c   getter: getter.cached / proxy.read       median  26.3  lowest  23.8  highest  31.8 
bun (second run)  c1-w2c   snapshot: snapshot.cached / proxy.read   median  6.37  lowest  5.96  highest  7.15 
node (only run)   base     read: store.read / proxy.read            median  2.05  lowest  2.01  highest  2.06 
node (only run)   base     write: store.write / proxy.write         median  1.35  lowest  1.34  highest  1.39 
node (only run)   base     getter: getter.cached / proxy.read       median  3.58  lowest  3.55  highest  3.77 
node (only run)   base     snapshot: snapshot.cached / proxy.read   median  1.4   lowest  1.35  highest  1.42 
node (only run)   c1-w2c   read: store.read / proxy.read            median  2.09  lowest  2.05  highest  2.22 
node (only run)   c1-w2c   write: store.write / proxy.write         median  1.35  lowest  1.25  highest  1.36 
node (only run)   c1-w2c   getter: getter.cached / proxy.read       median  3.5   lowest  3.41  highest  3.58 
node (only run)   c1-w2c   snapshot: snapshot.cached / proxy.read   median  1.35  lowest  1.35  highest  1.37 
```

Ten metrics of those runs (the second Bun run, and Node): run, build, metric, median (lowest-highest) in nanoseconds.

```text
full2-bun  base     store.read                 32.1 (31.5-32.2)
full2-bun  c1-w2c   store.read                   32 (31.5-32.3)
full-node  base     store.read                 48.6 (47.5-48.9)
full-node  c1-w2c   store.read                 50.7 (49.6-52.7)
full2-bun  base     store.write                 170 (170-172)
full2-bun  c1-w2c   store.write                 166 (165-171)
full-node  base     store.write                 214 (210-218)
full-node  c1-w2c   store.write                 216 (214-241)
full2-bun  base     store.method                245 (242-245)
full2-bun  c1-w2c   store.method                238 (234-245)
full-node  base     store.method                300 (299-301)
full-node  c1-w2c   store.method                309 (306-316)
full2-bun  base     array.pushPop              1733 (1719-1850)
full2-bun  c1-w2c   array.pushPop              1784 (1749-1848)
full-node  base     array.pushPop              3337 (3329-3411)
full-node  c1-w2c   array.pushPop              4030 (3989-4084)
full2-bun  base     create.small               1557 (1527-1684)
full2-bun  c1-w2c   create.small               1651 (1644-1661)
full-node  base     create.small               7561 (6469-7707)
full-node  c1-w2c   create.small               6422 (5552-7166)
full2-bun  base     create.rows              647167 (615091-667505)
full2-bun  c1-w2c   create.rows              672265 (666453-676678)
full-node  base     create.rows             1258726 (1225503-1698753)
full-node  c1-w2c   create.rows             1460211 (1163510-1721950)
full2-bun  base     snapshot.cached            14.9 (14.8-15.2)
full2-bun  c1-w2c   snapshot.cached            14.8 (14.6-15.6)
full-node  base     snapshot.cached            32.9 (32-33.8)
full-node  c1-w2c   snapshot.cached            32.8 (32.1-33.3)
full2-bun  base     snapshot.afterWrite      132065 (131651-132222)
full2-bun  c1-w2c   snapshot.afterWrite      130711 (128573-134503)
full-node  base     snapshot.afterWrite       68611 (65155-69391)
full-node  c1-w2c   snapshot.afterWrite       68993 (66812-70831)
full2-bun  base     getter.cached              63.6 (59.8-69.6)
full2-bun  c1-w2c   getter.cached              62.2 (53.9-74)
full-node  base     getter.cached                85 (83.8-89.6)
full-node  c1-w2c   getter.cached              84.8 (82.4-85.1)
full2-bun  base     subscribe                  45.7 (45.2-45.8)
full2-bun  c1-w2c   subscribe                  44.7 (44-45.3)
full-node  base     subscribe                  59.3 (58.2-61.8)
full-node  c1-w2c   subscribe                  59.7 (58.4-60.1)
```

`array.pushPop` and `store.method` again, back to back, with the two trap patches alone as a third build.

```text
bun   base           array.pushPop                1664 (1646-1688)
bun   c1-w2c         array.pushPop                1665 (1643-1688)
bun   t3a-t1strict   array.pushPop                1630 (1624-1648)
bun   base           array.pushPop                1642 (1632-1646)
bun   c1-w2c         array.pushPop                1666 (1663-1672)
bun   t3a-t1strict   array.pushPop                1633 (1624-1652)
node  base           array.pushPop                3642 (3617-3775)
node  c1-w2c         array.pushPop                3672 (3351-3715)
node  t3a-t1strict   array.pushPop                3576 (3424-3911)
node  base           array.pushPop                4004 (3888-4424)
node  c1-w2c         array.pushPop                3857 (3521-4303)
node  t3a-t1strict   array.pushPop                3558 (3274-3615)
bun   base           store.method                  233 (227-238)
bun   c1-w2c         store.method                  228 (215-231)
bun   t3a-t1strict   store.method                  221 (218-224)
bun   base           store.method                  234 (228-235)
bun   c1-w2c         store.method                  227 (215-230)
node  base           store.method                  301 (298-302)
node  c1-w2c         store.method                  303 (296-305)
node  t3a-t1strict   store.method                  301 (300-303)
node  base           store.method                  302 (300-304)
node  c1-w2c         store.method                  303 (301-306)
```

`bun run benchmark:core` and `bun run benchmark:core:node` on the unmodified worktree, five runs, the ratio rows.

```text
bun    read: store.read / proxy.read             median  14.2  lowest  10.2  highest  18.9 
bun    write: store.write / proxy.write          median  2.79  lowest  2.7  highest  3.41 
bun    getter: getter.cached / proxy.read        median  31.9  lowest  11.4  highest  956 
bun    snapshot: snapshot.cached / proxy.read    median  7.08  lowest  3.07  highest  12.2 
node   read: store.read / proxy.read             median  2  lowest  0.434  highest  2.52 
node   write: store.write / proxy.write          median  1.31  lowest  0.805  highest  1.63 
node   getter: getter.cached / proxy.read        median  3.53  lowest  1.43  highest  3.81 
node   snapshot: snapshot.cached / proxy.read    median  1.46  lowest  0.125  highest  2.32 
```

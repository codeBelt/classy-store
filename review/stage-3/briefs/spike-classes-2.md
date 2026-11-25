# Brief: verify the base class before it is promised

- **Report:** `review/stage-3/spike-classes-2.md`
- **Scratch folder:** `<scratch>/stage-3-spike-classes-2/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

`review/stage-3/spike-classes.md` recommends a base class, `ClassyStore`,
whose constructor returns the store, so that arrow-function fields, methods
bound in the constructor and whatever the constructor starts all write
through the store. Read that report whole, without its appendices D and E.
Its combination patch is in its appendix B: the trap patches T3 (a) and T1
strict, the base class, and W2, which makes an arrow function written to a
field of such a store a transaction.

The orchestrating agent wants to ship the base class in 1.0, and will only
do so if the points below hold. That report lists each of them under "Read or
reasoned, not run" or "Not run at all". Your job is to run them. Start from
its combination patch on a worktree at `57404c3`.

Two decisions made since that report was written:

- A getter that writes: only the snapshot half of the getter report's G7 is
  taken (G7a: a snapshot getter that writes to `this` throws). G7b, which
  made every write throw while any getter runs, is not taken, because it
  would refuse a base-class store made inside a getter.
- `review/stage-3/persist-devtools.md` is finished. Its P7 (`devtools`) and
  P8 (`history`) patches are in its appendix.

## The checks

**V1. Real compilers.** The first report wrote by hand what a compiler emits
for class fields. Compile a small `ClassyStore` subclass (fields, an
arrow-function field, a prototype method, a getter, a constructor with
arguments that starts a timer) with each of these, and run the result:

- TypeScript with `useDefineForClassFields` true and false;
- Bun's own transpiler, which the unit suite uses;
- esbuild or whatever `tsdown` runs in this repository;
- SWC as Next.js configures it, with the `tsconfig.json` of the Next.js
  example;
- Babel with class properties in spec and in loose mode.

Install what is missing in your scratch folder, never in the repository. For
each: is the first snapshot right, does an arrow method notify once per
call, is a field write seen, does the timer's write notify?

**V2. The other adapters.** Only React was run. Write throwaway tests in the
worktree, modelled on the existing unit tests of the Vue, Svelte, Solid and
Angular adapters, that use a base-class store. Also `useLocalStore(() => new
Sub())` and `createStoreHook`.

**V3. The edges of W2.** W2 wraps an arrow function when it is written to a
field of a base-class store. So:

- A callback assigned to a field after construction reads back as its
  wrapper. Show exactly what a user sees: identity, `===`, a list of
  callbacks, `removeEventListener`.
- Can W2 be limited to what the constructor installs, with every compiler of
  V1? If not, say so plainly.
- What do `snapshot()`, `withHistory`, `persist`, `cloneSnapshot` and
  `shallowEqual` see for such a field: the wrapper or the original? Stage 1
  finding 60 and `merged.md` M59 are about a function in an own field.
- An ordinary `function` in a field, a bound function, a class held as a
  value in a field of a base-class store.

**V4. Undo and time travel of a nested base-class store.** The first report's
limit 3: after an undo, a base-class store that sits inside another store
comes back as a frozen copy whose arrow functions still write the original.
Reproduce it with `withHistory`, and with the DevTools jump of the P7 patch.
Then spike a restore that changes a nested object in place where it can
(`merged.md` M60), and show whether the nested store stays the same object
with working arrow methods. Give the cost of undo on a list of 1,000 rows
before and after, since M60 is a performance entry.

**V5. Getters.** Apply the getter report's combination patch as well (its
appendix E; it contains G7a and not G7b). Check that a base-class store made
inside a getter, or inside a method a getter calls, works on the live store
and on a snapshot, and say what a getter that returns `new Sub()` gives on
each layer.

**V6. Types and shapes.** `Snapshot<Sub>`, a generic subclass, an abstract
subclass, a subclass of a subclass, static members, `instanceof` on the store
and on its snapshot, `createClassyStore(new Sub())` returning the same store,
and a subclass that also sets `static [PROXYABLE]`. Use the package's own
`tsc`.

## What the report ends with

One of two recommendations, with the evidence for it:

- **Ship `ClassyStore` in 1.0**, with its exact public surface, the sentence
  for each limit the docs must carry, the tests stage 4 writes first, and its
  bytes; or
- **Ship it after 1.0**, with what has to be true first.

Say separately whether W2 ships with it, in which form.

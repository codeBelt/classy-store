# Stage 3: a development build and its diagnostics

Stage 3 of the pre-1.0 review, 2026-11-24. API question 8, merged entries
M72 and M73, contradictions 17 to 19, and item 21 of "Proposals I think are
wrong". No library source in the repository was changed. Every spike ran in a
throwaway worktree, `<scratch>/stage-3-devbuild/wt`, detached at
`release/1.0` (`96111db`, whose package source is the same as `57404c3`).
Bun 1.4.5, Node 24.21.0. The unmodified main entry measures 3,661 bytes on
Bun 1.4.5, as on 1.4.4.

## Summary

| Item                         | Result                                                                                                                                                                                                                                              | Recommendation                                                                                                                     | Label                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| B1. The split                | Of the first wave's 625 bytes, 271 are message text. Short coded messages with no split save the same 271 that either split saves. A split saves more only by dropping checks (58 bytes, D4 and G5) or by keeping warnings out (848 bytes for five) | Shape E: an inline `process.env.NODE_ENV` read at each guard, never a module constant. It gives development to Node, Bun and tests | Can follow 1.0                            |
| B2. Codes and messages       | A code and the names cost 43 bytes more than a bare code and keep production errors readable                                                                                                                                                        | `@codebelt/classy-store [code]: facts`, advice in development, one docs page. The same throws in both builds (contradiction 18)    | Before 1.0: the codes and the throw rule  |
| B3. The list and five spikes | 23 diagnostics listed. Five warnings spiked: 0 tests fail, 31 bytes in production together, 848 in development. `spike-classes.md` C3 (a) and C4 (b) are better forms of two of them                                                                | Ship `write-after-await`, `native-collection`, `sync-flood`, the `snapshot-mutator` text, and C3 (a) and C4 (b) for the other two  | Can follow 1.0; I would ship them with it |
| Budgets                      | The recommended set measures 4,020 bytes on the main entry; every other entry stays inside its budget                                                                                                                                               | Main entry about 4,125, set once by the decision document for the whole approved set                                               | A decision record                         |

Three things the owner should know before the detail:

1. **A split does not pay for messages.** The bytes are in the advice
   sentence, and a code with the names says enough in production. What a
   split pays for is warnings, which must never reach production.
2. **The usual way to write shape E leaks.** A module constant
   `const DEV = process.env.NODE_ENV !== 'production'` is kept in production
   by Bun and esbuild once the module has an `import`, which ours has: one
   warning cost 218 bytes that way and 6 bytes inline. An unbundled inline
   read costs 184 nanoseconds on Node, so each guard goes after a cheap test.
3. **Shape C hides the diagnostics where they are needed.** Plain Node,
   `bun app.mjs`, `bun test` and esbuild without `--minify` all load
   production under export conditions, with no sign of it.

## B1. How the build is split

**Question.** Should development-only code be removed by the application's
bundler through an inline `process.env.NODE_ENV` check (shape E, as Vue's
bundler build, MobX, Legend-State, Immer, Zustand and Jotai do), selected by
`development` and `production` export conditions that point at separate files
(shape C, as Solid and Vue's Node builds do), or not split at all (shape N)?
M72, contradiction 17. Solid 9 and Vue Q8 describe the two working setups.

### What was built

- **The checks.** The first-wave patches that add a check or a message,
  applied together to the worktree: `d1.patch` (one delivery queue, with its
  bound of 100 rounds and its message), `d4-runtime-after.patch` (`batch()`
  refuses a promise), `t3b.patch` (a definition is a write; accessors,
  read-only values and a prototype change are refused, three messages),
  `G7b` (a getter that writes throws, on both layers, which includes `G7a`)
  and `G5` (the snapshot memo map and the snapshot cycle error). `G5` and
  `G7b` conflict in one hunk of `snapshot.ts`; the resolution keeps both, and
  passes the getter's key to `computeWithTracking` as `G7b` needs. This is
  "the first-wave set" below. 1,284 tests pass and 57 fail, the sum of what
  the five spikes fail alone; none of the 57 is new.
- **The three existing messages** are counted too: the live getter cycle,
  "object is not a store proxy", and the snapshot's circular reference.
- **Shape N** is the first-wave set as the reports wrote it.
- **Shape E**: every message is
  `process.env.NODE_ENV !== 'production' ? <long text> : <short text>`, the
  check itself is unchanged. A second form, E with checks, also puts the D4
  promise check and the G5 snapshot cycle check behind the same condition.
- **Shape C**: the same source as E, built twice by tsdown with
  `process.env.NODE_ENV` defined: `"production"` into `dist/`,
  `"development"` into `dist/development/`. Every export and the
  `#store-runtime` import get a `development` condition ahead of `import` and
  `require`. Types are shared. Patch `c-conditions.patch` in the appendix.
- **Shape N with codes**: no split; every message is the short text only.
  This is the B2 format without a development build.

The script that rewrites the eleven message sites into each form is
`variant.py` in the appendix, so every number below can be rebuilt.

### Bytes of the main entry in production

Gzipped bytes, measured as `bun run size` does (Bun, minified,
`process.env.NODE_ENV` defined as `"production"`). Every other entry moves by
the same amount within 10 bytes, because each is measured with the main one.

| Form                                                              | Main entry | Against 3,661 | Against the first-wave set |
| ----------------------------------------------------------------- | ---------: | ------------: | -------------------------: |
| Unmodified                                                        |      3,661 |             0 |                            |
| First-wave set, shape N, long messages                            |      4,286 |          +625 |                          0 |
| First-wave set, no split, a code and the names (the B2 format)    |      4,015 |          +354 |                       −271 |
| First-wave set, no split, a bare code only                        |      3,972 |          +311 |                       −314 |
| Shape E, messages behind the condition                            |      4,018 |          +357 |                       −268 |
| Shape E, messages and the D4 and G5 checks behind the condition   |      3,960 |          +299 |                       −326 |
| Shape C, the production tree (same source as the first E row)     |      4,015 |          +354 |                       −271 |
| Shape E where the bundler does not replace `process.env.NODE_ENV` |      4,452 |          +791 |                       +166 |

What this says:

1. **Of the 625 bytes the first wave adds, 271 are message text.** The
   checks, the queue and the traps are the other 354.
2. **A split saves nothing on messages that short codes do not save
   without one.** Shape E and shape C give 4,018 and 4,015; the no-split form
   with codes gives 4,015. The difference is the long text, which a split
   keeps for development and the no-split form drops. The long text can live
   in the documentation, keyed by the code, at no cost to the bundle.
3. **A split saves 58 bytes more only by removing checks from production**:
   the D4 promise check and the G5 snapshot cycle check. Both are rows where
   production then behaves differently from development (a promise is
   accepted silently; a cycle overflows the stack, Svelte's choice). That is
   contradiction 18, decided under B2 below.
4. **Shape E costs 166 bytes more than no split at all** in a bundle whose
   bundler leaves `process.env.NODE_ENV` alone, because both texts stay. No
   bundler I ran does that once it minifies (table below), so this is the
   case of a hand-rolled build only.
5. **Shape C's production tree equals the no-split form with codes to the
   byte**: the define removes the condition at build time, and the
   development tree is never measured.

Per message, from turning one site at a time into the short form (gzip makes
these overlap, so they do not add up to the totals): the D1 bound's message
74 bytes, the three T3 (b) messages 79 together, the D4 message 48. The
existing messages and the getter messages gain or lose under 10 each; their
text is already short.

**T3 (b) and (c) alone**, each on the unmodified worktree, with their
messages as written and in the B2 production form (`t3-codes.py`, appendix):

| Variant | As written | In the B2 form | Saved | Over T3 (a)'s 3,710, as written and in the B2 form |
| ------- | ---------: | -------------: | ----: | -------------------------------------------------: |
| T3 (b)  |      3,870 |          3,790 |    80 |                                         +160 / +80 |
| T3 (c)  |      3,924 |          3,820 |   104 |                                        +214 / +110 |

So half of what (b) and (c) add over (a) is message text, and a code with
the key removes it with no split. The traps report's recommendation of (a)
does not change: the rest is the refusal itself.

### What each toolchain loads

Run with a consumer package that imports the built library through a
symbolic link and reports which build threw the error: shape E built once,
shape C built twice. "Dev" is the development text, "prod" the production
text.

| Toolchain                                               | Shape E      | Shape C |
| ------------------------------------------------------- | ------------ | ------- |
| `node app.mjs`                                          | dev          | prod    |
| `NODE_ENV=production node app.mjs`                      | prod         | prod    |
| `node --conditions=development app.mjs`                 | dev, not run | dev     |
| `bun app.mjs`                                           | dev          | prod    |
| `NODE_ENV=production bun app.mjs`                       | prod         | prod    |
| `NODE_ENV=development bun app.mjs`                      | dev, not run | prod    |
| `bun --conditions=development app.mjs`                  | dev, not run | dev     |
| `bun test`, which sets `NODE_ENV=test`                  | dev          | prod    |
| `bun build` (no flag)                                   | dev          | dev     |
| `bun build --minify` (through `Bun.build`)              | dev          | dev     |
| `bun build --production`                                | prod         | prod    |
| esbuild 0.28, `--bundle` without `--minify`             | dev          | prod    |
| esbuild 0.28, `--bundle --minify`                       | prod         | prod    |
| Vite 8.3 dev server                                     | dev          | dev     |
| Vite 8.3 `build`                                        | prod         | prod    |
| `NODE_ENV=development` Vite 8.3 `build`                 | not run      | dev     |
| Next.js 16.4 `next dev` (Turbopack), server and browser | dev          | dev     |
| Next.js 16.4 `next dev --webpack`, server and browser   | not run      | dev     |
| Next.js 16.4 `next build` and `next start` (Turbopack)  | prod         | prod    |
| Next.js 16.4 `next build --webpack`                     | not run      | prod    |
| A browser `<script type="module">` with no bundler      | fails        | fails   |

- **The browser row fails today, for both shapes and for shape N.** The
  built entry imports `#store-runtime`, a bare specifier that a browser
  cannot resolve without an import map; that is a property of the current
  package, not of the split. Read from `dist/index.mjs`, not run. A CDN that
  rewrites imports (esm.sh, jsDelivr's `+esm`) resolves it; I did not check
  which conditions they apply. Shape E adds a second failure there:
  `process` is not defined, so the line that builds a message throws a
  `ReferenceError` instead of the library's error.
- **The test runners differ.** Under shape C, `bun test` and plain Node get
  production and no diagnostics, silently (Solid 9 found the same for
  Node). Under shape E they get development, which is where a developer
  needs the diagnostics. Vitest was not installed in the repository and was
  not run.
- **Bun's bundler is development by default** under both shapes, even with
  `--minify`: it picks the `development` condition and defines `NODE_ENV` as
  development unless `--production` is passed.
- "Not run" under shape E: the shape reads only `NODE_ENV`, so a condition
  flag changes nothing and the answer follows from the rows above it.

### The cost of reading `process.env` in shape E

A check that runs on every call, such as D4's promise check on every
`batch()`, pays for the read where no bundler replaced it: Node, unbundled
SSR, tests.

| Form of the check                                                     | Node 24 | Bun 1.4.5 |
| --------------------------------------------------------------------- | ------: | --------: |
| `process.env.NODE_ENV !== 'production'` at the call site              |  184 ns |    1.4 ns |
| A module constant `const DEV = process.env.NODE_ENV !== 'production'` |  4.7 ns |    2.4 ns |

184 nanoseconds is more than a whole store write on Node (165 to 217 in the
first-wave tables). MobX avoids it with a module constant. I checked which
bundlers still remove the development branch for each form, with small
libraries built for the purpose (`<scratch>/stage-3-devbuild/fold`):

| Form                                                                                    | Bun `--production` | esbuild `--minify` | Vite 8.3 build | Next.js 16.4 Turbopack | Next.js 16.4 webpack |
| --------------------------------------------------------------------------------------- | ------------------ | ------------------ | -------------- | ---------------------- | -------------------- |
| Inline `process.env.NODE_ENV !== 'production'`                                          | removed            | removed            | removed        | removed                | removed              |
| Inline, after a cheap test: `typeof o.v === 'function' && process.env.NODE_ENV !== ...` | removed            | removed            | removed        | removed                | removed              |
| Inline, guarded with `typeof process !== 'undefined' &&`                                | removed            | removed            | removed        | removed                | removed              |
| Module constant, in a module with no `import`                                           | removed            | removed            | removed        | removed                | removed              |
| Module constant, guarded with `typeof process`, no `import`                             | **kept**           | **kept**           | **kept**       | removed                | **kept**             |
| Module constant, in a module that has an `import`                                       | **kept**           | **kept**           | removed        | removed                | removed              |
| Constant imported from a module of its own                                              | **kept**           | removed            | removed        | removed                | removed              |

Our runtime file imports `proxy-compare` and a shared chunk, so it is the
second-to-last row. I first spiked the B3 diagnostics with a module constant:
`bun run size` measured 3,879 bytes for one warning, 218 more than the
unmodified entry, because Bun's minifier kept the whole branch. With the
inline form the same warning costs 6 bytes.

So shape E has exactly one safe form: the inline read at each call site,
placed after a test that is cheap and almost always false, so that unbundled
Node pays the 184 nanoseconds only when the rare case is already at hand.
Where no cheap test exists (a check on every write), the read costs those
184 nanoseconds per write in development on Node, and nothing in a bundled
production build. One more trap, found in B3: a call to a helper whose body is
guarded is not removed, because the minifier keeps a call to an emptied
function; six such calls cost 26 bytes. The guard has to sit at the call site.

Shape C has none of these traps: the library's own build replaces the
expression with a literal, and tsdown removes the branch before any consumer
sees it.

### `bun run check:package`

- **Shape C**: passes. publint in strict mode says "All good"; arethetypeswrong
  shows every entry green for node16 from CommonJS and from ESM and for
  bundlers. It does not resolve the `development` branch, so a mistake in
  that branch would pass this check unseen. The packed tarball grows from
  102 files and 0.57 MB unpacked to 146 files and 1.1 MB, most of it the
  second set of source maps.
- **Shape E and shape N** change no file `check:package` reads. Not run
  separately; the unmodified package passes in CI.

### What each shape costs to maintain

- **N**: nothing. Every check is in every build.
- **E**: one artifact. The size script already defines `NODE_ENV` as
  production (`tests/size/runSize.ts`), so the budgets measure the
  production branch with no change. Every guard must be the inline form
  described above. The size script shows a guard that leaks as a number; a
  test on the built file (no development text left after
  `bun build --production`) names the cause.
- **C**: a second tsdown build per format, the `development` key in eleven
  places of `package.json` (ten exports and the `#store-runtime` import), and
  a check that each export's development file exists. The shared runtime
  holds within each tree, because `#store-runtime` resolves under the same
  conditions as the entry that imports it: in the Vite dev server the
  library loaded `dist/development/index.mjs`, its chunk and
  `dist/development/storeRuntime.mjs`, and nothing from `dist/`.

## B2. Codes and messages

**Question.** What does a diagnostic look like, and which text stays in
production? M72 ("Codes"), contradiction 18. Solid 8 and Svelte 11 give each
diagnostic a stable string code; Immer and MobX throw a number in production;
the Signals report found that the TC39 polyfill's production errors are
empty, and asks that the text stay.

### What the measurements say

From the B1 table: the first wave's messages are 271 of its 625 bytes. A short
form that keeps a code and the names involved (the getter, the key, the cycle
path) costs 43 bytes more than a bare code (4,015 against 3,972), and gives
a production error a reader can act on without a lookup. The advice sentence
("Declare it as a method", "Group those writes with batch()") is what a split
removes, and it is the only part a split removes.

### Proposed format

```text
@codebelt/classy-store [getter-write]: total count
@codebelt/classy-store [getter-write]: total count. A getter must not write; move the write into a method
```

The first line is what production throws; the second is development.

1. **The prefix stays** `@codebelt/classy-store`, as every message has it
   today. Adapters keep their own prefix (`@codebelt/classy-store/vue`).
2. **The code** is a short kebab-case string in brackets, stable from 1.0:
   renaming one is a breaking change; a new one is not. Strings, not numbers
   (MobX 7 is right that numbers are not worth a table at our size; a string
   is readable without one).
3. **The facts** follow a colon: the names the user wrote, nothing else. They
   are in every build.
4. **The advice** is one sentence, in development only. The same sentence is
   on one documentation page, "Errors and warnings", one heading per code, so
   a production error is one search away from it. That page is new and
   belongs in the API reference.
5. **Warnings are development only**, always `console.warn`, once per object,
   code and key (Solid's rule), with the same three parts.
6. **The error class** is the one the engine would throw for the same
   mistake where there is one (`TypeError` for a write to something frozen),
   otherwise `Error`. No subclass and no `code` property: both would be new
   public surface (item 21).

### What stays in production

- **Every thrown error, with its code and facts.** No check throws in one
  build and not the other. This takes the side of MobX 7 and Signals Q8 in
  contradiction 18 and rejects Immer 4's development-only throw: a program
  that works in development and fails in production, or the reverse, is worse
  than either. Two first-wave items change under this rule:
  - **D4's promise check** throws, so it cannot move to development. Its job
    is done better by the `write-after-await` warning (B3, S5), which also
    covers an `async` store method and does not refuse
    `batch(() => { store.loading = true; return save(); })`, the harmless
    shape `merged.md` item 11 warns about. Drop D4's runtime check; keep its
    type.
  - **The G5 snapshot cycle check** stays in production. Without it a cycle
    is a stack overflow in production only, Svelte's choice, which this rule
    rejects. It costs about 30 bytes.
- **The D1 bound** stays in production. It is what stops a hang; its
  `console.error` carries the code and no class names (the names cost 33
  bytes and say `Object` for a plain object, per the delivery report).
- **The subscriber's own error**, passed to `console.error` as it is, is the
  user's error and keeps its text.
- **Warnings never reach production.**

### The existing messages under the format

| Today                                                                                           | Code             | Facts in every build | Advice in development                                  |
| ----------------------------------------------------------------------------------------------- | ---------------- | -------------------- | ------------------------------------------------------ |
| `circular computed getter dependency: a → b → a`                                                | `getter-cycle`   | the path             | These getters read each other                          |
| `object is not a store proxy`                                                                   | `not-a-store`    | none                 | Pass the object that `createClassyStore()` returned    |
| `circular reference detected in snapshot`                                                       | `snapshot-cycle` | none                 | The store holds itself; a snapshot cannot hold a cycle |
| The Vue, Solid and Angular adapters' "requires an active ... scope / owner / injection context" | `no-scope`       | the adapter          | where to call it, as today                             |

29 lines in 15 test files match today's text (for example `toThrow(/not a
store proxy/)`) and have to be rewritten to match the code; counted with
`grep`, not run. That is the reason to fix
the codes before 1.0, although the format itself could follow it.

## B3. The list

Every diagnostic a report proposed, with the first wave's checks, without
duplicates. "Always" means in every build; "dev" means in development only,
which needs B1. Bytes are gzipped bytes of the main entry in production unless
another entry is named; "dev bytes" is what the development branch adds when
it is kept. A row marked **spiked** was built and measured here; the first
wave's rows cite their report.

| Code                                                                                                                   | The silent failure it catches                                                                          | Where                                                     | Kind                               | Build                     | Production bytes                                                          | Hot path                                                                           | Source                                          | For 1.0                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------- | ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `delivery-loop`                                                                                                        | A subscriber that writes on every call: stack overflow or a hung event loop (findings 18, 19)          | `drain()` in `core.ts`                                    | Error, logged                      | Always                    | 75 to 130 as spiked; about 60 with a code                                 | One counter per round                                                              | D1; MobX 5, Svelte 11, Vue 9, Signals 8         | Yes, with D1                                                                      |
| `getter-cycle` on a snapshot                                                                                           | Two getters that read each other overflow the stack on a snapshot (finding 38)                         | `snapshot.ts`                                             | Error                              | Always                    | About 30 for the check                                                    | A push and pop per snapshot getter computed                                        | G5; MobX                                        | Yes, with G5                                                                      |
| `getter-write`                                                                                                         | A getter that writes to `this` loses the write on a snapshot (finding 39)                              | Snapshot getter proxy; store `set` trap                   | Error                              | Always                    | 20 (G7a, engine error); 51 more for G7b                                   | One length check per write (G7b)                                                   | G7a, G7b; MobX 6, Solid 8, Signals 7, Svelte 11 | G7a yes; G7b as the getters report decides                                        |
| `define-accessor`, `define-readonly`                                                                                   | Accessor or read-only definitions through a store                                                      | `defineProperty` trap                                     | Error                              | Always                    | Most of T3 (b)'s 160                                                      | None                                                                               | T3 (b); Immer 3, Svelte 2                       | No: the traps report recommends (a)                                               |
| `set-prototype`                                                                                                        | A prototype swapped through a store (findings 47, 48)                                                  | `setPrototypeOf` trap                                     | Error                              | Always                    | Not measured alone                                                        | None                                                                               | T3 (b); Svelte                                  | If the owner takes that part of T3 (b)                                            |
| `batch-async` (D4's runtime check)                                                                                     | `batch()` given an `async` function                                                                    | `batch()`                                                 | Error                              | Always, or not at all     | 50 to 85                                                                  | One `instanceof` per call                                                          | D4; Legend-State 3, Solid 8                     | No: replaced by `write-after-await`                                               |
| **`write-after-await`** (spiked, S5)                                                                                   | Writes after an `await` in a store method or a `batch()` callback notify one by one                    | `transactional()`, `batch()`, `notifyMutation()`          | Warning                            | Dev                       | 21                                                                        | Production: one `instanceof` per method call, one `Map.size` per write             | REVIEW_PLAN "findings in hand"; Solid 8; MobX 6 | Yes                                                                               |
| **`arrow-method`** (spiked, S1; C4 (b) in `spike-classes.md`)                                                          | An arrow-function method's writes skip the proxy and notify no one                                     | S1: indexing loop of `createNode()`. C4 (b): `snapshot()` | Warning                            | Dev                       | S1: 6. C4 (b): 168 to 309 always on; behind the inline guard not measured | Development: C4 (b) makes a cached snapshot 11 to 13 times dearer                  | REVIEW_PLAN; MobX 8; C4                         | Yes, as C4 (b)                                                                    |
| **`native-collection`** (spiked, S2)                                                                                   | A native `Map` or `Set` in a store: `set()` and `add()` notify no one                                  | `linkChild()`                                             | Warning                            | Dev                       | 0                                                                         | None in production; development examines each opaque value once                    | Vue 10, MobX Q5                                 | Yes                                                                               |
| **`opaque-instance`** (spiked, S2; C3 (a) in `spike-classes.md`)                                                       | A class instance without `PROXYABLE`: writes inside it notify no one                                   | `linkChild()`, where a value enters only (C3 (a))         | Warning                            | Dev                       | 0 (with the row above); C3 (a) always on: 108 to 209                      | Development only; C3 (a) always on: 8 to 10% on a write of an opaque value on Node | Vue Q8; C3                                      | Yes, as C3 (a), once per class                                                    |
| **`sync-flood`** (spiked, S4)                                                                                          | Many direct writes with a framework binding: one snapshot each (adapters A1, the 640-millisecond case) | `drain()`, or `deliver()` today                           | Warning                            | Dev                       | 8                                                                         | Development on Node: one `process.env` read per sync delivery, 184 ns              | Adapters Q8                                     | Yes                                                                               |
| **`snapshot-mutator`** (spiked, S3)                                                                                    | A mutator called on a snapshot of a reactive collection; today a bare engine `TypeError`               | `ReactiveMap`, `ReactiveSet`                              | Error                              | Text in dev, error always | 0 on `./collections`; 92 if named always                                  | Production: none. Development: one `Object.isFrozen` per mutator call              | Valtio V10, Immer 8                             | Yes, the development form                                                         |
| `getter-cycle`, `not-a-store`, `snapshot-cycle`                                                                        | Exist today                                                                                            | `core.ts`, `snapshot.ts`                                  | Error                              | Always                    | Small change either way                                                   | None                                                                               | Today                                           | Codes only                                                                        |
| `array-named-property`                                                                                                 | A named property written to an array: kept live, dropped from snapshots (M37)                          | `set` trap                                                | Warning                            | Dev                       | Not built; the test has to sit after `Array.isArray`, so a few bytes      | One `getArrayIndex` per array write, development only                              | Immer 4                                         | Can follow 1.0                                                                    |
| A write around the proxy, found per call                                                                               | Bound methods and raw writes, beyond arrow fields                                                      | Method wrapper                                            | Warning                            | Dev                       | Not built                                                                 | One pass over own keys per call                                                    | Solid 8                                         | No: `arrow-method` covers the common case, and T1 stops wrapping stored functions |
| Both forms of one object in a collection                                                                               | Finding 34                                                                                             | Collections                                               | Warning                            | Dev                       | Not built                                                                 |                                                                                    | Vue Q8                                          | No: M39's single membership rule removes the cause                                |
| Opt-in: a getter that recorded no dependency                                                                           | Findings 30, 36                                                                                        | Getter engine                                             | Warning                            | Dev, opt-in               | Not built                                                                 |                                                                                    | MobX Q8                                         | No: needs a switch, which is new API                                              |
| Opt-in: a write outside a transaction                                                                                  | Every direct write to an observed store                                                                | `set` trap                                                | Warning                            | Dev, opt-in               | Not built                                                                 |                                                                                    | MobX 6                                          | No: `sync-flood` reaches the costly case without a switch                         |
| `persist-record`, `persist-option` (P2, P3 in `persist-devtools.md`)                                                   | Records skipped without a report (M44, M45); a `properties` list `persist` cannot honour               | `persist.ts`                                              | Error: `onError` (P2), thrown (P3) | Always                    | `./utils`: P2 and P3 together +214; +158 with codes (below)               | None                                                                               | Security Q8, Zustand and Jotai Q8; P2, P3       | Yes, with P2 and P3, in the B2 format                                             |
| `persist`: `syncTabs` with storage that is not `localStorage`                                                          | Cross-tab sync that never fires (M53)                                                                  | `persist.ts`                                              | Warning                            | Dev                       | Not built here                                                            |                                                                                    | Security Q8                                     | No: P6 ignores events from another area instead                                   |
| `devtools`: a malformed message, an unknown key                                                                        | M56                                                                                                    | `devtools.ts`                                             | Warning                            | Dev                       | Not built here                                                            |                                                                                    | Security Q8                                     | The same                                                                          |
| Angular: name the caller in the injection error                                                                        | Adapters N2                                                                                            | `angular.ts`                                              | Error                              | Always                    | A few bytes on `./angular`                                                | None                                                                               | Adapters N2                                     | Yes, with the code `no-scope`                                                     |
| The four tools: listener count, tracked paths through `useDebugValue`, write-cause hooks, a replaceable error reporter | Test suites, React DevTools, debugging                                                                 | New API                                                   | Tools                              |                           |                                                                           |                                                                                    | MobX Q8, Valtio Q8, Vue Q8, Legend-State 1      | No, after 1.0 (item 21; agreed)                                                   |

### The `persist` messages of P2 and P3

`persist-devtools.md` says about 100 of its `./utils` growth are error text in
P2 and P3, and could go if a development build keeps messages. Measured here
by applying `p2.patch` and `p3.patch` from its appendix (one import line
conflicts; the resolution imports `findGetterDescriptor`,
`findPropertyDescriptor` and `isPlainObject`), then rewriting the two
messages into the B2 format with `persist-codes.py` (appendix):

| Form                                                                            | `./utils` adds | Against today's 2,686 |
| ------------------------------------------------------------------------------- | -------------: | --------------------: |
| P2 and P3 as the report wrote them                                              |          2,900 |                  +214 |
| The B2 format, no split: `[persist-record]: version`, `[persist-option]: "key"` |          2,844 |                  +158 |
| Shape E, advice in development                                                  |          2,844 |                  +158 |

So the codes save 56 bytes, the same with or without a split, as for the
core. The four reasons of P2 become one word each (`shape`, `expiresAt`,
`version`, `migrate`); the sentence that explains each is the documentation's.
Both reports keep these as errors in every build, which is B2's rule: a record
that cannot be used reaches `onError` in production too.

`persist-devtools.md` keeps `devtools({enabled})` defaulting to `true`,
because "the library has no portable way to know it runs in production". Under
shape E it has one, the same as its own warnings; see contradiction 19 below.

### The five spikes

Each spike is one patch on the unmodified worktree, measured alone; the
combination is all five. The shared module `src/core/diagnostics.ts` (28
lines) holds `warnOnce()`, which keeps a `WeakMap` from an object to the
codes and keys already reported, and `nameOf()`. Every guard is the inline
form B1 found safe. The reproductions are `b3.ts` in the appendix; the
"before" column is the unmodified worktree.

| Spike                                     | Lines (core, collections) | Tests      | Typecheck |                                        Main entry, production | Main entry, development branch kept | Before                                                                                                     | After                                                                                                                                                                       |
| ----------------------------------------- | ------------------------: | ---------- | --------- | ------------------------------------------------------------: | ----------------------------------: | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmodified                                |                           | 1,341 pass | Passes    |                                                         3,661 |                               3,661 |                                                                                                            |                                                                                                                                                                             |
| S1 `arrow-method`                         |                    +16, 0 | 1,341 pass | Passes    |                                                    3,667 (+6) |                        3,894 (+233) | `inc = () => this.count++`: the count moves, 0 notifications, no word                                      | The same, and one warning naming `Counter.inc`. A callback field assigned later: no warning                                                                                 |
| S2 `native-collection`, `opaque-instance` |                    +43, 0 | 1,341 pass | Passes    |                                                     3,661 (0) |                        4,050 (+389) | `tags.set('a', 1)` on a native `Map`, and `p.x = 5` on an unmarked instance: 0 notifications, no word      | One warning each. A `Date`: no warning                                                                                                                                      |
| S3 `snapshot-mutator`, development text   |                    0, +17 | 1,341 pass | Passes    |                          3,661; `./collections` adds 725 (−2) |                        not measured | `snap.m.set('a', 1)`: `TypeError: Attempted to assign to readonly property.`                               | Development: `TypeError: @codebelt/classy-store [snapshot-mutator]: set() was called on a snapshot, which is frozen. Call it on the store`. Production: today's `TypeError` |
| S3, named in every build                  |                    0, +17 | 1,341 pass | Passes    | 3,661; `./collections` adds 819 (+92, over its budget of 750) |                                     | As above                                                                                                   | The named `TypeError` in every build                                                                                                                                        |
| S4 `sync-flood`                           |                    +24, 0 | 1,341 pass | Passes    |                                                    3,669 (+8) |                        3,847 (+186) | 2,000 direct writes with a sync subscriber: 2,000 calls, no word                                           | The same calls, one warning at the 100th                                                                                                                                    |
| S5 `write-after-await`                    |                 +42 −2, 0 | 1,341 pass | Passes    |                                                   3,682 (+21) |                        4,015 (+354) | An async method with two pushes and a write after its `await`: 4 sync notifications. `batch(async ...)`: 3 | The same counts, one warning naming `load()` or `batch()`                                                                                                                   |
| **The five together**                     |              +123 −3, +17 | 1,341 pass | Passes    |                                                   3,692 (+31) |                        4,540 (+879) |                                                                                                            | All of the above                                                                                                                                                            |

**Timings** of the five together against the unmodified build, built
`dist` copied aside with its own `package.json`, run back to back with
`runCoreBenchmark.mjs`, five runs each, median with the lowest and highest
run. The benchmark imports `dist` unbundled with `NODE_ENV` unset, so this is
the development branch: every warning check runs. The machine had a load
average of about 27 from other agents; the unmodified build's first runs
caught most of it, which is why its spreads are wide.

Bun 1.4.5, nanoseconds per operation:

| Metric                | Unmodified                 | The five warnings         | Against unmodified |
| --------------------- | -------------------------- | ------------------------- | ------------------ |
| `store.read`          | 33.4 (32.6 to 939)         | 32.4 (31.7 to 32.8)       | same               |
| `store.write`         | 233 (175 to 2039)          | 180 (171 to 209)          | same               |
| `store.write.sync`    | 193 (188 to 1708)          | 194 (181 to 209)          | same               |
| `store.write.batched` | 196 (183 to 4539)          | 208 (182 to 226)          | same               |
| `store.method`        | 257 (244 to 3176)          | 250 (244 to 264)          | same               |
| `store.batch10`       | 1619 (1513 to 25956)       | 1552 (1503 to 1652)       | same               |
| `array.pushPop`       | 2080 (1827 to 14679)       | 1880 (1740 to 1949)       | same               |
| `create.small`        | 2040 (1652 to 3866)        | 1602 (1494 to 2127)       | same               |
| `create.rows`         | 685451 (645273 to 1375419) | 697392 (622084 to 724757) | same               |
| `snapshot.cached`     | 16.4 (15.6 to 67.7)        | 15.8 (15.2 to 16.1)       | same               |
| `getter.cached`       | 73.9 (69.1 to 101)         | 63 (56 to 74.9)           | same               |
| Ratio: read           | 15.9 (12.5 to 362)         | 15.4 (15.3 to 16.1)       | same               |
| Ratio: write          | 2.74 (1.66 to 2.97)        | 2.79 (2.67 to 3.23)       | same               |
| Ratio: getter         | 32.3 (15.2 to 38.7)        | 29.9 (26.4 to 37.2)       | same               |
| Ratio: snapshot       | 6.83 (6.12 to 26)          | 7.58 (7.21 to 7.91)       | same               |

Node 24.21.0, nanoseconds per operation, the same build and conditions:

| Metric                | Unmodified                   | The five warnings            | Against unmodified |
| --------------------- | ---------------------------- | ---------------------------- | ------------------ |
| `store.read`          | 45.5 (45.4 to 47.7)          | 46.1 (45.8 to 48)            | same               |
| `store.write`         | 204 (196 to 214)             | 209 (202 to 214)             | same               |
| `store.write.sync`    | 248 (236 to 258)             | 438 (423 to 469)             | **slower, +190**   |
| `store.write.batched` | 206 (205 to 219)             | 219 (216 to 228)             | slower, +13        |
| `store.write.nested`  | 485 (482 to 507)             | 513 (495 to 520)             | same               |
| `store.method`        | 281 (278 to 291)             | 289 (276 to 294)             | same               |
| `store.batch10`       | 1610 (1598 to 1687)          | 1842 (1775 to 1880)          | **slower, +232**   |
| `array.pushPop`       | 3361 (3110 to 3494)          | 3745 (3173 to 3850)          | same               |
| `create.small`        | 5772 (5034 to 5875)          | 5691 (5249 to 5818)          | same               |
| `create.rows`         | 1223998 (1068448 to 1436019) | 1085197 (1007682 to 1605742) | same               |
| `snapshot.cached`     | 31.3 (28.2 to 31.8)          | 32 (31.5 to 34.6)            | same               |
| `getter.cached`       | 78.8 (77.9 to 81.3)          | 81 (78.9 to 83.8)            | same               |
| Ratio: read           | 2.03 (1.96 to 2.08)          | 2.03 (2.01 to 2.08)          | same               |
| Ratio: write          | 1.34 (1.32 to 1.4)           | 1.33 (1.12 to 1.38)          | same               |
| Ratio: getter         | 3.49 (3.4 to 3.54)           | 3.57 (3.43 to 3.7)           | same               |
| Ratio: snapshot       | 1.36 (1.23 to 1.42)          | 1.42 (1.38 to 1.51)          | same               |

The two slower rows are the `process.env` read measured in B1, paid
unbundled: `store.write.sync` reads it once per synchronous delivery (S4's
guard), and `store.batch10` once in `batch()` (S5's guard, which puts the read
first) and once for its delivery. 190 and 232 nanoseconds match one and two
reads of 184. No ratio in `limits.json` moves, because none of them has a
synchronous subscriber. In a bundled production build the reads are gone; in
unbundled Node they are paid whatever `NODE_ENV` says, because the read is
the cost. Checked: the same build run with `NODE_ENV=production`, three
runs, gave `store.write.sync` 442 (439 to 458) and `store.batch10` 1,848
(1,836 to 1,912). For stage 4: S5's guard in `batch()` should test
`instanceof Promise` first, which removes one read for a few bytes. S4 has no
cheap test that is usually false: it either pays the read per synchronous
delivery in unbundled code (development and unbundled production on Node, not
Bun), or keeps its counter and the microtask that resets it in every build so
that the read happens only at the hundredth delivery. I would take the
first: unbundled Node with a framework binding is server rendering, where a
synchronous subscriber is rare. Neither variant was measured.

- **No test fails.** A warning changes no behaviour, and S3 throws the same
  `TypeError` class that the engine throws today.
- **What the suite says about noise.** `bun test` sets `NODE_ENV=test`, so
  the suite ran with every warning on: 23 warnings over 1,341 tests
  (`arrow-method` 1, `native-collection` 8, `opaque-instance` 7, `sync-flood`
  1, `write-after-await` 6). Each names a fixture whose purpose is that very
  case (a `Holder` with a native `Map`, a `Task` without the marker, an
  `asyncIncrement()` method); I read the names, not every test. The examples
  and the docs site were not run with the warnings on.
- **Production bytes come from the cheap test before the guard.** S1 keeps
  `typeof desc.value === 'function'` per own key, S4 keeps
  `kind === 'syncListeners' && listeners.length`, S5 keeps a `Map` and an
  `instanceof`. Putting the `process.env` read first would make each 0 bytes
  and cost 184 nanoseconds per call in development on Node. I chose the bytes
  for S1 and S5, which are on creation and method paths, and would choose the
  same for S4 because it sits on every synchronous delivery.
- **S3 shows the helper trap.** With the guard inside `refuseOnSnapshot()`,
  production kept six empty calls: 26 bytes. With the guard at each call
  site: 0.
- **S5 is a heuristic.** It warns for a direct write to a store with a
  synchronous subscriber while one of that store's `async` methods, or any
  `async` `batch()` callback, has not settled. A write from elsewhere in the
  same window is reported too. The text says "was written while ... was
  waiting", not that the method wrote. It attaches `then(done, done)` to the
  method's promise, which handles nothing for the caller: an unhandled
  rejection is still reported as one.
- **S1 and `merged.md` item 20.** Once a stored function is data (T1), an own
  function field is no longer proof of a mistake. S1 looks only at the class
  instances the store indexes, only at their fields at creation, so a
  callback assigned later (`form.onSubmit = fn`) is not reported, which the
  reproduction checks. A class that keeps a callback in a field from its
  constructor gets one warning per instance and field.
- **S1 against `spike-classes.md` C4, which finished after this spike.** C4
  ran fourteen kinds of function field. S1's test, "an own function field at
  creation", is broader than the bare MobX test C4 rejects: it reports all
  fourteen, seven of them fields that lose no write. C4 (b) compares a
  cached snapshot with the raw object's own fields when the snapshot is handed
  out, finds six of the seven lost writes and reports nothing else, and also
  catches a constructor's timer and a write through the raw object (stage 1
  finding 11). It costs a cached snapshot eleven to thirteen times more, which
  in a development build is acceptable. **So `arrow-method` should be C4 (b),
  not S1.** S1's own result that stands: its guard costs 6 bytes in
  production in the inline form, where C4 measured 168 to 309 bytes for an
  always-on check; C4 (b) behind the same inline guard should cost about as
  little, not measured.
- **S2 against `spike-classes.md` C3 (a).** C3 (a) is the better form of
  `opaque-instance`: it looks only where a value enters the store (creation,
  `set`, `defineProperty`), never on a read; it warns once per class, by
  prototype; it skips any object whose tag is not `[object Object]`, frozen
  objects and stores; and `static [PROXYABLE] = false` silences it, which
  is the documented way to say "opaque on purpose". S2's test for a platform
  object, `[native code]` in the constructor's source, is weaker than the tag.
  C3 (a) found it warns for seven kinds of object that are no mistake out of
  27 tried, once per class; that noise is the reason it belongs in
  development only, which C3 also concludes. S2's `native-collection` part is
  not in C3 (a `Map`'s tag is `[object Map]`) and stays as spiked.

## Recommendation

### The split: shape E, the inline `process.env.NODE_ENV` read. Can follow 1.0

- **Why a split at all.** B1 shows that error messages do not need one: a
  code and the names in every build give the same production bytes as either
  split. Warnings do. The five spiked warnings add 848 bytes to the main
  entry when they ship (4,540 against 3,692), and noise in every production
  console. MobX, Solid, Svelte, Vue and the Signals libraries all keep
  warnings out of production; Svelte 11's "cheap enough to need neither" holds
  for its errors, not for warnings.
- **Why E over C** (contradiction 17). Both give the same production bytes,
  and every bundler I ran picks the same build under both, except where a
  developer most needs the diagnostics: plain Node, `bun app.mjs`, `bun test`
  and an unminified esbuild bundle get development under E and production
  under C, silently. C also doubles the published files and has a branch
  that `check:package` does not check. E's cost is a rule for every guard
  (inline, after a cheap test, never inside a helper, never a module
  constant) and a test on the built file that holds it. That rule is the
  thing a stage 4 reviewer has to watch, so it goes into `CONSTRAINTS.md`
  as a floor item.
- **Guard form for stage 4.** `if (<cheap test> && process.env.NODE_ENV !== 'production')`
  at each call site, inside the library source. Whether to add
  `typeof process !== 'undefined' &&` in front: it folds in every bundler I
  ran when inline, and stops a `ReferenceError` in an environment without
  `process`; that environment cannot load the package today (`#store-runtime`).
  Take it; it costs nothing measured.
- **Can follow 1.0**: a warning changes no behaviour, so it can arrive in any
  1.x release. What has to be settled before 1.0 is B2's rule that throws are
  the same in both builds, because a later change to it would be breaking.

### The format: B2 as proposed. The codes before 1.0

`@codebelt/classy-store [code]: facts` in every build, the advice sentence in
development, every code on one documentation page. Codes are stable from 1.0;
the existing three messages get codes at the same time, which rewrites 29
assertions in 15 test files. **Before 1.0**, because error text that tests and
users match on changes once.

### Contradiction 18: the same throws in both builds. Before 1.0

Decided for MobX 7 and Signals Q8 against Immer 4. Consequences: D4's runtime
check is dropped in favour of the `write-after-await` warning (its type
stays, as the delivery report recommends); G5's snapshot cycle check stays in
production; the D1 bound stays in production.

### Contradiction 19: `devtools({enabled})`

`persist-devtools.md` P7 keeps `true` as the default because the library has
no portable way to know it runs in production. If shape E is taken, it has
the same way its warnings use, and every bundler measured in B1 resolves it.
I lean to "on in development, off in production" (Valtio V9): DevTools in a
production page hands the whole state to any extension that asks, and the
user who wants it there writes `enabled: true`. It is a change of a default,
so **before 1.0** if taken. The persist and devtools report weighs the other
side (security 7: keep it and document); the decision document picks.
Reasoning, not measured.

### Diagnostics for 1.0

Take, in the order of what they catch:

1. `delivery-loop`, `getter-cycle` on snapshots, `getter-write` (G7a), with
   their first-wave changes. Always on. Before 1.0 with those changes.
2. `arrow-method` in C4 (b)'s form, `write-after-await`, `native-collection`,
   `opaque-instance` in C3 (a)'s form, `sync-flood`, and the development text
   of `snapshot-mutator`. Development only. Can follow 1.0, but the five as
   spiked cost 31 bytes in production together and are the first answer to
   the two silent failures named in `REVIEW_PLAN.md`; I would ship them with
   1.0.
3. Codes for the existing errors and the adapters' scope errors.

Not for 1.0: the opt-in warnings (they need a switch), the per-call
detection of writes around the proxy, the both-forms warning (M39 removes its
cause), D4's runtime check, and the four tools. On item 21 of "Proposals I
think are wrong" I agree: each tool is new public surface and can follow 1.0.

S1 itself should not go to stage 4: C4 (b) replaces it (B3). Whatever form
is taken, its "once" should be per class or per object as C4 (b) has it, not
per instance and field, or a list of rows turns it into a flood.

### The size budgets

Measured with `rec.py`: the first-wave set in the B2 format, D4's runtime
check replaced by the `write-after-await` warning, and the five warnings.

| Entry                 | Measured, unmodified | Measured, recommended set | Budget today | What the budget would have to become, with the usual 2 to 3 percent |
| --------------------- | -------------------: | ------------------------: | -----------: | ------------------------------------------------------------------- |
| `.`                   |                3,661 |              4,020 (+359) |        3,750 | About 4,125                                                         |
| `./utils` adds        |                2,686 |                     2,701 |        2,750 | Unchanged                                                           |
| `./collections` adds  |                  727 |                       730 |          750 | Unchanged                                                           |
| `./react` adds        |                1,662 |                     1,672 |        1,700 | Unchanged                                                           |
| `./react/server` adds |                  153 |                       150 |          175 | Unchanged                                                           |
| `./vue` adds          |                  280 |                       278 |          300 | Unchanged                                                           |
| `./svelte` adds       |                  182 |                       179 |          200 | Unchanged                                                           |
| `./angular` adds      |                  271 |                       270 |          300 | Unchanged                                                           |
| `./solid` adds        |                  312 |                       310 |          335 | Unchanged                                                           |

Tests on the recommended set: 1,260 pass, 81 fail; typecheck passes. 55 of
the 81 are the first-wave set's own failures (its 57, less the two D4 tests,
since D4's check is gone). The other 26 are **incidental**: tests that match
today's message text with a regular expression, such as `toThrow(/not a
store proxy/)`, `/circular computed getter dependency/` and
`/circular reference/`, in the core, snapshot and every adapter's test file.
They are the rewrite B2 announces; judged by their names and assertions, none is a regression. The full list is in
`<scratch>/stage-3-devbuild/repro/rec-fails.txt`, not copied here.

Of the 359 bytes: the first-wave checks in the B2 format, about 330 (D1's
queue and bound, T3 (b), G7b with G7a, G5, without D4's check); the five
warnings, 31. With T3 (a) in place of T3 (b), as the traps report
recommends, the number is lower; not measured in this combination.

The `./utils` row holds only because this set has none of the persist and
devtools changes. With them, `persist-devtools.md` measures 3,396 bytes added
and proposes a budget of 3,500; the B2 format takes 56 bytes off that (P2 and
P3 above).

These numbers hold only for the first-wave items in the set above. The
decision document sets the budget once, for the whole set it approves; the
change this report adds to that set is 31 bytes for the five warnings, and
271 bytes taken off the first wave's messages.

### Cost for stage 4

- **Files.** `src/core/diagnostics.ts` (new, about 30 lines), `core.ts`
  (about 120 lines for the five warnings), `collections.ts` (17), the
  message sites of `core.ts`, `snapshot.ts` and the three adapters, a new
  documentation page, and the API reference.
- **Tests to write.** One per warning that it fires once, with the code, and
  stays silent in the counter-case of each reproduction; one per error that
  the production text carries the code and the facts; one test on the built
  file: bundle it with `bun build --production` and assert that no advice
  text and no `console.warn` call is left. `bun test` sets `NODE_ENV=test`,
  so the suite runs the development branch; the production text is the other
  arm of a ternary on the same line, which line coverage counts as covered
  untested. A few tests that set `process.env.NODE_ENV = 'production'` for
  their duration test that arm; the inline read sees the change at once.
- **`CONSTRAINTS.md`.** The main-entry budget moves (above). A floor item:
  "a development guard is an inline `process.env.NODE_ENV` read at its call
  site", held by the test on the built file. Coverage stays at 100%: the
  development lines are what the suite runs.
- **Risk.** Low for the warnings: none changes behaviour, and no test fails.
  Medium for the codes: every test that matches an error's text changes.

## Verified and not verified

**Run and measured:**

- Every size in this report, with the size script's own bundler settings
  (Bun 1.4.5, minified, `NODE_ENV` defined as production, gzip level 9), and
  the "development branch kept" sizes with `NODE_ENV` defined as an unknown
  global. `bun run size` for the unmodified worktree, shape C, each B3 spike,
  the B3 combination and the recommended set.
- The first-wave set: 1,284 pass and 57 fail, the failures of its five
  patches alone. The recommended set: 1,260 pass and 81 fail, the extra 26
  all matching old message text. Each B3 spike and the B3 combination: 1,341 pass, typecheck
  passes.
- Which build each toolchain loads, for shape E and shape C, by running the
  bundle or the server and reading the error it threw (the table in B1);
  which bundlers remove each guard form; the cost of a `process.env` read.
- `bun run check:package` for shape C.
- `persist-devtools.md`'s `p2.patch` and `p3.patch` together, and in the B2
  format: `./utils` sizes only, no tests run on them.
- The reproductions of B3, before and after.
- `benchmark:core` on Bun and on Node for the B3 combination against the
  unmodified build, on a heavily loaded machine.

**Read, not run:**

- That a browser cannot resolve `#store-runtime` without an import map: from
  `dist/index.mjs` and the rule for bare specifiers. What esm.sh and
  jsDelivr's `+esm` do with conditions.
- Vitest, Deno, Rspack, Parcel and `tsx`: not installed or not tried.
- The examples and the docs site with the warnings on: not run, so the noise
  outside the test suite is unknown.
- The browser, framework and mutation suites: not run, as the common brief
  says.

**Reasoning only:**

- That the codes should be fixed before 1.0 because tests and users match on
  error text.
- The `devtools({enabled})` lean under contradiction 19.
- That `opaque-instance` is worth its noise for third-party class instances
  with own fields; the suite's fixtures are all deliberate.
- The budget of about 4,125 bytes is the measured 4,020 plus the usual
  margin; the decision document's set will differ.

## Not done

- **The development tree's own size under shape C** was not measured for the
  B3 warnings, only for the first-wave messages (4,384 bytes). It does not
  enter a budget.
- **T3 (a) in the recommended set** in place of T3 (b). The traps report
  recommends (a); the set here uses (b) because the brief asked for the
  messages of (b) and (c) to be measured. (b) and (c) were also measured
  alone (B1).
- **`array-named-property`**, the per-call detection of writes around the
  proxy and the opt-in warnings were listed and not built.
- **The `persist` and `devtools` diagnostics** are listed only; the persist
  and devtools report owns them.

## Appendix: patches and scripts

Paths are written with the placeholders. Every script ran from the folder named in it. The first-wave patches were extracted from the appendices of `spike-delivery.md` (`d1.patch`, `d4-runtime-after.patch`), `spike-traps.md` (`t3b.patch`) and `spike-getters.md` (`G7b: a write in a getter throws on both layers`, `G5: the snapshot layer`), restoring the single space of each blank context line, and applied in that order with `git apply --3way`. `G5` then conflicts in one hunk of `snapshot.ts`; the resolution takes `G5`'s side and passes `key` to `computeWithTracking(currentSnap, key, getterFn)`, as `G7b` needs. The files were then copied aside as the input of `variant.py`.

### `variant.py`: the eleven message sites in each form (B1, B2)

```python
# usage: variant.py MODE VN_DIR SRC_DIR
# MODE: full | code | codeonly | env | env2 (env, plus D4 and G5 checks dev-only) | env3 (env, plus D4 check dev-only)
#       codeonly = code mode with no detail (bare code)
import sys, os
ONLY = os.environ.get('ONLY')
def on(n): return ONLY is None or str(n) in ONLY.split(',')
mode, vn, src = sys.argv[1:4]
core = open(f'{vn}/core.ts').read()
snap = open(f'{vn}/snapshot.ts').read()
DEV = "process.env.NODE_ENV !== 'production'"
bare = mode == 'codeonly'
if mode == 'codeonly': mode = 'code'
env3 = mode == 'env3'
if env3: mode = 'env2_d4only'

def msg(code, detail, advice):
    """Return a JS expression for the message text."""
    d = '' if bare or detail is None else detail
    head = f'@codebelt/classy-store [{code}]'
    prod = f'`{head}' + (f': {d}' if d else '') + '`'
    if mode == 'code':
        return prod
    devtxt = f'`{head}: ' + (f'{detail}. ' if detail else '') + f'{advice}`'
    return f'({DEV} ? {devtxt} : {prod})'

def rep(s, old, new):
    if not on(SITE): return s
    assert s.count(old) == 1, old[:80]
    return s.replace(old, new)

if mode != 'full':
    # 1. live getter cycle (existing)
    SITE = 1
    core = rep(core, "`@codebelt/classy-store: circular computed getter dependency: ${cycle}`",
        msg('getter-cycle', '${cycle}', 'These getters read each other'))
    # 2. not a store (existing)
    SITE = 2
    core = rep(core, "'@codebelt/classy-store: object is not a store proxy'",
        msg('not-a-store', None, 'Pass the object that createClassyStore() returned'))
    # 3. snapshot circular reference (existing)
    SITE = 3
    snap = rep(snap, "'@codebelt/classy-store: circular reference detected in snapshot'",
        msg('snapshot-cycle', None, 'The store holds itself; a snapshot cannot hold a cycle'))
    # 4. D1 bound
    SITE = 4
    core = rep(core, "`@codebelt/classy-store: delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called`",
        msg('delivery-loop', None, 'Delivery stopped after ${maxRounds} rounds, because a subscriber of ${names} writes to the store every time it is called'))
    if mode != 'full':
        # names are only used by the dev text; compute them inside it
        core = rep(core, """      const names = Array.from(
        pending,
        (node) => node.target.constructor?.name || 'Object',
      );
""", "")
        if on(4): core = core.replace('a subscriber of ${names} writes', "a subscriber of ${Array.from(pending, (node) => node.target.constructor?.name || 'Object')} writes")
        # pending.clear() must run after the message is built
        core = rep(core, """      pending.clear();
      console.error(
        new Error(""", """      console.error(
        new Error(""")
        core = rep(core, """        ),
      );
      return;
    }""", """        ),
      );
      pending.clear();
      return;
    }""")
    # 5. D4
    SITE = 5
    core = rep(core, "'@codebelt/classy-store: batch() was given a function that returned a promise; it groups only writes made before the function returns'",
        msg('batch-async', None, 'batch() was given a function that returned a promise; it groups only writes made before the function returns'))
    if mode in ('env2', 'env2_d4only'):
        core = rep(core, "if (result instanceof Promise) {", f"if ({DEV} && result instanceof Promise) {{")
    # 6-8. T3b
    SITE = 6
    core = rep(core, '`@codebelt/classy-store: cannot define the accessor "${String(prop)}" on a store. Define it on the class, or on the object before createClassyStore()`',
        msg('define-accessor', '${String(prop)}', 'A store cannot take an accessor. Define it on the class, or on the object before createClassyStore()'))
    core = rep(core, '`@codebelt/classy-store: cannot define "${String(prop)}" on a store as read-only. Pass writable: true, or assign a frozen value`',
        msg('define-readonly', '${String(prop)}', 'A store cannot take a read-only value. Pass writable: true, or assign a frozen value'))
    core = rep(core, "'@codebelt/classy-store: the prototype of a store cannot be changed'",
        msg('set-prototype', None, 'The prototype of a store cannot be changed'))
    # 9. G7b
    SITE = 9
    core = rep(core, '`@codebelt/classy-store: getter "${String(tracker.prop)}" wrote "${String(prop)}". A getter must not write.`',
        msg('getter-write', '${String(tracker.prop)} ${String(prop)}', 'A getter must not write; move the write into a method'))
    # 10. G7a
    SITE = 10
    snap = rep(snap, '`@codebelt/classy-store: getter "${String(key)}" wrote "${String(prop)}" on a snapshot. A getter must not write.`',
        msg('getter-write', '${String(key)} ${String(prop)}', 'A getter must not write; move the write into a method'))
    # 11. G5
    SITE = 11
    snap = rep(snap, "`@codebelt/classy-store: circular computed getter dependency: ${cycle}`",
        msg('getter-cycle', '${cycle}', 'These getters read each other'))
    if mode == 'env2':
        snap = rep(snap, "  if (start !== -1) {", f"  if ({DEV} && start !== -1) {{")

open(f'{src}/core/core.ts','w').write(core)
open(f'{src}/snapshot/snapshot.ts','w').write(snap)
```

### `run-variant.sh` and `measure.ts`: build one form and measure the main entry

```bash
#!/bin/zsh
# usage: run-variant.sh MODE   (MODE as variant.py, or 'base' for unmodified)
D=<scratch>/stage-3-devbuild
cd $D/wt/packages/classy-store
if [ "$1" = base ]; then git checkout -- src/core/core.ts src/snapshot/snapshot.ts; else python3 -I $D/scripts/variant.py $1 $D/vn src; fi
bun run build >/dev/null 2>&1 || { echo build failed; exit 1; }
for f in "" --keep; do echo -n "$1 "; bun $D/scripts/measure.ts dist/index.mjs $f; done
```

```ts
// usage: bun measure.ts <entry.mjs> [--no-define] [--conditions=a,b]
const [file, ...flags] = process.argv.slice(2);
const noDefine = flags.includes('--no-define');
const keep = flags.includes('--keep');
const cond = flags.find((f) => f.startsWith('--conditions='))?.split('=')[1];
const build = await Bun.build({
  entrypoints: [file],
  target: 'browser',
  format: 'esm',
  minify: true,
  ...(noDefine
    ? {}
    : {
        define: {
          'process.env.NODE_ENV': keep ? 'globalThis.__ENV' : '"production"',
        },
      }),
  ...(cond ? {conditions: cond.split(',')} : {}),
});
if (!build.success) throw new Error(build.logs.join('\n'));
const bytes = new Uint8Array(await build.outputs[0].arrayBuffer());
const text = new TextDecoder().decode(bytes);
console.log(
  JSON.stringify({
    kind: keep ? 'unreplaced' : noDefine ? 'bun-default' : 'production',
    gzip: Bun.gzipSync(bytes, {level: 9}).length,
    min: bytes.length,
    nodeEnv: (text.match(/NODE_ENV/g) || []).length,
    devText: text.includes('must not write;'),
  }),
);
```

### `c-conditions.patch`: shape C, against the worktree with `variant.py env` applied

```diff
diff --git a/packages/classy-store/package.json b/packages/classy-store/package.json
index a89484d..a9800af 100644
--- a/packages/classy-store/package.json
+++ b/packages/classy-store/package.json
@@ -20,6 +20,16 @@
   },
   "exports": {
     ".": {
+      "development": {
+        "import": {
+          "types": "./dist/index.d.mts",
+          "default": "./dist/development/index.mjs"
+        },
+        "require": {
+          "types": "./dist/index.d.cts",
+          "default": "./dist/development/index.cjs"
+        }
+      },
       "import": {
         "types": "./dist/index.d.mts",
         "default": "./dist/index.mjs"
@@ -30,6 +40,16 @@
       }
     },
     "./utils": {
+      "development": {
+        "import": {
+          "types": "./dist/utils/index.d.mts",
+          "default": "./dist/development/utils/index.mjs"
+        },
+        "require": {
+          "types": "./dist/utils/index.d.cts",
+          "default": "./dist/development/utils/index.cjs"
+        }
+      },
       "import": {
         "types": "./dist/utils/index.d.mts",
         "default": "./dist/utils/index.mjs"
@@ -40,6 +60,16 @@
       }
     },
     "./collections": {
+      "development": {
+        "import": {
+          "types": "./dist/collections/index.d.mts",
+          "default": "./dist/development/collections/index.mjs"
+        },
+        "require": {
+          "types": "./dist/collections/index.d.cts",
+          "default": "./dist/development/collections/index.cjs"
+        }
+      },
       "import": {
         "types": "./dist/collections/index.d.mts",
         "default": "./dist/collections/index.mjs"
@@ -50,6 +80,16 @@
       }
     },
     "./react": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/react/react.d.mts",
+          "default": "./dist/development/frameworks/react/react.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/react/react.d.cts",
+          "default": "./dist/development/frameworks/react/react.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/react/react.d.mts",
         "default": "./dist/frameworks/react/react.mjs"
@@ -60,6 +100,16 @@
       }
     },
     "./react/server": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/react/server.d.mts",
+          "default": "./dist/development/frameworks/react/server.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/react/server.d.cts",
+          "default": "./dist/development/frameworks/react/server.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/react/server.d.mts",
         "default": "./dist/frameworks/react/server.mjs"
@@ -70,6 +120,16 @@
       }
     },
     "./vue": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/vue/vue.d.mts",
+          "default": "./dist/development/frameworks/vue/vue.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/vue/vue.d.cts",
+          "default": "./dist/development/frameworks/vue/vue.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/vue/vue.d.mts",
         "default": "./dist/frameworks/vue/vue.mjs"
@@ -80,6 +140,16 @@
       }
     },
     "./svelte": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/svelte/svelte.d.mts",
+          "default": "./dist/development/frameworks/svelte/svelte.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/svelte/svelte.d.cts",
+          "default": "./dist/development/frameworks/svelte/svelte.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/svelte/svelte.d.mts",
         "default": "./dist/frameworks/svelte/svelte.mjs"
@@ -90,6 +160,16 @@
       }
     },
     "./angular": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/angular/angular.d.mts",
+          "default": "./dist/development/frameworks/angular/angular.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/angular/angular.d.cts",
+          "default": "./dist/development/frameworks/angular/angular.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/angular/angular.d.mts",
         "default": "./dist/frameworks/angular/angular.mjs"
@@ -100,6 +180,16 @@
       }
     },
     "./solid": {
+      "development": {
+        "import": {
+          "types": "./dist/frameworks/solid/solid.d.mts",
+          "default": "./dist/development/frameworks/solid/solid.mjs"
+        },
+        "require": {
+          "types": "./dist/frameworks/solid/solid.d.cts",
+          "default": "./dist/development/frameworks/solid/solid.cjs"
+        }
+      },
       "import": {
         "types": "./dist/frameworks/solid/solid.d.mts",
         "default": "./dist/frameworks/solid/solid.mjs"
@@ -113,6 +203,11 @@
   },
   "imports": {
     "#store-runtime": {
+      "development": {
+        "module-sync": "./dist/development/storeRuntime.mjs",
+        "node": "./dist/development/storeRuntime.cjs",
+        "default": "./dist/development/storeRuntime.mjs"
+      },
       "module-sync": "./dist/storeRuntime.mjs",
       "node": "./dist/storeRuntime.cjs",
       "default": "./dist/storeRuntime.mjs"
diff --git a/packages/classy-store/tsdown.config.ts b/packages/classy-store/tsdown.config.ts
index f48c12f..0323bdc 100644
--- a/packages/classy-store/tsdown.config.ts
+++ b/packages/classy-store/tsdown.config.ts
@@ -1,6 +1,6 @@
-import {defineConfig} from 'tsdown';
+import {defineConfig, type UserConfig} from 'tsdown';
 
-export default defineConfig({
+const shared = {
   entry: [
     'src/index.ts',
     'src/storeRuntime.ts',
@@ -42,4 +42,17 @@ export default defineConfig({
       'solid-js',
     ],
   },
-});
+} satisfies UserConfig;
+
+// SPIKE B1 (C): one production tree in dist/, one development tree in
+// dist/development/, chosen by the `development` export condition.
+export default defineConfig([
+  {...shared, define: {'process.env.NODE_ENV': '"production"'}},
+  {
+    ...shared,
+    outDir: 'dist/development',
+    dts: false,
+    clean: false,
+    define: {'process.env.NODE_ENV': '"development"'},
+  },
+]);
```

### `b3-combination.patch`: the five B3 spikes on the unmodified worktree. Each spike alone is its hunks marked `SPIKE B3 Sn` plus `diagnostics.ts`

```diff
diff --git a/packages/classy-store/src/collections/collections.ts b/packages/classy-store/src/collections/collections.ts
index 3118393..7f3c36a 100644
--- a/packages/classy-store/src/collections/collections.ts
+++ b/packages/classy-store/src/collections/collections.ts
@@ -32,6 +32,17 @@ function indexOfMember(
   return -1;
 }
 
+/**
+ * SPIKE B3 S3: a snapshot of a collection keeps its methods, and a mutator on
+ * it fails on a frozen array. Name the mistake instead.
+ */
+function refuseOnSnapshot(collection: object, method: string): void {
+  if (Object.isFrozen(collection))
+    throw new TypeError(
+      `@codebelt/classy-store [snapshot-mutator]: ${method}() was called on a snapshot, which is frozen. Call it on the store`,
+    );
+}
+
 // ── ReactiveMap ───────────────────────────────────────────────────────────────
 
 /**
@@ -90,6 +101,7 @@ export class ReactiveMap<K, V> {
 
   /** Sets `key` to `value`. Keeps the existing key and position if present, appends otherwise. */
   set(key: K, value: V): this {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'set');
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index !== -1) {
@@ -102,6 +114,7 @@ export class ReactiveMap<K, V> {
 
   /** Removes the entry for `key`. Returns `true` if found. */
   delete(key: K): boolean {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'delete');
     const entries = this._entries;
     const index = indexOfMember(entries, key, true);
     if (index === -1) return false;
@@ -111,6 +124,7 @@ export class ReactiveMap<K, V> {
 
   /** Removes all entries. Uses splice to trigger proxy notification. */
   clear(): void {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'clear');
     this._entries.splice(0, this._entries.length);
   }
 
@@ -234,6 +248,7 @@ export class ReactiveSet<T> {
 
   /** Adds `value` if not already present (no-op for duplicates). */
   add(value: T): this {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'add');
     if (!this.has(value)) {
       this._items.push(value);
     }
@@ -242,6 +257,7 @@ export class ReactiveSet<T> {
 
   /** Removes `value`. Returns `true` if found. */
   delete(value: T): boolean {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'delete');
     const items = this._items;
     const index = indexOfMember(items, value, false);
     if (index === -1) return false;
@@ -251,6 +267,7 @@ export class ReactiveSet<T> {
 
   /** Removes all items. Uses splice to trigger proxy notification. */
   clear(): void {
+    if (process.env.NODE_ENV !== 'production') refuseOnSnapshot(this, 'clear');
     this._items.splice(0, this._items.length);
   }
 
diff --git a/packages/classy-store/src/core/core.ts b/packages/classy-store/src/core/core.ts
index 252b9f1..46f707a 100644
--- a/packages/classy-store/src/core/core.ts
+++ b/packages/classy-store/src/core/core.ts
@@ -3,8 +3,10 @@ import {
   canProxy,
   findPropertyDescriptor,
   getArrayIndex,
+  isPlainObject,
 } from '../utils/internal/internal';
 import type {DepEntry} from './core.types';
+import {nameOf, warnOnce} from './diagnostics';
 import {StoreInternal} from './ownership';
 
 // ── Global state ──────────────────────────────────────────────────────────────
@@ -229,6 +231,8 @@ function notifyMutation(internal: StoreInternal): void {
       if (node.syncListeners.size) pendingSync.add(node);
     }
   } else {
+    if (runningAsync.size && process.env.NODE_ENV !== 'production')
+      reportWriteAfterAwait(owners);
     deliver(owners, 'syncListeners');
   }
   for (const node of owners) {
@@ -269,13 +273,47 @@ function transactional(
     if (new.target) return Reflect.construct(method, args);
     transactionDepth++;
     try {
-      return Reflect.apply(method, receiver, args);
+      const result = Reflect.apply(method, receiver, args);
+      if (result instanceof Promise && process.env.NODE_ENV !== 'production')
+        trackAsync(result, internalsMap.get(receiver), `${method.name}()`);
+      return result;
     } finally {
       settleTransaction();
     }
   };
 }
 
+/**
+ * SPIKE B3 S5: the async store methods and `batch()` callbacks still running.
+ * A write made outside a transaction meanwhile is likely one made after an
+ * `await`, which notifies on its own. `undefined` stands for `batch()`.
+ */
+const runningAsync = new Map<StoreInternal | undefined, string>();
+
+function trackAsync(
+  result: Promise<unknown>,
+  node: StoreInternal | undefined,
+  name: string,
+): void {
+  runningAsync.set(node, name);
+  const done = () => runningAsync.delete(node);
+  result.then(done, done);
+}
+
+function reportWriteAfterAwait(owners: Set<StoreInternal>): void {
+  for (const node of owners) {
+    if (!node.syncListeners.size) continue;
+    const name = runningAsync.get(node) ?? runningAsync.get(undefined);
+    if (name)
+      warnOnce(
+        node.target,
+        'write-after-await',
+        name,
+        `${nameOf(node.target)} was written while ${name} was waiting on an await. A write after an await is outside the transaction, so each one notifies on its own. Group those writes with batch()`,
+      );
+  }
+}
+
 /**
  * Run several writes as one transaction. Use it for a loop or a group of direct
  * writes made outside a store method: synchronous subscribers, which includes
@@ -299,7 +337,10 @@ function transactional(
 export function batch<T>(run: () => T): T {
   transactionDepth++;
   try {
-    return run();
+    const result = run();
+    if (process.env.NODE_ENV !== 'production' && result instanceof Promise)
+      trackAsync(result, undefined, 'batch()');
+    return result;
   } finally {
     settleTransaction();
   }
@@ -311,6 +352,24 @@ function flushNotifications(): void {
   deliver(owners, 'batchedListeners');
 }
 
+/** SPIKE B3 S4: synchronous deliveries in the current task. */
+let syncDeliveries = 0;
+let floodReported = false;
+
+/** SPIKE B3 S4: one framework binding takes a snapshot per sync delivery. */
+function countSyncDelivery(): void {
+  if (!syncDeliveries++)
+    queueMicrotask(() => {
+      syncDeliveries = 0;
+    });
+  if (syncDeliveries === 100 && !floodReported) {
+    floodReported = true;
+    console.warn(
+      '@codebelt/classy-store [sync-flood]: 100 synchronous notifications in one task. Each makes every framework binding take a snapshot. Make the writes in a store method or inside batch()',
+    );
+  }
+}
+
 function deliver(
   owners: Set<StoreInternal>,
   kind: 'syncListeners' | 'batchedListeners',
@@ -318,6 +377,12 @@ function deliver(
   // Copy first: a listener may subscribe or unsubscribe during delivery.
   const listeners: (() => void)[] = [];
   for (const node of owners) listeners.push(...node[kind]);
+  if (
+    kind === 'syncListeners' &&
+    listeners.length &&
+    process.env.NODE_ENV !== 'production'
+  )
+    countSyncDelivery();
   for (const listener of listeners) {
     try {
       listener();
@@ -365,7 +430,13 @@ function linkChild(
   if (!existing) {
     // An immutable value is held by reference, like a `Date`. Opaque types are
     // ruled out first: they are read far more often than they are frozen.
-    if (!canProxy(value) || isImmutableValue(value)) return;
+    if (!canProxy(value)) {
+      // SPIKE B3 S2: a mutable object the store cannot see into. Its own
+      // writes, or a Map's set() and a Set's add(), notify no one.
+      if (process.env.NODE_ENV !== 'production') warnOpaque(owner, key, value);
+      return;
+    }
+    if (isImmutableValue(value)) return;
     if (
       isReadOnly(
         descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
@@ -378,6 +449,41 @@ function linkChild(
   return child;
 }
 
+/** SPIKE B3 S2: each opaque value is examined once, not on every read. */
+const examinedOpaque = new WeakSet<object>();
+
+/** SPIKE B3 S2: warn about a native collection or an unmarked class instance. */
+function warnOpaque(owner: StoreInternal, key: string | symbol, value: object) {
+  if (examinedOpaque.has(value)) return;
+  examinedOpaque.add(value);
+  const at = `${nameOf(owner.target)}.${String(key)}`;
+  if (value instanceof Map || value instanceof Set) {
+    if (!Object.isFrozen(value))
+      warnOnce(
+        owner.target,
+        'native-collection',
+        String(key),
+        `${at} holds a native ${nameOf(value)}; its changes notify no one. Use reactiveMap() or reactiveSet()`,
+      );
+    return;
+  }
+  const ctor = Object.getPrototypeOf(value)?.constructor;
+  // Platform objects (Date, RegExp, typed arrays, URL ...) are values. A class
+  // of the user's with own data fields is state the store does not watch.
+  if (
+    typeof ctor === 'function' &&
+    !/\[native code\]/.test(Function.prototype.toString.call(ctor)) &&
+    Object.keys(value).length &&
+    !Object.isFrozen(value)
+  )
+    warnOnce(
+      owner.target,
+      'opaque-instance',
+      String(key),
+      `${at} holds a ${nameOf(value)} instance, which the store does not track: writes inside it notify no one. Add static [PROXYABLE] = true to the class, or replace the value to update it`,
+    );
+}
+
 /** Native array length writes remove indices without invoking DELETE traps. */
 function detachTruncatedChildren(
   internal: StoreInternal,
@@ -538,6 +644,20 @@ function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
         const desc = Object.getOwnPropertyDescriptor(owner.target, key);
         if (desc && 'value' in desc)
           linkChild(owner, key, desc.value, nodes, desc);
+        // SPIKE B3 S1: an own function field of a class instance is almost
+        // always an arrow-function method, whose writes skip the proxy.
+        if (
+          typeof desc?.value === 'function' &&
+          process.env.NODE_ENV !== 'production' &&
+          !isPlainObject(owner.target) &&
+          !Array.isArray(owner.target)
+        )
+          warnOnce(
+            owner.target,
+            'arrow-method',
+            String(key),
+            `${nameOf(owner.target)}.${String(key)} is a function in an own field, so the writes it makes skip the store and notify no one. Declare it as a method: ${String(key)}() {}`,
+          );
       }
     }
   }
diff --git a/packages/classy-store/src/core/diagnostics.ts b/packages/classy-store/src/core/diagnostics.ts
new file mode 100644
index 0000000..4865c04
--- /dev/null
+++ b/packages/classy-store/src/core/diagnostics.ts
@@ -0,0 +1,28 @@
+/**
+ * SPIKE B3: development diagnostics. Each call site reads
+ * `process.env.NODE_ENV !== 'production'` inline, after a test that is cheap
+ * and almost always false: a module constant is kept in production by Bun and
+ * esbuild, and an unbundled read costs 184 ns on Node (devbuild.md, B1).
+ */
+
+const warned = new WeakMap<object, Set<string>>();
+
+/** Warn once per object, code and key, with the stable code in brackets. */
+export function warnOnce(
+  target: object,
+  code: string,
+  key: string,
+  text: string,
+): void {
+  let seen = warned.get(target);
+  if (!seen) warned.set(target, (seen = new Set()));
+  const id = `${code} ${key}`;
+  if (seen.has(id)) return;
+  seen.add(id);
+  console.warn(`@codebelt/classy-store [${code}]: ${text}`);
+}
+
+/** The name of an object's class, for a message. */
+export function nameOf(value: object): string {
+  return Object.getPrototypeOf(value)?.constructor?.name || 'Object';
+}
```

### `s3.py`: the two forms of S3 (`always` and `dev`). The `dev` form measured in the table moves the guard to each call site, as `b3-combination.patch` has it

```python
# usage: s3.py always|dev SRC
import sys
mode, src = sys.argv[1:3]
p=f'{src}/collections/collections.ts'; s=open(p).read()
cond = "Object.isFrozen(collection)" if mode == 'always' else "process.env.NODE_ENV !== 'production' && Object.isFrozen(collection)"
helper = f'''
/**
 * SPIKE B3 S3: a snapshot of a collection keeps its methods, and a mutator on
 * it fails on a frozen array. Name the mistake instead.
 */
function refuseOnSnapshot(collection: object, method: string): void {{
  if ({cond})
    throw new TypeError(
      `@codebelt/classy-store [snapshot-mutator]: ${{method}}() was called on a snapshot, which is frozen. Call it on the store`,
    );
}}

// ── ReactiveMap'''
s=s.replace("\n// ── ReactiveMap", helper, 1)
for sig, name in [("  set(key: K, value: V): this {\n","set"),("  delete(key: K): boolean {\n","delete"),("  add(value: T): this {\n","add"),("  delete(value: T): boolean {\n","delete")]:
    assert s.count(sig)==1, sig
    s=s.replace(sig, sig+f"    refuseOnSnapshot(this, '{name}');\n")
assert s.count("  clear(): void {\n")==2
s=s.replace("  clear(): void {\n","  clear(): void {\n    refuseOnSnapshot(this, 'clear');\n")
open(p,'w').write(s)
```

### `rec.py`: the recommended set, on top of `variant.py env`; the B3 parts are read from the core file of the combination

```python
# Builds the recommended combination on top of `variant.py env`: D4's throw is
# replaced by the S5 warning, and the five B3 warnings are added.
import re, sys
src = sys.argv[1]; b3 = sys.argv[2]  # b3 = path of core.ts from the B3 combination
p=f'{src}/core/core.ts'; s=open(p).read(); c=open(b3).read()
def rep(old,new):
    global s
    assert s.count(old)==1, old[:70]; s=s.replace(old,new)
def grab(start, end):
    i=c.index(start); j=c.index(end,i); return c[i:j]
rep("""  getArrayIndex,
} from '../utils/internal/internal';
import type {DepEntry} from './core.types';
""","""  getArrayIndex,
  isPlainObject,
} from '../utils/internal/internal';
import type {DepEntry} from './core.types';
import {nameOf, warnOnce} from './diagnostics';
""")
# D4 out, S5 in
i=s.index("    const result = run();\n    // The transaction ends here"); j=s.index("    return result;\n",i)
s=s[:i]+"""    const result = run();
    if (process.env.NODE_ENV !== 'production' && result instanceof Promise)
      trackAsync(result, undefined, 'batch()');
"""+s[j:]
rep("""    transactionDepth++;
    try {
      return Reflect.apply(method, receiver, args);
    } finally {
      settleTransaction();
    }
  };
}
""", grab("    transactionDepth++;\n    try {\n      const result = Reflect.apply", "/**\n * Run several writes"))
rep("""  if (!transactionDepth) flushSync();
}""","""  if (!transactionDepth) {
    if (runningAsync.size && process.env.NODE_ENV !== 'production')
      reportWriteAfterAwait(internal.ancestors());
    flushSync();
  }
}""")
# S4 in drain
rep("""    const listeners: (() => void)[] = [];
    for (const node of pending) listeners.push(...node[kind]);
""","""    const listeners: (() => void)[] = [];
    for (const node of pending) listeners.push(...node[kind]);
    if (
      kind === 'syncListeners' &&
      listeners.length &&
      process.env.NODE_ENV !== 'production'
    )
      countSyncDelivery();
""")
rep("const maxRounds = 100;\n", "const maxRounds = 100;\n\n"+grab("/** SPIKE B3 S4: synchronous deliveries", "function deliver("))
# S2 and S1
rep("""    if (!canProxy(value) || isImmutableValue(value)) return;
""", grab("    if (!canProxy(value)) {\n", "    if (\n      isReadOnly("))
rep("/** Native array length writes remove indices without invoking DELETE traps. */", grab("/** SPIKE B3 S2: each opaque", "/** Native array length writes")+"/** Native array length writes remove indices without invoking DELETE traps. */")
rep("""        if (desc && 'value' in desc)
          linkChild(owner, key, desc.value, nodes, desc);
""", grab("        if (desc && 'value' in desc)\n          linkChild(owner, key, desc.value, nodes, desc);\n", "      }\n    }\n  }\n  return internal;"))
open(p,'w').write(s)
```

### `t3-codes.py`: T3 (b) and (c) in the B2 format

```python
# usage: t3-codes.py FILE — T3 (b) or (c) messages to the B2 production form
import sys
p=sys.argv[1]; s=open(p).read()
for old,new in [
 ('`@codebelt/classy-store: cannot define the accessor "${String(prop)}" on a store. Define it on the class, or on the object before createClassyStore()`','`@codebelt/classy-store [define-accessor]: ${String(prop)}`'),
 ('`@codebelt/classy-store: cannot define "${String(prop)}" on a store as read-only. Pass writable: true, or assign a frozen value`','`@codebelt/classy-store [define-readonly]: ${String(prop)}`'),
 ("'@codebelt/classy-store: a store cannot be frozen, sealed or made non-extensible. Assign a frozen value instead'","'@codebelt/classy-store [freeze-store]'"),
 ("'@codebelt/classy-store: the prototype of a store cannot be changed'","'@codebelt/classy-store [set-prototype]'")]:
    s=s.replace(old,new)
open(p,'w').write(s)
```

### `persist-codes.py`: P2 and P3 in the B2 format

```python
# usage: persist-codes.py MODE IN OUT ; MODE code | env
import sys
mode, src, out = sys.argv[1:4]
s=open(src).read()
DEV="process.env.NODE_ENV !== 'production'"
def m(code, facts, advice):
    prod=f'`@codebelt/classy-store [{code}]: {facts}`'
    if mode=='code': return prod
    return f'({DEV} ? `@codebelt/classy-store [{code}]: {facts}. {advice}` : {prod})'
def rep(o,n):
    global s; assert s.count(o)==1,o; s=s.replace(o,n)
rep('`persist(): cannot persist "${String(key)}"`', m('persist-option','${String(key)}','persist() cannot save a prototype key, an accessor, a method, or a transform without both serialize and deserialize'))
rep('`persist(): the stored record ${why}`', m('persist-record','${why}','The stored record could not be used and was not restored'))
for long, short in [("'is not {version, state}'","'shape'"),("'has an expiresAt that is not a number'","'expiresAt'"),("'has a version that is not an integer'","'version'"),("'was not migrated: migrate must return a plain object'","'migrate'")]:
    rep(f"unreadable({long})", f"unreadable({short})")
open(out,'w').write(s)
```

### `b3.ts`: the reproductions of B3

```ts
// Reproductions for the five B3 spikes. Run: bun <this file> <path to packages/classy-store/src>
const src = process.argv[2];
const {createClassyStore, subscribe, snapshot, batch} = await import(
  `${src}/index.ts`
);
const {reactiveMap} = await import(`${src}/collections/index.ts`);
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) =>
  void warnings.push(String(a[0]).slice(0, 150));
const flush = () => new Promise((r) => setTimeout(r, 0));
async function show(label: string, run: () => unknown) {
  warnings.length = 0;
  let out: unknown;
  try {
    out = await run();
  } catch (e) {
    out = `threw ${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  origWarn.call(
    console,
    `${label}\n  -> ${JSON.stringify(out)}\n  warnings: ${warnings.length ? warnings.join(' | ') : 'none'}`,
  );
}

await show('S1 an arrow-function method writes', async () => {
  class Counter {
    count = 0;
    inc = () => {
      this.count++;
    };
  }
  const s = createClassyStore(new Counter());
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  s.inc();
  await flush();
  return {count: s.count, snapshot: snapshot(s).count, calls};
});
await show(
  'S1b a store with a callback field set later (should not warn)',
  async () => {
    class Form {
      onSubmit: (() => void) | null = null;
    }
    const s = createClassyStore(new Form());
    s.onSubmit = () => {};
    return typeof s.onSubmit;
  },
);
await show('S2 a native Map in a store', async () => {
  const s = createClassyStore({tags: new Map<string, number>()});
  let calls = 0;
  subscribe(s, () => calls++);
  s.tags.set('a', 1);
  await flush();
  return {size: s.tags.size, snapshotSize: snapshot(s).tags.size, calls};
});
await show('S2b a class instance without PROXYABLE', async () => {
  class Point {
    x = 0;
  }
  const s = createClassyStore({p: new Point()});
  let calls = 0;
  subscribe(s, () => calls++);
  s.p.x = 5;
  await flush();
  return {x: s.p.x, snapshotX: snapshot(s).p.x, calls};
});
await show('S2c a Date in a store (should not warn)', async () => {
  const s = createClassyStore({at: new Date(0)});
  return snapshot(s).at instanceof Date;
});
await show('S3 a mutator called on a snapshot of a reactiveMap', async () => {
  const s = createClassyStore({m: reactiveMap<string, number>()});
  const snap = snapshot(s);
  (snap.m as unknown as Map<string, number>).set('a', 1);
  return {snapshotSize: snap.m.size, storeSize: s.m.size};
});
await show(
  'S4 2,000 direct writes in one task with a sync subscriber',
  async () => {
    const s = createClassyStore({n: 0});
    let calls = 0;
    subscribe(
      s,
      () => {
        calls++;
        snapshot(s);
      },
      {sync: true},
    );
    for (let i = 0; i < 2000; i++) s.n++;
    return {calls};
  },
);
await show('S5 a method that writes after an await', async () => {
  class Cart {
    items: number[] = [];
    loading = false;
    async load() {
      this.loading = true;
      await Promise.resolve();
      this.items.push(1);
      this.items.push(2);
      this.loading = false;
    }
  }
  const s = createClassyStore(new Cart());
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  await s.load();
  return {syncCalls: calls};
});
await show('S5b batch() given an async function', async () => {
  const s = createClassyStore({a: 0, b: 0});
  let calls = 0;
  subscribe(s, () => calls++, {sync: true});
  await batch(async () => {
    s.a = 1;
    await null;
    s.a = 2;
    s.b = 2;
  });
  return {syncCalls: calls};
});
```

### The consumer of B1: `probe.mjs`, `app.mjs`, `which.test.mjs`, `vite-probe.mjs`

```js
import {snapshot} from '@codebelt/classy-store';
let text = '';
try {
  snapshot({});
} catch (e) {
  text = e.message;
}
export const which = text.includes('Pass the object')
  ? 'development'
  : 'production';
```

```js
import {which} from './probe.mjs';
console.log(`loaded: ${which}`);
```

```js
import {test} from 'bun:test';
import {which} from './probe.mjs';
test('which', () =>
  console.log(`bun test loads: ${which} (NODE_ENV=${process.env.NODE_ENV})`));
```

```js
import {build, createServer} from 'vite';
import {readFileSync, readdirSync} from 'node:fs';
const has = (s) =>
  s.includes('must not write;') ? 'development' : 'production';
const what = process.argv[2];
if (what !== 'dev') {
  const mode = what;
  await build({
    root: process.cwd(),
    mode,
    logLevel: 'silent',
    configFile: false,
    build: {
      outDir: `out/vite-${mode}`,
      rollupOptions: {input: 'app.mjs'},
      minify: false,
    },
  });
  const dir = `out/vite-${mode}/assets`;
  const text = readdirSync(dir)
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('');
  console.log(
    `vite build --mode ${mode} (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}): ${has(text)}`,
  );
} else {
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    configFile: false,
    server: {port: 5199},
  });
  await server.listen();
  const seen = new Set();
  let all = '';
  async function walk(url) {
    if (seen.has(url)) return;
    seen.add(url);
    const t = await (await fetch(url)).text();
    all += t;
    for (const m of t.matchAll(/(?:from|import)\s*"([^"]+)"/g)) {
      const u = new URL(m[1], url).href;
      if (u.startsWith('http://localhost:5199')) await walk(u);
    }
  }
  await walk('http://localhost:5199/app.mjs');
  console.log(
    `vite dev server: ${has(all)}; modules: ${[...seen]
      .map((u) =>
        u.replace(/.*classy-store\/dist\//, 'dist/').replace(/\?.*/, ''),
      )
      .filter((u) => u.startsWith('dist/'))
      .join(', ')}`,
  );
  await server.close();
}
```

### The Next.js app of B1: `app/probe.js`, `app/page.jsx`, `app/layout.jsx`, `next.config.mjs`. `app/client.jsx` renders `which()` in a client component, and imports `lib2` for the folding table

```js
import {snapshot} from '@codebelt/classy-store';
export function which() {
  let text = '';
  try {
    snapshot({});
  } catch (e) {
    text = e.message;
  }
  return text.includes('Pass the object') ? 'development' : 'production';
}
```

```jsx
import {which} from './probe';
import {Client} from './client';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <main>
      <p id="server">server: {which()}</p>
      <Client />
    </main>
  );
}
```

```js
export default {
  turbopack: {root: '<scratch>/stage-3-devbuild'},
  outputFileTracingRoot: '<scratch>/stage-3-devbuild',
};
```

### The folding libraries of B1: `lib/index.mjs` (no import) and `lib2/index.mjs` (with imports; `flag.mjs` is one line, `export const DEV = process.env.NODE_ENV !== 'production';`)

```js
const DEV = process.env.NODE_ENV !== 'production';
const GUARDED =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
export function a(x) {
  if (DEV) console.log('CONST_STRING');
  console.log('ALWAYS_STRING');
  return x + 1;
}
export function b(x) {
  if (GUARDED) console.log('GUARDED_STRING');
  return x + 2;
}
export function c(x) {
  if (process.env.NODE_ENV !== 'production') console.log('INLINE_STRING');
  return x + 3;
}
export function d(x) {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production')
    console.log('INLINE_GUARDED_STRING');
  return x + 4;
}
```

```js
import {createProxy} from 'proxy-compare';
import {DEV as IMPORTED} from './flag.mjs';
const DEV = process.env.NODE_ENV !== 'production';
export function a(o) {
  if (DEV) console.warn('CONST_WITH_IMPORTS');
  console.log('ALWAYS2');
  return createProxy(o);
}
export function b(o) {
  if (IMPORTED) console.warn('IMPORTED_FLAG');
  return o;
}
export function c(o) {
  if (
    typeof o.v === 'function' &&
    process.env.NODE_ENV !== 'production' &&
    !Array.isArray(o)
  )
    console.warn('CHEAP_FIRST');
  return o;
}
export function d(o) {
  if (process.env.NODE_ENV !== 'production') console.warn('INLINE2');
  return o;
}
```

### `envcost.mjs`: the cost of reading `process.env`

```js
const N = 2e6;
let k = 0;
const DEV = process.env.NODE_ENV !== 'production';
for (const [name, f] of [
  ['inline process.env read', () => process.env.NODE_ENV !== 'production'],
  ['module constant', () => DEV],
]) {
  for (let w = 0; w < 3; w++) for (let i = 0; i < N; i++) if (f()) k++;
  const t = performance.now();
  for (let i = 0; i < N; i++) if (f()) k++;
  console.log(
    `${typeof Bun !== 'undefined' ? 'Bun' : 'Node'} ${name}: ${(((performance.now() - t) * 1e6) / N).toFixed(1)} ns`,
  );
}
```

# Check of spec sections 1 to 4 against the decision document

Checked at commit 7a1dec5. Sections 1 to 4 of `review/spec.md` (lines 1 to
1339): the objective, the entry-point table, every signature and numbered
rule of section 3, and section 4 with its 59 rows. 10 findings, 2 unclear
points.

Signatures that the decision document does not change were compared with
`packages/classy-store/src/`. The new types (`Snapshot<T>`,
`ReactiveMapSnapshot`, `ReactiveSetSnapshot`, `batch`'s `Synchronous<T>`,
`ClassyStore`) were compiled in `<scratch>/check-spec-api/` with strict
settings. All compile, and each type assertion holds: tuples with optional,
named and rest elements; a read past the end of a tuple; `readonly
string[]`; no mutators on a collection snapshot; a class method keeping its
signature; `batch` refusing `() => Promise` and `async`; `super(1)` refused.
`<repo>/node_modules/.bin/tsc` does not exist on this branch. The compiler
used was `<repo>/packages/classy-store/node_modules/.bin/tsc` (TypeScript
7.0.2).

## Findings

### 1. Section 1 promises every rule of section 3 until a major release, including rules from decisions labelled "can follow 1.0" and plain build notes

- **Where:** `review/spec.md:32` to `34`. The rules it turns into promises:
  `:164` (rule 25, the shape of a dependency), `:186` and `:190` (rules 32
  and 33, the table per prototype and its 256-key bound), `:456`
  (`equality.ts`), `:552` and `:554` (collections rules 4 and 5, the index),
  `:966` (devtools rule 3, the hook in the core), `:1008` (subscribeKey
  rule 2), `:1055` (React rule 4), `:1098`, `:1131`, `:1148` and `:1182`
  (the `active` flags).
- **It says:** "the public API in section 3 and the behaviour in section 5
  change only in a major release"
- **The decision document says:** "**Can follow 1.0** means it could ship in
  a 1.x release without breaking a consumer" (How to read this, lines 28 to
  31). Decision 12 is labelled "Can follow 1.0" (line 981),
  and so are decisions 20 (line 1200), 31 (line 1650) and the index of
  decision 42 (line 1960). Section 6 of the spec says the opposite of
  section 1: "Everything not covered by a rule of section 5 or by a sentence
  in the reference is unspecified" (line 1495).
- **Kind:** wrong
- **Correction:** Replace lines 32 to 34 with: "For a user, 1.0 means that
  the signatures of section 3 and the behaviour of section 5 change only in
  a major release; what section 6 lists may change in a minor release. A
  rule of section 3 marked _(build)_ says how stage 4 builds a change and
  promises nothing." Then append " _(build)_" to the rules listed under
  **Where**.

### 2. Rule 32 promises what a getter redefined on the class does, which decision 12 makes unspecified

- **Where:** `review/spec.md:186` to `189`
- **It says:** "so a getter redefined on the class runs its new body at its
  next recompute [D12]"
- **The decision document says:** "A prototype is not changed after its
  first read through a store. … it is **unspecified**, with these answers
  for now" (decision 12, lines 941 to 948), and the unspecified list has
  "What a prototype that is changed after its first read through a store
  does" (line 2245). Section 6 of the spec files the redefined-getter test
  under that row (line 1507).
- **Kind:** wrong
- **Correction:** End rule 32 at "A recompute asks the prototype for its
  getter [D12]." and add: "What a getter redefined on the class after its
  first read does is unspecified (section 6)."

### 3. A write to a child object from a getter is stated as a rule, and both decision 10 and the unspecified list make it unspecified

- **Where:** `review/spec.md:184` to `185` (rule 31, "a write to a child
  object") and `:299` to `301` (snapshot rule 16)
- **It says:** "Allowed in a getter: a write to another store, a write to a
  child object, and the construction of a store [D10]" and "A write to a
  child object from a snapshot getter throws in strict code, … and is
  ignored in code that is not strict [D10]"
- **The decision document says:** "A getter that writes to a child object
  still differs between the layers … It is **unspecified**" (decision 10,
  lines 793 to 797), and "What a getter does that writes to another object
  of the same store: a child, a parent or the root. Today's answer is …"
  (unspecified list, lines 2241 to 2244)
- **Kind:** wrong
- **Correction:** Rule 31: "Allowed in a getter, on the store and on a
  snapshot: a write to another store and the construction of a store [D10].
  A write to a child, a parent or the root of the same store is unspecified
  (section 6)." Delete snapshot rule 16, or reword it as "Today's answer,
  unspecified: …".

### 4. Rows of the case table give unspecified behaviour as the 1.0 answer, unmarked

- **Where:** `review/spec.md:1333` (`snapshot(k).bump()` → `2`), `:1337`
  (a read-only definition on the raw object → `throws TypeError`), `:1326`
  (a callback read from a snapshot and called with a `this`)
- **It says:** "the 1.0 column is the rule above" (line 1274). Item 6 at
  line 1248 marks the raw-object case unspecified, but the row does not.
- **The decision document says:** unspecified are "What a function does when
  it is read from a snapshot and called. Today's answers: … an
  arrow-function field of a `ClassyStore` subclass writes the live store
  without a transaction" (lines 2248 to 2251), and "a property made
  read-only on the raw object after the store has handed out its method
  throws on the next read" (lines 2254 to 2257)
- **Kind:** wrong
- **Correction:** Add after line 1276: "A row marked † is unspecified
  (section 6): its 1.0 cell is the answer of the build, not a promise." Mark
  rows 1326, 1333 and 1337 with †.

### 5. "An adapter keeps its own prefix" contradicts the one form of decision 35

- **Where:** `review/spec.md:71` to `72`. Section 7 repeats it at line 1531,
  outside this part.
- **It says:** "An adapter keeps its own prefix, for example
  `@codebelt/classy-store/vue`."
- **The decision document says:** "An error or a logged report from the
  library reads `@codebelt/classy-store [code]: facts`, where … the facts are
  the names the user wrote" (decision 35, lines 1967 to 1969). Decision 39:
  "throws its own error, with the prefix and a code" (line 1868). Today the
  Angular message has no prefix at all (`angular.ts:17`).
- **Kind:** extra
- **Correction:** "An adapter's error has the same prefix and names the
  adapter among its facts, for example `@codebelt/classy-store [no-scope]:
  vue` [D35, D39]."

### 6. `[not-a-store]` is not marked "proposed" in section 3, though the decision document does not name it

- **Where:** `review/spec.md:313`, `:393`, `:1014`, `:1062`, `:1076`,
  `:1103`, `:1133`, `:1154`, `:1187`
- **It says:** "`[not-a-store]`, `Error`, …", with no mark. The same
  section marks `[getter-write]` "(proposed)" at line 197.
- **The decision document says:** it names only `getter-cycle`,
  `delivery-loop`, `batch-async` and `lost-write` (lines 1969, 998, 1084
  and 2001). Section 7 (line 1541) and open point 3 (line 1825) of the spec mark
  `not-a-store` as a proposed name.
- **Kind:** wrong
- **Correction:** Write `` `[not-a-store]` (proposed) `` at the first
  mention in each export's Errors list, as for `getter-write`.

### 7. The 0.11 cell of the `name` row is invented for two of its four cases

- **Where:** `review/spec.md:1334`
- **It says:** "`name` read on the store: base-class arrow, constructor
  arrow, literal, anonymous | needs `ClassyStore`"
- **The decision document says:** it cites `spike-functions-2.md` for this
  row (decision 1, line 268). In that report the row's "Today" cell is empty
  (line 117 of the report). A literal method and an anonymous arrow in an
  object literal need no base class.
- **Kind:** wrong
- **Correction:** Set the 0.11 cell to "not run".

### 8. The "changed" mark of the entry table means less than section 2 says it does

- **Where:** `review/spec.md:40` to `41` against the table at `:45` to `:53`
- **It says:** "**changed** marks what 1.0 changes". In the table it marks
  only `batch`, `Snapshot`, `PersistOptions`, the Vue `useClassyStore` and
  `injectClassyStore`.
- **The decision document says:** 1.0 also changes the behaviour of
  `createClassyStore` (decisions 1, 2, 5 to 10), `snapshot` (43, 44),
  `subscribe` (13, 14), `persist` (19, 21 to 24), `withHistory` (28 to 30),
  `devtools` (27) and the Solid and Angular adapters (37). None of these is
  marked.
- **Kind:** wrong
- **Correction:** "**changed** marks an export whose signature or type 1.0
  changes; section 3 lists behaviour that changes under each export's
  "Changed from 0.11"."

### 9. `rehydrate()` is said to reject for a record it "cannot restore", which is a record with nothing to keep

- **Where:** `review/spec.md:715`
- **It says:** "Rejects, with a `'parse'` report, when it finds a record of
  a newer version or one it cannot migrate, merge or restore [D21]"
- **The decision document says:** a record "the library itself cannot
  restore, because it is nested too deep" has nothing to keep (decision 21,
  line 1218, and decision 23, lines 1355 and 1356), and "The handle writes again
  … after a `rehydrate()` that … finds one with nothing to keep" (lines 1227
  to 1229). Only a record the handle does not write over makes `rehydrate()`
  reject: "A `rehydrate()` that finds such a record again reports and
  rejects" (lines 1226 and 1227). A `deserialize` that throws belongs to the "not
  migrated" kind.
- **Kind:** wrong
- **Correction:** "Rejects, with a `'parse'` report, when it finds a record
  of a newer version, or one whose `migrate`, `merge` or `deserialize`
  failed [D21]"

### 10. Statements cited to a decision that does not carry them

- **Where and what:**
  - `review/spec.md:142`: "after it is put back [D3]". Decision 3 (line
    379) says "in the next snapshot" and does not say "after it is put
    back".
  - `:234`: "`super(args)` is a type error [D11]". This is in
    `spike-classes-2.md`, line 417, not in decision 11.
  - `:423` to `425`: "when it returns or throws" and "Reads inside see every
    write made so far [G2]". Guarantee 2 (lines 2167 to 2172) says neither.
    Both hold today (`core.ts:299` to `305`; `CLAUDE.md`).
  - `:469`: "Its getters are memoized [D11]". Decision 11 does not say it.
  - `:513`: "Methods of other classes keep their signatures [D45]".
    Decision 45 does not say it. It holds for today's type.
- **The decision document says:** nothing on these points
- **Kind:** extra
- **Correction:** At line 142, write "in the next snapshot [D3]". Where each
  of the other statements is today's behaviour, cite it as "(as today)" in
  place of the decision, and cite `super(args)` to the spike report.

## Unclear in the decision document

### U1. A store made from a function, held in another store

Row `review/spec.md:1293` gives `holder.fn === fnStore` as `true` in 1.0.
Reading A: decision 1 settles it, because the function "is frozen, or it is
a store" is handed out as it is (line 110). Reading B: the unspecified list
has "A store made from a function or from a typed array (findings 62 and
63)" (line 2258), so nothing about such a store is promised, this row
included. The spec took reading A and does not mark the row. If B is
meant, the row gets the † of finding 4.

### U2. Whether `rehydrate()` rejects when the first read failed

Decision 21 says a failed read "counts as no read, so the handle does not
write" (line 1222), and that a `rehydrate()` "that finds such a record
again" rejects (lines 1226 and 1227). A failed read finds no record. Reading A: it
rejects with a `'read'` report, like `save()` on a handle that does not
write. Reading B: it only reports. The spec's handle table (line 715) names
only `'parse'` and leaves the case out.

## Checked and agrees

- Section 1: the three fixed things and the five frameworks.
- Section 2: every runtime export and public type against `index.ts`,
  `collections/index.ts`, `utils/index.ts`, `react.ts`, `server.ts` and the
  four adapter files; peer ranges, `engines.node >=22` and `proxy-compare`
  `3.0.1` against `package.json`; one build with no export conditions (D36).
- The terms list, including the method definition (D1) and every adapter
  being a synchronous subscriber (D14).
- `createClassyStore`: the signature; rules 1 to 19, 21 to 24 and 26 to 30
  against D2, D3, D5 to D9, D10, D11, D15, D34, G2, G4, G5, G6 and G8; the
  errors and the changes. The kind `Error` and today's text of
  `getter-cycle` and `not-a-store` were checked in `core.ts`.
- `ClassyStore`: the signature from `spike-classes-2.md` compiles, and
  rules 1 to 4 and 6 to 9 agree with D1, D10, D11, D19 and D43.
- `snapshot`: the signature; rules 1 to 15 and 17 against G5, D1, D10, D34,
  D36, D43 and D44; the errors and the changes.
- `subscribe`: the signature; rules 1 to 16 against D3, D13, D14, D17, D34
  (M76 has "receives no arguments"), G1, G3 and G9; the 100 rounds and
  `delivery-loop`.
- `batch`: the type compiles and behaves as rules 3 to 6 say (D16).
- `shallowEqual`, `PROXYABLE` (`unique symbol` in the built `.d.mts`) and
  `SubscribeOptions` against the source.
- `Snapshot<T>`: rules 1 to 4 compiled; `SnapshotLeaf` is today's union.
- Collections: the factory signatures against `collections.ts`; rules 1 to
  3 and 6 to 8 against D6, D42 and D45; both snapshot types against
  `spike-snapshots.md` N4 and today's class members.
- `persist`: every type against `persist.types.ts` and `utilityStatus.ts`,
  with `onError` changed only by its third parameter (D21, D26); the option
  table, the handle table except finding 9, and rules 1 to 30 against D19,
  D21 to D25, D41 and G10. G10's first-save statement is in section 5
  (10.9).
- `withHistory`: types against `history.ts`; rules 1 to 10 against D28 to
  D30 and D44; recording is batched today (`history.ts:146`).
- `devtools`: types and the `'ClassyStore'` default against `devtools.ts`;
  rules 1 to 7 against D27, D30 and D43.
- `subscribeKey`: the signature against `subscribe-key.ts`; rules 1 and 3
  (D31).
- React: every signature against the hook files and
  `useClassyStore.types.ts`; rules 1 to 3, 5 and 6 (D11, D37, D41, D42,
  D44).
- React server, Vue, Svelte, Solid and Angular: signatures against the
  source, the changed Vue return type (D38) and the Angular `options` (D39);
  rules against D37 to D40 and D42; today's message texts.
- Section 4, "The rule" and "What follows" items 1 to 12: word for word
  against decision 1, lines 95 to 303, guarantee 6 and the unspecified
  list.
- Section 4, the table: each row against decision 1 and the row tables of
  `spike-functions-2.md` and `spike-functions-3.md`, which decision 1 cites.
  Except rows 1326, 1333, 1334 and 1337 (findings 4 and 7) and row 1293
  (U1), every 0.11 and 1.0 cell matches the report's "Today" and "R+1+2"
  (or "R") column and follows from decision 1's text. The generator rows are
  open point 9 and are not raised again.

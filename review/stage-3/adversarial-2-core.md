# Second adversarial review: the core

Brief: `review/stage-3/briefs/adversarial-2-core.md`. Artifact:
`review/stage-3-decisions.md` at `f5620b1`, with `spike-core-2.md` read as it
stands in the working tree.

Builds, each a detached worktree at `57404c3` under
`<scratch>/stage-3-adversarial-2-core/`:

- `wt0`: unmodified ("today").
- `wt`: decision 1 as spiked, `base-c1-t1strict.patch` then `rule-f1.patch`
  of `spike-functions.md` (so it holds decision 2's T3 (a) and the base
  class).
- `wt12`: decision 12 as spiked, `f2-holder-lazy.patch` of `spike-core-2.md`.
- `wt30`: decisions 30 and 44 as spiked, `k1-combined-fixed.patch` of
  `spike-combos.md`.

Scripts are in `<scratch>/stage-3-adversarial-2-core/repro/` and import the
TypeScript source: `bun <script> <worktree>`.

## Objections

1. **A store made from a copy of a raw object or of a snapshot runs the old
   store's methods, in silence.**
   - **Decision:** 1, and guarantee rule 6.
   - **Objection.** Clause 2 writes the wrapper into the raw object, and the
     wrapper has its own `prototype`, so wherever it is copied it is data
     bound to the first store. A template that one store adopted and another
     store copies, a store built from `{...snapshot(old)}`, and a nested
     object copied from one store into another now call into the first store,
     and the second store's subscribers hear nothing. The decision says
     "a new store built from a copy of an old one calls the old store's
     methods. That is so today." That is true only for a copy of the store
     proxy. For a copy of the raw object or of a snapshot it is false today
     and becomes true under this rule. Listing it under "Unspecified" does
     not make it a cost the entry states.
   - **Evidence.** `repro/copy.ts`. Each row calls the method on the second
     store and prints the counters of the first and the second.

     | Case                                                        | Today   | Decision 1  |
     | ----------------------------------------------------------- | ------- | ----------- |
     | `createClassyStore(defaults)`, then `({...defaults})`       | 0, 1    | **1, 0**    |
     | `createClassyStore({...snapshot(e)})`                       | 0, 1    | **1, 0**    |
     | `createClassyStore({...g})`, a copy of the proxy            | 1, 0    | 1, 0        |
     | `{config}` in one store, `{config: {...config}}` in another | 0, 1, 1 | **1, 0, 0** |

     In the last row the third figure is the sync calls on the second store.
     MobX, which the entry cites, clones the source given to `observable()`
     (from its documentation; not run here), so it does not have this case.
   - **Severity:** wrong (a new silent failure, and a "that is so today" that
     is false).
   - **What would settle it.** Decide what a method wrapper made by another
     node becomes when clause 2 or 3 meets it: rebound to this node (keep a
     map from wrapper to function), or data as now. Then test the four rows,
     and correct the sentence in "What it costs a user".

2. **A function on a snapshot or on the raw object ignores the `this` its
   caller passes.**
   - **Decision:** 1.
   - **Objection.** The entry states "a method read from a snapshot writes the
     live store". It does not state the other half: every function the object
     was born with, on the snapshot and on the raw object, now runs with the
     store node as `this`, whatever `this` the caller gives. Libraries that
     call an options callback with their own `this` (a chart scale's tick
     callback written as a shorthand method is the common case) get the store
     node. Today a snapshot and the raw object hold the original function, so
     handing `snap.options` to such a library works. The result is a wrong
     value, not an error. Code that registered a raw function before the store
     adopted its object (`addEventListener(type, handlers.onClick)`) can no
     longer remove it through the raw object either.
   - **Evidence.** `repro/thiscall.ts`: `snapshot(s).options.ticks.callback.call({prefix: '$'}, 1)`
     is `"$1"` today and `"undefined1"` under decision 1. The same on the raw
     `options` object. `handlers.onClick === registered` is `true` today and
     `false` under decision 1.
   - **Severity:** wrong (a new silent wrong answer, outside the entry's list
     of costs).
   - **What would settle it.** Either the costs list names it and the docs
     say that an object holding callbacks for another library goes in a field
     the store does not proxy, or a function the store never called as a
     method is left as it is in the snapshot (the "table beside the object"
     form, which the entry rejects for other reasons).

3. **A snapshot getter that calls an own method writes the live store, which
   decision 10 and rule 4 say throws.**
   - **Decision:** 10, with 1 and 11; guarantee rule 4.
   - **Objection.** Decision 10 says that on a snapshot "a write to `this`
     throws … also through a method the getter calls". Under decision 1 a
     method of kinds 2 to 4 is the store's wrapper, bound to the live node,
     and every arrow method of a `ClassyStore` subclass writes through its
     lexical `this`, the live store. Neither goes through the snapshot
     tracker's traps. So the getter runs, the live store changes, and its
     synchronous subscribers, every adapter among them, are told while a
     component is reading a snapshot. Rule 4 says such a getter throws "on the
     store and on a snapshot". F4 ran "calls a prototype method" only. A getter
     that writes its own store through a module-level reference
     (`store.count++`) has the same hole on the snapshot layer, and throws on
     the live layer.
   - **Evidence.** `repro/snapgetter.ts`. Today the write is lost:
     `liveHits 0, syncCalls 0`. Under decision 1, for an object-literal
     shorthand method and for a base-class arrow field alike:
     `result 0, liveHits 1, syncCalls 1`, no error. F4 half A changes only the
     tracker's traps, which this path does not reach. `spike-core-2.md`, F4
     table, row "calls a prototype method".
   - **Severity:** wrong (two entries and a guarantee that cannot all be
     true).
   - **What would settle it.** Either the snapshot getter runs with a flag
     that the live traps check (a write to the node behind the snapshot
     throws while a snapshot getter of that node runs), or rule 4 and
     decision 10 say "a write to `this`" and list a method of the object and
     a write through a store reference as unspecified. A test for both, on
     both layers.

4. **Undo into a container frozen through the store throws half way, with
   the pointer moved.**
   - **Decision:** 30, with 2 and 5.
   - **Objection.** Decision 5 keeps a child as a child after
     `Object.freeze(container)` through the store, and decision 2 keeps that
     freeze silent, so no history entry records it. Decision 30's restore then
     goes down into the frozen container and writes into it. The write is
     refused, the `TypeError` leaves the store half restored, the one sync
     notification carries that half state, and `canUndo`/`canRedo` say the
     undo happened. That is the failure class K1 removed for cycles. Today the
     restore replaces the branch at its parent and the undo works. The same
     holds for a sealed or non-extensible container whose undo has to re-add a
     key, and for a property made read-only.
   - **Evidence.** `repro/undo-frozen.ts`, one entry that writes `title` and
     `config.x`, then `Object.freeze(s.config)`, then `undo()`. Today:
     `returned, title "a", configX 1`. On `wt30`: `threw: TypeError … 'set'
     trap returned falsy value for property 'x'`, `title "a"`, `configX 2`,
     `canUndo false, canRedo true`, `syncCalls 1`.
   - **Severity:** wrong (a working undo becomes a partial one).
   - **What would settle it.** The restore replaces a container it cannot
     write (frozen, sealed, non-extensible, or with a read-only key that
     differs) at its parent, as today, or it checks every write before it
     makes any. Then this script as a test.

5. **Decision 12's table grows without bound: one entry for every absent key
   ever read, kept for good.**
   - **Decision:** 12.
   - **Objection.** `accessorHolder()` fills the table of
     `Object.getPrototypeOf(target)` on every miss and never removes an
     entry. A read of a key a dictionary does not have yet, which is how a
     cache, an index by id or a membership test is written, adds a key to the
     one table of `Object.prototype` that every plain object of every store
     shares. Deleting the dictionary entry does not remove it. "What it
     assumes" names only a prototype that changes.
   - **Evidence.** `repro/table-growth.ts`: for each of N fresh keys,
     `if (!s.cache[key]) s.cache[key] = i; delete s.cache[key]`, then a full
     collection. Heap growth: today 0.2 MB for 1,000,000 keys; on `wt12` 20.5
     MB for 200,000 and 88.4 MB for 1,000,000, with no key left in the store.
   - **Severity:** wrong (an unbounded retention the entry does not name).
   - **What would settle it.** Do not record a miss (only a found accessor),
     or skip the table for `Object.prototype` and `Array.prototype`, and time
     it again. A test that a million distinct absent keys leave the table
     size flat.

6. **Decision 29's restore by reference does not survive decision 1's write
   path.**
   - **Decision:** 29, with 1 and 30.
   - **Objection.** The restore writes through the store. When the key was
     deleted since the entry was recorded, clause 3 makes the recorded
     callback a method, and when the field now holds a method of the node,
     clause 4 does. Either way a callback that was data and kept its identity
     comes back wrapped. The entry says it "puts back one that was replaced,
     by reference", and it was reasoned, not run.
   - **Evidence.** `repro/restore-fn.ts` on `wt`: a declared field given `cb`,
     its snapshot value recorded (`=== cb` true), the key deleted, the value
     written back by assignment or by `defineProperty`: `=== cb` is false both
     ways.
   - **Severity:** wrong.
   - **What would settle it.** The shared restore writes a recorded function
     past clauses 3 and 4 (a flag the traps read, or a direct definition on
     the raw object with the bookkeeping of decision 2). A test for the
     deleted key and for a field that holds a method at undo time.

7. **Clause 1 says a prototype function must have no `prototype`; the spike's
   code does not check it.**
   - **Decision:** 1.
   - **Objection.** The decision puts "when it has no `prototype` property of
     its own" before all four clauses. The spike's rule says case 1 "does not
     check `prototype`". The two differ for a prototype method written as
     `Foo.prototype.m = function () {…}`, for every class method compiled to
     ES5, and for a generator method. Stage 4 writes from the decision and
     applies no patch, so by the text every class method in ES5 output stops
     being bound and stops being a transaction.
   - **Evidence.** Decision 1, "Decision", the sentence before the list;
     `spike-functions.md`, "The rule as the code tests it", case 1; the get
     trap of `rule-f1.patch`, which calls `methodOf` for an inherited
     function without `bornValue`.
   - **Severity:** unclear (two implementations, one of which breaks ES5
     output).
   - **What would settle it.** Move the condition into clauses 2 to 4, as the
     code does, and add a test with a prototype method that has a
     `prototype`.

8. **A read-only function defined on a new key is wrapped by the spike, and
   the engine then throws after the property is defined and subscribers are
   told.**
   - **Decision:** 1, with 2; guarantee rule 8.
   - **Objection.** The decision says "a function in a property that cannot
     be written" is data. The spike's `defineProperty` trap calls `bornValue`
     for any definition of a new key that carries a value, writable or not.
     For `Object.defineProperty(store, 'toJSON', {value: fn})` (default
     attributes: read-only, not configurable) the target gets the wrapper, the
     Proxy invariant then rejects the trap's answer, the caller gets a
     `TypeError`, and the property is defined and a sync subscriber was told.
     Rule 8 promises a `TypeError` on a refused write, not on one that was
     made. No row of the spike's case tables covers a read-only definition.
   - **Evidence.** `repro/define-ro.ts`. Today: defined, and the read throws
     (today's wrapper breaks the invariant). On `wt`: `threw: TypeError …
     'defineProperty' trap did not define a property on its target that is
     compatible`, then the own property is read-only and holds the wrapper,
     and `syncCalls 1`.
   - **Severity:** unsupported (the entry's sentence may be right; its
     evidence's code does the opposite and no run covers it).
   - **What would settle it.** `bornValue` only for a definition that leaves
     the property writable, and the script as a test.

9. **An object-literal getter that throws still spoils a DevTools entry.**
   - **Decision:** 43, with 27.
   - **Objection.** The "Why" gives "today one getter that throws spoils the
     entry" as a defect the change removes. K3 guards only the root store's
     class getters. A getter of an object literal stays an own enumerable
     accessor of the snapshot, the extension's serialiser runs it, and a throw
     there spoils the entry as today. The object literal is a documented
     input. The same holds for a spread or `JSON.stringify` of such a
     snapshot.
   - **Evidence.** `spike-combos.md`, K3, the payload table: the nested
     literal getter `twice` is in the payload because form A keeps it an own
     accessor; the guard is in `k3-devtools-getters.patch` for the getters
     listed on the root's prototype chain only. Reasoned from the patch, not
     run.
   - **Severity:** unsupported.
   - **What would settle it.** Either guard every own accessor of what is
     sent, or say in 43 that the fix holds for class getters of the root only.

10. **Arrays and reactive collections answer differently for a snapshot kept
    as a value.**
    - **Decision:** 6, against 42.
    - **Objection.** Decision 6 rejects identity for a snapshot kept as a
      value because "a list of snapshots kept as values is an undo stack, and
      it has to answer as a plain array does". Decision 42's "one membership
      rule" keeps `identityOf()` in `reactiveSet` and `reactiveMap`, so a set
      of saved versions keeps one of them and drops the next `add()` in
      silence. After stage 4 the docs carry two rules for one question.
    - **Evidence.** `repro/setsnap.ts` on `wt0`: two snapshots of one object,
      `v1 === v2` false; the set's `size` is 1 after adding both; the array
      holds 2 and `indexOf(v2)` is 1.
    - **Severity:** unclear.
    - **What would settle it.** One sentence in 42 or 6 that says which rule
      a collection uses for a frozen value and why, with a test.

11. **Decision 1's timing condition is measured against a baseline that
    decision 12 has already moved.**
    - **Decision:** 1, with 12 and the order.
    - **Objection.** Decision 1 is held back "while `store.method` is
      outside the spread of today's". Decision 12 lands first and makes
      `store.method` faster (Node 269 to 280 ns in the combination against
      284 to 299). A 5% loss from decision 1 then sits inside today's spread
      and passes, while it is still a loss against the commit before it.
    - **Evidence.** Decision 1, "Evidence", second paragraph;
      `spike-core-2.md`, "The three core fixes together", `store.method`.
    - **Severity:** unclear.
    - **What would settle it.** Name the baseline: the commit before decision
      1 in stage 4, not the stage 1 figures.

12. **Decision 27 cites "the slot form" of K2 with the hook form's figures.**
    - **Decision:** 27 (answer to W17).
    - **Objection.** In K2 the "slot" is the counter form (40 bytes on the
      main entry, 441 on `./utils`, naming left in the core) and the "hook"
      is the recommended form (12 and 452, naming in `devtools.ts`). Decision
      27 describes the hook, calls it a slot, and cites "K2: the slot form, 12
      bytes … and 452". A reader who opens K2 finds a slot patch that does the
      opposite of the text.
    - **Evidence.** `spike-combos.md`, K2, "Builds" and the bytes table;
      decision 27, "How the name reaches `devtools`" and "Evidence".
    - **Severity:** unclear.
    - **What would settle it.** Say "the hook form (`k2-hook-on-p7.patch`)".

13. **Decision 5's figures for the freeze swap are those of the form that
    fails lint.**
    - **Decision:** 5, and decision 4's table.
    - **Objection.** Decision 5 says F1 is "13 lines added and 1 removed …
      56 bytes". The report gives 15 added and 2 removed and 68 bytes, and
      says 56 was the form before lint's `noParameterAssign` was satisfied.
      Decision 4's row for decision 5 (+92) and its sum carry the 56.
    - **Evidence.** `spike-core-2.md`, F1, "What was changed" and "Size";
      `f1-delta.patch` (+15, −2).
    - **Severity:** unsupported (a number the report does not hold).
    - **What would settle it.** 68 bytes, +104 in decision 4's row, and the
      sum corrected.

14. **"A write to a child throws because the child is frozen" is false in
    sloppy code.**
    - **Decision:** 10.
    - **Objection.** F4 half A makes the tracker's own traps throw, which
      closes objection C12 for `this`. A child read through the tracker is a
      plain frozen snapshot, and an assignment to a frozen object in sloppy
      code is ignored. So in an object-literal getter of a classic script the
      write to a child is lost in silence. The behaviour is unspecified, but
      the decision states it as a fact. F4 ran the child rows in strict code
      only.
    - **Evidence.** `repro/sloppychild.ts` (getters compiled with `Function`,
      as F4 did): `this.child.x = 1` returns `"ran"` and the child stays 0;
      `this.list.push(1)` throws, because `push` is strict.
    - **Severity:** unsupported.
    - **What would settle it.** "In strict code" in the sentence, or the
      tracker wraps the children it hands out.

15. **Decision 43's figures come from a snapshot layer that decision 10
    changes, and the entry does not say so.**
    - **Decision:** 43 (residue of C15).
    - **Objection.** C15's answer was "7 and 4 say so". Decision 7 now says
      stage 4 takes its figures from its own build; decision 43 does not,
      though N2 was built on the unmodified `snapshot.ts`, the getter
      combination and `n2a-one-loop-with-s1.patch` do not apply on each other,
      and F4 half A adds traps to the same tracker. Its 239 bytes and 14 tests
      are then a forecast too.
    - **Evidence.** Decision 43, "Evidence"; `adversarial-core.md`, objection
      15; `spike-core-2.md`, "The three core fixes together" (F4 not
      combined).
    - **Severity:** unsupported.
    - **What would settle it.** The sentence decision 7 has, in 43.

16. **Rule 6 and the "Unspecified" list disagree with decision 1 about
    prototype methods.**
    - **Decision:** guarantee rule 6 and "Unspecified", against 1.
    - **Objection.** Rule 6 says a function decision 1 makes a method is
      replaced once and that every snapshot then holds that one function. For
      kind 1, a prototype method, nothing is replaced and a snapshot reaches
      the class's own function through its prototype. Decision 1 states that
      such a method on a snapshot "still runs against the frozen snapshot and
      still throws on a write"; the "Unspecified" list makes the same thing
      unspecified.
    - **Evidence.** Rule 6, last sentence; decision 1, "What it costs a user",
      third bullet; "Unspecified", seventh item.
    - **Severity:** unclear.
    - **What would settle it.** Rule 6 says "a function of kinds 2 to 4", and
      decision 1's bullet either becomes a rule or says "unspecified".

## Examined, nothing found against

- Decision 1 on the other cases the brief names: one raw object in two
  stores (one node, one set of wrappers); the raw object passed to
  `createClassyStore()` twice (the same proxy); a reactive collection (its
  values are list elements, so data) and a `PROXYABLE` class; a getter that
  returns a function (memoized, not wrapped); a symbol key; a sealed or
  non-extensible raw object (the scan writes existing keys only); an
  accessor; `Object.assign(store, …)`; a frozen root; a DevTools jump by
  JSON; a method read through React's tracking proxy (stable identity, the
  caller's `this` ignored); class fields as definitions and as assignments
  (both reach clause 3 or 4). Numbers against `spike-functions.md`: 71 and
  13 lines, 27 tests against 28, 3,888 bytes, Node 310 to 333 ns against
  296 to 304.
- Decisions 1 and 11 together: a base-class subclass and a plain store
  follow the same rule. A constructor that assigns an arrow over a field
  declared `= null` gets data, which is what decision 11's sentence on
  declared fields says.
- Decision 2: the notification rule and the cache clearing, apart from
  objection 8.
- Decision 3: matches `own-code.md` (`x2`, +1 −10, 6 tests, 122,610 against
  446 ns).
- Decision 5 with the snapshot layer, `linkChild`, the searches of decision
  6, `persist` and `cloneSnapshot` after the swap: each either reads a
  snapshot or already accepts a proxy in a raw slot; F1's table shows the
  snapshot updating. The raw readers left are unspecified.
- Decision 6: every number against F3; no list found on which `includes`,
  `indexOf` and `lastIndexOf` disagree with each other beyond `NaN`, which
  is native.
- Decisions 7, 8 and 9: numbers against T4, T5 and T6; C8's answer holds in
  rule 4.
- Decision 10's live layer: the own-node throw covers a direct write, a
  prototype method and a definition; what is left (a child, another store,
  a store built inside) is stated.
- Decision 12's other assumptions: a swapped prototype uses the new
  prototype's table; an own accessor placed later sets the node's flag at
  its scan.
- Decisions 30 and 44: K1 ran the six cycle cases; the paragraph on a moved
  or shared object is backed by the addendum's four runs (on a build without
  decisions 1 and 5).
- Decision 43 with `cloneSnapshot` (the derived prototype is mapped back),
  `persist` (same fields), and what spread, JSON and `structuredClone` give
  for a class getter (dropped), an object-literal getter (run) and a
  collection (`size` dropped), all as the entry says apart from objection 9.
- Decisions 45 and 46, rules 2, 5, 7 and 8 beyond objection 8.
- First-round objections C1 to C18 and W1, W8, W9, W13 and W18: answered,
  except where objections 5 (C6's form), 13 (C2's figures), 14 (C12), 15
  (C15) and 12 (W17) above say otherwise.

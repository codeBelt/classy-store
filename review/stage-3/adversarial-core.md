# Adversarial review: the core decisions

Reviewer of decisions 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 43, 44, 45 and 46
of `review/stage-3-decisions.md`. 18 objections: 8 wrong, 5 unsupported, 5
unclear, none mislabelled. Most serious first.

Scripts are under `<scratch>/stage-3-adversarial-core/scripts/`; each takes
the worktree to load as its argument or imports it by path. The patches were
cut from the reports' appendices with a script, unchanged. Throwaway
worktrees at `57404c3`, none committed:

- `wt`: `t3a-t1strict`, `base-class`, `w2` and `w2-on-create` of the class
  reports, then `p7` and `p8` of `persist-devtools.md`, then `v4-in-place`,
  then `n3-cycles`. One hunk of `n3-cycles` in `history.ts` does not apply
  after V4 moved that code into `applyState`; I added its one line,
  `clones.set(state, store)`, to `applyState` instead.
- `wt2`: `t2a-raw-only` (decision 5) alone.
- `wt3`: the descriptor table of `review/stage-2/solid.md` (decision 12)
  alone, its paths rewritten to the package.
- `wt4`: `t2.patch` (decisions 5 and 6).
- `wt5`: `t4-live.patch` (decision 7, the live store).
- `wt6`: the getter combination of `spike-getters.md` (decision 10), used
  only to see whether decision 43's patch applies on it.

"Unmodified" means the main checkout, whose library source is that of
`57404c3`. The timing caveat does not apply: no objection rests on a timing.

## Objections

1. **Decisions 30 and 44 together: undo of a store with a cycle overflows
   the stack.**
   - **Decision:** 44, with 30.
   - **Objection.** Decision 44 says `withHistory` is "made safe" for a
     cycle. Decision 30's in-place restore, written before 44, recurses from
     a live node into its fields with no visited set. On a store with
     `store.self = store`, `restoreValue` finds the live node again through
     `self`, sees that its snapshot differs, and calls `applyFields` on it
     again, without end. The two patches were measured apart; together the
     undo that decision 44 promises throws.
   - **Evidence.** `scripts/cycle-undo.ts` on `wt`: `snapshot keeps the
     cycle: true`, then `undo threw: RangeError getOwnPropertyDescriptor <
     findPropertyDescriptor < isDataKey < applyFields < restoreValue <
     applyFields < restoreValue`. The same script without the cycle
     (`nocycle-undo.ts`) undoes normally. The `clones` entry N3 adds does
     not help: `restoreValue` asks `liveNodeOf()` before it looks at
     `clones`.
   - **Severity:** wrong.
   - **What would settle it.** Decision 30 or 44 names the visited set that
     `restoreValue` needs (a live node already being restored is returned as
     it is), and the cycle rows of N3's table become tests of the merged
     restore, not of N3 alone.

2. **Decision 5 adds a silent failure to a frozen store.**
   - **Decision:** 5.
   - **Objection.** Once the raw object holds the raw child, a read-only
     property must hand out that raw child (the Proxy invariant decision 2
     and `CLAUDE.md` rely on). Today a store placed in another store by its
     proxy "is already that value and stays a child" (`CLAUDE.md`). Under
     decision 5, after `Object.freeze(outer)`, which decision 2 keeps
     working and silent, `outer.inner` reads the raw inner object, and a
     write through it notifies no one. The same holds for a row of a frozen
     list. It also breaks guarantee 6, "one object has one proxy, however it
     is reached".
   - **Evidence.** `scripts/raw-freeze.ts`. Unmodified:
     `outer.inner === inner: true`, one synchronous call on `inner`, the same
     for a row. On `wt2` (decision 5 alone): `outer.inner === inner: false`,
     `sync calls on inner: 0`, `outer.rows[0] === row: false`,
     `sync calls on row: 0`, while the raw values did change. `spike-traps.md`
     T2, "Cost for stage 4", noticed that "a frozen store root held by
     another store" reads the raw object and did not count it as a loss.
   - **Severity:** wrong.
   - **What would settle it.** Either keep the proxy in the raw object when
     the child is a store root or the property is read-only, or make the
     `defineProperty` trap swap the raw child for its proxy before a property
     becomes read-only, and add the script's four lines as a test.

3. **Decision 11: the arrow-method wrapper is cached by function alone, so
   one function shared by two stores writes the first store.**
   - **Decision:** 11.
   - **Objection.** `asMethod()` in `w2.patch` keeps one module-wide
     `WeakMap` from a function to its wrapper, and the wrapper closes over the
     store that first installed it. The rule covers "any function without its
     own `prototype`" (`spike-classes-2.md`, "W2 ships with it"), which takes
     in shorthand methods and `async` functions as well as arrows. A
     function that two instances install as a field, such as a method of a
     shared object literal or a module-level `async function`, then runs with
     the first instance as `this` when it is called on the second. The write
     lands on the wrong store and the right one is never told.
   - **Evidence.** `scripts/w2-edges.ts` and `w2-edges2.ts` on `wt`:
     `second.touch(): first.edits = 1 second.edits = 0 calls first/second = 1
     0`, and `q2.load(): q1.loading = true q2.loading = false`. Code:
     `spike-classes.md`, appendix B, `w2.patch`, `arrowMethods` and
     `asMethod`. None of the tests in "The tests stage 4 writes first" puts
     one function into two instances.
   - **Severity:** wrong.
   - **What would settle it.** Key the wrapper by store and function, or
     wrap only a function that has no `prototype` and is an arrow, and add
     the shared-function case to the tests stage 4 writes first.

4. **Decision 11: a subclass that overrides an arrow method loses the
   transaction.**
   - **Decision:** 11.
   - **Objection.** The "on create" form wraps only a write that creates the
     field. When `B extends A` and both declare `bump = () => {…}`, `A`'s
     initialiser creates the field and `B`'s only redefines it, so `B`'s
     arrow method is data and notifies once per write. It does so under
     every compiler, because both the `set` and the `defineProperty` branch
     test for an existing field. That is the silent slow path decision 11
     exists to remove, in the ordinary case of overriding a method, and the
     docs sentence "an arrow-function field is a method" says the opposite.
     The same rule wraps a callback written after `delete store.onSave`,
     and any function written to a new key at any time.
   - **Evidence.** `scripts/w2-edges.ts` on `wt`: `parent arrow method, sync
     calls: 1`, `overriding arrow method, sync calls: 2`; `after delete and
     re-create, onSave === cb: false`; `new key later, e.handler === handler:
     false`.
   - **Severity:** wrong.
   - **What would settle it.** A rule that also treats an arrow function
     replacing an arrow-method wrapper as a method, or a docs sentence and a
     test for the override case. The decision should also state the rule as
     the patch implements it ("a function without its own `prototype`"),
     not as "an arrow function".

5. **The stage 4 order breaks decision 11's own condition.**
   - **Decision:** 11, and "The order for stage 4".
   - **Objection.** Decision 11 lands "after decisions 1 and 2, and together
     with decision 30, which it needs". The order puts the base class in
     step 5 and decision 30 in step 7, and decision 30 is "on top of
     decision 27", also in step 7.
   - **Evidence.** `review/stage-3-decisions.md`, decision 11, "Label"; "The
     order for stage 4", steps 5 and 7.
   - **Severity:** wrong (the order cannot be followed as written).
   - **What would settle it.** Move the base class after step 7, or say that
     it lands in step 5 with V4's tests red until step 7.

6. **Decision 12: a getter redefined on the class keeps running its old
   body on the live store, while snapshots run the new one.**
   - **Decision:** 12.
   - **Objection.** The table caches the whole inherited descriptor,
     including its `get` function. A getter redefined on the class, or a
     getter replaced by a data value, after the first read is then served
     from the stale descriptor for good. Today both work, and decision 43
     keeps the new getter on the snapshot side ("a getter redefined on the
     class later is the one that runs, as today"), so the two layers give
     different answers in silence. The decision's stated assumption ("a
     prototype gains no getter after its first read") and the unspecified
     list cover a getter added, not one changed or removed.
   - **Evidence.** `scripts/table.ts`. Unmodified: `after a getter is
     redefined on the class: live 300 snapshot 300`, `getter replaced by a
     data value on the class: live false`. On `wt3`: `live 30 snapshot 300`
     and `live true`. All 1,341 tests pass on `wt3` according to
     `spike-traps.md`, so no test pins it.
   - **Severity:** wrong (a new silent failure the decision does not name).
   - **What would settle it.** Cache only "getter or not" per prototype and
     key, and read the getter function at the read; or widen the unspecified
     sentence to "a prototype changed after its first read" and say that
     the layers may then disagree.

7. **Decision 6: a list that holds snapshots as values gives wrong answers
   to `indexOf`, `includes` and `lastIndexOf`.**
   - **Decision:** 6.
   - **Objection.** A frozen snapshot assigned into a store is a value kept
     by reference (`CLAUDE.md`, "Frozen objects are values"). Every snapshot
     of one object has the same `identityOf`, so on a list of saved versions
     each search matches the first version of that object, and a snapshot
     that was never pushed is "found". That is a new silent wrong answer from
     the three array methods the decision is meant to make right, in an
     ordinary pattern (a list of saved versions, an undo stack written by the
     user).
   - **Evidence.** `scripts/search.ts`. Unmodified: `versions.indexOf(v2): 1
     includes(v3) (never pushed): false lastIndexOf(v1): 0`. On `wt4`
     (`t2.patch`, both parts): `indexOf(v2): 0`, `includes(v3): true`,
     `lastIndexOf(v1): 1`. A plain array gives `1 false`.
   - **Severity:** wrong.
   - **What would settle it.** An element that is itself a frozen value is
     compared by reference, and only a store proxy or a raw node element by
     identity; the script's three lines become tests.

8. **Decision 7 and guarantee 4: a getter that asks `Object.hasOwn(this,
   …)` or `this.hasOwnProperty(…)` stays stale, and neither the decision nor
   the unspecified list says so.**
   - **Decision:** 7, and "Guaranteed", rule 4.
   - **Objection.** Rule 4 promises a correct result "after anything it read
     through `this` changed". The `has` and `ownKeys` traps do not see an own
     property check, which goes through `getOwnPropertyDescriptor`. The
     spike names the gap (`spike-traps.md`, T4, "A gap that stays under every
     variant"); the decision drops it, so stage 4 would ship a guarantee the
     code does not meet. `hasOwnProperty` is a common idiom.
   - **Evidence.** `scripts/hasown.ts` on `wt5` (`t4-live.patch`): after
     `s.b = 2`, `viaHasOwn` and `viaHasOwnProperty` still say `no b`, while
     `viaIn` says `has b`. The same on the unmodified source, so it is not a
     regression; it is an unstated exception to rule 4.
   - **Severity:** wrong (a guarantee that is false as written).
   - **What would settle it.** Either a `getOwnPropertyDescriptor` trap that
     records the key counter (not spiked), or rule 4 and the unspecified list
     name own-property checks as not tracked.

9. **Decision 43: `devtools` "adds the getters' values" is unspecified,
   unmeasured and unsized.**
   - **Decision:** 43, with 27 and 44.
   - **Objection.** No report built it. `spike-snapshots.md`, "Not done",
     lists "What `devtools()` should send now that a snapshot carries no
     getter values", and `persist-devtools.md` P7 does not touch getters, so
     its 403 bytes do not include it. The decision does not say whether
     nested objects get their getter values, whether a getter that throws
     drops the send (decision 14 then logs it on every write), or what
     happens on a cycle (decision 44), where a recursive walk does not end.
     It also runs every getter on every send, which is the cost and the
     throw decision 43 removes from snapshots.
   - **Evidence.** The sections named; `packages/classy-store/src/utils/devtools/devtools.ts`
     lines 69 and 78 send `snapshot(proxyStore)` as it is;
     `website/content/docs/DEVTOOLS_TUTORIAL.md` line 57 promises the
     computed `doubled`.
   - **Severity:** unsupported, and unclear.
   - **What would settle it.** Say top level only or recursive, with a
     visited set; say what a throwing getter does; measure the bytes on
     `./utils` and add them to decision 4.

10. **Decision 43 makes spreading a snapshot lose computed values in
    silence, against rule 8 of the contract.**
    - **Decision:** 43.
    - **Objection.** `{...snap}.total`, `<Row {...snap} />` and
      `JSON.stringify(snap)` give `undefined` where they give the value today,
      and the type still says `number`. The tutorial documents today's
      behaviour, so existing code is affected. The decision lists this as a
      cost but does not weigh it against "one that adds a new silent failure
      is a defect", and offers no mitigation (a type, a warning planned for
      1.x in decision 36, a migration note).
    - **Evidence.** `review/stage-3-decisions.md`, decision 43, "What it
      costs a user"; `spike-snapshots.md`, N2, "What it breaks or changes for
      a user".
    - **Severity:** unsupported.
    - **What would settle it.** An explicit answer to rule 8 for this case,
      and the planned warning or migration note named in decision 36 or 34.

11. **Decision 43 says the snapshot's `this` has "the store's keys and
    prototype"; its evidence says the prototype differs.**
    - **Decision:** 43.
    - **Objection.** Under form A with S1,
      `Object.getPrototypeOf(this) === Dict.prototype` is `false` inside a
      snapshot getter, as it is for the snapshot itself.
    - **Evidence.** `spike-snapshots.md`, N2, "What a getter sees as `this`",
      last column of the prototype row.
    - **Severity:** unclear (the docs written from the decision would state
      something false).
    - **What would settle it.** "the store's keys, and the class as its
      constructor and for `instanceof`".

12. **Decision 10: "a snapshot getter that writes to `this` throws" holds
    only for strict-mode code.**
    - **Decision:** 10.
    - **Objection.** In the combination the tracker's traps return `false`
      (`spike-getters.md`, G7, "In the combination the traps return
      `false`"), and under decision 43's S1 the tracker has no `set` trap and
      a frozen target, which also returns `false`. Class bodies are strict,
      but an object-literal getter in a sloppy script (a CommonJS file without
      `"use strict"`) ignores a `false` and the write is dropped in silence,
      which is what the decision says it removes.
    - **Evidence.** The section named; ECMAScript `PutValue` throws on a
      `false` `[[Set]]` only in strict code.
    - **Severity:** unclear.
    - **What would settle it.** Throw from a `set`, `defineProperty` and
      `deleteProperty` trap (G7a as measured alone, 78 bytes with the
      message, less with a decision 35 code), or state "in strict code".

13. **Decision 10's reasons for dropping the live-store throw answer only the
    broad form.**
    - **Decision:** 10.
    - **Objection.** Two of the three reasons (a store constructed inside a
      getter, a getter that calls another store's method) disappear if the
      throw is limited to a write to the getter's own node, which
      `spike-classes.md` names as the needed exemption ("it has to exempt a
      write to a node other than the getter's own"). That form was not
      measured or weighed. The choice matters before 1.0, because adding a
      throw later is breaking, and with G7a the two layers now disagree
      loudly: `this.cache ??= …` works on the store and throws through every
      adapter.
    - **Evidence.** `spike-classes.md`, "What depends on what", the G7b
      bullet; decision 10, "Not taken", third bullet.
    - **Severity:** unsupported.
    - **What would settle it.** A measurement of the own-node form, or a
      sentence that the decision rejects it for the third reason alone.

14. **Decision 1's tie-breaker is not true: the strict rule's cost is also
    silent.**
    - **Decision:** 1.
    - **Objection.** The decision chooses strict because "the failure of the
      other choice is silent". Under strict an object-literal method still
      works, and notifies a synchronous subscriber once per write. Decision
      11 calls exactly that, for arrow methods, "a new silent failure" (150
      ms against 1 ms for 1,000 writes, and each half-applied step visible).
      The object literal stays a documented input (`pinned.md`, row "A method
      of an object literal is a transaction"). Decision 11 also shows that a
      function present when the object is created can be told from one
      assigned later, which is the argument decision 1 says cannot be made.
    - **Evidence.** Decision 1, "Not taken"; decision 11, "Why", last bullet;
      `spike-classes.md`, C1, the table of four ways; `pinned.md` line 103.
    - **Severity:** unsupported.
    - **What would settle it.** Either give the object-literal case the
      "on create" rule too, or say plainly that an object-literal method is
      left on the slow, per-write path and that decision 36's warning for many
      synchronous calls is the answer.

15. **Decisions 7, 10 and 43 rewrite the same records and were never run
    together; decision 7's measured figures belong to a design that will not
    be built.**
    - **Decision:** 7, 10, 43, and "The order for stage 4", steps 2 and 3.
    - **Objection.** Decision 7 is to be written "on top of" decision 10's
      single dependency shape. The trap report says of that shape "I did not
      try that", so its 55 lines, 156 bytes, 9 tests and Node timings are for
      T4's own records, not for what stage 4 writes. Decision 43's S1 was
      measured on the unmodified snapshot layer, not on decision 10's (G5's
      evaluation stack, G4's `THREW` marker, G7a's traps). The getter
      combination and `n2a-one-loop-with-s1.patch` do not apply on each
      other (`git apply --check`: `snapshot.ts: patch does not apply`).
      Decision 7 also does not say that decision 2's `defineProperty` trap,
      which lands earlier, must move the key counter when enumerability
      changes (`spike-traps.md`, "T3 and T4").
    - **Evidence.** `spike-traps.md`, T4, "What was changed", last two
      bullets, and "Which spikes conflict"; `spike-getters.md`, appendix E,
      "The combination"; run on worktree `wt6`.
    - **Severity:** unsupported. I found nothing that makes them
      incompatible: the stack check keys on the snapshot, which form A's
      accessor passes through `unwrap`, and a `set` trap may return `false`
      on a frozen target.
    - **What would settle it.** Stage 4 takes the size and timing of step 2
      and 3 from the merged build, and says so; decision 7 names the counter
      line in the `defineProperty` trap.

16. **Decision 11 and decision 29: once a function in an own field is data
    to `withHistory`, a DevTools jump by JSON deletes every arrow method.**
    - **Decision:** 11, with 29 and 30.
    - **Objection.** Decision 11 makes an own function field the way a
      method is held. Decision 29 makes a function in an own field data to
      `withHistory`. The shared restore (`applyState`, decisions 27 and 30)
      deletes every data field missing from the state it is given, and JSON
      from the extension never carries a function. Today `isDataKey()` keeps
      functions out of both loops, so nothing is deleted. If decision 29 is
      written by changing that test, a jump by JSON removes the arrow methods
      and callbacks of the root store. Neither decision says which.
    - **Evidence.** `isDataKey` and `applyFields` in `persist-devtools.md`
      P7 and `spike-classes-2.md` `v4-in-place.patch` ("A field added after
      this state was taken did not exist in it"); decision 29, "reasoned, not
      spiked".
    - **Severity:** unclear.
    - **What would settle it.** Decision 29 says that an untrusted restore
      never deletes or writes a function field, with a test on a base-class
      store.

17. **Decision 11: an arrow method gets no name for `devtools`.**
    - **Decision:** 11, with 27.
    - **Objection.** Decision 27 names each entry after the outermost method
      through a hook in `transactional()`. A prototype method's name is the
      key the `get` trap was asked for. An arrow method's wrapper is made by
      `asMethod()` from the value alone, in `set` and `defineProperty`, and
      no key is passed. The base class's main pattern would then show unnamed
      or wrongly named entries.
    - **Evidence.** `spike-classes.md`, `w2.patch`:
      `transactional(value as …, store)`; decision 27, "Why".
    - **Severity:** unclear.
    - **What would settle it.** Say that the wrapper takes the field's key,
      and test an arrow method's entry name.

18. **Decision 45: a subclass of a reactive collection loses its own members
    in `Snapshot<T>`.**
    - **Decision:** 45.
    - **Objection.** `T extends ReactiveSet<infer V> ? ReactiveSetSnapshot<V>`
      maps `class Tags extends ReactiveSet<string> { hasAll() {…} }` to the
      bare snapshot type, so `snap.hasAll()` is a type error although it is
      there at run time. The decision does not say whether subclassing is
      supported.
    - **Evidence.** `spike-snapshots.md`, `n4-types-with-backing.patch`, the
      `types.ts` hunk.
    - **Severity:** unclear. Widening the type later is not breaking, so the
      label holds.
    - **What would settle it.** One sentence: subclasses of the collections
      are or are not supported, and the type test that says it.

## Examined, nothing found against

- Decision 3: its numbers match `own-code.md` (`x2`: +1 −10, 36 bytes, 6
  tests, the 122,610 against 446 ns). Read `resume()`: it resumes descendants
  before it compares saved versions, so a write deep in a suspended subtree is
  seen when any container above it is touched.
- Decision 2: the notification rule, the getter cache clearing, and not
  adding a `setPrototypeOf` trap (beyond objection 2, which comes from
  decision 5).
- Decision 8, and the `has`/`ownKeys` Proxy invariants of decision 7: both
  traps forward to the target.
- Decision 9: the condition on the realm guard, and leaving the read-only
  guard out once decision 12 lands, match T6's table.
- Decision 12's numbers against T6 and the Solid report.
- Decision 43 with `persist` (same fields saved), `shallowEqual` (prototype
  test, both sides derived), `cloneSnapshot` (maps the derived prototype
  back), `canProxy` (reads `constructor` through the chain) and the React
  tracking copy (registered with `registerTrackingProxy`).
- Decision 44 with the React hook (proxy-compare's own cache argument) and
  `subscribeKey`.
- Decision 46: N1 reads only internal maps, so "can follow 1.0" holds.
- Decision 1's claims about the docs and examples: no object-literal method
  found in `website/content/docs`, `website/examples` or `examples`.
- The pairs of trap patches 1, 2, 5, 6 and 12 beyond what is listed above:
  T1 strict and the searches share one branch, T2 needs one unwrap line in
  T3's trap, and decision 12 already computes the "own or inherited" answer
  decision 1 needs.

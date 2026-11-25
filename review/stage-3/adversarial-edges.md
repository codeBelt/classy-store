# Adversarial review: delivery, utilities, adapters and collections

Decisions 13 to 19, 21 to 31, 37 to 42, and the rules under "What 1.0
guarantees, and what it leaves unspecified", in `review/stage-3-decisions.md`.

Scripts are in `<scratch>/stage-3-adversarial-edges/scripts/`. Each ran with
Bun against a throwaway worktree at `57404c3`
(`<scratch>/stage-3-adversarial-edges/wt`), on the unmodified source and with
the patch named, taken from the report's appendix and applied with
`git apply --recount`. "Delivery combination" is `combo.patch` of
`spike-delivery.md` (D1, D3, the rejection handler, the D4 type). "Persist
combination" is `combo.patch` of `persist-devtools.md` (P1 to P8). No
library file in the repository was changed.

## Objections

### 1. Decision 21 and rule 10: a refused record is still lost in silence, and then deleted

- **Decision:** 21, and guaranteed rule 10.
- **Objection.** Decision 21 is titled "nothing `persist` cannot use is
  skipped in silence", but `persist` only reports through `onError`, which is
  optional, and P2 adds no console report (it leaves that to a development
  build, which decision 36 removes from 1.0). Without `onError` a refused
  record is as silent as today. The first edit afterwards then overwrites it,
  so `persist` deletes stored data on its own, which rule 10 ("only an
  elapsed time deletes stored data") says it never does.
- **Evidence.** `persist.ts`, `reportError()`: "or swallow silently if not
  provided". `persist-devtools.md`, P2: "In every 'parse' case … the record
  stays in storage until the next save", and "Not reported to the console:
  that belongs to the development build (M72)". `scripts/persist-probe.ts`,
  case 2 (stored version 1 holding `saved: 'precious'`, handle at version 2,
  no `migrate`, no `onError`, one edit): on the persist combination
  `lastError` is set, nothing reaches the console, and storage then holds
  `{"version":2,"state":{"n":1,"saved":""}}`. The unmodified source ends the
  same way.
- **Severity:** wrong. The decision does not deliver its own title, and rule
  10 is false as written.
- **What would settle it.** Either a default report when `onError` is absent
  (a `console.error` with the code of decision 35, which needs no
  development build), or rule 10 rewritten to say that a record `persist`
  cannot use is replaced by the next save. Better still, the next save does
  not replace a refused record until the application has been told; that
  needs a decision, because it changes the save path.

### 2. Decision 19: a restore inside `persist()` is lost to a field initialiser of a subclass

- **Decision:** 19, with 11.
- **Objection.** With the base class of decision 11, `persist(this, …)` in a
  constructor is a natural place to start persistence ("whatever the
  constructor starts" writes through the store). With decision 19 the
  restore runs inside that constructor, before the field initialisers of a
  subclass, which overwrite it. The store and the storage then disagree, and
  nothing is reported. Today the restore runs a microtask later and wins.
- **Evidence.** `scripts/persist-probe.ts`, case 4. `Base`, whose
  constructor returns `createClassyStore(this)`, stands in for
  `ClassyStore`. `Prefs extends Base` calls `persist()` in its constructor.
  `DarkPrefs extends Prefs` declares `theme = 'dark'`. Stored value:
  `saved-by-user`.
  - Unmodified: `theme = saved-by-user`.
  - Persist combination: `theme = dark`, storage still `saved-by-user`, no
    error. Under decision 2 the initialiser becomes a write, so the next
    save would also overwrite the stored value.
- **Severity:** wrong. A new silent failure (contract point 8).
- **What would settle it.** Decision 19 names the case. Either the guide and
  the reference say not to call `persist()` in a constructor, with a test
  that pins what happens, or a restore started while a base-class
  constructor is running is deferred until it returns.

### 3. Decision 27 cannot be built as written: per-method entries need the synchronous channel it rules out

- **Decision:** 27, and the list "Proposed in a report and not taken".
- **Objection.** Decision 27 takes "one entry per outermost method, named
  after it" and also says "entries are not sent on the synchronous channel";
  the list of what is not taken repeats it. The P7 spike that gives the
  names, the 403 bytes and the reproduction subscribes with `{sync: true}` and
  sends a method's entry on that channel. A batched subscriber is called once
  per task, so two methods in one task cannot get two entries.
- **Evidence.** `persist-devtools.md`, P7, "Sending": "`devtools` subscribes
  with `{sync: true}`. Inside a method it sends one entry named after the
  method". The reproduction `["rename","birthday","STORE_UPDATE"]` is two
  methods and two direct writes in one task. `merged.md`, M57: the proposal
  is to "send on the synchronous channel, one entry per outermost
  transaction". Decision 17 also still lists `devtools` among the batched
  subscribers.
- **Severity:** wrong, or at least unclear: a reader can build either half,
  not both.
- **What would settle it.** One sentence: entries for a method are sent on
  the synchronous channel when the outermost call returns, and direct writes
  outside a method are sent once per task from a microtask, which is what P7
  ran. Then correct the not-taken list and decision 17.

### 4. Rule 1 and decision 14: "the code that wrote is never told" is false when `console.error` throws

- **Decision:** 14 and guaranteed rule 1.
- **Objection.** Rule 1 promises that a throwing subscriber leaves the other
  subscribers called and the writer untold. When `console.error` itself
  throws, as test setups that fail on console output make it, the error
  reaches the writer and every later subscriber of the round is skipped.
  `spike-delivery.md` reports the first half in its own table.
- **Evidence.** `spike-delivery.md`, D1 reproductions, last row:
  "`console.error` replaced by a function that throws: the writer gets that
  error". `scripts/console-throws.ts`, on the unmodified source and on the
  delivery combination alike: `calls = ["first"]`, the writer gets
  `console.error called: view failed`, and the second subscriber, standing
  for an adapter, is not called on this write or the next.
- **Severity:** wrong. A guarantee the library does not keep.
- **What would settle it.** Guard the report itself (a `try` around the
  `console.error` call inside the delivery loop, so the round goes on), with
  a test; or write the condition into rule 1.

### 5. Decision 16: the silent failure stays for every caller the type cannot see, and a runtime refusal can only come before 1.0

- **Decision:** 16, with 36.
- **Objection.** The type sees only a callback whose declared result is a
  promise. An `async` function held under a `() => void` type, which is how
  callback props and interface methods are usually typed, passes, as does
  any JavaScript caller and any `any`. Those callers keep today's silent
  split. `spike-delivery.md` recommended the runtime check for a development
  build, and decision 36 removes that build from 1.0. The decision's own
  asymmetry argument applies to the runtime check too: starting to throw for
  `batch(async …)` in 1.x would break a caller whose code runs today.
- **Evidence.** `<scratch>/stage-3-adversarial-edges/types/batch.ts`,
  checked with the package's
  `tsc` 7.0.2 and the spiked `Synchronous<T>`: `batch(onSave)` with
  `const onSave: () => void = async () => {…}`, `batch(() =>
  actions.reload())` with `reload(): void` implemented `async`, and
  `batch(legacy)` with `legacy: any` all compile; only the inline `async`
  arrow is refused. `spike-delivery.md`, D4, Spike 2: the check before the
  call refuses before anything is written and costs 50 to 83 bytes.
- **Severity:** mislabelled. If a runtime refusal is wanted at all, it is
  "before 1.0"; the decision treats it as something a later release can add.
- **What would settle it.** Decide now whether a native `async` callback
  throws in every build (the "before the call" form, about 50 bytes with a
  code), or say in the reference that it is accepted and split, and drop the
  idea of refusing it later.

### 6. Decision 21: an `async` `migrate` is called, its promise dropped, and its rejection is unhandled

- **Decision:** 21.
- **Objection.** P2 checks the result after `migrate` has run. A promise it
  returns is discarded, so a rejection is unhandled, which ends a Node or Bun
  process by default (`spike-delivery.md`, D2). That is the reason the
  delivery report gives for "never the check after the call" in D4, and
  decision 16 follows it; decision 21 does the opposite with no word on it.
- **Evidence.** `persist-devtools.md`, `p2.patch`: `state = migrate(state,
  storedVersion); if (!isPlainObject(state)) unreadable(…)`.
  `scripts/persist-probe.ts`, case 3 (an `async` `migrate` that rejects): on
  the persist combination one `'parse'` report and `unhandled rejections =
  1`.
- **Severity:** wrong. It replaces a silent skip with a possible crash.
- **What would settle it.** Attach a handler to a thenable `migrate` returns
  before refusing it, with a test that counts unhandled rejections.

### 7. Decision 26: removing `clearOnExpire` deletes data a user asked to keep, and nothing tells them

- **Decision:** 26, with 22.
- **Objection.** "An expired record is always cleared" changes what a handle
  without `expireIn` does: the tutorial says any stored `expiresAt` is
  honoured even then, so such a handle now deletes records it never stamped.
  A caller that passes `clearOnExpire: false`, the explicit way to keep
  expired data today, has the option ignored without a word, because
  decision 22 validates `properties` and transforms, not option names. With
  an async adapter on shared storage, a device whose clock runs ahead now
  deletes a record another device has just written, where today it only
  skips it. The decision says this was reasoned, not spiked.
- **Evidence.** `PERSIST_TUTORIAL.md` line 310: "Any stored `expiresAt`
  timestamp is honored on read, even if the reading handle does not specify
  `expireIn`". `persist.types.ts`: `clearOnExpire` "Default: `false`
  (expired data is skipped but left in storage)". `persist-devtools.md`, P9:
  "Not spiked". The P7 report refuses an index signature for `devtools`
  options for this reason ("it also accepts `enabeld: false` without a
  word"); `persist` gets no such check.
- **Severity:** unsupported. It may be right; no run shows these cases.
- **What would settle it.** A spike of the removal with the tests above
  (a handle without `expireIn`, a passed `clearOnExpire: false`, two handles
  on one key), and decision 22 extended to refuse the removed option name.

### 8. Decision 30: an undo writes into an object that now lives in another store

- **Decision:** 30.
- **Objection.** "The live object is put back" assumes the object is still
  where the history saw it. A row removed from store A and placed in store B
  is put back into A by A's undo, and A's recorded data is written into it,
  so B's own edit is overwritten and the row then sits in both stores. A row
  shared by A and B changes in B when A undoes. Neither is in the decision;
  `spike-classes-2.md` lists the first as reasoning, not run.
- **Evidence.** `scripts/v4-probe.ts`, on the persist combination with the
  `cloneSnapshot.ts` and `storeRuntime.ts` hunks of `v4-in-place.patch` and
  its `liveNodeOf` added to `core.ts` by hand:
  - Case 1, unmodified: B's row reads `edited in B`, B hears nothing, the
    stores hold two objects. With V4: B's row reads `two`, B's subscriber is
    called once, `a.rows[1] === b.rows[0]`, and an edit made through A
    changes B.
  - Case 2: B's row reads `changed` unmodified and `one` with V4.
- **Severity:** unsupported. It may be the rule wanted; nothing shows it was
  chosen.
- **What would settle it.** A sentence in decision 30 on what an undo does to
  an object that has moved or is shared, and the test the V4 report already
  lists ("a row moved to another store") written to it.

### 9. Decision 30: built after decision 44, the recursive restore has nothing that stops it on a cycle

- **Decision:** 30, with 44 and the stage 4 order.
- **Objection.** `restoreValue()` recurses into a live node whenever its
  current snapshot is not the recorded one, and keeps no set of nodes it has
  entered; `clones` covers copies only. On a store that refers to itself,
  which decision 44 makes snapshottable, the recorded root's `self` is the
  recorded root, the live node's snapshot is never that object, so the
  restore enters the root again without end. N3 changed the old, flat
  `applyState` for cycles; V4 was built on a tree without N3.
- **Evidence.** `spike-classes-2.md`, `v4-in-place.patch`, `restoreValue()`
  and `applyFields()`. `spike-snapshots.md`, N3, "What was changed": the two
  lines in `history.ts` and `cloneSnapshot.ts` that tell a restore the
  recorded root stands for the store. Reasoning: decision 44's patch and V4
  were not combined here.
- **Severity:** unsupported.
- **What would settle it.** Decision 30 states that the restore is safe on a
  cycle, and stage 4 writes the test (undo on `store.self = store` after an
  edit) before the change.

### 10. The stage 4 order puts decision 11 before decision 30, which it needs

- **Decision:** 30, 11 and "The order for stage 4".
- **Objection.** Decision 11 says it lands "after decisions 1 and 2, and
  together with decision 30, which it needs"; the order puts the base class
  in step 5 "after 1, 2 and 30", while decision 30 is in step 7. Contract
  point 5 asks for an order in which each change can be written and tested
  alone.
- **Evidence.** `stage-3-decisions.md`, "The order for stage 4", steps 5 and
  7; decision 11, "Label"; decision 30, "on top of decision 27", which is
  also step 7.
- **Severity:** wrong (the order cannot be followed as written).
- **What would settle it.** Move the base class into step 7 after 27 and 30,
  or move 27 and 30 before step 5.

### 11. Rule 3 is false for a write made inside a batched subscriber

- **Decision:** guaranteed rule 3, with 13.
- **Objection.** Rule 3 says a write made during delivery is delivered after
  the running round and before the outermost write returns. On the
  microtask path neither half holds: the write's synchronous subscribers are
  called inside the write, in the middle of the batched round, and its
  batched subscribers after the write has returned.
- **Evidence.** `scripts/rule3-batched.ts` on the delivery combination:
  `batched 1 starts`, `sync`, `batched 1: its write returned`, `batched 1
  ends`, `batched 2`, `batched 1 starts`. `spike-delivery.md`, D1, "What it
  changes for a user", points 2 and 3, describe the two paths separately.
- **Severity:** wrong (a guarantee that does not hold as written).
- **What would settle it.** Write rule 3 for the synchronous path only, and
  add the batched path's rule (delivered in the same microtask, after the
  running round), or mark it unspecified.

### 12. Rule 5 contradicts decision 44

- **Decision:** guaranteed rule 5, with 44.
- **Objection.** Rule 5 says an unchanged subtree keeps its snapshot object.
  Decision 44 says everything on a cycle gets a new snapshot on every write
  to any of it, and N3 measured it: 1,000 of 1,000 children get a new
  snapshot after one child is written.
- **Evidence.** `stage-3-decisions.md`, decision 44, "What it costs a user";
  `spike-snapshots.md`, N3, "What a cycle costs".
- **Severity:** wrong (two parts of the document disagree).
- **What would settle it.** "An unchanged subtree that is not on a cycle".

### 13. Rule 10: `save()` and `clear()` do not always reach a synchronous storage before they return

- **Decision:** guaranteed rule 10.
- **Objection.** A second `save()` or a `clear()` in the same tick waits on
  the queue of the first and reaches storage a microtask later.
- **Evidence.** `persist.ts`, `enqueueStorageMutation()`: a queued operation
  runs in `storageQueue.then(execute)`, and the queue is cleared in a
  `finally`. `scripts/save-clear-sync.ts` on the unmodified source: after a
  second `save()` returns, storage still holds the first state; after
  `clear()` returns, the key is still there; a tick later it is gone.
- **Severity:** wrong (as written).
- **What would settle it.** "The first `save()` or `clear()` of a task", or
  run a queued operation synchronously when the queue holds only completed
  synchronous work, with a test.

### 14. Rule 6: one object does not have one proxy "however it is reached"

- **Decision:** guaranteed rule 6.
- **Objection.** Reached through a frozen container or a read-only property,
  an object that the store also holds elsewhere reads back raw, not as its
  proxy, and a write through it is not seen.
- **Evidence.** `scripts/rule6.ts` on the unmodified source:
  `store.frozenBox.row === store.row` is `false` and is the raw object; the
  same through a non-writable, non-configurable property; a write through
  the frozen container changes `store.row.title` with no notification.
- **Severity:** wrong (as written). The behaviour itself follows from the
  frozen-object and read-only rules of `CLAUDE.md`.
- **What would settle it.** "However it is reached through the store's own
  proxies", and the two exceptions named.

### 15. Rule 2 leaves out the base class's arrow methods and does not state the `async` method rule

- **Decision:** guaranteed rule 2, with 11 and 16.
- **Objection.** Rule 2 lists a prototype method, a setter, an array method
  and `batch()`. Decision 11 makes an arrow-function field of a base-class
  store "one transaction"; the rule does not list it, so that is unspecified
  by accident. An `async` prototype method notifies once per write after its
  first `await` (D5 counts 3 calls), which the rule as written denies.
  Decision 16 puts the `async` rule into the reference only.
- **Evidence.** `stage-3-decisions.md`, decision 11, third bullet; decision
  16, "Label"; `spike-delivery.md`, D5, table, the `async` method row.
- **Severity:** unclear.
- **What would settle it.** Add the arrow method of decision 11 to rule 2,
  and "up to its first `await`" for an `async` method.

### 16. Decision 38: a write to the Vue ref is ignored in silence

- **Decision:** 38.
- **Objection.** "A write to it is ignored" is a new silent failure for a
  JavaScript caller or a template, where today the write at least shows.
  Vue itself warns on a write to a read-only computed. The `customRef`
  setter can throw for a few bytes.
- **Evidence.** `adapters-collections.md`, A1: "Its setter does nothing";
  A2 table, last row: "type error; ref 0". Contract point 8.
- **Severity:** wrong.
- **What would settle it.** The setter throws a `TypeError` with a code of
  decision 35, and a test pins it.

### 17. Decision 37 is labelled "can follow 1.0", and the reference documents the shape it changes

- **Decision:** 37.
- **Objection.** The reference says the Vue adapter returns a ref "backed by
  `shallowRef`". A1 replaces it with a `customRef`, which `isShallow()` and
  `watch()` can tell apart; the adapters report asks the decision document to
  say this may change, and decision 37 does not. By the contract's own
  definition that is "before 1.0". It lands in stage 4 with decision 38
  either way, so the consequence is the missing sentence.
- **Evidence.** `API_REFERENCE.md` lines 51 and 52;
  `adapters-collections.md`, A1, "Tests".
- **Severity:** mislabelled.
- **What would settle it.** Label the Vue half "before 1.0", and change the
  reference sentence in the same commit.

### 18. Decision 42: the snapshot index does not apply to an auto-tracked React read, and Solid's `active` flag cannot go

- **Decision:** 42.
- **Objection.** `a7a` skips the index for a tracked read
  (`let index = tracked ? undefined : …`), so `snap.users.get(id)` in a
  component that uses `useClassyStore(store)` without a selector still scans
  through the tracking proxy. The decision states the gain without that
  limit. It also says the adapters drop their `active` flags with decision
  13; the adapters report found that with A1, Solid's flag stays, because it
  decides what the accessor returns after disposal.
- **Evidence.** `adapters-collections.md`, `a7a.patch`, `indexOfMember()`;
  "The combination I would recommend", `combo-d1.patch`: "With A1, Solid's
  `active` flag stays". The timings in A7 are plain snapshot reads.
- **Severity:** unsupported (the gain for React) and unclear (the flags).
- **What would settle it.** A timing of a tracked lookup with `a7a`, and the
  decision naming the React limit; "Vue, Angular and Svelte drop their
  flags, Solid keeps its own".

### 19. Decision 39: the message for a missing context names `injectClassyStore()` only in Angular's development mode

- **Decision:** 39, with 35.
- **Objection.** A3 calls Angular's `assertInInjectionContext`, whose message
  is `ngDevMode && debugFn.name + '() can only be used…'`. In a production
  Angular build the error is a bare `NG0203` with no name, and it never has
  decision 35's form `@codebelt/classy-store [code]: facts`.
- **Evidence.** Installed `@angular/core` 22.2.6,
  `fesm2022/_pending_tasks-chunk.mjs` line 1475. Decision 35: "An error …
  from the library reads `@codebelt/classy-store [code]: facts`."
- **Severity:** unclear.
- **What would settle it.** Either the library checks `isInInjectionContext`
  itself and throws its own coded error, or decision 35 names Angular's
  error as the exception.

### 20. Decision 21: the version rule is stated three ways

- **Decision:** 21.
- **Objection.** The decision refuses "a version that is not a number". P2's
  table refuses `"2"`, `null` and `2.5` as "not an integer". The patch reads
  `envelope.version ?? 0`, so `null` counts as a missing version and is
  restored.
- **Evidence.** `scripts/persist-probe.ts`, case 1, on the persist
  combination: a record with `version: null` restores `n = 7` with no
  error. `persist-devtools.md`, P2 table, row "Version `"2"`, `null`, `2.5`".
- **Severity:** unclear.
- **What would settle it.** One rule in the decision (an integer, with
  `null` either refused or counted as missing) and a test for each value.

### 21. Decision 19 drops the spike gap the report flagged

- **Decision:** 19.
- **Objection.** P1 moves the `hydrated` bookkeeping into
  `hydrateFromStorage()`, and its report says that if the baseline snapshot
  at the top of that function throws, `hydrated` never resolves, and that
  stage 4 must move the bookkeeping. Decision 19 does not carry this, and
  `rehydrate()` loses its own `finally` in `p1.patch`.
- **Evidence.** `persist-devtools.md`, P1, "Spike gap"; `p1.patch`, the
  `rehydrate()` hunk.
- **Severity:** unclear (a reader implementing decision 19 from the
  decision alone would not see it).
- **What would settle it.** One line in decision 19, and a test with a store
  whose snapshot throws.

### 22. Decision 13: what an adapter of a second store shows during a round is not stated, and the variant has no criterion

- **Decision:** 13.
- **Objection.** With one queue, a synchronous subscriber of store A that
  writes store B makes B's state current at once and B's adapter value a
  round later. Another subscriber of A in the same round therefore reads the
  new B through the store and the old B through its adapter. Today it reads
  the new B in both. Separately, "stage 4 measures both variants and keeps
  the one inside the limits" decides nothing: the slower path is
  `store.write.sync`, which no limit in `CONSTRAINTS.md` covers, and both
  variants improve the write ratio that is limited.
- **Evidence.** `scripts/delivery-probe.ts`, case 2: on the delivery
  combination the second subscriber sees `b = 10, view of b = 0`; unmodified
  `view of b = 10`. A Svelte `derived` over both stores
  (`scripts/svelte-derived-probe.ts`) sees an inconsistent pair before and
  after D1, `0/10` before and `1/0` after, so the change is which pair, not
  whether. `spike-delivery.md`, D1 timings.
- **Severity:** unclear.
- **What would settle it.** A sentence in the reference that adapter values
  of other stores may lag inside a delivery round; and a stated criterion
  for the variant (for example a number of nanoseconds per direct write with
  one synchronous subscriber).

## Examined and found nothing against

- Decision 14's choice of option A over B and C, and the rejection handler,
  apart from objection 4.
- Decision 15 (the setter as a transaction); the D3 numbers match.
- Decision 17 and 18 (no change), apart from the `devtools` remark in
  objection 3.
- Decision 22's refusals, apart from option names (objection 7).
- Decisions 23, 24 and 25: the numbers and test counts match P4, P5 and P6.
- Decision 28 and 29: P8 matches; 29 says it is reasoned and sets a stop
  condition.
- Decision 31: the numbers match the N5 combination table, and `subscribeKey`
  keeps its values in every case N5 ran.
- Decision 37's timings and test counts against A1 and the combination
  table. Read, not run here: a read between two writes builds one current
  snapshot in Vue and Angular and waits for `flush()` in Solid, and the
  framework's own batching then reads the latest state once.
- Decision 38's server detection: Vue's server renderer provides
  `ssrContextKey` in `renderToString` and `renderToSimpleStream`, which the
  other stream functions build on (installed `@vue/server-renderer`
  3.5.45).
- Decisions 40 and 41 (no change) and the order rule for
  `prepareStoreForHydration`.
- Decision 42's membership rule and the `-0` sentence.
- Rules 4, 7, 8, 9 and 11, and the unspecified list, for the parts this
  brief covers.
- The delivery bound: an innocent store whose writes share the final round
  still shows its current value, because an adapter reads the live snapshot.

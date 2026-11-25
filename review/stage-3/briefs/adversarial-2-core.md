# Second adversarial brief: the core

- **Report:** `review/stage-3/adversarial-2-core.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-2-core/`

**Your decisions:** 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 29, 30, 43, 44, 45
and 46, and guarantee rules 2, 4, 5, 6, 7 and 8 with the "Unspecified" list.

**Evidence:** `spike-functions.md`, `spike-core-2.md`, `spike-combos.md` (K1
and K3), `spike-traps.md`, `spike-getters.md`, `spike-snapshots.md`,
`spike-classes.md`, `spike-classes-2.md`, `own-code.md`, `pinned.md`.

**First-round objections to check:** every one in `adversarial-core.md`, and
1, 8, 9, 13, 17 and 18 of `adversarial-whole.md`.

Look hardest at these:

- **Decision 1, the rule for functions.** It decides, for every function a
  store ever holds, whether it is bound and run as a transaction. It was
  rewritten from a spike after the first review. Try to break it. Some
  places to look: an object that two stores share; the raw object passed to
  `createClassyStore()` twice or read by other code afterwards; a reactive
  collection or a class with the `PROXYABLE` marker; a getter that returns a
  function; a symbol key; a sealed, frozen or non-extensible raw object; an
  accessor; `Object.assign(store, {…})`; a function restored by
  `withHistory` (decision 29) or by a DevTools jump; a method read from a
  snapshot through React's tracking proxy and called; a function held by a
  store and passed to another framework's reactive system; the same class
  compiled with class fields as definitions and as assignments. For each,
  say what the rule gives, and whether that is a silent failure.
- **Decisions 1 and 11 together.** Is there still any case where a class
  that extends `ClassyStore` behaves differently from what decision 1 says
  for every store? Does anything in decision 11 still depend on a rule that
  decision 1 no longer has?
- **Decisions 5 and 2, a container frozen through the store.** The swap in
  the `defineProperty` trap changes what the raw object holds. What reads
  the raw object afterwards and expects a raw value: the snapshot layer,
  `linkChild`, the searches of decision 6, `persist`, `cloneSnapshot`?
- **Decision 6, the searches.** After the rewrite, which elements are
  compared by identity and which by reference? Find a list on which
  `includes`, `indexOf` and `lastIndexOf` disagree with each other or with
  what a user holding a row would expect.
- **Decision 10, a getter that writes.** What exactly throws, on which
  layer, for which target of the write? Is a write to another store, to a
  nested object, or through a method called by the getter covered, and is
  what is left stated?
- **Decision 12, the table per prototype.** What does the table assume
  about a prototype after its first read, and is each assumption either
  tested or listed as unspecified?
- **Decisions 30 and 44, a restore on a cycle, and an object that moved to
  another store.** Is the paragraph on a moved or shared object backed by a
  run?
- **Decision 43, what a snapshot is.** After the rewrite, what does
  `devtools` send, what does `persist` save, and what do a spread, `JSON`
  and `structuredClone` of a snapshot give for a class with getters, for an
  object literal with getters, and for a reactive collection?

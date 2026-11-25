# Adversarial brief: delivery, utilities, adapters and collections

- **Report:** `review/stage-3/adversarial-edges.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-edges/`

**Your decisions:** 13 to 19, 21 to 31, 37 to 42, and the rules under "What
1.0 guarantees, and what it leaves unspecified".

**Their evidence:** `review/stage-3/spike-delivery.md`,
`persist-devtools.md`, `adapters-collections.md`, `spike-classes-2.md` (V4,
for decision 30), `spike-snapshots.md` (N5, for decision 31), `pinned.md`.

Look hardest at these:

- Decision 13 changes when subscribers of another store are called. Every
  adapter is a synchronous subscriber. What does a component see between a
  write and its delivery?
- Decision 16 refuses a callback that returns a promise by its type, with
  no runtime check. What does a JavaScript caller get?
- Decision 19 makes `persist()` restore before it returns. What does that do
  to a store that is rendered on the server, to `skipHydration`, to
  `usePersistStatus`, and to code that subscribes after `persist()`?
- Decision 21 refuses an `async` `migrate`. Decision 26 removes
  `clearOnExpire` without a spike.
- Decision 30 puts a live object back where a restored value is its
  snapshot. What if that object has since been removed, changed, or placed
  somewhere else?
- Decision 37 moves the snapshot to the read in three adapters. What reads
  between two writes, and what does a framework's own batching then see?
- The eleven guaranteed rules. Is each one true of the library after the
  decisions, testable, and something a user could rely on? Is anything a
  user will rely on missing from them, so that it stays unspecified by
  accident?

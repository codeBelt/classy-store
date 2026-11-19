# Brief: spikes on snapshots

- **Report:** `review/stage-3/spike-snapshots.md`
- **Scratch folder:** `<scratch>/stage-3-spike-snapshots/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

`packages/classy-store/src/snapshot/snapshot.ts`, `types.ts` and the React
tracking path that wraps a snapshot in `proxy-compare`
(`frameworks/react/`). If `review/stage-3/spike-traps.md` and
`review/stage-3/spike-getters.md` exist, read them first: both touch what a
snapshot getter sees.

## The spikes

**N1. Rebuild only what changed.** A snapshot after one of 1,000 rows changes
costs time in proportion to the rows (stage 1 findings 2 and 3). Immer finding
1 measured a floor on Node: copy the previous snapshot array and recompute
only the changed indices, 6 microseconds against 56. It did not build it.
Build it: record which keys changed per node, and rebuild those. Measure on
both engines; the Immer report says freezing bounds the gain on Bun. This
also decides what the adapters can do about a snapshot per direct write
(`review/stage-2/adapters.md` finding A1).

**N2. How a snapshot carries class getters (API question 3).** Today each
getter becomes an enumerable own accessor on every snapshot, so
`Object.keys`, spread and `JSON.stringify` of a snapshot run every getter and
list keys the store does not. No compared library does this. Spike two forms
and compare them with today's:

- own accessors that are not enumerable (MobX's answer);
- one derived prototype per class, created once and cached, whose accessors
  look up the per-snapshot memo (Valtio V4, Immer's answer to question 3).
  `Object.getPrototypeOf(snapshot) === Class.prototype` becomes false; check
  `instanceof`, `constructor`, and what `proxy-compare` and the React hook
  see.

For each: what a getter sees as `this` (Valtio V5 and its prototypes A to C),
the cost of creating a snapshot of a class with 0 and with 8 getters, the
tests that flip, and what a user who spreads or serialises a snapshot gets. A
getter on an object literal is an own enumerable accessor in the source: say
what each form does with it.

**N3. A cycle in the data.** A store that refers to itself (stage 1 finding
8, Valtio V3, Immer finding 11). Say what a snapshot does today and spike a
snapshot that keeps the cycle.

**N4. Types.** Tuples survive `Snapshot<T>` (stage 1 finding 14, Valtio V11,
Immer finding 10). A collection snapshot drops its mutators from the type and
throws an error that names the cause when one is called (stage 1 finding 16,
Immer finding 8, Valtio V10). Check with `bun run --filter
@codebelt/classy-store typecheck` and the `types.*.test.ts` files.

**N5. `subscribeKey` without a snapshot of the whole store** (Valtio V8), in
`utils/subscribe-key/`.

Then the combination you would recommend, with full measures.

# Brief: adapters and collections

- **Report:** `review/stage-3/adapters-collections.md`
- **Scratch folder:** `<scratch>/stage-3-adapters-collections/`
- **Skill to load first:** `mattpocock-skills:prototype`, then
  `api-and-interface-design`
- **Spikes:** yes, as the common brief describes.

## Subject

`packages/classy-store/src/frameworks/` and `src/collections/`. Read
`review/stage-2/adapters.md` whole, `review/stage-2/zustand-jotai.md`
findings 1, 2, 8 and 10, `review/stage-2/svelte.md` finding 8 and
`review/stage-2/valtio.md` finding V10.

The unit suite covers the React hooks under happy-dom. The Vue, Svelte, Solid
and Angular adapters are checked by packed-app suites that the common brief
tells you not to run: for those, run the scripts the stage 2 adapters agent
left in `stage-2-adapters/` before and after, and say so.

## The spikes

**A1. Build the snapshot at the read, not in the listener**, for the Vue,
Angular and Solid adapters (adapters finding A1 and its sketches).

**A2. Vue:** subscribe in `onMounted` so a server render leaves no listener
(adapters V1), and type the returned ref as read-only (stage 1 finding 17,
adapters V2).

**A3. Angular:** `untracked()` around the `set` (adapters N1), and an
`{injector}` option with an error that names the caller (adapters N2).

**A4. Solid:** rename `useClassyStore` to `fromClassyStore`. List every file,
example, guide and test the rename touches.

**A5. React:** capture the initial snapshot without `prepareStoreForHydration`
(Zustand and Jotai finding 1), at creation or just before the first write.
Measure the memory it holds and say what a write through a raw reference does
to it. Also `isEqual` against `equalityFn` (finding 2), as a recommendation.

**A6. One guard, written once.** Every adapter re-implements the guard for
stage 1 finding 20 (adapters A2). If `review/stage-3/spike-delivery.md`
exists, say whether its D1 removes the need.

**A7. Collections on native storage.** A lookup among 10,000 entries took 17
nanoseconds in `SvelteMap` and 45 microseconds in ours, and `has()` on a
snapshot of 10,000 members costs about 245 microseconds. Spike a live side
that keeps a native `Map` or `Set` beside the array, and the lazy index for a
frozen snapshot that the Valtio agent prototyped. Keep what ours does that
theirs does not: one identity for a raw object, its proxy and its snapshot
(`identityOf()`), and `-0` (stage 1 findings 33 and 34). Measure against the
`./collections` size budget.

Then the combination you would recommend, with full measures.

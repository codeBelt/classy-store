# Brief: spikes on the proxy traps

- **Report:** `review/stage-3/spike-traps.md`
- **Scratch folder:** `<scratch>/stage-3-spike-traps/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

The proxy handler in `packages/classy-store/src/core/core.ts` (the `get`,
`set`, `defineProperty` and `deleteProperty` traps and `linkChild`), with
`utils/internal/internal.ts` and, for T4, the tracking proxy in
`snapshot/snapshot.ts`. Stage 2 sketched most of these changes and ran each
sketch against its own reproduction only. Your job is to run them against the
repository's suites and say what each one really costs and changes.

Another agent is spiking the getter memoization in the same file
(`evaluateComputed`, `areDepsValid`, dependency records). Leave that part
alone.

## The spikes

**T1. A stored function is returned as it is.** Only a method found on the
prototype chain is bound to the store and run as a transaction. Functions held
as data (array elements, own properties, classes, `constructor`) are not
wrapped. Stage 1 findings 5, 6, 42, 62. Read Valtio V2, Vue finding 4, Solid
finding 3, Svelte finding 3, MobX finding 9. The Vue agent's sketch B is in
`stage-2-vue/ours-copy-raw/src`. List every case and decide each on evidence:
a prototype method, a getter that returns a function, an own property holding
an ordinary function, an own property holding an arrow function, a function
in an array, a class held as a value, a bound function, a frozen function.

**T2. Raw values on write, and one node per raw object.** Strip the proxy
from a value before it is stored, and find an object's node by the raw
object. Stage 1 findings 7, 9, 10. Vue findings 2 and 3, the other half of
sketch B.

**T3. `Object.defineProperty` with a data descriptor is a write.** Stage 1
findings 1, 45, 61, 66, 67, 71. Svelte finding 2 (its sketch is
`stage-2-svelte/spike.diff`), Vue finding 6, Solid finding 7, MobX finding 10,
Immer finding 3. The reports disagree about the rest, so measure three
variants:

- (a) other descriptors are forwarded to the target as today;
- (b) an accessor or read-only descriptor, and `setPrototypeOf`, throw a named
  error, while `Object.freeze(store)` keeps working (stage 1 findings 47, 48,
  49);
- (c) `Object.freeze(store)` throws too, which removes the read-only branch.

For each: lines, failing tests by class, and what a user loses. Include the
read that never returns (stage 1 finding 66) and say which variant removes it
and how.

**T4. `has` and `ownKeys` traps with a dependency on the set of keys.** Stage
1 findings 29, 30, 31, 32, 41. Vue finding 1 (sketch A is in
`stage-2-vue/ours-copy/src`), Solid finding 6, Svelte finding 4, MobX finding
10, which adds that a read of a missing key should record that the key was
missing. Do the live store fully. On snapshots the result depends on how
snapshot getters are installed (API question 3), which a later spike decides:
show what your traps do under today's enumerable own accessors, and say what
they need from that decision.

**T5. A delete that removes nothing is not a change.** Stage 1 finding 29.

**T6. Two small guards, if time allows.** A plain object from another realm is
treated as a plain object (Immer finding 6). A read of a property that was
frozen behind the store's back returns the raw value instead of throwing
(stage 1 finding 46, Svelte finding 7).

Then the combination you would recommend, with full measures. Say which
spikes conflict, which depend on each other, and which order stage 4 should
write them in.

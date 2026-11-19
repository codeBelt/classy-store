# Brief: spikes on getter memoization

- **Report:** `review/stage-3/spike-getters.md`
- **Scratch folder:** `<scratch>/stage-3-spike-getters/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

Getter memoization on the live store (`evaluateComputed`, `areDepsValid`,
`recordDep`, `recordComputedDep`, the dependency records in
`core/core.types.ts`) and on snapshots (`evaluateSnapshotGetter`,
`installMemoizedGetters` in `snapshot/snapshot.ts`). Stage 1 findings 3, 32
and 36 to 40. Read `review/stage-2/signals.md` and `review/stage-2/mobx.md`
findings 1 to 3 closely; the Signals report corrects MobX finding 3. The
Signals agent's sketches are in `stage-2-signals/run/spike-stamp`,
`spike-refresh`, `spike-one` and `spike-memo`, with its scripts beside them.
They ran against those scripts only. Your job is to run them against the
repository's suites and settle which design to take.

Another agent is spiking the proxy traps in the same file (`get`, `set`,
`defineProperty`, `deleteProperty`, `has`, `ownKeys`). Leave those alone,
except where a getter spike needs a line there.

## The spikes

**G1. A stamp on each cached getter.** The node's version when the entry was
last found valid, taken before the body runs. Signals finding 1, MobX finding
3 step 2. Check the one thing that report only reasoned about: that the stamp
is safe for a detached or suspended subtree.

**G2. Record each property once per run.** Signals finding 3.

**G3. How a nested getter is revalidated.** Signals finding 2. Compare three
designs on the same cases: today's; refresh and compare value plus node
version; and one kind of dependency, `{value, version}` keyed by property
(`spike-one`, the section "Could our three kinds of dependency become one?").
The Signals report measured a cost for the third: a write followed by a
getter read went from 206 to 300 nanoseconds. Measure it properly, and say
whether the simpler code is worth it.

**G4. A getter that throws.** Cache the error together with the dependencies
recorded before the throw, and never cache an error that recorded none. MobX
finding 2, Signals finding 4, stage 1 finding 36.

**G5. The snapshot layer.** The memo map that the first getter read
overwrites (stage 1 finding 37, Signals finding 6, `spike-memo`). A getter
cycle on a snapshot, which overflows the stack today (stage 1 finding 38,
Signals finding 5): give it the live layer's error.

**G6. A getter that reads outside its own node.** MobX finding 1 and stage 1
findings 36 and 40: another store, a static, a nested node read through a
local variable. Say what recording those reads would take, what it would
cost, and whether documenting the limit is the better answer.

**G7. A getter that writes.** Stage 1 finding 39, Signals finding 7. Say what
happens today on both layers and what the options are.

## Extra measures for every spike

Beside the common brief's measures:

- the getter rows of `bun run benchmark:core` on both engines;
- the diamond ladder: two getters per level, each reading both getters of the
  level below, clean read at depths 8, 16 and 20
  (`stage-2-signals/run/01-ladder.ts`; today the cost doubles per level);
- a getter over 1,000 rows that reads `this.rows[i]` in a loop, against one
  that reads `this.rows` once into a local;
- one getter over three fields: a clean read, a read after a write to another
  field, a read after a write to a field it reads
  (`stage-2-signals/run/10-single-getter.ts`).

Then the combination you would recommend, with full measures, and the order
stage 4 should write it in.

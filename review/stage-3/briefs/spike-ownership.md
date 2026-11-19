# Brief: spikes on ownership

- **Report:** `review/stage-3/spike-ownership.md`
- **Scratch folder:** `<scratch>/stage-3-spike-ownership/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

`packages/classy-store/src/core/ownership.ts` and the three `resumeScope()`
calls in `core/core.ts`: one node per object, weak links from a child to its
owners, a `FinalizationRegistry`, and suspend and resume for a detached
subtree. Stage 1 findings 25 to 28 and 66 to 69, and above all finding 72,
which says which parts of suspend and resume matter. Read
`review/stage-2/valtio.md` finding V1 closely: Valtio has none of this
machinery and gives the same answers in the ported cases but one. If
`review/stage-3/own-code.md` exists, read its part on `ownership.ts`.

## The spikes

**O1. Remove the pointer to a detached parent and the walk in
`resumeScope()`.** Stage 1 finding 72 says it adds nothing to correct
behaviour and causes findings 66 to 68. Show which tests fail and whether the
read that never returns (finding 66) is gone.

**O2. One mechanism, not two.** We have weak links and suspension. Try weak
links alone, with suspension and its corrections removed. Measure what Valtio
V1 could only reason about: the cost of a write to a row that has many dead
owners not yet collected, and whether a retained row still lets a replaced
list be collected. `tests/memory/heapSnapshot.test.ts` and the
`core.noWeakRef*`, `core.noFinalizationRegistry` and `core.ownerOrder` tests
pin today's behaviour.

**O3. What keeps a subscribed node alive.** Stage 2 found that a subscription
on a container that has left the store stops being called once the garbage
collector runs, if the caller kept only one of its rows (Valtio V1, port 4d).
Two answers: document that a subscription lasts while the caller holds the
store, the node or the unsubscribe function; or hold a node strongly while it
has a listener. Spike the second and measure it.

**O4. The smallest fix for the hang alone.** The one line stage 1 verified:
`internal.resumeScope();` as the first line of the `defineProperty` trap. Run
it against the suite, so the decision document can offer it if O1 is not
taken.

Then the design you would recommend for `ownership.ts`, with its line count
against today's 170, and full measures. Engines without `WeakRef` or
`FinalizationRegistry` are supported today: keep that, or say what it costs.

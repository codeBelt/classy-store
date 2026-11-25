# Brief: spikes on subscriber delivery and transactions

- **Report:** `review/stage-3/spike-delivery.md`
- **Scratch folder:** `<scratch>/stage-3-spike-delivery/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

## Subject

In `packages/classy-store/src/core/core.ts`: `notifyMutation`,
`settleTransaction`, `transactional`, `batch`, `deliver` and `subscribe`.
Stage 1 findings 18 to 24 and 43. Read MobX finding 5 and 4, Signals finding
8, Vue finding 9, Svelte findings 10 and 11, Legend-State findings 1 to 3,
and Zustand and Jotai finding 9.

## The spikes

**D1. One delivery queue.** A write made while subscribers are being called
is queued and delivered after the current round, a subscriber removed during
delivery is not called, a subscriber added during delivery hears the next
change and not the one in flight, and delivery stops after a fixed number of
rounds with an error that names the cause. MobX, Preact Signals, Vue and
Svelte all do this with a bound of 100. Cover both paths: `{sync: true}` and
the microtask.

**D2. Where a subscriber's error goes.** Today `deliver()` isolates each
subscriber and logs. Preact throws to the writer; Legend-State 3 runs every
subscriber and rethrows the first error. Set out the options with what each
does to the writer and to the other subscribers. A subscriber that returns a
rejected promise is stage 1 finding 23.

**D3. A setter is a transaction.** A class setter that writes two fields
notifies a synchronous subscriber twice (stage 1 finding 43, MobX finding 4,
Svelte finding 10).

**D4. `batch()` and promises.** `batch(async () => ...)` groups only the
writes before the first `await` and returns the promise (Legend-State
finding 3). Spike a type that refuses a function returning a promise, and a
runtime check. Say what a method that is `async` does today: its writes after
an `await` are outside the transaction (MobX finding 6), which is by design
but should be stated.

**D5. Should `subscribe()` stay batched by default (API question 1)?** No
spike. Set out what changes for a user under each default once D1 is in, with
the notification counts for these cases: two direct writes, a method that
writes two fields, `Object.assign(store, {a, b})`, an in-place `sort`, and a
write after an `await`.

Then the combination you would recommend, with full measures.

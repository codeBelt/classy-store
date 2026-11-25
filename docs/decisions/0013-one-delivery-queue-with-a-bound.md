# 0013. One delivery queue, with a bound

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Changes behaviour that 0.11 documents:** no

## Context

In 0.11 a write made inside a subscriber is delivered by a nested call:

- A synchronous subscriber that writes to the store it listens to recurses
  until the stack overflows. The `RangeError` goes to `console.error`, and
  the store keeps the writes.
- A batched subscriber that writes is served again in back-to-back
  microtasks with no bound. A timer that is already due waits until the
  writer stops; one that never stops hangs the event loop.
- A subscriber removed during delivery is still called once, after its
  unsubscribe function returned.
- A subscriber added after a write sometimes hears that write.
- After a re-entrant write, a subscriber registered after the writer is
  called twice with the same snapshot and never sees the state in between.

## Decision

- A write made while synchronous subscribers are being called is queued and
  delivered after the round that is running, and before the outermost write
  returns.
- A subscriber removed during delivery is not called. A subscriber added
  during delivery hears the next change, not the one in flight.
- One queue serves all stores.
- On the batched path, one microtask serves every round: a write made inside
  a batched subscriber is delivered to batched subscribers in that same
  microtask, after the round that is running.
- Delivery stops after 100 rounds. It then reports once, with the code
  `delivery-loop`, the store keeps the writes, and the subscribers that were
  waiting are called at the next write. The report goes where a subscriber's
  error goes (record 0014).
- **A subscriber hears of its own write**, once, as in MobX and Preact. A
  subscriber that corrects state has to stop writing once the state is
  right.
- **The first round reads the owners directly**, a variant that keeps a
  direct write with a synchronous subscriber as fast as in 0.11. The commit
  confirms on a quiet machine that the benchmark's `store.write.sync` stays
  inside the spread of 0.11 on both engines. If the variant does not achieve
  that, the plain queue is taken and the slowdown is stated in the
  reference.

## Alternatives considered

### A subscriber that does not hear of its own write

Not taken, and final for 1.0: the guarantee of delivery states the choice
above.

### A microtask of its own for each batched round

Not taken, and final for 1.0. It would differ from the synchronous rule.

### The plain queue without the direct first round

A direct write with a synchronous subscriber is then about 85 nanoseconds
slower on Bun and 30 on Node. A direct write while a component is mounted is
the most common write an application makes. The plain queue is the fallback
if the variant fails its condition.

## Consequences

- No stack overflow and no hung event loop when a subscriber writes. MobX,
  Preact Signals, Vue and Svelte reach the same design.
- An ordinary write gets faster, because every write takes one path: the
  write ratio goes from 2.69 to 2.21 on Bun and from 1.4 to 1.06 on Node.
- A synchronous subscriber of store A that writes store B makes B current at
  once, and B's subscribers hear a round later. Another subscriber of A in
  that round therefore reads the new B through the store and the old B
  through an adapter; in 0.11 it read the new B in both. The reference says
  that adapter values of another store may lag inside one delivery round.
- The order of calls changes, and what a removed or a late subscriber gets
  becomes guaranteed.
- 72 lines added, 36 removed. 16 unit tests changed: 13 fixes and 3
  incidental. Size: the queue 33 bytes, the bound and its message 75 to 130
  more with the message as first written, less with a code; the direct first
  round 30 bytes more. Records 0013 to 0015 together add +219 bytes to the
  main entry.
- After this change Vue, Angular and Svelte drop their `active` flags
  (record 0042).

# 0003. Suspension stays; the walk to a detached parent goes

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, simplification
- **Label:** Can follow 1.0: no documented behaviour changes
- **Changes documented behaviour:** no

## Context

When a subtree leaves the store and nothing observes it, the library
suspends it: each node saves its children's versions and drops its links.
Before 1.0, a suspended node also keeps a `detachedParent` pointer, and
`resumeScope()` walks those pointers up before a node resumes.

That walk can loop. The `defineProperty` trap detaches a child of a
suspended container without resuming it first; the child keeps a pointer to
a container that no longer lists it, and two such pointers can form a loop.
Before 1.0, this read never returns:

```ts
const store = createClassyStore({outer: {inner: {x: 1}}});
const outer = store.outer;
const inner = outer.inner;
delete store.outer;
Object.defineProperty(outer, 'inner', {writable: false, configurable: false});
snapshot(inner);
snapshot(inner);
inner.back = outer;
subscribe(inner, () => {})();
inner.x; // never returns
```

The same cause, in a milder form, makes a snapshot under a frozen, removed
container stale once, and lets a subscriber added right after the freeze
miss a write. Without `WeakRef` the pointer is a strong link, so a held row
keeps its removed list alive.

## Decision

Remove the `detachedParent` pointer and the walk in `resumeScope()`. Keep
suspend and resume. Each node already saves its children's versions when it
is suspended, so each can resume on its own when it is touched.

Left as it is:

- The order in which owners are notified is unspecified.
- A subscription on a container that has left the store lasts while the
  caller holds the store, the container or the unsubscribe function. The
  tutorial gains that sentence in this change.
- A raw object changed while it is out of the store shows its old content in
  the next snapshot. It is a case of "writes outside the proxy are not seen",
  which the docs already state.

The test of a runtime without `WeakRef`, which pinned the strong link,
changes with this decision. It asserts what the change makes true: with
`WeakRef` removed, a row that is held after its list was replaced no longer
keeps that list alive, and the row still reads, writes, notifies and
snapshots as a store of its own. Only "it works" is guaranteed in such a
runtime, so the memory half of the test is a change detector, and its file
says so.

## Alternatives considered

### Remove suspension as a whole

85 lines. Without it, a write to a row that outlived 2,000 replaced lists
costs 122,610 nanoseconds against 446, until the collector runs, and for as
long as anything keeps the old lists alive.

### Resume in the `defineProperty` trap

A one-line fix that removes the hang. It is contained in record 0002 and is
harmless beside this decision, but it leaves the walk that causes the hang.

### Hold a subscribed node strongly

It would turn a forgotten unsubscribe into a leak.

## Consequences

- The read above returns. Ten lines out, one in, 36 bytes smaller on the main
  entry, and the typecheck passes. 6 unit tests changed, all of them tests
  that pinned the defects. The prototype was run twice in separate checkouts
  with the same result.
- `resumeScope()` in `createClassyStore` becomes redundant and is removed in
  the same commit (record 0020).
- This lands first among the core changes, because records 0002 and 0012
  touch the same traps.
- Open again if a case is found where a node cannot resume correctly on its
  own.

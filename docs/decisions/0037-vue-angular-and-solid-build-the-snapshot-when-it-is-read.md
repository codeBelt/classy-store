# 0037. The Vue, Angular and Solid adapters build the snapshot when it is read

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** performance
- **Label:** Before 1.0 for Vue: the reference says the adapter returns a
  ref "backed by `shallowRef`", and it becomes a custom ref that
  `isShallow()` can tell apart. Can follow 1.0 for Angular and Solid
- **Changes documented behaviour:** yes

## Context

Before 1.0, every adapter takes
a snapshot inside its listener. Adapters
subscribe synchronously, so a loop of direct writes takes one snapshot per
write: 2,000 direct row writes followed by one read cost about 650
milliseconds. The reference says the Vue adapter returns a ref "backed by
`shallowRef`".

## Decision

In the Vue, Angular and Solid adapters the listener only marks the value as
changed, and the snapshot is taken at the next read. The Vue adapter returns
a custom ref, which `isShallow()` can tell apart from a `shallowRef`; the
reference sentence changes in the same commit.

React and Svelte cannot defer in this way, because their contracts hand the
value to the framework at once. For them the answer is `batch()`, which the
guides name.

## Alternatives considered

None was named for these three adapters.

## Consequences

- 2,000 direct row writes followed by one read go from about 650
  milliseconds to 2.4 in each of the three adapters.
- 34 to 44 bytes per entry. 1 unit test changed, incidental: `isShallow` on
  the Vue ref.
- The packed-app and browser suites of each framework were not run on the
  prototype. Each adapter change runs its framework's suite.
- The change is required before 1.0 for Vue, because it changes a documented
  return shape, and can follow 1.0 for Angular and Solid.

# 0015. A setter is a transaction

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug
- **Label:** Before 1.0: one sentence in the reference
- **Changes documented behaviour:** no

## Context

Before 1.0, a method and
an array method are transactions, and a setter is not:

```ts
class Range {
  min = 0;
  max = 0;
  set span([min, max]: [number, number]) {
    this.min = min;
    this.max = max;
  }
}
```

`store.span = [1, 2]` gives two synchronous notifications, and a subscriber
sees the half-applied state between them.

## Decision

A class setter is run as one transaction, like a method. A setter that
writes two fields notifies a synchronous subscriber once, when it returns.
The reference gets one sentence for it.

## Alternatives considered

None was named.

## Consequences

- A synchronous subscriber does not see a half-applied setter.
- 8 lines, 5 bytes (inside the +219 of records 0013 to 0015). 2 unit tests
  changed, both fixes.

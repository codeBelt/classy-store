# 0026. `persist` options stay as they are

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API
- **Label:** No change
- **Changes documented behaviour:** no

## Context

Several changes to the options of `persist` were weighed before 1.0:
make
`storage` optional with a default of `localStorage`, as Zustand and Jotai
do; merge `expireIn` and `clearOnExpire` into one option; add a switch to
pause saving and a flag for a write in flight.

## Decision

No option is renamed, removed or made optional. `storage` stays required.
`clearOnExpire` stays. One callback gains an argument: `onError` receives
the handle as its third (record 0021). A callback written for two arguments
still fits.

## Alternatives considered

### An optional `storage`

Making it optional later is an addition. A default of `localStorage` would
add a new silence where it is missing.

### Remove `clearOnExpire` and always clear an expired record

That was reasoned, not built, and it would delete data in two cases nobody
ran: a handle without `expireIn` reading a record another handle stamped,
and a device whose clock runs ahead on shared storage. A tidier option list
is not worth a deletion that was never tested.

### A pause switch and an in-flight flag

`pause()` and `resume()`, or an `isSaving` field in the status, can be added
later without breaking anyone.

## Consequences

- Nothing changes for a user beyond the third argument of `onError`.
- Open again with a test of the two expiry cases above, or when a user needs
  the switch or the flag.

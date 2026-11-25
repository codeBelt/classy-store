---
title: "Errors and warnings"
description: "Every code the library puts in an error or a report, what it means, and what to do."
---

Every error the library throws, and every report it logs, starts with the same
prefix and a code:

```text
@codebelt/classy-store [getter-cycle]: total → subtotal → total
```

The code is stable: a code is never renamed or reused, so a test or a log
filter can match on it. The text after the code gives the names from your
own code that the error is about, and it may change in any release. There is
no error subclass and no `code` property; match on the message.

## `getter-cycle`

Two or more getters read each other in a cycle, on the store or on a
snapshot. The text is the path, for example `total → subtotal → total`. The
getters in the cycle throw; every other getter keeps working.

Break the cycle: compute one of the values from fields, not from the other
getter.

## `not-a-store`

A function that needs a store was given something else: `snapshot()`,
`subscribe()`, `subscribeKey()`, `prepareStoreForHydration()`, a hook of
`createStoreHook()`, and every framework adapter, as well as `persist()`,
`withHistory()` and `devtools()`, which call `snapshot()` or `subscribe()`.

Pass the proxy that `createClassyStore()` returned, or a nested object read
from it, not the object you passed to `createClassyStore()` or a snapshot.

## `vue-no-scope`

The Vue `useClassyStore()` was called with no active effect scope, so its
listener could never be removed.

Call it inside `setup()`, or inside `effectScope().run()` and stop that scope
when you are done.

## `solid-no-owner`

The Solid `useClassyStore()` was called with no live owner, so its listener
could never be removed.

Call it inside a component, or inside `createRoot()`.

## `angular-no-context`

`injectClassyStore()` found an injection context that is already destroyed.

Call it in a constructor, a field initializer or a factory that runs in a
live injection context.

## `persist-disposed`

`save()`, `clear()` or `rehydrate()` was called on a `persist()` handle after
`dispose()`. The text is the handle's storage key. A disposed handle reads,
writes and schedules nothing.

Call `persist()` again for a new handle.

## What 1.0 does not catch

These mistakes are silent in 1.0. Each one is described in the guides; a
warning for some of them can arrive in a later 1.x release.

- A native `Map` or `Set` in a store. It is kept as a value, so a write
  through `Map.prototype.set` or `Set.prototype.add` notifies no one. Use
  `reactiveMap()` and `reactiveSet()`.
- A class instance nested in a store whose class has no
  `static [PROXYABLE] = true`. It is kept as a value, and a write to it
  notifies no one.
- A `Date` changed in place, for example with `setFullYear()`. Assign a new
  `Date` instead.
- A getter that reads another store or a static field. It is not
  recomputed when that value changes. Hold the other store as a field.
- A result of a getter that is changed in place. The getter's cached result
  is not frozen, and the change is not seen. Return a new value instead.
- A named property on an array, such as `list.label = 'x'`. It stays on the
  live array and is left out of every snapshot.
- An own-property check inside a getter, such as `Object.hasOwn(this, key)`.
  It is not tracked, so the getter does not see a key that is added later.
  Use `key in this`.
- A prototype changed after its first read through a store.

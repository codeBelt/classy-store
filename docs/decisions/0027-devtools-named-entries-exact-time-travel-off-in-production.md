# 0027. `devtools` sends named entries, travels in time exactly, and is off in production

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** public API, bug
- **Label:** Before 1.0
- **Changes documented behaviour:** yes

## Context

Before 1.0:

- Every entry `devtools` sends is named `STORE_UPDATE`, which makes the
  tool's list useless.
- A jump assigns each key of the parsed state in turn. Unknown fields are
  added, missing ones are never deleted, a setter-only accessor is called, a
  `Date` comes back as a string, and a synchronous subscriber is notified
  once per field.
- `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are ignored.
- `enabled` defaults to `true` everywhere. DevTools on a production page
  hands the whole state to any extension that asks, and a default cannot be
  changed after 1.0.

## Decision

- **Entries.** `devtools` subscribes on the synchronous channel. A store
  method sends one entry, named after the method, when the outermost call
  returns, with one snapshot. Direct writes outside a method send one
  `STORE_UPDATE` entry per task, from a microtask. So the synchronous channel
  costs one snapshot per outermost method and never one per direct write.
- **How the name reaches `devtools`: a hook.** The core holds one place for a
  function, empty unless `devtools` is connected, and nothing else.
  `devtools()` fills it while at least one connection is open and empties it
  when the last one is disposed. A method call tests it; when it is empty the
  call runs the same code as before 1.0. The naming itself lives in
  `devtools.ts`.
- **The name is the key.** The key a method was first read under is handed
  to that function with the call, for a class method and a method held in a
  field alike. The function's own `name` is not used: it is empty for an
  arrow function assigned in a constructor. There is one method per object
  and function (record 0001), so after `store.b = store.a` a call of
  `store.b()` is named `a`.
- **Time travel.** A jump replaces the state exactly, in one transaction,
  without calling setters, through the restore of record 0030. A jump to an
  entry this session sent restores the snapshot that was sent, so a `Date`
  stays a `Date`; a jump the extension sends as JSON restores data.
- **Messages.** `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE` are handled.
  A jump that the shared restore refuses, because the root fails its check
  (record 0030), writes nothing: `devtools` catches the `restore-locked`
  error and logs it with `console.error`, and the extension's panel shows
  the entry it jumped to until the next entry arrives.
- **Options.** `devtools(store, options)` takes `name` and `enabled`, as
  before 1.0, and five options of the extension that the build passes to its
  `connect()`: `maxAge`, `trace`, `traceLimit`, `actionsDenylist` and
  `actionsAllowlist`. `maxAge`, 50 by default as in the extension, also
  bounds how many sent snapshots this session keeps for exact time travel.
  The list is named, not an index signature, so a misspelt option is a type
  error. Their bytes are inside the figures of record 0004.
- **`enabled` defaults to on only where `NODE_ENV` can be read and is not
  `production`.** It reads the environment the way record 0036 does. Where
  there is no `process` to read, the default is off: a bundle in which
  nothing replaced the expression must not hand every state to an extension
  because of it. `enabled: true` turns it on anywhere. The guide names the
  builds in which the default is off, and says that the extension receives
  every state, so a store with secrets passes `enabled: false`.
- **Computed values.** A snapshot no longer lists class getters (record
  0043), so `devtools` adds the values of the root store's class getters to
  what it sends, each read guarded. A getter of an object literal that throws
  still loses the entry.

## Alternatives considered

### A naming hook that runs on every method call

The first form. It ran for every user, `devtools()` or not, and cost 5 to 6%
of a method call on Node, and 20 bytes on the main entry.

### A "slot" in the core with a counter and the naming

It keeps a counter and the naming in the core. The hook form keeps the core
to one empty place and costs 12 bytes on the main entry.

### One snapshot per direct write on the synchronous channel

It would make every direct write pay for a snapshot while `devtools` is
connected.

### The getter values of nested objects in what `devtools` sends

It needs a walk and a copy of every object on the way for every entry. It
can be added in a 1.x release.

### On by default in every environment

Not taken, and final for 1.0, as every default is.

## Consequences

- With the hook, a method call without `devtools` is inside the spread of
  the code before this change on both engines. The main entry carries 12 bytes for it.
- While `devtools` is connected, a method call allocates one closure.
- An application that loads `./utils` twice, once as ESM and once as
  CommonJS, and connects `devtools` from both, has one copy's names fall back
  to `STORE_UPDATE`. That was read from the code, not run.
- Size on `./utils`: 403 bytes for the entries, the messages and the jump,
  and 452 with the hook form. Record 0004 counts the naming moved out of the
  core as +57 on `./utils`. The getter values add 95.
- 1,341 unit tests passed with the hook. `store.method` was timed in five
  rounds on each engine. The prototype read the function's own `name`;
  passing the key was not built, and an entry for an arrow function written
  to a new key and for one assigned in a constructor is tested first.
- Before 1.0 there are no tests for `devtools`; they are written first.

- Not verified: the entry ids the Redux DevTools extension sends back, and
  the real extension at all.

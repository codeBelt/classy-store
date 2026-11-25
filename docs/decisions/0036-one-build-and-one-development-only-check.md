# 0036. One build, and one development-only check in 1.0

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** diagnostics
- **Label:** Before 1.0 for the guard's rule and the default of `devtools`;
  the check can follow 1.0
- **Changes documented behaviour:** no

## Context

Several silent failures stay in 1.0. The first is an arrow-function method
that writes to the raw instance. The base class of record 0011 removes it
only for a class that is changed to extend it; `createClassyStore(new X())`
stays documented, and a class that extends something else has no other way.
The same failure comes from a constructor that starts a timer, and from a
write through the raw object.

A development-only check must cost production nothing, and must not break
the cost limits of `CONSTRAINTS.md`.

## Decision

- 1.0 ships one build. Export conditions are not used.
- It has one check that runs in development only: **the report of a lost
  write.** When a snapshot is asked for and a field of the raw object has
  changed without a write through the store, the library logs it once, with
  the code `lost-write` and the name of the field. The comparison runs at
  most once per task for a store, however often its snapshot is asked for in
  that task.
- **The cost limits come first.** The core benchmark loads the built file as
  it is, with `NODE_ENV` not set, so it measures the development path, and it
  keeps doing so. The limits have to hold there with the check in.
- **The benchmark has to see it.** Each sample of the benchmark is one loop
  in one task, so a check that runs once per task costs a sample one
  comparison. So a row is first added to the benchmark that takes one cached
  snapshot per task of the 1,000-row store, and it is recorded without the
  check. The check lands only if that row with the check in stays below the
  benchmark's `snapshot.afterWrite` for the same store, on both engines. The
  figure goes into this record as the stated cost of the development path.
  If the check cannot meet that, it does not ship in 1.0; it is a report and
  can arrive in any release.
- **The row awaits between two snapshots.** It awaits a resolved promise
  between two snapshots, so each snapshot is taken after the microtasks
  queued before it have run, and the await is part of its time. "Once per
  task" therefore means: the check marks the store as checked, and a
  microtask it queues clears the mark.
- **The guard form.** A development-only check is guarded by an inline read
  of `process.env.NODE_ENV` at its call site, after a test that is cheap and
  almost always false, and behind `typeof process`. That form becomes a floor
  rule of `CONSTRAINTS.md`, held by a test that bundles the built file for
  production and asserts that no development text and no `console.warn` is
  left in it. The default of `devtools({enabled})` reads the environment the
  same way (record 0027).
- **How the test knows development text.** A development-only report is
  written with `console.warn`, and nothing else in the library calls
  `console.warn`. Its code is listed in
  `packages/classy-store/tests/size/developmentOnly.json`, which is empty
  until the check of this record lands. `bun run size` already bundles every
  entry for production, with `NODE_ENV` set to `production`; it fails when
  such a bundle holds `console.warn` or a listed code. A unit test bundles a
  fixture written in the guard form, once for production and once for
  development, and asserts that its marker text and its `console.warn` are
  gone from the first and present in the second. So the form is held from
  the first commit, before any check exists, and the floor rule names both.
- **What 1.0 still does not catch** is listed on the page of error codes
  (record 0035): a native `Map` or `Set` in a store, an unmarked nested class
  instance, a `Date` changed in place, a getter that reads another store or a
  static, a result of a getter that is mutated, a named property on an
  array, an own-property check inside a getter, and a prototype changed after
  its first read through a store.
- Other warnings follow in a 1.x release.

## Alternatives considered

### Export conditions (`development` and `production`)

Plain Node, `bun test` and an unminified bundle would load the production
build in silence, the published files double, and `check:package` does not
check the second branch.

### The check on every cached snapshot

As first built, the check compares the fields every time a cached snapshot
is handed out. That is eleven to thirteen times dearer and would put the
cached-snapshot ratio far above its limit on both engines.

### The check always on

It is 168 to 309 bytes. Behind the guard it costs production a few bytes.

### Four more development warnings

Five development warnings were built. The fifth, the report of a lost
write, ships in the better form described above. The other four are not
ready: a warning that fires for correct code and cannot be silenced is worse
than none. The one for an unmarked class instance fires for seven kinds of
object that are no mistake, and one for a write after an `await` would fire
for the ordinary `async` method.

### A module-level constant for the environment

It leaked 218 bytes into the production bundle, where an inline read cost 6.

## Consequences

- The check found six of seven lost writes in a prototype and reported
  nothing that was not one.
- An inline read on the path of a write cost 184 nanoseconds on unbundled
  Node, which is why the guard reads the environment after a cheap test.
- The once-per-task form was not built. The check was measured always on,
  not behind the guard; it is measured there first.
- An application takes about one snapshot per store per task and pays for
  the comparison each time in development.

## Measured cost of the development path

To be filled in when the check lands.

| Commit | Row | Engine | Without the check | With the check | `snapshot.afterWrite` |
| ------ | --- | ------ | ----------------: | -------------: | --------------------: |

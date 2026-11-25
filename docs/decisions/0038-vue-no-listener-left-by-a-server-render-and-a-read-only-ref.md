# 0038. Vue: no listener is left by a server render, and the ref is read-only

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** bug, public API
- **Label:** Before 1.0, for the documented return type
- **Changes documented behaviour:** yes

## Context

- Vue does not dispose component scopes during a server render, so a store
  that outlives the request gains one listener per render: 1, 2, 3 after
  three renders.
- The Vue adapter returns a writable ref. `state.value = …` compiles, but a
  snapshot is frozen, so a writable ref promises something the value cannot
  do. The Angular adapter already returns a read-only signal.

## Decision

- On the server the Vue adapter subscribes to nothing and reads the store at
  every read. The adapter is on the server when it runs inside a component
  and `inject(ssrContextKey, null)` is set, which is so exactly inside
  `renderToString`. The check for an active effect scope from before 1.0
  stays, and comes first.
- The returned ref is typed `Readonly<Ref<Snapshot<T>>>`, and a write to it
  throws a `TypeError` with the code `vue-readonly` (record 0035).
- This lands in one change with the Vue part of record 0037.

## Alternatives considered

### Subscribe in `onMounted`

It removes the leak and breaks something else: a store written in
`onServerPrefetch`, Vue's own way to load data on the server, then renders
its old value. Reading at the read removes the leak and keeps that write.

### A setter that does nothing

A silent failure for a template or a JavaScript caller. A throw is the loud
form.

## Consequences

- 0 listeners after three server renders, and the `onServerPrefetch` write
  still renders. The prototype told the server by the same test of
  `ssrContextKey`.

- The documented return type changes.
- The type was not compiled against Vue 3.2.0, the floor of the peer range;
  that is done first. The throwing setter was not built in a prototype.

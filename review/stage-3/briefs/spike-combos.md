# Brief: three combinations that were decided and never built

- **Report:** `review/stage-3/spike-combos.md`
- **Scratch folder:** `<scratch>/stage-3-spike-combos/`
- **Skill to load first:** `mattpocock-skills:prototype`
- **Spikes:** yes, as the common brief describes.

`review/stage-3/adversarial-whole.md` found three places where
`review/stage-3-decisions.md` relies on two spikes that were never in one
build. Build each and say what happens. Work in this order.

## K1. Undo on a store with a cycle (objection 1)

Decision 44 lets a snapshot keep a cycle (`spike-snapshots.md`, N3,
`n3-cycles.patch`). Decision 30 restores a nested object in place
(`spike-classes-2.md`, V4, `v4-in-place.patch`, which sits on the `devtools`
and `history` patches P7 and P8 of `persist-devtools.md`). The reviewer's
model of V4's two functions never returns on a cycle.

Apply both to one worktree. Record a store `{n: 1, self: store}`, write
`n = 2`, undo. Then two objects that refer to each other, a list whose rows
point back to the list, and a DevTools jump of the same. If it does not
return, add what stops it (a set of nodes already restored in one call is
the likely form) and show the same cases afterwards, with the 1,000-row undo
timing of V4 before and after, and the bytes.

## K2. The method name for `devtools`, without a cost for everyone (objection 17)

P7 takes the name of the method that wrote through a hook in
`transactional()`. It costs 20 bytes in the main entry and, on Node, 3 to 7%
on every method call, for every user, whether `devtools()` is called or not.

Spike a form where the main entry holds only a slot that `devtools()` fills
while a connection exists, and the method path does nothing more than test
that slot. Measure `store.method` on both engines with no `devtools`, on the
unmodified build, on P7 as it is, and on your form, back to back, five runs
each. Say what the slot costs in bytes, and whether any form keeps
`store.method` inside the spread of the unmodified build. If none does, say
what `devtools` could name its entries by without the core's help.

## K3. What `devtools` sends once snapshots carry no getter values (objection 18)

Under decision 43 (`spike-snapshots.md`, N2, form A) a snapshot no longer
lists class getters, so the DevTools panel loses the computed values the
DevTools tutorial promises. Decision 43 says `devtools` adds them back. That
was never built.

On N2 form A with P7: make `devtools` add the values of the root store's own
class getters to what it sends, each read guarded so that a getter that
throws shows its error text and the entry is still sent. Not the getters of
nested instances. Show what the panel payload looks like for a class with
three fields and two getters, with one getter that throws, and for a store
with a cycle (with N3 applied). Give the bytes on `./utils`.

## What the report ends with

For each of K1 to K3: what was built, the patch, the output before and
after, the bytes, and what the decision document should say.

# Adversarial brief: the core

- **Report:** `review/stage-3/adversarial-core.md`
- **Scratch folder:** `<scratch>/stage-3-adversarial-core/`

**Your decisions:** 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, and the snapshot
decisions 43, 44, 45 and 46.

**Their evidence:** `review/stage-3/own-code.md`, `spike-traps.md`,
`spike-getters.md`, `spike-classes.md`, `spike-classes-2.md`,
`spike-snapshots.md`. `review/stage-3/pinned.md` disagrees with decision 1.

Look hardest at these, because each was decided against a report or changed
during the writing:

- Decision 1 takes the "strict" rule against `pinned.md`, and decision 11
  then makes an exception to it for a base class.
- Decision 10 first took a throw for every write made while a getter runs
  and then dropped it. Is what is left coherent on both layers?
- Decision 11 ships a new base class in 1.0. Is the rule "an arrow function
  that creates a field is a method" one a user can predict?
- Decisions 43 and 7 together change what `this` is inside a snapshot
  getter and which keys a snapshot lists. What breaks in `persist`,
  `withHistory`, `devtools`, `shallowEqual`, `cloneSnapshot` and the React
  tracking path?
- The patches behind decisions 1, 2, 5, 6, 7, 10, 12, 43 and 11 all edit the
  same traps. Each was measured against the unmodified source, mostly alone.
  Is there a pair that cannot both hold?

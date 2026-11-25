# Brief: spikes on classes

- **Report:** `review/stage-3/spike-classes.md`
- **Scratch folder:** `<scratch>/stage-3-spike-classes/`
- **Skill to load first:** `mattpocock-skills:prototype`, then
  `api-and-interface-design`
- **Spikes:** yes, as the common brief describes.

## Subject

API questions 4 and 6 in `REVIEW_PLAN.md`: arrow-function methods, `#private`
fields, and whether a nested class instance is wrapped by default. Read
`review/stage-3/spike-traps.md` first. Its T3 patch (a data descriptor given
to `defineProperty` is a write) should be in
`stage-3-spike-traps/patches/`; apply it to your worktree as the base for C1,
and say so. If it is not there, write the smallest version yourself.

## The spikes

**C1. A base class whose constructor returns the store.** Three stage 2
agents showed that this makes an arrow-function method notify on the library
as it is (MobX script 10, Vue port 8, Svelte finding 1), because the derived
class's fields are then installed on the proxy. Build it properly: the name
and entry point it would have, what `createClassyStore(new Sub())` does when
`Sub` extends it, subclasses, `useLocalStore`, `persist`, `devtools`,
`withHistory`, types (`Snapshot<T>` of such a class), and the first snapshot.
List what still does not work.

**C2. `#private` fields.** With and without the base class: reads, writes,
getters over private state, methods, and snapshots. Stage 2 says a `#private`
field can be readable on the live store with the base class but can never be
state, because a snapshot is a new object. Confirm, and write the sentence
the docs should carry.

**C3. A nested class instance without `PROXYABLE`.** Today a method called on
one changes state and notifies no one, and the snapshot keeps its identity
(stage 2 report, defect 1). Four libraries wrap by default and three do not.
Spike both: (a) keep opt-in and detect the case, saying where the check would
live and what it costs without a development build; (b) wrap by default with
an opt-out marker kept outside the object, and run the suite to see what
breaks, including a class with `#private` fields and platform objects such as
`Date`, `URL`, typed arrays and DOM nodes.

**C4. Detecting an arrow-function method.** If C1 is not taken, or for classes
that do not extend the base: can a field holding an arrow function be told
from other functions cheaply enough to warn about (MobX finding 8)?

Then your recommendation for questions 4 and 6, with the public API it adds.

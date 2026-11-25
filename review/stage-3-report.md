# Stage 3 report: design review

**Draft.** Written by the agent that ran stage 3, before the spec, the
decision records and the task list were checked. Two things are still to
fill in: the date the stage ended, and the number of tasks. Check every
figure against `review/stage-3-decisions.md` before this stops being a
draft.

Stage 3 of the pre-1.0 review of `@codebelt/classy-store`. It ran from
2026-11-19 to (date to fill in), with a pause from 2026-11-19 to 2026-11-24 at the
owner's request. No library source was changed. This report says what the
stage produced, what it decided, and what stage 4 has to know before it
starts.

## Summary

| Question                    | Answer                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What was decided?           | 46 decisions, in `review/stage-3-decisions.md`. 31 change the public API or documented behaviour in whole or in part and must land before 1.0; 9 can follow 1.0; 5 keep things as they are; 1 is the documentation                                             |
| Who decided?                | The agent running the plan. The owner handed the decisions over on 2026-11-19, except merging into `main` and releasing                                                                                                                                        |
| What is it based on?        | 19 reports of spikes and of our own code under `review/stage-3/`, each with its patches and scripts in an appendix, on top of the 11 reports of stage 2                                                                                                        |
| Was it challenged?          | Three times, by agents that took no part in writing it. Round 1: 58 objections. Round 2: 30. Round 3: 17. Every objection is answered in the document, in a table per round. Two decisions were made after the last round and have not been read by a reviewer |
| What does 1.0 guarantee?    | Twelve rules, and a list of what stays unspecified, in the decision document and in `review/spec.md`                                                                                                                                                           |
| What does it cost in size?  | The main entry goes from 3,661 bytes to about 5,375, 47% more. `./utils` adds about 4,216 where it adds 2,686 today. The ceilings are 5,575 and 4,350                                                                                                          |
| What does it cost in speed? | The four cost ratios of `CONSTRAINTS.md` held in every combination that was built. A field read gets faster: 2.7 times on Bun, a fifth on Node                                                                                                                 |
| What was not verified?      | The whole set was never built as one. "What stage 4 has to check first" below lists the rest                                                                                                                                                                   |
| What comes next?            | Stage 4, from `review/stage-4-tasks.md`: (number to fill in) tasks in twelve steps, one change per commit, test first                                                                                                                                          |

## What the stage produced

| Step of the plan                     | Result                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Merge the stage 2 reports         | `review/stage-3/merged.md`: 77 distinct issues, 29 contradictions between reports, the order the issues depend on each other                                                                                        |
| 2. Review our own code               | `own-code.md`: 101 single deletions run against the suite, 10 dead lines, the ownership patch that removes a hang                                                                                                   |
| 3. Spike what reading cannot settle  | Ten reports in two waves (traps, getters, delivery, pinned behaviour, `persist` and `devtools`, a development build, adapters and collections, snapshots, classes twice), and seven more that the reviews asked for |
| 4 and 5. The decision document       | `review/stage-3-decisions.md`: the decisions, the guarantees, the proposals not taken, every merged issue mapped to a decision, the order for stage 4                                                               |
| 6. Decide, and an adversarial review | Three rounds, six reports: `adversarial-whole.md`, `adversarial-core.md`, `adversarial-edges.md`, `adversarial-2-core.md`, `adversarial-2-whole.md`, `adversarial-3.md`                                             |
| 7. Spec, decision records, task list | `review/spec.md`, `docs/decisions/` (46 records and an index), `review/stage-4-tasks.md`                                                                                                                            |

## The decisions that shape 1.0

The decision document has all 46. These are the ones a user of the library
will notice.

- **Which function is a method (decision 1).** A method of a class, as
  today. And a function held in a field, when it is read through the store:
  an arrow function, a shorthand method, a function written with
  `function`. The object and its snapshots keep the function as it was
  written. A class and anything in a list are handed out as they are.
- **A base class, `ClassyStore` (decision 11).** A class that extends it is a
  store from its first line, so arrow-function methods work. The silent
  failure the docs could only warn about is gone for such a class.
- **Subscriber delivery (decisions 13 to 16).** One queue with a bound, so a
  subscriber that writes can no longer overflow the stack or hang the event
  loop. A subscriber's error never reaches the code that wrote. `batch()`
  refuses an `async` function.
- **Getters (decisions 7, 10 and 12).** Five getter defects go. A getter that
  uses `in` or `Object.keys(this)` is no longer stale. A getter that writes
  to its own store throws, on the store and on a snapshot.
- **Snapshots (decisions 43 to 45).** A class getter is no longer an own key
  of every snapshot, so a spread or `JSON.stringify` of a snapshot carries
  data only. A store that refers to itself can be read. Tuples stay tuples
  in the types.
- **Lists (decision 6).** `includes()` and `indexOf()` find the object the
  caller holds.
- **`persist` (decisions 19 to 26).** A synchronous storage is restored
  before `persist()` returns. A handle writes only after it has read, so
  with `skipHydration` nothing is saved before `rehydrate()`. Nothing it
  cannot use is skipped in silence. A record from a newer version, or one
  that could not be migrated, is never written over. A restore is all or
  nothing. `onError` receives the handle.
- **`devtools` and history (decisions 27 to 30).** Entries are named after
  the method that wrote. Time travel is exact. Undo changes a nested object
  in place, so a row the caller holds stays the row in the store.
- **Errors (decisions 35 and 36).** Every error has a stable code. One build,
  with one development-only check: the report of a write that went to the
  raw object.

## What the reviews changed

The decisions that a review reversed or replaced, not only reworded:

- **The rule for functions changed three times.** The first draft made only
  a function on the prototype chain a method; round 1 showed that a method
  in an object literal then loses its transaction in silence. The second
  form wrote the store's wrapper into the object; round 2 showed that a
  store made from a copy then runs the old store's methods, and that a
  callback on a snapshot loses its caller's `this`. The third form left the
  object alone and handed out every function with a `prototype` as data;
  round 3 showed that a method written with `function` then loses its
  binding. The form taken treats only a class as data.
- **Two decisions that were spiked apart broke together.** With a snapshot
  that keeps a cycle, an undo overflowed the stack. With a container frozen
  through the store, an undo failed part-way. The restore now enters each
  object once and replaces a container it cannot write.
- **`persist` could have destroyed data, and each round found another way.**
  Writing a migrated record back at once would have let an older build
  replace a newer record as it loads. Replacing every refused record at the
  next save would have turned one bad `migrate` into lost data. A handle
  with `skipHydration` wrote before it read. The advice to call `clear()`
  from `onError` could not work. After the third round the whole rule set
  was built once and run through 33 paths. Removing `clearOnExpire` was
  never spiked and is dropped.
- **The naming of `devtools` entries** cost every method call 5 to 6% on
  Node. It moved behind a hook that `devtools` fills only while connected.
- **The table that speeds up reads** cached a getter's body, and then grew
  without bound with keys that do not exist. The form taken does neither.
- **The list searches** gave wrong answers on a list of saved snapshots.
- **A getter that wrote to its own store** worked on the store and failed in
  every component, and on a snapshot could still write the live store. It
  now throws by every path.
- **The size ceilings** were not enforced by anything, and three were below
  their own estimates. Stage 4 starts with the tooling, and each ceiling
  follows one stated rule.
- **The order for stage 4** put the base class before the restore it needs,
  removed dead code last, and wrote the page of error codes after the
  messages. All three are corrected.
- **The release workflow** is not split before 1.0: the 1.0 publish would
  have been the first run of an untested job.

## What stage 4 has to check first

Each of these is a statement the decision document makes from a part, not
from a whole, or from reading.

- **The set was never built as one.** Sizes are sums of parts with a ceiling
  above them. The largest combination built is five core changes, and it came
  out 21 bytes under its sum.
- **Creating a store is 11 to 18% slower on Bun** with the trap changes
  together. The cause was not found; raw values on write alone does not show
  it.
- **Two decisions were made after the last review**: the fourth form of the
  rule for functions, and the `persist` rules as built. Both were built and
  run. No reviewer has read them.
- **The getter changes were never built on the table per prototype**, and the
  throw for a getter that writes was never built on the rule for functions
  or on the new snapshot layer.
- **Three small parts of the `persist` rules** are not in their build: a
  record nested too deep is replaced, a removal in another tab lets a
  handle write again, and the expiry stamp is for a finite `expireIn` only.
  24 tests that use `skipHydration` as a set-up have to call `rehydrate()`
  first.
- **The lost-write check** was measured on every read, where it breaks the
  cost limits. The once-per-task form was not built. It ships only if a new
  benchmark row, one snapshot per task, stays below the cost of a snapshot
  after a write.
- **`withHistory` and a function in a field** (decision 29) was reasoned;
  only the write-back was run.
- **The key handed to the `devtools` naming hook** was not built.
- **The real Redux DevTools extension was never run**: the ids it sends back,
  a cyclic state, an entry whose getter threw.
- **The browser, framework and mutation suites** ran on no spike.

## How the work was done

- One orchestrating agent on Fable, which merged, decided and wrote the
  decision document, and helper agents for the spikes, the reviews and the
  three documents of step 7. From 2026-11-24 every helper ran on Opus, at the
  owner's request, after the weekly Fable limit had stopped the work. On
  2026-11-25, after the decisions were final, the owner moved the
  orchestration to a session on Opus 5.5.
- Every spike ran in a throwaway worktree in the scratchpad, at commit
  `57404c3`. No spike code is on the branch. Every patch and script is in the
  appendix of its report, and stage 4 writes each change again, test first.
- A helper agent could create one file in the repository, its own report.
- Timings were taken on a machine that other agents were using. A difference
  is reported only where the ranges of two builds do not touch.

## Verified and not verified

- **Run by the orchestrating agent itself:** the ownership patch and the
  dead-code patch (tests, typecheck, size, timings); the timings of the trap
  combination, of raw values on write, of the table per prototype and of the
  `activeTracker()` line, each between two runs of the unmodified source; the
  benchmark of the getter combination on Node; an undo after an object moved
  to another store.
- **Run by a helper agent and read by the orchestrating agent:** everything
  else the decision document cites as run.
- **A second opinion from another model** was offered to the owner and not
  taken up. All three rounds of review used Claude agents with no knowledge
  of the work, and a reviewer of the same kind can share the author's blind
  spots.

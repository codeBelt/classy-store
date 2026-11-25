# 0004. The size budgets move once, to a ceiling set for the whole set of 1.0 changes

- **Status:** Accepted
- **Date:** 2026-11-25
- **Kind:** constraint
- **Changes behaviour that 0.11 documents:** no

## Context

`CONSTRAINTS.md` holds a gzipped size budget for each entry point. Each
budget was the measured size of 0.11 plus two to three percent: room for a
fix of a few lines, not for a feature. The main entry measured 3,661 bytes
against a budget of 3,750.

The changes decided for 1.0 in records 0001 to 0046 do not fit those
budgets, and no subset worth shipping does. The floor guard
(`bun run check:floor`) read only `CONSTRAINTS.md`, saw one difference for
the whole branch, and left its own file out of its scope. One decision
record anywhere on the branch would have switched it off for every later
change.

This record is the one `CONSTRAINTS.md` points to for every size budget.

## Decision

Each budget gets a **ceiling**, set here once for the whole set of changes.

| Entry                 |  0.11 | Budget of 0.11 | Estimate | Ceiling | What moves it                                                    |
| --------------------- | ----: | -------------: | -------: | ------: | ---------------------------------------------------------------- |
| `.` (the main entry)  | 3,661 |          3,750 |    5,375 |   5,575 | The first table below                                            |
| `./utils` adds        | 2,686 |          2,750 |    4,216 |   4,350 | The second table below                                           |
| `./collections` adds  |   727 |            750 |      911 |     950 | The snapshot index, the membership rule, the mutator check       |
| `./react` adds        | 1,662 |          1,700 |    1,693 |   1,750 | The guard for a cyclic snapshot                                  |
| `./vue` adds          |   280 |            300 |      369 |     400 | The read-time ref, the server path, the setter that throws       |
| `./angular` adds      |   271 |            300 |      381 |     425 | The read-time signal, `untracked()`, the injector, its own check |
| `./solid` adds        |   312 |            335 |      346 |     375 | The read-time accessor                                           |
| `./svelte` adds       |   182 |            200 |      182 |     200 | Nothing                                                          |
| `./react/server` adds |   153 |            175 |      153 |     175 | Nothing                                                          |

All figures are gzipped bytes. An entry other than the main one is measured
together with the main entry and held to what it adds.

**How a ceiling is set.** The estimate, plus an allowance for what was
decided and never built, plus the 2% every budget carries, rounded up to the
next 25 bytes. The allowances: 80 bytes on the main entry, because two built
combinations came out above the sum of their parts; 30 on `./utils` for
three parts of records 0021 and 0024 that no prototype holds; 20 on `./vue`
for the setter that throws; 30 on `./angular` for its own context check.

**The main entry, change by change.**

| Change                                                                | Record       |  Bytes |
| --------------------------------------------------------------------- | ------------ | -----: |
| The rule for functions                                                | 0001         |   +228 |
| `defineProperty` as a write                                           | 0002         |    +49 |
| The walk to a detached parent removed                                 | 0003         |    −36 |
| Raw values on write, and a child kept when its container is frozen    | 0005         |   +104 |
| Searches that find the object the caller holds                        | 0006         |   +168 |
| `has` and `ownKeys` traps, a missing property as a value              | 0007         |   +156 |
| A delete that removes nothing                                         | 0008         |    +11 |
| A plain object from another realm                                     | 0009         |    +81 |
| Getters: one kind of dependency, errors, a getter that writes         | 0010         |   +281 |
| The base class                                                        | 0011         |    +13 |
| A table per prototype in place of a descriptor lookup                 | 0012         |   +180 |
| The delivery queue with its bound, setters, the rejection handler     | 0013 to 0015 |   +219 |
| The check for an `async` function in `batch()`                        | 0016         |    +50 |
| Dead lines removed                                                    | 0020         |    −32 |
| The hook through which `devtools` names a method                      | 0027         |    +12 |
| Class getters on a derived prototype, and `this` in a snapshot getter | 0043         |   +239 |
| A snapshot keeps a cycle                                              | 0044         |     −9 |
| Sum                                                                   |              | +1,714 |

Measured on top of another change, not alone: record 0001 (on the strict
rule, record 0002 and the base class; the row is the three together, 3,951
bytes, less the other two), the later parts of records 0005, 0006, 0010 and
0012 (each on the part before it), and record 0027 (on the first form of its
entries). Every other row is one change measured alone against 0.11. The sum
puts the main entry near 5,375 bytes, 47% above 0.11. The messages were
measured as the prototypes wrote them; the codes of record 0035 shorten
them, by about 100 bytes for the first set and an unmeasured amount for the
rest.

**What `./utils` adds, change by change.**

| Change                                                           | Record             |  Bytes |
| ---------------------------------------------------------------- | ------------------ | -----: |
| `persist`, `history` and `devtools` as one build                 | 0019 to 0025, 0027 |   +710 |
| The `persist` rules of records 0021 to 0024, in their final form | 0021 to 0024       |   +245 |
| The naming moved out of the core into `devtools.ts`              | 0027               |    +57 |
| The root store's getter values in what `devtools` sends          | 0027, 0043         |    +95 |
| Restore in place                                                 | 0030               |   +113 |
| Each object entered once per restore                             | 0030               |    +16 |
| A container that would refuse the restore is replaced            | 0030               |   +211 |
| `cloneSnapshot` made safe for a cycle                            | 0044               |    +21 |
| `subscribeKey` without a snapshot of the whole store             | 0031               |    +62 |
| Sum                                                              |                    | +1,530 |

The sum is 4,216 bytes. The first row is the first combined build of the
`persist`, `history` and `devtools` changes; the second is what the rules of
records 0021 to 0024 add to it in their final form, without a write-back
after a migration. Three small parts of those records are in neither build,
and the ceiling has 30 bytes for them.

**How a budget moves, and what enforces it.**

- The first commit of the work is tooling only. `budgets.json` gets a
  `ceiling` beside each budget, and the size script fails when a budget is
  above its ceiling or a measured size is above its budget.
- **A ceiling does not move with the work.** The floor guard refuses a
  commit that changes an existing ceiling together with anything else. The
  first commit, which adds the ceilings, is the one exception. A ceiling
  changes only in a commit that holds the new number and this record's
  reason for it, and nothing more.
- **A budget moves with a line in this record.** The floor guard reads
  `budgets.json` and `limits.json` as well as `CONSTRAINTS.md`, and blocks a
  budget or a cost limit that rises unless the same commit adds a line to
  this record.
- **The guard checks every commit, itself included.** It walks the commits
  from the merge base with `main` to the head and judges each against the one
  before it. Its own file is in its scope for a rule that is removed or
  loosened. The text of its own patterns, in that file and in the fixtures of
  its tests, is not flagged; the fixtures are put together when a test
  runs, so that no file in the repository holds a line the guard would flag.
  CI runs it on the pull request, and it is run before each push.
- **Each rule has a test.** The first commit adds tests for the size
  script's two failures and for each rule of the guard, run on throwaway
  repositories made by the test.
- A commit that grows an entry sets that entry's budget to its new measured
  size plus 2%, adds a line with the measured size to the table below, and
  stays under the ceiling.
- When the 1.0 work ends, every budget is the final measured size plus 2%.
- **A ceiling is an estimate and a tripwire, not a measurement.** A change
  that would pass a ceiling is not committed, and the question goes back to a
  decision.
- **The cost limits** of `CONSTRAINTS.md` are expected to hold; the whole set
  was never timed. When the work ends, the baselines are recorded again. A
  limit that can be tightened is tightened to the highest new run times 1.2.
  A limit that would have to rise needs a line in this record, like a
  budget.
- The owner delegated these decisions on 2026-11-19, except merging into
  `main` and releasing, and this record is approved under that delegation.
  The two sentences of `CONSTRAINTS.md` that say a record is one "that the
  owner approved" and that "the owner has not reviewed it yet" are brought in
  line with that in the first commit.

## Alternatives considered

### Keep the budgets of 0.11

No subset of the decided changes worth shipping fits them.

### Let a ceiling rise under the same condition as a budget

A ceiling that moves with a line in the record is a sentence, not a check.

### Ceilings below their own estimate plus 2%

An earlier set had this for `./react`, `./vue` and `./angular`, so the last
step of the work would have failed on its own estimates. Every ceiling now
follows the one rule above.

### What was cut to keep the size down

Long error messages; refusals in the `defineProperty` trap (160 bytes,
record 0002); recording reads outside a getter's own node (124, record
0010); cached getter errors (73, record 0010); the changed-keys rebuild of a
snapshot (270, record 0046); an index beside live collections (339, record
0042); and every development warning but one (record 0036).

## Consequences

- What the larger items buy:
  - 239 bytes (0043): a snapshot lists the store's keys, a snapshot of a
    class with getters is four times faster to make, and `this` in a
    snapshot getter is right.
  - 219 bytes (0013 to 0015): no stack overflow and no hung event loop when
    a subscriber writes, and faster ordinary writes.
  - 281 bytes (0010): five getter defects removed, a cached getter read a
    quarter faster, and a getter that writes its own store is told so on
    both layers.
  - 168 bytes (0006): `includes()` and `indexOf()` find the object the
    caller holds, in about 1% of the time of 0.11.
  - 228 bytes (0001): one rule for every function a store holds.
  - 156 bytes (0007): getters that use `in` or `Object.keys(this)` stop
    going stale. It serves fewer users than the others.
  - 180 bytes (0012): a field read 2.7 times faster on JavaScriptCore and a
    fifth faster on V8.
  - 81 bytes (0009): a rare case, taken because it cannot be added later.
- The decided set was never built as one. Two built combinations came out
  above the sum of their parts (the trap changes 650 bytes against 617, the
  snapshot changes 243 against 230) and one below it (raw values, the
  searches, the freeze, `defineProperty` and the table per prototype, 465
  against 486).
- The README and `CLAUDE.md` say "about 3.7 KB". That changes to the measured
  figure when the work ends.
- Open again when a change cannot be made under its ceiling.

## Measured in stage 4

One line per commit that grows an entry.

| Commit | Entry | Measured bytes | New budget |
| ------ | ----- | -------------: | ---------: |

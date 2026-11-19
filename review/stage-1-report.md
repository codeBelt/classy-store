# Stage 1 report: safety net

Stage 1 of the pre-1.0 review, 2026-11-18. No library source was changed. All
commits are local on `release/1.0`; nothing is pushed.

## Summary

- **Tests:** the unit suite went from 764 to 1,312 tests. Every source file is
  at 100% of lines and functions, and CI now fails below that.
- **Mutation testing:** 1,811 mutants in the seven target files. 1,733 are
  detected, 78 are listed with a labelled reason, none is unexplained. The
  first run left 241 survivors.
- **Tooling, all new:** a mutation runner, a bundle-size script, a core
  benchmark for Bun and Node, a floor guard, and baselines for all of them.
- **Quality bar:** `CONSTRAINTS.md`, with the coverage, size and floor rules
  gated in CI.
- **Findings:** 73, none fixed. The most serious is a read that never returns
  (finding 66), which a one-line change removes.

## Decisions for the owner

1. **The hang (finding 66).** One line in the `defineProperty` trap removes
   it. The plan allows a one-line fix in this stage if you agree. My
   suggestion is to leave it for stage 3, so it is decided together with the
   redesign of `ownership.ts`, which finding 72 argues for.
2. **Headroom.** Size budgets are the measured size plus two to three percent,
   and cost limits are the highest baseline run times 1.2. Both are my choice.
3. **Scripts instead of StrykerJS and size-limit.** Reasons are under
   "Choices made here that the plan left open".
4. **`.claude/worktrees/` in `.gitignore`.** It is ignored only locally now,
   and lint fails in a clone without that line once helper agents run.
5. **Three test judgement calls:** one test pins how much work `shallowEqual`
   does, by counting Proxy traps; several wait for garbage collection with a
   retry loop; and the two `noThisInStatic` lint warnings in the getter tests
   stay, because `this` in a static getter is what they test.
6. **Cost limits are not in CI.** They need a quiet machine. Say if you want
   them there with wider limits.

## What stage 3 should look at first

- **`ownership.ts`, suspend and resume.** Finding 72 shows which three parts
  are needed, and that the walk to a detached parent causes findings 66 to 68
  while contributing nothing to correct behaviour.
- **Functions and classes held in a store** (findings 5, 6, 42, 62): one
  cause, a wrapper made on every read.
- **`Object.defineProperty` through a store** (findings 1, 45, 61, 66, 71):
  the trap handles freezing only.
- **Missing `has` and `ownKeys` traps** (findings 30, 31, 41), now with
  reproductions on both the live store and snapshots.
- **Getters** that miss a dependency or lose memoization (findings 36 to 40).
- **Subscriber delivery:** no loop guard, late and removed subscribers
  (findings 18 to 23).
- **Dead and redundant code:** 25 listed mutants mark it (findings 54, 59,
  64, 73).
- **Performance:** a snapshot after one row changes, and a getter over many
  rows, cost time in proportion to the number of rows (findings 2 and 3).

## Tooling added

| Tool                              | Command                                                                | Where                                                       | Commit               |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------- |
| Mutation runner                   | `bun run test:mutation`                                                | `packages/classy-store/tests/mutation/`                     | `0c0d44c`, `95e67dc` |
| Bundle-size script                | `bun run size`                                                         | `packages/classy-store/tests/size/`                         | `6b3afa9`            |
| Core benchmark                    | `bun run benchmark:core`, `bun run benchmark:core:node`                | `packages/classy-store/tests/benchmark/`                    | `bd0d11f`            |
| Floor guard                       | `bun run check:floor`                                                  | `scripts/floor-guard.mjs`                                   | `e70a223`            |
| Coverage gate                     | `bun run test:coverage`                                                | `packages/classy-store/bunfig.toml`                         | `d175b11`            |
| React and memory baseline scripts | `bun run benchmark:react:compare`, `bun run test:react:memory:compare` | `tests/performance/baseline.ts`, `tests/memory/baseline.ts` | `1ede2d6`            |

Each has a guide beside it. Each gate was run against a deliberate violation
and a clean control before it was trusted:

- Mutation runner: exits 1 with unexplained survivors, 0 when every survivor
  is listed, 1 again when the list holds an entry that matches no mutant or one
  a test now notices. The checkout was unchanged after every run.
- Size script: exits 1 when a budget is one byte too small, when an entry has
  no budget, and when a budget names no entry; 0 with exact budgets. Two runs
  give identical bytes.
- Floor guard: a clean change passes. It reports a suppression comment, an
  `any` cast in library source (not in a test), an unconditional skip and a
  focused test (not a conditional skip), a deleted test file, a test file left
  with fewer assertions, a stub, an empty `catch`, a loosened or removed rule
  in `CONSTRAINTS.md` and a new exception row. A loosened rule that comes with
  a decision record is listed, not blocked. An unknown base exits 2.

### Choices made here that the plan left open

- **A script, not StrykerJS, for mutation testing.** StrykerJS 10.1 lists
  runners for Jest, Vitest, Mocha, Karma, Jasmine, Tap and Cucumber, and none
  for Bun, so it would use its command runner, which runs every test for every
  mutant as the script does (source: its `docs/plugins.md` and
  `docs/configuration.md`). Its mutator list has no rule that removes a single
  statement (source: stryker-mutator.io, "Supported mutators"), and here the
  loss of one call is the change that matters most. It marks an equivalent
  mutant with a comment in the source file, and stage 1 may not change source.
  The script uses the Babel parser already in the repo and adds one dev
  dependency, `@types/babel__core`.
- **A script, not size-limit, for bundle size.** Bun's bundler is already
  pinned in CI and gives byte-identical output, so the script needs no new
  dependency. Say so if you would rather have the standard tool.
- **Every entry is measured together with the main entry.** An adapter
  bundled alone drops the store-creation code, which no application can do
  without. The script reports the whole and what each entry adds.
- **One list of equivalent mutants per source file**, under
  `tests/mutation/equivalent/`, so the lists stay small.
- **Ratios are taken against a Proxy that only forwards**, not against a plain
  property read. A plain read is optimised to a fraction of a nanosecond, so a
  ratio against it is unstable.
- **Helper agents' worktrees break lint.** They live under
  `.claude/worktrees/`, each with its own `biome.json`, and Biome refuses a
  nested root configuration. The folder is ignored here through
  `.git/info/exclude`. Adding `.claude/worktrees/` to `.gitignore` would make
  that hold for every clone; that is your call.
- **Biome formats Markdown.** The plan failed `bun run lint` until its tables
  were aligned by the formatter. Every Markdown file written by the review is
  formatted the same way.

## Coverage

`bun test src --coverage`, Bun 1.4.4, before any new test: 99.16% of functions
and 99.98% of lines. Bun reports no branch coverage, in its table or in its
lcov file (no `BRDA`, `BRF` or `BRH` records), so branches are checked by the
mutation run.

| File                                                                    | Gap                                                                                                                                  | Outcome                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/frameworks/react/utils/snapshotTargetCache/snapshotTargetCache.ts` | 2 of 8 functions never called: the `set` and `deleteProperty` traps of the read-only handler                                         | Covered in `dd7ba0c`. proxy-compare's tracking proxy refuses a write or a delete before it reaches the shared copy, so the two traps can only be reached through the cache itself. Candidate for stage 3: they may be redundant.         |
| `src/core/ownership.ts`                                                 | Line 74, which drops a dead owner when a single-owner child gains a new one, and the fallback used when the runtime has no `WeakRef` | Covered in `d76d56d`. The first has no public effect, so its test reads internal state. The second is reached by taking `WeakRef` away in a test; every supported runtime has it, so the fallback is a candidate for removal in stage 3. |
| `src/types.ts`                                                          | Not loaded by any test                                                                                                               | Types only. No runtime code.                                                                                                                                                                                                             |

After these tests every source file is at 100% of lines and functions.

Bun's threshold is applied per file, not to the total: with a function
threshold of 0.95 the run failed on `ownership.ts` at 92.31% while the total
was 99.76%.

## Mutation testing

First full run, before any new test: 1,811 mutants in the seven files, 8
minutes with six test processes.

| File                             | Mutants | Killed | Timed out | Survived |
| -------------------------------- | ------: | -----: | --------: | -------: |
| `src/core/core.ts`               |     467 |    404 |         3 |       60 |
| `src/core/ownership.ts`          |     167 |    121 |         5 |       41 |
| `src/snapshot/snapshot.ts`       |     179 |    148 |         2 |       29 |
| `src/collections/collections.ts` |     189 |    166 |        18 |        5 |
| `src/utils/persist/persist.ts`   |     463 |    391 |         0 |       72 |
| `src/utils/history/history.ts`   |     176 |    159 |         0 |       17 |
| `src/utils/equality/equality.ts` |     170 |    153 |         0 |       17 |
| Total                            |   1,811 |  1,542 |        28 |      241 |

The earlier sweep reported 655 mutants and 60 survivors. This run has more
rules (each side of a logical expression is forced, a single statement is
removed), so the two are not comparable.

Final run, with every stage 1 test in place (`b41cc7d`,
`tests/mutation/RESULTS.md`):

| File                             | Mutants | Killed | Timed out | Listed with a reason | Unexplained |
| -------------------------------- | ------: | -----: | --------: | -------------------: | ----------: |
| `src/core/core.ts`               |     467 |    440 |         3 |                   24 |           0 |
| `src/core/ownership.ts`          |     167 |    150 |         5 |                   12 |           0 |
| `src/snapshot/snapshot.ts`       |     179 |    168 |         2 |                    9 |           0 |
| `src/collections/collections.ts` |     189 |    167 |        18 |                    4 |           0 |
| `src/utils/persist/persist.ts`   |     463 |    446 |         0 |                   17 |           0 |
| `src/utils/history/history.ts`   |     176 |    172 |         0 |                    4 |           0 |
| `src/utils/equality/equality.ts` |     170 |    162 |         0 |                    8 |           0 |
| Total                            |   1,811 |  1,705 |        28 |                   78 |           0 |

Of the 241 first survivors, 163 are now caught by a test and 78 are listed
under `tests/mutation/equivalent/`, each with a labelled reason:

| Label            | Entries | What it means here                                                                                  |
| ---------------- | ------: | --------------------------------------------------------------------------------------------------- |
| Performance only |      27 | A fast path or a cache in front of work that gives the same answer.                                 |
| Same behaviour   |      21 | The result is identical: a comparison that is already false, a flag that `Object.freeze` overrides. |
| No effect        |      21 | The statement runs but changes nothing anyone reads: a redundant guard, a value never read again.   |
| Unreachable      |       4 | The code can never run.                                                                             |
| Memory only      |       5 | When the link to a collected owner is dropped, in `ownership.ts`.                                   |

The 25 "No effect" and "Unreachable" entries are dead or redundant code, listed
in the findings for stage 3 to delete. The runner refuses an entry whose reason
does not start with one of the five labels.

How the triage was checked:

- Each agent ran the runner twice in a row on its files and got the same
  status for every mutant, so no test was found to depend on timing.
- I re-ran the runner in the main checkout after merging: persist on its own,
  then all seven files. Both agree with the agents' tables.
- One entry was wrong. An agent listed a mutant in `history.ts` as unkillable;
  another agent found a test that catches it, and it was corrected in
  `a6946cc`. The reasons rest on reading the code, so more of the 78 could be
  wrong in the same way. A stale or killable entry fails the run, which is the
  safeguard.
- The equivalents in `ownership.ts` were also compared with the unmodified
  library by a scratch differential fuzzer, over 40,000 to 150,000 random
  sequences each, with no difference found. That fuzzer never runs the
  collector.

Three entries are judgement calls their authors flagged: in `core.ts`,
`prop === 'length' => true` differs only for a user-made Proxy over an array
whose own trap removes elements; in `persist.ts`, removing `assertActive()`
from `save()` only moves a rejection by a few microtasks; in `ownership.ts`,
the five "Memory only" entries can change owner order after a collection.

## Characterisation tests

Eight new files under `packages/classy-store/src/core/`, all through the
public entry points, none importing an internal helper. Each pins what the
code does today. A behaviour that looks wrong is still pinned, with a
`// FINDING:` comment above the test.

| File                                          | Tests | Findings marked | Commit    |
| --------------------------------------------- | ----: | --------------: | --------- |
| `core.characterisation.notifications.test.ts` |    72 |              12 | `230d305` |
| `core.characterisation.detached.test.ts`      |    54 |               7 | `b13dad1` |
| `core.characterisation.getters.test.ts`       |   124 |              32 | `bf1fff4` |
| `core.characterisation.invariants.test.ts`    |    66 |              24 | `6018458` |
| `core.characterisation.identity.test.ts`      |    60 |              12 | `23b153c` |
| `core.characterisation.noWeakRef.test.ts`     |     2 |               0 | `d76d56d` |
| `core.fuzz.findings.test.ts`                  |    11 |               7 | `1cf6829` |

The suite went from 764 to 1,204 tests and from 4.2 to 5.6 seconds. It passed
three times in a row after each merge.

The getters file adds two lint warnings (`noThisInStatic`), because `this` in a
static getter is the behaviour under test. `bun run lint` still exits 0.

One helper agent wrote into another agent's scratch folder by mistake while
both were checking their tests against hand-made mutants, and undid it. The
claim it could have affected is finding 28. The mutation triage of
`ownership.ts` checked that claim independently and corrected it: see finding
72.

## Tests of internal state

These tests read state the public entry does not export. Under the plan's
stage 4 rule they are the ones that may be rewritten when the internals they
read change. Each row says what public test now covers the same fact, or why
none can.

| Internal state                                                                 | Read by                                                                                                                                                     | Public pair                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ownership structure: `getInternal(x).parents`, `.childInternals`, `.reference` | `core.ownership.test.ts` (26 reads), `core.memory.test.ts` (6)                                                                                              | `core.characterisation.detached.test.ts` shows the same facts through notifications, snapshots and collection: every removal route, putting a subtree back, several owners. No pair for the dead-owner cleanup added in `d76d56d`, which has no public effect. Finding 72 says which other parts cannot be observed. |
| Version numbers: `getVersion`                                                  | `core.test.ts` (8 tests), `core.frozenValues.test.ts` (1), `core.memory.test.ts` (1)                                                                        | A version is visible as snapshot identity: `snapshot(store)` is the same object exactly when nothing changed. The fuzz test checks that after every operation, and the characterisation tests pin the cases one by one.                                                                                              |
| Identity helpers: `unwrap`, `identityOf`                                       | `core.snapshotValues.test.ts` (2 tests)                                                                                                                     | `collections.identity.test.ts` and the fuzz test look members up by raw object, proxy and snapshot, which is what the helpers exist for.                                                                                                                                                                             |
| Listener sets: `syncListeners`, `batchedListeners`                             | The Vue, Solid, Svelte and Angular adapter tests, three React test files, `history.test.ts`, and the browser probes under `tests/browser/` (about 45 reads) | None possible. "The adapter unsubscribed" shows publicly only as memory being released. The count is the direct fact. A supported way to count listeners in tests is a candidate for stage 3.                                                                                                                        |

Tests of internal modules, which also fall under that rule because they import
a module no entry exports: `utils/internal/internal.test.ts`,
`utils/cloneSnapshot/cloneSnapshot.test.ts`,
`utils/utilityStatus/utilityStatus.test.ts`, and the tests under
`frameworks/react/utils/`.

Every other test file goes through a public entry or the function under test
that an entry re-exports.

## Fuzz test

`1cf6829` extends the seeded differential fuzz test from 227 lines to about
2,500, with a plain-object mirror as the oracle. It uses the public entry
points only.

- **Operations:** every array method the plan names (`push`, `pop`, `shift`,
  `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`), writes to
  `length`, deletes of properties, dictionary entries and array indices,
  `reactiveMap` and `reactiveSet` with lookups by raw object, proxy and
  snapshot, `batch()` and store methods nested three deep and interrupted by a
  throw in one case in five, rows shared across lists and collections, and
  subtrees detached, edited and put back.
- **Checks after each operation:** the snapshot equals the mirror and is
  frozen; 15 getters, live and on the snapshot, equal a fresh computation;
  every subscriber has exactly the call count the mirror predicts, zero
  included; each snapshot node keeps its reference if nothing beneath it was
  written and gets a new one otherwise.
- **Volume:** 60 seeds of 300 steps by default, about 1.6 seconds.
  `FUZZ_SEEDS`, `FUZZ_STEPS` and `FUZZ_FIRST_SEED` raise it. A failure prints
  the seed, the step and a replay command.
- **Long runs:** two runs of 600,000 steps each passed with no discrepancy.
- **The oracle has teeth:** the agent broke the library in 13 ways (a skipped
  notification, a skipped version bump, a stale getter and others) and the
  default run caught every one, most within the first few steps. One needed
  seed 7: a container that misses a change made while it was detached.

Reported by the agent. I ran the merged files, the suite, lint and the package
typecheck, not the long runs or the 13 breaks.

Not in the fuzz: one row shared by two stores, a store inside a store, cycles,
setters, symbols, `Object.defineProperty`, frozen objects, and subscribers that
throw. The characterisation tests cover those.

## Type tests

`6e46283` adds nine files, `src/types.<entry>.test.ts`, with 54 tests. Every
value export, every overload and every exported type of the nine entry points
now has an exact type assertion under `src`, where the package typecheck sees
it. Before, three exports had one; the rest were checked in part, or only by
the packed-consumer fixtures.

- Each entry has a test that asserts its list of exports exactly, at the type
  level and against `Object.keys` at run time. Adding or removing an export
  fails it.
- The agent that wrote them changed an expected type 75 times, at least once
  per assertion. Each change failed the typecheck at that assertion. I re-ran
  the suite, lint and the package typecheck on the merged files, not the 75
  changes.
- Not covered: parameter names, and the built `.d.mts` and `.d.cts` files,
  which only the packed-consumer fixtures check.

## Baselines

Bundle size, recorded in `tests/size/baseline.json` (Bun 1.4.4, bytes):

| Entry            | Minified | Gzipped | Adds to main |
| ---------------- | -------: | ------: | -----------: |
| `.`              |   10,709 |   3,661 |              |
| `./utils`        |   17,828 |   6,347 |        2,686 |
| `./collections`  |   13,460 |   4,388 |          727 |
| `./react`        |   15,247 |   5,323 |        1,662 |
| `./react/server` |   11,063 |   3,814 |          153 |
| `./vue`          |   11,322 |   3,941 |          280 |
| `./svelte`       |   11,126 |   3,843 |          182 |
| `./angular`      |   11,301 |   3,932 |          271 |
| `./solid`        |   11,361 |   3,973 |          312 |

The main entry matches the 3.7 KB in `CLAUDE.md`. The React figure there (4.9
KB) is the React entry bundled alone, which leaves out the main entry's exports
that the hooks do not use; with every export of both it is 5.3 KB.

Core benchmark, recorded in `tests/benchmark/baseline.json`: Apple M1 Max, five
fresh-process runs per engine on a quiet machine. Nanoseconds per operation,
median with the lowest and highest run.

| Operation                                                  | Bun 1.4.4 (JavaScriptCore) |   Node 24.21.0 (V8) |
| ---------------------------------------------------------- | -------------------------: | ------------------: |
| Read a field of a plain object                             |                      0.167 |                0.54 |
| Read through a forwarding Proxy                            |        2.17 (1.94 to 2.48) |     22 (22 to 22.1) |
| Read a store field                                         |          31.8 (30.6 to 32) | 45.1 (44.7 to 45.9) |
| Read a field three objects deep                            |                        106 |                 132 |
| Write through a forwarding Proxy                           |                       59.8 |                 147 |
| Write a store field                                        |           156 (155 to 157) |    195 (194 to 200) |
| Write the value a field already holds                      |                       34.1 |                53.6 |
| Write with one sync subscriber                             |                        168 |                 234 |
| Call a method that writes one field                        |                        227 |                 276 |
| One `batch()` of ten writes                                |                      1,409 |               1,593 |
| Push a row and pop it again                                |                      1,722 |               3,414 |
| Take a cached snapshot                                     |                       15.9 |                29.9 |
| Write one of 1,000 rows, then snapshot                     |                    125,053 |              60,417 |
| Create a store of 1,000 rows and snapshot it               |                  1,941,856 |           2,737,592 |
| Read a cached getter                                       |                       57.3 |                80.4 |
| Write a getter's input, then read it                       |                        358 |                 377 |
| Write one of 1,000 rows, then read a getter that sums them |                    151,276 |             256,030 |
| Create a store from a small class instance                 |                      1,431 |               5,063 |
| Create a store of 1,000 rows                               |                    555,739 |           1,101,774 |
| Subscribe and unsubscribe                                  |                       42.4 |                53.7 |

| Cost as a ratio to a forwarding Proxy |                 Bun |                Node |
| ------------------------------------- | ------------------: | ------------------: |
| Read                                  | 14.3 (12.8 to 16.5) | 2.04 (2.03 to 2.08) |
| Write                                 |  2.6 (2.51 to 2.61) | 1.33 (1.32 to 1.36) |
| Cached getter                         | 26.1 (23.1 to 34.2) | 3.65 (3.63 to 4.38) |
| Cached snapshot                       | 7.28 (6.43 to 8.23) |  1.36 (1.36 to 1.5) |

What this says:

- The plan's "about 40 ns" for a read matches Bun. Most of it is real overhead
  there, because a bare Proxy read costs 2 ns. On Node a bare Proxy read
  already costs 22 ns, so the store adds about 23 ns.
- The ratios on Bun are noisy, because their denominator is 2 ns. The spreads
  above show it, and the limits allow for it.
- A snapshot after one row changes, and a getter over 1,000 rows, cost 60 to
  256 microseconds: time in proportion to the number of rows.

React benchmark, recorded in `tests/performance/baseline.json`: full size, five
runs of 20 seconds each, 16 cases with seven operations. The browser clock
ticks in tenths of a millisecond, so most figures are identical across runs.
A single run compared with the baseline had all 104 figures inside its spread.

React memory suite, recorded in `tests/memory/baseline.json`: full size, five
runs of 38 seconds each, 30 cases. The counts of live stores, collections and
tracking read maps were identical in all five runs, and every cleanup
checkpoint is at zero.

## Quality bar and CI gates

`CONSTRAINTS.md` (`c070953`) holds the floor and the numbered rules, each with
where its number came from. `CLAUDE.md` points at it.

| Gate                                                 | Where it runs                                     | Violation it was tested against                                                                  |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Floor guard, `bun run check:floor`                   | CI                                                | Twelve kinds, listed under "Tooling added". Also a loosened number in the real `CONSTRAINTS.md`. |
| Coverage, `bun run test:coverage`                    | CI, in place of the plain test run                | One uncalled function in a copy of the source: exit 1                                            |
| Size budgets, `bun run size`                         | CI                                                | A budget one byte too small, a missing budget, a budget for no entry: exit 1                     |
| Mutation, `bun run test:mutation`                    | Local, before a commit that touches a target file | An unexplained survivor: exit 1. A stale entry: exit 1. A reason with no label: exit 2           |
| Cost limits, `bun run benchmark:core --check`        | Local, on a quiet machine                         | A read limit of 1: exit 1. The real limits pass on both engines                                  |
| Memory baseline, `bun run test:react:memory:compare` | Local                                             | One extra retained store in a report: exit 1                                                     |

CI already ran lint, the typecheck, the build, the package checks, the browser
suites and the compatibility matrix. Those are unchanged.

The floor guard takes as its base the commit that added `CONSTRAINTS.md`, for
as long as that commit is on the branch, so the 1.0 work done before the bar
existed is not judged by it.

## Findings for stage 3

Nothing here was fixed.

1. **`Object.defineProperty` on a store is silent.** Defining a new data
   property sets the live value, notifies no subscriber, and stays out of the
   snapshot until the next ordinary write. The `defineProperty` trap handles
   freezing only. Reproduced on `7540662`.
2. **A snapshot after one row changed costs time in proportion to the number
   of rows.** Writing one of 1,000 rows and taking a snapshot took about 70
   microseconds on Node and 150 on Bun, on a busy machine, against well under
   a microsecond for a cached snapshot. To be confirmed by the baseline.
3. **A getter that sums 1,000 rows costs about 200 nanoseconds per row to
   recompute.** Same caveat.
4. **Two traps of the React snapshot cache cannot be reached through
   proxy-compare** (see Coverage).

### From the identity tests (`23b153c`, 60 tests)

Each is pinned by a test marked `FINDING:` in
`src/core/core.characterisation.identity.test.ts`. I reproduced 5, 6, 7 and 8
separately on `6e46283`; the rest are as the agent that wrote the tests read
them.

5. **A function read from an array is a new wrapper on every read.**
   `store.callbacks[0] === store.callbacks[0]` is `false`, so `indexOf` and
   `includes` never find a function. `store.callbacks.splice(store.callbacks.indexOf(first), 1)`
   removes the last callback, because `indexOf` is `-1`. A function held as an
   object property is stable. Likely bug.
6. **A class held in a store comes back as a bound wrapper.** For
   `createClassyStore({Model})`, `store.Model.label` is `undefined` and
   `new store.Model('x') instanceof store.Model` is `false`. Likely bug.
7. **`list.includes(raw)`, `indexOf` and `lastIndexOf` miss an object that is
   in the list**, because the list hands out proxies and the search compares
   against the raw object. The reactive collections already match a raw
   object, its proxy and its snapshot. Likely bug.
8. **A store that refers to itself can be written but not read.**
   `store.self = store` succeeds and notifies; `snapshot(store)` then throws
   "circular reference detected in snapshot" until the reference is deleted.
9. **A class instance that is already a store, placed in another store by its
   raw object, is not connected.** `outer.inner === raw`, and a method call
   through it changes state without telling any subscriber of either store. A
   plain object in the same position is shared and notifies both.
10. **Raw objects end up holding proxies.** After `to.row = from.row`, and
    after `store.list.reverse()`, the raw object behind the store holds the
    proxy, not the raw row. A raw value assigned directly stays raw.
11. **A write through the raw object is invisible until the next proxied
    write to that node.** `store.child.n` is 5 while `snapshot(store).child.n`
    is still 0. A known limit of the design; the disagreement between the live
    store and the snapshot is the notable part.
12. **A native `Set` or `Map` in a store holds raw members**, so
    `store.set.has(store.list[0])` is `false`. A consequence of native
    collections being opaque.
13. **A getter on a store that refers to itself recomputes on every write**,
    including a write to a field it never read. Memoization is lost, nothing
    else.

### From the type tests (`6e46283`)

14. **`Snapshot` turns a tuple into an array.** `Snapshot<[string, number]>`
    is `readonly (string | number)[]`.
15. **The backing arrays of the reactive collections are public.** `_entries`
    and `_items` are writable members of the published `ReactiveMap` and
    `ReactiveSet` types. The `@internal` tag is only a comment.
16. **A snapshot of a reactive collection keeps its mutators in the type.**
    `snapshot(store).todos.set(...)`, `.delete()`, `.clear()` and `tags.add()`
    compile, and each throws a `TypeError` when run.
17. **The Vue adapter returns a writable ref.** `state.value = ...` compiles.
    The Angular adapter returns a read-only signal.

### From the notification tests (`230d305`, 72 tests)

Pinned in `src/core/core.characterisation.notifications.test.ts`. As the agent
that wrote the tests read them; not reproduced separately.

18. **A sync subscriber that writes to the store it listens to recurses until
    the stack overflows.** The `RangeError` goes to `console.error`, the
    writer does not throw, and the store keeps the writes. There is no loop
    guard.
19. **A batched subscriber that writes is served again in back-to-back
    microtasks, with no bound.** A timer that is already due waits until the
    writer stops. One that never stops would hang the event loop.
20. **A subscriber removed during delivery is still called once**, after its
    unsubscribe function returned. Both kinds, and across nodes.
21. **A subscriber added after a write sometimes hears that write.** A late
    batched subscriber is called if another batched subscriber existed at the
    write, and not if only a sync one did. The same holds for a sync
    subscriber added inside `batch()`.
22. **A re-entrant write delivers the same snapshot twice.** A subscriber
    registered after one that writes is called twice with the identical
    snapshot and never sees the state in between. Both kinds.
23. **A subscriber that returns a rejected promise is not reported.** It
    becomes an unhandled rejection, where a synchronous throw goes to
    `console.error`.
24. **Owners are notified level by level, not from the inside out.** For a
    record held by the root and by a nested box, a write through the box calls
    the record's subscriber, then the root's, then the box's.

### From the detached-subtree tests (`b13dad1`, 54 tests)

Pinned in `src/core/core.characterisation.detached.test.ts`. Same caveat.

25. **A raw object changed while it was out of the store, then put back, shows
    its old content in the snapshot.** `delete store.slot; raw.n = 2;
    store.slot = raw` gives `store.slot.n === 2` and
    `snapshot(store).slot.n === 1`, if a snapshot was taken before the delete.
    Likely bug.
26. **A subscription follows the object, not the property.** After
    `subscribe(store.user, cb); store.user = {...}`, writes to the new user do
    not call `cb`, and nothing says so. This matches the documented scope.
27. **Four things keep memory alive longer than expected:** a kept unsubscribe
    function retains its callback; the store's last snapshot retains a removed
    subtree until the next snapshot; a getter's cache retains the child it
    read until the getter is read again; a held snapshot retains its store.
28. **Suspending a detached subtree has no public effect.** (Corrected by
    finding 72: three parts of it are needed for correct snapshots.) Four changes to
    `ownership.ts` survive all 54 tests: `detach()` not suspending,
    unsubscribe not suspending, suspend not disconnecting children, and no
    link to the detached parent. Only the version compare on resume, the
    listener check, the owner count and the weak owner references can be
    observed. This is the logic the plan calls hardest to reason about, so it
    is the first candidate for simplification.

Seen on the way, not pinned:

- A getter that reads another store is cached for good on the live store:
  after the other store changes, `store.total` still returns the old value,
  while a first `snapshot(store).total` returns the new one.
- `core.test.ts:691` ("mutations on old child proxy after replacement do not
  trigger notifications") never asserts on its listener.

### From the fuzz test (`1cf6829`)

Each is pinned in `src/core/core.fuzz.findings.test.ts` and left out of the
random run, with a comment at the exclusion. Not reproduced separately.

29. **A delete that removes nothing counts as a write.**
    `delete store.dict.missing` calls every subscriber and replaces the
    snapshot with an equal one. The same holds for `delete list[5]` past the
    end. Writing the value a field already holds does neither.
30. **A live getter that reads `Object.keys(this)` or `'b' in this` goes
    stale.** It still answers 2 and `true` after `delete store.b`. This is the
    missing `has` and `ownKeys` traps, now reproduced.
31. **The same getter on a snapshot sees no keys at all.** It answers 0 and
    `false` from the start, while the live store answers 2 and `true`. The
    tracking proxy used to compute snapshot getters has only a `get` trap over
    an empty target.
32. **A live getter that reads a property which does not exist is recomputed
    on every read**, so a getter that builds an object returns a new one each
    time. On a snapshot it is cached.
33. **`+0` and `-0` are two members when added and one when constructed.**
    `reactiveSet([0])` then `add(-0)` has size 2; `reactiveSet([0, -0])` has
    size 1. A native `Set` holds one.
34. **A collection constructed from one object in two forms holds it twice.**
    `reactiveSet([raw, proxy])` has size 2, and `delete(raw)` leaves
    `has(raw)` true. `add` holds it once.
35. **A snapshot given as a new map key or set member is stored frozen, yet
    answers for the live row.** After `notes.set(snapshot(row), 1)`,
    `notes.has(row)` is true and the stored key keeps the old content. This
    follows from "frozen objects are values" and may be intended.

### From the getter tests (`bf1fff4`, 124 tests)

Pinned in `src/core/core.characterisation.getters.test.ts`. As the agent read
them; not reproduced separately except where a number above says so.

36. **A getter misses some of what it reads, and then stays stale for good:**
    another store; its own child reached through an outside reference; a
    static getter that names its class; and another getter's error that it
    catches (`try { return this.strict } catch { return 'fallback' }` stays
    `'fallback'` after `strict` stops throwing, while a fresh snapshot says
    otherwise).
37. **The snapshot getter layer loses nested memoization.** With `c` reading
    `b` reading `a`, `snapshot(s).c; s.unrelated = 1; snapshot(s).c` re-runs
    `a` and `b`. The agent traced it to `evaluateSnapshotGetter` replacing the
    map the nested getters had filled.
38. **A getter cycle on a snapshot overflows the stack** with a `RangeError`.
    The live store throws its own "circular computed getter dependency" error.
39. **A getter that writes behaves differently on each layer.** On the live
    store it re-runs and notifies on every read; on a frozen snapshot the
    write is dropped in silence.
40. **An object returned by a getter is not protected.** The live getter hands
    out its cached object, and a snapshot getter's result is not frozen, so a
    change to it leaks into later snapshots.
41. **Inside a snapshot getter, `this` is a tracking proxy over an empty
    object:** it has no own keys, is not an instance of the class, and
    `return this` hands that proxy out.
42. **`constructor` read through a store is a bound wrapper**, so statics are
    unreachable through it, and `this.constructor` differs between the store
    and the snapshot. Same cause as finding 6.
43. **A setter is not a transaction.** A setter that writes two fields gives
    two sync notifications, and a subscriber sees the half-applied state.
44. **A redefined getter keeps the old result.** The cache is keyed by name.

### From the invariant tests (`6018458`, 66 tests)

Pinned in `src/core/core.characterisation.invariants.test.ts`. Same caveat.

45. **`Object.defineProperty` through a store breaks more than notification.**
    Redefining a property that holds an object leaves the old object in place:
    `Object.defineProperty(s, 'child', {value: other}); s.child.n` still reads
    the old child, and a later `s.child = other` is taken for no change.
    Redefining it as a primitive still reads the old object. Defining
    `length` on a list leaves removed elements readable by index. Extends
    finding 1.
46. **Freezing a raw object behind the store makes reads throw.**
    `Object.freeze(raw.config); s.config.nested` throws a `TypeError` from the
    Proxy `get` invariant. Freezing through the store works.
47. **A cached getter survives a prototype change.** `s.__proto__` itself is
    memoized as a getter with no dependencies, so it keeps returning the first
    prototype. A method called before a swap keeps the old class body.
48. **`Object.assign(store, JSON.parse('{"__proto__": ...}'))` swaps the
    prototype**, as it does on a plain object. The agent did not check whether
    `persist` can reach this path: `persist.ts` assigns stored keys by name.
    The stage 2 security agent should.
49. **Snapshots can be incomplete or mutable at the edges.** An array's own
    named and symbol-keyed properties are reactive on the store and missing
    from its snapshot. A non-writable, non-configurable field that holds an
    object is shared with the snapshot, so a write shows in snapshots already
    taken. An object inherited from the prototype comes back raw and unfrozen.
50. **`Object.getOwnPropertyDescriptor(store, key).value` is the raw object.**
    A write through it notifies no one and stays out of the snapshot.
51. **`structuredClone(store)` throws `DataCloneError`.** A snapshot clones to
    a plain object with getter results as data.

### From the mutation triage of `persist.ts` (`fc055ea`)

52. **A getter named in `properties` is saved, and restoring it fails
    part-way.** With `properties: ['count', 'doubled', 'tail']`, `save()`
    stores the getter's value; hydrating then sets `count`, throws on
    `doubled`, leaves `tail` unset and records a `'parse'` error. The types
    say getters are always excluded. Pinned with `FINDING:`.
53. **An array as the stored `state` passes the envelope check.** For a store
    `{count: 0, length: 0}`, the record `{"version":0,"state":[1,2,3]}` sets
    `store.length` to 3 with no error. Pinned with `FINDING:`.
54. **Dead or redundant code in `persist.ts`,** each listed with its reason in
    `tests/mutation/equivalent/persist.json`:
    - `assertActive()` in `writeToStorage()` can never throw, and the one in
      `save()` duplicates it.
    - The block that cancels the debounce timer appears four times, each with
      a null check that `clearTimeout` does not need.
    - Two `debounceTimer = null` assignments are never read.
    - Guards whose removal changes nothing: `if (onError)`,
      `if (prop.transform)`, `typeof envelope !== 'object'`,
      `if (!hydratedFlag)`.
    - The text of the default `merge = 'shallow'` is never compared.
55. **A malformed entry in `properties` is ignored without an error.**
    `{key: 'other', deserialize}` with no `serialize` means `other` is never
    persisted.
56. **When a debounced save runs relative to a read is now pinned** by three
    fake-clock tests (a read that finds nothing leaves the timer alone; one
    that restores data restarts the window). Stage 3 may want to say whether
    that is intended.

### From the mutation triage of history, equality and collections (`f9fa30e`, `0a1199f`, `7386c6f`)

57. **An edit made in the same tick as `undo()` or `redo()` is not recorded.**
    After `history.undo(); store.value = 9;` with no flush in between,
    `canRedo` stays true and `redo()` discards the 9. With a flush between
    the two, the edit is recorded. Pinned with `FINDING:` in
    `history.sameTick.test.ts`. Likely bug.
58. **The `restoring` counter in `history.ts` may be redundant.** Removing it
    leaves every other test green; the version check already skips the
    restore's own notification. It is also what causes finding 57.
59. **Dead or redundant code:**
    - `equality.ts`: the three `b instanceof Date / Map / Set` checks can never
      fail after the same-prototype check.
    - `history.ts`: the `if` around the truncation in `record()`, and the
      `disposed ||` in `redo()`.
    - `collections.ts`: the object guard in `indexOfMember` repeats the one
      inside `identityOf`. It may be a deliberate shortcut in a hot loop.
60. **`withHistory` treats a function held in an own field as behaviour, not
    state.** Undo neither removes one that was added nor restores one that was
    replaced. Pinned, not marked as a finding.

Two of the new tests are judgement calls. `equality.arrayScan.test.ts` pins how
much work `shallowEqual` does on arrays, by counting Proxy traps, because two
mutants change only that. One test in `history.disposed.test.ts` waits for
garbage collection; it passed 25 runs out of 25 for the agent and three in a
row here.

### From the mutation triage of `core.ts` (`12e009e`, `b60cc1c`)

61. **The `defineProperty` trap does not resume a suspended subtree**, where
    `get`, `set` and `deleteProperty` do. Freezing a detached, unobserved
    object detaches its child while the parent is suspended. The next
    `snapshot()` of the subtree is stale once, and a subscriber added after the
    freeze misses the next write. Pinned with `FINDING:`. Likely bug.
62. **A store made from a function is not treated as a store by other
    stores.** A holder is not told of its writes, reads it back as a method
    bound to the holder (`holder.fn === fn` is `false`), and a reactive set
    treats the raw function and its proxy as two members. Same family as
    findings 5 and 6.
63. **A write past the end of a typed-array store stores nothing and still
    notifies.** `createClassyStore(new Uint8Array(2))[5] = 1`. Reading
    `length` on such a store throws a `TypeError` (seen, not pinned).
64. **Dead or redundant code in `core.ts`:**
    - `if (!cached) return false` in `areDepsValid` is unreachable: a computed
      dependency is recorded only after its cache entry exists, and entries
      are never removed.
    - The ternary in `activeTracker` is redundant.
    - `node.resumeScope()` in `createClassyStore` shows only through finding
      61, and becomes redundant once that is fixed.
65. **Five mutants in `core.ts` are caught only through finding 61.** Tests
    that pin the stale result are what kill them. When the trap is fixed they
    become unobservable, which again says that suspension has no effect a
    caller can see.

Twelve of the 24 unkillable mutants in `core.ts` are fast paths in front of a
lookup that would miss anyway, labelled "Performance only".

### From the mutation triage of `ownership.ts` and `snapshot.ts` (`f183854`, `c9e83a3`)

66. **A read that never returns.** On the unmodified library:

    ```ts
    const store = createClassyStore({outer: {inner: {x: 1}}});
    const outer = store.outer;
    const inner = outer.inner;
    delete store.outer;
    Object.defineProperty(outer, 'inner', {writable: false, configurable: false});
    snapshot(inner);
    snapshot(inner);
    inner.back = outer;
    subscribe(inner, () => {})();
    inner.x; // never returns
    ```

    I ran this in a child process: it printed nothing after the read and was
    killed after eight seconds. The cause is finding 61: the `defineProperty`
    trap detaches a child of a suspended container without resuming it first,
    the child keeps a pointer to a container that no longer lists it, and two
    such pointers can form a loop that `resumeScope()` walks for ever. No test
    pins it, because a test of it would hang the suite.

    **A one-line change removes it.** In a throwaway copy of the source I added
    `internal.resumeScope();` as the first line of the `defineProperty` trap.
    The read above then returned 1, and the suite had 1,307 passes and 5
    failures. All five are the tests that pin findings 61 and 67, which is the
    behaviour the change corrects. The plan allows a one-line fix in this stage
    if you agree; I have not made it.
67. **The same cause in a milder form.** A snapshot of an object under a
    frozen, removed container is stale once and correct on the next call, and
    a subscriber added right after the freeze misses a write. Pinned in
    `core.removedContainers.test.ts`.
68. **Without `WeakRef`, a held row keeps its removed list alive.** The link
    from a suspended child to its former container is then a strong one, which
    defeats the stated purpose of suspension. Pinned in
    `core.noWeakRefMemory.test.ts`.
69. **The order in which owners are notified depends on hidden state.** An
    owner inside a container that left the store and came back is called after
    a later owner if nothing observed the container meanwhile, and before it if
    something did. Two owners inside one container swap places after such a
    trip. Pinned in `core.ownerOrder.test.ts`.
70. **A snapshot lists every data field before any own getter**, whatever
    their order on the store: `{get double() {...}, count: 1}` gives
    `['count', 'double']`. Pinned.
71. **An array element redefined to a primitive disagrees between store and
    snapshot.** After `Object.defineProperty(store.rows, 0, {value: 7})` the
    store still returns the old object while a snapshot shows 7. Pinned.
72. **What suspending and resuming a detached subtree can be seen to do.**
    This corrects finding 28, which said it has no public effect. Mutant by
    mutant:
    - **Needed for correct snapshots, each now pinned:** clearing the
      detached-parent pointer on attach, refusing to suspend a node twice, and
      bumping the version on resume.
    - **Visible only as the order of owner notifications** (finding 69), and
      as memory where there is no `WeakRef`: cutting the links below a
      suspended container, and exempting a store root.
    - **No effect on correct behaviour:** the detached-parent pointer and the
      walk in `resumeScope()`. With the walk removed, every test passes except
      the ones that pin findings 66 to 68, and it is the cause of all three.
    - **Memory only:** the `FinalizationRegistry` and the pruning of dead owner
      links.
73. **Dead or redundant code:**
    - `ownership.ts`: an unreachable `break` in `resume()`, three redundant
      fast-path guards, and one redundant early return.
    - `snapshot.ts`: `configurable: true` and `writable: true` on properties
      that `Object.freeze` overrides anyway, a `delete` from the in-progress
      set that nothing reads again, and three checks that cannot fail.

## Verified and not verified

Verified by me, in the main checkout:

- After each merge of an agent's work: the unit suite three times in a row,
  lint, and the package typecheck. I checked each new test file for imports of
  internal modules and for `skip`, `only`, `todo`, suppressions and `as any`.
- Coverage at 100% of lines and functions in every source file.
- The mutation run over all seven files after the last merge: exit 0.
- Each gate against a deliberate violation and a clean control.
- Findings 1, 5, 6, 7, 8 and 66, each reproduced with a script of my own, and
  the one-line remedy for 66 in a throwaway copy.
- The validation matrix on `e70a223`, before the tests were merged: all green.
  The run on the final commit is recorded below.

Not verified by me, and taken from the helper agents' reports:

- The other findings, as their authors read their own tests. Every one is
  pinned by a passing test, so what the code does is established; whether it
  is a bug is a reading.
- The reasons for the 78 listed mutants. One was wrong and was corrected.
- The fuzz test's two long runs and its thirteen deliberate breaks.
- The 75 type assertions each failing when its expected type is changed.

Not done:

- No other library's source was read. That is stage 2.
- Nothing was run on Windows or Linux locally. CI covers Linux.
- The benchmark was not run in a browser.

### Final checks

Run on `c070953`. Every step exited 0.

| Check                                                                         | Result                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `bun run lint`                                                                | No error, four warnings                                                        |
| `bun run check:floor`                                                         | Clean                                                                          |
| `bun run test:coverage`                                                       | 1,341 tests in 95 files (1,312 of them under `src`), every source file at 100% |
| `bun run build`, `bun run typecheck`, the package checks                      | Pass                                                                           |
| `bun run size`                                                                | Every entry inside its budget                                                  |
| Browser suites on Chromium, Firefox and WebKit                                | Pass                                                                           |
| React 18.0.0, 18.3.1, 19.0.0 and 19.3.1, and the same with the React Compiler | Pass                                                                           |
| Vue and Svelte at their minimum versions; Angular 22.0.0 and 22.2.3           | Pass                                                                           |
| Next.js, Compiler off and on                                                  | Pass                                                                           |
| Solid and Angular example builds; the docs site build                         | Pass                                                                           |
| React memory suite at full size, then against its baseline                    | Pass; 270 counts checked, none higher                                          |
| React benchmark at full size, then against its baseline                       | Pass; see below                                                                |

The React benchmark comparison first showed six of 104 figures outside the
baseline, each by one to four ticks of the browser's 0.1 ms clock, on a machine
that was busy running this matrix. That is noise, and it showed the comparison
was too strict: five baseline runs often agree exactly, so their spread is
zero. `5bc4008` adds a tolerance of one tick or five percent. With it, the same
run has all 104 figures inside.

`5bc4008` is the only commit after the matrix run. It changes the comparison
script and its guide, nothing the matrix exercises; I re-ran the script, lint
and its typecheck.

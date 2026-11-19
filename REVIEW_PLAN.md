# Pre-1.0 review and refactor plan

Working plan for the deep review of `@codebelt/classy-store` before 1.0.0 is
published. Not part of the published docs; delete it when the work is done.

## Status

Read this first. Whoever finishes a stage updates its row: the state, the
commit it ended on, and where its report is.

| Stage                 | State                                                                | Ended on  | Report                     |
| --------------------- | -------------------------------------------------------------------- | --------- | -------------------------- |
| Plan                  | Revised 2026-11-18 after a check against the repository at `7540662` |           |                            |
| 1. Safety net         | Done 2026-11-18. Waiting for the owner's go-ahead for stage 2        | `5bc4008` | `review/stage-1-report.md` |
| 2. Library comparison | Not started                                                          |           |                            |
| 3. Design review      | Not started                                                          |           |                            |
| 4. Refactor           | Not started                                                          |           |                            |
| 5. Release            | Not started                                                          |           |                            |

## Starting point (read this if you are new to the work)

**The library.** `@codebelt/classy-store` is a class-based reactive store. You
write a plain TypeScript class, wrap it with `createClassyStore()`, and get a
proxy back. Writes go through the proxy; consumers read frozen snapshots with
structural sharing; class getters are memoized. Adapters exist for React, Vue,
Svelte, Solid 2 and Angular. `CLAUDE.md` has the layout, commands and key
technical facts. The core is about 730 lines: `src/core/core.ts`,
`src/core/ownership.ts` and `src/snapshot/snapshot.ts` under
`packages/classy-store/`.

**The owner's goal.** Before 1.0.0 is published, review the core against
comparable libraries, then refactor, clean up and simplify it. The owner is the
only user, so breaking changes and public API changes are welcome. There is no
deadline; the code should be as correct and clear as it can be made.

**State of the repository** (as of 2026-11-18):

- Branch `release/1.0`, pushed, with an open pull request:
  https://github.com/codeBelt/classy-store/pull/45. It is not merged and
  nothing is published; npm `latest` is 0.11.0.
- That branch already holds a full 1.0 preparation pass: transactions and
  `batch()`, subscription scope, per-field persist hydration, stricter
  `shallowEqual`, packaging checks, Solid 2, a rewritten docs site, and a
  `major` changeset in `.changeset/stable-one.md`.
- It also holds the tests produced by a coverage run and a mutation sweep
  (commits `b1d9ad7`, `5f15539`). The sweep's script, its mutation rules and
  its list of equivalent mutants were not committed. Stage 1 extends that
  work; read those commits first so nothing is repeated.
- Work continues on this branch unless the owner says otherwise. The pull
  request stays open and unmerged until stage 4 is done, because merging it
  starts the Changesets release flow.

**Findings already in hand** from a first comparison with Solid 2's store:

- Fixed in `f8a012f`: a frozen object held in a store was proxied, so reading a
  nested object under it threw. Frozen objects are now kept by reference.
- Open, performance: a field read through the proxy costs about 40 ns against
  under 1 ns raw, mostly from a property-descriptor lookup on every `get`.
  Solid caches that answer per prototype.
- Open, diagnostics: writes inside arrow-function methods bypass the proxy and
  notify no one, and writes after an `await` fall outside the transaction.
  Both are silent. Solid reports the equivalents with stable codes in its
  development build; we have no development/production split.
- Open, coverage of proxy traps: the store proxy defines `get`, `set`,
  `defineProperty` and `deleteProperty`. There is no `has` or `ownKeys`. The
  `defineProperty` trap came with `f8a012f` and handles freezing only.
  Reproduced on `7540662`: `Object.defineProperty(store, 'b', {value: 2, ...})`
  sets the live value, notifies no subscriber, and stays out of the snapshot
  until the next ordinary write.
- Open, complexity: the suspend and resume logic in `ownership.ts`, and the
  three kinds of getter dependency (value, version, computed) in `core.ts`,
  are the hardest parts to reason about.

**How to work through this plan.** Do the stages in order. Each stage ends
with a report to the owner and waits for their go-ahead before the next one
starts. The report is also saved (see "Where the work is written down") and
the Status table above is updated. Stage 3 is the decision point: the owner
approves each proposed change there.

**Commands** (from the repo root; see `CLAUDE.md` for the rest):

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
bun run typecheck
bun run check:package
bun run test:browser
```

The validation matrix. Each command builds the library first, and the first
two accept React versions as arguments. CI runs all of it on every push to
the pull request (`ci.yml`, `react-compatibility.yml`, `react-next.yml`),
with the benchmark and memory suites at smoke size:

```bash
bun run test:react:compatibility       # React 18.0.0, 18.3.1, 19.0.0, 19.3.1
bun run test:react:compiler            # the same with the React Compiler
bun run test:react:next                # packed Next.js app, Compiler off and on
bun run test:frameworks:compatibility  # packed Vue and Svelte, minimum versions
bun run test:angular:compatibility     # packed Angular 22.0.0 and 22.2.3
bun run test:react:memory              # React memory retention
bun run benchmark:react                # React commit budgets at scale
```

CI also builds two examples after `bun run build`:

```bash
bun run --filter classy-store-solid-example build
bun run --filter classy-store-angular-example build
```

The stage 1 tooling. Each has a guide beside it under
`packages/classy-store/tests/` (`mutation`, `size`, `benchmark`):

```bash
bun run test:mutation        # mutation run; add file paths to limit it
bun run size                 # bundle size per entry point, against its budget
bun run benchmark:core       # per-operation timings on Bun (JavaScriptCore)
bun run benchmark:core:node  # the same on Node (V8)
```

Helper agents get their worktrees under `.claude/worktrees/`, inside the
repository. Each holds its own `biome.json`, which would make `bun run lint`
fail in the main checkout, so `.gitignore` lists that folder.

## Ground rules (every agent)

- No deadline. Correctness and clarity win over speed.
- Breaking changes and public API changes are allowed. The library has one user.
- Fixed: state is a plain class wrapped in a proxy, consumers read immutable
  snapshots with structural sharing, and one core serves React, Vue, Svelte,
  Solid and Angular. Everything built on that is open to change.
- The owner alone decides when to merge and when to release. No agent merges
  the pull request, merges the Changesets release pull request, enables
  auto-merge, publishes to npm, creates a tag or a GitHub release, or runs
  the release workflow. Finishing a stage, passing checks or an earlier
  approval is not permission; only the owner's explicit instruction for that
  specific action is.
- Do not ask the owner to merge or release, and do not suggest it is time.
  Report the state of the work and stop; the owner will say when.
- Pushing to the branch also needs the owner's approval each time.
- Read the repo's agent instructions first (`AGENTS.md` if present, otherwise
  `CLAUDE.md`). Typecheck with `bun run typecheck`, never `bunx tsc`.
- Use the skills listed for your stage. Load each one before the work it
  covers, not after.
- One writer at a time in this checkout. Read-only agents may run in parallel.
- Read-only means this checkout is not changed. An agent that has to write
  something in order to run it (a test ported to another library, code deleted
  to see what fails, a spike) does that in a scratch folder or a throwaway Git
  worktree, installs nothing here and leaves `bun.lock` alone. The one file a
  read-only agent may create here is its own report under `review/`; the
  agent running the stage commits it.
- A helper agent runs on Fable, on Opus or on Sonnet at high effort, never on
  anything lower. "Agent models" below says which.
- `CONSTRAINTS.md` is the quality bar from the end of stage 1. No agent lowers
  a number in it or weakens a check to make something pass. A number moves
  only through a stage 3 decision the owner approved, which states the new
  value.
- Report what was verified and what was not. A claim needs a test, a
  reproduction or a measurement behind it.

## Where the work is written down

| What                                                                                                                | Where                                 | Kept after the work |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| This plan                                                                                                           | `REVIEW_PLAN.md`                      | No                  |
| Stage reports                                                                                                       | `review/stage-1-report.md`, and so on | No                  |
| Library, adapter and security reports                                                                               | `review/stage-2/<name>.md`            | No                  |
| Decision document                                                                                                   | `review/stage-3-decisions.md`         | No                  |
| 1.0 public API spec                                                                                                 | `review/spec.md`                      | No                  |
| Decision records                                                                                                    | `docs/decisions/`                     | Yes                 |
| Quality bar                                                                                                         | `CONSTRAINTS.md`                      | Yes                 |
| Mutation runner, bundle-size script and core benchmark, with their saved results and the list of equivalent mutants | `packages/classy-store/tests/`        | Yes                 |

- `review/` is committed with the stage that wrote it, so a later agent with a
  fresh context or its own worktree can read it.
- This plan is untracked as of 2026-11-18. Commit it with the first stage 1
  commit. Until then, an agent in its own worktree or in another session
  cannot see it: run agents in this checkout, or put the text of their stage
  in their brief.
- Only one document describes the public API when the work is done. The spec
  is the working contract for stage 4. By the end of stage 4,
  `website/content/docs/API_REFERENCE.md` says everything the spec says, and
  stage 5 deletes the spec with the rest of `review/` and this plan.

## Skills

| Skill                                                               | Stage | Used for                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constraint-driven-development`                                     | 1     | Write the quality bar into `CONSTRAINTS.md`: coverage and mutation thresholds, bundle-size budget per entry point, strict types, lint rules, no skipped tests. Later stages may not lower it; a number moves only through an approved stage 3 decision (see Ground rules). |
| `test-driven-development`, `mattpocock-skills:tdd`                  | 1, 4  | Stage 1 tests pin existing behaviour. In stage 4 every change starts with a failing test.                                                                                                                                                                                  |
| `source-driven-development`                                         | 2, 4  | Read each library's actual source and official docs. Check every build-tool and framework API against its docs before relying on it.                                                                                                                                       |
| `mattpocock-skills:research`                                        | 2     | Structure each library report and cite the files read.                                                                                                                                                                                                                     |
| `api-and-interface-design`                                          | 2, 3  | Judge the public API: small stable exports, consistent names across the five adapters, defined error behaviour.                                                                                                                                                            |
| `mattpocock-skills:codebase-design`                                 | 3     | Decide module boundaries and seams for the core, so internals stay deep and hidden.                                                                                                                                                                                        |
| `doubt-driven-development`                                          | 3, 4  | A fresh-context adversarial review of each design decision and each risky commit.                                                                                                                                                                                          |
| `spec-driven-development`                                           | 3     | Write the 1.0 public API spec at `review/spec.md` from the approved decisions. The spec is what stage 4 implements.                                                                                                                                                        |
| `documentation-and-adrs`                                            | 3, 4  | One decision record per approved change under `docs/decisions/`, and the API docs kept in step with the code.                                                                                                                                                              |
| `planning-and-task-breakdown`                                       | 3     | Turn the approved decisions into ordered, verifiable tasks.                                                                                                                                                                                                                |
| `mattpocock-skills:prototype`                                       | 3     | Throwaway spikes for proposals whose feasibility, cost or benefit reading cannot settle.                                                                                                                                                                                   |
| `incremental-implementation`                                        | 4     | Thin slices, each tested and committed before the next begins.                                                                                                                                                                                                             |
| `code-simplification`                                               | 4     | Internal simplification that leaves behaviour unchanged.                                                                                                                                                                                                                   |
| `performance-optimization`                                          | 4     | Measure against the stage 1 baselines before and after any performance change.                                                                                                                                                                                             |
| `debugging-and-error-recovery`, `mattpocock-skills:diagnosing-bugs` | all   | When a check fails or a bug appears: find the root cause, do not guess.                                                                                                                                                                                                    |
| `code-review-and-quality`                                           | 4     | The independent review after the last refactor commit.                                                                                                                                                                                                                     |
| `security-and-hardening`                                            | 2, 4  | Stage 2: a read-only audit of dependencies (is each runtime dependency needed), supply-chain risk, and `persist` and `devtools` handling untrusted stored data, so its findings reach the stage 3 decision. Stage 4: the approved fixes.                                   |
| `ci-cd-and-automation`                                              | 1, 4  | Stage 1: add the CI gates that `CONSTRAINTS.md` needs and CI lacks, so the bar holds while the code is refactored. Stage 4: keep the gates in step with approved changes.                                                                                                  |
| `git-workflow-and-versioning`                                       | 4, 5  | Atomic commits, semver, changeset and changelog, release tagging.                                                                                                                                                                                                          |
| `deprecation-and-migration`                                         | 5     | Write the post-1.0 policy for renaming or removing exports. Not needed before 1.0: there are no users to migrate.                                                                                                                                                          |
| `shipping-and-launch`                                               | 5     | The pre-publish checklist for 1.0.0.                                                                                                                                                                                                                                       |

Adapter work only:

- `codebelt-code-style`: the React adapter, the Next.js example and the docs
  site's React code.
- `codebelt-solidjs`: the Solid adapter and the Solid example.

Not for this work: `frontend-ui-engineering`, `frontend-design`, `dataviz`,
`browser-testing-with-devtools`, `next-best-practices`, `caveman`,
`article-writing`, `find-skills`, and the document-format skills.

## Agent models

The main thread runs Fable, and it is the one writer in stage 4. A helper agent
runs on Fable, on Opus, or on Sonnet at high effort, and never on anything
lower: no Haiku, and no Sonnet below high effort.

| Setting                               | Use it for                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fable, inherited from the main thread | Work that needs judgement about subtle code, or that feeds a design decision. Mutation triage in `core.ts`, `ownership.ts` and `snapshot.ts`. The stage 2 source reads (Valtio, MobX, Vue reactivity, Solid 2, Svelte 5, Preact Signals and the TC39 proposal, Immer), the adapter agent and the security agent. Stage 3 spikes and adversarial reviews. The independent review and the second comparison pass in stage 4. |
| Opus                                  | Work in between: it needs judgement but does not decide the design. Writing characterisation and type tests through the public API. Mutation triage in the utility files when a survivor is subtle. It may also stand in for Fable when usage is short, except on the three core files.                                                                                                                                    |
| Sonnet at high effort                 | Self-contained work whose result a tool checks, and reading that only summarises. Mutation triage in `persist.ts`, `history.ts`, `equality.ts` and `collections.ts`, where the mutation runner checks the result. The stage 2 reads marked "API read only" (Legend-State, Zustand and Jotai). Running suites and collecting their results.                                                                                 |

When it is unclear which applies, use the higher one.

Running them, as learned on 2026-11-18:

- At most four at once. Six Fable agents in parallel used a five-hour
  allowance in about an hour.
- Every brief tells the agent to commit as soon as a file is in a good state.
  After a session restart the agents could not be resumed, and what survived
  was what they had left in their worktrees.
- Each agent uses a scratch folder of its own. They share one scratchpad, and
  one agent overwrote another's files there.

## Stage 1: Safety net (one agent, tests and tooling, no library source changes)

Skills: `constraint-driven-development`, `test-driven-development`,
`mattpocock-skills:tdd`, `debugging-and-error-recovery`,
`ci-cd-and-automation`.

Goal: any behaviour change in a later stage shows up as a failing test.

1. Tooling first. None of it is in the repo, and the items below and stage 4
   depend on it. Put each tool under `packages/classy-store/tests/` beside the
   existing harnesses, give it a root `package.json` command, and add that
   command to "Commands" above.
   - A mutation runner. The earlier sweep (655 single-line mutants: 595
     killed, 59 judged equivalent, 1 caught only by the Solid browser suite)
     left its tests on the branch but not its script, its mutation rules or
     its list of equivalents. The runner must be repeatable: fixed rules, a
     seed, a way to limit it to named files, and a tracked list of equivalent
     mutants with a reason for each. Its rules must mutate every condition
     (negate it, force it true, force it false), because the mutation run
     stands in for branch coverage. The unit suite takes about 4 seconds, so
     655 mutants take about 45 minutes run one at a time.
   - A bundle-size script: minified and gzipped bytes for each entry point.
     No script measures this today, so the sizes in `CLAUDE.md` cannot be
     checked by a command.
   - A core benchmark: per-operation timings for read, write, snapshot and
     getter. The existing benchmark measures React commits in Chromium, not
     core operations.
2. Line and function coverage for `src/core`, `src/snapshot`,
   `src/collections`, `src/utils`, `src/frameworks`, from `bun test --coverage`.
   Bun 1.4.4 reports no branch coverage, in its table or in its lcov file, so
   branches are covered by the mutation run: a surviving mutant of a condition
   is an untested branch. Every uncovered line gets a test, or a line in the
   report saying why it cannot be reached.
3. Full mutation testing with that runner of `core.ts`, `ownership.ts`,
   `snapshot.ts`, `collections.ts`, `persist.ts`, `history.ts`, `equality.ts`.
   Each surviving mutant is either killed by a new test or added to the
   tracked list of equivalent mutants with a reason. The earlier sweep's 59
   equivalents were never written down, so expect to explain about that many
   again.
4. Characterisation tests for behaviour nobody has written down:
   - notification order across owners and across stores;
   - a listener that throws, subscribes or unsubscribes during delivery;
   - suspended subtrees: detach, mutate while detached, re-attach, shared
     children with several owners, garbage collection of dead owners;
   - getters: nested getters, getters reading children, cycles, getters on
     object literals and on subclasses, setters;
   - proxy invariants: frozen, sealed and non-extensible objects,
     non-configurable and non-writable properties, symbols, `__proto__` keys,
     sparse arrays, array `length` writes, `Object.defineProperty` on a store;
   - identity: the same raw object in two stores, a store inside a store,
     a proxy assigned into another store, cycles.
5. Pair every test of internal state with a test of public behaviour. Tests
   read internal state through `getInternal`, `getVersion`, `identityOf` and
   `unwrap`, which the public entry does not export. For each such assertion,
   add a test of the same fact through the public API (a notification, a
   snapshot, a getter result, or a dropped object being collected), or say in
   the report why nothing public can observe it. List these tests in the
   report; stage 4 may rewrite those and no others. Two groups stand out:
   - `core.ownership.test.ts` and `core.memory.test.ts` assert on
     `getInternal(x).parents`, `.childInternals` and `.reference`, the
     structures in `ownership.ts` that stage 3 may decide to reshape.
   - The adapter tests, `history.test.ts` and the Solid browser fixtures read
     the listener sets `syncListeners` and `batchedListeners`.
6. Extend the seeded differential fuzz test to getters, shared children,
   reactive collections, `batch()`, deletes and array methods. A plain-object
   model is the oracle.
7. Type tests for every public export and overload.
8. Save baselines: performance and memory suites at full size, bundle sizes
   per entry point, and per-operation timings (read, write, snapshot, getter).
   - Run the per-operation timings in both Bun (JavaScriptCore) and Node
     (V8). The 40 ns figure under "Findings already in hand" does not say
     which engine it came from.
   - Run each suite at least five times and record the spread. Stage 4 treats
     a difference inside that spread as noise and one outside it as a change.
   - Record the machine, the OS, and the Bun, Node and browser versions.
   - Save the results where Git tracks them, next to each harness. The
     existing harnesses write their JSON to `test-results/`, which is ignored.
9. Record the quality bar in `CONSTRAINTS.md` from the numbers measured above.
   - Write performance limits as ratios measured in one run (a store read
     against a raw property read, for example), not as absolute times, so
     they hold on another machine and in CI.
   - The rule on skipped tests is no unconditional `skip`, `todo` or `only`.
     The one skip in the package today is conditional and stays: clipboard
     permissions outside Chromium, in `tests/browser/updates.spec.ts`.
   - Record the type and lint suppressions that exist today as the ceiling.
10. Add the CI gates that `CONSTRAINTS.md` needs and CI lacks: coverage,
    bundle size, skipped or focused tests, and new suppressions. CI gates
    lint, types, tests, build and the packed-package checks already. The
    mutation run is too slow for every push and stays a local command.

Gate: all existing checks pass, the validation matrix included, so a later
failure can be traced to a later change; mutation survivors are zero or
explained; and the tooling, the baselines, `CONSTRAINTS.md` and the new CI
gates are committed. Report any bug found; do not fix it in this stage unless
the fix is one line and the owner agrees.

## Stage 2: Library comparison (one read-only agent per library, plus adapters and security, parallel)

Skills: `source-driven-development`, `mattpocock-skills:research`,
`api-and-interface-design`. The security agent adds `security-and-hardening`.

Each library agent reads source, not documentation, at the files listed, and
records the package version or commit it read. Each also ports five to ten of
our edge-case tests to the other library and records how it behaves. The ports
are written and run in a scratch folder with that library installed there,
and the ported code goes in the report. Each agent writes one file,
`review/stage-2/<name>.md`, and changes nothing else in this checkout.

| Library                                      | Files to read                                                                                                                                              | Focus                                                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valtio                                       | `vanilla.ts`, `react.ts`, `vanilla/utils/*`, `proxy-compare`                                                                                               | Closest relative. Where are we more complicated for the same result? Version and snapshot caching, `ref()`, `proxyMap`/`proxySet`, `subscribeKey`, `devtools`, `useSnapshot` sync option.                                           |
| MobX                                         | `core/` (atom, derivation, computedvalue, action, reaction, transaction), `types/observableobject.ts`, `types/observablearray.ts`, `api/makeObservable.ts` | Getter memoization and dependency validation, transactions and `runInAction`, strict mode, `autoBind`, subclassing rules, how `this` and arrow functions are handled.                                                               |
| Vue reactivity                               | `reactive.ts`, `baseHandlers.ts`, `collectionHandlers.ts`, `arrayInstrumentations.ts`, `dep.ts`, `effect.ts`, `computed.ts`                                | The most thorough proxy handlers. `has`, `ownKeys`, `deleteProperty`, array method instrumentation, native Map/Set reactivity, `markRaw`, `toRaw`, `shallowReactive`, readonly proxies.                                             |
| Solid 2                                      | `@solidjs/signals` `store/store.ts`, `store/types.ts`, `store/reconcile.ts`, `store/utils.ts`, dev diagnostics                                             | Wrappability rules, per-prototype caching, `reconcile`, `snapshot` and `deep`, diagnostic codes and how the dev build is split from production. A first pass is summarised under "Findings already in hand"; go deeper than it did. |
| Svelte 5                                     | `svelte` `src/internal/client/proxy.js`, `src/reactivity/map.js`, `src/reactivity/set.js` (version 5.57.3 is installed in this repo)                       | The `$state` proxy: which values it wraps and which it leaves alone, class instances and class fields, and why `SvelteMap` and `SvelteSet` are separate classes that extend the native ones. Bears on API questions 5 and 6.        |
| Preact Signals and the TC39 Signals proposal | `signals-core/src/index.ts`, the proposal's polyfill                                                                                                       | Computed invalidation algorithm (push-pull, version checks), glitch freedom, cycle detection, batching. Compare only with our getter memoization.                                                                                   |
| Immer                                        | `core/proxy.ts`, `core/finalize.ts`, `utils/common.ts`                                                                                                     | Structural sharing, auto-freezing, handling of frozen and non-configurable input, class instances (`immerable`), Map/Set drafts.                                                                                                    |
| Legend-State                                 | `ObservableObject.ts`, `batching.ts`, persist plugins                                                                                                      | Persistence and sync design, batching. API read only.                                                                                                                                                                               |
| Zustand and Jotai                            | middleware (`persist`, `devtools`, `subscribeWithSelector`), public hooks                                                                                  | API read only: what React users expect from a store, persist and devtools options, SSR and hydration story.                                                                                                                         |

Report format, one entry per finding:

- **What they do**, with file and function.
- **What we do**, with `file:line`.
- **Difference in behaviour**, with a runnable reproduction where there is one.
- **Proposal**: adopt, adapt, or reject, and why.
- **Kind**: bug, simplification, performance, API design, diagnostics, docs.
- **Cost**: files touched, breaking or not, risk.

Every library agent also answers these API questions from its library's point
of view, and writes "no position" where the library has none (Immer has no
subscriptions, for example):

1. Should synchronous notification be the default for `subscribe()`?
2. Should writes outside a store method be allowed, warned about, or grouped
   automatically? Does `batch()` belong in the API?
3. Should snapshot getters stay enumerable own accessors?
4. Can arrow-function methods and `#private` fields be made to work, for
   example with a base class or a constructor that returns the proxy?
5. Should native `Map` and `Set` be reactive directly, replacing
   `reactiveMap` and `reactiveSet`?
6. Is opt-in (`PROXYABLE`) or opt-out (`markRaw`, `ref`, freezing) the better
   default for nested class instances?
7. Are the entry points, export names and adapter names consistent across the
   five frameworks?
8. What development-only diagnostics would catch our silent failure modes?

Two more read-only agents run alongside the library agents. They use the same
report format and write to the same folder:

- **Adapters.** Reads our five adapters, and each framework's official
  guidance for binding an external store: React (`useSyncExternalStore`,
  server snapshots, the React Compiler), Vue (refs and effect scopes), Svelte
  (the store contract the adapter targets, and what Svelte 5 offers for
  binding an external store to runes), Solid 2 and Angular (signals,
  `DestroyRef`). It also reads the public API of Pinia and NgRx SignalStore,
  because Zustand and Jotai show only what React users expect. It answers API
  question 7, and says for each adapter whether its name, return type and
  cleanup are what that framework's users would expect.
- **Security.** Audits the dependencies and the supply chain (`proxy-compare`
  is the only runtime dependency; publishing uses npm provenance), and how
  `persist` and `devtools` treat data they did not write: stored JSON with
  `__proto__` or `constructor` keys, version and migration input, cross-tab
  storage events, and DevTools messages that set state. Each finding is a
  proposal for stage 3, so the owner decides on it with the rest.

## Stage 3: Design review (one agent: read and experiment, the owner decides, then write)

1. Merge the stage 2 reports and remove duplicates.
2. Review our own code independently of other libraries: every function in
   `core.ts`, `ownership.ts` and `snapshot.ts` must have a stated reason to
   exist. Flag code that a test does not require (delete it in a throwaway
   worktree and see what fails), duplicated logic, and names that no longer
   match behaviour.
3. Spike what reading cannot settle. Where a proposal's feasibility, cost or
   benefit is uncertain, build a throwaway spike in a scratch worktree and
   measure it against the stage 1 baselines: which tests fail, bundle size,
   per-operation timings. Likely candidates: arrow-function methods through a
   base class or a constructor that returns the proxy, native `Map` and `Set`
   reactivity, per-prototype descriptor caching, `has` and `ownKeys` traps,
   and a development build. Spike code is never committed to the branch;
   stage 4 writes the approved change again, test first.
4. Produce one decision document, `review/stage-3-decisions.md`, grouped by:
   bugs, internal simplification, public API, diagnostics, performance. Each
   proposed change has options, a recommendation, the tests it affects, its
   cost, any number it would move in `CONSTRAINTS.md`, and one of two labels:
   - **Before 1.0**: it changes the public API or documented behaviour, so
     after 1.0 it would be a breaking change.
   - **Can follow 1.0**: it could ship in a 1.x release without breaking a
     consumer. Internal simplification, performance and diagnostics are
     usually this kind.
5. In the same document, list every behaviour that stage 1 pinned and the
   docs do not promise: notification order across owners, for example.
   Recommend for each either **guaranteed** (documented, and changing it is a
   breaking change) or **unspecified** (it may change in a minor release).
   Without this, the stage 1 tests make every incidental behaviour part of
   the 1.0 contract.
6. The owner approves or rejects each item. Nothing is implemented before that.
7. From the approved items, write the 1.0 public API spec at `review/spec.md`
   and one decision record per change under `docs/decisions/`, then an ordered
   task list for stage 4. The spec lists guaranteed and unspecified behaviour
   separately.

Skills: `api-and-interface-design`, `mattpocock-skills:codebase-design`,
`mattpocock-skills:prototype`, `doubt-driven-development`,
`spec-driven-development`, `documentation-and-adrs`,
`planning-and-task-breakdown`.

## Stage 4: Refactor (one writer, one change per commit)

Skills: `incremental-implementation`, `test-driven-development`,
`mattpocock-skills:tdd`, `code-simplification`, `performance-optimization`,
`source-driven-development`, `security-and-hardening`, `ci-cd-and-automation`,
`documentation-and-adrs`, `git-workflow-and-versioning`,
`code-review-and-quality`, `doubt-driven-development`.

- Order: bugs, then API removals, then internal simplification, then the
  remaining API changes, then diagnostics, then performance. Removals come
  before simplification so nothing is simplified and then deleted. The
  stage 3 task list may reorder where one change depends on another.
- Each commit: the change, its tests, updated docs and examples, all checks,
  the mutation run on touched files, and a comparison with the stage 1
  baselines. A regression in performance, memory or bundle size is reported
  with numbers, not absorbed; a difference inside the spread recorded in
  stage 1 is noise. If the approved decision moves a number in
  `CONSTRAINTS.md`, the same commit edits that file and names the decision.
- A test of public behaviour may be changed only when the behaviour change
  was approved in stage 3; the commit message names the decision.
- A test of internal state, from the list stage 1 made, may be rewritten or
  removed when the internals it reads change. The commit message names the
  public-behaviour test that covers the same fact.
- After the last refactor commit, in this order:
  1. An independent review by an agent that took no part in the refactor.
  2. A second library-comparison pass limited to the areas that changed.
  3. Their findings go to the owner. An approved fix is committed under the
     same rules as any other change.
  4. Last, on the final commit: the full validation matrix (browsers, React
     versions with and without the compiler, Node versions, Vue, Svelte,
     Angular, Next.js, packed-consumer checks). The stage report names the
     commit it passed on. Any later commit that changes code, tests or build
     configuration means running it again.

## Stage 5: Release

Skills: `shipping-and-launch`, `git-workflow-and-versioning`,
`deprecation-and-migration`.

- Write the pre-publish checklist and the post-1.0 deprecation policy.
- Check that `website/content/docs/API_REFERENCE.md` says everything the spec
  says, then delete `review/` and this plan in one commit. Decision records,
  `CONSTRAINTS.md` and the stage 1 tooling stay.
- There is no release candidate and no soak period.
- The agent's work ends with a report that the branch is ready and what was
  verified. The merge and the 1.0.0 release happen only when the owner
  decides, and the owner gives that instruction or does it themselves.

# Mutation testing

`bun run test:mutation` changes the library's source one small step at a time
and runs the unit tests against each change. A change the tests do not notice
is a surviving mutant: either a test is missing, or the change cannot be
observed at all. Every survivor must be killed by a new test or listed under
[`equivalent/`](./equivalent) with a reason. Otherwise the run fails.

Bun reports line and function coverage only, so this run is also how branches
are checked. A condition that can be forced one way with no test failing is a
branch nothing tests.

## Running it

From the repository root:

```bash
bun run test:mutation                          # every target file
bun run test:mutation src/core/core.ts         # named files only
bun run test:mutation --sample 100 --seed 7    # a repeatable random sample
bun run test:mutation src/core/core.ts --list  # print the mutants, run nothing
```

The target files are listed in `runMutation.ts`. See [the results](./RESULTS.md)
of the last full run.

## How it works

- Each worker gets its own copy of `src` in a temporary directory. Mutants are
  written there, so the checkout is never modified, even if the run is killed.
- The unmodified tests run first in every copy, at the same concurrency. If any
  of them fails, nothing is mutated.
- For each mutant the tests nearest the file run first, then all of
  `bun test src`. The run stops at the first failing test.
- A mutant is killed when a test fails. It times out when the tests take four
  times as long as the unmodified run, with a floor of 30 seconds.
- `test-results/mutation/report.json` (ignored by Git) holds every mutant, its
  status and the first test that failed. A run of some files, or of a sample,
  writes `report-partial.json` beside it instead. `RESULTS.md` is rewritten
  after a run of every target file.

## Rules

The rules are fixed, so two runs on the same source give the same mutants.

| Rule                    | Change                                                 | Example                                |
| ----------------------- | ------------------------------------------------------ | -------------------------------------- |
| `ConditionalExpression` | Force a condition to `true` and to `false`             | `if (a < b)` becomes `if (true)`       |
| `ConditionNegation`     | Negate the condition of an `if`, a ternary or a loop   | `if (ready)` becomes `if (!(ready))`   |
| `EqualityOperator`      | Move a comparison to its boundary and to its opposite  | `a < b` becomes `a <= b` and `a >= b`  |
| `LogicalOperator`       | Swap `&&` and `\|\|`; turn `??` into `&&`              | `a && b` becomes `a \|\| b`            |
| `ArithmeticOperator`    | Swap `+` and `-`, `*` and `/`; turn `%` into `*`       | `a + b` becomes `a - b`                |
| `AssignmentOperator`    | Swap the paired compound assignments                   | `a += b` becomes `a -= b`              |
| `UpdateOperator`        | Swap `++` and `--`                                     | `i++` becomes `i--`                    |
| `UnaryOperator`         | Swap the sign                                          | `-a` becomes `+(a)`                    |
| `BooleanLiteral`        | Flip a boolean; remove a `!`                           | `true` becomes `false`                 |
| `StringLiteral`         | Empty a string; fill an empty one                      | `'a'` becomes `''`                     |
| `ArrayDeclaration`      | Empty an array literal                                 | `[a, b]` becomes `[]`                  |
| `ObjectLiteral`         | Empty an object literal                                | `{a}` becomes `{}`                     |
| `OptionalChaining`      | Make an optional access unconditional                  | `a?.b` becomes `a.b`                   |
| `MethodExpression`      | Swap paired methods; drop a filtering or ordering call | `list.some(f)` becomes `list.every(f)` |
| `BlockStatement`        | Empty a block                                          | `{ notify(); }` becomes `{}`           |
| `StatementRemoval`      | Remove one statement                                   | `notify();` becomes `;`                |

Each side of an `&&` or `||` is forced as a condition too, and so is a
comparison used as a value.

Left alone, because the change would say nothing about the tests:

- Types, import paths and property names.
- Message text: a string passed to `console`, to an error constructor, or
  thrown.
- A string compared with `===` or `!==`. Forcing the comparison covers it.
- A loop condition forced to `true`, which would never end.
- A `super()` call, and a statement that is alone in its block (emptying the
  block is the same change).

## When a mutant survives

1. Read the change. The run prints its line and its key, for example
   `src/core/core.ts | subscribe | StatementRemoval | listeners.add(listener); => ; | #1`.
2. If a caller of the public API could notice the change, write the test that
   does, through the public entry points.
3. If nothing observable changes, add the mutant to the list for its source
   file under `equivalent/` (`core.json` for `core.ts`, and so on) with a
   reason. The `unexplained` array of the report holds each survivor in the
   shape those lists expect.

A reason says why behaviour is identical with and without the change, for
example "the cache is only a shortcut: without it the value is computed again
and is the same". "Hard to test" is not a reason.

A key holds no line number, so it stays valid when code moves. It changes when
the mutated code itself changes. An entry that matches no mutant, or one a test
now notices, also fails the run, so the list cannot go stale.

## Why a script and not StrykerJS

StrykerJS 10 has no plugin for Bun's test runner, so it would fall back to its
command runner, which runs every test for every mutant exactly as this script
does. It has no rule that removes one statement, and in this library the loss
of a single call (a notification, a version bump, a detach) is the change that
matters most. It marks an equivalent mutant with a comment in the source file,
where this script keeps the list beside the tests.

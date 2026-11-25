# Stage 4 working results

Results of stage 4 that later commits are compared with. They are deleted
with the rest of `review/` in stage 5.

## Checkpoint 1: the starting figures

`core-bun-start.json` and `core-node-start.json` are the core benchmark at
`a46cd96`, five fresh processes per engine, on the machine stage 4 runs on
(Apple M1 Max; Bun 1.4.5 and Node 24). No library source has changed since
stage 1, so they measure the same code as `tests/benchmark/baseline.json`.
Every row is inside the stage 1 spread or within a few percent of it, and
every ratio is inside its limit:

| Ratio           |  Bun | Limit | Node | Limit |
| --------------- | ---: | ----: | ---: | ----: |
| read            | 12.8 |    20 | 2.07 |   2.5 |
| write           | 2.62 |   3.2 | 1.34 |   1.7 |
| cached getter   | 27.3 |    41 | 3.55 |   5.3 |
| cached snapshot | 6.32 |    10 | 1.39 |   1.8 |

Checkpoint 1 also passed: `bun run checkall`, `bun run test:coverage`
(1,387 tests, every source file at 100% of lines and functions), `bun run
size` with every budget under its ceiling, and `bun run check:floor` on all
88 commits after the commit that added `CONSTRAINTS.md`.

## Checkpoint 2: after the dead code went

`core-bun-checkpoint-2.json` and `core-node-checkpoint-2.json` are the full
core benchmark at `7737d15`, after T-03 to T-07. Every row's range overlaps
its range at checkpoint 1, and every ratio is inside its limit:

| Ratio           |  Bun | Limit | Node | Limit |
| --------------- | ---: | ----: | ---: | ----: |
| read            | 14.7 |    20 | 2.08 |   2.5 |
| write           | 2.61 |   3.2 | 1.35 |   1.7 |
| cached getter   |   27 |    41 | 3.57 |   5.3 |
| cached snapshot | 6.98 |    10 | 1.41 |   1.8 |

The mutation run over all seven target files: 1,736 mutants, none
unexplained. The list of equivalent mutants went from 78 entries to 51 in
step 2. `bun run test:coverage` (1,388 tests, every file at 100%), the
typecheck, `bun run size` and `bun run check:floor` pass.

The two collection rows depend on what else runs in the process: in this
full run `collection.has.primitive` is 1,383 ns on Bun, and 593 when it runs
alone with `--only`, on the same code. Compare that row only with a run of
the same kind.

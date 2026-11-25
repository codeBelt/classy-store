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

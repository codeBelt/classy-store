# Mutation results

Written by `bun run test:mutation` after a run of every target file. Do not
edit it by hand. See the [guide](./README.md) for the rules and for how a
surviving mutant is handled.

Bun 1.4.4. Tests: `bun test src`.

| File                             | Mutants | Killed | Timed out | Equivalent | Unexplained |
| -------------------------------- | ------: | -----: | --------: | ---------: | ----------: |
| `src/core/core.ts`               |     467 |    440 |         3 |         24 |           0 |
| `src/core/ownership.ts`          |     167 |    150 |         5 |         12 |           0 |
| `src/snapshot/snapshot.ts`       |     179 |    168 |         2 |          9 |           0 |
| `src/collections/collections.ts` |     189 |    167 |        18 |          4 |           0 |
| `src/utils/persist/persist.ts`   |     463 |    446 |         0 |         17 |           0 |
| `src/utils/history/history.ts`   |     176 |    172 |         0 |          4 |           0 |
| `src/utils/equality/equality.ts` |     170 |    162 |         0 |          8 |           0 |
| Total                            |    1811 |   1705 |        28 |         78 |           0 |

## By rule

| Rule                  | Mutants | Killed | Timed out | Equivalent | Unexplained |
| --------------------- | ------: | -----: | --------: | ---------: | ----------: |
| ArithmeticOperator    |      15 |     14 |         0 |          1 |           0 |
| ArrayDeclaration      |      12 |     12 |         0 |          0 |           0 |
| BlockStatement        |     281 |    277 |         4 |          0 |           0 |
| BooleanLiteral        |     159 |    150 |         5 |          4 |           0 |
| ConditionalExpression |     681 |    625 |         4 |         52 |           0 |
| ConditionNegation     |     115 |    115 |         0 |          0 |           0 |
| EqualityOperator      |     141 |    137 |         0 |          4 |           0 |
| LogicalOperator       |      86 |     80 |         1 |          5 |           0 |
| MethodExpression      |       9 |      9 |         0 |          0 |           0 |
| ObjectLiteral         |      41 |     33 |         8 |          0 |           0 |
| OptionalChaining      |      13 |     13 |         0 |          0 |           0 |
| StatementRemoval      |     204 |    190 |         4 |         10 |           0 |
| StringLiteral         |      26 |     24 |         0 |          2 |           0 |
| UnaryOperator         |       7 |      7 |         0 |          0 |           0 |
| UpdateOperator        |      21 |     19 |         2 |          0 |           0 |

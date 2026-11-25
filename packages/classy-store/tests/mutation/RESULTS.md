# Mutation results

Written by `bun run test:mutation` after a run of every target file. Do not
edit it by hand. See the [guide](./README.md) for the rules and for how a
surviving mutant is handled.

Bun 1.4.5. Tests: `bun test src`.

| File                             | Mutants | Killed | Timed out | Equivalent | Unexplained |
| -------------------------------- | ------: | -----: | --------: | ---------: | ----------: |
| `src/core/core.ts`               |     474 |    448 |         3 |         23 |           0 |
| `src/core/ownership.ts`          |     162 |    148 |         4 |         10 |           0 |
| `src/snapshot/snapshot.ts`       |     164 |    159 |         2 |          3 |           0 |
| `src/collections/collections.ts` |     189 |    167 |        18 |          4 |           0 |
| `src/utils/persist/persist.ts`   |     431 |    425 |         0 |          6 |           0 |
| `src/utils/history/history.ts`   |     165 |    165 |         0 |          0 |           0 |
| `src/utils/equality/equality.ts` |     151 |    146 |         0 |          5 |           0 |
| Total                            |    1736 |   1658 |        27 |         51 |           0 |

## By rule

| Rule                  | Mutants | Killed | Timed out | Equivalent | Unexplained |
| --------------------- | ------: | -----: | --------: | ---------: | ----------: |
| ArithmeticOperator    |      14 |     14 |         0 |          0 |           0 |
| ArrayDeclaration      |      12 |     12 |         0 |          0 |           0 |
| BlockStatement        |     275 |    272 |         3 |          0 |           0 |
| BooleanLiteral        |     151 |    146 |         5 |          0 |           0 |
| ConditionalExpression |     639 |    600 |         4 |         35 |           0 |
| ConditionNegation     |     112 |    112 |         0 |          0 |           0 |
| EqualityOperator      |     133 |    130 |         0 |          3 |           0 |
| LogicalOperator       |      79 |     73 |         1 |          5 |           0 |
| MethodExpression      |       9 |      9 |         0 |          0 |           0 |
| ObjectLiteral         |      41 |     33 |         8 |          0 |           0 |
| OptionalChaining      |      14 |     13 |         0 |          1 |           0 |
| StatementRemoval      |     201 |    192 |         4 |          5 |           0 |
| StringLiteral         |      28 |     26 |         0 |          2 |           0 |
| UnaryOperator         |       7 |      7 |         0 |          0 |           0 |
| UpdateOperator        |      21 |     19 |         2 |          0 |           0 |

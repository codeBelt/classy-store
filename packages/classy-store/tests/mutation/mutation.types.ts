export type MutatorName =
  | 'ArithmeticOperator'
  | 'ArrayDeclaration'
  | 'AssignmentOperator'
  | 'BlockStatement'
  | 'BooleanLiteral'
  | 'ConditionalExpression'
  | 'ConditionNegation'
  | 'EqualityOperator'
  | 'LogicalOperator'
  | 'MethodExpression'
  | 'ObjectLiteral'
  | 'OptionalChaining'
  | 'StatementRemoval'
  | 'StringLiteral'
  | 'UnaryOperator'
  | 'UpdateOperator';

/** What identifies a mutant. It holds no line number, so edits elsewhere in the file leave it valid. */
export type MutantKey = {
  /** Path relative to the package, for example `src/core/core.ts`. */
  file: string;
  /** Named functions, methods and declarations around the mutated code. */
  scope: string;
  mutator: MutatorName;
  /** The code that is replaced, with whitespace collapsed. */
  original: string;
  /** The code it is replaced with, with whitespace collapsed. */
  replacement: string;
  /** Position among identical mutants in the same scope, counted from 1 in source order. */
  occurrence: number;
};

/** One change the runner makes to a source file. */
export type Mutant = MutantKey & {
  id: string;
  line: number;
  column: number;
  start: number;
  end: number;
  /** The replacement exactly as it is written into the file. */
  replacementSource: string;
};

export type MutantStatus = 'killed' | 'survived' | 'timeout';

export type MutantResult = Mutant & {
  status: MutantStatus;
  /** The first failing test, when the test output names one. */
  killedBy?: string;
  durationMs: number;
};

/** An entry of a list under `equivalent/`: a mutant no test can detect, and why. */
export type EquivalentMutant = MutantKey & {
  reason: string;
};

export type MutationCounts = {
  mutants: number;
  killed: number;
  timeout: number;
  equivalent: number;
  unexplained: number;
};

export type MutationReport = {
  bun: string;
  concurrency: number;
  baselineMs: number;
  timeoutMs: number;
  targets: string[];
  sampled: boolean;
  totals: MutationCounts;
  /** Survivors with no entry under `equivalent/`, in the shape those lists expect. */
  unexplained: EquivalentMutant[];
  /** Entries under `equivalent/` that match no generated mutant, or one a test now detects. */
  stale: {entry: EquivalentMutant; problem: string}[];
  results: MutantResult[];
};

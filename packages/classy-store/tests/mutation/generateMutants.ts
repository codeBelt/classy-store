import {createHash} from 'node:crypto';
import {type NodePath, parseSync, types as t, traverse} from '@babel/core';
import type {Mutant, MutantKey, MutatorName} from './mutation.types';

type Range = {start: number; end: number};

type Draft = Range & {
  mutator: MutatorName;
  scope: string;
  line: number;
  column: number;
  replacementSource: string;
  /** How the key shows the change. */
  original: string;
  replacement: string;
};

/** The longest text a key shows in full. */
const displayLimit = 100;

const comparisonSwaps: Record<string, string[]> = {
  '<': ['<=', '>='],
  '<=': ['<', '>'],
  '>': ['>=', '<='],
  '>=': ['>', '<'],
  '==': ['!='],
  '!=': ['=='],
  '===': ['!=='],
  '!==': ['==='],
};

const arithmeticSwaps: Record<string, string> = {
  '+': '-',
  '-': '+',
  '*': '/',
  '/': '*',
  '%': '*',
};

const logicalSwaps: Record<string, string> = {
  '&&': '||',
  '||': '&&',
  '??': '&&',
};

const assignmentSwaps: Record<string, string> = {
  '+=': '-=',
  '-=': '+=',
  '*=': '/=',
  '/=': '*=',
  '%=': '*=',
  '&&=': '||=',
  '||=': '&&=',
  '??=': '&&=',
};

const methodSwaps: Record<string, string> = {
  some: 'every',
  every: 'some',
  startsWith: 'endsWith',
  endsWith: 'startsWith',
  min: 'max',
  max: 'min',
  toUpperCase: 'toLowerCase',
  toLowerCase: 'toUpperCase',
};

/** Calls that are replaced by the object they are called on. */
const removableMethods = new Set([
  'filter',
  'reverse',
  'slice',
  'sort',
  'trim',
]);

/** TypeScript nodes that wrap a runtime expression. Every other `TS*` node is type-only. */
const expressionWrappers = new Set([
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSParameterProperty',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

const digest = (text: string) =>
  createHash('sha1').update(text).digest('hex').slice(0, 8);

/**
 * Text for a key. Long code is cut in the middle and tagged with a digest of
 * the whole, so the key still changes whenever the code does.
 */
function shorten(text: string): string {
  const flat = collapse(text);
  return flat.length <= displayLimit
    ? flat
    : `${flat.slice(0, 60)} … ${flat.slice(-30)} [${digest(flat)}]`;
}

function rangeOf(node: t.Node): Range {
  if (typeof node.start !== 'number' || typeof node.end !== 'number') {
    throw new Error(`Node without a source range: ${node.type}`);
  }
  return {start: node.start, end: node.end};
}

function parse(file: string, source: string) {
  return parseSync(source, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    parserOpts: {
      plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
    },
  });
}

/** True when the source still parses, so a mutant cannot be "killed" by a syntax error. */
function parses(file: string, source: string): boolean {
  try {
    return parse(file, source) !== null;
  } catch {
    return false;
  }
}

function isFunctionLike(node: t.Node | null | undefined): boolean {
  return t.isFunctionExpression(node) || t.isArrowFunctionExpression(node);
}

/** Message text is not behaviour under test: strings passed to `console`, to an error, or thrown. */
function isMessageText(path: NodePath): boolean {
  return (
    path.findParent((parent) => {
      const {node} = parent;
      if (t.isThrowStatement(node)) return true;
      if (t.isNewExpression(node) && t.isIdentifier(node.callee)) {
        return node.callee.name.endsWith('Error');
      }
      return (
        t.isCallExpression(node) &&
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.object, {name: 'console'})
      );
    }) !== null
  );
}

/** Strings that name something for the module system or the object model, not a value. */
function isStructuralString(path: NodePath): boolean {
  const {node, parent} = path;
  if (
    t.isImportDeclaration(parent) ||
    t.isExportNamedDeclaration(parent) ||
    t.isExportAllDeclaration(parent) ||
    t.isImportExpression(parent) ||
    t.isTaggedTemplateExpression(parent)
  ) {
    return true;
  }
  if (
    (t.isObjectProperty(parent) ||
      t.isObjectMethod(parent) ||
      t.isClassProperty(parent) ||
      t.isClassMethod(parent)) &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }
  // `a === 'text'`: forcing the comparison already covers this.
  return t.isBinaryExpression(parent) && parent.operator in comparisonSwaps;
}

/**
 * Lists every mutant of one source file, in source order.
 *
 * The rules are fixed and listed in `README.md`. Each mutant replaces one
 * expression or statement, so its key reads as "this code became that code".
 */
export function generateMutants(file: string, source: string): Mutant[] {
  const ast = parse(file, source);
  if (!ast) return [];

  const drafts: Draft[] = [];
  const forced = new Set<string>();
  const textOf = (node: t.Node) => {
    const {start, end} = rangeOf(node);
    return source.slice(start, end);
  };

  const keyText = (key: t.Node, computed: boolean): string => {
    if (computed) return `[${textOf(key)}]`;
    if (t.isPrivateName(key)) return `#${key.id.name}`;
    if (t.isIdentifier(key)) return key.name;
    return textOf(key);
  };

  const nameOf = (path: NodePath): string | undefined => {
    const {node} = path;
    if (
      t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isClassDeclaration(node) ||
      t.isClassExpression(node)
    ) {
      return node.id?.name;
    }
    if (t.isClassMethod(node) || t.isObjectMethod(node)) {
      const name = keyText(node.key, node.computed);
      return node.kind === 'get' || node.kind === 'set'
        ? `${node.kind} ${name}`
        : name;
    }
    if (t.isClassPrivateMethod(node)) return keyText(node.key, false);
    if (
      (t.isClassProperty(node) || t.isObjectProperty(node)) &&
      isFunctionLike(node.value)
    ) {
      return keyText(node.key, node.computed);
    }
    if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) {
      return node.id.name;
    }
    return undefined;
  };

  const scopeOf = (path: NodePath): string => {
    const names: string[] = [];
    for (
      let current: NodePath | null = path;
      current;
      current = current.parentPath
    ) {
      const name = nameOf(current);
      if (name) names.unshift(name);
    }
    return names.length ? names.join(' > ') : '(module)';
  };

  const add = (
    mutator: MutatorName,
    path: NodePath,
    range: Range,
    replacementSource: string,
    display?: {original: string; replacement: string},
  ) => {
    const location = path.node.loc?.start;
    drafts.push({
      ...range,
      mutator,
      scope: scopeOf(path),
      line: location?.line ?? 0,
      column: location?.column ?? 0,
      replacementSource,
      original:
        display?.original ?? shorten(source.slice(range.start, range.end)),
      replacement: display?.replacement ?? shorten(replacementSource),
    });
  };

  /** Replaces the operator between two operands, keeping everything around it. */
  const swapOperator = (
    mutator: MutatorName,
    path: NodePath,
    left: t.Node,
    right: t.Node,
    operator: string,
    swapped: string | undefined,
  ) => {
    if (!swapped) return;
    const whole = rangeOf(path.node);
    const leftEnd = rangeOf(left).end;
    const rightStart = rangeOf(right).start;
    const gap = source.slice(leftEnd, rightStart);
    const index = gap.indexOf(operator);
    if (index === -1) return;
    const replacementSource =
      source.slice(whole.start, leftEnd) +
      gap.slice(0, index) +
      swapped +
      gap.slice(index + operator.length) +
      source.slice(rightStart, whole.end);

    const wholeText = collapse(source.slice(whole.start, whole.end));
    if (wholeText.length <= displayLimit) {
      add(mutator, path, whole, replacementSource);
      return;
    }
    // Show the operator with the code on either side of it, not the two ends
    // of a long expression.
    const operatorStart = leftEnd + index;
    const leftText = collapse(source.slice(whole.start, operatorStart));
    const rightText = collapse(
      source.slice(operatorStart + operator.length, whole.end),
    );
    const before = leftText.length > 36 ? `…${leftText.slice(-36)}` : leftText;
    const after =
      rightText.length > 36 ? `${rightText.slice(0, 36)}…` : rightText;
    add(mutator, path, whole, replacementSource, {
      original: `${before} ${operator} ${after} [${digest(wholeText)}]`,
      replacement: `${before} ${swapped} ${after}`,
    });
  };

  /** Forces a condition to each given value, once per expression. */
  const force = (path: NodePath<t.Expression>, values: boolean[]) => {
    const {node} = path;
    // A literal is flipped by the BooleanLiteral rule instead.
    if (t.isBooleanLiteral(node)) return;
    const range = rangeOf(node);
    const key = `${range.start}:${range.end}`;
    if (forced.has(key)) return;
    forced.add(key);
    for (const value of values) {
      add('ConditionalExpression', path, range, String(value));
    }
  };

  const negate = (path: NodePath<t.Expression>) => {
    const {node} = path;
    if (t.isBooleanLiteral(node)) return;
    // The EqualityOperator rule already produces the negated comparison.
    if (t.isBinaryExpression(node) && node.operator in comparisonSwaps) return;
    // The BooleanLiteral rule already removes the `!`.
    if (t.isUnaryExpression(node, {operator: '!'})) return;
    add('ConditionNegation', path, rangeOf(node), `!(${textOf(node)})`);
  };

  const branchCondition = (path: NodePath<t.Expression>) => {
    force(path, [true, false]);
    negate(path);
  };

  /** A loop forced to `true` never ends, so loops are only forced to `false`. */
  const loopCondition = (path: NodePath<t.Expression>) => {
    force(path, [false]);
    negate(path);
  };

  traverse(ast, {
    enter(path) {
      const {type} = path.node;
      if (type.startsWith('TS') && !expressionWrappers.has(type)) path.skip();
    },

    IfStatement(path) {
      branchCondition(path.get('test'));
    },

    ConditionalExpression(path) {
      branchCondition(path.get('test'));
    },

    WhileStatement(path) {
      loopCondition(path.get('test'));
    },

    DoWhileStatement(path) {
      loopCondition(path.get('test'));
    },

    ForStatement(path) {
      const test = path.get('test');
      if (test.isExpression()) loopCondition(test);
    },

    LogicalExpression(path) {
      const {node} = path;
      swapOperator(
        'LogicalOperator',
        path,
        node.left,
        node.right,
        node.operator,
        logicalSwaps[node.operator],
      );
      if (node.operator === '??') return;
      for (const side of ['left', 'right'] as const) {
        const operand = path.get(side);
        // A nested `&&` or `||` has its own operands forced.
        if (!operand.isLogicalExpression()) force(operand, [true, false]);
      }
    },

    BinaryExpression(path) {
      const {node} = path;
      if (!t.isExpression(node.left)) return;
      const comparisons = comparisonSwaps[node.operator];
      if (comparisons) {
        for (const swapped of comparisons) {
          swapOperator(
            'EqualityOperator',
            path,
            node.left,
            node.right,
            node.operator,
            swapped,
          );
        }
        force(path, [true, false]);
        return;
      }
      // `'a' + b` is a string, and `'a' - b` would only test that NaN is noticed.
      const isText = (operand: t.Node) =>
        t.isStringLiteral(operand) || t.isTemplateLiteral(operand);
      if (node.operator === '+' && (isText(node.left) || isText(node.right))) {
        return;
      }
      swapOperator(
        'ArithmeticOperator',
        path,
        node.left,
        node.right,
        node.operator,
        arithmeticSwaps[node.operator],
      );
    },

    AssignmentExpression(path) {
      const {node} = path;
      swapOperator(
        'AssignmentOperator',
        path,
        node.left,
        node.right,
        node.operator,
        assignmentSwaps[node.operator],
      );
    },

    UnaryExpression(path) {
      const {node} = path;
      const argument = `(${textOf(node.argument)})`;
      if (node.operator === '!') {
        add('BooleanLiteral', path, rangeOf(node), argument);
      } else if (node.operator === '-') {
        add('UnaryOperator', path, rangeOf(node), `+${argument}`);
      } else if (node.operator === '+') {
        add('UnaryOperator', path, rangeOf(node), `-${argument}`);
      }
    },

    UpdateExpression(path) {
      const {node} = path;
      const swapped = node.operator === '++' ? '--' : '++';
      const argument = textOf(node.argument);
      add(
        'UpdateOperator',
        path,
        rangeOf(node),
        node.prefix ? swapped + argument : argument + swapped,
      );
    },

    BooleanLiteral(path) {
      add('BooleanLiteral', path, rangeOf(path.node), String(!path.node.value));
    },

    StringLiteral(path) {
      if (isStructuralString(path) || isMessageText(path)) return;
      add(
        'StringLiteral',
        path,
        rangeOf(path.node),
        path.node.value === '' ? "'mutated'" : "''",
      );
    },

    TemplateLiteral(path) {
      if (isStructuralString(path) || isMessageText(path)) return;
      const {quasis} = path.node;
      const isEmpty = quasis.length === 1 && quasis[0]?.value.raw === '';
      add(
        'StringLiteral',
        path,
        rangeOf(path.node),
        isEmpty ? '`mutated`' : '``',
      );
    },

    ArrayExpression(path) {
      if (path.node.elements.length > 0) {
        add('ArrayDeclaration', path, rangeOf(path.node), '[]');
      }
    },

    ObjectExpression(path) {
      if (path.node.properties.length > 0) {
        add('ObjectLiteral', path, rangeOf(path.node), '{}');
      }
    },

    OptionalMemberExpression(path) {
      const {node} = path;
      if (!node.optional) return;
      const whole = rangeOf(node);
      const objectEnd = rangeOf(node.object).end;
      const propertyStart = rangeOf(node.property).start;
      const gap = source.slice(objectEnd, propertyStart);
      const index = gap.indexOf('?.');
      if (index === -1) return;
      add(
        'OptionalChaining',
        path,
        whole,
        source.slice(whole.start, objectEnd) +
          gap.slice(0, index) +
          (node.computed ? '' : '.') +
          gap.slice(index + 2) +
          source.slice(propertyStart, whole.end),
      );
    },

    OptionalCallExpression(path) {
      const {node} = path;
      if (!node.optional) return;
      const whole = rangeOf(node);
      const calleeEnd = rangeOf(node.callee).end;
      const rest = source.slice(calleeEnd, whole.end);
      const index = rest.indexOf('?.');
      if (index === -1) return;
      add(
        'OptionalChaining',
        path,
        whole,
        source.slice(whole.start, calleeEnd) +
          rest.slice(0, index) +
          rest.slice(index + 2),
      );
    },

    CallExpression(path) {
      const {callee} = path.node;
      if (
        !t.isMemberExpression(callee) ||
        callee.computed ||
        !t.isIdentifier(callee.property)
      ) {
        return;
      }
      const whole = rangeOf(path.node);
      const property = rangeOf(callee.property);
      const swapped = methodSwaps[callee.property.name];
      if (swapped) {
        add(
          'MethodExpression',
          path,
          whole,
          source.slice(whole.start, property.start) +
            swapped +
            source.slice(property.end, whole.end),
        );
      }
      if (removableMethods.has(callee.property.name)) {
        add('MethodExpression', path, whole, `(${textOf(callee.object)})`);
      }
    },

    BlockStatement(path) {
      if (path.node.body.length > 0) {
        add('BlockStatement', path, rangeOf(path.node), '{}');
      }
    },

    ExpressionStatement(path) {
      const {expression} = path.node;
      if (t.isCallExpression(expression) && t.isSuper(expression.callee))
        return;
      const parent = path.parentPath;
      // Emptying the block has the same effect and is listed there.
      if (parent.isBlockStatement() && parent.node.body.length === 1) return;
      add('StatementRemoval', path, rangeOf(path.node), ';');
    },
  });

  drafts.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      a.mutator.localeCompare(b.mutator) ||
      a.replacementSource.localeCompare(b.replacementSource),
  );

  const mutants: Mutant[] = [];
  const spots = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const draft of drafts) {
    const {original, replacement} = draft;
    if (original === replacement) continue;

    const spot = `${draft.start}:${draft.end}:${draft.replacementSource}`;
    if (spots.has(spot)) continue;
    spots.add(spot);

    const partialKey = [
      file,
      draft.scope,
      draft.mutator,
      original,
      replacement,
    ].join(' | ');
    const occurrence = (occurrences.get(partialKey) ?? 0) + 1;
    occurrences.set(partialKey, occurrence);

    const key: MutantKey = {
      file,
      scope: draft.scope,
      mutator: draft.mutator,
      original,
      replacement,
      occurrence,
    };
    const mutant: Mutant = {
      ...key,
      id: mutantId(key),
      line: draft.line,
      column: draft.column,
      start: draft.start,
      end: draft.end,
      replacementSource: draft.replacementSource,
    };
    if (parses(file, applyMutant(source, mutant))) mutants.push(mutant);
  }
  return mutants;
}

/** The key as one line: this is what reports print and what the equivalent list is matched on. */
export function mutantId(key: MutantKey): string {
  return `${key.file} | ${key.scope} | ${key.mutator} | ${key.original} => ${key.replacement} | #${key.occurrence}`;
}

export function applyMutant(source: string, mutant: Mutant): string {
  return (
    source.slice(0, mutant.start) +
    mutant.replacementSource +
    source.slice(mutant.end)
  );
}

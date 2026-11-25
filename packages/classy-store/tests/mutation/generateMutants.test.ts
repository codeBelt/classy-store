import {describe, expect, it} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {applyMutant, generateMutants, mutantId} from './generateMutants';

/** Each mutant as `Rule: original => replacement`, in the order the runner uses. */
const changes = (source: string) =>
  generateMutants('sample.ts', source).map(
    (mutant) =>
      `${mutant.mutator}: ${mutant.original} => ${mutant.replacement}`,
  );

const changesBy = (rule: string, source: string) =>
  changes(source).filter((change) => change.startsWith(`${rule}:`));

describe('conditions', () => {
  it('forces an if condition both ways and negates it', () => {
    expect(changes('if (ready) run();')).toEqual([
      'ConditionalExpression: ready => false',
      'ConditionalExpression: ready => true',
      'ConditionNegation: ready => !(ready)',
      'StatementRemoval: run(); => ;',
    ]);
  });

  it('forces and negates the condition of a ternary', () => {
    expect(changes('const size = wide ? 2 : 1;')).toEqual([
      'ConditionalExpression: wide => false',
      'ConditionalExpression: wide => true',
      'ConditionNegation: wide => !(wide)',
    ]);
  });

  it('swaps a comparison to its boundary and to its opposite, and forces it', () => {
    expect(changes('if (a < b) run();')).toEqual([
      'ConditionalExpression: a < b => false',
      'ConditionalExpression: a < b => true',
      'EqualityOperator: a < b => a <= b',
      'EqualityOperator: a < b => a >= b',
      'StatementRemoval: run(); => ;',
    ]);
  });

  it('does not negate a condition that already starts with a not', () => {
    expect(changes('if (!ready) run();')).toEqual([
      'BooleanLiteral: !ready => (ready)',
      'ConditionalExpression: !ready => false',
      'ConditionalExpression: !ready => true',
      'StatementRemoval: run(); => ;',
    ]);
  });

  it('never forces a loop to run forever', () => {
    expect(changes('while (index < size) index++;')).toEqual([
      'ConditionalExpression: index < size => false',
      'EqualityOperator: index < size => index <= size',
      'EqualityOperator: index < size => index >= size',
      'UpdateOperator: index++ => index--',
      'StatementRemoval: index++; => ;',
    ]);
  });

  it('forces each side of a logical expression and swaps its operator', () => {
    expect(changes('const ok = first && second;')).toEqual([
      'ConditionalExpression: first => false',
      'ConditionalExpression: first => true',
      'LogicalOperator: first && second => first || second',
      'ConditionalExpression: second => false',
      'ConditionalExpression: second => true',
    ]);
  });

  it('forces a comparison that is used as a value', () => {
    expect(changes('const same = left === right;')).toEqual([
      'ConditionalExpression: left === right => false',
      'ConditionalExpression: left === right => true',
      'EqualityOperator: left === right => left !== right',
    ]);
  });

  it('swaps a nullish operator without forcing its sides', () => {
    expect(changes('const value = given ?? fallback;')).toEqual([
      'LogicalOperator: given ?? fallback => given && fallback',
    ]);
  });
});

describe('statements and blocks', () => {
  it('removes a statement, except one that is alone in its block or calls super', () => {
    const source = `
      class Child extends Parent {
        constructor() {
          super();
          this.first = 1;
          this.second = 2;
        }
        announce() {
          notify();
        }
      }
    `;
    expect(changesBy('StatementRemoval', source)).toEqual([
      'StatementRemoval: this.first = 1; => ;',
      'StatementRemoval: this.second = 2; => ;',
    ]);
    expect(changesBy('BlockStatement', source)).toEqual([
      'BlockStatement: { super(); this.first = 1; this.second = 2; } => {}',
      'BlockStatement: { notify(); } => {}',
    ]);
  });

  it('leaves an empty block alone', () => {
    expect(changes('function nothing() {}')).toEqual([]);
  });
});

describe('operators and literals', () => {
  it('swaps arithmetic, assignment, update and sign operators', () => {
    const source = `
      const sum = a + b;
      total += sum;
      total++;
      const negative = -sum;
    `;
    expect(changes(source)).toEqual([
      'ArithmeticOperator: a + b => a - b',
      'AssignmentOperator: total += sum => total -= sum',
      'StatementRemoval: total += sum; => ;',
      'UpdateOperator: total++ => total--',
      'StatementRemoval: total++; => ;',
      'UnaryOperator: -sum => +(sum)',
    ]);
  });

  it('does not turn string concatenation into subtraction', () => {
    expect(
      changesBy('ArithmeticOperator', "const label = 'id-' + id;"),
    ).toEqual([]);
  });

  it('flips booleans and empties strings, arrays and objects', () => {
    const source = `
      const flags = [true, 1];
      const options = {deep: false};
      const name = 'store';
      const blank = '';
    `;
    expect(changes(source)).toEqual([
      'ArrayDeclaration: [true, 1] => []',
      'BooleanLiteral: true => false',
      'ObjectLiteral: {deep: false} => {}',
      'BooleanLiteral: false => true',
      "StringLiteral: 'store' => ''",
      "StringLiteral: '' => 'mutated'",
    ]);
  });

  it('makes an optional access, index and call unconditional', () => {
    const source = 'a?.b; a?.[key]; a?.();';
    expect(changesBy('OptionalChaining', source)).toEqual([
      'OptionalChaining: a?.b => a.b',
      'OptionalChaining: a?.[key] => a[key]',
      'OptionalChaining: a?.() => a()',
    ]);
  });

  it('swaps paired methods and removes filtering and ordering calls', () => {
    const source = `
      const any = list.some(isSet);
      const count = list.filter(isSet).length;
      const least = Math.min(a, b);
    `;
    expect(changesBy('MethodExpression', source)).toEqual([
      'MethodExpression: list.some(isSet) => list.every(isSet)',
      'MethodExpression: list.filter(isSet) => (list)',
      'MethodExpression: Math.min(a, b) => Math.max(a, b)',
    ]);
  });
});

describe('code that is left alone', () => {
  it('skips types', () => {
    const source = `
      type Mode = 'on' | 'off';
      interface Options {
        strict: true;
      }
      const mode: 'on' = 'on' as 'on';
    `;
    expect(changes(source)).toEqual(["StringLiteral: 'on' => ''"]);
  });

  it('skips import paths, property names, message text and compared strings', () => {
    const source = `
      import {helper} from './helper';
      const table = {'a-key': helper};
      if (kind === 'text') console.error('bad kind');
      throw new TypeError('never');
    `;
    expect(changesBy('StringLiteral', source)).toEqual([]);
  });
});

describe('keys', () => {
  it('names the enclosing scope and counts repeats within it', () => {
    const source = `
      class Store {
        get total() {
          return this.a + this.b;
        }
        reset() {
          emit();
          emit();
          finish();
        }
      }
      const helper = () => {
        emit();
        finish();
      };
    `;
    const ids = generateMutants('sample.ts', source).map((mutant) => mutant.id);
    expect(ids).toContain(
      'sample.ts | Store > get total | ArithmeticOperator | this.a + this.b => this.a - this.b | #1',
    );
    expect(ids).toContain(
      'sample.ts | Store > reset | StatementRemoval | emit(); => ; | #1',
    );
    expect(ids).toContain(
      'sample.ts | Store > reset | StatementRemoval | emit(); => ; | #2',
    );
    expect(ids).toContain(
      'sample.ts | helper | StatementRemoval | emit(); => ; | #1',
    );
  });

  it('stay the same when code is added elsewhere in the file', () => {
    const original = 'function keep(a, b) {\n  return a < b;\n}\n';
    const edited = `function added(c) {\n  return !c;\n}\n\n${original}`;
    const idsIn = (source: string) =>
      generateMutants('sample.ts', source)
        .filter((mutant) => mutant.scope === 'keep')
        .map((mutant) => mutant.id);
    expect(idsIn(edited)).toEqual(idsIn(original));
    expect(idsIn(original)).toHaveLength(5);
  });

  it('cut long code in the middle and tag it with a digest of the whole', () => {
    const body = (marker: string) =>
      `function long() {\n${Array.from({length: 12}, (_, index) => `  step${index}('${index === 6 ? marker : 'same'}');`).join('\n')}\n}\n`;
    const blockOf = (source: string) =>
      generateMutants('sample.ts', source).find(
        (mutant) => mutant.mutator === 'BlockStatement',
      )?.original;
    const first = blockOf(body('one'));
    const second = blockOf(body('two'));
    expect(first).toMatch(/^\{ step0\('same'\); .* … .* \[[0-9a-f]{8}\]$/);
    // The two bodies differ only in the part the key does not show.
    expect(first?.replace(/\[[0-9a-f]{8}\]$/, '')).toBe(
      second?.replace(/\[[0-9a-f]{8}\]$/, '') as string,
    );
    expect(first).not.toBe(second as string);
  });

  it('are built from the fields the equivalent list stores', () => {
    expect(
      mutantId({
        file: 'src/a.ts',
        scope: 'run',
        mutator: 'BooleanLiteral',
        original: 'true',
        replacement: 'false',
        occurrence: 2,
      }),
    ).toBe('src/a.ts | run | BooleanLiteral | true => false | #2');
  });
});

describe('a real source file', () => {
  const file = 'src/utils/equality/equality.ts';
  const source = readFileSync(join(import.meta.dir, '../..', file), 'utf8');
  const mutants = generateMutants(file, source);

  it('yields mutants with unique keys', () => {
    expect(mutants.length).toBeGreaterThan(100);
    expect(new Set(mutants.map((mutant) => mutant.id)).size).toBe(
      mutants.length,
    );
  });

  it('yields only mutants that change the file and still compile', () => {
    const transpiler = new Bun.Transpiler({loader: 'ts'});
    for (const mutant of mutants) {
      const mutated = applyMutant(source, mutant);
      expect(mutated).not.toBe(source);
      // Bun's own parser, not the one the generator used.
      expect(() => transpiler.transformSync(mutated)).not.toThrow();
    }
  });

  it('gives the same mutants on every run', () => {
    expect(generateMutants(file, source)).toEqual(mutants);
  });
});

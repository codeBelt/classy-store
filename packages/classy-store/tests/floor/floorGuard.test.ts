import {afterAll, beforeAll, describe, expect, it} from 'bun:test';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';

/**
 * Each case runs the guard on a throwaway Git repository: `main` holds one
 * commit, and the work branch adds the bar in its first commit, as this
 * repository did. Every fixture line the guard would flag is put together
 * here at run time, so that no line of this file is one the guard flags.
 * The cases run at the same time, each on its own copy of one repository.
 */

const guardSource = resolve(
  import.meta.dir,
  '../../../../scripts/floor-guard.mjs',
);

// Pieces of the text the guard looks for, joined only when a test runs.
const ts = '@ts-';
const silencedComment = `// ${ts}ignore`;
const unfinished = `// TO${'DO'}: finish`;
const focused = `it.${'only'}('runs alone', () => {});`;

const constraints = `# Constraints

## Floor

- No new comment that silences a checker: anything.

| Dimension     | Rule                         | Checked by |
| ------------- | ---------------------------- | ---------- |
| Line coverage | At least 100% of lines       | coverage   |
| Mutation      | At most 0 surviving mutants  | mutation   |
| Unkillable    | 78 listed mutants            | mutation   |

| ID  | Rule | Path | Reason | Owner | Expires |
| --- | ---- | ---- | ------ | ----- | ------- |
`;

const budgets = (entries: Record<string, unknown>) =>
  `${JSON.stringify(entries, null, 2)}\n`;
const limits = (read: number) =>
  `${JSON.stringify({bun: {read, write: 3.2}, node: {read: 2.5}}, null, 2)}\n`;
const testFile = (assertions: number) =>
  `import {expect, it} from 'bun:test';\n\nit('works', () => {\n${Array.from(
    {length: assertions},
    (_, index) => `  expect(${index}).toBe(${index});\n`,
  ).join('')}});\n`;

type Run = {code: number; out: string};

const gitConfig = [
  '-c',
  'user.name=Floor Guard',
  '-c',
  'user.email=floor-guard@example.invalid',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'init.defaultBranch=main',
];

async function spawn(command: string[], cwd: string) {
  const child = Bun.spawn(command, {cwd, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {stdout, stderr, code};
}

function tools(root: string) {
  const git = async (...args: string[]): Promise<string> => {
    const result = await spawn(['git', ...gitConfig, ...args], root);
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    }
    return result.stdout;
  };
  const write = (path: string, text: string) => {
    const file = join(root, path);
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, text);
  };
  const remove = (path: string) => rmSync(join(root, path));
  const commit = async (message: string) => {
    await git('add', '--all');
    await git('commit', '--quiet', '--allow-empty', '--message', message);
    return (await git('rev-parse', 'HEAD')).trim();
  };
  const run = async (...args: string[]): Promise<Run> => {
    const result = await spawn(
      ['node', 'scripts/floor-guard.mjs', '--main', 'main', ...args],
      root,
    );
    return {code: result.code, out: `${result.stdout}${result.stderr}`};
  };
  return {git, write, remove, commit, run, root};
}

const scratch = mkdtempSync(join(tmpdir(), 'floor-guard-'));
const template = join(scratch, 'template');
let copies = 0;

beforeAll(async () => {
  mkdirSync(template);
  const base = tools(template);
  await base.git('init', '--quiet');
  base.write('README.md', 'A throwaway repository for the floor guard.\n');
  await base.commit('start');
  await base.git('checkout', '--quiet', '-b', 'work');

  // The commit that adds the bar, which the guard does not judge.
  mkdirSync(join(template, 'scripts'), {recursive: true});
  copyFileSync(guardSource, join(template, 'scripts/floor-guard.mjs'));
  base.write('CONSTRAINTS.md', constraints);
  base.write(
    'packages/classy-store/tests/size/budgets.json',
    budgets({
      '.': {budget: 3750, ceiling: 5575},
      './vue': {budget: 300, ceiling: 400},
    }),
  );
  base.write('packages/classy-store/tests/benchmark/limits.json', limits(20));
  base.write('packages/classy-store/bunfig.toml', 'coverageThreshold = 1.0\n');
  base.write('packages/classy-store/src/core.ts', 'export const one = 1;\n');
  // A line the guard would flag, in the commit it does not judge.
  base.write('packages/classy-store/src/legacy.ts', `${silencedComment}\n`);
  base.write(
    'packages/classy-store/tests/mutation/runMutation.ts',
    "export const targets = ['src/core.ts'];\n",
  );
  base.write('packages/classy-store/src/core.test.ts', testFile(3));
  base.write(
    'docs/decisions/0004-size.md',
    '# 0004. Size\n\n## Measured sizes\n',
  );
  base.write('docs/decisions/0005-other.md', '# 0005. Other\n');
  base.write('docs/decisions/README.md', '# Decision records\n');
  await base.commit('add the bar');
});

afterAll(() => rmSync(scratch, {recursive: true, force: true}));

/** A fresh copy of the repository, on the work branch after the bar. */
async function repository() {
  const root = join(scratch, `case-${++copies}`);
  cpSync(template, root, {recursive: true});
  return tools(root);
}

describe('floor guard: the walk', () => {
  it.concurrent('is clean when nothing after the bar lowers it', async () => {
    const repo = await repository();
    repo.write('packages/classy-store/src/core.ts', 'export const two = 2;\n');
    await repo.commit('change the code');
    const result = await repo.run();
    expect(result.out).toContain('floor-guard: clean (1 commit after');
    expect(result.code).toBe(0);
  });

  it.concurrent('does not judge the commit that adds CONSTRAINTS.md, or any before it', async () => {
    const repo = await repository();
    // The fixture repository's bar commit holds the guard's own patterns.
    expect((await repo.run()).code).toBe(0);
  });

  it.concurrent('starts at the merge base once main holds CONSTRAINTS.md', async () => {
    const repo = await repository();
    repo.write('packages/classy-store/src/late.ts', `${unfinished}\n`);
    await repo.commit('unfinished work, before main moved');
    await repo.git('branch', '--force', 'main', 'HEAD');
    repo.write('packages/classy-store/src/core.ts', 'export const two = 2;\n');
    await repo.commit('after the merge base');
    const result = await repo.run();
    expect(result.out).toContain('clean (1 commit after');
    expect(result.code).toBe(0);
  });

  it.concurrent('reports a violation in the commit that made it, even when a later commit undoes it', async () => {
    const repo = await repository();
    repo.write('packages/classy-store/src/core.ts', `${silencedComment}\n`);
    const bad = await repo.commit('silence a checker');
    repo.write('packages/classy-store/src/core.ts', 'export const one = 1;\n');
    await repo.commit('take it back');
    const result = await repo.run();
    expect(result.out).toContain(`[silenced-checker] ${bad.slice(0, 7)}`);
    expect(result.code).toBe(1);
  });

  it.concurrent('fails on a merge commit in its range', async () => {
    const repo = await repository();
    await repo.git('checkout', '--quiet', '-b', 'side');
    repo.write('packages/classy-store/src/side.ts', 'export const side = 1;\n');
    await repo.commit('side work');
    await repo.git('checkout', '--quiet', 'work');
    repo.write('packages/classy-store/src/core.ts', 'export const two = 2;\n');
    await repo.commit('main line');
    await repo.git(
      'merge',
      '--no-ff',
      '--quiet',
      '--message',
      'merge side',
      'side',
    );
    const result = await repo.run();
    expect(result.out).toContain('[merge-commit]');
    expect(result.code).toBe(1);
  });

  it.concurrent('judges the working tree last, untracked files included', async () => {
    const repo = await repository();
    repo.write('packages/classy-store/src/new.ts', `${unfinished}\n`);
    const result = await repo.run();
    expect(result.out).toContain('[unfinished-work] working tree');
    expect(result.code).toBe(1);
  });
});

describe('floor guard: patterns in added lines', () => {
  const cases: [string, string, string][] = [
    ['silenced-checker', 'packages/classy-store/src/core.ts', silencedComment],
    [
      'silenced-checker',
      'packages/classy-store/src/core.ts',
      `// ${ts}expect-error`,
    ],
    [
      'silenced-checker',
      'packages/classy-store/src/core.ts',
      `export const value = 1 as ${'any'};`,
    ],
    ['silenced-checker', 'scripts/tool.mjs', `// ${'eslint'}-disable`],
    ['unfinished-work', 'packages/classy-store/src/core.ts', unfinished],
    [
      'unfinished-work',
      'packages/classy-store/src/core.ts',
      `try { run(); } catch ${'{'}${'}'}`,
    ],
    ['test-made-easier', 'packages/classy-store/src/core.test.ts', focused],
    [
      'test-made-easier',
      'packages/classy-store/src/core.test.ts',
      `it.${'skip'}('later', () => {});`,
    ],
  ];

  for (const [rule, path, line] of cases) {
    it.concurrent(`flags ${rule}: ${line}`, async () => {
      const repo = await repository();
      repo.write(path, `${line}\n`);
      await repo.commit('add a line');
      const result = await repo.run();
      expect(result.out).toContain(`[${rule}]`);
      expect(result.code).toBe(1);
    });
  }

  it.concurrent('allows an expected type error in a test, and a skip with a condition', async () => {
    const repo = await repository();
    repo.write(
      'packages/classy-store/src/core.test.ts',
      `${testFile(3)}// ${ts}expect-error -- the error is what this tests\nit.${'skip'}If(true)('needs a browser', () => {});\n`,
    );
    await repo.commit('a test of a type error');
    expect((await repo.run()).code).toBe(0);
  });

  it.concurrent('leaves the docs site and the examples alone', async () => {
    const repo = await repository();
    repo.write('website/page.ts', `${silencedComment}\n`);
    repo.write('examples/demo.ts', `${unfinished}\n`);
    await repo.commit('demos');
    expect((await repo.run()).code).toBe(0);
  });
});

describe('floor guard: a test made smaller', () => {
  it.concurrent('flags a deleted test file, and passes it with a Test-change line naming a decision', async () => {
    const bare = await repository();
    bare.remove('packages/classy-store/src/core.test.ts');
    await bare.commit('delete a test');
    expect((await bare.run()).out).toContain('[test-deleted]');

    const named = await repository();
    named.remove('packages/classy-store/src/core.test.ts');
    await named.commit(
      'delete a test\n\nTest-change: packages/classy-store/src/core.test.ts: the behaviour goes with decision 20',
    );
    const result = await named.run();
    expect(result.out).toContain('note [test-deleted]');
    expect(result.code).toBe(0);
  });

  it.concurrent('flags fewer assertions, and passes them with a reason that names the covering test', async () => {
    const bare = await repository();
    bare.write('packages/classy-store/src/core.test.ts', testFile(2));
    await bare.commit('drop an assertion');
    expect((await bare.run()).out).toContain('[assertions-removed]');

    const vague = await repository();
    vague.write('packages/classy-store/src/core.test.ts', testFile(2));
    await vague.commit(
      'drop an assertion\n\nTest-change: packages/classy-store/src/core.test.ts: not needed',
    );
    const vagueResult = await vague.run();
    expect(vagueResult.out).toContain('names no decision and no test');
    expect(vagueResult.code).toBe(1);

    const named = await repository();
    named.write('packages/classy-store/src/core.test.ts', testFile(2));
    await named.commit(
      'drop an assertion\n\nTest-change: packages/classy-store/src/core.test.ts: covered by src/public.test.ts',
    );
    expect((await named.run()).code).toBe(0);
  });

  it.concurrent('passes an edited assertion, which keeps the count', async () => {
    const repo = await repository();
    repo.write(
      'packages/classy-store/src/core.test.ts',
      testFile(3).replace('toBe(2)', 'toEqual(2)'),
    );
    await repo.commit('edit an assertion');
    expect((await repo.run()).code).toBe(0);
  });

  it.concurrent('only notes a smaller test in the working tree, which has no message yet', async () => {
    const repo = await repository();
    repo.write('packages/classy-store/src/core.test.ts', testFile(1));
    const result = await repo.run();
    expect(result.out).toContain('needs a Test-change line');
    expect(result.code).toBe(0);
  });
});

describe('floor guard: CONSTRAINTS.md and the bar files', () => {
  it.concurrent('flags a rule removed, and passes it with a line in any decision record', async () => {
    const bare = await repository();
    bare.write('CONSTRAINTS.md', constraints.replace(/\| Mutation .*\n/, ''));
    await bare.commit('drop a rule');
    expect((await bare.run()).out).toContain('[rule-removed]');

    const recorded = await repository();
    recorded.write(
      'CONSTRAINTS.md',
      constraints.replace(/\| Mutation .*\n/, ''),
    );
    recorded.write(
      'docs/decisions/0005-other.md',
      '# 0005. Other\n\nThe mutation rule goes, because of this.\n',
    );
    await recorded.commit('drop a rule, with its reason');
    expect((await recorded.run()).code).toBe(0);
  });

  it.concurrent('flags a minimum lowered and a maximum raised, and passes either one tightened', async () => {
    const lowered = await repository();
    lowered.write(
      'CONSTRAINTS.md',
      constraints.replace('At least 100%', 'At least 90%'),
    );
    await lowered.commit('lower coverage');
    expect((await lowered.run()).out).toContain('[threshold-loosened]');

    const raised = await repository();
    raised.write(
      'CONSTRAINTS.md',
      constraints.replace('At most 0', 'At most 3'),
    );
    await raised.commit('allow survivors');
    expect((await raised.run()).out).toContain('[threshold-loosened]');

    const tightened = await repository();
    tightened.write(
      'CONSTRAINTS.md',
      constraints.replace('At most 0 surviving', 'At most 0 surviving or dead'),
    );
    await tightened.commit('reword a rule');
    expect((await tightened.run()).code).toBe(0);
  });

  it.concurrent('flags a new exception', async () => {
    const repo = await repository();
    repo.write(
      'CONSTRAINTS.md',
      `${constraints}| W1  | Mutation | src/core.ts | slow | owner | never |\n`,
    );
    await repo.commit('add an exception');
    expect((await repo.run()).out).toContain('[new-exception]');
  });

  it.concurrent('flags a change to its own file, and passes it with a line in a decision record', async () => {
    const bare = await repository();
    bare.write(
      'scripts/floor-guard.mjs',
      `${readFileSync(guardSource, 'utf8')}\n// one more line\n`,
    );
    await bare.commit('change the guard');
    expect((await bare.run()).out).toContain('[bar-file-changed]');

    const recorded = await repository();
    recorded.write(
      'scripts/floor-guard.mjs',
      `${readFileSync(guardSource, 'utf8')}\n// one more line\n`,
    );
    recorded.write(
      'docs/decisions/0004-size.md',
      '# 0004. Size\n\n## Measured sizes\n\nThe guard gains a comment.\n',
    );
    await recorded.commit('change the guard, with its reason');
    const result = await recorded.run();
    // Its own patterns are its text, not findings.
    expect(result.out).not.toContain('[silenced-checker]');
    expect(result.code).toBe(0);
  });

  it.concurrent('flags a number whose direction it cannot read when it changes, and a number removed', async () => {
    const changed = await repository();
    changed.write(
      'CONSTRAINTS.md',
      constraints.replace('78 listed mutants', '70 listed mutants'),
    );
    await changed.commit('change a number');
    expect((await changed.run()).out).toContain('[threshold-changed]');

    const removed = await repository();
    removed.write(
      'CONSTRAINTS.md',
      constraints.replace('At least 100% of lines', 'At least all lines'),
    );
    await removed.commit('drop a number');
    expect((await removed.run()).out).toContain('[threshold-removed]');
  });

  it.concurrent('flags a change to the list of mutation targets, one that tightens included', async () => {
    const bare = await repository();
    bare.write(
      'packages/classy-store/tests/mutation/runMutation.ts',
      "export const targets = ['src/core.ts', 'src/more.ts'];\n",
    );
    await bare.commit('mutate one more file');
    expect((await bare.run()).out).toContain('[bar-file-changed]');

    const recorded = await repository();
    recorded.write(
      'packages/classy-store/tests/mutation/runMutation.ts',
      "export const targets = ['src/core.ts', 'src/more.ts'];\n",
    );
    recorded.write(
      'docs/decisions/0004-size.md',
      '# 0004. Size\n\n## Measured sizes\n\nOne more mutation target.\n',
    );
    await recorded.commit('mutate one more file, with its line');
    expect((await recorded.run()).code).toBe(0);
  });

  it.concurrent('flags a change to the coverage settings', async () => {
    const repo = await repository();
    repo.write(
      'packages/classy-store/bunfig.toml',
      'coverageThreshold = 0.9\n',
    );
    await repo.commit('lower coverage');
    expect((await repo.run()).out).toContain('[bar-file-changed]');
  });
});

describe('floor guard: budgets, ceilings and limits', () => {
  const budgetsPath = 'packages/classy-store/tests/size/budgets.json';
  const sizeRecord = (line: string) =>
    `# 0004. Size\n\n## Measured sizes\n\n${line}\n`;

  it.concurrent('flags a budget that rises with no line in record 0004, also with a line in another record', async () => {
    const bare = await repository();
    bare.write(
      budgetsPath,
      budgets({
        '.': {budget: 3800, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    await bare.commit('raise a budget');
    expect((await bare.run()).out).toContain('[budget-raised]');

    const elsewhere = await repository();
    elsewhere.write(
      budgetsPath,
      budgets({
        '.': {budget: 3800, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    elsewhere.write(
      'docs/decisions/0005-other.md',
      '# 0005. Other\n\nA line.\n',
    );
    await elsewhere.commit('raise a budget, reason in the wrong record');
    expect((await elsewhere.run()).out).toContain('[budget-raised]');

    const recorded = await repository();
    recorded.write(
      budgetsPath,
      budgets({
        '.': {budget: 3800, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    recorded.write(
      'docs/decisions/0004-size.md',
      sizeRecord('| abc | . | 3725 | 3800 |'),
    );
    await recorded.commit('raise a budget, with its line');
    expect((await recorded.run()).code).toBe(0);
  });

  it.concurrent('does not let a record line in an earlier commit clear a later rise', async () => {
    const repo = await repository();
    repo.write('docs/decisions/0004-size.md', sizeRecord('A line, early.'));
    await repo.commit('a record line');
    repo.write(
      budgetsPath,
      budgets({
        '.': {budget: 3800, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    await repo.commit('raise a budget later');
    expect((await repo.run()).out).toContain('[budget-raised]');
  });

  it.concurrent('passes a budget that falls', async () => {
    const repo = await repository();
    repo.write(
      budgetsPath,
      budgets({
        '.': {budget: 3700, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    await repo.commit('tighten a budget');
    expect((await repo.run()).code).toBe(0);
  });

  it.concurrent('passes the commit that adds ceilings where there were none', async () => {
    const repo = await repository();
    repo.write(budgetsPath, budgets({'.': 3750, './vue': 300}));
    repo.write('docs/decisions/0004-size.md', sizeRecord('Budgets only.'));
    const numbers = await repo.commit(
      'budgets as plain numbers, as before ceilings',
    );
    repo.write(
      budgetsPath,
      budgets({
        '.': {budget: 3750, ceiling: 5575},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    await repo.commit('add the ceilings');
    const result = await repo.run('--base', numbers);
    expect(result.out).toContain('clean (1 commit after');
    expect(result.code).toBe(0);
  });

  it.concurrent('flags a ceiling changed together with another file or a budget', async () => {
    const withFile = await repository();
    withFile.write(
      budgetsPath,
      budgets({
        '.': {budget: 3750, ceiling: 5600},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    withFile.write(
      'docs/decisions/0004-size.md',
      sizeRecord('Ceiling of . to 5600, because.'),
    );
    withFile.write(
      'packages/classy-store/src/core.ts',
      'export const two = 2;\n',
    );
    await withFile.commit('raise a ceiling with code');
    expect((await withFile.run()).out).toContain('[ceiling-not-alone]');

    const withBudget = await repository();
    withBudget.write(
      budgetsPath,
      budgets({
        '.': {budget: 3800, ceiling: 5600},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    withBudget.write(
      'docs/decisions/0004-size.md',
      sizeRecord('Both, because.'),
    );
    await withBudget.commit('raise a ceiling and a budget');
    expect((await withBudget.run()).out).toContain('[ceiling-not-alone]');
  });

  it.concurrent('flags a ceiling changed alone with no line, and passes it with its line', async () => {
    const bare = await repository();
    bare.write(
      budgetsPath,
      budgets({
        '.': {budget: 3750, ceiling: 5600},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    await bare.commit('raise a ceiling');
    expect((await bare.run()).out).toContain('[ceiling-changed]');

    const recorded = await repository();
    recorded.write(
      budgetsPath,
      budgets({
        '.': {budget: 3750, ceiling: 5600},
        './vue': {budget: 300, ceiling: 400},
      }),
    );
    recorded.write(
      'docs/decisions/0004-size.md',
      sizeRecord('Ceiling of . to 5600, because.'),
    );
    await recorded.commit('raise a ceiling, alone, with its reason');
    expect((await recorded.run()).code).toBe(0);
  });

  it.concurrent('flags a cost limit that rises with no line in record 0004, and passes one that falls', async () => {
    const raised = await repository();
    raised.write(
      'packages/classy-store/tests/benchmark/limits.json',
      limits(21),
    );
    await raised.commit('raise a limit');
    expect((await raised.run()).out).toContain('[limit-raised]');

    const recorded = await repository();
    recorded.write(
      'packages/classy-store/tests/benchmark/limits.json',
      limits(21),
    );
    recorded.write(
      'docs/decisions/0004-size.md',
      sizeRecord('Read limit to 21, because.'),
    );
    await recorded.commit('raise a limit, with its line');
    expect((await recorded.run()).code).toBe(0);

    const tightened = await repository();
    tightened.write(
      'packages/classy-store/tests/benchmark/limits.json',
      limits(18),
    );
    await tightened.commit('tighten a limit');
    expect((await tightened.run()).code).toBe(0);
  });
});

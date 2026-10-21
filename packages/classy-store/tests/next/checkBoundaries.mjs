import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const consumerDirectory = resolve(
  process.argv[2] ?? join(fixtureDirectory, '../..'),
);
const installedPackageDirectory = join(
  consumerDirectory,
  'node_modules/@codebelt/classy-store',
);
const packageDirectory = existsSync(installedPackageDirectory)
  ? installedPackageDirectory
  : consumerDirectory;
const manifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
const failures = [];
const checks = [];

function check(name, action) {
  try {
    action();
    checks.push(name);
  } catch (error) {
    failures.push({name, error: String(error)});
  }
}

function hasClientDirective(source) {
  // A directive must occur before executable code; a string elsewhere in a
  // bundled module (including a comment) does not establish an RSC boundary.
  let remaining = source;
  for (;;) {
    remaining = remaining.replace(
      /^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,
      '',
    );
    const directive = remaining.match(/^(['"])([^'"\n]*)\1\s*;/);
    if (!directive) return false;
    if (directive[2] === 'use client') return true;
    remaining = remaining.slice(directive[0].length);
  }
}

for (const mode of ['import', 'require']) {
  for (const entry of ['.', './collections', './utils', './react/server']) {
    check(`${mode} ${entry} stays server safe`, () => {
      const target = manifest.exports[entry]?.[mode]?.default;
      assert.equal(typeof target, 'string', `Missing ${entry} ${mode} export`);
      const source = readFileSync(join(packageDirectory, target), 'utf8');
      assert.equal(hasClientDirective(source), false);
    });
  }
  check(`${mode} ./react preserves its client boundary`, () => {
    const target = manifest.exports['./react'][mode].default;
    const source = readFileSync(join(packageDirectory, target), 'utf8');
    assert.equal(hasClientDirective(source), true);
  });
}

function runProbe(mode, serverCondition) {
  const load = (name, packageName) =>
    mode === 'import'
      ? `import * as ${name} from '${packageName}';`
      : `const ${name} = require('${packageName}');`;
  const source = [
    mode === 'import'
      ? "import assert from 'node:assert/strict';"
      : "const assert = require('node:assert/strict');",
    load('core', '@codebelt/classy-store'),
    load('collections', '@codebelt/classy-store/collections'),
    load('utils', '@codebelt/classy-store/utils'),
    load('server', '@codebelt/classy-store/react/server'),
    ...(serverCondition
      ? []
      : [
          load('client', '@codebelt/classy-store/react'),
          load('React', 'react'),
          load('ReactDOMServer', 'react-dom/server'),
        ]),
    `
    async function verify() {
      const first = core.createClassyStore({
        count: 1,
        items: collections.reactiveMap([['first', 1]]),
        tags: collections.reactiveSet(['first']),
      });
      const second = core.createClassyStore({count: 10});
      assert.equal(server.prepareStoreForHydration(first), first);
      assert.equal(server.prepareStoreForHydration(second), second);
      assert.throws(() => server.prepareStoreForHydration({count: 0}));
      let calls = 0;
      const stop = utils.subscribeKey(first, 'count', () => { calls++; });
      const history = utils.withHistory(first);
      first.count = 2;
      first.items.set('second', 2);
      first.tags.add('second');
      await Promise.resolve();
      stop();
      history.dispose();
      utils.devtools(first)();
      assert.equal(calls, 1);
      assert.equal(core.snapshot(first).count, 2);
      assert.equal(core.snapshot(second).count, 10);
      assert.equal(first.items.get('second'), 2);
      assert.equal(first.tags.has('second'), true);
      ${
        serverCondition
          ? ''
          : `
      assert.equal(server.prepareStoreForHydration, client.prepareStoreForHydration);
      for (const prepare of [server.prepareStoreForHydration, client.prepareStoreForHydration]) {
        for (const tracked of [false, true]) {
          const store = core.createClassyStore({count: 7});
          prepare(store);
          store.count = 9;
          prepare(store);
          function Probe() {
            const value = tracked
              ? client.useClassyStore(store).count
              : client.useClassyStore(store, state => state.count);
            return React.createElement('output', null, value);
          }
          assert.equal(ReactDOMServer.renderToString(React.createElement(Probe)), '<output>7</output>');
        }
      }
      `
      }
    }
    verify().catch(error => { console.error(error); process.exitCode = 1; });
    `,
  ].join('\n');
  const result = spawnSync(
    process.execPath,
    [
      ...(serverCondition ? ['--conditions=react-server'] : []),
      ...(mode === 'import' ? ['--input-type=module'] : []),
      '--eval',
      source,
    ],
    {
      cwd: consumerDirectory,
      encoding: 'utf8',
      env: {...process.env, NODE_ENV: 'production'},
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

for (const mode of ['import', 'require']) {
  check(`${mode} executes server-safe APIs under react-server`, () =>
    runProbe(mode, true),
  );
  check(`${mode} shares hydration preparation with React hooks`, () =>
    runProbe(mode, false),
  );
}

console.log(JSON.stringify({checks, failures}, null, 2));
if (failures.length) process.exitCode = 1;

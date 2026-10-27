import {spawnSync} from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fixtures = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(fixtures, '../..');
const browserDirectory = resolve(fixtures, '../browser');
const manifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : ['vue@3.2.0', 'svelte@4.0.0', 'svelte@5.0.0'];
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), 'classy-store-frameworks-'),
);
const bun = process.env.BUN_EXECUTABLE ?? 'bun';
const browsers = (process.env.FRAMEWORK_BROWSERS ?? 'chromium').split(',');

function run(command, args, cwd, env = {}, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: {...process.env, ...env},
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stderr ?? ''}`,
      {cause: result.error},
    );
  return result.stdout;
}
function writeJson(directory, name, value) {
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}
function rewriteImports(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rewriteImports(path);
    else if (/\.(ts|vue|svelte)$/.test(entry.name)) {
      writeFileSync(
        path,
        readFileSync(path, 'utf8')
          .replaceAll("'../../../src/core/core'", "'@codebelt/classy-store'")
          .replaceAll("'../../../src/types'", "'@codebelt/classy-store'")
          .replaceAll(
            "'../../../src/frameworks/vue/vue'",
            "'@codebelt/classy-store/vue'",
          )
          .replaceAll(
            "'../../../src/frameworks/svelte/svelte'",
            "'@codebelt/classy-store/svelte'",
          ),
      );
    }
  }
}
function replaceRequired(source, before, after) {
  if (!source.includes(before))
    throw new Error(`Svelte 4 fixture adaptation needs updating: ${before}`);
  return source.replaceAll(before, after);
}

try {
  const [packed] = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryDirectory,
      ],
      packageDirectory,
      {},
      true,
    ),
  );
  for (const target of targets) {
    const match = /^(vue|svelte)@(\d+\.\d+\.\d+)$/.exec(target);
    if (!match)
      throw new Error(`Expected vue@version or svelte@version: ${target}`);
    const [, framework, version] = match;
    const consumer = join(temporaryDirectory, target);
    mkdirSync(consumer);
    cpSync(
      join(browserDirectory, framework),
      join(consumer, 'tests', framework),
      {recursive: true},
    );
    rmSync(join(consumer, 'tests', framework, 'tsconfig.json'));
    rewriteImports(join(consumer, 'tests', framework));
    for (const name of [`${framework}.spec.ts`, 'browser.test.ts'])
      cpSync(join(browserDirectory, name), join(consumer, 'tests', name));
    // Internal listener sets stay source-only; public callbacks and DOM cleanup
    // are verified unchanged by the copied Playwright scenarios.
    writeFileSync(
      join(consumer, 'tests/getListenerCounts.ts'),
      'export function getListenerCounts(_store: object): {syncListeners: number; batchedListeners: number} | null { return null; }\n',
    );
    if (framework === 'svelte' && version.startsWith('4.')) {
      const formPath = join(consumer, 'tests/svelte/SvelteForm.svelte');
      let form = readFileSync(formPath, 'utf8');
      form = replaceRequired(
        form,
        'const uppercase = $derived($snap.text.toUpperCase());',
        '$: uppercase = $snap.text.toUpperCase();',
      );
      form = replaceRequired(
        form,
        'const itemCount = $derived($snap.items.length);',
        '$: itemCount = $snap.items.length;',
      );
      form = replaceRequired(form, 'oninput=', 'on:input=');
      form = replaceRequired(form, 'onclick=', 'on:click=');
      writeFileSync(formPath, form);
      const clientPath = join(consumer, 'tests/svelte/client.ts');
      let client = readFileSync(clientPath, 'utf8');
      client = replaceRequired(
        client,
        "import {mount, unmount} from 'svelte';\n",
        '',
      );
      client = replaceRequired(
        client,
        'ReturnType<typeof mount>',
        'SvelteForm',
      );
      client = replaceRequired(
        client,
        'mount(SvelteForm, {target})',
        'new SvelteForm({target})',
      );
      client = replaceRequired(
        client,
        'await unmount(component)',
        'component.$destroy()',
      );
      writeFileSync(clientPath, client);
    }
    for (const name of [
      'buildConsumer.mjs',
      'serve.mjs',
      'playwright.config.ts',
    ])
      cpSync(join(fixtures, name), join(consumer, name));
    cpSync(
      join(fixtures, `${framework}.types.ts`),
      join(consumer, 'consumer.types.ts'),
    );
    const dependencies = {
      '@codebelt/classy-store': `file:${join(temporaryDirectory, packed.filename)}`,
      [framework]: version,
      '@playwright/test': manifest.devDependencies['@playwright/test'],
      typescript: manifest.devDependencies.typescript,
    };
    if (framework === 'vue') dependencies['@vue/compiler-sfc'] = version;
    writeJson(consumer, 'package.json', {
      private: true,
      type: 'module',
      dependencies,
    });
    writeJson(consumer, 'tsconfig.json', {
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: 'ES2022',
        module: 'NodeNext',
      },
      files: ['consumer.types.ts'],
    });
    const env = {
      FRAMEWORK: framework,
      FRAMEWORK_VERSION: version,
      SVELTE_MAJOR: framework === 'svelte' ? version.split('.')[0] : '',
    };
    console.log(`\nChecking packed library with ${target} in ${consumer}`);
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      consumer,
    );
    const tree = JSON.parse(
      run('npm', ['ls', '--all', '--json'], consumer, {}, true),
    );
    function checkVersions(node) {
      for (const [name, dependency] of Object.entries(
        node.dependencies ?? {},
      )) {
        if (
          (name === framework ||
            (framework === 'vue' && name.startsWith('@vue/'))) &&
          dependency.version &&
          dependency.version !== version
        ) {
          throw new Error(
            `Mismatched ${name}@${dependency.version}; expected ${version}`,
          );
        }
        checkVersions(dependency);
      }
    }
    checkVersions(tree);
    const installed = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@codebelt/classy-store/package.json'),
        'utf8',
      ),
    );
    if (
      installed.peerDependencies[framework] !==
        manifest.peerDependencies[framework] ||
      !installed.peerDependenciesMeta[framework].optional
    )
      throw new Error('Unexpected packed peer range or optionality');
    run(
      process.execPath,
      ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'],
      consumer,
    );
    run(bun, ['buildConsumer.mjs'], consumer, env);
    run(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        ...browsers.flatMap((browser) => ['--project', browser]),
      ],
      consumer,
      env,
    );
    console.log(
      `${target}: packed declarations, native compiler build, and focused browser regressions passed.`,
    );
  }
} finally {
  if (process.env.KEEP_FRAMEWORK_COMPATIBILITY_TEMP === '1')
    console.log(
      `Kept framework compatibility consumers at ${temporaryDirectory}`,
    );
  else rmSync(temporaryDirectory, {recursive: true, force: true});
}

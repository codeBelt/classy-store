import {spawnSync} from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileConsumer} from './compileConsumer.mjs';

const fixturesDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(fixturesDirectory, '../..');
const packageManifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
const requestedVersions = process.argv.slice(2);
const reactVersions = requestedVersions.length
  ? requestedVersions
  : ['18.0.0', '18.3.1', '19.0.0', packageManifest.devDependencies.react];
const bunExecutable = process.env.BUN_EXECUTABLE ?? 'bun';
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), 'classy-store-compiler-'),
);

function run(command, argumentsList, cwd, captureOutput = false) {
  const result = spawnSync(command, argumentsList, {
    cwd,
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      npm_config_cache: join(temporaryDirectory, 'npm-cache'),
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${argumentsList.join(' ')} failed\n${result.stderr ?? ''}`,
      {cause: result.error},
    );
  }
  return result.stdout;
}

try {
  const packed = JSON.parse(
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
      true,
    ),
  );
  const packageArchive = join(temporaryDirectory, packed[0].filename);
  for (const reactVersion of reactVersions) {
    const consumerDirectory = join(temporaryDirectory, `react-${reactVersion}`);
    cpSync(fixturesDirectory, consumerDirectory, {recursive: true});
    const target = reactVersion.startsWith('18.') ? '18' : '19';
    const compilation = [];
    const compiledSources = [];
    for (const directory of ['components', 'fixtures']) {
      const componentDirectory = join(fixturesDirectory, directory);
      if (!existsSync(componentDirectory)) continue;
      for (const path of readdirSync(componentDirectory, {recursive: true})) {
        if (!path.endsWith('.tsx')) continue;
        const sourcePath = join(componentDirectory, path);
        const {code, compiledFunctions} = compileConsumer(
          readFileSync(sourcePath, 'utf8'),
          sourcePath,
          target,
        );
        compiledSources.push({
          path: join(
            consumerDirectory,
            relative(fixturesDirectory, sourcePath),
          ),
          code,
        });
        compilation.push(...compiledFunctions);
      }
    }
    writeFileSync(
      join(consumerDirectory, 'compilation.json'),
      JSON.stringify({target, compiledFunctions: compilation}, null, 2),
    );
    writeFileSync(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          '@codebelt/classy-store': `file:${packageArchive}`,
          react: reactVersion,
          'react-dom': reactVersion,
          'react-compiler-runtime':
            packageManifest.devDependencies['react-compiler-runtime'],
          '@happy-dom/global-registrator':
            packageManifest.devDependencies['@happy-dom/global-registrator'],
        },
      }),
    );
    writeFileSync(
      join(consumerDirectory, 'happydom.ts'),
      "import {GlobalRegistrator} from '@happy-dom/global-registrator';\nGlobalRegistrator.register();\nglobalThis.IS_REACT_ACT_ENVIRONMENT = true;\n",
    );
    writeFileSync(
      join(consumerDirectory, 'reactAct.ts'),
      "import * as React from 'react';\nimport {act as legacyAct} from 'react-dom/test-utils';\nexport const act = React.act ?? legacyAct;\n",
    );
    cpSync(
      join(fixturesDirectory, 'consumer.fixture.tsx'),
      join(consumerDirectory, 'consumer.test.tsx'),
    );
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      consumerDirectory,
    );
    console.log(
      `\nChecking scale and lifecycle regressions without Compiler on React ${reactVersion}`,
    );
    run(
      bunExecutable,
      [
        'test',
        '--preload',
        './happydom.ts',
        './compiler.scale.test.tsx',
        './compiler.memory.test.tsx',
      ],
      consumerDirectory,
    );
    for (const {path, code} of compiledSources) {
      writeFileSync(path, code);
    }
    console.log(
      `\nChecking ${compilation.length} memoized components against packed React ${reactVersion} (compiler target ${target})`,
    );
    const testFiles = ['consumer.test.tsx'];
    if (existsSync(join(consumerDirectory, 'compiler.behavior.test.tsx'))) {
      testFiles.push('compiler.behavior.test.tsx');
    }
    testFiles.push('compiler.scale.test.tsx');
    testFiles.push('compiler.memory.test.tsx');
    run(
      bunExecutable,
      [
        'test',
        '--preload',
        './happydom.ts',
        ...testFiles.map((path) => `./${path}`),
      ],
      consumerDirectory,
    );
  }
} finally {
  if (process.env.KEEP_COMPILER_TEMP === '1') {
    console.log(`Kept compiled consumers at ${temporaryDirectory}`);
  } else {
    rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

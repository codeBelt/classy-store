import {spawnSync} from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fixturesDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(fixturesDirectory, '../..');
const packageManifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
const requestedVersions = process.argv.slice(2);
const reactVersions = requestedVersions.length
  ? requestedVersions
  : ['18.0.0', '18.3.1', packageManifest.devDependencies.react];
const bunExecutable = process.env.BUN_EXECUTABLE ?? 'bun';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'classy-store-react-'));

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

function rewritePackedImports(source) {
  return source
    .replace('import {act, ', "import {act} from './reactAct';\nimport {")
    .replaceAll("'../../core/core'", "'@codebelt/classy-store'")
    .replaceAll("'../../snapshot/snapshot'", "'@codebelt/classy-store'")
    .replaceAll(
      "'../../utils/persist/persist'",
      "'@codebelt/classy-store/utils'",
    )
    .replaceAll("'./react'", "'@codebelt/classy-store/react'");
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
    const reactTypesVersion = reactVersion.startsWith('18.')
      ? '18.3.27'
      : packageManifest.devDependencies['@types/react'];
    const reactDomTypesVersion = reactVersion.startsWith('18.')
      ? '18.3.7'
      : packageManifest.devDependencies['@types/react-dom'];
    writeFileSync(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          '@codebelt/classy-store': `file:${packageArchive}`,
          react: reactVersion,
          'react-dom': reactVersion,
          '@types/react': reactTypesVersion,
          '@types/react-dom': reactDomTypesVersion,
          '@happy-dom/global-registrator':
            packageManifest.devDependencies['@happy-dom/global-registrator'],
          typescript: packageManifest.devDependencies.typescript,
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
    const ssrTests = rewritePackedImports(
      readFileSync(
        join(packageDirectory, 'src/frameworks/react/react.ssr.test.tsx'),
        'utf8',
      ),
    );
    writeFileSync(join(consumerDirectory, 'ssr.test.tsx'), ssrTests);
    const sourceHydrationTests = readFileSync(
      join(packageDirectory, 'src/frameworks/react/react.hydration.test.tsx'),
      'utf8',
    );
    // Internal listener counts remain covered in source tests. Installed-package
    // tests retain the public unmount, no-more-commits, and storage cleanup checks.
    const internalAssertions =
      /^\s*expect\(getInternal\(clientStore\)\.(?:syncListeners|batchedListeners)\.size\)\.toBe\([01]\);\n/gm;
    if ([...sourceHydrationTests.matchAll(internalAssertions)].length !== 4) {
      throw new Error(
        'Expected four source-only hydration listener assertions',
      );
    }
    const hydrationTests = rewritePackedImports(
      sourceHydrationTests
        .replace('{createClassyStore, getInternal}', '{createClassyStore}')
        .replace(internalAssertions, ''),
    );
    writeFileSync(
      join(consumerDirectory, 'hydration.test.tsx'),
      hydrationTests,
    );
    cpSync(
      join(packageDirectory, 'src/frameworks/react/testHelpers'),
      join(consumerDirectory, 'testHelpers'),
      {recursive: true},
    );
    for (const extension of ['mts', 'cts']) {
      cpSync(
        join(fixturesDirectory, 'consumer.types.fixture.ts'),
        join(consumerDirectory, `consumer.${extension}`),
      );
    }

    console.log(`\nChecking packed package with React ${reactVersion}`);
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
    for (const mode of ['import', 'require']) {
      run(
        process.execPath,
        ['entrypoints.fixture.mjs', mode],
        consumerDirectory,
      );
    }
    run(
      bunExecutable,
      [
        'test',
        '--preload',
        './happydom.ts',
        './consumer.test.tsx',
        './ssr.test.tsx',
        './hydration.test.tsx',
      ],
      consumerDirectory,
    );
    run(
      join(consumerDirectory, 'node_modules/.bin/tsc'),
      [
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'consumer.mts',
        'consumer.cts',
      ],
      consumerDirectory,
    );
  }
} finally {
  if (process.env.KEEP_COMPATIBILITY_TEMP === '1') {
    console.log(`Kept compatibility consumers at ${temporaryDirectory}`);
  } else {
    rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

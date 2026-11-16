import {spawnSync} from 'node:child_process';
import {
  cpSync,
  mkdirSync,
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
const browserDirectory = resolve(fixturesDirectory, '../browser');
const exampleDirectory = resolve(packageDirectory, '../../examples/angular');
const manifest = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
const exampleManifest = JSON.parse(
  readFileSync(join(exampleDirectory, 'package.json'), 'utf8'),
);
const exampleTsconfig = JSON.parse(
  readFileSync(join(exampleDirectory, 'tsconfig.json'), 'utf8'),
);
const requestedVersions = process.argv.slice(2);
const versions = requestedVersions.length
  ? requestedVersions
  : ['22.0.0', '22.2.3'];
const browsers = (process.env.ANGULAR_BROWSERS ?? 'chromium').split(',');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'classy-store-angular-'));

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: {...process.env, NG_CLI_ANALYTICS: 'false'},
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stderr ?? ''}`,
      {cause: result.error},
    );
  }
  return result.stdout;
}
function writeJson(directory, name, value) {
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
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
      true,
    ),
  );
  const archive = join(temporaryDirectory, packed.filename);
  for (const version of versions) {
    if (!/^22\.\d+\.\d+$/.test(version))
      throw new Error(`Expected a stable Angular 22 version: ${version}`);
    const consumer = join(temporaryDirectory, version);
    mkdirSync(consumer);
    cpSync(join(browserDirectory, 'angular'), join(consumer, 'tests/angular'), {
      recursive: true,
    });
    // The installed package deliberately does not export private listener sets.
    // Keep all public behavior assertions; source tests additionally inspect counts.
    writeFileSync(
      join(consumer, 'tests/angular/getListenerCounts.ts'),
      'export function getListenerCounts(_store: object): {syncListeners: number; batchedListeners: number} | null { return null; }\n',
    );
    rmSync(join(consumer, 'tests/angular/tsconfig.json'));
    for (const name of ['angular.spec.ts', 'browser.test.ts']) {
      cpSync(join(browserDirectory, name), join(consumer, 'tests', name));
    }
    for (const name of [
      'playwright.config.ts',
      'serve.mjs',
      'consumer.types.ts',
    ]) {
      cpSync(join(fixturesDirectory, name), join(consumer, name));
    }
    const angularPackages = [
      'core',
      'common',
      'compiler',
      'platform-browser',
      'compiler-cli',
      'build',
      'cli',
    ];
    writeJson(consumer, 'package.json', {
      private: true,
      type: 'module',
      dependencies: {
        '@codebelt/classy-store': `file:${archive}`,
        ...Object.fromEntries(
          angularPackages.map((name) => [`@angular/${name}`, version]),
        ),
        '@playwright/test': manifest.devDependencies['@playwright/test'],
        typescript: exampleManifest.devDependencies.typescript,
        rxjs: '7.8.2',
        tslib: '2.8.1',
      },
    });
    const {paths: _paths, ...compilerOptions} = exampleTsconfig.compilerOptions;
    writeJson(consumer, 'tsconfig.app.json', {
      compilerOptions: {
        ...compilerOptions,
        rootDir: '.',
        outDir: './out',
        types: [],
      },
      angularCompilerOptions: exampleTsconfig.angularCompilerOptions,
      files: ['tests/angular/client.ts'],
      include: [],
    });
    writeJson(consumer, 'tsconfig.check.json', {
      extends: './tsconfig.app.json',
      files: [],
      include: ['tests/**/*.ts', 'consumer.types.ts'],
    });
    const angularWorkspace = JSON.parse(
      readFileSync(join(exampleDirectory, 'angular.json'), 'utf8'),
    );
    const project = angularWorkspace.projects['angular-integration'];
    project.root = '.';
    Object.assign(project.architect.build.options, {
      outputPath: 'dist',
      index: 'tests/angular/index.html',
      browser: 'tests/angular/client.ts',
      tsConfig: 'tsconfig.app.json',
    });
    writeJson(consumer, 'angular.json', {
      version: 1,
      cli: {analytics: false},
      projects: {'angular-integration': project},
    });
    console.log(
      `\nChecking packed library with aligned Angular ${version} packages in ${consumer}`,
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
      consumer,
    );
    // Assert the actual dependency tree, including peers, rather than just requests.
    const tree = JSON.parse(
      run('npm', ['ls', '--all', '--json'], consumer, true),
    );
    function checkAngularVersions(node) {
      for (const [name, dependency] of Object.entries(
        node.dependencies ?? {},
      )) {
        if (
          name.startsWith('@angular/') &&
          dependency.version !== undefined &&
          dependency.version !== version
        ) {
          throw new Error(
            `Mismatched Angular package: ${name}@${dependency.version}, expected ${version}`,
          );
        }
        checkAngularVersions(dependency);
      }
    }
    checkAngularVersions(tree);
    const installed = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@codebelt/classy-store/package.json'),
        'utf8',
      ),
    );
    if (
      installed.peerDependencies['@angular/core'] !== '^22.0.0' ||
      !installed.peerDependenciesMeta['@angular/core'].optional
    ) {
      throw new Error(
        'Packed Angular peer must remain optional and support ^22.0.0',
      );
    }
    run(
      process.execPath,
      [
        'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js',
        '--project',
        'tsconfig.check.json',
        '--noEmit',
      ],
      consumer,
    );
    run(
      process.execPath,
      [
        'node_modules/@angular/cli/bin/ng.js',
        'build',
        'angular-integration',
        '--configuration',
        'development',
      ],
      consumer,
    );
    run(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        ...browsers.flatMap((browser) => ['--project', browser]),
      ],
      consumer,
    );
    console.log(
      `Angular ${version}: packed declarations, AOT build, and focused browser regressions passed.`,
    );
  }
} finally {
  if (process.env.KEEP_ANGULAR_COMPATIBILITY_TEMP === '1') {
    console.log(
      `Kept Angular compatibility consumers at ${temporaryDirectory}`,
    );
  } else {
    rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

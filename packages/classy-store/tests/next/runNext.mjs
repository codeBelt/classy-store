import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(directory, '../..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(
  await readFile(join(packageDirectory, 'package.json'), 'utf8'),
);
const consumer = process.env.NEXT_TEST_DIRECTORY
  ? resolve(process.env.NEXT_TEST_DIRECTORY)
  : await mkdtemp(join(tmpdir(), 'classy-store-next-'));
const output = resolve(
  process.env.NEXT_TEST_OUTPUT ??
    join(packageDirectory, '../../test-results/next'),
);
const modes = (process.env.NEXT_TEST_MODES ?? 'off,on').split(',');
assert(modes.length && modes.every((mode) => mode === 'off' || mode === 'on'));
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
};
await mkdir(consumer, {recursive: true});
await mkdir(output, {recursive: true});
// Failed reruns must not leave an earlier successful report beside new logs.
await rm(join(output, 'report.json'), {force: true});

async function run(
  label,
  command,
  argumentsList,
  extraEnvironment = {},
  cwd = consumer,
) {
  const log = createWriteStream(join(output, `${label}.log`));
  const child = spawn(command, argumentsList, {
    cwd,
    env: {...environment, ...extraEnvironment},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    log.write(chunk);
  });
  child.stderr.on('data', (chunk) => log.write(chunk));
  let forceStop;
  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    forceStop = setTimeout(() => child.kill('SIGKILL'), 5000);
  }, 300_000);
  try {
    await new Promise((resolveRun, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) =>
        code === 0
          ? resolveRun()
          : reject(
              new Error(
                `${label} failed (${code ?? signal}); see ${join(output, `${label}.log`)}`,
              ),
            ),
      );
    });
  } finally {
    clearTimeout(timeout);
    clearTimeout(forceStop);
    log.end();
  }
  return stdout;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePort);
  });
  const port = server.address().port;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await new Promise((resolveExit) => child.once('exit', resolveExit));
  } finally {
    clearTimeout(timeout);
  }
}

const dependencies = {
  next: '16.4.2',
  react: manifest.devDependencies.react,
  'react-dom': manifest.devDependencies['react-dom'],
  'babel-plugin-react-compiler':
    manifest.devDependencies['babel-plugin-react-compiler'],
};
const results = [];
let succeeded = false;
try {
  console.log(`Packed Next.js consumer: ${consumer}`);
  const packed = JSON.parse(
    await run(
      'pack',
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer],
      {},
      packageDirectory,
    ),
  );
  // Content-address the tarball so a reused consumer cannot silently reuse
  // npm's installed copy of a previous build with the same package version.
  const archive = join(consumer, `classy-${packed[0].shasum}.tgz`);
  await rename(join(consumer, packed[0].filename), archive);
  await cp(join(directory, 'fixture'), consumer, {recursive: true});
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'classy-store-next-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...dependencies,
          '@codebelt/classy-store': `file:${archive}`,
        },
        devDependencies: {
          typescript: manifest.devDependencies.typescript,
          '@types/react': manifest.devDependencies['@types/react'],
          '@types/react-dom': manifest.devDependencies['@types/react-dom'],
          '@types/node': '26.6.5',
        },
      },
      null,
      2,
    ),
  );
  // Install from the tarball, never an alias or symlink to this checkout.
  console.log('Installing the isolated package consumer');
  await run('install', 'npm', [
    'install',
    '--include=dev',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const lock = JSON.parse(
    await readFile(join(consumer, 'package-lock.json'), 'utf8'),
  );
  assert.equal(
    lock.packages['node_modules/@codebelt/classy-store'].integrity,
    packed[0].integrity,
  );
  const boundaryReport = JSON.parse(
    await run('boundaries', process.execPath, [
      join(directory, 'checkBoundaries.mjs'),
      consumer,
    ]),
  );
  await writeFile(
    join(output, 'boundaries.json'),
    JSON.stringify(boundaryReport, null, 2),
  );
  const next = join(consumer, 'node_modules/next/dist/bin/next');
  const playwright = require.resolve('@playwright/test/cli');
  for (const mode of modes) {
    const modeEnvironment = {NEXT_TEST_COMPILER: mode};
    // A reused consumer must not inherit cached type diagnostics or bundled
    // package code from an earlier tarball with the same published version.
    await rm(join(consumer, `.next-${mode}`), {recursive: true, force: true});
    console.log(`Compiler ${mode}: production Next.js build (Turbopack)`);
    await run(
      `build-${mode}`,
      process.execPath,
      [next, 'build'],
      modeEnvironment,
    );
    const port = await availablePort();
    const url = `http://127.0.0.1:${port}`;
    const serverLog = createWriteStream(join(output, `server-${mode}.log`));
    const server = spawn(
      process.execPath,
      [next, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        cwd: consumer,
        env: {...environment, ...modeEnvironment},
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout.pipe(serverLog, {end: false});
    server.stderr.pipe(serverLog, {end: false});
    let serverError;
    server.on('error', (error) => {
      serverError = error;
    });
    try {
      let ready = false;
      let readinessDetail = 'No response received';
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (serverError) throw serverError;
        if (server.exitCode !== null)
          throw new Error(`Next server exited; see server-${mode}.log`);
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(1000),
          });
          ready = response.ok;
          readinessDetail = `HTTP ${response.status}`;
          await response.body?.cancel();
        } catch (error) {
          readinessDetail = String(error);
        }
        if (ready) break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
      assert(
        ready,
        `Next server did not become ready: ${url}: ${readinessDetail}`,
      );
      console.log(`Compiler ${mode}: browser integration at ${url}`);
      const testOutput = await run(
        `browser-${mode}`,
        process.execPath,
        [
          playwright,
          'test',
          '--config',
          join(directory, 'playwright.config.ts'),
        ],
        {
          ...modeEnvironment,
          NEXT_TEST_URL: url,
          NEXT_CONSUMER_DIRECTORY: consumer,
          NEXT_TEST_OUTPUT: join(output, mode),
        },
        packageDirectory,
      );
      console.log(testOutput.trim());
      results.push({compiler: mode, passed: true});
    } finally {
      await stop(server);
      serverLog.end();
    }
  }
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dependencies,
        library: {version: packed[0].version, integrity: packed[0].integrity},
        bundler: 'Turbopack',
        cacheComponents: false,
        consumer,
        boundaries: boundaryReport,
        results,
      },
      null,
      2,
    ),
  );
  succeeded = true;
  console.log(`Next.js integration passed; report and logs: ${output}`);
} finally {
  if (
    succeeded &&
    !process.env.NEXT_TEST_DIRECTORY &&
    process.env.KEEP_NEXT_TEMP !== '1'
  ) {
    await rm(consumer, {recursive: true, force: true});
  } else {
    console.log(`Kept Next.js consumer at ${consumer}`);
  }
}

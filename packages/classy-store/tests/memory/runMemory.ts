import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {arch, platform, release} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {type CDPSession, chromium, type Page} from '@playwright/test';
import {compileConsumer} from '../compiler/compileConsumer.mjs';
import {summarizeHeapSnapshot} from './heapSnapshot';
import type {MemoryMode, MemoryScenario} from './memory.types';

const directory = dirname(fileURLToPath(import.meta.url));
const manifest = await Bun.file(
  resolve(directory, '../../package.json'),
).json();
const dist = resolve(
  process.env.MEMORY_DIST ?? resolve(directory, '../../dist'),
);
const output = resolve(
  process.env.MEMORY_OUTPUT ??
    resolve(directory, '../../../../test-results/react-memory'),
);
const cycles = Number(process.env.MEMORY_CYCLES ?? 25);
const size = Number(process.env.MEMORY_SIZE ?? 64);
const scenarios = (
  process.env.MEMORY_SCENARIOS ?? 'mount,reset,replace,truncate,detached'
).split(',') as MemoryScenario[];
const observeOnly = process.env.MEMORY_OBSERVE_ONLY === '1';
assert(Number.isInteger(cycles) && cycles > 0);
assert(Number.isInteger(size) && size >= 2);
assert(
  scenarios.every((scenario) =>
    ['mount', 'reset', 'replace', 'truncate', 'detached'].includes(scenario),
  ),
);
await mkdir(output, {recursive: true});

const compilation: unknown[] = [];
const scripts = new Map<string, string>();
for (const compiler of ['off', 'on']) {
  const bundle = await Bun.build({
    entrypoints: [resolve(directory, 'client.tsx')],
    target: 'browser',
    format: 'iife',
    // Preserve constructor names used by the heap analyzer.
    minify: {whitespace: true, syntax: true, identifiers: false},
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [
      {
        name: 'memory-consumer',
        setup(build) {
          build.onResolve(
            {filter: /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|proxy-compare)$/},
            ({path}) => ({path: Bun.resolveSync(path, directory)}),
          );
          build.onResolve(
            {filter: /^@codebelt\/classy-store(?:\/react)?$/},
            ({path}) => ({
              path: resolve(
                dist,
                path.endsWith('/react')
                  ? 'frameworks/react/react.mjs'
                  : 'index.mjs',
              ),
            }),
          );
          if (compiler === 'on')
            build.onLoad(
              {filter: /\/memory\/components\/.*\.tsx$/},
              async ({path}) => {
                const result = compileConsumer(
                  await Bun.file(path).text(),
                  path,
                  '19',
                  [basename(path, '.tsx')],
                );
                compilation.push({
                  filename: basename(path),
                  functions: result.compiledFunctions,
                });
                return {contents: result.code, loader: 'tsx'};
              },
            );
        },
      },
    ],
  });
  if (!bundle.success)
    throw new AggregateError(bundle.logs, 'Memory consumer build failed');
  scripts.set(`/${compiler}.js`, await bundle.outputs[0].text());
}
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const script = scripts.get(url.pathname);
    if (script)
      return new Response(script, {
        headers: {'Content-Type': 'text/javascript'},
      });
    const compiler = url.searchParams.get('compiler') === 'on' ? 'on' : 'off';
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>React memory probe</title></head><body><div id="root"></div><script src="/${compiler}.js"></script></body></html>`,
      {headers: {'Content-Type': 'text/html'}},
    );
  },
});

async function captureHeap(page: Page, session: CDPSession, path: string) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  await session.send('HeapProfiler.collectGarbage');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  await session.send('HeapProfiler.collectGarbage');
  const chunks: string[] = [];
  const onChunk = ({chunk}: {chunk: string}) => chunks.push(chunk);
  session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await session.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
    });
  } finally {
    session.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  }
  const json = chunks.join('');
  await Bun.write(path, json);
  return {
    file: basename(path),
    ...summarizeHeapSnapshot(json),
    heapUsage: await session.send('Runtime.getHeapUsage'),
  };
}

const browser = await chromium.launch();
const results: unknown[] = [];
const failures: string[] = [];
try {
  for (const scenario of scenarios)
    for (const mode of [
      'selector',
      'object-selector',
      'tracked',
    ] as MemoryMode[])
      for (const compiler of ['off', 'on']) {
        const name = `${scenario}-${mode}-${compiler}`;
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(`${server.url}?compiler=${compiler}`);
        await page
          .waitForFunction(() => Boolean(window.memoryProbe))
          .catch((error) => {
            throw new AggregateError(
              [error, ...errors],
              `Could not load ${name}`,
            );
          });
        const session = await page.context().newCDPSession(page);
        await session.send('HeapProfiler.enable');
        const snapshots: Record<
          string,
          Awaited<ReturnType<typeof captureHeap>>
        > = {};
        // Positive control: parser must see an intentionally retained generation.
        await page.evaluate(() => window.memoryProbe.holdControl());
        snapshots.control = await captureHeap(
          page,
          session,
          resolve(output, `${name}-control.heapsnapshot`),
        );
        assert.equal(snapshots.control.counts.MemoryCollectionMarker, 1);
        await page.evaluate(() => window.memoryProbe.releaseControl());
        snapshots.empty = await captureHeap(
          page,
          session,
          resolve(output, `${name}-empty.heapsnapshot`),
        );
        assert.equal(snapshots.empty.counts.MemoryCollectionMarker, 0);
        assert.equal(snapshots.empty.counts.MemoryStoreMarker, 0);
        await page.evaluate(
          (configuration) => window.memoryProbe.start(configuration),
          {scenario, mode, size},
        );
        for (const checkpoint of ['first', 'second']) {
          await page.evaluate(
            (count) => window.memoryProbe.cycle(count),
            cycles,
          );
          const status = await page.evaluate(() => window.memoryProbe.status());
          assert.equal(
            status.cycles,
            checkpoint === 'first' ? cycles : cycles * 2,
          );
          if (scenario === 'detached')
            assert.equal(status.heldRows, status.cycles);
          else {
            const expectedText =
              scenario === 'truncate'
                ? 'empty'
                : `${scenario === 'replace' ? status.cycles : 0}:${size - 1}`;
            assert.equal(
              status.text,
              expectedText,
              'Mounted consumer must show current data',
            );
          }
          snapshots[checkpoint] = await captureHeap(
            page,
            session,
            resolve(output, `${name}-${checkpoint}.heapsnapshot`),
          );
        }
        await page.evaluate(() => window.memoryProbe.cleanup());
        snapshots.cleanup = await captureHeap(
          page,
          session,
          resolve(output, `${name}-cleanup.heapsnapshot`),
        );
        assert.deepEqual(errors, []);
        // Object-count bounds account for current/alternate React trees, not bytes.
        // Detached rows are deliberately held; their former stores must disappear.
        // Rolling replacements keep the current and previous raw generation.
        // Auto-tracking can also retain the previous committed effect's reads.
        const collectionLimit =
          scenario === 'truncate'
            ? 0
            : scenario === 'replace' && mode === 'tracked'
              ? 3
              : 2;
        for (const checkpoint of ['first', 'second']) {
          const counts = snapshots[checkpoint].counts;
          if (scenario !== 'detached')
            assert(
              counts.MemoryStoreMarker >= 1,
              'Mounted store marker must be observable',
            );
          if (counts.MemoryStoreMarker > (scenario === 'detached' ? 0 : 2))
            failures.push(
              `${name}/${checkpoint}: retained ${counts.MemoryStoreMarker} stores`,
            );
          if (scenario === 'detached') {
            const heldCount = checkpoint === 'first' ? cycles : cycles * 2;
            assert.equal(
              counts.MemoryCollectionMarker,
              heldCount,
              'Each deliberately held row must retain only its own generation',
            );
          }
          if (
            scenario !== 'detached' &&
            counts.MemoryCollectionMarker > collectionLimit
          )
            failures.push(
              `${name}/${checkpoint}: retained ${counts.MemoryCollectionMarker} collection generations (limit ${collectionLimit})`,
            );
        }
        if (
          snapshots.cleanup.counts.MemoryStoreMarker ||
          snapshots.cleanup.counts.MemoryCollectionMarker ||
          snapshots.cleanup.counts.TrackingReadMap
        )
          failures.push(`${name}: markers or read maps survive full cleanup`);
        const second = snapshots.second.counts;
        results.push({scenario, mode, compiler, snapshots});
        console.log(
          `${name}: stores ${snapshots.first.counts.MemoryStoreMarker}→${second.MemoryStoreMarker}; collections ${snapshots.first.counts.MemoryCollectionMarker}→${second.MemoryCollectionMarker}; cleanup ${JSON.stringify(snapshots.cleanup.counts)}`,
        );
        await session.detach();
        await page.close();
      }
  await Bun.write(
    resolve(output, 'report.json'),
    JSON.stringify(
      {
        metadata: {
          label: process.env.MEMORY_LABEL ?? 'working-tree',
          createdAt: new Date().toISOString(),
          react: manifest.devDependencies.react,
          compiler: manifest.devDependencies['babel-plugin-react-compiler'],
          browser: browser.version(),
          bun: Bun.version,
          os: `${platform()} ${release()} ${arch()}`,
          build: 'production',
          dist,
          cycles,
          size,
          observeOnly,
        },
        compilation,
        failures,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Heap snapshots and report saved to ${output}`);
  if (!observeOnly)
    assert.deepEqual(failures, [], 'Retained object bounds exceeded');
} finally {
  await browser.close();
  server.stop(true);
}

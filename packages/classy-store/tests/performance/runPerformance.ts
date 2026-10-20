import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {arch, platform, release} from 'node:os';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {compileConsumer} from '../compiler/compileConsumer.mjs';
import type {
  ScaleConfiguration,
  ScaleMeasurement,
  ScaleOperation,
} from './performance.types';

const directory = dirname(fileURLToPath(import.meta.url));
const manifest = await Bun.file(
  resolve(directory, '../../package.json'),
).json();
const dist = resolve(
  process.env.BENCHMARK_DIST ?? resolve(directory, '../../dist'),
);
const output = resolve(
  process.env.BENCHMARK_OUTPUT ??
    resolve(directory, '../../../../test-results/react-performance.json'),
);
const sizes = (process.env.BENCHMARK_SIZES ?? '200,1000')
  .split(',')
  .map(Number);
const samples = Number(process.env.BENCHMARK_SAMPLES ?? 5);
const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 20);
const warmup = 5;
assert(sizes.every((size) => Number.isInteger(size) && size >= 10));
assert(Number.isInteger(samples) && samples > 0);
assert(Number.isInteger(iterations) && iterations > 0);

const scripts = new Map<string, string>();
const compilation: {filename: string; compiledFunctions: unknown[]}[] = [];
for (const compiler of [false, true]) {
  const bundle = await Bun.build({
    entrypoints: [resolve(directory, 'client.tsx')],
    target: 'browser',
    format: 'iife',
    minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [
      {
        name: 'scale-consumer',
        setup(build) {
          // Opt into React's production profiling renderer for both variants.
          build.onResolve({filter: /^react-dom\/client$/}, () => ({
            path: Bun.resolveSync('react-dom/profiling', directory),
          }));
          build.onResolve(
            {filter: /^(?:react(?:\/.*)?|react-dom|proxy-compare)$/},
            ({path}) => ({
              path: Bun.resolveSync(path, directory),
            }),
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
          if (compiler) {
            build.onLoad(
              {filter: /\/performance\/components\/.*\.tsx$/},
              async ({path}) => {
                const result = compileConsumer(
                  await Bun.file(path).text(),
                  path,
                  '19',
                  [basename(path, '.tsx')],
                );
                compilation.push({
                  filename: basename(path),
                  compiledFunctions: result.compiledFunctions,
                });
                return {contents: result.code, loader: 'tsx'};
              },
            );
          }
        },
      },
    ],
  });
  if (!bundle.success)
    throw new AggregateError(bundle.logs, 'Performance consumer build failed');
  scripts.set(
    compiler ? '/compiled.js' : '/plain.js',
    await bundle.outputs[0].text(),
  );
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
    const scriptPath =
      url.searchParams.get('compiler') === 'on' ? '/compiled.js' : '/plain.js';
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>React scale benchmark</title></head><body><div id="root"></div><script src="${scriptPath}"></script></body></html>`,
      {headers: {'Content-Type': 'text/html'}},
    );
  },
});

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
}

const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const size of sizes) {
    for (const workload of ['form', 'list'] as const) {
      for (const mode of ['selector', 'tracked'] as const) {
        for (const compiler of ['off', 'on'] as const) {
          const configuration: ScaleConfiguration = {size, workload, mode};
          const measurements: Record<string, ScaleMeasurement[]> = {};
          for (let sample = 0; sample < samples; sample += 1) {
            const page = await browser.newPage();
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => {
              if (message.type() === 'error') errors.push(message.text());
            });
            await page.goto(`${server.url}?compiler=${compiler}`);
            await page
              .waitForFunction(() => Boolean(window.scaleBenchmark))
              .catch((error) => {
                throw new AggregateError(
                  [error, ...errors],
                  `Benchmark failed to load (${compiler})`,
                );
              });
            const mount = await page.evaluate(
              (config) => window.scaleBenchmark.mount(config),
              configuration,
            );
            assert.equal(
              mount.metrics.consumerCommits,
              size,
              'Every consumer must mount',
            );
            assert.equal(
              mount.metrics.rootCommits,
              1,
              'Profiling renderer must be active',
            );
            measurements.mount ??= [];
            measurements.mount.push(mount);
            for (const operation of [
              'change',
              'burst',
              'unrelated',
              'noop',
              'parent',
            ] as ScaleOperation[]) {
              await page.evaluate(
                ({operation, warmup}) =>
                  window.scaleBenchmark.measure(operation, warmup),
                {operation, warmup},
              );
              const measurement = await page.evaluate(
                ({operation, iterations}) =>
                  window.scaleBenchmark.measure(operation, iterations),
                {operation, iterations},
              );
              const perIteration =
                operation === 'parent'
                  ? size
                  : operation === 'burst'
                    ? 10
                    : operation === 'change'
                      ? 1
                      : 0;
              assert.equal(
                measurement.metrics.consumerCommits,
                perIteration * iterations,
                `${workload}/${mode}/${compiler}/${operation}: unexpected consumer commits`,
              );
              assert.equal(
                measurement.metrics.rootCommits,
                perIteration ? iterations : 0,
                `${operation}: unexpected root commits`,
              );
              measurements[operation] ??= [];
              measurements[operation].push(measurement);
            }
            if (workload === 'form') {
              const input = page.getByRole('textbox', {
                name: 'Field 0',
                exact: true,
              });
              await input.focus();
              await input.evaluate((element) =>
                (element as HTMLInputElement).setSelectionRange(2, 2),
              );
              const previousValue = await input.inputValue();
              await page.evaluate(() => window.scaleBenchmark.resetMetrics());
              await input.pressSequentially('abcdefghij');
              assert.equal(
                await input.inputValue(),
                `${previousValue.slice(0, 2)}abcdefghij${previousValue.slice(2)}`,
              );
              assert.equal(
                await input.evaluate(
                  (element) => (element as HTMLInputElement).selectionStart,
                ),
                12,
              );
              const metrics = await page.evaluate(() =>
                window.scaleBenchmark.readMetrics(),
              );
              assert.equal(metrics.consumerCommits, 10);
              assert.equal(metrics.inputEventToCommitMs.length, 10);
              measurements.input ??= [];
              measurements.input.push({
                durationsMs: metrics.inputEventToCommitMs,
                metrics,
              });
            }
            const cleanup = await page.evaluate(() =>
              window.scaleBenchmark.unmount(),
            );
            assert.equal(cleanup.consumerCommits, 0);
            assert.equal(cleanup.selectorCalls, 0);
            assert.deepEqual(errors, []);
            await page.close();
          }
          const summary = Object.fromEntries(
            Object.entries(measurements).map(([operation, entries]) => [
              operation,
              summarize(entries.flatMap((entry) => entry.durationsMs)),
            ]),
          );
          results.push({
            configuration,
            compiler,
            summary,
            samples: measurements,
          });
          console.log(
            `${size} ${workload} ${mode} compiler=${compiler}: mount ${summary.mount.medianMs.toFixed(2)}ms, change ${summary.change.medianMs.toFixed(2)}ms, parent ${summary.parent.medianMs.toFixed(2)}ms`,
          );
        }
      }
    }
  }
  await mkdir(dirname(output), {recursive: true});
  await Bun.write(
    output,
    JSON.stringify(
      {
        metadata: {
          createdAt: new Date().toISOString(),
          react: manifest.devDependencies.react,
          libraryVersion: manifest.version,
          label: process.env.BENCHMARK_LABEL ?? 'working-tree',
          compiler: manifest.devDependencies['babel-plugin-react-compiler'],
          browser: browser.version(),
          bun: Bun.version,
          os: `${platform()} ${release()} ${arch()}`,
          build: 'production profiling',
          dist,
          sizes,
          samples,
          iterations,
          warmup,
          notes:
            'Instrumented measurements; flushSync includes notification, snapshot, render and commit. Input measures input-event capture to consumer layout effect, not paint. Timing values are observations, never CI thresholds.',
        },
        compilation,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Saved raw samples and compilation evidence to ${output}`);
} finally {
  await browser.close();
  server.stop(true);
}

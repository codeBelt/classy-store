import {fileURLToPath} from 'node:url';
import {compile} from 'svelte/compiler';
import {compileConsumer} from '../compiler/compileConsumer.mjs';
import {
  releaseStreamingBoundary,
  renderHydrationPage,
  renderStreamingHydrationPage,
} from './hydration/renderHydrationPage';
import page from './index.html';
import persistencePage from './persistence/index.html';

const hydrationBundle = await Bun.build({
  entrypoints: [
    fileURLToPath(new URL('./hydration/client.tsx', import.meta.url)),
  ],
  target: 'browser',
  format: 'iife',
  define: {'process.env.NODE_ENV': '"development"'},
});
if (!hydrationBundle.success)
  throw new Error('Could not bundle hydration fixture');
const hydrationScript = await hydrationBundle.outputs[0].text();

const compilerBundle = await Bun.build({
  entrypoints: [
    fileURLToPath(new URL('./compiler/client.tsx', import.meta.url)),
  ],
  target: 'browser',
  format: 'iife',
  define: {'process.env.NODE_ENV': '"development"'},
  plugins: [
    {
      name: 'react-compiler-consumer',
      setup(build) {
        build.onLoad(
          {filter: /\/compiler\/components\/.*\.tsx$/},
          async ({path}) => {
            const componentName = path
              .split('/')
              .at(-1)
              ?.replace(/\.tsx$/, '');
            if (!componentName)
              throw new Error('Missing compiler component name');
            const {code} = await compileConsumer(
              await Bun.file(path).text(),
              path,
              '19',
              [componentName],
            );
            return {contents: code, loader: 'tsx'};
          },
        );
      },
    },
  ],
});
if (!compilerBundle.success)
  throw new AggregateError(
    compilerBundle.logs,
    'Could not bundle compiled consumer fixture',
  );
const compilerScript = await compilerBundle.outputs[0].text();

const svelteBundle = await Bun.build({
  entrypoints: [fileURLToPath(new URL('./svelte/client.ts', import.meta.url))],
  target: 'browser',
  format: 'iife',
  conditions: ['development'],
  plugins: [
    {
      name: 'svelte-consumer',
      setup(build) {
        build.onLoad({filter: /\.svelte$/}, async ({path}) => {
          const {js, warnings} = compile(await Bun.file(path).text(), {
            filename: path,
            generate: 'client',
            dev: true,
          });
          if (warnings.length)
            throw new Error(
              warnings.map((warning) => warning.message).join('\n'),
            );
          return {contents: js.code, loader: 'js'};
        });
      },
    },
  ],
});
if (!svelteBundle.success)
  throw new AggregateError(
    svelteBundle.logs,
    'Could not bundle Svelte fixture',
  );
const svelteScript = await svelteBundle.outputs[0].text();

Bun.serve({
  hostname: '127.0.0.1',
  port: 4179,
  routes: {
    '/': page,
    '/persistence': persistencePage,
    '/svelte': () =>
      new Response(
        '<!doctype html><html><head><meta charset="utf-8"><title>Svelte consumer</title></head><body><div id="svelte-root"></div><script src="/svelte/client.js"></script></body></html>',
        {headers: {'Content-Type': 'text/html; charset=utf-8'}},
      ),
    '/svelte/client.js': () =>
      new Response(svelteScript, {
        headers: {'Content-Type': 'text/javascript; charset=utf-8'},
      }),
    '/compiler': () =>
      new Response(
        '<!doctype html><html><head><meta charset="utf-8"><title>Compiled consumer</title></head><body><div id="compiler-root"></div><script src="/compiler/client.js"></script></body></html>',
        {headers: {'Content-Type': 'text/html; charset=utf-8'}},
      ),
    '/compiler/client.js': () =>
      new Response(compilerScript, {
        headers: {'Content-Type': 'text/javascript; charset=utf-8'},
      }),
    '/hydration': renderHydrationPage,
    '/hydration/stream': renderStreamingHydrationPage,
    '/hydration/release': releaseStreamingBoundary,
    '/hydration/client.js': () =>
      new Response(hydrationScript, {
        headers: {'Content-Type': 'text/javascript; charset=utf-8'},
      }),
  },
  development: false,
});

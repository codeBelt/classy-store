import {fileURLToPath} from 'node:url';
import {
  releaseStreamingBoundary,
  renderHydrationPage,
  renderStreamingHydrationPage,
} from './hydration/renderHydrationPage';
import page from './index.html';

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

Bun.serve({
  hostname: '127.0.0.1',
  port: 4179,
  routes: {
    '/': page,
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

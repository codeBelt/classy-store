import {createElement} from 'react';
import {renderToReadableStream, renderToString} from 'react-dom/server';
import {HydrationApp} from './components/hydrationApp/HydrationApp';
import {createHydrationRuntime, type HydrationRuntime} from './hydration.store';

const pendingStreams = new Map<string, HydrationRuntime>();

export function renderHydrationPage(request: Request): Response {
  const query = new URL(request.url).searchParams;
  const initialData = {user: {name: query.get('name') ?? 'Server'}, count: 1};
  const runtime = createHydrationRuntime(initialData, false);
  const markup = renderToString(createElement(HydrationApp, {runtime}));
  const serializedData = JSON.stringify(initialData).replaceAll('<', '\\u003c');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Delayed hydration</title></head><body><div id="hydration-root">${markup}</div><script id="initial-data" type="application/json">${serializedData}</script><script src="/hydration/client.js" async></script></body></html>`,
    {
      headers: {'Content-Type': 'text/html; charset=utf-8'},
    },
  );
}

export async function renderStreamingHydrationPage(
  request: Request,
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const requestId = query.get('id');
  if (!requestId) return new Response('Missing stream id', {status: 400});
  const initialData = {user: {name: 'Server'}, count: 1};
  const runtime = createHydrationRuntime(initialData, true);
  pendingStreams.set(requestId, runtime);
  request.signal.addEventListener('abort', runtime.gate.release, {once: true});
  const reactStream = await renderToReadableStream(
    createElement(HydrationApp, {runtime}),
  );
  const encoder = new TextEncoder();
  // WebKit buffers very small HTML responses before parsing streamed scripts.
  const shellPadding = `<!--${' '.repeat(2048)}-->`;
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Streaming hydration</title></head><body>${shellPadding}<script id="initial-data" type="application/json">${JSON.stringify(initialData).replaceAll('<', '\\u003c')}</script><div id="hydration-root">`,
        ),
      );
      const reader = reactStream.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          controller.enqueue(chunk.value);
        }
        controller.enqueue(encoder.encode('</div></body></html>'));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        pendingStreams.delete(requestId);
        request.signal.removeEventListener('abort', runtime.gate.release);
        reader.releaseLock();
      }
    },
  });
  return new Response(responseStream, {
    headers: {'Content-Type': 'text/html; charset=utf-8'},
  });
}

export function releaseStreamingBoundary(request: Request): Response {
  const requestId = new URL(request.url).searchParams.get('id');
  const runtime = requestId ? pendingStreams.get(requestId) : undefined;
  if (request.method !== 'POST' || !runtime)
    return new Response('Unknown stream', {status: 404});
  runtime.gate.release();
  return new Response('Released');
}

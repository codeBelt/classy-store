import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

const output = new URL('./dist/browser/', import.meta.url);
createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const name =
    path === '/angular/' ? 'index.html' : path.slice('/angular/'.length);
  if (!path.startsWith('/angular/') || !/^[\w-]+\.(html|js|css)$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL(name, output));
    const type = name.endsWith('.html')
      ? 'text/html'
      : name.endsWith('.css')
        ? 'text/css'
        : 'text/javascript';
    response.writeHead(200, {'Content-Type': type}).end(content);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4180, '127.0.0.1');

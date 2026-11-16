import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

const framework = process.env.FRAMEWORK;
createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const name =
    path === `/${framework}`
      ? 'index.html'
      : path === '/client.js'
        ? 'client.js'
        : null;
  if (!name) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL(`./dist/${name}`, import.meta.url));
    response
      .writeHead(200, {
        'Content-Type': name.endsWith('.html')
          ? 'text/html'
          : 'text/javascript',
      })
      .end(content);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4181, '127.0.0.1');

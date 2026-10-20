import page from './index.html';

Bun.serve({
  hostname: '127.0.0.1',
  port: 4179,
  routes: {'/': page},
  development: false,
});

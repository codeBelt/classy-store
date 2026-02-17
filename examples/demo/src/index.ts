import {serve} from 'bun';
import index from './index.html';

const server = serve({
  routes: {
    '/api/posts': {
      async GET() {
        await Bun.sleep(800);
        return Response.json([
          {
            id: 1,
            title: 'Reactive Proxies',
            body: 'ES6 Proxy + immutable snapshots',
          },
          {
            id: 2,
            title: 'Microtask Batching',
            body: 'Multiple mutations, one render',
          },
          {
            id: 3,
            title: 'Computed Getters',
            body: 'Class getters as derived state',
          },
        ]);
      },
    },
    '/*': index,
  },

  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);

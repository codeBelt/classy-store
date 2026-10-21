import {createClassyStore, snapshot} from '@codebelt/classy-store';
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
import {subscribeKey} from '@codebelt/classy-store/utils';

export async function createServerProof(seed: string) {
  // Every request owns its store. Only plain data crosses the RSC boundary.
  const store = prepareStoreForHydration(
    createClassyStore({
      text: seed,
      values: reactiveMap<string, string>([['seed', seed]]),
      tags: reactiveSet<string>([seed]),
    }),
  );
  let updates = 0;
  const unsubscribe = subscribeKey(store, 'text', () => {
    updates++;
  });
  store.text = `${seed}:updated`;
  // Yield to other HTTP requests while this request's mutable store is alive.
  // A microtask-only yield would let an accidental module singleton escape the
  // concurrent-request regression because each handler could finish in order.
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  unsubscribe();
  const current = snapshot(store);
  if (current.values.get('seed') !== seed || !current.tags.has(seed)) {
    throw new Error('Server collections lost request data');
  }
  return {
    seed,
    proof: `${seed}|${current.text}|${updates}`,
    initialData: {text: `server:${seed}`, count: 0},
  };
}

import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../../index';
import {withHistory} from '../index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('withHistory() — which fields a restore touches', () => {
  it('undo keeps a function that was added to the store after the entry', async () => {
    const store = createClassyStore<{count: number; describe?: () => string}>({
      count: 0,
    });
    const history = withHistory(store);
    store.count = 1;
    await flush();
    store.describe = () => 'added later';
    await flush();

    history.undo();
    history.undo();

    expect(store.count).toBe(0);
    expect(store.describe?.()).toBe('added later');
    history.dispose();
  });

  it('undo does not put back a function that was replaced', async () => {
    const store = createClassyStore<{count: number; describe: () => string}>({
      count: 0,
      describe: () => 'first',
    });
    const history = withHistory(store);
    store.describe = () => 'second';
    store.count = 1;
    await flush();

    history.undo();

    expect(store.count).toBe(0);
    expect(store.describe()).toBe('second');
    history.dispose();
  });

  it('undo brings back a removed field whose value was undefined', async () => {
    const store = createClassyStore<{note?: string; count: number}>({
      note: undefined,
      count: 0,
    });
    const history = withHistory(store);
    delete store.note;
    await flush();
    expect('note' in store).toBe(false);

    history.undo();

    expect('note' in store).toBe(true);
    expect(store.note).toBeUndefined();
    history.dispose();
  });
});

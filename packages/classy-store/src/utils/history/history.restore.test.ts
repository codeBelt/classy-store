import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {withHistory} from './history';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('withHistory() — restoring state', () => {
  it('undo removes a top-level field that was added after the entry', async () => {
    const store = createClassyStore({} as Record<string, number>);
    const history = withHistory(store);
    store.a = 1;
    await flush();
    store.b = 2;
    await flush();

    history.undo();
    expect(snapshot(store)).toEqual({a: 1});
    history.undo();
    expect(snapshot(store)).toEqual({});
    history.redo();
    history.redo();
    expect(snapshot(store)).toEqual({a: 1, b: 2});
  });

  it('undo leaves methods and getters in place when removing added fields', async () => {
    class Form {
      [field: string]: unknown;
      name = '';

      get filled() {
        return this.name.length > 0;
      }

      rename(name: string) {
        this.name = name;
      }
    }
    const store = createClassyStore(new Form());
    const history = withHistory(store);
    store.extra = 'temporary';
    await flush();

    history.undo();

    expect('extra' in store).toBe(false);
    store.rename('Ada');
    expect(store.filled).toBe(true);
  });

  it('undo right after an edit steps back over that edit', async () => {
    const store = createClassyStore({value: 0});
    const history = withHistory(store);
    store.value = 1;
    await flush();

    store.value = 2;
    history.undo(); // The edit to 2 has not been recorded by a notification yet.

    expect(store.value).toBe(1);
    expect(history.canRedo).toBe(true);
    await flush();
    // The pending notification for that edit must not add a second entry.
    history.redo();
    expect(store.value).toBe(2);
    expect(history.canRedo).toBe(false);
    history.undo();
    history.undo();
    expect(store.value).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it('undo with only an unrecorded edit returns to the initial state', () => {
    const store = createClassyStore({value: 0});
    const history = withHistory(store);

    store.value = 5;
    history.undo();

    expect(store.value).toBe(0);
    history.redo();
    expect(store.value).toBe(5);
  });

  it('undo while paused does not record the unrecorded edit', async () => {
    const store = createClassyStore({value: 0});
    const history = withHistory(store);
    store.value = 1;
    await flush();
    history.pause();

    store.value = 9;
    history.undo();

    expect(store.value).toBe(0);
    history.redo();
    expect(store.value).toBe(1);
    expect(history.canRedo).toBe(false);
  });

  it('undo and redo keep the identity of branches they do not change', async () => {
    const store = createClassyStore({count: 0, big: {list: [1, 2, 3]}});
    const history = withHistory(store);
    const big = snapshot(store).big;
    store.count = 1;
    await flush();

    const bigListener = mock(() => {});
    subscribe(store.big, bigListener, {sync: true});
    history.undo();
    expect(store.count).toBe(0);
    expect(snapshot(store).big).toBe(big);
    history.redo();
    expect(store.count).toBe(1);
    expect(snapshot(store).big).toBe(big);
    expect(bigListener).not.toHaveBeenCalled();
  });

  it('undo still restores a branch that did change', async () => {
    const store = createClassyStore({count: 0, big: {list: [1, 2, 3]}});
    const history = withHistory(store);
    store.big.list.push(4);
    await flush();

    history.undo();
    expect(store.big.list).toEqual([1, 2, 3]);
    history.redo();
    expect(store.big.list).toEqual([1, 2, 3, 4]);
    // The restored branch is live state again, not a frozen snapshot.
    store.big.list.push(5);
    expect(store.big.list).toEqual([1, 2, 3, 4, 5]);
  });

  it('undo and redo restore the content of a frozen value', async () => {
    const store = createClassyStore<{profile: {name: string}}>({
      profile: Object.freeze({name: 'Ada'}),
    });
    const history = withHistory(store);
    store.profile = Object.freeze({name: 'Grace'});
    await flush();

    history.undo();
    expect(store.profile.name).toBe('Ada');
    expect(snapshot(store)).toEqual({profile: {name: 'Ada'}});

    history.redo();
    expect(store.profile.name).toBe('Grace');
    history.dispose();
  });
});

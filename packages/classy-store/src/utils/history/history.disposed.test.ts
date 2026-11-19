import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../../index';
import {type HistoryHandle, withHistory} from '../index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Whether the object behind `ref` has been garbage collected. */
async function isCollected(ref: WeakRef<object>): Promise<boolean> {
  for (let attempt = 0; attempt < 30 && ref.deref() !== undefined; attempt++) {
    await flush();
    Bun.gc(true);
  }
  return ref.deref() === undefined;
}

describe('withHistory() — after dispose()', () => {
  it('undo leaves the store alone, even with edits made since', async () => {
    const store = createClassyStore({count: 0});
    const history = withHistory(store);
    store.count = 1;
    await flush();
    history.dispose();

    store.count = 2;
    history.undo();
    store.count = 3;
    history.undo();

    expect(store.count).toBe(3);
  });

  it('pause() does not change the published status', () => {
    const history = withHistory(createClassyStore({count: 0}));
    history.dispose();
    const final = history.getSnapshot();

    history.pause();

    expect(history.getSnapshot()).toBe(final);
    expect(final).toEqual({
      canUndo: false,
      canRedo: false,
      isPaused: false,
      isDisposed: true,
    });
  });

  it('resume() does not change the published status', () => {
    const history = withHistory(createClassyStore({count: 0}));
    history.pause();
    history.dispose();
    const final = history.getSnapshot();

    history.resume();

    expect(history.getSnapshot()).toBe(final);
    expect(final).toEqual({
      canUndo: false,
      canRedo: false,
      isPaused: true,
      isDisposed: true,
    });
  });

  it('a history disposed by another subscriber keeps none of the states it was told about', async () => {
    const store = createClassyStore({doc: {text: 'first'}});
    const owner: {history?: HistoryHandle} = {};
    // Subscribed first, so it runs just before the recorder in each delivery.
    subscribe(store, () => owner.history?.dispose());
    owner.history = withHistory(store);

    store.doc = {text: 'second'};
    await flush();
    const delivered = new WeakRef(snapshot(store).doc);
    store.doc = {text: 'third'};
    snapshot(store);

    expect(await isCollected(delivered)).toBe(true);
    expect(owner.history.getSnapshot().isDisposed).toBe(true);
  });
});

describe('withHistory() — while dispose() is being published', () => {
  it('every status subscriber hears about a dispose, even when one of them disposes again', () => {
    const history = withHistory(createClassyStore({count: 0}));
    const later = mock(() => {});
    history.subscribe(() => history.dispose());
    history.subscribe(later);

    history.dispose();

    expect(later).toHaveBeenCalledTimes(1);
    expect(history.getSnapshot().isDisposed).toBe(true);
  });
});

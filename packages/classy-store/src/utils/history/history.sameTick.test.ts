import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../../index';
import {withHistory} from '../index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('withHistory() — edits in the same tick as another step', () => {
  it('a change made just before history is attached is the starting point, not an undo step', async () => {
    const store = createClassyStore({count: 0});
    const seen = mock(() => {});
    // Another subscriber, so the edit below still has a notification pending
    // when history subscribes.
    subscribe(store, seen);
    store.count = 1;

    const history = withHistory(store);
    await flush();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(history.canUndo).toBe(false);
    history.undo();
    expect(store.count).toBe(1);
    history.dispose();
  });

  // FINDING: an edit made in the same tick after undo() is not recorded when its notification arrives, so redo stays available and redo() discards the edit.
  it('an edit made in the same tick after an undo is not recorded, and a redo then discards it', async () => {
    const store = createClassyStore({value: 0});
    const history = withHistory(store);
    store.value = 1;
    await flush();

    history.undo();
    store.value = 9;
    await flush();

    expect(history.canRedo).toBe(true);
    history.redo();
    expect(store.value).toBe(1);
    history.undo();
    expect(store.value).toBe(0);
    expect(history.canUndo).toBe(false);
    history.dispose();
  });
});

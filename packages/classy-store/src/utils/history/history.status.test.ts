import {describe, expect, mock, test} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {withHistory} from './history';

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('withHistory status', () => {
  test('publishes stable readonly snapshots as undo and redo availability changes', async () => {
    const store = createClassyStore({count: 0});
    const history = withHistory(store);
    const listener = mock(() => {});
    history.subscribe(listener);
    try {
      const initial = history.getSnapshot();
      expect(Object.isFrozen(initial)).toBe(true);
      expect(history.getSnapshot()).toBe(initial);
      store.count = 1;
      await tick();
      const recorded = history.getSnapshot();
      expect(recorded.canUndo).toBe(true);
      expect(initial.canUndo).toBe(false);
      expect(history.getServerSnapshot()).toBe(initial);
      store.count = 2;
      await tick();
      expect(history.getSnapshot()).toBe(recorded);
      expect(listener).toHaveBeenCalledTimes(1);
      history.undo();
      await tick();
      expect(history.getSnapshot()).toMatchObject({
        canUndo: true,
        canRedo: true,
      });
      history.redo();
      await tick();
      expect(history.getSnapshot()).toMatchObject({
        canUndo: true,
        canRedo: false,
      });
    } finally {
      history.dispose();
    }
  });

  test('notifies for pause and resume without a store mutation and supports unsubscribe', () => {
    const history = withHistory(createClassyStore({count: 0}));
    const listener = mock(() => {});
    const unsubscribe = history.subscribe(listener);
    history.pause();
    history.pause();
    expect(history.getSnapshot().isPaused).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    history.resume();
    expect(history.getSnapshot().isPaused).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    history.pause();
    expect(listener).toHaveBeenCalledTimes(2);
    history.dispose();
  });

  test('keeps an explicit pause made during undo and emits one final disposal status', async () => {
    const store = createClassyStore({count: 0});
    const history = withHistory(store);
    store.count++;
    await tick();
    history.undo();
    history.pause();
    await tick();
    store.count = 5;
    await tick();
    expect(history.getSnapshot()).toMatchObject({
      isPaused: true,
      canUndo: false,
      canRedo: true,
    });
    const listener = mock(() => {});
    history.subscribe(listener);
    history.dispose();
    history.dispose();
    history.resume();
    history.undo();
    store.count++;
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(history.getSnapshot()).toMatchObject({
      isDisposed: true,
      canUndo: false,
      canRedo: false,
    });
    const retiredListener = mock(() => {});
    history.subscribe(retiredListener)();
    expect(retiredListener).not.toHaveBeenCalled();
  });
});

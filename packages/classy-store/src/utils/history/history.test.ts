import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {withHistory} from './history';

/** Flush the queueMicrotask-based batching. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('withHistory', () => {
  it('captures initial state as history[0]', () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    h.dispose();
  });

  it('undo restores previous state', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();

    store.count = 2;
    await tick();

    expect(store.count).toBe(2);
    expect(h.canUndo).toBe(true);

    h.undo();
    expect(store.count).toBe(1);

    h.undo();
    expect(store.count).toBe(0);

    expect(h.canUndo).toBe(false);
    h.dispose();
  });

  it('redo restores next state after undo', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();

    h.undo();
    h.undo();
    expect(store.count).toBe(0);
    expect(h.canRedo).toBe(true);

    h.redo();
    expect(store.count).toBe(1);

    h.redo();
    expect(store.count).toBe(2);
    expect(h.canRedo).toBe(false);

    h.dispose();
  });

  it('new mutation after undo truncates redo history', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();

    // Undo to count=1
    h.undo();
    await tick();
    expect(store.count).toBe(1);
    expect(h.canRedo).toBe(true);

    // New mutation from this point
    store.count = 99;
    await tick();

    // Redo should no longer be available — redo entries truncated
    expect(h.canRedo).toBe(false);
    expect(store.count).toBe(99);

    // Undo should go back to 1, then 0
    h.undo();
    expect(store.count).toBe(1);
    h.undo();
    expect(store.count).toBe(0);

    h.dispose();
  });

  it('enforces the history limit', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store, {limit: 3});

    // Initial state = history[0] (count=0)
    store.count = 1;
    await tick();
    store.count = 2;
    await tick();
    // history now: [0, 1, 2] — at limit

    store.count = 3;
    await tick();
    // history should shift: [1, 2, 3]

    // Can only undo twice (not three times back to 0)
    h.undo();
    expect(store.count).toBe(2);
    h.undo();
    expect(store.count).toBe(1);
    expect(h.canUndo).toBe(false);

    h.dispose();
  });

  it('pause() stops recording and resume() restarts it', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();

    h.pause();

    store.count = 2;
    await tick();
    store.count = 3;
    await tick();

    h.resume();

    store.count = 4;
    await tick();

    // History: [0, 1, 4] — 2 and 3 were skipped during pause
    h.undo();
    expect(store.count).toBe(1);

    h.undo();
    expect(store.count).toBe(0);
    expect(h.canUndo).toBe(false);

    h.dispose();
  });

  it('undo() does not silently un-pause an explicitly paused recorder', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();

    // User pauses recording, then performs an undo. The undo internally
    // toggles `paused` while applying the snapshot — but it must restore
    // the prior (user-set) paused state, not unconditionally clear it.
    h.pause();
    h.undo();
    expect(store.count).toBe(1);

    // Wait past the microtask that restores `paused`.
    await tick();

    // A subsequent mutation should NOT be recorded — recorder is still paused.
    store.count = 99;
    await tick();

    // Redo should still go to 2 (the recorded state), proving the
    // mutation to 99 was not added to history.
    h.redo();
    expect(store.count).toBe(2);

    h.dispose();
  });

  it('skips getters during state restoration', async () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 10;
    await tick();

    expect(store.doubled).toBe(20);

    h.undo();
    expect(store.count).toBe(5);
    expect(store.doubled).toBe(10); // Recomputed, not overwritten

    h.dispose();
  });

  it('undo/redo do not record additional history entries', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();

    // Undo twice, redo once — should not add history entries
    h.undo();
    h.undo();
    h.redo();

    // We should be at count=1 with redo available
    expect(store.count).toBe(1);
    expect(h.canRedo).toBe(true);
    expect(h.canUndo).toBe(true);

    h.dispose();
  });

  it('works with multiple properties', async () => {
    class Store {
      name = 'Alice';
      age = 30;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.name = 'Bob';
    store.age = 25;
    await tick();

    expect(store.name).toBe('Bob');
    expect(store.age).toBe(25);

    h.undo();
    expect(store.name).toBe('Alice');
    expect(store.age).toBe(30);

    h.dispose();
  });

  it('undo at the beginning is a no-op', () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    h.undo(); // should not throw or change anything
    expect(store.count).toBe(0);
    expect(h.canUndo).toBe(false);

    h.dispose();
  });

  it('redo at the end is a no-op', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();

    h.redo(); // already at the end — no-op
    expect(store.count).toBe(1);
    expect(h.canRedo).toBe(false);

    h.dispose();
  });

  it('skips methods during state restoration', async () => {
    class Store {
      count = 0;
      increment() {
        this.count++;
      }
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.increment();
    await tick();

    expect(store.count).toBe(1);

    h.undo();
    expect(store.count).toBe(0);
    expect(typeof store.increment).toBe('function');

    h.dispose();
  });

  it('resume after pause captures a fresh snapshot on next mutation', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();

    h.pause();
    store.count = 50;
    await tick();
    store.count = 100;
    await tick();
    h.resume();

    store.count = 200;
    await tick();

    // History: [0, 1, 200] — 50 and 100 skipped
    h.undo();
    expect(store.count).toBe(1);
    h.undo();
    expect(store.count).toBe(0);
    expect(h.canUndo).toBe(false);

    h.dispose();
  });

  it('multiple undo-redo cycles work correctly', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();

    // Cycle 1
    h.undo();
    expect(store.count).toBe(1);
    h.redo();
    expect(store.count).toBe(2);

    // Cycle 2
    h.undo();
    h.undo();
    expect(store.count).toBe(0);
    h.redo();
    h.redo();
    expect(store.count).toBe(2);

    h.dispose();
  });

  it('handles limit of 2 (minimum useful history)', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store, {limit: 2});

    store.count = 1;
    await tick();
    // history: [0, 1] — at limit

    store.count = 2;
    await tick();
    // history: [1, 2] — shifted

    h.undo();
    expect(store.count).toBe(1);
    expect(h.canUndo).toBe(false);

    h.redo();
    expect(store.count).toBe(2);

    h.dispose();
  });

  it('batched mutations (within one tick) produce one history entry', async () => {
    class Store {
      x = 0;
      y = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.x = 10;
    store.y = 20;
    await tick();

    // Should be one history entry for both changes
    h.undo();
    expect(store.x).toBe(0);
    expect(store.y).toBe(0);
    expect(h.canUndo).toBe(false);

    h.dispose();
  });

  it('dispose stops recording and cleans up', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const h = withHistory(store);

    store.count = 1;
    await tick();

    h.dispose();

    // After dispose, canUndo/canRedo should reflect empty state
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

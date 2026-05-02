import {afterEach, describe, expect, it, mock} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {devtools} from './devtools';

/** Flush the queueMicrotask-based batching. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Mock DevTools Extension ──────────────────────────────────────────────────

type MockConnection = {
  init: ReturnType<typeof mock>;
  send: ReturnType<typeof mock>;
  subscribe: ReturnType<typeof mock>;
  _listener: ((message: unknown) => void) | null;
};

function createMockConnection(): MockConnection {
  const conn: MockConnection = {
    init: mock(() => {}),
    send: mock(() => {}),
    subscribe: mock((listener: (message: unknown) => void) => {
      conn._listener = listener;
      return () => {
        conn._listener = null;
      };
    }),
    _listener: null,
  };
  return conn;
}

function createMockExtension(conn: MockConnection) {
  return {
    connect: mock(() => conn),
  };
}

/** Helper to set the mock extension on window. */
function setExtension(ext: ReturnType<typeof createMockExtension>) {
  (window as unknown as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ =
    ext;
}

/** Helper to delete the extension from window. */
function deleteExtension() {
  if (typeof window !== 'undefined') {
    delete (window as unknown as Record<string, unknown>)
      .__REDUX_DEVTOOLS_EXTENSION__;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('devtools', () => {
  afterEach(() => {
    deleteExtension();
  });

  it('returns a noop if __REDUX_DEVTOOLS_EXTENSION__ is not available', () => {
    deleteExtension();

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const dispose = devtools(store);

    // Should not throw and return a function
    expect(typeof dispose).toBe('function');
    dispose(); // noop
  });

  it('returns a noop when enabled is false', () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const dispose = devtools(store, {enabled: false});

    expect(ext.connect).not.toHaveBeenCalled();
    dispose();
  });

  it('connects with a custom name and sends init state', () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store, {name: 'MyStore'});

    expect(ext.connect).toHaveBeenCalledWith({name: 'MyStore'});
    expect(conn.init).toHaveBeenCalledTimes(1);

    // Init should receive a snapshot of the store
    const initState = conn.init.mock.calls[0][0] as Record<string, unknown>;
    expect(initState.count).toBe(0);
  });

  it('sends state updates to DevTools on store mutation', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 5;
    await tick();

    expect(conn.send).toHaveBeenCalledTimes(1);
    const [action, state] = conn.send.mock.calls[0] as [
      {type: string},
      Record<string, unknown>,
    ];
    expect(action.type).toBe('STORE_UPDATE');
    expect(state.count).toBe(5);
  });

  it('handles JUMP_TO_STATE time-travel', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
      name = 'hello';
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 10;
    store.name = 'world';
    await tick();

    // Simulate time-travel back to initial state
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({count: 0, name: 'hello'}),
    });
    await tick();

    expect(store.count).toBe(0);
    expect(store.name).toBe('hello');
  });

  it('skips getters during time-travel restore', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }
    }

    const store = createClassyStore(new Store());
    devtools(store);

    // Simulate time-travel with a getter key included
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({count: 3, doubled: 999}),
    });
    await tick();

    expect(store.count).toBe(3);
    // Getter should recompute, not be overwritten
    expect(store.doubled).toBe(6);
  });

  it('handles JUMP_TO_ACTION time-travel', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 10;
    await tick();

    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_ACTION'},
      state: JSON.stringify({count: 3}),
    });
    await tick();

    expect(store.count).toBe(3);
  });

  it('skips methods during time-travel restore', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
      increment() {
        this.count++;
      }
    }

    const store = createClassyStore(new Store());
    devtools(store);

    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({count: 5, increment: 'should be skipped'}),
    });
    await tick();

    expect(store.count).toBe(5);
    expect(typeof store.increment).toBe('function');
  });

  it('does not send state updates during time-travel', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 5;
    await tick();
    const sendCountBefore = conn.send.mock.calls.length;

    // Simulate time-travel — should NOT trigger a send
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({count: 0}),
    });
    await tick();

    expect(conn.send.mock.calls.length).toBe(sendCountBefore);
  });

  it('ignores non-DISPATCH messages', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    conn._listener?.({
      type: 'ACTION',
      state: JSON.stringify({count: 999}),
    });
    await tick();

    expect(store.count).toBe(0);
  });

  it('ignores DISPATCH messages without state', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      // no state field
    });
    await tick();

    expect(store.count).toBe(0);
  });

  it('ignores DISPATCH messages with non-jump payload types', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'COMMIT'},
      state: JSON.stringify({count: 999}),
    });
    await tick();

    expect(store.count).toBe(0);
  });

  it('handles corrupted JSON in time-travel state gracefully', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 5;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    // Should not throw
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: 'not-valid-json!!!',
    });
    await tick();

    expect(store.count).toBe(5); // unchanged
  });

  it('uses default name ClassyStore when no name provided', () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    expect(ext.connect).toHaveBeenCalledWith({name: 'ClassyStore'});
  });

  it('sends multiple state updates for sequential mutations', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 1;
    await tick();
    store.count = 2;
    await tick();
    store.count = 3;
    await tick();

    expect(conn.send).toHaveBeenCalledTimes(3);
    const lastState = conn.send.mock.calls[2][1] as Record<string, unknown>;
    expect(lastState.count).toBe(3);
  });

  it('disposes correctly (unsubscribes from store and devtools)', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const dispose = devtools(store);

    store.count = 1;
    await tick();
    expect(conn.send).toHaveBeenCalledTimes(1);

    dispose();

    store.count = 2;
    await tick();
    // No additional send after dispose
    expect(conn.send).toHaveBeenCalledTimes(1);
    // DevTools listener should be removed
    expect(conn._listener).toBeNull();
  });

  it('does not send partial time-travel state as STORE_UPDATE when assignment throws', async () => {
    const conn = createMockConnection();
    const ext = createMockExtension(conn);
    setExtension(ext);

    class Store {
      count = 0;
      name = 'hello';

      // A setter that throws on a specific value
      set bomb(_v: unknown) {
        throw new Error('assignment failed');
      }
    }

    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 5;
    await tick();
    const sendCountBefore = conn.send.mock.calls.length;

    // Simulate time-travel with a key that triggers a throwing setter.
    // The `count` assignment succeeds but `bomb` throws mid-loop.
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_STATE'},
      state: JSON.stringify({count: 0, bomb: 'trigger', name: 'world'}),
    });
    await tick();

    // The partial state change should NOT be sent as a STORE_UPDATE
    expect(conn.send.mock.calls.length).toBe(sendCountBefore);
  });

  it('JUMP_TO_ACTION followed by user mutation does not loop', async () => {
    const conn = createMockConnection();
    setExtension(createMockExtension(conn));

    class Store {
      count = 0;
    }
    const store = createClassyStore(new Store());
    devtools(store);

    store.count = 5;
    await tick();

    // Time-travel back to count=0.
    conn._listener?.({
      type: 'DISPATCH',
      payload: {type: 'JUMP_TO_ACTION'},
      state: JSON.stringify({count: 0}),
    });
    await tick();

    const sendCountAfterJump = conn.send.mock.calls.length;

    // User mutates after the time-travel.
    store.count = 99;
    await tick();

    // Exactly ONE additional send (the user mutation), not multiple.
    expect(conn.send.mock.calls.length).toBe(sendCountAfterJump + 1);

    // Subsequent mutation also single send.
    store.count = 100;
    await tick();
    expect(conn.send.mock.calls.length).toBe(sendCountAfterJump + 2);
  });
});

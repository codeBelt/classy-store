import {afterEach, describe, expect, it, mock} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {store} from '../core/core';
import {shallowEqual} from '../utils/equality/equality';
import {useStore} from './react';

// ── Test harness ────────────────────────────────────────────────────────────

/** Flush queueMicrotask batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let container: HTMLDivElement;

function setup(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
}

function teardown(): void {
  document.body.removeChild(container);
}

/** Render a component and return the Root (for unmount tests). */
function render(element: ReactNode): Root {
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return root;
}

// ── Store class used across tests ───────────────────────────────────────────

class TestStore {
  count = 0;
  name = 'Alice';
  theme = 'dark';
  items: number[] = [];
  user = {name: 'Alice', age: 30};
  other = 'x';

  increment() {
    this.count++;
  }

  setMultiple(count: number, name: string) {
    this.count = count;
    this.name = name;
  }

  async asyncIncrement() {
    this.count++;
    await Promise.resolve();
    this.count++;
  }

  async asyncMultiAwait() {
    this.count++;
    await Promise.resolve();
    this.count++;
    await Promise.resolve();
    this.count++;
  }

  async asyncPreOnly() {
    this.count++;
    this.name = 'changed';
    await Promise.resolve();
  }

  async asyncPostOnly() {
    await Promise.resolve();
    this.count++;
    this.name = 'changed';
  }
}

// ── Block 1: Batching — multi-prop methods ──────────────────────────────────

describe('Batching — multi-prop methods cause single re-render', () => {
  afterEach(teardown);

  it('method writing two props (selector mode)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      const name = useStore(s, (snap) => snap.name);
      renderCount();
      return (
        <div>
          {count}-{name}
        </div>
      );
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.setMultiple(5, 'new');
      await flush();
    });

    expect(container.textContent).toBe('5-new');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('method writing two props (auto-tracked mode)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useStore(s);
      renderCount();
      return (
        <div>
          {snap.count}-{snap.name}
        </div>
      );
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.setMultiple(5, 'new');
      await flush();
    });

    expect(container.textContent).toBe('5-new');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('method writing two props, only one selected', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function CountOnly() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<CountOnly />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.setMultiple(5, 'new');
      await flush();
    });

    expect(container.textContent).toBe('5');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});

// ── Block 2: Batching — rapid mutations in a loop ───────────────────────────

describe('Batching — rapid mutations in a loop', () => {
  afterEach(teardown);

  it('100 increments in for-loop (selector mode)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (let i = 0; i < 100; i++) s.increment();
      await flush();
    });

    expect(container.textContent).toBe('100');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('100 increments in for-loop (auto-tracked mode)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (let i = 0; i < 100; i++) s.increment();
      await flush();
    });

    expect(container.textContent).toBe('100');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('50 array pushes in for-loop (selector on length)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const length = useStore(s, (snap) => snap.items.length);
      renderCount();
      return <div>{length}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('0');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (let i = 0; i < 50; i++) s.items.push(i);
      await flush();
    });

    expect(container.textContent).toBe('50');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});

// ── Block 3: Set-then-revert — no re-render ─────────────────────────────────

describe('Set-then-revert — no re-render when value returns to original', () => {
  afterEach(teardown);

  it('primitive revert (selector mode)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.count = 99;
      s.count = 0;
      await flush();
    });

    expect(container.textContent).toBe('0');
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('primitive revert (auto-tracked mode) — re-renders because snapshot ref changes', async () => {
    // Unlike selector mode (which compares the extracted value), auto-tracked mode
    // detects that the snapshot *object* is a new reference (version was bumped),
    // so `getAutoTrackSnapshot` builds a new tracking proxy → re-render.
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.count = 99;
      s.count = 0;
      await flush();
    });

    expect(container.textContent).toBe('0');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('nested object prop revert (selector on user.name)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const name = useStore(s, (snap) => snap.user.name);
      renderCount();
      return <div>{name}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.user.name = 'Bob';
      s.user.name = 'Alice';
      await flush();
    });

    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('unrelated prop revert — structural sharing preserves reference', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const user = useStore(s, (snap) => snap.user);
      renderCount();
      return <div>{user.name}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.theme = 'light';
      s.theme = 'dark';
      await flush();
    });

    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);
  });
});

// ── Block 4: Async methods — re-renders split across await boundaries ───────

describe('Async methods — re-renders split across await boundaries', () => {
  afterEach(teardown);

  it('1 await, mutations before + after (selector)', async () => {
    // React batches both microtask notifications within act() into a single
    // commit, so we see 1 re-render (not 2) for mutations on both sides of an await.
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await s.asyncIncrement();
      await flush();
    });

    expect(container.textContent).toBe('2');
    expect(renderCount).toHaveBeenCalledTimes(2); // 1 initial + 1 re-render (batched)
  });

  it('2 awaits, mutations between each (selector)', async () => {
    // 3 mutations across 3 turns — React batches some of the microtask
    // notifications, resulting in 2 re-renders rather than 3.
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await s.asyncMultiAwait();
      await flush();
    });

    expect(container.textContent).toBe('3');
    expect(renderCount).toHaveBeenCalledTimes(3); // 1 initial + 2 re-renders (partially batched)
  });

  it('mutations only before await (selector)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await s.asyncPreOnly();
      await flush();
    });

    expect(container.textContent).toBe('1');
    expect(renderCount).toHaveBeenCalledTimes(2); // 1 initial + 1 re-render
  });

  it('mutations only after await (selector)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await s.asyncPostOnly();
      await flush();
    });

    expect(container.textContent).toBe('1');
    expect(renderCount).toHaveBeenCalledTimes(2); // 1 initial + 1 re-render
  });

  it('1 await, mutations before + after (auto-tracked)', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await s.asyncIncrement();
      await flush();
    });

    expect(container.textContent).toBe('2');
    expect(renderCount).toHaveBeenCalledTimes(2); // 1 initial + 1 re-render (batched)
  });
});

// ── Block 5: Multiple components sharing the same store ─────────────────────

describe('Multiple components sharing the same store', () => {
  afterEach(teardown);

  it('different selectors, independent re-render', async () => {
    const s = store(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useStore(s, (snap) => snap.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const name = useStore(s, (snap) => snap.name);
      renderCountB();
      return <span>{name}</span>;
    }

    setup();
    render(
      <>
        <ComponentA />
        <ComponentB />
      </>,
    );
    expect(renderCountA).toHaveBeenCalledTimes(1);
    expect(renderCountB).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.increment();
      await flush();
    });

    expect(renderCountA).toHaveBeenCalledTimes(2);
    expect(renderCountB).toHaveBeenCalledTimes(1);
  });

  it('same selector, both re-render', async () => {
    const s = store(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useStore(s, (snap) => snap.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const count = useStore(s, (snap) => snap.count);
      renderCountB();
      return <span>{count}</span>;
    }

    setup();
    render(
      <>
        <ComponentA />
        <ComponentB />
      </>,
    );
    expect(renderCountA).toHaveBeenCalledTimes(1);
    expect(renderCountB).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.increment();
      await flush();
    });

    expect(renderCountA).toHaveBeenCalledTimes(2);
    expect(renderCountB).toHaveBeenCalledTimes(2);
  });

  it('auto-tracked, both re-render when store notifies', async () => {
    // In auto-tracked mode, when the store notifies all subscribers, each
    // component's getSnapshot produces a new snapshot ref — both components
    // re-render, unlike selector mode which compares extracted values.
    const s = store(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const snap = useStore(s);
      renderCountA();
      return <span>{snap.count}</span>;
    }

    function ComponentB() {
      const snap = useStore(s);
      renderCountB();
      return <span>{snap.name}</span>;
    }

    setup();
    render(
      <>
        <ComponentA />
        <ComponentB />
      </>,
    );
    expect(renderCountA).toHaveBeenCalledTimes(1);
    expect(renderCountB).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.increment();
      await flush();
    });

    expect(renderCountA).toHaveBeenCalledTimes(2);
    expect(renderCountB).toHaveBeenCalledTimes(2);
  });

  it('batched multi-prop, both affected', async () => {
    const s = store(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useStore(s, (snap) => snap.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const name = useStore(s, (snap) => snap.name);
      renderCountB();
      return <span>{name}</span>;
    }

    setup();
    render(
      <>
        <ComponentA />
        <ComponentB />
      </>,
    );
    expect(renderCountA).toHaveBeenCalledTimes(1);
    expect(renderCountB).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.setMultiple(5, 'new');
      await flush();
    });

    expect(renderCountA).toHaveBeenCalledTimes(2);
    expect(renderCountB).toHaveBeenCalledTimes(2);
  });
});

// ── Block 6: Unmount safety ─────────────────────────────────────────────────

describe('Unmount safety', () => {
  afterEach(teardown);

  it('unmount during pending microtask does not crash', async () => {
    const s = store(new TestStore());

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      return <div>{count}</div>;
    }

    setup();
    const root = render(<Display />);
    expect(container.textContent).toBe('0');

    await act(async () => {
      s.increment(); // schedules microtask notification
      root.unmount(); // unsubscribes synchronously
      await flush(); // microtask fires with no listeners
    });

    // If we reach here without throwing, the test passes.
    expect(true).toBe(true);
  });

  it('unmount and remount with same store shows latest state', async () => {
    const s = store(new TestStore());

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      return <div>{count}</div>;
    }

    setup();
    const root = render(<Display />);
    expect(container.textContent).toBe('0');

    // Unmount
    act(() => {
      root.unmount();
    });

    // Mutate while no component is mounted
    s.increment();
    s.increment();
    s.increment();
    await flush();

    // Remount — should show latest state
    render(<Display />);
    expect(container.textContent).toBe('3');
  });
});

// ── Block 7: shallowEqual as useStore isEqual — integration ─────────────────

describe('shallowEqual as useStore isEqual — integration', () => {
  afterEach(teardown);

  it('prevents re-render when shallow values are unchanged', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const data = useStore(
        s,
        (snap) => ({count: snap.count, name: snap.name}),
        shallowEqual,
      );
      renderCount();
      return (
        <div>
          {data.count}-{data.name}
        </div>
      );
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Mutate a prop NOT included in the selector output.
    await act(async () => {
      s.other = 'changed';
      await flush();
    });

    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('re-renders when shallow values differ', async () => {
    const s = store(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const data = useStore(
        s,
        (snap) => ({count: snap.count, name: snap.name}),
        shallowEqual,
      );
      renderCount();
      return (
        <div>
          {data.count}-{data.name}
        </div>
      );
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.increment();
      await flush();
    });

    expect(container.textContent).toBe('1-Alice');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});

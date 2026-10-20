import {afterEach, describe, expect, it, mock} from 'bun:test';
import {act, type ReactNode, useLayoutEffect} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {createClassyStore} from '../../core/core';
import {shallowEqual} from '../../utils/equality/equality';
import {useClassyStore} from './react';

// ── Test harness ────────────────────────────────────────────────────────────

/** Flush queueMicrotask batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function createGate() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

let container: HTMLDivElement;
const roots = new Set<Root>();

function setup(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
}

function teardown(): void {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots.clear();
  container.remove();
}

/** Render a component and return the Root (for unmount tests). */
function render(element: ReactNode): Root {
  const root = createRoot(container);
  roots.add(root);
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

  async asyncIncrement(pause: Promise<void>) {
    this.count++;
    await pause;
    this.count++;
  }

  async asyncMultiAwait(firstPause: Promise<void>, secondPause: Promise<void>) {
    this.count++;
    await firstPause;
    this.count++;
    await secondPause;
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      const name = useClassyStore(s, (state) => state.name);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useClassyStore(s);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function CountOnly() {
      const count = useClassyStore(s, (state) => state.count);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useClassyStore(s);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const length = useClassyStore(s, (state) => state.items.length);
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

// ── Block 3: Set-then-revert — committed output ─────────────────────────────────

describe('Set-then-revert — commits the restored value', () => {
  afterEach(teardown);

  it('primitive revert (selector mode)', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});
    const committedValues: number[] = [];

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      renderCount();
      useLayoutEffect(() => {
        committedValues.push(count);
      });
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
    expect(committedValues.length).toBeGreaterThan(0);
    expect(committedValues.every((value) => value === 0)).toBe(true);
  });

  it('primitive revert (auto-tracked mode)', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});
    const committedValues: number[] = [];

    function Display() {
      const snap = useClassyStore(s);
      renderCount();
      useLayoutEffect(() => {
        committedValues.push(snap.count);
      });
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
    expect(committedValues.length).toBeGreaterThan(0);
    expect(committedValues.every((value) => value === 0)).toBe(true);
  });

  it('nested object prop revert (selector on user.name)', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});
    const committedValues: string[] = [];

    function Display() {
      const name = useClassyStore(s, (state) => state.user.name);
      renderCount();
      useLayoutEffect(() => {
        committedValues.push(name);
      });
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
    expect(committedValues.length).toBeGreaterThan(0);
    expect(committedValues.every((value) => value === 'Alice')).toBe(true);
  });

  it('unrelated prop revert — structural sharing preserves reference', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const user = useClassyStore(s, (state) => state.user);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    const gate = createGate();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = s.asyncIncrement(gate.promise);
    });
    expect(container.textContent).toBe('1');

    await act(async () => {
      gate.resolve();
      await completion;
    });
    expect(container.textContent).toBe('2');
  });

  it('2 awaits, mutations between each (selector)', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    const firstGate = createGate();
    const secondGate = createGate();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = s.asyncMultiAwait(firstGate.promise, secondGate.promise);
    });
    expect(container.textContent).toBe('1');

    await act(async () => firstGate.resolve());
    expect(container.textContent).toBe('2');

    await act(async () => {
      secondGate.resolve();
      await completion;
    });
    expect(container.textContent).toBe('3');
  });

  it('mutations only before await (selector)', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const snap = useClassyStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    const gate = createGate();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = s.asyncIncrement(gate.promise);
    });
    expect(container.textContent).toBe('1');

    await act(async () => {
      gate.resolve();
      await completion;
    });
    expect(container.textContent).toBe('2');
  });
});

// ── Block 5: Multiple components sharing the same store ─────────────────────

describe('Multiple components sharing the same store', () => {
  afterEach(teardown);

  it('different selectors, independent re-render', async () => {
    const s = createClassyStore(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useClassyStore(s, (state) => state.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const name = useClassyStore(s, (state) => state.name);
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
    const s = createClassyStore(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useClassyStore(s, (state) => state.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const count = useClassyStore(s, (state) => state.count);
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

  it('auto-tracked components update only for properties they read', async () => {
    const s = createClassyStore(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const snap = useClassyStore(s);
      renderCountA();
      return <span>{snap.count}</span>;
    }

    function ComponentB() {
      const snap = useClassyStore(s);
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
    expect(renderCountB).toHaveBeenCalledTimes(1);
  });

  it('batched multi-prop, both affected', async () => {
    const s = createClassyStore(new TestStore());
    const renderCountA = mock(() => {});
    const renderCountB = mock(() => {});

    function ComponentA() {
      const count = useClassyStore(s, (state) => state.count);
      renderCountA();
      return <span>{count}</span>;
    }

    function ComponentB() {
      const name = useClassyStore(s, (state) => state.name);
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
    const s = createClassyStore(new TestStore());

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      return <div>{count}</div>;
    }

    setup();
    const root = render(<Display />);
    expect(container.textContent).toBe('0');

    await act(async () => {
      s.increment();
      root.unmount();
      roots.delete(root);
      await flush();
    });

    expect(container.textContent).toBe('');
  });

  it('unmount and remount with same store shows latest state', async () => {
    const s = createClassyStore(new TestStore());

    function Display() {
      const count = useClassyStore(s, (state) => state.count);
      return <div>{count}</div>;
    }

    setup();
    const root = render(<Display />);
    expect(container.textContent).toBe('0');

    // Unmount
    act(() => {
      root.unmount();
      roots.delete(root);
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

// ── Block 7: shallowEqual as useClassyStore isEqual — integration ─────────────

describe('shallowEqual as useClassyStore isEqual — integration', () => {
  afterEach(teardown);

  it('prevents re-render when shallow values are unchanged', async () => {
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const data = useClassyStore(
        s,
        (state) => ({count: state.count, name: state.name}),
        {isEqual: shallowEqual},
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
    const s = createClassyStore(new TestStore());
    const renderCount = mock(() => {});

    function Display() {
      const data = useClassyStore(
        s,
        (state) => ({count: state.count, name: state.name}),
        {isEqual: shallowEqual},
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

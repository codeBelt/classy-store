import {afterEach, describe, expect, it, mock} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {store} from '../core/core';
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

/** Render a component and return a helper to update. */
function render(element: ReactNode): void {
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
}

// ── Selector mode tests ─────────────────────────────────────────────────────

describe('useStore — selector mode', () => {
  afterEach(teardown);

  it('renders the selected value', () => {
    class Counter {
      count = 42;
    }
    const s = store(new Counter());

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      return <div data-testid="count">{count}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('42');
  });

  it('re-renders when selected value changes', async () => {
    class Counter {
      count = 0;
      increment() {
        this.count++;
      }
    }
    const s = store(new Counter());
    const renderCount = mock(() => {});

    function Display() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('0');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.increment();
      await flush();
    });

    expect(container.textContent).toBe('1');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-render when unrelated prop changes', async () => {
    const s = store({count: 0, name: 'hello'});
    const renderCount = mock(() => {});

    function CountDisplay() {
      const count = useStore(s, (snap) => snap.count);
      renderCount();
      return <div>{count}</div>;
    }

    setup();
    render(<CountDisplay />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change `name` which CountDisplay does not select.
    await act(async () => {
      s.name = 'world';
      await flush();
    });

    // Selector returns same count → Object.is matches → no re-render.
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('handles object selectors with structural equality', async () => {
    class Store {
      user = {name: 'Alice', age: 30};
      theme = 'dark';
      updateName(name: string) {
        this.user.name = name;
      }
    }
    const s = store(new Store());
    const renderCount = mock(() => {});

    function UserDisplay() {
      const user = useStore(s, (snap) => snap.user);
      renderCount();
      return <div>{user.name}</div>;
    }

    setup();
    render(<UserDisplay />);
    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change user → should re-render.
    await act(async () => {
      s.updateName('Bob');
      await flush();
    });

    expect(container.textContent).toBe('Bob');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('handles array selectors', async () => {
    const s = store({items: ['a', 'b']});
    const renderCount = mock(() => {});

    function List() {
      const items = useStore(s, (snap) => snap.items);
      renderCount();
      return <div>{items.join(',')}</div>;
    }

    setup();
    render(<List />);
    expect(container.textContent).toBe('a,b');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.items.push('c');
      await flush();
    });

    expect(container.textContent).toBe('a,b,c');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('supports computed getters in selector', async () => {
    class Store {
      count = 5;
      get doubled() {
        return this.count * 2;
      }
      setCount(value: number) {
        this.count = value;
      }
    }
    const s = store(new Store());

    function Display() {
      const doubled = useStore(s, (snap) => snap.doubled);
      return <div>{doubled}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('10');

    await act(async () => {
      s.setCount(10);
      await flush();
    });

    expect(container.textContent).toBe('20');
  });

  it('supports custom isEqual for selector', async () => {
    const s = store({items: [{id: 1, name: 'a'}]});
    const renderCount = mock(() => {});

    // Selector always returns a new array reference, but custom isEqual does shallow comparison.
    function List() {
      const firstItem = useStore(
        s,
        (snap) => ({name: snap.items[0]?.name}),
        (a, b) => a.name === b.name,
      );
      renderCount();
      return <div>{firstItem.name}</div>;
    }

    setup();
    render(<List />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Mutation that doesn't change the selected data.
    await act(async () => {
      s.items.push({id: 2, name: 'b'});
      await flush();
    });

    // Custom isEqual prevents re-render since first item name is the same.
    expect(renderCount).toHaveBeenCalledTimes(1);
  });
});

// ── Auto-tracked (selectorless) mode tests ──────────────────────────────────

describe('useStore — auto-tracked mode', () => {
  afterEach(teardown);

  it('renders accessed properties', () => {
    const s = store({count: 42, name: 'hello'});

    function Display() {
      const snap = useStore(s);
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('42');
  });

  it('re-renders when accessed property changes', async () => {
    const s = store({count: 0, name: 'hello'});
    const renderCount = mock(() => {});

    function Display() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('0');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.count = 5;
      await flush();
    });

    expect(container.textContent).toBe('5');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-render when non-accessed property changes', async () => {
    const s = store({count: 0, name: 'hello'});
    const renderCount = mock(() => {});

    function CountOnly() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.count}</div>;
    }

    setup();
    render(<CountOnly />);
    expect(renderCount).toHaveBeenCalledTimes(1);

    // `name` was never accessed by the component.
    await act(async () => {
      s.name = 'world';
      await flush();
    });

    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('tracks nested object property access', async () => {
    const s = store({user: {name: 'Alice', age: 30}, theme: 'dark'});
    const renderCount = mock(() => {});

    function UserName() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.user.name}</div>;
    }

    setup();
    render(<UserName />);
    expect(container.textContent).toBe('Alice');
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change `theme` — should NOT re-render (not accessed).
    await act(async () => {
      s.theme = 'light';
      await flush();
    });
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change `user.name` — SHOULD re-render (accessed).
    await act(async () => {
      s.user.name = 'Bob';
      await flush();
    });
    expect(container.textContent).toBe('Bob');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('tracks array length and element access', async () => {
    const s = store({items: ['a', 'b'], other: 'x'});
    const renderCount = mock(() => {});

    function ItemCount() {
      const snap = useStore(s);
      renderCount();
      return <div>{snap.items.length}</div>;
    }

    setup();
    render(<ItemCount />);
    expect(container.textContent).toBe('2');
    expect(renderCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      s.items.push('c');
      await flush();
    });

    expect(container.textContent).toBe('3');
    expect(renderCount).toHaveBeenCalledTimes(2);
  });

  it('computed getters work in auto-tracked mode', async () => {
    class Store {
      count = 5;
      get doubled() {
        return this.count * 2;
      }
      setCount(value: number) {
        this.count = value;
      }
    }
    const s = store(new Store());

    function Display() {
      const snap = useStore(s);
      return <div>{snap.doubled}</div>;
    }

    setup();
    render(<Display />);
    expect(container.textContent).toBe('10');

    await act(async () => {
      s.setCount(20);
      await flush();
    });

    expect(container.textContent).toBe('40');
  });
});

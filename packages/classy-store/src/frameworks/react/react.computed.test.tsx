import {afterEach, describe, expect, it, mock} from 'bun:test';
import {act, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {createClassyStore} from '../../core/core';
import type {Snapshot} from '../../types';
import {useClassyStore} from './react';

/** Helper: flush the queueMicrotask-based batching. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Integration tests with useClassyStore ──────────────────────────────────────

describe('computed getters — useClassyStore integration', () => {
  let container: HTMLDivElement;

  function setup(): void {
    container = document.createElement('div');
    document.body.appendChild(container);
  }

  function teardown(): void {
    document.body.removeChild(container);
  }

  function render(element: ReactNode): void {
    const root = createRoot(container);
    act(() => {
      root.render(element);
    });
  }

  afterEach(teardown);

  // 13. useClassyStore selector with getter returns stable reference
  it('selector with getter returns stable reference — no re-render on unrelated change', async () => {
    class TodoStore {
      todos = [{text: 'Buy milk', done: false}];
      theme = 'dark';

      get activeTodos() {
        return this.todos.filter((todo) => !todo.done);
      }

      setTheme(value: string) {
        this.theme = value;
      }
    }

    const todoStore = createClassyStore(new TodoStore());
    const renderCount = mock(() => {});

    function ActiveList() {
      const active = useClassyStore(
        todoStore,
        (snap: Snapshot<TodoStore>) => snap.activeTodos,
      );
      renderCount();
      return <div>{active.length}</div>;
    }

    setup();
    render(<ActiveList />);
    expect(container.textContent).toBe('1');
    expect(renderCount).toHaveBeenCalledTimes(1);

    // Change `theme` — activeTodos getter doesn't depend on it.
    // The snapshot getter is memoized, so it returns the same reference.
    await act(async () => {
      todoStore.setTheme('light');
      await flush();
    });

    // Should NOT re-render because the getter result is the same reference.
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  // 14. Auto-tracked mode with getter access
  it('auto-tracked mode works with computed getters', async () => {
    class Store {
      count = 5;

      get doubled() {
        return this.count * 2;
      }

      setCount(value: number) {
        this.count = value;
      }
    }

    const s = createClassyStore(new Store());

    function Display() {
      const snap = useClassyStore(s);
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

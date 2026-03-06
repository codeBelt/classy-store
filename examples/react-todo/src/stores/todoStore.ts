import {createClassyStore} from '@codebelt/classy-store';
import {persist} from '@codebelt/classy-store/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export type FilterMode = 'all' | 'active' | 'completed';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

export class TodoStore {
  todos: Todo[] = [];
  filter: FilterMode = 'all';

  // ── Computed (class getters → auto-memoized) ─────────────────────────────

  get filteredTodos(): Todo[] {
    switch (this.filter) {
      case 'active':
        return this.todos.filter((t) => !t.completed);
      case 'completed':
        return this.todos.filter((t) => t.completed);
      default:
        return this.todos;
    }
  }

  get total(): number {
    return this.todos.length;
  }

  get completedCount(): number {
    return this.todos.filter((t) => t.completed).length;
  }

  get remaining(): number {
    return this.total - this.completedCount;
  }

  get allCompleted(): boolean {
    return this.total > 0 && this.remaining === 0;
  }

  // ── Actions (prototype methods → reactive) ───────────────────────────────

  addTodo(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    this.todos = [
      {
        id: `t${Date.now()}`,
        text: trimmed,
        completed: false,
        createdAt: Date.now(),
      },
      ...this.todos,
    ];
  }

  toggleTodo(id: string) {
    this.todos = this.todos.map((t) =>
      t.id === id ? {...t, completed: !t.completed} : t,
    );
  }

  removeTodo(id: string) {
    this.todos = this.todos.filter((t) => t.id !== id);
  }

  toggleAll() {
    const allDone = this.allCompleted;
    this.todos = this.todos.map((t) => ({...t, completed: !allDone}));
  }

  clearCompleted() {
    this.todos = this.todos.filter((t) => !t.completed);
  }

  setFilter(filter: FilterMode) {
    this.filter = filter;
  }
}

// ── Create + persist ─────────────────────────────────────────────────────────

export const todoStore = createClassyStore(new TodoStore());

export const todoPersistHandle = persist(todoStore, {
  name: 'classy-todo',
  debounce: 300,
});

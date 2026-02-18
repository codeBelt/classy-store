import {createClassyStore} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {CodeBlock} from '../components/CodeBlock';

// ── Live Quick Start Store ──────────────────────────────────────────────────

class TodoStore {
  items: {id: number; text: string; done: boolean}[] = [];
  private nextId = 1;

  get remaining() {
    return this.items.filter((item) => !item.done).length;
  }

  add(text: string) {
    this.items = [...this.items, {id: this.nextId++, text, done: false}];
  }

  toggle(index: number) {
    const item = this.items[index];
    if (item) item.done = !item.done;
  }
}

const todoStore = createClassyStore(new TodoStore());

// ── Quick Start Code ────────────────────────────────────────────────────────

const QUICK_START = `import { createClassyStore } from '@codebelt/classy-store';
import { useStore } from '@codebelt/classy-store/react';

class TodoStore {
  items: { text: string; done: boolean }[] = [];

  // Getters are computed values — memoized until deps change
  get remaining() {
    return this.items.filter((item) => !item.done).length;
  }

  add(text: string) {
    this.items = [...this.items, { text, done: false }];
  }

  toggle(index: number) {
    this.items[index].done = !this.items[index].done;
  }
}

const todoStore = createClassyStore(new TodoStore());

function TodoApp() {
  const snap = useStore(todoStore);
  return (
    <div>
      <h2>{snap.remaining} remaining</h2>
      {snap.items.map((item, i) => (
        <label key={i}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => todoStore.toggle(i)}
          />
          {item.text}
        </label>
      ))}
    </div>
  );
}`;

// ── Live Demo Component ─────────────────────────────────────────────────────

function LiveTodoApp() {
  const snap = useStore(todoStore);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    todoStore.add(input.trim());
    setInput('');
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-100">
          {snap.remaining} remaining
        </h3>
        <span className="text-xs text-zinc-500 font-mono">
          {snap.items.length} total
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a todo..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500/50"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors cursor-pointer"
        >
          Add
        </button>
      </form>

      {snap.items.length === 0 ? (
        <p className="text-sm text-zinc-600 italic">
          No todos yet. Add one above.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {snap.items.map((item, i) => (
            <li key={item.id}>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => todoStore.toggle(i)}
                  className="accent-indigo-500 cursor-pointer"
                />
                <span
                  className={`text-sm transition-colors ${
                    item.done
                      ? 'text-zinc-600 line-through'
                      : 'text-zinc-200 group-hover:text-zinc-100'
                  }`}
                >
                  {item.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Quick Start Section ─────────────────────────────────────────────────────

function QuickStartSection() {
  const [showLive, setShowLive] = useState(false);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Quick Start</h2>
        <button
          type="button"
          onClick={() => setShowLive(!showLive)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200"
        >
          {showLive ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Code icon"
              >
                <title>Code icon</title>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              View Code
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Play icon"
              >
                <title>Play icon</title>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Try It Live
            </>
          )}
        </button>
      </div>

      {showLive ? (
        <LiveTodoApp />
      ) : (
        <CodeBlock code={QUICK_START} title="todo-example.tsx" />
      )}
    </section>
  );
}

// ── Features ────────────────────────────────────────────────────────────────

const features = [
  {
    title: 'Reactivity',
    description:
      'Proxy-based tracking with microtask batching and render isolation via selectors.',
    href: '#/reactivity',
    color: 'indigo',
  },
  {
    title: 'Collections',
    description:
      'ReactiveMap and ReactiveSet with Map/Set semantics the proxy can track.',
    href: '#/collections',
    color: 'emerald',
  },
  {
    title: 'Snapshots',
    description:
      'Structural sharing — unchanged sub-trees keep the same reference identity.',
    href: '#/snapshots',
    color: 'cyan',
  },
  {
    title: 'useLocalStore',
    description:
      'Component-scoped stores created on mount, disposed on unmount.',
    href: '#/use-local-store',
    color: 'violet',
  },
  {
    title: 'Persist',
    description:
      'localStorage with transforms, versioning, migration, debounce, and cross-tab sync.',
    href: '#/persist',
    color: 'teal',
  },
  {
    title: 'History',
    description:
      'Undo/redo via withHistory() with pause/resume for batched entries.',
    href: '#/history',
    color: 'amber',
  },
  {
    title: 'DevTools',
    description:
      'Connect to Redux DevTools for state inspection and time-travel debugging.',
    href: '#/devtools',
    color: 'rose',
  },
  {
    title: 'subscribeKey',
    description: 'Subscribe to individual property changes outside of React.',
    href: '#/subscribe-key',
    color: 'blue',
  },
  {
    title: 'shallowEqual',
    description:
      'Prevent re-renders when a selector returns a new object with the same values.',
    href: '#/shallow-equal',
    color: 'pink',
  },
];

const colorMap: Record<string, string> = {
  indigo:
    'border-indigo-500/30 hover:border-indigo-500/50 hover:bg-indigo-500/5',
  emerald:
    'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5',
  cyan: 'border-cyan-500/30 hover:border-cyan-500/50 hover:bg-cyan-500/5',
  violet:
    'border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/5',
  teal: 'border-teal-500/30 hover:border-teal-500/50 hover:bg-teal-500/5',
  amber: 'border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5',
  rose: 'border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-500/5',
  blue: 'border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/5',
  pink: 'border-pink-500/30 hover:border-pink-500/50 hover:bg-pink-500/5',
};

const titleColorMap: Record<string, string> = {
  indigo: 'text-indigo-400',
  emerald: 'text-emerald-400',
  cyan: 'text-cyan-400',
  violet: 'text-violet-400',
  teal: 'text-teal-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  blue: 'text-blue-400',
  pink: 'text-pink-400',
};

export function OverviewPage() {
  return (
    <>
      {/* Hero */}
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
          @codebelt/classy-store
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto mb-4">
          Class-based reactive state for React. Mutable writes, immutable reads,
          microtask batching, and structural sharing — all with zero
          boilerplate.
        </p>
        <code className="inline-block bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-emerald-400 font-mono">
          npm i @codebelt/classy-store
        </code>
      </header>

      <QuickStartSection />

      {/* Feature Grid */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Explore Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <a
              key={feature.href}
              href={feature.href}
              className={`block border rounded-xl p-4 transition-all ${colorMap[feature.color]}`}
            >
              <h3
                className={`text-sm font-semibold mb-1 ${titleColorMap[feature.color]}`}
              >
                {feature.title}
              </h3>
              <p className="text-xs text-zinc-400">{feature.description}</p>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

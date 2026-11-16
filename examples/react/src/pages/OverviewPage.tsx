import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import instrumentImage from '../../../../website/public/instruments/bench-scope.webp' with {
  type: 'file',
};
import {BenchScope} from '../../../../website/signal/instruments';
import {CodeBlock} from '../components/CodeBlock';
import {navGroups} from '../components/exampleNavigation';

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
import { useClassyStore } from '@codebelt/classy-store/react';

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
  const snap = useClassyStore(todoStore);
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
  const snap = useClassyStore(todoStore);
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
          {showLive ? 'View code' : 'Try it live'}
        </button>
      </div>

      <div hidden={!showLive}>
        <LiveTodoApp />
      </div>
      {!showLive && <CodeBlock code={QUICK_START} title="todo-example.tsx" />}
    </section>
  );
}

export function OverviewPage() {
  return (
    <>
      <header>
        <h1>Interactive examples</h1>
        <p>Run the demos and see which parts of the store change.</p>
      </header>
      <a className="featured-demo" href="#/reactivity">
        <div>
          <h2>Reactivity</h2>
          <p>Change a value and watch its subscribers respond.</p>
          <span className="lab-primary">Open demo →</span>
        </div>
        <BenchScope src={instrumentImage} samples={[0, 1, 2]} value={2} />
      </a>
      <div className="example-directory">
        {navGroups.slice(1).map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            <div>
              {group.items.map((item) => (
                <a href={item.href} key={item.href}>
                  <strong>{item.label} →</strong>
                  <span>{item.description}</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
      <QuickStartSection />
    </>
  );
}

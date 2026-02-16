import {createClassyStore} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {Panel} from './Panel';
import {RenderBadge} from './RenderBadge';
import {CounterStore, counterStore} from './stores';
import {useRenderCount} from './useRenderCount';

const batchStore = createClassyStore(new CounterStore());

const names = ['World', 'Bun', 'React', 'Store'];
let nameIndex = 0;

function CountCard() {
  const count = useStore(counterStore, (s) => s.count);
  const renders = useRenderCount();
  return (
    <div className="flex-1 flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-xs text-zinc-400 uppercase tracking-wide">
          Count
        </div>
        <div className="text-xl font-mono font-bold text-indigo-400">
          {count}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function NameCard() {
  const name = useStore(counterStore, (s) => s.name);
  const renders = useRenderCount();
  return (
    <div className="flex-1 flex items-center justify-between bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Name
        </div>
        <div className="text-xl font-mono font-bold text-violet-400">
          {name}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function BatchCard() {
  const count = useStore(batchStore, (s) => s.count);
  const renders = useRenderCount();
  return (
    <div className="flex-1 flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Batch
        </div>
        <div className="text-xl font-mono font-bold text-amber-400">
          {count}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

export function ReactiveFundamentalsDemo() {
  const [lastBatch, setLastBatch] = useState(false);

  return (
    <Panel
      title="Reactive Fundamentals"
      description="Render isolation via selectors + microtask batching + mutable deep updates — all in one store."
    >
      <div className="flex flex-col gap-3 mb-4">
        <CountCard />
        <NameCard />
        <BatchCard />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => counterStore.increment()}
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors cursor-pointer"
        >
          + Count
        </button>
        <button
          type="button"
          onClick={() => {
            nameIndex = (nameIndex + 1) % names.length;
            counterStore.setName(names[nameIndex] as string);
          }}
          className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-400 transition-colors cursor-pointer"
        >
          Change Name
        </button>
        <button
          type="button"
          onClick={() => {
            batchStore.incrementMany(1000);
            setLastBatch(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors cursor-pointer"
        >
          +1000 Batch
        </button>
        <button
          type="button"
          onClick={() => {
            counterStore.reset();
            batchStore.reset();
            setLastBatch(false);
          }}
          className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors cursor-pointer"
        >
          Reset
        </button>
      </div>

      {lastBatch && (
        <p className="text-xs text-zinc-500">1000 mutations &rarr; 1 render</p>
      )}
    </Panel>
  );
}

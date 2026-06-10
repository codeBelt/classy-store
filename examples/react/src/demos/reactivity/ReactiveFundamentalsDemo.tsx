import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {CounterStore, counterStore} from '../../stores/counterStore';

const batchStore = createClassyStore(new CounterStore());

class DemoFormStore {
  name = 'Alice';

  setName(value: string) {
    this.name = value;
  }

  reset() {
    this.name = 'Alice';
  }
}

const formStore = createClassyStore(new DemoFormStore());

const names = ['World', 'Bun', 'React', 'Store'];
let nameIndex = 0;

const STORE_CODE = `class CounterStore {
  count = 0;
  name = 'World';

  increment() { this.count++; }
  setName(name: string) { this.name = name; }
  incrementMany(n: number) {
    for (let i = 0; i < n; i++) this.count++;
  }
  reset() { this.count = 0; this.name = 'World'; }
}

export const counterStore = createClassyStore(
  new CounterStore()
);`;

const COMPONENT_CODE = `function CountCard() {
  // Only re-renders when count changes
  const count = useClassyStore(counterStore, (state) => state.count);
  return <div>{count}</div>;
}

function NameCard() {
  // Only re-renders when name changes
  const name = useClassyStore(counterStore, (state) => state.name);
  return <div>{name}</div>;
}

function BatchCard() {
  // 1000 mutations → 1 render (microtask batching)
  const count = useClassyStore(batchStore, (state) => state.count);
  return <div>{count}</div>;
}

function NameInput() {
  const name = useClassyStore(formStore, (state) => state.name, { sync: true });

  return (
    <input
      value={name}
      onChange={(event) => formStore.setName(event.target.value)}
    />
  );
}`;

function CountCard() {
  const count = useClassyStore(counterStore, (state) => state.count);
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
  const name = useClassyStore(counterStore, (state) => state.name);
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
  const count = useClassyStore(batchStore, (state) => state.count);
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

function NameInputCard() {
  const name = useClassyStore(formStore, (state) => state.name, {sync: true});
  const renders = useRenderCount();

  return (
    <div className="flex-1 flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
      <label className="flex-1 min-w-0">
        <span className="block text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
          Name Input
        </span>
        <input
          value={name}
          onChange={(event) => formStore.setName(event.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
        />
      </label>
      <RenderBadge count={renders} />
    </div>
  );
}

export function ReactiveFundamentalsDemo() {
  const [lastBatch, setLastBatch] = useState(false);

  return (
    <DemoContainer
      title="Reactive Fundamentals"
      description="Render isolation via selectors + controlled inputs + microtask batching + mutable deep updates — all in one store."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Component', code: COMPONENT_CODE},
      ]}
    >
      <div className="flex flex-col gap-3 mb-4">
        <CountCard />
        <NameCard />
        <NameInputCard />
        <BatchCard />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => counterStore.increment()}>+ Count</Button>
        <Button
          variant="secondary"
          onClick={() => {
            nameIndex = (nameIndex + 1) % names.length;
            counterStore.setName(names[nameIndex] as string);
          }}
          className="!bg-violet-500 !text-white hover:!bg-violet-400"
        >
          Change Name
        </Button>
        <Button
          onClick={() => {
            batchStore.incrementMany(1000);
            setLastBatch(true);
          }}
          className="!bg-amber-500 hover:!bg-amber-400"
        >
          +1000 Batch
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            counterStore.reset();
            batchStore.reset();
            formStore.reset();
            setLastBatch(false);
          }}
        >
          Reset
        </Button>
      </div>

      {lastBatch && (
        <p className="text-xs text-zinc-500">1000 mutations &rarr; 1 render</p>
      )}
    </DemoContainer>
  );
}

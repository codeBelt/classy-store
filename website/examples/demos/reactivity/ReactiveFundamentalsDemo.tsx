'use client';

import {createClassyStore, subscribe} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {memo, useEffect, useRef, useState} from 'react';
import {BenchScope} from '@/signal/instruments';
import {Button} from '../../components/Button';
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

function readChannels() {
  return {count: counterStore.count, name: counterStore.name};
}

function CounterScope() {
  const [samples, setSamples] = useState(() => [readChannels()]);
  useEffect(
    () =>
      subscribe(
        counterStore,
        () => {
          const next = readChannels();
          setSamples((previous) => [...previous.slice(-23), next]);
        },
        {sync: true},
      ),
    [],
  );
  const latest = samples.at(-1) ?? readChannels();
  return (
    <div className="examples-scope">
      <BenchScope
        src={`${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/instruments/bench-scope.webp`}
        samples={samples.map((s) => s.count)}
        events={samples.map((s, i) =>
          i > 0 && s.name !== samples[i - 1]?.name ? 1 : 0,
        )}
        value={latest.count}
      />
    </div>
  );
}

function CountCard() {
  const count = useClassyStore(counterStore, (state) => state.count);
  const renders = useRenderCount();
  return (
    <div className="flex-1 flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5">
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
    <div className="flex-1 flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Name
        </div>
        <div className="text-xl font-mono font-bold text-amber-400">{name}</div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

const BatchCard = memo(function BatchCard() {
  const count = useClassyStore(batchStore, (state) => state.count);
  const renders = useRenderCount();
  const beforeBatch = useRef<number | null>(null);
  return (
    <div className="rounded-lg border border-zinc-700 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span>
          Batch <strong>{count}</strong>
        </span>
        <RenderBadge count={renders} />
      </div>
      <Button
        size="sm"
        onClick={() => {
          beforeBatch.current = renders;
          batchStore.incrementMany(1000);
        }}
      >
        +1000 Batch
      </Button>
      {beforeBatch.current !== null && (
        <output className="ms-2 text-xs">
          1000 mutations · {renders - beforeBatch.current} observed render(s)
        </output>
      )}
    </div>
  );
});

function NameInputCard() {
  const name = useClassyStore(formStore, (state) => state.name);
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
  const [resetId, setResetId] = useState(0);

  return (
    <>
      <CounterScope key={resetId} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => counterStore.increment()}>+ Count</Button>
        <Button
          variant="secondary"
          onClick={() => {
            nameIndex = (nameIndex + 1) % names.length;
            counterStore.setName(names[nameIndex] as string);
          }}
        >
          Change Name
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            counterStore.reset();
            batchStore.reset();
            formStore.reset();
            nameIndex = 0;
            setResetId((id) => id + 1);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="instrument-values mb-4">
        <CountCard />
        <NameCard />
        <NameInputCard />
        <BatchCard key={resetId} />
      </div>
    </>
  );
}

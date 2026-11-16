'use client';

import {useClassyStore, useLocalStore} from '@codebelt/classy-store/react';
import {Button} from '../../components/Button';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {LocalCounterStore} from '../../stores/localStoreExamples';

function CounterInstance({label, color}: {label: string; color: string}) {
  const store = useLocalStore(() => new LocalCounterStore(label));
  const snap = useClassyStore(store);
  const renders = useRenderCount();

  return (
    <div
      className={`flex-1 bg-${color}-500/10 border border-${color}-500/20 rounded-lg p-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          {snap.label}
        </span>
        <RenderBadge count={renders} />
      </div>
      <div
        className={`text-3xl font-mono font-bold text-${color}-400 text-center mb-3`}
      >
        {snap.count}
      </div>
      <div className="flex gap-2 justify-center">
        <Button size="sm" onClick={() => store.increment()}>
          +
        </Button>
        <Button size="sm" onClick={() => store.decrement()}>
          -
        </Button>
        <Button size="sm" variant="secondary" onClick={() => store.reset()}>
          Reset
        </Button>
      </div>
    </div>
  );
}

export function LocalCounterDemo() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <CounterInstance label="Counter A" color="indigo" />
      <CounterInstance label="Counter B" color="emerald" />
      <CounterInstance label="Counter C" color="amber" />
    </div>
  );
}

import {useLocalStore, useStore} from '@codebelt/classy-store/react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {LocalCounterStore} from '../../stores/localStoreExamples';

const STORE_CODE = `class LocalCounterStore {
  count = 0;
  label: string;

  constructor(label = 'Counter') {
    this.label = label;
  }

  increment() { this.count++; }
  decrement() { this.count--; }
  reset() { this.count = 0; }
}`;

const COMPONENT_CODE = `function CounterInstance({ label }: { label: string }) {
  // Each instance gets its own isolated store
  const store = useLocalStore(
    () => new LocalCounterStore(label)
  );
  const snap = useStore(store);

  return (
    <div>
      <span>{snap.label}: {snap.count}</span>
      <button onClick={() => store.increment()}>+</button>
      <button onClick={() => store.decrement()}>-</button>
    </div>
  );
}

// Three instances — completely independent state
<CounterInstance label="A" />
<CounterInstance label="B" />
<CounterInstance label="C" />`;

function CounterInstance({label, color}: {label: string; color: string}) {
  const store = useLocalStore(() => new LocalCounterStore(label));
  const snap = useStore(store);
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
    <DemoContainer
      title="Component-Scoped Counters"
      description="Each counter uses useLocalStore() — independent state created on mount, disposed on unmount."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Component', code: COMPONENT_CODE},
      ]}
    >
      <div className="grid grid-cols-3 gap-3">
        <CounterInstance label="Counter A" color="indigo" />
        <CounterInstance label="Counter B" color="emerald" />
        <CounterInstance label="Counter C" color="amber" />
      </div>
    </DemoContainer>
  );
}

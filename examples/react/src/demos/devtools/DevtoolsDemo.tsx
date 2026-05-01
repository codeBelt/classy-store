import {createClassyStore} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {devtools} from '@codebelt/classy-store/utils';
import {useEffect, useState} from 'react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';

class DevtoolsCounterStore {
  count = 0;
  label = 'DevTools Counter';

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  setLabel(label: string) {
    this.label = label;
  }

  reset() {
    this.count = 0;
    this.label = 'DevTools Counter';
  }
}

const devtoolsCounterStore = createClassyStore(new DevtoolsCounterStore());

const STORE_CODE = `class DevtoolsCounterStore {
  count = 0;
  label = 'DevTools Counter';

  increment() { this.count++; }
  decrement() { this.count--; }
  setLabel(label: string) { this.label = label; }
}

const store = createClassyStore(
  new DevtoolsCounterStore()
);`;

const COMPONENT_CODE = `import { devtools } from '@codebelt/classy-store/utils';

// Connect to Redux DevTools
useEffect(() => {
  const dispose = devtools(store, {
    name: 'MyCounter',
  });
  return dispose; // cleanup on unmount
}, []);

// That's it! Open Redux DevTools to inspect
// state changes, time-travel, and dispatch.`;

function DevtoolsCounter() {
  const snap = useClassyStore(devtoolsCounterStore);
  const renders = useRenderCount();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const dispose = devtools(devtoolsCounterStore, {
      name: 'DemoCounter',
    });
    setConnected(true);
    return () => {
      dispose();
      setConnected(false);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono border ${
              connected
                ? 'text-emerald-400 border-emerald-400/30'
                : 'text-zinc-500 border-zinc-600/30'
            }`}
          >
            {connected ? 'connected' : 'disconnected'}
          </span>
          <span className="text-xs text-zinc-500">Redux DevTools</span>
        </div>
        <RenderBadge count={renders} />
      </div>

      <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-3">
        <div>
          <div className="text-xs text-zinc-400 uppercase tracking-wide">
            {snap.label}
          </div>
          <div className="text-3xl font-mono font-bold text-indigo-400">
            {snap.count}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => devtoolsCounterStore.increment()}>+1</Button>
        <Button onClick={() => devtoolsCounterStore.decrement()}>-1</Button>
        <Button
          variant="secondary"
          onClick={() => devtoolsCounterStore.reset()}
        >
          Reset
        </Button>
      </div>

      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">
          Setup Instructions
        </div>
        <ol className="text-sm text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>
            Install the{' '}
            <span className="text-indigo-400 font-medium">Redux DevTools</span>{' '}
            browser extension
          </li>
          <li>Open browser DevTools (F12)</li>
          <li>
            Go to the <span className="font-mono text-xs">Redux</span> tab
          </li>
          <li>
            Click the buttons above and watch state changes appear in the
            timeline
          </li>
          <li>
            Use{' '}
            <span className="font-medium text-emerald-400">time-travel</span> to
            jump between states
          </li>
        </ol>
      </div>
    </div>
  );
}

export function DevtoolsDemo() {
  return (
    <DemoContainer
      title="Redux DevTools Integration"
      description="Connect any store to Redux DevTools for state inspection and time-travel debugging."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Usage', code: COMPONENT_CODE},
      ]}
    >
      <DevtoolsCounter />
    </DemoContainer>
  );
}

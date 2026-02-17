import {useStore} from '@codebelt/classy-store/react';
import {subscribeKey} from '@codebelt/classy-store/utils';
import {useEffect, useState} from 'react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {subscribeKeyStore} from '../../stores/subscribeKeyStore';

const STORE_CODE = `class SubscribeKeyStore {
  count = 0;
  name = 'Alice';
  lastUpdated = '';

  increment() {
    this.count++;
    this.lastUpdated = new Date().toLocaleTimeString();
  }
  setName(name: string) {
    this.name = name;
    this.lastUpdated = new Date().toLocaleTimeString();
  }
}

const store = createClassyStore(new SubscribeKeyStore());`;

const COMPONENT_CODE = `import { subscribeKey } from '@codebelt/classy-store/utils';

// Only fires when 'count' changes
const unsub = subscribeKey(store, 'count', (value, prev) => {
  console.log(\`count: \${prev} → \${value}\`);
});

// Changing 'name' does NOT trigger this callback
store.setName('Bob'); // callback not called
store.increment();     // callback fires!`;

const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
let nameIdx = 0;

interface LogEntry {
  id: number;
  message: string;
  timestamp: string;
}

let logId = 0;

export function SubscribeKeyDemo() {
  const snap = useStore(subscribeKeyStore);
  const renders = useRenderCount();
  const [countLog, setCountLog] = useState<LogEntry[]>([]);
  const [nameLog, setNameLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const ts = () => new Date().toLocaleTimeString();

    const unsubCount = subscribeKey(
      subscribeKeyStore,
      'count',
      (value, prev) => {
        setCountLog((log) => [
          {id: ++logId, message: `${prev} → ${value}`, timestamp: ts()},
          ...log.slice(0, 9),
        ]);
      },
    );

    const unsubName = subscribeKey(subscribeKeyStore, 'name', (value, prev) => {
      setNameLog((log) => [
        {id: ++logId, message: `"${prev}" → "${value}"`, timestamp: ts()},
        ...log.slice(0, 9),
      ]);
    });

    return () => {
      unsubCount();
      unsubName();
    };
  }, []);

  return (
    <DemoContainer
      title="subscribeKey"
      description="Subscribe to changes on a single property. Other property changes don't trigger the callback."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Usage', code: COMPONENT_CODE},
      ]}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            Count:{' '}
            <span className="font-mono text-indigo-400">{snap.count}</span>
          </span>
          <span className="text-sm text-zinc-400">
            Name: <span className="font-mono text-violet-400">{snap.name}</span>
          </span>
        </div>
        <RenderBadge count={renders} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => subscribeKeyStore.increment()}>
          Increment Count
        </Button>
        <Button
          onClick={() => {
            nameIdx = (nameIdx + 1) % names.length;
            subscribeKeyStore.setName(names[nameIdx] as string);
          }}
          className="!bg-violet-500 hover:!bg-violet-400"
        >
          Change Name
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-2">
            subscribeKey('count') log
          </div>
          <div className="h-24 overflow-y-auto text-xs font-mono space-y-0.5">
            {countLog.length === 0 ? (
              <p className="text-zinc-600">No events yet</p>
            ) : (
              countLog.map((e) => (
                <div key={e.id} className="text-indigo-400">
                  <span className="text-zinc-500">[{e.timestamp}]</span>{' '}
                  {e.message}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-2">
            subscribeKey('name') log
          </div>
          <div className="h-24 overflow-y-auto text-xs font-mono space-y-0.5">
            {nameLog.length === 0 ? (
              <p className="text-zinc-600">No events yet</p>
            ) : (
              nameLog.map((e) => (
                <div key={e.id} className="text-violet-400">
                  <span className="text-zinc-500">[{e.timestamp}]</span>{' '}
                  {e.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DemoContainer>
  );
}

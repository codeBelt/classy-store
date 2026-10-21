import {createClassyStore} from '@codebelt/classy-store';
import {flushSync} from 'react-dom';
import {createRoot, type Root} from 'react-dom/client';
import {ScaleApp} from './components/scaleApp/ScaleApp';
import {ScaleStore} from './performance.store';
import type {ScaleConfiguration, ScaleOperation} from './performance.types';
import {
  readMetrics,
  recordInputStart,
  resetMetrics,
} from './performanceMetrics';

let root: Root | undefined;
let store: ScaleStore;
let configuration: ScaleConfiguration;
let revision = 0;
let sequence = 0;

function render(): void {
  root?.render(
    <ScaleApp
      configuration={configuration}
      store={store}
      revision={revision}
    />,
  );
}

function mutate(operation: ScaleOperation): void {
  const index = sequence % configuration.size;
  sequence += 1;
  switch (operation) {
    case 'change':
      store.items[index].text = `Changed ${sequence}`;
      break;
    case 'burst':
      for (let offset = 0; offset < 10; offset += 1) {
        store.items[(index + offset) % configuration.size].text =
          `Burst ${sequence}-${offset}`;
      }
      break;
    case 'unrelated':
      store.unrelated += 1;
      break;
    case 'noop':
      store.setText(index, store.items[index].text);
      break;
    case 'parent':
      revision += 1;
      render();
      break;
  }
}

document.addEventListener('input', recordInputStart, true);

window.scaleBenchmark = {
  mount(nextConfiguration) {
    root?.unmount();
    configuration = nextConfiguration;
    revision = 0;
    sequence = 0;
    resetMetrics();
    const started = performance.now();
    store = createClassyStore(new ScaleStore(configuration.size));
    root = createRoot(document.getElementById('root') as HTMLElement);
    flushSync(render);
    return {durationsMs: [performance.now() - started], metrics: readMetrics()};
  },
  measure(operation, iterations) {
    resetMetrics();
    const durationsMs: number[] = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance.now();
      flushSync(() => mutate(operation));
      durationsMs.push(performance.now() - started);
    }
    return {durationsMs, metrics: readMetrics()};
  },
  resetMetrics,
  readMetrics,
  unmount() {
    root?.unmount();
    root = undefined;
    resetMetrics();
    store.items[0].text = 'After unmount';
    return readMetrics();
  },
};

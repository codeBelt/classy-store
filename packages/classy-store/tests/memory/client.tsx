import {flushSync} from 'react-dom';
import {createRoot, type Root} from 'react-dom/client';
import {MemoryScope} from './components/memoryScope/MemoryScope';
import {type MemoryRow, type MemoryStore, makeRows} from './memory.store';
import type {MemoryConfiguration} from './memory.types';

let root: Root | undefined;
let store: MemoryStore | undefined;
let configuration: MemoryConfiguration;
let generation = 0;
let rawTail: MemoryRow | undefined;
let heldRows: MemoryRow[] = [];
let control: MemoryRow[] | undefined;

function acceptStore(nextStore: MemoryStore | undefined): void {
  store = nextStore;
}

function render(): void {
  root ??= createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <MemoryScope
      key={generation}
      size={configuration.size}
      mode={configuration.mode}
      onStore={acceptStore}
    />,
  );
}

function unmount(): void {
  root?.unmount();
  root = undefined;
  store = undefined;
  rawTail = undefined;
}

// Allow React's passive cleanup and browser jobs to finish before collecting.
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

window.memoryProbe = {
  start(nextConfiguration) {
    unmount();
    heldRows = [];
    configuration = nextConfiguration;
    generation = 0;
    flushSync(render);
  },
  async cycle(count) {
    for (let cycle = 0; cycle < count; cycle += 1) {
      generation += 1;
      if (configuration.scenario === 'mount') {
        unmount();
        flushSync(render);
      } else if (configuration.scenario === 'reset') {
        flushSync(render);
      } else if (configuration.scenario === 'detached') {
        // Deliberately keep just a removed row, never its former store.
        if (!store) flushSync(render);
        if (!store) throw new Error('Missing mounted store');
        heldRows.push(store.rows[0]);
        flushSync(() => {
          if (store) store.rows = [];
        });
        unmount();
      } else if (configuration.scenario === 'replace') {
        const rows = makeRows(configuration.size, generation);
        // A rolling shared child exposes proxy-cache -> read-map history chains.
        if (rawTail) rows[0] = rawTail;
        rawTail = rows.at(-1);
        flushSync(() => {
          if (store) store.rows = rows;
        });
      } else {
        flushSync(() => {
          if (!store) throw new Error('Missing mounted store');
          const rows = store.rows;
          // Refill fewer slots each time so stale high-index caches cannot be
          // hidden by overwriting every previous cached slot on the next turn.
          const fillSize =
            configuration.size - (generation % configuration.size);
          rows.push(...makeRows(fillSize, generation));
          // Access children through the live proxy to populate its lazy cache.
          for (const row of rows) void row.text;
          rows.length = 0;
        });
      }
      await settle();
    }
  },
  async cleanup() {
    unmount();
    heldRows = [];
    control = undefined;
    await settle();
  },
  holdControl() {
    control = makeRows(1, -1);
  },
  releaseControl() {
    control = undefined;
  },
  status() {
    // Referencing control here keeps the positive control observable to the VM.
    return {
      text: document.querySelector('output')?.textContent ?? '',
      cycles: generation,
      heldRows: heldRows.length + (control?.length ?? 0),
    };
  },
};

import {useLayoutEffect} from 'react';
import {createClassyStore, subscribe} from '../../../../src/core/core';
import {
  createStoreHook,
  useClassyStore,
} from '../../../../src/frameworks/react/react';

class DerivedStore {
  selectedId = 1;
  items = [
    {id: 1, name: 'Ada'},
    {id: 2, name: 'Grace'},
    {id: 3, name: 'Linus'},
  ];

  get selectedName() {
    // Valid before and after replaceSelection, but not between its writes.
    const selected = this.items.find((item) => item.id === this.selectedId);
    if (!selected) throw new Error('Selected item is temporarily absent');
    return selected.name;
  }

  get names() {
    return this.items.map((item) => item.name).join(',');
  }

  replaceSelection() {
    this.items.splice(0, 2, {id: 4, name: 'Hedy'});
    this.selectedId = 4;
    this.items.push({id: 5, name: 'Katherine'});
    this.items.reverse();
  }
}

const store = createClassyStore(new DerivedStore());
const useStore = createStoreHook(store);
let ordinaryNotifications = 0;
subscribe(store, () => ordinaryNotifications++);

export function DerivedForm() {
  const selected = useClassyStore(store, (state) => state.selectedName);
  const tracked = useClassyStore(store);
  const boundSelected = useStore((state) => state.names);
  const boundTracked = useStore();
  const values = [
    selected,
    tracked.selectedName,
    boundSelected,
    boundTracked.names,
  ].join('|');

  useLayoutEffect(() => {
    const output = document.getElementById('derived-commits');
    if (output) output.textContent += `${values}\n`;
  });

  return (
    <main>
      <output data-testid="derived-values">{values}</output>
      <pre id="derived-commits" data-testid="derived-commits" />
      <output id="notifications-during-event" />
      <button
        type="button"
        onClick={() => {
          store.replaceSelection();
          const output = document.getElementById('notifications-during-event');
          if (output) output.textContent = String(ordinaryNotifications);
        }}
      >
        Replace selection
      </button>
    </main>
  );
}

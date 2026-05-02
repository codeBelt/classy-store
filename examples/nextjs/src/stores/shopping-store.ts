import {createClassyStore} from '@codebelt/classy-store';
import type {PropertyTransform} from '@codebelt/classy-store/utils';
import {devtools, persist, subscribeKey} from '@codebelt/classy-store/utils';
import {ssrSafeLocalStorage} from './_storage';

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
};

class ShoppingStore {
  items: ShoppingItem[] = [
    {id: '1', name: 'Spaghetti', quantity: 400, unit: 'g', checked: false},
    {id: '2', name: 'Pancetta', quantity: 200, unit: 'g', checked: false},
    {id: '3', name: 'Eggs', quantity: 4, unit: 'pcs', checked: true},
    {
      id: '4',
      name: 'Pecorino Romano',
      quantity: 100,
      unit: 'g',
      checked: false,
    },
  ];

  lastAction = '';

  get uncheckedCount(): number {
    return this.items.filter((i) => !i.checked).length;
  }

  get checkedCount(): number {
    return this.items.filter((i) => i.checked).length;
  }

  get totalItems(): number {
    return this.items.length;
  }

  get sortedItems(): ShoppingItem[] {
    return [...this.items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  addItem(name: string, quantity: number, unit: string) {
    const id = crypto.randomUUID();
    this.items.push({id, name, quantity, unit, checked: false});
    this.lastAction = `Added "${name}"`;
  }

  toggleItem(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.checked = !item.checked;
      this.lastAction = `${item.checked ? 'Checked' : 'Unchecked'} "${item.name}"`;
    }
  }

  removeItem(id: string) {
    const index = this.items.findIndex((i) => i.id === id);
    if (index !== -1) {
      const name = this.items[index].name;
      this.items.splice(index, 1);
      this.lastAction = `Removed "${name}"`;
    }
  }

  clearChecked() {
    this.items = this.items.filter((i) => !i.checked);
    this.lastAction = 'Cleared checked items';
  }
}

export const shoppingStore = createClassyStore(new ShoppingStore());

const itemsTransform: PropertyTransform<ShoppingStore> = {
  key: 'items',
  serialize: (value) => value,
  deserialize: (stored) => (Array.isArray(stored) ? stored : []),
};

export const shoppingPersist = persist(shoppingStore, {
  name: 'classy-shopping-list',
  storage: ssrSafeLocalStorage,
  properties: [itemsTransform, 'lastAction'],
  merge: (persisted, current) => ({
    ...current,
    ...persisted,
    items: Array.isArray(persisted.items) ? persisted.items : current.items,
  }),
});

export const subscriptionLog: string[] = [];

subscribeKey(shoppingStore, 'items', () => {
  const entry = `[${new Date().toLocaleTimeString()}] items changed (${shoppingStore.items.length} items)`;
  subscriptionLog.push(entry);
  if (subscriptionLog.length > 20) subscriptionLog.shift();
});

subscribeKey(shoppingStore, 'lastAction', (value) => {
  if (value) {
    const entry = `[${new Date().toLocaleTimeString()}] ${value}`;
    subscriptionLog.push(entry);
    if (subscriptionLog.length > 20) subscriptionLog.shift();
  }
});

devtools(shoppingStore, {name: 'Shopping Store'});

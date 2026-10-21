import {createClassyStore} from '@codebelt/classy-store';

// Keep counters by primitive id so the instrumentation cannot retain stores.
export const memoryGetterReads = new Map<string, number>();

export class MemoryStore {
  ignored = 0;
  stable = {label: 'Stable'};
  rows = Array.from({length: 8}, (_, index) => ({title: `Row ${index}`}));

  constructor(public id: string) {}

  get summary() {
    memoryGetterReads.set(this.id, (memoryGetterReads.get(this.id) ?? 0) + 1);
    return this.rows.map((row) => row.title).join(',');
  }
}

export function createMemoryStore(id: string) {
  return createClassyStore(new MemoryStore(id));
}

import type {StorageAdapter} from '@codebelt/classy-store/utils';

export function createLifecycleStorage() {
  const values = new Map<string, string>();
  const reads: string[] = [];
  const writes: {name: string; value: string}[] = [];
  const removals: string[] = [];
  const storage: StorageAdapter = {
    getItem(name) {
      reads.push(name);
      return values.get(name) ?? null;
    },
    setItem(name, value) {
      writes.push({name, value});
      values.set(name, value);
    },
    removeItem(name) {
      removals.push(name);
      values.delete(name);
    },
  };

  return {storage, values, reads, writes, removals};
}

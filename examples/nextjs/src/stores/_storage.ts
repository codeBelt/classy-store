/**
 * SSR-safe storage adapter. Uses real `localStorage` in the browser; falls
 * back to a per-process in-memory map on the server so module-init
 * `persist()` calls never throw.
 */
const memory = new Map<string, string>();

export const ssrSafeLocalStorage = {
  getItem(key: string): string | null {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    memory.set(key, value);
  },
  removeItem(key: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
    memory.delete(key);
  },
};

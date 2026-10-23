import {useState} from 'react';
import {createClassyStore} from '../../../../core/core';

/**
 * Create a component-scoped reactive store that lives for the lifetime of the
 * component. Unmounting releases React's reference; the store can be collected
 * when no external references remain. Clean up application subscriptions and
 * other effects separately; this hook does not call a store's dispose method.
 *
 * The factory is a `useState` initializer and must be pure. React StrictMode
 * may invoke it more than once in development.
 * Each component instance gets its own isolated store.
 *
 * Use the returned proxy with `useClassyStore()` to read state in the same component
 * or pass it down via props/context to share within a subtree.
 *
 * @param factory - A function that returns a class instance (or plain object).
 *                  Used as the component state initializer.
 * @returns A reactive store proxy scoped to the component's lifetime.
 *
 * @example
 * ```tsx
 * function Counter() {
 *   const store = useLocalStore(() => new CounterStore());
 *   const count = useClassyStore(store, (state) => state.count);
 *   return <button onClick={() => store.increment()}>{count}</button>;
 * }
 * ```
 */
export function useLocalStore<T extends object>(factory: () => T): T {
  const [store] = useState(() => createClassyStore(factory()));
  return store;
}

import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {findGetterDescriptor} from '../internal/internal';

// ── Redux DevTools types (minimal subset) ────────────────────────────────────

type DevToolsMessage = {
  type: string;
  payload?: {type?: string};
  state?: string;
};

type DevToolsConnection = {
  init: (state: unknown) => void;
  send: (action: string | {type: string}, state: unknown) => void;
  subscribe: (
    listener: (message: DevToolsMessage) => void,
  ) => (() => void) | {unsubscribe: () => void};
};

type DevToolsExtension = {
  connect: (options?: {name?: string}) => DevToolsConnection;
};

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: DevToolsExtension;
  }
}

// ── Options ──────────────────────────────────────────────────────────────────

export type DevtoolsOptions = {
  /** Display name in the DevTools panel. Defaults to `'ClassyStore'`. */
  name?: string;
  /** Set to `false` to disable the integration (returns a noop). Defaults to `true`. */
  enabled?: boolean;
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Connect a store proxy to Redux DevTools for state inspection and time-travel debugging.
 *
 * Uses `subscribe()` + `snapshot()` to send state on each change.
 * Listens for `DISPATCH` messages (`JUMP_TO_STATE`, `JUMP_TO_ACTION`) and applies
 * the received state back to the store proxy, skipping getters and methods.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @param options - Optional configuration.
 * @returns A dispose function that disconnects from DevTools and unsubscribes.
 */
export function devtools<T extends object>(
  proxyStore: T,
  options?: DevtoolsOptions,
): () => void {
  const {name = 'ClassyStore', enabled = true} = options ?? {};

  // Guard: no extension or disabled
  if (
    !enabled ||
    typeof window === 'undefined' ||
    !window.__REDUX_DEVTOOLS_EXTENSION__
  ) {
    return () => {};
  }

  const extension = window.__REDUX_DEVTOOLS_EXTENSION__;
  const connection = extension.connect({name});

  // Send initial state
  connection.init(snapshot(proxyStore));

  // Track whether we're currently applying time-travel state to avoid
  // re-sending the state we just applied.
  let isTimeTraveling = false;

  // Subscribe to store mutations → send to DevTools
  const unsubscribeFromStore = subscribe(proxyStore, () => {
    if (isTimeTraveling) return;
    connection.send({type: 'STORE_UPDATE'}, snapshot(proxyStore));
  });

  // Listen for DevTools dispatches (time-travel)
  const devToolsUnsub = connection.subscribe((message: DevToolsMessage) => {
    if (message.type === 'DISPATCH' && message.state) {
      const payloadType = message.payload?.type;
      if (payloadType === 'JUMP_TO_STATE' || payloadType === 'JUMP_TO_ACTION') {
        try {
          const newState = JSON.parse(message.state) as Record<string, unknown>;
          isTimeTraveling = true;

          // Apply state back to the proxy, skipping getters and methods
          for (const key of Object.keys(newState)) {
            // Skip getters
            if (findGetterDescriptor(proxyStore, key)?.get) continue;
            // Skip methods
            if (
              typeof (proxyStore as Record<string, unknown>)[key] === 'function'
            ) {
              continue;
            }
            (proxyStore as Record<string, unknown>)[key] = newState[key];
          }

          isTimeTraveling = false;
        } catch {
          isTimeTraveling = false;
        }
      }
    }
  });

  // Return dispose function
  return () => {
    unsubscribeFromStore();
    if (typeof devToolsUnsub === 'function') {
      devToolsUnsub();
    } else if (
      devToolsUnsub &&
      typeof devToolsUnsub.unsubscribe === 'function'
    ) {
      devToolsUnsub.unsubscribe();
    }
  };
}

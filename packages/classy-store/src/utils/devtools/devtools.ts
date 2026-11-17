import {snapshot, subscribe} from '../../storeRuntime';
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
  subscribe: (listener: (message: DevToolsMessage) => void) => () => void;
};

type DevToolsExtension = {
  connect: (options?: {name?: string}) => DevToolsConnection;
};

// Read the extension through a local type. Declaring it on the global `Window`
// would reach every consumer's program and can clash with their own typings.
type DevToolsHost = {__REDUX_DEVTOOLS_EXTENSION__?: DevToolsExtension};

// ── Options ──────────────────────────────────────────────────────────────────

export type DevtoolsOptions = {
  /** Display name in the DevTools panel. Defaults to `'ClassyStore'`. */
  name?: string;
  /** Set to `false` to disable the integration (returns an inert handle). Defaults to `true`. */
  enabled?: boolean;
};

export type DevtoolsHandle = {
  /** Disconnect from DevTools and stop observing the store. Safe to call repeatedly. */
  dispose: () => void;
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
 * @returns A handle whose `dispose()` disconnects from DevTools and unsubscribes.
 */
export function devtools<T extends object>(
  proxyStore: T,
  options?: DevtoolsOptions,
): DevtoolsHandle {
  const {name = 'ClassyStore', enabled = true} = options ?? {};

  const extension =
    enabled && typeof window !== 'undefined'
      ? (window as unknown as DevToolsHost).__REDUX_DEVTOOLS_EXTENSION__
      : undefined;
  // Guard: no extension or disabled
  if (!extension) return {dispose() {}};

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
        } catch {
          // JSON.parse or property assignment failed — ignore.
        } finally {
          // Reset after microtask so the batched subscription callback
          // (which fires via queueMicrotask) still sees the flag as true.
          queueMicrotask(() => {
            isTimeTraveling = false;
          });
        }
      }
    }
  });

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeFromStore();
      devToolsUnsub();
    },
  };
}

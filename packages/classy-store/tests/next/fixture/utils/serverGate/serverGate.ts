import type {ServerGate} from './serverGate.types';

// Next can compile route handlers and RSC modules separately. This test-only
// registry shares their gate signals within the production server process.
const registry = globalThis as typeof globalThis & {
  __classyNextServerGates?: Map<string, ServerGate>;
};

function getGate(ticket: string): ServerGate {
  registry.__classyNextServerGates ??= new Map();
  const previous = registry.__classyNextServerGates.get(ticket);
  if (previous) return previous;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(() => {
    release();
    registry.__classyNextServerGates?.delete(ticket);
  }, 30_000);
  timer.unref();
  const gate = {pending, release, timer};
  registry.__classyNextServerGates.set(ticket, gate);
  return gate;
}

export async function waitForServerGate(ticket: string) {
  const gate = getGate(ticket);
  await gate.pending;
  clearTimeout(gate.timer);
  registry.__classyNextServerGates?.delete(ticket);
}

export function releaseServerGate(ticket: string) {
  registry.__classyNextServerGates?.get(ticket)?.release();
}

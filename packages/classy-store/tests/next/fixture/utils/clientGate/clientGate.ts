let ready = false;
let pending: Promise<void> | undefined;

export function waitForClientGate() {
  if (typeof window === 'undefined' || ready) return;
  pending ??= new Promise<void>((resolve) => {
    window.__classyNextReleaseStream = () => {
      ready = true;
      resolve();
    };
  });
  throw pending;
}

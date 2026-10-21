import type {FixtureDiagnostics} from '../../types/fixture.types';

// Diagnostics deliberately contain primitives, never stores or snapshots.
export function getDiagnostics(): FixtureDiagnostics {
  window.__classyNextDiagnostics ??= {
    sharedMounts: 0,
    sharedDisposes: 0,
    routeMounts: 0,
    routeDisposes: 0,
    streamMounts: 0,
    streamDisposes: 0,
    requestMounts: 0,
    requestDisposes: 0,
    activePersistence: 0,
    persistenceRestores: 0,
    persistenceWrites: 0,
    streamParentHydrated: false,
    streamRestored: false,
    streamChildHydrated: false,
    streamRestoredValue: '',
  };
  return window.__classyNextDiagnostics;
}

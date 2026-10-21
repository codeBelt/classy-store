export type StoreData = {text: string; count: number};

export type StoreScope = 'shared' | 'route' | 'stream' | 'request';

export type FixtureDiagnostics = {
  sharedMounts: number;
  sharedDisposes: number;
  routeMounts: number;
  routeDisposes: number;
  streamMounts: number;
  streamDisposes: number;
  requestMounts: number;
  requestDisposes: number;
  activePersistence: number;
  persistenceRestores: number;
  persistenceWrites: number;
  streamParentHydrated: boolean;
  streamRestored: boolean;
  streamChildHydrated: boolean;
  streamRestoredValue: string;
};

declare global {
  interface Window {
    __classyNextReactVersion?: string;
    __classyNextDiagnostics?: FixtureDiagnostics;
    __classyNextReleaseStream?: () => void;
    __classyNextMutateDisposedStores?: () => number;
    __classyNextCompilerSources?: {selector: string; tracked: string};
  }
}

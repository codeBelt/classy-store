export type NextDiagnostics = {
  sharedMounts: number;
  sharedDisposes: number;
  routeMounts: number;
  routeDisposes: number;
  persistenceRestores: number;
  persistenceWrites: number;
  activePersistence: number;
  streamParentHydrated: boolean;
  streamRestored: boolean;
  streamChildHydrated: boolean;
  streamRestoredValue: string;
};

export type CompilerEvidence = {
  cacheVariable: string | null;
  slotCount: number;
  readSlots: number[];
  writtenSlots: number[];
};

export type HydrationStore = {user: {name: string}; count: number};

export type HydrationGate = {
  read: () => void;
  release: () => void;
};

export type UseHydrationValue = (store: HydrationStore) => string;

// Opaque markers are shared by mutable data and every snapshot of that data.
// They let heap snapshots count generations without counting snapshot copies.
export class MemoryStoreMarker {
  payload = Array.from({length: 256}, (_, index) => index);
}

export class MemoryCollectionMarker {
  payload = Array.from({length: 1024}, (_, index) => index);
}

export type MemoryRow = {
  text: string;
  marker: MemoryCollectionMarker;
};

export function makeRows(size: number, generation: number): MemoryRow[] {
  const marker = new MemoryCollectionMarker();
  return Array.from({length: size}, (_, index) => ({
    text: `${generation}:${index}`,
    marker,
  }));
}

export class MemoryStore {
  marker = new MemoryStoreMarker();
  rows: MemoryRow[];

  constructor(size: number) {
    this.rows = makeRows(size, 0);
  }
}

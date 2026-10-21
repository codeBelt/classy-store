type HeapSnapshot = {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: (string | string[])[];
    };
  };
  nodes: number[];
  strings: string[];
};

/**
 * Count live marker instances in a V8 heap snapshot after the harness forces GC.
 * Self size is the sum of node sizes, not retained size or browser process RSS.
 * Edges are deliberately excluded: WeakMap ephemerons need special treatment
 * and cannot be interpreted as ordinary strong references in a retainer walk.
 */
export function summarizeHeapSnapshot(json: string): {
  counts: Record<string, number>;
  totalSelfSize: number;
} {
  const heap = JSON.parse(json) as HeapSnapshot;
  const fields = heap.snapshot.meta.node_fields;
  const typeOffset = fields.indexOf('type');
  const nameOffset = fields.indexOf('name');
  const sizeOffset = fields.indexOf('self_size');
  const nodeTypes = heap.snapshot.meta.node_types[typeOffset];
  if (
    typeOffset < 0 ||
    nameOffset < 0 ||
    sizeOffset < 0 ||
    !Array.isArray(nodeTypes) ||
    !nodeTypes.includes('object') ||
    heap.nodes.length % fields.length !== 0
  ) {
    throw new Error('Unsupported V8 heap snapshot node schema');
  }

  const counts: Record<string, number> = {
    MemoryStoreMarker: 0,
    MemoryCollectionMarker: 0,
    TrackingReadMap: 0,
  };
  let totalSelfSize = 0;
  for (let offset = 0; offset < heap.nodes.length; offset += fields.length) {
    totalSelfSize += heap.nodes[offset + sizeOffset];
    if (nodeTypes[heap.nodes[offset + typeOffset]] !== 'object') continue;
    const name = heap.strings[heap.nodes[offset + nameOffset]];
    if (Object.hasOwn(counts, name)) counts[name] += 1;
  }
  return {counts, totalSelfSize};
}

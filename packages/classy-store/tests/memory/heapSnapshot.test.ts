import {describe, expect, test} from 'bun:test';
import {summarizeHeapSnapshot} from './heapSnapshot';

describe('summarizeHeapSnapshot', () => {
  test('counts exact object instances while excluding constructor and string names', () => {
    const json = JSON.stringify({
      snapshot: {
        meta: {
          node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
          node_types: [
            ['hidden', 'array', 'string', 'object', 'closure', 'native'],
            'string',
            'number',
            'number',
            'number',
          ],
        },
      },
      strings: [
        '',
        'MemoryStoreMarker',
        'MemoryCollectionMarker',
        'TrackingReadMap',
        'MemoryStoreMarkerSuffix',
      ],
      nodes: [
        3, 1, 1, 32, 0, 3, 1, 2, 32, 0, 3, 2, 3, 40, 0, 3, 3, 4, 48, 0, 4, 1, 5,
        64, 0, 2, 2, 6, 24, 0, 1, 3, 7, 32, 0, 3, 4, 8, 16, 0, 5, 1, 9, 128, 0,
      ],
    });

    expect(summarizeHeapSnapshot(json)).toEqual({
      counts: {
        MemoryStoreMarker: 2,
        MemoryCollectionMarker: 1,
        TrackingReadMap: 1,
      },
      totalSelfSize: 416,
    });
  });

  test('uses schema offsets and type labels instead of a fixed V8 layout', () => {
    const json = JSON.stringify({
      snapshot: {
        meta: {
          node_fields: ['self_size', 'id', 'name', 'type'],
          node_types: ['number', 'number', 'string', ['object', 'string']],
        },
      },
      strings: ['TrackingReadMap', 'MemoryCollectionMarker'],
      nodes: [48, 1, 0, 0, 40, 2, 1, 0, 24, 3, 1, 1],
    });

    expect(summarizeHeapSnapshot(json)).toEqual({
      counts: {
        MemoryStoreMarker: 0,
        MemoryCollectionMarker: 1,
        TrackingReadMap: 1,
      },
      totalSelfSize: 112,
    });
  });

  test.each([
    {
      description: 'missing size metadata',
      nodeFields: ['type', 'name'],
      nodeTypes: [['object'], 'string'],
      nodes: [0, 0],
    },
    {
      description: 'truncated node record',
      nodeFields: ['type', 'name', 'self_size'],
      nodeTypes: [['object'], 'string', 'number'],
      nodes: [0, 0],
    },
    {
      description: 'missing object type',
      nodeFields: ['type', 'name', 'self_size'],
      nodeTypes: [['string'], 'string', 'number'],
      nodes: [0, 0, 32],
    },
  ])('rejects $description', ({nodeFields, nodeTypes, nodes}) => {
    const json = JSON.stringify({
      snapshot: {meta: {node_fields: nodeFields, node_types: nodeTypes}},
      strings: ['MemoryStoreMarker'],
      nodes,
    });

    expect(() => summarizeHeapSnapshot(json)).toThrow(
      'Unsupported V8 heap snapshot node schema',
    );
  });
});

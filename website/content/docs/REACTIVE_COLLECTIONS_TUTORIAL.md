---
title: "Reactive Collections"
description: "Use reactiveMap and reactiveSet collections inside Classy Store instances."
---

Use `reactiveMap()` and `reactiveSet()` when mutations such as `.set()`, `.add()`,
`.delete()`, and `.clear()` need to notify store subscribers. Put the collection
inside a store created by `createClassyStore()` and mutate it through that store.

Native `Map` and `Set` are opaque leaves: replacing their property can notify
subscribers, but mutating their contents does not. Reactive collections use
arrays internally and expose Map-like and Set-like methods. They are not native
`Map` or `Set` instances, and key/value lookups scan those arrays.

[Try the Collections example →](/examples/collections/)

## Collection behavior

- Reading `.size` takes constant time. Looking up, inserting, replacing, or deleting an entry scans the backing array, so each of those is linear in the collection's size. On live store state and on plain snapshots the scan reads the raw array directly. In a React component that reads the store without a selector, a lookup goes entry by entry through the tracking proxy so the component records what it compared; for a large collection, select the value with a selector instead. Passing validated entries or values to the factory deduplicates the initial iterable in one pass.
- Objects work as map keys and set values. A member is matched by identity, and the original object, its store proxy and any snapshot of it are the same identity. So `selected.has(todo)` gives the same answer whether `todo` came from the store, from a snapshot in a component, or is the object you first added. Two separate objects with equal fields are different members.
- `map.set(key, value)` on an existing key keeps the stored key and its position and replaces only the value. Setting the value it already has changes nothing and notifies no one.
- Primitive members use `Object.is`, which distinguishes `0` and `-0`. Initial iterables are deduplicated with native `Map`/`Set` semantics, which treat those two values as equal. Avoid depending on signed-zero keys.
- Iterators copy the entry/value list when created. Later additions and removals do not change that list; referenced objects can still change. This differs from native live iterators.
- Both collections expose `size`, `has`, `delete`, `clear`, `keys`, `values`, `entries`, `forEach`, and iteration with `for...of`. The map also exposes `get` and `set`. The set exposes `add`.

## Reactive updates

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';

class DirectoryStore {
  labels = reactiveMap<string, string>();
  selected = reactiveSet<string>();

  select(id: string, label: string) {
    this.labels.set(id, label);
    this.selected.add(id);
  }
}

const directoryStore = createClassyStore(new DirectoryStore());
directoryStore.select('u1', 'Alice');
```

React components read these collections with `useClassyStore`, just like other
store data. Select an existing snapshot property or a primitive such as `.size`;
if a selector creates a new array, consider `shallowEqual` where its one-level
comparison matches your needs.

`ReactiveMap` and `ReactiveSet` are public types from the collections entry.
Construct values with the factory functions.

## Persisting a ReactiveMap

JSON does not retain a collection's prototype or methods. Use a property transform
to serialize entries and reconstruct the collection during hydration. For string
keys and values:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class LabelStore {
  labels = reactiveMap<string, string>();
}

const labelStore = createClassyStore(new LabelStore());
const persistence = persist(labelStore, {
  name: 'labels',
  storage: localStorage,
  properties: [
    {
      key: 'labels',
      serialize: (labels) => [...labels.entries()],
      deserialize: (stored) => {
        if (!Array.isArray(stored)) throw new Error('Expected label entries');
        const entries = stored.map((entry): [string, string] => {
          if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            typeof entry[0] !== 'string' ||
            typeof entry[1] !== 'string'
          ) {
            throw new Error('Invalid label entry');
          }
          return [entry[0], entry[1]];
        });
        return reactiveMap(entries);
      },
    },
  ],
});
```

After saving `labelStore.labels.set('u1', 'Alice')`, the storage envelope contains:

```json
{
  "version": 0,
  "state": {
    "labels": [["u1", "Alice"]]
  }
}
```

The restored `labels` value retains `.get()`, `.set()`, and the other collection
methods. Validate object-valued entries according to your application's schema
before constructing the collection.

## Persisting a ReactiveSet

Serialize the values and rebuild the set after validating stored input:

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveSet} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class TagStore {
  tags = reactiveSet<string>();
}

const tagStore = createClassyStore(new TagStore());
const persistence = persist(tagStore, {
  name: 'tags',
  storage: localStorage,
  properties: [
    {
      key: 'tags',
      serialize: (tags) => [...tags],
      deserialize: (stored) => {
        if (!Array.isArray(stored)) throw new Error('Expected tags');
        if (!stored.every((value) => typeof value === 'string')) {
          throw new Error('Invalid tag');
        }
        return reactiveSet<string>(stored);
      },
    },
  ],
});
```

With tags added, the stored state is an array of strings:

```json
{
  "version": 0,
  "state": {
    "tags": ["typescript", "react"]
  }
}
```

These are client-only setup examples. Dispose the persistence handle when its
owner is torn down. For React and SSR, create it in an effect and call
`persistence.dispose()` in cleanup; see [store scoping](./REACT_SCOPING.md).
Transform failures are reported as parse errors during hydration. Explicit
`rehydrate()` calls also reject, so handle their promises as described in the
[persistence guide](./PERSIST_TUTORIAL.md#handle-operation-failures).

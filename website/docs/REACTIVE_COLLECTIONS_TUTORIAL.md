# Reactive Collections

Use `reactiveMap()` and `reactiveSet()` when mutations such as `.set()`, `.add()`,
`.delete()`, and `.clear()` need to notify store subscribers. Put the collection
inside a store created by `createClassyStore()` and mutate it through that store.

Native `Map` and `Set` are opaque leaves: replacing their property can notify
subscribers, but mutating their contents does not. Reactive collections use
arrays internally and expose Map-like and Set-like methods. They are not native
`Map` or `Set` instances, and key/value lookups scan those arrays.

## Collection behavior

- Lookups and mutations scan backing arrays, so they are O(n), not native-map-style indexed lookups.
- Prefer primitive map keys and set values. Objects read through a store can be proxied, and snapshots copy supported objects; their identity may differ from the original input object.
- Lookup methods use `Object.is`, which distinguishes `0` and `-0`. Initial iterables are deduplicated with native `Map`/`Set` semantics, which treat those two values as equal. Avoid depending on signed-zero keys.
- Iterators copy the entry/value list when created. Later additions and removals do not change that list; referenced objects can still change. This differs from native live iterators.
- The public factories expose the listed Map-like/Set-like methods, not every native collection API or subclassing behavior.

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
        const labels = reactiveMap<string, string>();
        for (const entry of stored) {
          if (
            !Array.isArray(entry) || entry.length !== 2 ||
            typeof entry[0] !== 'string' || typeof entry[1] !== 'string'
          ) {
            throw new Error('Invalid label entry');
          }
          labels.set(entry[0], entry[1]);
        }
        return labels;
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
        const tags = reactiveSet<string>();
        for (const value of stored) {
          if (typeof value !== 'string') throw new Error('Invalid tag');
          tags.add(value);
        }
        return tags;
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

# Reactive Collections

Classy Store provides `ReactiveMap` and `ReactiveSet` to help with persisting `Map` and `Set` collections. Both collections are backed by plain arrays under the hood, but they expose the exact same methods and APIs as their native counterparts.

> [!NOTE]
> **Performance Tip:** You should use native `Map` and `Set` in the store for better performance in most cases. `ReactiveMap` and `ReactiveSet` should only be used if you explicitly need to persist a `Map` or `Set` to storage using the `persist()` utility.

## Why Reactive Collections?

Native `Map` and `Set` objects are not JSON-serializable by default, making them incompatible with `localStorage` and `sessionStorage`. When you `JSON.stringify` a `Map` or `Set`, it usually becomes an empty object `{}`.

`ReactiveMap` and `ReactiveSet` are backed by internal structures that allow them to be persisted correctly when combined with the `serialize` and `deserialize` options in the `persist` utility.

## Persisting a ReactiveMap

When persisting a `ReactiveMap`, you do not need to provide custom `serialize` or `deserialize` logic. The reactive collection is backed by an internal structure the `persist` utility can natively stringify and parse.

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class UserStore {
  users = reactiveMap<string, { name: string; role: string }>();

  addUser(id: string, name: string, role: string) {
    this.users.set(id, {name, role});
  }
}

const userStore = createClassyStore(new UserStore());

persist(userStore, {
  name: 'user-store',
});
```

**What gets stored in storage:**

```json
{
  "version": 0,
  "state": {
    "users": [
      ["u1", { "name": "Alice", "role": "admin" }],
      ["u2", { "name": "Bob", "role": "viewer" }]
    ]
  }
}
```

## Persisting a ReactiveSet

The same pattern works for `ReactiveSet`. You can simply stringify it by referring to the property directly.

```ts
import {createClassyStore} from '@codebelt/classy-store';
import {reactiveSet} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

class TagStore {
  tags = reactiveSet<string>();

  addTag(tag: string) {
    this.tags.add(tag);
  }
}

const tagStore = createClassyStore(new TagStore());

persist(tagStore, {
  name: 'tag-store',
});
```

**What gets stored in storage:**

```json
{
  "version": 0,
  "state": {
    "tags": ["typescript", "javascript", "react"]
  }
}
```

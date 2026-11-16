---
title: "Store patterns"
description: "Model nested state, combine stores, and work with computed getters."
---

## Patterns

### Multiple stores

```typescript
const authStore = createClassyStore(new AuthStore());
const uiStore = createClassyStore(new UiStore());

function Header() {
  const user = useClassyStore(authStore, (state) => state.currentUser);
  const theme = useClassyStore(uiStore, (state) => state.theme);
  return <header className={theme}>{user?.name}</header>;
}
```

### Class inheritance

Subclasses work out of the box. Methods, getters, and `super` calls from any ancestor are fully reactive:

```typescript
class BaseStore {
  loading = false;
  error: string | null = null;

  get hasError() {
    return this.error !== null;
  }
  setLoading(value: boolean) {
    this.loading = value;
  }
  setError(msg: string | null) {
    this.error = msg;
  }
}

class UserStore extends BaseStore {
  users: string[] = [];

  get count() {
    return this.users.length;
  }

  addUser(name: string) {
    this.users.push(name);
  }
}

const userStore = createClassyStore(new UserStore());

// Base methods, derived methods, base getters, derived getters — all reactive.
// snapshot(userStore) instanceof UserStore === true
```

### Nested object mutations

Nested objects are deeply reactive. Mutations at any depth trigger the correct re-renders:

```typescript
class SettingsStore {
  settings = {
    theme: 'dark',
    notifications: {
      email: true,
      push: false,
    },
  };

  togglePush() {
    this.settings.notifications.push = !this.settings.notifications.push;
  }
}

const settingsStore = createClassyStore(new SettingsStore());

// Only re-renders when push notification setting changes
function PushToggle() {
  const push = useClassyStore(settingsStore, (state) => state.settings.notifications.push);
  return <Switch checked={push} onChange={() => settingsStore.togglePush()} />;
}
```

### Array operations

Snapshots preserve sparse array length and holes. Assigning `undefined` to an empty slot creates an own element that appears in `Object.keys()`.

Arrays support all standard operations — `push`, `splice`, `pop`, `shift`, index assignment, etc. Ordinary subscribers receive one microtask notification for consecutive mutations:

```typescript
class ListStore {
  items: string[] = [];

  addMany(newItems: string[]) {
    // Multiple pushes = one ordinary subscription notification
    for (const item of newItems) {
      this.items.push(item);
    }
  }

  removeAt(index: number) {
    this.items.splice(index, 1);
  }
}
```

### Computed getters (automatic memoization)

Class getters are automatically memoized at two levels — no `computed()` wrapper needed:

**Write proxy:** getters track which properties they read. The result is cached and only recomputes when a dependency changes:

```typescript
class Store {
  items = ['a', 'b', 'c'];
  filter = 'all';

  get filtered() {
    // Only runs when `items` or `filter` changes.
    // Accessing store.filtered multiple times returns the same reference.
    if (this.filter === 'all') return this.items;
    return this.items.filter((item) => item === this.filter);
  }

  get filteredCount() {
    // Nested getters work: reads this.filtered (itself memoized)
    return this.filtered.length;
  }
}
```

**Snapshots:** getter results are stable across snapshots when dependencies haven't changed. Selecting those cached results works with `Object.is` by default:

```typescript
// Stable reference across re-renders when items/filter haven't changed.
// No shallowEqual required!
const filtered = useClassyStore(myStore, (state) => state.filtered);
```

When a dependency changes, a getter can produce a new object or array with equal
contents; custom equality can still help there. Keep getters pure and based on
explicit store property reads. Time, external variables, and property enumeration
alone do not invalidate their dependency cache.

### Working with Date and RegExp

`Date` and `RegExp` are **not proxied** — they are treated as opaque values. Replace them entirely to trigger an update:

```typescript
class Store {
  date = new Date();
  regex = /test/;

  updateDate() {
    // ❌ Mutation: won't trigger update
    // this.date.setFullYear(2025);

    // ✅ Replacement: triggers update
    this.date = new Date();
  }
}
```

For `Map` and `Set` semantics, use [`reactiveMap()`](./API_REFERENCE.md#reactivemapk-vinitial) and [`reactiveSet()`](./API_REFERENCE.md#reactivesettinitial) instead of native `Map`/`Set`.

# subscribeKey Tutorial

`subscribeKey()` subscribes to changes on a single property of a store proxy. It's the property-level equivalent of `subscribe()` — instead of firing on every store mutation, it only fires when the specific key you're watching actually changes.

## Getting Started

### 1. Create a store

```ts
import {createClassyStore} from '@codebelt/classy-store';

class SettingsStore {
  theme: 'light' | 'dark' = 'light';
  fontSize = 14;
  language = 'en';

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
  }

  setFontSize(size: number) {
    this.fontSize = size;
  }
}

export const settingsStore = createClassyStore(new SettingsStore());
```

### 2. Watch a single key

```ts
import {subscribeKey} from '@codebelt/classy-store/utils';

const unsub = subscribeKey(settingsStore, 'theme', (value, previousValue) => {
  console.log(`Theme changed from "${previousValue}" to "${value}"`);
  document.documentElement.setAttribute('data-theme', value);
});
```

Now only `theme` changes trigger the callback. Mutations to `fontSize` or `language` are ignored entirely.

### 3. Unsubscribe when done

```ts
unsub();
```

## Signature

```ts
function subscribeKey<T extends object, K extends keyof T>(
  proxyStore: T,
  key: K,
  callback: (value: Snapshot<T>[K], previousValue: Snapshot<T>[K]) => void,
): () => void;
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `proxyStore` | `T` | A reactive proxy created by `createClassyStore()` |
| `key` | `keyof T` | The property to watch |
| `callback` | `(value, previousValue) => void` | Called when the watched property changes |
| **Returns** | `() => void` | Unsubscribe function |

## How It Works

Under the hood, `subscribeKey` wraps the existing `subscribe()` + `snapshot()` APIs:

1. Captures an initial snapshot and stores `snapshot[key]` as the previous value.
2. On each store mutation, takes a new snapshot and compares `snapshot[key]` with the previous value via `Object.is()`.
3. If different, fires the callback with `(currentValue, previousValue)` and updates the stored previous value.

Because `snapshot()` uses structural sharing, unchanged sub-trees return the same reference. This makes the `Object.is()` comparison efficient — no deep equality checks are needed.

## Use Cases

### Reacting to auth state changes

```ts
class AuthStore {
  token: string | null = null;
  user: { name: string; role: string } | null = null;

  login(token: string, user: { name: string; role: string }) {
    this.token = token;
    this.user = user;
  }

  logout() {
    this.token = null;
    this.user = null;
  }
}

const authStore = createClassyStore(new AuthStore());

// Redirect on login/logout
subscribeKey(authStore, 'token', (token, previousToken) => {
  if (token && !previousToken) {
    router.push('/dashboard');
  } else if (!token && previousToken) {
    router.push('/login');
  }
});
```

### Syncing with external systems

```ts
class PlayerStore {
  volume = 0.8;
  track: string | null = null;
  playing = false;

  setVolume(v: number) {
    this.volume = v;
  }

  play(track: string) {
    this.track = track;
    this.playing = true;
  }
}

const playerStore = createClassyStore(new PlayerStore());

// Sync volume slider with the Web Audio API
subscribeKey(playerStore, 'volume', (volume) => {
  audioContext.gainNode.gain.value = volume;
});

// Update document title when track changes
subscribeKey(playerStore, 'track', (track) => {
  document.title = track ? `Playing: ${track}` : 'Music Player';
});
```

### Logging specific changes

```ts
class CartStore {
  items: { id: string; qty: number }[] = [];
  coupon: string | null = null;

  get total() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  }

  addItem(id: string) {
    this.items.push({ id, qty: 1 });
  }

  applyCoupon(code: string) {
    this.coupon = code;
  }
}

const cartStore = createClassyStore(new CartStore());

// Only log when coupon changes — not on every item add
subscribeKey(cartStore, 'coupon', (coupon, prev) => {
  analytics.track('coupon_changed', { from: prev, to: coupon });
});
```

## subscribeKey vs subscribe

| | `subscribe()` | `subscribeKey()` |
|---|---|---|
| Fires on | Any mutation in the store | Only when the watched key changes |
| Callback args | `()` (no arguments) | `(value, previousValue)` |
| Use case | General side effects | Property-specific reactions |
| Overhead | Minimal | One snapshot comparison per mutation |

Use `subscribe()` when you need to react to any change. Use `subscribeKey()` when you only care about one property and want to avoid running your callback unnecessarily.

## Multiple Keys

To watch multiple keys independently, call `subscribeKey` once per key:

```ts
const unsub1 = subscribeKey(store, 'theme', handleThemeChange);
const unsub2 = subscribeKey(store, 'language', handleLanguageChange);

// Clean up both
function dispose() {
  unsub1();
  unsub2();
}
```

Each subscription is independent — they don't interfere with each other.

## Quick Reference

| What you want | How to do it |
|---|---|
| Watch a single property | `subscribeKey(store, 'key', (val, prev) => { ... })` |
| Stop watching | `const unsub = subscribeKey(...); unsub()` |
| Watch multiple properties | Call `subscribeKey()` once per key |
| Get both old and new value | Callback receives `(value, previousValue)` |

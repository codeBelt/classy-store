# withHistory Tutorial

`withHistory()` adds undo/redo for a store's data fields using a stack of snapshots. It records after each batched store notification. Call `undo()` to go back, `redo()` to go forward, and `pause()`/`resume()` to suspend and restart recording.

## Getting Started

### 1. Create a store

```ts
import {createClassyStore} from '@codebelt/classy-store';

class DrawingStore {
  color = '#000000';
  strokeWidth = 2;
  points: { x: number; y: number }[] = [];

  addPoint(x: number, y: number) {
    this.points = [...this.points, { x, y }];
  }

  setColor(color: string) {
    this.color = color;
  }

  setStrokeWidth(width: number) {
    this.strokeWidth = width;
  }

  clear() {
    this.points = [];
  }
}

export const drawingStore = createClassyStore(new DrawingStore());
```

### 2. Attach history

```ts
import {withHistory} from '@codebelt/classy-store/utils';

const history = withHistory(drawingStore);
```

The initial snapshot is the first entry in an internal stack. Each subsequent batched notification records one entry; consecutive synchronous writes share that entry. The returned handle does not expose the stack itself.

### 3. Undo and redo

```ts
drawingStore.setColor('#ff0000');
await Promise.resolve(); // Record the first edit.

drawingStore.setStrokeWidth(5);
await Promise.resolve(); // Record the second edit separately.
// The stack now contains three full snapshots: initial, red, red with width 5.

history.undo();
// strokeWidth is back to 2

history.undo();
// color is back to '#000000'

history.redo();
// color is '#ff0000' again
```

### 4. Check availability

```ts
history.canUndo; // true if there's a previous state
history.canRedo; // true if there's a next state (after an undo)
```

Use these to enable/disable undo/redo buttons:

```tsx
import {useHistoryStatus} from '@codebelt/classy-store/react';

function UndoRedoButtons() {
  const {canUndo, canRedo} = useHistoryStatus(history);

  return (
    <div>
      <button onClick={history.undo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={history.redo} disabled={!canRedo}>
        Redo
      </button>
    </div>
  );
}
```

### 5. Clean up

```ts
history.dispose();
```

After disposing, mutations are no longer recorded and the snapshot stack is cleared.

### Observe status outside React

```ts
const stopListening = history.subscribe(() => {
  console.log(history.getSnapshot());
  // {canUndo, canRedo, isPaused, isDisposed}
});
stopListening(); // Only removes this listener; history keeps recording.
```

Snapshots are readonly and cached until a status field changes. `pause()` and `resume()` notify status subscribers even when store data is unchanged. `dispose()` publishes the final disposed status, clears listeners, and makes subsequent history operations no-ops. `getServerSnapshot()` always returns initial status for SSR and hydration. The public `HistoryStatus` type is exported from `@codebelt/classy-store/utils`.

## Signature

```ts
function withHistory<T extends object>(
  proxyStore: T,
  options?: { limit?: number },
): HistoryHandle;
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `100` | Maximum snapshots retained, including the current state; use a positive integer |

### HistoryHandle

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `undo()` | `() => void` | Restore the previous state |
| `redo()` | `() => void` | Restore the next state (after an undo) |
| `canUndo` | `readonly boolean` | Whether there is a previous state |
| `canRedo` | `readonly boolean` | Whether there is a next state |
| `pause()` | `() => void` | Stop recording history entries |
| `resume()` | `() => void` | Resume recording history entries |
| `dispose()` | `() => void` | Unsubscribe and clean up |
| `getSnapshot()` | `() => HistoryStatus` | Cached current status |
| `getServerSnapshot()` | `() => HistoryStatus` | Initial status for SSR/hydration |
| `subscribe(listener)` | `(listener: () => void) => () => void` | Observe status changes; returns listener cleanup |

## How It Works

1. **Init:** captures an initial snapshot as `history[0]` and sets `pointer = 0`.
2. **Record:** on each `subscribe()` callback (when not paused), captures a new snapshot, truncates any redo entries after the current pointer, pushes the snapshot, and enforces the limit by shifting from the front.
3. **Undo:** decrements the pointer, suppresses recording during restoration, and applies `history[pointer]` back to the store proxy (skipping getters and methods).
4. **Redo:** increments the pointer and restores `history[pointer]` with the same recording suppression.
5. **State restoration:** iterates own enumerable keys of the snapshot, skips keys with getter descriptors on the prototype chain, and assigns values to the proxy. This triggers SET traps and reactivity — your components update automatically.

Undo and redo themselves do **not** create new history entries. Restoration does not change the explicit `isPaused` status set by `pause()` and `resume()`.

Restoration assigns snapshot fields back as mutable copies; it does not delete
top-level keys absent from the restored snapshot. Prefer a stable store shape,
and keep dynamically keyed data inside a declared object field. Opaque snapshot
leaves (for example native `Map`, `Set`, and `Date`) retain references, so use
replacement updates or reactive collections when those values need undo support.

Wait for the batched notification before programmatically undoing a new edit.
After undo/redo, allow the restoration microtask to finish before making another
edit that must be recorded. Separate user events naturally provide that boundary.

## Use Cases

### Text editor with undo

```ts
class EditorStore {
  content = '';
  cursorPosition = 0;

  type(text: string) {
    this.content =
      this.content.slice(0, this.cursorPosition) +
      text +
      this.content.slice(this.cursorPosition);
    this.cursorPosition += text.length;
  }

  backspace() {
    if (this.cursorPosition === 0) return;
    this.content =
      this.content.slice(0, this.cursorPosition - 1) +
      this.content.slice(this.cursorPosition);
    this.cursorPosition--;
  }
}

const editorStore = createClassyStore(new EditorStore());
const history = withHistory(editorStore, { limit: 200 });

// Cmd+Z / Ctrl+Z
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      history.redo();
    } else {
      history.undo();
    }
  }
});
```

### Form with reset capability

```ts
class FormStore {
  name = '';
  email = '';
  message = '';

  setField(field: 'name' | 'email' | 'message', value: string) {
    this[field] = value;
  }
}

const formStore = createClassyStore(new FormStore());
const history = withHistory(formStore);

// User fills in the form...
formStore.setField('name', 'Alice');
formStore.setField('email', 'alice@example.com');

// Let the batched subscription record both edits.
await Promise.resolve();

// Both writes in this turn form one undo step.
history.undo();
// name and email are both back to ''.

// Undo all changes
while (history.canUndo) {
  history.undo();
}
// All fields are back to the oldest retained state.
```

### Batched edits and pause/resume

Synchronous mutations in one turn already share a history entry because ordinary store subscriptions are batched:

```ts
class SpreadsheetStore {
  cells: Record<string, string> = {};

  setCell(id: string, value: string) {
    this.cells = { ...this.cells, [id]: value };
  }
}

const spreadsheetStore = createClassyStore(new SpreadsheetStore());
const history = withHistory(spreadsheetStore);

// Paste a block of cells — should be a single undo step
function pasteBlock(data: Record<string, string>) {
  for (const [id, value] of Object.entries(data)) {
    spreadsheetStore.setCell(id, value);
  }
}
```

`pause()` skips history recording for notifications delivered while paused. `resume()` enables recording again; it does not capture an entry itself or group asynchronous edits into a transaction. `useHistoryStatus(history).isPaused` exposes this recording state. Undo/redo restoration preserves an explicit pause.

### Canvas with limited history

For memory-sensitive applications, set a lower limit:

```ts
const history = withHistory(canvasStore, { limit: 50 });

// Only the last 50 states are kept.
// Older entries are shifted off the front of the stack.
// Retained entry count is bounded; memory also depends on each state's size.
```

## Undo/Redo and Branching

When you undo and then make a new mutation after restoration settles, the redo history is discarded. Each mutation below represents a separately recorded batch:

```
Initial state: { count: 0 }

Mutation 1: count = 1    → history: [0, 1]
Mutation 2: count = 2    → history: [0, 1, 2]
Mutation 3: count = 3    → history: [0, 1, 2, 3]

Undo                     → history: [0, 1, 2, 3], pointer at 2 (count = 2)
Undo                     → history: [0, 1, 2, 3], pointer at 1 (count = 1)

New mutation: count = 99  → history: [0, 1, 99], pointer at 2
                            (entries 2 and 3 are gone — no redo available)
```

This is the standard behavior for undo systems (like text editors). Making a new change from a past state creates a new branch and discards the old future.

## Combining with Other Utilities

### withHistory + persist

Persist the store's current state while maintaining undo history in memory:

```ts
import {persist, withHistory} from '@codebelt/classy-store/utils';

const todoStore = createClassyStore(new TodoStore());

// Persist to localStorage (survives page reload)
const persistence = persist(todoStore, {name: 'todos', storage: localStorage});

// Make the restored data the initial undo state. Check status for read failures.
await persistence.hydrated;
if (persistence.getSnapshot().lastError) {
  console.error('Could not restore saved todos', persistence.getSnapshot().lastError);
}

// Undo/redo in memory (resets on page reload).
const history = withHistory(todoStore);

// When the store's owner is torn down:
history.dispose();
persistence.dispose();
```

History is in-memory only. Persistence saves the live store state, including changes made by undo/redo, according to its debounce and async queue. It does not save the history stack or pointer. If history is attached before hydration, applying saved data can itself become an undo step.

### withHistory + devtools

Use both for a rich debugging experience:

```ts
import {devtools, withHistory} from '@codebelt/classy-store/utils';

const store = createClassyStore(new MyStore());

const disconnect = devtools(store, { name: 'MyStore' });
const history = withHistory(store);

// DevTools receives batched updates, including undo/redo restores.
// A DevTools jump mutates the same store and can create a history entry.

// When the owner is torn down:
disconnect();
history.dispose();
```

## Quick Reference

| What you want | How to do it |
|---|---|
| Add undo/redo | `const h = withHistory(store)` |
| Undo | `h.undo()` |
| Redo | `h.redo()` |
| Check if undoable | `h.canUndo` |
| Check if redoable | `h.canRedo` |
| Limit history size | `withHistory(store, { limit: 50 })` |
| Record one undo step | Make synchronous edits in one turn; history records after the microtask flush |
| Temporarily stop recording | `h.pause()`; keep paused until those notifications flush, then call `h.resume()` |
| Render history status in React | `useHistoryStatus(h)` |
| Stop tracking | `h.dispose()` |
| Undo all | `while (h.canUndo) h.undo()` |

# withHistory Tutorial

`withHistory()` adds undo/redo capability to any store proxy. It maintains a stack of snapshots captured on each mutation. Call `undo()` to go back, `redo()` to go forward, and `pause()`/`resume()` to batch operations that shouldn't create individual history entries.

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

That's it. Every mutation is now recorded. The initial state is captured as `history[0]`.

### 3. Undo and redo

```ts
drawingStore.setColor('#ff0000');
drawingStore.setStrokeWidth(5);
// history: [initial, {color: '#ff0000'}, {strokeWidth: 5}]

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
function UndoRedoButtons() {
  const snap = useClassyStore(drawingStore);

  return (
    <div>
      <button onClick={history.undo} disabled={!history.canUndo}>
        Undo
      </button>
      <button onClick={history.redo} disabled={!history.canRedo}>
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
| `limit` | `number` | `100` | Maximum number of history entries |

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

## How It Works

1. **Init:** captures an initial snapshot as `history[0]` and sets `pointer = 0`.
2. **Record:** on each `subscribe()` callback (when not paused), captures a new snapshot, truncates any redo entries after the current pointer, pushes the snapshot, and enforces the limit by shifting from the front.
3. **Undo:** decrements the pointer, pauses recording, applies `history[pointer]` back to the store proxy (skipping getters and methods), and resumes recording.
4. **Redo:** increments the pointer, pauses recording, applies `history[pointer]`, and resumes.
5. **State restoration:** iterates own enumerable keys of the snapshot, skips keys with getter descriptors on the prototype chain, and assigns values to the proxy. This triggers SET traps and reactivity — your components update automatically.

Undo and redo themselves do **not** create new history entries because recording is paused during the restore operation.

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

// Undo last change
history.undo();
// email is back to ''

// Undo all changes
while (history.canUndo) {
  history.undo();
}
// All fields are back to their initial values
```

### Batch operations with pause/resume

When performing multiple related mutations that should count as a single history entry, use `pause()` and `resume()`:

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
  history.pause();

  for (const [id, value] of Object.entries(data)) {
    spreadsheetStore.setCell(id, value);
  }

  history.resume();

  // Manually trigger a snapshot capture by making a final
  // mutation after resume, or just let the next user action
  // create the history entry.
}
```

### Canvas with limited history

For memory-sensitive applications, set a lower limit:

```ts
const history = withHistory(canvasStore, { limit: 50 });

// Only the last 50 states are kept.
// Older entries are shifted off the front of the stack.
// Memory usage stays bounded.
```

## Undo/Redo and Branching

When you undo and then make a new mutation, the redo history is discarded:

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
persist(todoStore, { name: 'todos' });

// Undo/redo in memory (resets on page reload)
const history = withHistory(todoStore);
```

History is in-memory only — it doesn't persist across page loads. The persisted state is always the latest state (not the undo pointer position).

### withHistory + devtools

Use both for a rich debugging experience:

```ts
import {devtools, withHistory} from '@codebelt/classy-store/utils';

const store = createClassyStore(new MyStore());

devtools(store, { name: 'MyStore' });
const history = withHistory(store);

// DevTools shows every mutation including undo/redo restores.
// Time-travel in DevTools is independent of withHistory's stack.
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
| Batch as single step | `h.pause(); /* mutations */; h.resume()` |
| Stop tracking | `h.dispose()` |
| Undo all | `while (h.canUndo) h.undo()` |

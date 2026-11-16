import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

// ── Simple Store ────────────────────────────────────────────────────────────

// #region preferences
const accentColors = {
  indigo: '#818cf8',
  emerald: '#34d399',
  rose: '#fb7185',
  amber: '#fbbf24',
  cyan: '#22d3ee',
} as const;
type AccentColor = keyof typeof accentColors;

export class PreferencesStore {
  theme: 'light' | 'dark' = 'dark';
  fontSize = 16;
  accentColor: AccentColor = 'indigo';

  get cssVars() {
    return {
      '--accent': accentColors[this.accentColor],
      '--font-size': `${this.fontSize}px`,
    };
  }

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
  }

  setFontSize(size: number) {
    this.fontSize = Math.min(24, Math.max(12, size));
  }

  setAccentColor(color: AccentColor) {
    this.accentColor = color;
  }

  reset() {
    this.theme = 'dark';
    this.fontSize = 16;
    this.accentColor = 'indigo';
  }
}
// #endregion preferences

// ── Kitchen Sink Store ──────────────────────────────────────────────────────

// #region notes
interface Note {
  title: string;
  body: string;
  createdAt: string; // ISO string for easy serialization
}

function isNoteEntry(entry: unknown): entry is [string, Note] {
  if (
    !Array.isArray(entry) ||
    entry.length !== 2 ||
    typeof entry[0] !== 'string'
  )
    return false;
  const note = entry[1];
  return (
    note !== null &&
    typeof note === 'object' &&
    typeof note.title === 'string' &&
    typeof note.body === 'string' &&
    typeof note.createdAt === 'string' &&
    !Number.isNaN(Date.parse(note.createdAt))
  );
}

export class KitchenSinkStore {
  notes = reactiveMap<string, Note>();
  tags = reactiveSet<string>(['tutorial', 'persist']);
  lastEditedAt = new Date();
  viewMode: 'grid' | 'list' = 'list';
  sortBy: 'date' | 'title' = 'date';
  searchQuery = '';

  get noteCount() {
    return this.notes.size;
  }

  get filteredNotes(): [string, Note][] {
    const entries = [...this.notes.entries()];
    const query = this.searchQuery.toLowerCase();

    const filtered = query
      ? entries.filter(
          ([, note]) =>
            note.title.toLowerCase().includes(query) ||
            note.body.toLowerCase().includes(query),
        )
      : entries;

    return filtered.sort((entryA, entryB) => {
      if (this.sortBy === 'title') {
        return entryA[1].title.localeCompare(entryB[1].title);
      }
      return entryB[1].createdAt.localeCompare(entryA[1].createdAt);
    });
  }

  addNote(title: string, body: string) {
    const id = crypto.randomUUID();
    this.notes.set(id, {
      title,
      body,
      createdAt: new Date().toISOString(),
    });
    this.lastEditedAt = new Date();
  }

  removeNote(id: string) {
    this.notes.delete(id);
    this.lastEditedAt = new Date();
  }

  updateNote(id: string, title: string, body: string) {
    const note = this.notes.get(id);
    if (!note) return;
    this.notes.set(id, {...note, title, body});
    this.lastEditedAt = new Date();
  }

  addTag(tag: string) {
    this.tags.add(tag);
    this.lastEditedAt = new Date();
  }

  removeTag(tag: string) {
    this.tags.delete(tag);
    this.lastEditedAt = new Date();
  }

  setViewMode(mode: 'grid' | 'list') {
    this.viewMode = mode;
  }

  setSortBy(sort: 'date' | 'title') {
    this.sortBy = sort;
  }

  setSearch(query: string) {
    this.searchQuery = query;
  }

  reset() {
    this.notes.clear();
    this.tags.clear();
    this.tags.add('tutorial');
    this.tags.add('persist');
    this.lastEditedAt = new Date();
    this.viewMode = 'list';
    this.sortBy = 'date';
    this.searchQuery = '';
  }
}
// #endregion notes

export function createPersistenceExamples(storage: Storage) {
  // Native storage events only reach other tabs. Notify the on-page inspector
  // after each successful write, including debounced saves and explicit clears.
  const writes = new EventTarget();
  const adapter = {
    getItem: (key: string) => storage.getItem(key),
    setItem(key: string, value: string) {
      storage.setItem(key, value);
      writes.dispatchEvent(new Event('change'));
    },
    removeItem(key: string) {
      storage.removeItem(key);
      writes.dispatchEvent(new Event('change'));
    },
  };
  function subscribeStorage(listener: () => void) {
    writes.addEventListener('change', listener);
    window.addEventListener('storage', listener);
    return () => {
      writes.removeEventListener('change', listener);
      window.removeEventListener('storage', listener);
    };
  }

  // #region save-preferences
  const preferencesStore = createClassyStore(new PreferencesStore());

  const preferencesHandle = persist(preferencesStore, {
    name: 'preferences',
    storage: adapter,
    merge(stored) {
      if (
        'theme' in stored &&
        stored.theme !== 'dark' &&
        stored.theme !== 'light'
      )
        throw new TypeError('Invalid stored theme');
      if (
        'fontSize' in stored &&
        (typeof stored.fontSize !== 'number' ||
          stored.fontSize < 12 ||
          stored.fontSize > 24)
      )
        throw new TypeError('Invalid stored font size');
      if (
        'accentColor' in stored &&
        (typeof stored.accentColor !== 'string' ||
          !Object.hasOwn(accentColors, stored.accentColor))
      )
        throw new TypeError('Invalid stored accent');
      return stored;
    },
  });
  // #endregion save-preferences

  // #region save-notes
  const kitchenSinkStore = createClassyStore(new KitchenSinkStore());

  const kitchenSinkHandle = persist(kitchenSinkStore, {
    name: 'kitchen-sink',
    storage: adapter,
    syncTabs: true,
    debounce: 300,
    version: 1,
    merge: 'shallow',

    properties: [
      {
        key: 'viewMode',
        serialize: (value) => value,
        deserialize(value) {
          if (value !== 'grid' && value !== 'list')
            throw new TypeError('Invalid view mode');
          return value;
        },
      },
      {
        key: 'sortBy',
        serialize: (value) => value,
        deserialize(value) {
          if (value !== 'date' && value !== 'title')
            throw new TypeError('Invalid sort order');
          return value;
        },
      },
      {
        key: 'searchQuery',
        serialize: (value) => value,
        deserialize(value) {
          if (typeof value !== 'string')
            throw new TypeError('Invalid search query');
          return value;
        },
      },
      {
        key: 'lastEditedAt',
        serialize: (date) => date.toISOString(),
        deserialize(value) {
          if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
            throw new TypeError('Invalid last edit date');
          return new Date(value);
        },
      },
      {
        key: 'notes',
        serialize: (notes) => [...notes.entries()],
        deserialize(value) {
          if (!Array.isArray(value) || !value.every(isNoteEntry))
            throw new TypeError('Invalid stored notes');
          return reactiveMap(value);
        },
      },
      {
        key: 'tags',
        serialize: (tags) => [...tags],
        deserialize(value) {
          if (
            !Array.isArray(value) ||
            !value.every((tag) => typeof tag === 'string')
          )
            throw new TypeError('Invalid stored tags');
          return reactiveSet<string>(value);
        },
      },
    ],

    migrate: (state, oldVersion) => {
      if (oldVersion === 0) {
        // v0 didn't have sortBy or searchQuery
        return {...state, sortBy: 'date', searchQuery: ''};
      }
      return state;
    },
  });
  // #endregion save-notes

  return {
    preferencesStore,
    preferencesHandle,
    kitchenSinkStore,
    kitchenSinkHandle,
    storage,
    subscribeStorage,
  };
}

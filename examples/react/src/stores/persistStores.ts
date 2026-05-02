import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';
import {persist} from '@codebelt/classy-store/utils';

// ── Simple Store ────────────────────────────────────────────────────────────

type AccentColor = 'indigo' | 'emerald' | 'rose' | 'amber' | 'cyan';

export class PreferencesStore {
  theme: 'light' | 'dark' = 'dark';
  fontSize = 16;
  accentColor: AccentColor = 'indigo';

  get cssVars() {
    const colorMap: Record<AccentColor, string> = {
      indigo: '#818cf8',
      emerald: '#34d399',
      rose: '#fb7185',
      amber: '#fbbf24',
      cyan: '#22d3ee',
    };
    return {
      '--accent': colorMap[this.accentColor],
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

export const preferencesStore = createClassyStore(new PreferencesStore());

export const preferencesHandle = persist(preferencesStore, {
  name: 'preferences',
  storage: localStorage,
});

// ── Kitchen Sink Store ──────────────────────────────────────────────────────

interface Note {
  title: string;
  body: string;
  createdAt: string; // ISO string for easy serialization
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
    const id = `n${Date.now()}`;
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

export const kitchenSinkStore = createClassyStore(new KitchenSinkStore());

export const kitchenSinkHandle = persist(kitchenSinkStore, {
  name: 'kitchen-sink',
  storage: localStorage,
  debounce: 300,
  version: 1,
  merge: 'shallow',

  properties: [
    'viewMode',
    'sortBy',
    'searchQuery',
    {
      key: 'lastEditedAt',
      serialize: (date) => (date as Date).toISOString(),
      deserialize: (stored) => new Date(stored as string),
    },
    {
      key: 'notes',
      serialize: (notes) => [
        ...(notes as ReturnType<typeof reactiveMap<string, Note>>).entries(),
      ],
      deserialize: (stored) => reactiveMap(stored as [string, Note][]),
    },
    {
      key: 'tags',
      serialize: (tags) => [
        ...(tags as ReturnType<typeof reactiveSet<string>>),
      ],
      deserialize: (stored) => reactiveSet(stored as string[]),
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

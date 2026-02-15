import {reactiveMap, reactiveSet, store} from '@codebelt/classy-store';

export class CounterStore {
  count = 0;
  name = 'World';
  other = 'unchanged';

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  setName(name: string) {
    this.name = name;
  }

  setOther(val: string) {
    this.other = val;
  }

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;
    }
  }

  reset() {
    this.count = 0;
    this.name = 'World';
    this.other = 'unchanged';
  }
}

interface Post {
  id: number;
  title: string;
  body: string;
}

export class PostStore {
  posts: Post[] = [];
  loading = false;
  error: string | null = null;

  async fetchPosts() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch('/api/posts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.posts = await res.json();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.loading = false;
    }
  }

  clear() {
    this.posts = [];
    this.error = null;
  }

  get count() {
    return this.posts.length;
  }
}

export class DocumentStore {
  metadata = {title: 'Untitled', author: 'Anonymous'};
  content = {
    sections: [
      {id: 1, heading: 'Introduction', body: 'Welcome to the document.'},
      {id: 2, heading: 'Methods', body: 'We used reactive proxies.'},
    ],
  };
  settings = {theme: 'dark', fontSize: 14};

  updateTitle(title: string) {
    this.metadata.title = title;
  }

  updateSectionBody(id: number, body: string) {
    const section = this.content.sections.find((s) => s.id === id);
    if (section) section.body = body;
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
  }
}

interface User {
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

export class CollectionStore {
  users = reactiveMap<string, User>([
    ['u1', {name: 'Alice', role: 'admin'}],
    ['u2', {name: 'Bob', role: 'viewer'}],
  ]);
  tags = reactiveSet<string>(['urgent', 'bug']);

  get userCount() {
    return this.users.size;
  }

  get tagCount() {
    return this.tags.size;
  }

  addUser(id: string, name: string, role: User['role']) {
    this.users.set(id, {name, role});
  }

  removeUser(id: string) {
    this.users.delete(id);
  }

  promoteUser(id: string) {
    const user = this.users.get(id);
    if (!user) return;
    const promotion: Record<string, User['role']> = {
      viewer: 'editor',
      editor: 'admin',
      admin: 'admin',
    };
    this.users.set(id, {...user, role: promotion[user.role] as User['role']});
  }

  addTag(tag: string) {
    this.tags.add(tag);
  }

  removeTag(tag: string) {
    this.tags.delete(tag);
  }

  clearTags() {
    this.tags.clear();
  }
}

export const counterStore = store(new CounterStore());
export const postStore = store(new PostStore());
export const documentStore = store(new DocumentStore());
export const collectionStore = store(new CollectionStore());

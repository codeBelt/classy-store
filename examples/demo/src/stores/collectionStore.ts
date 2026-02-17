import {
  createClassyStore,
  reactiveMap,
  reactiveSet,
} from '@codebelt/classy-store';

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

export const collectionStore = createClassyStore(new CollectionStore());

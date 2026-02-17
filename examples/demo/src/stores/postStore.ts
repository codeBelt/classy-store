import {createClassyStore} from '@codebelt/classy-store';

interface Post {
  id: number;
  title: string;
  body: string;
}

const STATIC_POSTS: Post[] = [
  {
    id: 1,
    title: 'Introduction to Classy Store',
    body: 'Learn how class-based reactive state management works with ES6 Proxies.',
  },
  {
    id: 2,
    title: 'Using Computed Properties',
    body: 'Getters on your class become computed values that update automatically.',
  },
  {
    id: 3,
    title: 'Async Actions',
    body: 'Methods on your store class can be async — loading states are reactive too.',
  },
  {
    id: 4,
    title: 'Store Composition',
    body: 'Compose multiple stores together for complex application state.',
  },
  {
    id: 5,
    title: 'Performance Tips',
    body: 'Proxy-based tracking means only the data you read triggers re-renders.',
  },
];

export class PostStore {
  posts: Post[] = [];
  loading = false;
  error: string | null = null;

  get count() {
    return this.posts.length;
  }

  async fetchPosts() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch('/api/posts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.posts = await res.json();
    } catch {
      // Fallback to static data when the dev server API is unavailable (e.g. static build)
      this.posts = STATIC_POSTS;
      this.error = null;
    } finally {
      this.loading = false;
    }
  }

  clear() {
    this.posts = [];
    this.error = null;
  }
}

export const postStore = createClassyStore(new PostStore());

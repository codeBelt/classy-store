import {createClassyStore} from '@codebelt/classy-store';

interface Post {
  id: number;
  title: string;
  body: string;
}

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
}

export const postStore = createClassyStore(new PostStore());

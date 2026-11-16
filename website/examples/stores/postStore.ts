import {createClassyStore} from '@codebelt/classy-store';
import fallbackPosts from '@/public/examples-data/posts.json';

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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/examples-data/posts.json`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.posts = await res.json();
    } catch {
      // Keep the example usable if the request fails.
      this.posts = fallbackPosts;
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

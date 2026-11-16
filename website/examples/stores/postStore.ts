import {createClassyStore} from '@codebelt/classy-store';
import fallbackPosts from '@/public/examples-data/posts.json';

interface Post {
  id: number;
  title: string;
  body: string;
}

export class PostStore {
  private request: AbortController | null = null;
  posts: Post[] = [];
  loading = false;
  error: string | null = null;

  get count() {
    return this.posts.length;
  }

  async fetchPosts() {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/examples-data/posts.json`,
        {signal: request.signal},
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const posts: Post[] = await res.json();
      if (!request.signal.aborted) this.posts = posts;
    } catch {
      if (request.signal.aborted) return;
      this.posts = fallbackPosts;
      this.error = 'Fetch failed. Showing bundled sample posts.';
    } finally {
      if (this.request === request) {
        this.request = null;
        this.loading = false;
      }
    }
  }

  clear() {
    this.request?.abort();
    this.request = null;
    this.loading = false;
    this.error = null;
    this.posts = [];
  }
}

export const postStore = createClassyStore(new PostStore());

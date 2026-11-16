import Link from 'next/link';
import {HomeCounter} from '@/components/home-counter';
import {getMDXComponents} from '@/components/mdx';
import CounterSample from './counter.mdx';

export default function HomePage() {
  return (
    <main className="lab-home">
      <div className="home-hero">
        <div className="home-intro">
          <h1>
            See state <br />
            change.
          </h1>
          <p>Class-based state management for TypeScript.</p>
          <Link className="lab-primary" href="/docs">
            Get started <span aria-hidden="true">→</span>
          </Link>
        </div>
        <HomeCounter />
      </div>
      <section className="home-source" aria-label="Counter source code">
        <CounterSample components={getMDXComponents()} />
      </section>
      <nav className="home-next" aria-label="Explore Classy Store">
        <Link href="/docs/API_REFERENCE">
          API reference <span aria-hidden="true">↗</span>
        </Link>
        <Link href="/examples/">
          Explore examples <span aria-hidden="true">→</span>
        </Link>
      </nav>
    </main>
  );
}

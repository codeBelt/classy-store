import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.css';

const ExampleCode = `import {createClassyStore} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';

// 1. Define your state and logic in a class
class CounterStore {
  count = 0;
  increment() {
    this.count++;
  }
}

// 2. Create a reactive store instance
const counterStore = createClassyStore(new CounterStore());

// 3. Use it in React with automatic updates
function Counter() {
  const count = useStore(counterStore, (store) => store.count);
  return (
    <button onClick={() => counterStore.increment()}>
      Count is {count}
    </button>
  );
}`;

const NestedCode = `// Works perfectly with nested objects - no spread operators!
class UserStore {
  profile = {
    name: 'John',
    settings: { theme: 'dark' }
  };

  toggleTheme() {
    // Direct mutation - Proxy handles the reactivity
    this.profile.settings.theme = 
      this.profile.settings.theme === 'dark' ? 'light' : 'dark';
  }
}

const userStore = createClassyStore(new UserStore());`;

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className="row">
          <div className={clsx('col col--5', styles.heroContent)}>
            <div className="text--left">
              <Heading as="h1" className="hero__title">
                {siteConfig.title}
              </Heading>
              <p className="hero__subtitle">{siteConfig.tagline}</p>
              <div
                className={styles.buttons}
                style={{justifyContent: 'flex-start'}}
              >
                <Link
                  className="button button--secondary button--lg"
                  to="/docs/"
                >
                  Get Started - 5min ⏱️
                </Link>
              </div>
            </div>
          </div>
          <div className="col col--7">
            <div className={styles.heroCode}>
              <CodeBlock language="typescript" showLineNumbers={true}>
                {ExampleCode}
              </CodeBlock>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function DeepReactivity() {
  return (
    <section className={styles.showcase}>
      <div className="container">
        <div className="row">
          <div className="col col--5">
            <div className="padding-vert--md">
              <Heading as="h3">Deep Reactivity</Heading>
              <p>
                Mutate nested objects directly. Our Proxy-based system
                automatically tracks changes and triggers targeted re-renders.
              </p>
              <p>
                Forget <code>{'{...state, nested: {...state.nested}}'}</code>{' '}
                hell.
              </p>
              <Heading as="h3" className="margin-top--lg">
                Simple & Familiar
              </Heading>
              <p>
                Use standard ES6 classes to define your state and business
                logic. No complex reducers, actions, or dispatchers. Just
                JavaScript.
              </p>
              <ul className={styles.checkList}>
                <li>✅ Zero boilerplate</li>
                <li>✅ Type-safe by nature</li>
                <li>✅ Framework agnostic core</li>
              </ul>
            </div>
          </div>
          <div className="col col--7">
            <CodeBlock language="typescript">{NestedCode}</CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Class-based reactive state management for React, Vue, Svelte, Solid, and Angular"
    >
      <HomepageHeader />
      <main>
        <DeepReactivity />
      </main>
    </Layout>
  );
}

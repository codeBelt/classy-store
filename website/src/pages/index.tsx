import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/">
            Get Started - 5min ⏱️
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Class-based reactive state management for React"
    >
      <HomepageHeader />
      <main>
        <div className="container padding-vert--xl">
          <div className="row">
            <div className="col col--4">
              <div className="text--center padding-horiz--md">
                <Heading as="h3">Class-Based</Heading>
                <p>
                  Define your state and logic using standard ES6 classes. No
                  boilerplate, just standard JavaScript/TypeScript.
                </p>
              </div>
            </div>
            <div className="col col--4">
              <div className="text--center padding-horiz--md">
                <Heading as="h3">Reactive</Heading>
                <p>
                  Automatic reactivity using Proxies. Mutations verify and
                  trigger updates only where needed.
                </p>
              </div>
            </div>
            <div className="col col--4">
              <div className="text--center padding-horiz--md">
                <Heading as="h3">React Integration</Heading>
                <p>
                  Seamless integration with React 18+ using
                  `useSyncExternalStore` for concurrent features support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}

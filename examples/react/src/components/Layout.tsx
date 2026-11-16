import {type ReactNode, useEffect, useState} from 'react';
import instrumentImage from '../../../../website/public/instruments/signal-strip.webp' with {
  type: 'file',
};
import {RackStrip} from '../../../../website/signal/instruments';
import {NavSidebar} from './NavSidebar';

export function Layout({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [light, setLight] = useState(
    document.documentElement.classList.contains('light'),
  );
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === 'classy-store-theme' || event.key === null) {
        setLight(event.newValue === 'light');
      }
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    document.documentElement.classList.toggle('dark', !light);
  }, [light]);
  useEffect(() => {
    const go = () => {
      setSidebarOpen(false);
      setQuery('');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);
  return (
    <>
      <header className="examples-bar">
        <a className="lab-brand" href="../">
          <span className="lab-monogram" aria-hidden="true">
            CS
          </span>
          Classy Store
        </a>
        <a href="../docs/">Docs</a>
        <a className="current" href="#/">
          Examples
        </a>
        <button
          type="button"
          className="lab-secondary theme-key"
          aria-label="Toggle Theme"
          aria-pressed={light}
          onClick={() => {
            const next = !light;
            setLight(next);
            try {
              localStorage.setItem(
                'classy-store-theme',
                next ? 'light' : 'dark',
              );
            } catch {
              /* private browsing */
            }
          }}
        >
          {light ? 'Dark mode' : 'Light mode'}
        </button>
        <button
          className="example-menu lab-secondary"
          type="button"
          aria-expanded={sidebarOpen}
          aria-controls="examples-sidebar"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          Menu
        </button>
      </header>
      <div className="example-layout">
        <aside
          id="examples-sidebar"
          className={`example-sidebar${sidebarOpen ? ' is-open' : ''}`}
        >
          <label className="example-filter">
            Find an example
            <input
              type="search"
              value={query}
              placeholder="Filter examples…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <NavSidebar
            route={route}
            query={query}
            onClose={() => {
              setSidebarOpen(false);
              setQuery('');
            }}
          />
        </aside>
        <main className="example-main">
          <RackStrip src={instrumentImage} />
          {children}
        </main>
      </div>
    </>
  );
}

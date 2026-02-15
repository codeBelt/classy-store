// This component must be the top-most import in this file!
import {ReactScan} from './ReactScan';
import './index.css';
import {useEffect, useState} from 'react';
import {AsyncDemo} from './AsyncDemo';
import {CollectionsDemo} from './CollectionsDemo';
import {PersistPage} from './PersistPage';
import {ReactiveFundamentalsDemo} from './ReactiveFundamentalsDemo';
import {StructuralSharingDemo} from './StructuralSharingDemo';

// ── Hash Router ─────────────────────────────────────────────────────────────

function getRoute(): string {
  const hash = globalThis.location?.hash ?? '';
  return hash.replace(/^#/, '') || '/';
}

function useHashRoute() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    globalThis.addEventListener('hashchange', handler);
    return () => globalThis.removeEventListener('hashchange', handler);
  }, []);

  return route;
}

// ── Navigation ──────────────────────────────────────────────────────────────

function NavBar({route}: {route: string}) {
  const links = [
    {href: '#/', label: 'Reactivity', active: route === '/'},
    {href: '#/persist', label: 'Persist', active: route === '/persist'},
  ];

  return (
    <nav className="flex items-center justify-center gap-1 mb-8">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            link.active
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

// ── Reactivity Demos Page ───────────────────────────────────────────────────

function ReactivityPage() {
  return (
    <>
      <header className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
          @codebelt/classy-store
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto">
          Class-based reactive state for React. Watch the render badges to see
          exactly when each component re-renders.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <ReactiveFundamentalsDemo />
        <AsyncDemo />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <CollectionsDemo />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <StructuralSharingDemo />
      </div>
    </>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

export function App() {
  const route = useHashRoute();

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <ReactScan />
      <NavBar route={route} />
      {route === '/persist' ? <PersistPage /> : <ReactivityPage />}
    </div>
  );
}

export default App;

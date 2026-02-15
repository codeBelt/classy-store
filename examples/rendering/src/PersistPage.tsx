import {KitchenSinkPersistDemo} from './KitchenSinkPersistDemo';
import {SimplePersistDemo} from './SimplePersistDemo';

export function PersistPage() {
  return (
    <>
      <header className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-linear-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          @codebelt/classy-store
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto">
          Persist store state to localStorage with transforms, versioning,
          debounce, and cross-tab sync.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimplePersistDemo />
        <KitchenSinkPersistDemo />
      </div>
    </>
  );
}

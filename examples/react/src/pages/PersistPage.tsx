import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {KitchenSinkPersistDemo} from '../demos/persist/KitchenSinkPersistDemo';
import {SimplePersistDemo} from '../demos/persist/SimplePersistDemo';

export function PersistPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Persist</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Persist store state to localStorage with transforms, versioning,
          debounce, and cross-tab sync.
        </p>
      </header>

      <ApiSignature
        importPath="@codebelt/classy-store/utils"
        signature="persist(store, options): PersistHandle"
      />

      <div className="flex flex-col gap-6">
        <SimplePersistDemo />
        <KitchenSinkPersistDemo />
        <TipBox>
          The simplest setup is{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            persist(store, {'{'} name: 'key', storage: localStorage {'}'})
          </code>
          . Add{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">properties</code>{' '}
          with custom serialize/deserialize for complex types like Date,
          ReactiveMap, or ReactiveSet.
        </TipBox>
      </div>
    </>
  );
}

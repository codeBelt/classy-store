import {TipBox} from '../components/TipBox';
import {CollectionsDemo} from '../demos/collections/CollectionsDemo';

export function CollectionsPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Collections</h1>
        <p className="text-sm text-zinc-400 mt-1">
          ReactiveMap and ReactiveSet provide Map/Set semantics that the proxy
          can track.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <CollectionsDemo />
        <TipBox variant="info">
          Native Map/Set internal slots can't be proxied — their methods throw
          when called on a Proxy.{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            reactiveMap()
          </code>{' '}
          and{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            reactiveSet()
          </code>{' '}
          use plain arrays internally so the proxy can intercept all mutations.
        </TipBox>
      </div>
    </>
  );
}

import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {SubscribeKeyDemo} from '../demos/subscribe-key/SubscribeKeyDemo';

export function SubscribeKeyPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">subscribeKey</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Subscribe to changes on a single property outside of React. Only fires
          when that specific key changes.
        </p>
      </header>

      <ApiSignature
        importPath="@codebelt/classy-store/utils"
        signature="subscribeKey(store, key, callback): () => void"
      />

      <div className="flex flex-col gap-6">
        <SubscribeKeyDemo />
        <TipBox>
          <code className="text-xs bg-zinc-800 px-1 rounded">subscribeKey</code>{' '}
          uses{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">Object.is</code>{' '}
          internally — the callback only fires when the property value actually
          changes, not on every store mutation.
        </TipBox>
      </div>
    </>
  );
}

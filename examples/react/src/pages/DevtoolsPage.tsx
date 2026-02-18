import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {DevtoolsDemo} from '../demos/devtools/DevtoolsDemo';

export function DevtoolsPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">DevTools</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Connect any store to Redux DevTools for state inspection and
          time-travel debugging.
        </p>
      </header>

      <ApiSignature
        importPath="@codebelt/classy-store/utils"
        signature="devtools(store, options?): () => void"
      />

      <div className="flex flex-col gap-6">
        <DevtoolsDemo />
        <TipBox variant="info">
          Call the returned dispose function in{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">useEffect</code>{' '}
          cleanup to disconnect when the component unmounts. The{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">name</code> option
          sets the instance label in DevTools.
        </TipBox>
      </div>
    </>
  );
}

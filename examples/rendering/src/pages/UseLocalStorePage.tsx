import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {LocalCounterDemo} from '../demos/local-store/LocalCounterDemo';

export function UseLocalStorePage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">useLocalStore</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Component-scoped reactive stores — each instance gets its own isolated
          state.
        </p>
      </header>

      <ApiSignature
        importPath="@codebelt/classy-store/react"
        signature="useLocalStore<T>(factory: () => T): T"
      />

      <div className="flex flex-col gap-6">
        <LocalCounterDemo />
        <TipBox variant="when-to-use">
          Use when state is scoped to a component instance. The store is created
          on mount and garbage-collected on unmount. Each component instance
          gets a completely independent store.
        </TipBox>
      </div>
    </>
  );
}

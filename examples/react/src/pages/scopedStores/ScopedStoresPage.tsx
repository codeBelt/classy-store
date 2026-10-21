import {TipBox} from '../../components/TipBox';
import {ScopedStoresDemo} from '../../demos/scoped-store/components/scopedStoresDemo/ScopedStoresDemo';

export function ScopedStoresPage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-100">Scoped stores</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Share one typed store within a subtree using React context. Multiple
          forms and editors can use the same store class with independent state.
        </p>
      </header>
      <ScopedStoresDemo />
      <TipBox variant="when-to-use">
        Context chooses the store instance; useClassyStore subscribes to its
        values. The provider owns creation, hydration preparation, and optional
        persistence cleanup. Changing initialData alone preserves the current
        draft; change the provider key to reset it.
      </TipBox>
    </div>
  );
}

import {TipBox} from '../components/TipBox';
import {StructuralSharingDemo} from '../demos/snapshots/StructuralSharingDemo';

export function SnapshotsPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Snapshots</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Visualize how snapshot() creates immutable snapshots with structural
          sharing.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <StructuralSharingDemo />
        <TipBox>
          Only mutated branches get new references — unchanged sub-trees keep
          the same identity. This means{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">===</code>{' '}
          comparison is enough to detect changes, enabling efficient React.memo
          and selector optimizations.
        </TipBox>
      </div>
    </>
  );
}

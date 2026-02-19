import {AddItemForm} from '@/components/shopping/AddItemForm';
import {ShoppingList} from '@/components/shopping/ShoppingList';
import {ShoppingStats} from '@/components/shopping/ShoppingStats';
import {SnapshotViewer} from '@/components/shopping/SnapshotViewer';
import {SubscriptionLog} from '@/components/shopping/SubscriptionLog';

export default function ShoppingPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Shopping List
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Array mutations, subscribeKey logging, manual snapshots, and
            PropertyTransform persistence.
          </p>
        </div>
      </section>
      <ShoppingStats />
      <AddItemForm />
      <ShoppingList />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SubscriptionLog />
        <SnapshotViewer />
      </div>
    </div>
  );
}

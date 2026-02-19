import {AddItemForm} from '@/components/shopping/AddItemForm';
import {ShoppingList} from '@/components/shopping/ShoppingList';
import {ShoppingStats} from '@/components/shopping/ShoppingStats';
import {SnapshotViewer} from '@/components/shopping/SnapshotViewer';
import {SubscriptionLog} from '@/components/shopping/SubscriptionLog';

export default function ShoppingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shopping List</h1>
        <p className="text-muted text-sm mt-1">
          Array mutations, subscribeKey logging, manual snapshots, and
          PropertyTransform persistence.
        </p>
      </div>
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

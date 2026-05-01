'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {shoppingStore} from '@/stores/shopping-store';
import {ShoppingItemRow} from './ShoppingItemRow';

export function ShoppingList() {
  const snap = useClassyStore(shoppingStore);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Items ({snap.totalItems})</h2>
        <ApiInfo
          apis={['useClassyStore (auto-tracked)', 'array mutations']}
          description="Auto-tracked mode reads sortedItems. Toggle and remove use direct array mutation (splice, property set)."
          code={`const snap = useClassyStore(shoppingStore);
snap.sortedItems // computed getter`}
        />
        {snap.checkedCount > 0 && (
          <button
            type="button"
            onClick={() => shoppingStore.clearChecked()}
            className="text-xs text-danger hover:underline"
          >
            Clear {snap.checkedCount} checked
          </button>
        )}
      </div>
      {snap.sortedItems.length === 0 ? (
        <p className="text-sm text-muted italic text-center py-4">
          No items in your shopping list.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {snap.sortedItems.map((item) => (
            <ShoppingItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

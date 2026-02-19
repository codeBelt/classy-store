'use client';

import type {ShoppingItem} from '@/stores/shopping-store';
import {shoppingStore} from '@/stores/shopping-store';

export function ShoppingItemRow({item}: {item: ShoppingItem}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => shoppingStore.toggleItem(item.id)}
        className="w-4 h-4 accent-accent"
      />
      <span
        className={`flex-1 text-sm ${item.checked ? 'line-through text-muted' : ''}`}
      >
        {item.name}
      </span>
      <span className="text-xs text-muted">
        {item.quantity} {item.unit}
      </span>
      <button
        type="button"
        onClick={() => shoppingStore.removeItem(item.id)}
        className="text-xs text-danger hover:underline"
      >
        Remove
      </button>
    </div>
  );
}

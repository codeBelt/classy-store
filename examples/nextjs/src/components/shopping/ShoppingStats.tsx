'use client';

import {shallowEqual} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {shoppingStore} from '@/stores/shopping-store';

export function ShoppingStats() {
  const stats = useClassyStore(
    shoppingStore,
    (state) => ({
      total: state.totalItems,
      unchecked: state.uncheckedCount,
      checked: state.checkedCount,
      lastAction: state.lastAction,
    }),
    shallowEqual,
  );

  return (
    <div className="space-y-2">
      <ApiInfo
        apis={['useClassyStore', 'selector', 'shallowEqual']}
        description="Selector returns an object with 4 derived values; shallowEqual compares each key to skip unnecessary renders."
        code={`const stats = useClassyStore(shoppingStore, (state) => ({
  total: state.totalItems,
  unchecked: state.uncheckedCount,
  checked: state.checkedCount,
  lastAction: state.lastAction,
}), shallowEqual);`}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted">Total</p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted">Remaining</p>
          <p className="text-xl font-bold">{stats.unchecked}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted">Checked</p>
          <p className="text-xl font-bold">{stats.checked}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted">Last Action</p>
          <p className="text-sm mt-1 truncate">{stats.lastAction || '-'}</p>
        </div>
      </div>
    </div>
  );
}

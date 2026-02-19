'use client';

import {useState} from 'react';
import {shoppingStore} from '@/stores/shopping-store';

export function AddItemForm() {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    shoppingStore.addItem(name.trim(), Number(quantity) || 1, unit);
    setName('');
    setQuantity('1');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-lg p-4"
    >
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1 min-w-40"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm w-20"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <select
          className="border border-border bg-background rounded px-3 py-1.5 text-sm"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="pcs">pcs</option>
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="ml">ml</option>
          <option value="L">L</option>
          <option value="tbsp">tbsp</option>
          <option value="tsp">tsp</option>
        </select>
        <button
          type="submit"
          className="px-4 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
        >
          Add Item
        </button>
      </div>
    </form>
  );
}

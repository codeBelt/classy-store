'use client';

import {useStore} from '@codebelt/classy-store/react';
import {counterStore, history} from '../store';

export function Counter() {
  const snap = useStore(counterStore);

  return (
    <div
      style={{fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto'}}
    >
      <h1 className="text-2xl font-bold mb-4">{snap.label}</h1>
      <p className="mb-4">
        Count: <strong>{snap.count}</strong> · Doubled:{' '}
        <strong>{snap.doubled}</strong>
      </p>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          type="button"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => counterStore.increment()}
        >
          +{snap.step}
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => counterStore.decrement()}
        >
          -{snap.step}
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          onClick={() => counterStore.reset()}
        >
          Reset
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          onClick={() => history.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          onClick={() => history.redo()}
        >
          Redo
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          Label:
          <input
            className="border p-1 rounded text-black"
            value={snap.label}
            onChange={(e) => counterStore.setLabel(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          Step:
          <input
            type="number"
            className="border p-1 rounded w-20 text-black"
            value={snap.step}
            onChange={(e) => counterStore.setStep(+e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

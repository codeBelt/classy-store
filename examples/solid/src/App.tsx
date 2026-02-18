import {useStore} from '@codebelt/classy-store/solid';
import {counterStore, history} from './store';

export function App() {
  const snap = useStore(counterStore);

  return (
    <div
      style={{
        'font-family': 'sans-serif',
        'max-width': '480px',
        margin: '40px auto',
        padding: '0 16px',
      }}
    >
      <h1>{snap().label}</h1>
      <p>
        Count: <strong>{snap().count}</strong> · Doubled:{' '}
        <strong>{snap().doubled}</strong>
      </p>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          'flex-wrap': 'wrap',
          'margin-bottom': '16px',
        }}
      >
        <button type="button" onClick={() => counterStore.increment()}>
          +{snap().step}
        </button>
        <button type="button" onClick={() => counterStore.decrement()}>
          -{snap().step}
        </button>
        <button type="button" onClick={() => counterStore.reset()}>
          Reset
        </button>
        <button type="button" onClick={() => history.undo()}>
          Undo
        </button>
        <button type="button" onClick={() => history.redo()}>
          Redo
        </button>
      </div>

      <div style={{display: 'flex', 'flex-direction': 'column', gap: '8px'}}>
        <label>
          Label:
          <input
            value={snap().label}
            onInput={(e) => counterStore.setLabel(e.currentTarget.value)}
            style={{'margin-left': '8px'}}
          />
        </label>
        <label>
          Step:
          <input
            type="number"
            value={snap().step}
            onInput={(e) => counterStore.setStep(+e.currentTarget.value)}
            style={{'margin-left': '8px', width: '60px'}}
          />
        </label>
      </div>
    </div>
  );
}

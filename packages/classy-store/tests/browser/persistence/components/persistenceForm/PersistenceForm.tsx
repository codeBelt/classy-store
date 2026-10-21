import {useState} from 'react';
import {useClassyStore} from '../../../../../src/frameworks/react/react';
import {persistence, persistenceStore} from '../../persistence.store';

export function PersistenceForm() {
  const tracked = useClassyStore(persistenceStore);
  const selected = useClassyStore(persistenceStore, (state) => state.text);
  const [connected, setConnected] = useState(true);
  return (
    <main>
      <label>
        Draft
        <input
          value={tracked.text}
          onChange={(event) => {
            persistenceStore.text = event.target.value;
          }}
        />
      </label>
      <output data-testid="tracked">{tracked.text}</output>
      <output data-testid="selected">{selected}</output>
      <button
        type="button"
        onClick={() => {
          persistence.unsubscribe();
          setConnected(false);
        }}
      >
        Stop persistence
      </button>
      <output data-testid="status">
        {connected ? 'Connected' : 'Disconnected'}
      </output>
    </main>
  );
}

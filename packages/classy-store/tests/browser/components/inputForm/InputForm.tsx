import {useLayoutEffect} from 'react';
import type {Snapshot} from '../../../../src/types';
import {browserProbe, inputStore} from '../../browser.store';

type Props = {state: Snapshot<typeof inputStore>};

export function InputForm({state}: Props) {
  const fullName = `${state.first} ${state.last}`;
  const items = state.items.join(',');
  useLayoutEffect(() => {
    browserProbe.commits.push(`${fullName}:${items}`);
  });

  return (
    <main>
      <label>
        Text
        <input
          value={state.text}
          onChange={(event) => {
            inputStore.text = event.target.value;
            inputStore.edits++;
            browserProbe.eventValues.push(event.target.value);
          }}
          onCompositionStart={() => browserProbe.compositions.push('start')}
          onCompositionEnd={() => browserProbe.compositions.push('end')}
        />
      </label>
      <label>
        Notes
        <textarea
          value={state.notes}
          onChange={(event) => {
            inputStore.notes = event.target.value;
          }}
        />
      </label>
      <label>
        Enabled
        <input
          type="checkbox"
          checked={state.checked}
          onChange={(event) => {
            inputStore.checked = event.target.checked;
          }}
        />
      </label>
      <output data-testid="text">{state.text}</output>
      <output data-testid="notes">{state.notes}</output>
      <output data-testid="enabled">{String(state.checked)}</output>
      <output data-testid="edits">{state.edits}</output>
      <output data-testid="full-name">{fullName}</output>
      <output data-testid="items">{items}</output>
      <button
        type="button"
        onClick={() => {
          browserProbe.commits.length = 0;
          browserProbe.notifications = 0;
          inputStore.updateTogether();
          browserProbe.notificationsDuringEvent = browserProbe.notifications;
        }}
      >
        Update together
      </button>
    </main>
  );
}

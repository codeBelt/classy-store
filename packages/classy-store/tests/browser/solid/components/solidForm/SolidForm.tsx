import {For} from '@solidjs/web';
import {createEffect, createMemo, createSignal, flush} from 'solid-js';
import {useClassyStore} from '../../../../../src/frameworks/solid/solid';
import {formStore, probe} from '../../solid.store';

export function SolidForm() {
  const state = useClassyStore(formStore);
  const uppercase = createMemo(() => state().text.toUpperCase());
  const summary = createMemo(
    () => `${state().text}:${state().doubled}:${uppercase()}`,
  );
  const [nativeCount, setNativeCount] = createSignal(formStore.count);
  createEffect(summary, (value) => {
    probe.commits.push(value);
  });
  createEffect(nativeCount, (value) => {
    probe.nativeCommits.push(value);
  });

  function handleUpdate(immediate: boolean) {
    formStore.updateTogether();
    setNativeCount(3);
    probe.coreDuringEvent = probe.coreNotifications;
    probe.countDuringEvent = state().count;
    probe.nativeDuringEvent = nativeCount();
    if (immediate) {
      flush();
      probe.coreAfterFlush = probe.coreNotifications;
      probe.summaryAfterFlush =
        document.querySelector('[data-testid="summary"]')?.textContent ?? '';
      probe.computedAfterFlush = summary();
    } else {
      queueMicrotask(() => {
        probe.summaryAfterMicrotask =
          document.querySelector('[data-testid="summary"]')?.textContent ?? '';
      });
    }
  }

  return (
    <section>
      <label>
        Text
        <input
          value={state().text}
          onInput={(event) => formStore.setText(event.currentTarget.value)}
        />
      </label>
      <label>
        Enabled
        <input
          type="checkbox"
          checked={state().enabled}
          onChange={(event) =>
            formStore.setEnabled(event.currentTarget.checked)
          }
        />
      </label>
      <output data-testid="uppercase">{uppercase()}</output>
      <output data-testid="enabled">{String(state().enabled)}</output>
      <output data-testid="summary">{summary()}</output>
      <output data-testid="item-count">{state().items.length}</output>
      <button type="button" onClick={() => handleUpdate(false)}>
        Update together
      </button>
      <button type="button" onClick={() => handleUpdate(true)}>
        Flush update
      </button>
      <button type="button" onClick={() => formStore.addItem()}>
        Add item
      </button>
      <button type="button" onClick={() => formStore.renameFirst()}>
        Rename first
      </button>
      <button type="button" onClick={() => formStore.reverseItems()}>
        Reverse items
      </button>
      <button type="button" onClick={() => formStore.removeFirst()}>
        Remove first
      </button>
      <button type="button" onClick={() => formStore.replaceItems()}>
        Replace items
      </button>
      <ul>
        <For each={state().items} keyed={(item) => item.id}>
          {(item) => <li data-testid={`item-${item().id}`}>{item().label}</li>}
        </For>
      </ul>
    </section>
  );
}

<script lang="ts">
import {counterStore, history, snap} from './store';
</script>

<div style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px">
  <h1>{$snap.label}</h1>
  <p>Count: <strong>{$snap.count}</strong> · Doubled: <strong>{$snap.doubled}</strong></p>

  <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
    <button onclick={() => counterStore.increment()}>+{$snap.step}</button>
    <button onclick={() => counterStore.decrement()}>-{$snap.step}</button>
    <button onclick={() => counterStore.reset()}>Reset</button>
    <button onclick={() => history.undo()}>Undo</button>
    <button onclick={() => history.redo()}>Redo</button>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <label>
      Label:
      <input
        value={$snap.label}
        oninput={(e) => counterStore.setLabel(e.currentTarget.value)}
        style="margin-left: 8px"
      />
    </label>
    <label>
      Step:
      <input
        type="number"
        value={$snap.step}
        oninput={(e) => counterStore.setStep(+e.currentTarget.value)}
        style="margin-left: 8px; width: 60px"
      />
    </label>
  </div>
</div>

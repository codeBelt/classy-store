<script lang="ts">
import {formStore, probe, snap} from './svelte.store';

const uppercase = $derived($snap.text.toUpperCase());
const itemCount = $derived($snap.items.length);

function handleUpdateTogether() {
  formStore.updateTogether();
  probe.snapshotDuringEvent = `${$snap.text}:${$snap.doubled}:${uppercase}`;
  probe.coreDuringEvent = probe.coreNotifications;
}
</script>

<label>
  Text
  <input value={$snap.text} oninput={(event) => formStore.setText(event.currentTarget.value)} />
</label>
<output data-testid="text">{$snap.text}</output>
<output data-testid="uppercase">{uppercase}</output>
<output data-testid="doubled">{$snap.doubled}</output>
<output data-testid="item-count">{itemCount}</output>
<button onclick={handleUpdateTogether}>Update together</button>
<button onclick={() => formStore.addItem()}>Add item</button>
<button onclick={() => formStore.renameFirst()}>Rename first</button>
<button onclick={() => formStore.removeFirst()}>Remove first</button>
<button onclick={() => formStore.replaceItems()}>Replace items</button>
<ul>
  {#each $snap.items as item (item.id)}
    <li>{item.label}</li>
  {/each}
</ul>

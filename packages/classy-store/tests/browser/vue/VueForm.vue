<script setup lang="ts">
import {computed, nextTick, onMounted, onUpdated} from 'vue';
import {useClassyStore} from '../../../src/frameworks/vue/vue';
import {formStore, probe} from './vue.store';

const snap = useClassyStore(formStore);
const uppercase = computed(() => snap.value.text.toUpperCase());
const itemCount = computed(() => snap.value.items.length);
const summary = computed(
  () => `${snap.value.text}:${snap.value.doubled}:${uppercase.value}`,
);
const textModel = computed({
  get: () => snap.value.text,
  set: (value: string) => formStore.setText(value),
});
const enabledModel = computed({
  get: () => snap.value.enabled,
  set: (value: boolean) => formStore.setEnabled(value),
});

function handleInput(event: Event) {
  formStore.setText((event.target as HTMLInputElement).value);
}
async function handleUpdateTogether() {
  formStore.updateTogether();
  probe.snapshotDuringEvent = summary.value;
  probe.coreDuringEvent = probe.coreNotifications;
  await nextTick();
  probe.summaryAfterNextTick =
    document.querySelector('[data-testid="summary"]')?.textContent ?? '';
}
onMounted(() => probe.commits.push(summary.value));
onUpdated(() => probe.commits.push(summary.value));
</script>

<template>
  <label>Text <input :value="snap.text" @input="handleInput" /></label>
  <label>Text model <input v-model="textModel" /></label>
  <label>Enabled <input type="checkbox" v-model="enabledModel" /></label>
  <output data-testid="enabled">{{ snap.enabled }}</output>
  <output data-testid="text">{{ snap.text }}</output>
  <output data-testid="uppercase">{{ uppercase }}</output>
  <output data-testid="summary">{{ summary }}</output>
  <output data-testid="item-count">{{ itemCount }}</output>
  <button @click="handleUpdateTogether">Update together</button>
  <button @click="formStore.addItem()">Add item</button>
  <button @click="formStore.renameFirst()">Rename first</button>
  <button @click="formStore.removeFirst()">Remove first</button>
  <button @click="formStore.replaceItems()">Replace items</button>
  <ul><li v-for="item in snap.items" :key="item.id">{{ item.label }}</li></ul>
</template>

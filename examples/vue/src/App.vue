<script setup lang="ts">
import {useStore} from '@codebelt/classy-store/vue';
import {counterStore, history} from './store';

const snap = useStore(counterStore);
</script>

<template>
  <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px">
    <h1>{{ snap.label }}</h1>
    <p>Count: <strong>{{ snap.count }}</strong> · Doubled: <strong>{{ snap.doubled }}</strong></p>

    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
      <button @click="counterStore.increment()">+{{ snap.step }}</button>
      <button @click="counterStore.decrement()">-{{ snap.step }}</button>
      <button @click="counterStore.reset()">Reset</button>
      <button @click="history.undo()">Undo</button>
      <button @click="history.redo()">Redo</button>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px">
      <label>
        Label:
        <input
          :value="snap.label"
          @input="(e) => counterStore.setLabel((e.target as HTMLInputElement).value)"
          style="margin-left: 8px"
        />
      </label>
      <label>
        Step:
        <input
          type="number"
          :value="snap.step"
          @input="(e) => counterStore.setStep(+(e.target as HTMLInputElement).value)"
          style="margin-left: 8px; width: 60px"
        />
      </label>
    </div>
  </div>
</template>

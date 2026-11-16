'use client';
import {useClassyStore, useLocalStore} from '@codebelt/classy-store/react';
import {BenchScope} from '@/signal/instruments';

class BenchCounter {
  count = 0;
  samples = [0];
  increment() {
    this.count++;
    this.samples = [...this.samples.slice(-23), this.count];
  }
  reset() {
    this.count = 0;
    this.samples = [0];
  }
}

export function HomeCounter() {
  const store = useLocalStore(() => {
    const counter = new BenchCounter();
    // Start with two captured increments, as on a running bench instrument.
    counter.increment();
    counter.increment();
    return counter;
  });
  const state = useClassyStore(store);
  return (
    <section className="home-instrument" aria-label="Live counter">
      <BenchScope
        src={
          process.env.NEXT_PUBLIC_DOCS_BASE_PATH +
          '/instruments/bench-scope.webp'
        }
        value={state.count}
        samples={state.samples}
      />
      <div className="home-controls lab-readings">
        <output aria-live="polite">Count {state.count}</output>
        <button
          type="button"
          className="lab-primary"
          onClick={() => store.increment()}
        >
          Increment +
        </button>
        <button
          type="button"
          className="lab-secondary"
          onClick={() => store.reset()}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

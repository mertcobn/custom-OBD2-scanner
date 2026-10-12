import type { Sample } from '@/obd/types';

type Listener = (samples: Sample[]) => void;

/** Fan-out of decoded samples: live view, recorder, … subscribe here. */
class SampleBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(samples: Sample[]): void {
    if (samples.length === 0) return;
    for (const fn of this.listeners) fn(samples);
  }
}

export const sampleBus = new SampleBus();

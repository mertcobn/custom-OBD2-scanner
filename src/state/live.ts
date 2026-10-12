import { create } from 'zustand';
import type { Sample } from '@/obd/types';

/** How many points of short-term history to keep per signal (for sparklines and the detail chart). */
export const HISTORY_LENGTH = 240;

export interface Reading {
  v: number;
  t: number;
}

interface LiveState {
  /** Signals the vehicle reports as supported. Empty until discovery runs. */
  supported: string[];
  values: Record<string, Reading>;
  history: Record<string, Reading[]>;
  /** Measured total OBD responses per second. */
  rate: number;
  setSupported: (ids: string[]) => void;
  ingest: (samples: Sample[]) => void;
  setRate: (hz: number) => void;
  clear: () => void;
}

export const useLive = create<LiveState>()((set) => ({
  supported: [],
  values: {},
  history: {},
  rate: 0,
  setSupported: (supported) => set({ supported }),
  ingest: (samples) =>
    set((s) => {
      if (samples.length === 0) return s;
      const values = { ...s.values };
      const history = { ...s.history };
      for (const { id, t, v } of samples) {
        values[id] = { t, v };
        const prev = history[id] ?? [];
        const next = prev.length >= HISTORY_LENGTH ? prev.slice(prev.length - HISTORY_LENGTH + 1) : prev.slice();
        next.push({ t, v });
        history[id] = next;
      }
      return { values, history };
    }),
  setRate: (rate) => set({ rate }),
  clear: () => set({ supported: [], values: {}, history: {}, rate: 0 }),
}));

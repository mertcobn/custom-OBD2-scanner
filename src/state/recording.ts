import { create } from 'zustand';
import type { Sample } from '@/obd/types';
import { sampleBus } from '@/obd/services/bus';

export type PresetId = 'drive' | 'performance' | 'fuel' | 'health' | 'custom';

export interface RecordingConfig {
  preset: PresetId;
  signals: string[];
  /** Auto-stop after this many seconds; null = until the user stops. */
  durationSec: number | null;
}

export interface Marker {
  /** ms since recording start */
  t: number;
  note?: string;
}

export interface RecordingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  config: RecordingConfig;
  samples: Sample[];
  markers: Marker[];
}

export type RecordingStatus = 'idle' | 'recording' | 'finished';

interface RecordingState {
  status: RecordingStatus;
  config: RecordingConfig;
  current?: RecordingSession;
  sampleCount: number;
  sessions: RecordingSession[];
  setConfig: (c: Partial<RecordingConfig>) => void;
  start: () => void;
  stop: () => void;
  addMarker: (note?: string) => void;
  discard: () => void;
  removeSession: (id: string) => void;
}

const EMPTY_CONFIG: RecordingConfig = { preset: 'drive', signals: [], durationSec: null };

let unsubscribe: (() => void) | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

export const useRecording = create<RecordingState>()((set, get) => ({
  status: 'idle',
  config: EMPTY_CONFIG,
  sampleCount: 0,
  sessions: [],
  setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
  start: () => {
    const { config } = get();
    if (config.signals.length === 0) return;
    const session: RecordingSession = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      config,
      samples: [],
      markers: [],
    };
    const wanted = new Set(config.signals);
    unsubscribe?.();
    unsubscribe = sampleBus.subscribe((samples) => {
      const cur = get().current;
      if (!cur || get().status !== 'recording') return;
      let added = 0;
      for (const s of samples) {
        if (wanted.has(s.id)) {
          cur.samples.push(s);
          added++;
        }
      }
      if (added) set((st) => ({ sampleCount: st.sampleCount + added }));
    });
    if (config.durationSec) stopTimer = setTimeout(() => get().stop(), config.durationSec * 1000);
    set({ status: 'recording', current: session, sampleCount: 0 });
  },
  stop: () => {
    unsubscribe?.();
    unsubscribe = undefined;
    clearTimeout(stopTimer);
    const cur = get().current;
    if (!cur) return;
    const done = { ...cur, endedAt: Date.now() };
    set((s) => ({ status: 'finished', current: done, sessions: [done, ...s.sessions] }));
  },
  addMarker: (note) =>
    set((s) => {
      if (!s.current || s.status !== 'recording') return s;
      const marker = { t: Date.now() - s.current.startedAt, note };
      return { current: { ...s.current, markers: [...s.current.markers, marker] } };
    }),
  discard: () => set({ status: 'idle', current: undefined, sampleCount: 0 }),
  removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
}));

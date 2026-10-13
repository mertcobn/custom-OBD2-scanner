import { create } from 'zustand';
import type { AdapterInfo, Dtc, FreezeFrame, MonitorStatus, Sample, VehicleInfo } from '@/obd/types';
import type { OnboardTest } from '@/obd/protocol/mode06';
import { sampleBus } from '@/obd/services/bus';
import { acquireWakeLock, releaseWakeLock } from '@/lib/wakeLock';
import * as store from '@/storage/db';
import { useConnection } from './connection';
import { useLive } from './live';
import { useVehicle } from './vehicle';

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

export interface SessionEvent {
  /** ms since recording start */
  t: number;
  type: 'paused' | 'resumed';
}

/** Everything known about the car when the recording started — gives the data its context. */
export interface SessionSnapshot {
  vehicle?: VehicleInfo;
  monitor?: MonitorStatus;
  dtcs: Dtc[];
  freezeFrame?: FreezeFrame;
  adapter?: AdapterInfo;
  protocol?: string;
  supported: string[];
  /** Mode 06 results, when they were read. */
  onboardTests?: OnboardTest[];
  demo: boolean;
}

export interface SessionMeta {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** 'interrupted' = the tab closed or crashed mid-recording; data up to the last flush is kept. */
  status: 'recording' | 'finished' | 'interrupted';
  config: RecordingConfig;
  markers: Marker[];
  events: SessionEvent[];
  sampleCount: number;
  snapshot: SessionSnapshot;
  /** For interrupted sessions: the user has seen the recovery notice. */
  acknowledged?: boolean;
}

export type RecordingStatus = 'idle' | 'recording' | 'finished';

interface RecordingState {
  status: RecordingStatus;
  config: RecordingConfig;
  current?: SessionMeta;
  /** Samples of the current/just-finished session, kept in memory for instant summaries. */
  currentSamples: Sample[];
  sampleCount: number;
  sessions: SessionMeta[];
  /** Sessions found interrupted at start-up. */
  recovered: string[];
  persistent: boolean;
  init: () => Promise<void>;
  setConfig: (c: Partial<RecordingConfig>) => void;
  start: () => void;
  stop: () => Promise<void>;
  addMarker: (note?: string) => number;
  setMarkerNote: (index: number, note: string) => void;
  discard: () => void;
  removeSession: (id: string) => Promise<void>;
  dismissRecovered: () => void;
  loadSamples: (id: string) => Promise<Sample[]>;
  clearAll: () => Promise<void>;
}

const EMPTY_CONFIG: RecordingConfig = { preset: 'drive', signals: [], durationSec: null };
const FLUSH_MS = 1000;

let offSamples: (() => void) | undefined;
let offConnection: (() => void) | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;
let flushTimer: ReturnType<typeof setInterval> | undefined;
let pending: Sample[] = [];
let seq = 0;
let flushing: Promise<void> = Promise.resolve();

/** The car's current context (identity, faults, readiness, adapter) — stored with recordings and used for reports. */
export function captureSnapshot(): SessionSnapshot {
  const v = useVehicle.getState();
  const c = useConnection.getState();
  return {
    vehicle: v.info,
    monitor: v.monitor,
    dtcs: v.dtcs,
    freezeFrame: v.freezeFrame,
    adapter: c.adapter,
    protocol: c.protocol,
    supported: useLive.getState().supported,
    onboardTests: v.testsState === 'ready' ? v.tests : undefined,
    demo: c.demo,
  };
}

/**
 * Combine the snapshot taken at start with the state at stop. Diagnostics read right after connecting may still
 * be in flight when a recording starts, so prefer whatever is known at the end.
 */
function refreshSnapshot(start: SessionSnapshot): SessionSnapshot {
  const now = captureSnapshot();
  const dtcsKnown = useVehicle.getState().dtcState === 'ready';
  return {
    ...start,
    vehicle: now.vehicle ?? start.vehicle,
    monitor: now.monitor ?? start.monitor,
    dtcs: dtcsKnown ? now.dtcs : start.dtcs,
    freezeFrame: dtcsKnown ? now.freezeFrame : start.freezeFrame,
    adapter: start.adapter ?? now.adapter,
    protocol: start.protocol ?? now.protocol,
    supported: start.supported.length ? start.supported : now.supported,
    onboardTests: now.onboardTests ?? start.onboardTests,
  };
}

/** Persist without ever breaking recording (storage may be unavailable in private mode). */
async function safe(fn: () => Promise<void>) {
  if (!store.storageAvailable()) return;
  try {
    await fn();
  } catch (e) {
    console.warn('[shindan] storage', e);
  }
}

export const useRecording = create<RecordingState>()((set, get) => {
  const persistMeta = () => {
    const cur = get().current;
    if (cur) return safe(() => store.putSession({ ...cur, sampleCount: get().sampleCount }));
    return Promise.resolve();
  };

  const flush = () => {
    const cur = get().current;
    if (!cur || pending.length === 0) return flushing;
    const batch = pending;
    pending = [];
    const n = seq++;
    flushing = flushing.then(() => safe(() => store.appendChunk(cur.id, n, batch))).then(persistMeta);
    return flushing;
  };

  return {
    status: 'idle',
    config: EMPTY_CONFIG,
    currentSamples: [],
    sampleCount: 0,
    sessions: [],
    recovered: [],
    persistent: store.storageAvailable(),

    init: async () => {
      if (!store.storageAvailable()) return;
      try {
        const all = await store.listSessions();
        for (const s of all) {
          if (s.status !== 'recording') continue;
          // The page went away while recording: close it at the last flushed point.
          const samples = await store.loadSamples(s.id);
          s.status = 'interrupted';
          s.endedAt = samples.length ? samples[samples.length - 1]!.t : s.startedAt;
          s.sampleCount = samples.length;
          await store.putSession(s);
        }
        // Keep telling the user until they've seen it, even across further reloads.
        const recovered = all.filter((s) => s.status === 'interrupted' && !s.acknowledged).map((s) => s.id);
        set({ sessions: all, recovered });
      } catch (e) {
        console.warn('[shindan] could not load recordings', e);
        set({ persistent: false });
      }
    },

    setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),

    start: () => {
      const { config } = get();
      if (config.signals.length === 0 || get().status === 'recording') return;
      const session: SessionMeta = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        status: 'recording',
        config,
        markers: [],
        events: [],
        sampleCount: 0,
        snapshot: captureSnapshot(),
      };
      const wanted = new Set(config.signals);
      pending = [];
      seq = 0;
      const samples: Sample[] = [];

      offSamples?.();
      offSamples = sampleBus.subscribe((batch) => {
        if (get().status !== 'recording') return;
        let added = 0;
        for (const s of batch) {
          if (!wanted.has(s.id)) continue;
          samples.push(s);
          pending.push(s);
          added++;
        }
        if (added) set((st) => ({ sampleCount: st.sampleCount + added }));
      });

      // Record link drops so gaps in the data are explained, not mysterious.
      offConnection?.();
      offConnection = useConnection.subscribe((c, prev) => {
        const cur = get().current;
        if (!cur || get().status !== 'recording' || c.status === prev.status) return;
        const t = Date.now() - cur.startedAt;
        const wasUp = prev.status === 'connected';
        const isUp = c.status === 'connected';
        if (wasUp && !isUp) set({ current: { ...cur, events: [...cur.events, { t, type: 'paused' }] } });
        if (!wasUp && isUp) set({ current: { ...cur, events: [...cur.events, { t, type: 'resumed' }] } });
      });

      flushTimer = setInterval(flush, FLUSH_MS);
      if (config.durationSec) stopTimer = setTimeout(() => void get().stop(), config.durationSec * 1000);
      set({ status: 'recording', current: session, currentSamples: samples, sampleCount: 0 });
      void acquireWakeLock();
      void safe(() => store.requestPersistence());
      void persistMeta();
    },

    stop: async () => {
      offSamples?.();
      offConnection?.();
      offSamples = offConnection = undefined;
      clearTimeout(stopTimer);
      clearInterval(flushTimer);
      void releaseWakeLock();
      const cur = get().current;
      if (!cur || get().status !== 'recording') return;
      const done: SessionMeta = {
        ...cur,
        status: 'finished',
        endedAt: Date.now(),
        sampleCount: get().sampleCount,
        snapshot: refreshSnapshot(cur.snapshot),
      };
      set((s) => ({ status: 'finished', current: done, sessions: [done, ...s.sessions.filter((x) => x.id !== done.id)] }));
      await flush();
      await persistMeta();
    },

    addMarker: (note) => {
      const s = get();
      if (!s.current || s.status !== 'recording') return -1;
      const marker = { t: Date.now() - s.current.startedAt, note };
      const markers = [...s.current.markers, marker];
      set({ current: { ...s.current, markers } });
      void persistMeta();
      return markers.length - 1;
    },

    setMarkerNote: (index, note) => {
      const update = (m: SessionMeta): SessionMeta => ({
        ...m,
        markers: m.markers.map((x, i) => (i === index ? { ...x, note: note.trim() || undefined } : x)),
      });
      const cur = get().current;
      if (!cur) return;
      const next = update(cur);
      set((s) => ({ current: next, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
      void persistMeta();
    },

    discard: () => set({ status: 'idle', current: undefined, currentSamples: [], sampleCount: 0 }),

    removeSession: async (id) => {
      set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), recovered: s.recovered.filter((x) => x !== id) }));
      if (get().current?.id === id) get().discard();
      await safe(() => store.deleteSession(id));
    },

    dismissRecovered: () => {
      const ids = new Set(get().recovered);
      const sessions = get().sessions.map((s) => (ids.has(s.id) ? { ...s, acknowledged: true } : s));
      set({ recovered: [], sessions });
      for (const s of sessions) if (ids.has(s.id)) void safe(() => store.putSession(s));
    },

    loadSamples: async (id) => {
      const s = get();
      if (s.current?.id === id && s.currentSamples.length) return s.currentSamples;
      if (!store.storageAvailable()) return [];
      try {
        return await store.loadSamples(id);
      } catch {
        return [];
      }
    },

    clearAll: async () => {
      if (get().status === 'recording') await get().stop();
      set({ sessions: [], recovered: [], current: undefined, currentSamples: [], status: 'idle', sampleCount: 0 });
      await safe(() => store.clearAll());
    },
  };
});

import { useEffect } from 'react';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useRecording } from '@/state/recording';
import { useVehicle } from '@/state/vehicle';
import { sampleBus } from './services/bus';
// Imported eagerly: the browser device picker must open within the click's user-activation window.
import { RealBackend, type RealTarget } from './services/realBackend';

/**
 * A backend owns one connection to a vehicle (real or simulated) and pushes
 * everything it learns into the stores / sample bus.
 */
export interface ObdBackend {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setWatched(ids: string[]): void;
  readDtcs(): Promise<void>;
  clearDtcs(): Promise<void>;
}

export type ConnectTarget = RealTarget | 'demo';

let backend: ObdBackend | undefined;
const interests = new Map<number, string[]>();
let nextInterest = 1;

function watchedUnion(): string[] {
  const set = new Set<string>();
  for (const ids of interests.values()) ids.forEach((id) => set.add(id));
  const rec = useRecording.getState();
  if (rec.status === 'recording') rec.config.signals.forEach((id) => set.add(id));
  return [...set];
}

function pushWatched() {
  backend?.setWatched(watchedUnion());
}

/** Register interest in signals; returns an unregister function. */
export function watch(ids: string[]): () => void {
  const key = nextInterest++;
  interests.set(key, ids);
  pushWatched();
  return () => {
    interests.delete(key);
    pushWatched();
  };
}

/** React hook: keep the given signals polled while the component is mounted. */
export function useWatch(ids: string[]): void {
  const key = ids.join(',');
  useEffect(() => {
    const unwatch = watch(key ? key.split(',') : []);
    return unwatch;
  }, [key]);
}

function createBackend(target: ConnectTarget): ObdBackend {
  // Demo mode runs the full real pipeline against the virtual ELM327 + virtual car.
  return new RealBackend(target === 'demo' ? 'sim' : target);
}

export async function connect(target: ConnectTarget): Promise<void> {
  await disconnect();
  const b = createBackend(target);
  backend = b;
  try {
    await b.connect();
    if (backend !== b) return;
    pushWatched();
  } catch {
    if (backend === b) backend = undefined;
  }
}

export async function disconnect(): Promise<void> {
  const b = backend;
  backend = undefined;
  if (b) await b.disconnect().catch(() => undefined);
  useConnection.getState().reset();
  useLive.getState().clear();
  useVehicle.getState().reset();
}

export async function readDtcs(): Promise<void> {
  await backend?.readDtcs();
}

export async function clearDtcs(): Promise<void> {
  await backend?.clearDtcs();
}

// Keep the polled set in sync with recording state and fan samples into the live store.
useRecording.subscribe((s, prev) => {
  if (s.status !== prev.status || s.config !== prev.config) pushWatched();
});
sampleBus.subscribe((samples) => useLive.getState().ingest(samples));

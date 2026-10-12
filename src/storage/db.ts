import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Sample } from '@/obd/types';
import type { SessionMeta } from '@/state/recording';

/**
 * On-device storage for recordings. Nothing here ever leaves the device unless the user exports it.
 *
 * sessions: one metadata record per recording
 * chunks:   samples in ~1 s batches, keyed by [sessionId, seq]
 */
interface ShindanDB extends DBSchema {
  sessions: { key: string; value: SessionMeta };
  chunks: { key: [string, number]; value: { session: string; seq: number; samples: Sample[] }; indexes: { session: string } };
}

const DB_NAME = 'shindan';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ShindanDB>> | undefined;

function db(): Promise<IDBPDatabase<ShindanDB>> {
  dbPromise ??= openDB<ShindanDB>(DB_NAME, VERSION, {
    upgrade(d) {
      d.createObjectStore('sessions', { keyPath: 'id' });
      const chunks = d.createObjectStore('chunks', { keyPath: ['session', 'seq'] });
      chunks.createIndex('session', 'session');
    },
  });
  return dbPromise;
}

export function storageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function putSession(meta: SessionMeta): Promise<void> {
  await (await db()).put('sessions', meta);
}

export async function listSessions(): Promise<SessionMeta[]> {
  const all = await (await db()).getAll('sessions');
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function appendChunk(session: string, seq: number, samples: Sample[]): Promise<void> {
  if (samples.length === 0) return;
  await (await db()).put('chunks', { session, seq, samples });
}

export async function loadSamples(session: string): Promise<Sample[]> {
  const range = IDBKeyRange.bound([session, 0], [session, Number.MAX_SAFE_INTEGER]);
  const chunks = await (await db()).getAll('chunks', range);
  return chunks.sort((a, b) => a.seq - b.seq).flatMap((c) => c.samples);
}

export async function deleteSession(session: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['sessions', 'chunks'], 'readwrite');
  await tx.objectStore('sessions').delete(session);
  const keys = await tx.objectStore('chunks').index('session').getAllKeys(session);
  await Promise.all(keys.map((k) => tx.objectStore('chunks').delete(k)));
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['sessions', 'chunks'], 'readwrite');
  await Promise.all([tx.objectStore('sessions').clear(), tx.objectStore('chunks').clear()]);
  await tx.done;
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not available */
  }
}

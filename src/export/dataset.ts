import { SIGNAL_BY_ID, type SignalDef } from '@/obd/signals';
import type { Sample } from '@/obd/types';
import { computeStats, type Stats } from '@/lib/stats';
import { BASE_UNIT } from '@/units/units';
import type { SessionMeta, SessionSnapshot } from '@/state/recording';

export interface SignalSeries {
  def: SignalDef;
  unit: string;
  /** ms since session start */
  t: number[];
  v: number[];
  stats?: Stats;
}

/** Everything an exporter needs, in base (SI-ish) units. */
export interface Dataset {
  kind: 'recording' | 'snapshot';
  generatedAt: number;
  startedAt: number;
  endedAt: number;
  meta?: SessionMeta;
  snapshot: SessionSnapshot;
  series: SignalSeries[];
}

export function baseUnit(def: SignalDef): string {
  return def.unit ?? BASE_UNIT[def.quantity];
}

export function buildDataset(meta: SessionMeta, samples: Sample[], now = Date.now()): Dataset {
  const by = new Map<string, { t: number[]; v: number[] }>();
  for (const id of meta.config.signals) if (SIGNAL_BY_ID[id]) by.set(id, { t: [], v: [] });
  for (const s of [...samples].sort((a, b) => a.t - b.t)) {
    const e = by.get(s.id);
    if (!e) continue;
    e.t.push(s.t - meta.startedAt);
    e.v.push(s.v);
  }
  const series: SignalSeries[] = [...by.entries()].map(([id, d]) => {
    const def = SIGNAL_BY_ID[id]!;
    return { def, unit: baseUnit(def), t: d.t, v: d.v, stats: computeStats(d.v) };
  });
  return {
    kind: 'recording',
    generatedAt: now,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt ?? (samples.length ? samples[samples.length - 1]!.t : meta.startedAt),
    meta,
    snapshot: meta.snapshot,
    series,
  };
}

/** A report of the car's current state without a recording (fault codes, readiness, identity). */
export function buildSnapshotDataset(snapshot: SessionSnapshot, now = Date.now()): Dataset {
  return { kind: 'snapshot', generatedAt: now, startedAt: now, endedAt: now, snapshot, series: [] };
}

/** Value of a series at time t (ms since start): the latest sample at or before t, if not older than maxAgeMs. */
export function valueAt(s: SignalSeries, t: number, maxAgeMs = 5000): number | undefined {
  let lo = 0;
  let hi = s.t.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid]! <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0 || t - s.t[idx]! > maxAgeMs) return undefined;
  return s.v[idx];
}

/** Shared file-name stem: shindan-<VIN or demo>-<YYYYMMDD-HHMM>. */
export function fileStem(d: Dataset): string {
  const date = new Date(d.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const who = d.snapshot.vehicle?.vin ?? (d.snapshot.demo ? 'demo' : 'vehicle');
  return `shindan-${who}-${stamp}${d.kind === 'snapshot' ? '-report' : ''}`;
}

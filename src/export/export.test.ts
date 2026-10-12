import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import '@/i18n';
import { createVehicleModel } from '@/obd/sim/vehicleModel';
import { DEMO_SCENARIO } from '@/obd/sim/scenario';
import type { Sample } from '@/obd/types';
import type { SessionMeta } from '@/state/recording';
import { buildDataset, buildSnapshotDataset, fileStem, valueAt } from './dataset';
import { findings } from './findings';
import { SCHEMA, toJson, toLongCsv, toSummaryMarkdown, toTimelineCsv } from './formats';
import { buildAiPack } from './index';

const START = Date.UTC(2026, 9, 12, 9, 0, 0);
const SIGNALS = ['rpm', 'speed', 'coolantTemp', 'stftB1', 'ltftB1', 'moduleVoltage', 'o2VB1S1'];

function session(overrides: Partial<SessionMeta> = {}): { meta: SessionMeta; samples: Sample[] } {
  const model = createVehicleModel(3);
  const samples: Sample[] = [];
  // 12 minutes, each signal every 200–2000 ms like the real scheduler would.
  for (let t = 0; t < 12 * 60_000; t += 100) {
    model.step(100);
    SIGNALS.forEach((id, i) => {
      const every = id === 'coolantTemp' ? 2000 : 200 + i * 20;
      if (t % every < 100) samples.push({ t: START + t, id, v: model.read(id)! });
    });
  }
  const meta: SessionMeta = {
    id: 's1',
    startedAt: START,
    endedAt: START + 12 * 60_000,
    status: 'finished',
    config: { preset: 'health', signals: SIGNALS, durationSec: null },
    markers: [{ t: 65_000, note: 'Rölantide titreme' }],
    events: [
      { t: 300_000, type: 'paused' },
      { t: 302_000, type: 'resumed' },
    ],
    sampleCount: samples.length,
    snapshot: {
      vehicle: { vin: DEMO_SCENARIO.vin, make: 'Toyota', modelYear: 2002, country: 'Japan', ecus: ['7E8'] },
      monitor: DEMO_SCENARIO.monitor,
      dtcs: DEMO_SCENARIO.dtcs,
      freezeFrame: { dtc: 'P0301', values: { rpm: 812, coolantTemp: 88 } },
      adapter: { transport: 'sim', name: 'Shindan Demo', elmVersion: 'ELM327 v1.5' },
      protocol: 'ISO 15765-4 CAN (11 bit, 500 kbaud)',
      supported: SIGNALS,
      demo: true,
    },
    ...overrides,
  };
  return { meta, samples };
}

describe('dataset', () => {
  it('groups samples per signal relative to start with stats', () => {
    const { meta, samples } = session();
    const d = buildDataset(meta, samples, START + 1);
    expect(d.series.map((s) => s.def.id)).toEqual(SIGNALS);
    const rpm = d.series[0]!;
    expect(rpm.t[0]).toBe(0);
    expect(rpm.unit).toBe('rpm');
    expect(rpm.stats!.min).toBeGreaterThan(700);
    expect(fileStem(d)).toBe(`shindan-${DEMO_SCENARIO.vin}-${new Date(START).getFullYear()}1012-${String(new Date(START).getHours()).padStart(2, '0')}00`);
  });

  it('valueAt returns the latest non-stale value', () => {
    const s = { t: [0, 1000, 2000], v: [1, 2, 3] } as never;
    expect(valueAt(s, 1500)).toBe(2);
    expect(valueAt(s, -1)).toBeUndefined();
    expect(valueAt(s, 9000, 5000)).toBeUndefined();
  });
});

describe('findings', () => {
  it('reports MIL, codes, readiness and link drops for the demo story', () => {
    const { meta, samples } = session();
    const keys = findings(buildDataset(meta, samples)).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['milOn', 'storedDtcs', 'pendingDtcs', 'monitorsIncomplete', 'linkDrops']));
    expect(keys).not.toContain('allGood');
  });

  it('detects lean trims and low charging voltage', () => {
    const t = Array.from({ length: 50 }, (_, i) => i * 1000);
    const series = (id: string, v: number) => ({ id, v, t });
    const { meta } = session({ snapshot: { dtcs: [], supported: [], demo: false } });
    const samples: Sample[] = [series('ltftB1', 9), series('stftB1', 4), series('moduleVoltage', 12.6), series('rpm', 2000)].flatMap((s) =>
      s.t.map((tt) => ({ t: START + tt, id: s.id, v: s.v })),
    );
    const f = findings(buildDataset({ ...meta, events: [] }, samples));
    expect(f.find((x) => x.key === 'lean')?.params).toEqual({ bank: 1, value: 13 });
    expect(f.find((x) => x.key === 'chargingLow')?.params).toEqual({ value: 12.6 });
  });

  it('says all good when there is nothing to report', () => {
    const d = buildSnapshotDataset({ dtcs: [], supported: [], demo: false });
    expect(findings(d)).toEqual([{ level: 'info', key: 'allGood' }]);
  });
});

describe('formats', () => {
  const { meta, samples } = session();
  const d = buildDataset(meta, samples, START + 13 * 60_000);

  it('JSON follows the schema and is fully numeric', () => {
    const j = toJson(d, 'tr');
    expect(j.schema).toBe(SCHEMA);
    expect(j.session?.markers[0]).toMatchObject({ t_ms: 65_000, note: 'Rölantide titreme' });
    expect(Object.keys(j.session!.markers[0]!.valuesAtMarker)).toEqual(expect.arrayContaining(['rpm', 'speed']));
    expect(j.diagnostics.dtcs[0]).toMatchObject({ code: 'P0301', type: 'stored', severity: 'high' });
    expect(j.diagnostics.dtcs[0]!.description).toContain('tekleme');
    expect(j.signals.find((s) => s.id === 'rpm')).toMatchObject({ unit: 'rpm', source: 'mode 01 pid 0C', formula: '(256A+B)/4' });
    expect(j.series.rpm!.t_ms.length).toBe(j.series.rpm!.v.length);
    expect(j.series.rpm!.v.every((x) => typeof x === 'number')).toBe(true);
    expect(j.findings.length).toBeGreaterThan(0);
    // round-trips through JSON
    expect(JSON.parse(JSON.stringify(j)).schema).toBe(SCHEMA);
  });

  it('long CSV has one row per reading, time ordered', () => {
    const csv = toLongCsv(d).trim().split('\n');
    expect(csv[0]).toBe('t_ms,iso_time,signal,value,unit');
    expect(csv.length - 1).toBe(samples.length);
    const times = csv.slice(1).map((l) => Number(l.split(',')[0]));
    expect(times.every((t, i) => i === 0 || t >= times[i - 1]!)).toBe(true);
  });

  it('timeline CSV aligns signals on a grid with units in the header', () => {
    const csv = toTimelineCsv(d, 1000).trim().split('\n');
    expect(csv[0]).toBe('t_s,iso_time,rpm [rpm],speed [km/h],coolantTemp [°C],stftB1 [%],ltftB1 [%],moduleVoltage [V],o2VB1S1 [V]');
    expect(csv.length).toBeGreaterThan(700);
    const row = csv[100]!.split(',');
    expect(row).toHaveLength(9);
    expect(row.slice(2).every((c) => c !== '')).toBe(true); // nothing stale mid-recording
  });

  it('markdown summary reads well in both languages', () => {
    const tr = toSummaryMarkdown(d, 'tr');
    expect(tr).toContain('# Shindan — Araç teşhis raporu');
    expect(tr).toContain('| P0301 | Kayıtlı | 7E8 | 1. silindirde tekleme tespit edildi |');
    expect(tr).toContain('Rölantide titreme');
    const en = toSummaryMarkdown(d, 'en');
    expect(en).toContain('## Findings');
    expect(en).toContain('Cylinder 1 misfire detected');
  });

  it('AI pack zips all files', () => {
    const pack = buildAiPack(d, 'en');
    expect(pack.filename).toMatch(/-ai\.zip$/);
    return pack.blob.arrayBuffer().then((buf) => {
      const files = unzipSync(new Uint8Array(buf));
      expect(Object.keys(files).sort()).toEqual(['README.md', 'samples_long.csv', 'session.json', 'summary.md', 'timeline.csv']);
      expect(JSON.parse(strFromU8(files['session.json']!)).schema).toBe(SCHEMA);
    });
  });

  it('snapshot pack has no time series files', async () => {
    const pack = buildAiPack(buildSnapshotDataset(meta.snapshot), 'tr');
    const files = unzipSync(new Uint8Array(await pack.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['README.md', 'session.json', 'summary.md']);
  });
});

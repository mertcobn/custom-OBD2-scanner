import { valueAt, type Dataset, type SignalSeries } from './dataset';
import { monitorName } from '@/obd/protocol/mode06';

export type FindingLevel = 'high' | 'medium' | 'info';

export interface Finding {
  level: FindingLevel;
  /** i18n key under report.findings.* */
  key: string;
  params?: Record<string, string | number>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rule-based observations. Deliberately conservative: each rule states a measurable fact and a common
 * interpretation; it never claims a definitive diagnosis.
 */
export function findings(d: Dataset): Finding[] {
  const out: Finding[] = [];
  const snap = d.snapshot;
  const s = (id: string): SignalSeries | undefined => d.series.find((x) => x.def.id === id && x.v.length > 0);

  if (snap.monitor?.mil) out.push({ level: 'high', key: 'milOn' });
  const stored = snap.dtcs.filter((x) => x.kind === 'stored');
  const pending = snap.dtcs.filter((x) => x.kind === 'pending');
  if (stored.length) out.push({ level: 'high', key: 'storedDtcs', params: { count: stored.length, codes: stored.map((x) => x.code).join(', ') } });
  if (pending.length) out.push({ level: 'medium', key: 'pendingDtcs', params: { count: pending.length, codes: pending.map((x) => x.code).join(', ') } });

  // Fuel trims: total correction = STFT + LTFT. Beyond ±10 % the ECU is compensating for something.
  for (const bank of [1, 2]) {
    const lt = s(`ltftB${bank}`)?.stats?.mean;
    const st = s(`stftB${bank}`)?.stats?.mean ?? 0;
    if (lt === undefined) continue;
    const total = lt + st;
    if (total > 10) out.push({ level: 'medium', key: 'lean', params: { bank, value: r1(total) } });
    else if (total < -10) out.push({ level: 'medium', key: 'rich', params: { bank, value: r1(total) } });
  }

  const coolant = s('coolantTemp');
  if (coolant?.stats) {
    const durationMin = (coolant.t[coolant.t.length - 1]! - coolant.t[0]!) / 60000;
    if (coolant.stats.max > 105) out.push({ level: 'high', key: 'overheat', params: { value: r1(coolant.stats.max) } });
    else if (durationMin >= 10 && coolant.stats.max < 75) out.push({ level: 'medium', key: 'coldEngine', params: { value: r1(coolant.stats.max), minutes: Math.round(durationMin) } });
  }

  // Charging system: only judge voltage while the engine is running.
  const volt = s('moduleVoltage') ?? s('adapterVoltage');
  const rpm = s('rpm');
  if (volt && rpm) {
    const running = volt.v.filter((_v, i) => (valueAt(rpm, volt.t[i]!, 3000) ?? 0) > 500);
    if (running.length >= 3) {
      const mean = running.reduce((a, b) => a + b, 0) / running.length;
      const max = Math.max(...running);
      if (mean < 13.2) out.push({ level: 'medium', key: 'chargingLow', params: { value: r1(mean) } });
      else if (max > 15) out.push({ level: 'medium', key: 'chargingHigh', params: { value: r1(max) } });
    }
  }

  // A healthy narrow-band upstream O2 sensor switches between ~0.1 and ~0.9 V once warm.
  const o2 = s('o2VB1S1');
  if (o2?.stats && o2.stats.count >= 20 && (coolant?.stats?.max ?? 0) > 70 && o2.stats.std < 0.08) {
    out.push({ level: 'medium', key: 'o2Flat', params: { value: r1(o2.stats.mean * 100) / 100 } });
  }

  const incomplete = snap.monitor?.monitors.filter((m) => m.supported && !m.complete) ?? [];
  if (incomplete.length) out.push({ level: 'info', key: 'monitorsIncomplete', params: { count: incomplete.length } });

  const failedTests = snap.onboardTests?.filter((x) => !x.pass) ?? [];
  if (failedTests.length) {
    const monitors = [...new Set(failedTests.map((x) => monitorName(x.mid).en))].join(', ');
    out.push({ level: 'medium', key: 'testsFailed', params: { count: failedTests.length, monitors } });
  }

  const drops = d.meta?.events.filter((e) => e.type === 'paused').length ?? 0;
  if (drops) out.push({ level: 'info', key: 'linkDrops', params: { count: drops } });

  if (!out.some((f) => f.level !== 'info')) out.unshift({ level: 'info', key: 'allGood' });
  return out;
}

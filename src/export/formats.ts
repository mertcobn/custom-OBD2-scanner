import i18n from '@/i18n';
import { describeDtc } from '@/data/dtc';
import { SIGNAL_BY_ID } from '@/obd/signals';
import type { Language } from '@/state/settings';
import { baseUnit, valueAt, type Dataset, type SignalSeries } from './dataset';
import { findings } from './findings';
import { monitorName, testName } from '@/obd/protocol/mode06';

const hex2 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

export const SCHEMA = 'shindan.session/v1';

const iso = (ms: number) => new Date(ms).toISOString();
/** Round to a precision that keeps the signal's resolution without float noise. */
const round = (v: number, digits: number) => {
  const f = 10 ** Math.min(6, digits + 2);
  return Math.round(v * f) / f;
};
const pidHex = (pid: number) => pid.toString(16).toUpperCase().padStart(2, '0');

export function findingTexts(d: Dataset, lang: Language) {
  const t = i18n.getFixedT(lang);
  return findings(d).map((f) => ({ ...f, text: t(`report.findings.${f.key}`, f.params) }));
}

/** Freeze-frame and marker values with units, keyed by signal id. */
function valuesWithUnits(values: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(values).map(([id, v]) => {
      const def = SIGNAL_BY_ID[id];
      return [id, { value: def ? round(v, def.digits) : v, unit: def ? baseUnit(def) : '' }];
    }),
  );
}

function markerValues(d: Dataset, t: number) {
  const out: Record<string, number> = {};
  for (const s of d.series) {
    const v = valueAt(s, t, maxAge(s));
    if (v !== undefined) out[s.def.id] = round(v, s.def.digits);
  }
  return out;
}

/** How stale a value may be when aligning a series to a time grid: ~2.5 typical sample intervals. */
export function maxAge(s: SignalSeries): number {
  if (s.t.length < 3) return 10_000;
  const gaps = s.t.slice(1).map((t, i) => t - s.t[i]!).sort((a, b) => a - b);
  return Math.max(2000, 2.5 * gaps[Math.floor(gaps.length / 2)]!);
}

// ── JSON ─────────────────────────────────────────────────────────────────

export function toJson(d: Dataset, lang: Language) {
  const snap = d.snapshot;
  return {
    schema: SCHEMA,
    description:
      'OBD-II data captured by Shindan (web OBD scanner) from an ELM327-compatible adapter. All numeric values are in the base unit stated per signal (km/h, °C, kPa, g/s, L/h, V, %, rpm…). Time series are irregularly sampled; t_ms is milliseconds since session start.',
    generatedAt: iso(d.generatedAt),
    app: { name: 'Shindan', version: __APP_VERSION__ },
    kind: d.kind,
    language: lang,
    session: d.meta
      ? {
          id: d.meta.id,
          status: d.meta.status,
          preset: d.meta.config.preset,
          startedAt: iso(d.startedAt),
          endedAt: iso(d.endedAt),
          durationSeconds: round((d.endedAt - d.startedAt) / 1000, 1),
          demo: snap.demo,
          markers: d.meta.markers.map((m) => ({ t_ms: m.t, time: iso(d.startedAt + m.t), note: m.note ?? null, valuesAtMarker: markerValues(d, m.t) })),
          connectionEvents: d.meta.events.map((e) => ({ t_ms: e.t, type: e.type })),
        }
      : null,
    vehicle: snap.vehicle ?? null,
    adapter: snap.adapter ?? null,
    protocol: snap.protocol ?? null,
    diagnostics: {
      milOn: snap.monitor?.mil ?? null,
      dtcCountReported: snap.monitor?.dtcCount ?? null,
      dtcs: snap.dtcs.map((x) => {
        const info = describeDtc(x.code, lang);
        return { code: x.code, type: x.kind, ecu: x.ecu, description: info.title || null, system: info.system, generic: info.generic, severity: info.severity ?? null };
      }),
      readiness: snap.monitor
        ? { ignition: snap.monitor.ignition, monitors: snap.monitor.monitors.map((m) => ({ monitor: m.id, supported: m.supported, complete: m.complete })) }
        : null,
      freezeFrame: snap.freezeFrame
        ? {
            dtc: snap.freezeFrame.dtc,
            values: valuesWithUnits(snap.freezeFrame.values),
          }
        : null,
      supportedSignals: snap.supported,
      onboardTests: snap.onboardTests
        ? snap.onboardTests.map((x) => ({
            monitorId: hex2(x.mid),
            monitor: monitorName(x.mid).en,
            testId: hex2(x.tid),
            test: testName(x.mid, x.tid).en,
            ecu: x.ecu,
            value: x.value,
            min: x.min,
            max: x.max,
            unit: x.unit,
            result: x.pass ? 'pass' : 'fail',
            raw: x.raw,
          }))
        : null,
    },
    findings: findingTexts(d, lang).map(({ level, key, text }) => ({ level, key, text })),
    signals: d.series.map((s) => ({
      id: s.def.id,
      name: s.def.name.en,
      localName: s.def.name[lang],
      unit: s.unit,
      category: s.def.category,
      source: s.def.source === 'elm' ? 'adapter (ATRV)' : `mode 01 pid ${pidHex(s.def.pid)}`,
      formula: s.def.formula,
      range: [s.def.min, s.def.max],
      typicalHealthyRange: s.def.normal ?? null,
      sampleCount: s.v.length,
      stats: s.stats
        ? Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, k === 'count' ? v : round(v, s.def.digits)]))
        : null,
    })),
    series: Object.fromEntries(d.series.map((s) => [s.def.id, { t_ms: s.t, v: s.v.map((v) => round(v, s.def.digits)) }])),
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────

const csvCell = (v: string | number | undefined | null) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Lossless long format: one row per reading. Best for pandas / AI. */
export function toLongCsv(d: Dataset): string {
  const rows: [number, string, number, string][] = [];
  for (const s of d.series) s.t.forEach((t, i) => rows.push([t, s.def.id, round(s.v[i]!, s.def.digits), s.unit]));
  rows.sort((a, b) => a[0] - b[0]);
  const lines = ['t_ms,iso_time,signal,value,unit'];
  for (const [t, id, v, unit] of rows) lines.push([t, iso(d.startedAt + t), id, v, csvCell(unit)].join(','));
  return lines.join('\n') + '\n';
}

/** Wide format on a fixed time grid (latest value, empty if stale). Best for spreadsheets and correlation. */
export function toTimelineCsv(d: Dataset, stepMs = 500): string {
  const series = d.series.filter((s) => s.v.length);
  const header = ['t_s', 'iso_time', ...series.map((s) => csvCell(`${s.def.id} [${s.unit || '-'}]`))];
  const lines = [header.join(',')];
  const end = Math.max(0, ...series.map((s) => s.t[s.t.length - 1] ?? 0));
  const ages = series.map(maxAge);
  for (let t = 0; t <= end; t += stepMs) {
    const vals = series.map((s, i) => {
      const v = valueAt(s, t, ages[i]);
      return v === undefined ? '' : round(v, s.def.digits);
    });
    lines.push([round(t / 1000, 1), iso(d.startedAt + t), ...vals].join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Markdown ─────────────────────────────────────────────────────────────

export function toSummaryMarkdown(d: Dataset, lang: Language): string {
  const t = i18n.getFixedT(lang);
  const snap = d.snapshot;
  const v = snap.vehicle;
  const L: string[] = [];
  const fmt = (n: number | undefined, digits: number) => (n === undefined || !Number.isFinite(n) ? '—' : round(n, digits).toString());

  L.push(`# ${t('report.title')}`, '');
  L.push(`- **${t('report.generated')}:** ${new Date(d.generatedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}`);
  if (v?.vin) L.push(`- **VIN:** \`${v.vin}\`${[v.make, v.modelYear, v.country].filter(Boolean).length ? ` — ${[v.make, v.modelYear, v.country].filter(Boolean).join(', ')}` : ''}`);
  if (snap.protocol) L.push(`- **${t('vehicle.protocol')}:** ${snap.protocol}`);
  if (snap.adapter) L.push(`- **${t('vehicle.adapter.name')}:** ${snap.adapter.name}${snap.adapter.elmVersion ? ` (${snap.adapter.elmVersion})` : ''}`);
  if (snap.demo) L.push(`- **${t('report.demoNote')}**`);
  L.push('');

  L.push(`## ${t('report.findingsTitle')}`, '');
  for (const f of findingTexts(d, lang)) L.push(`- ${f.level === 'high' ? '🔴' : f.level === 'medium' ? '🟠' : 'ℹ️'} ${f.text}`);
  L.push('');

  L.push(`## ${t('nav.dtc')}`, '');
  if (snap.dtcs.length === 0) L.push(t('dtc.noneBody'));
  else {
    L.push(`| ${t('report.code')} | ${t('report.type')} | ECU | ${t('report.description')} |`, '|---|---|---|---|');
    for (const x of snap.dtcs) L.push(`| ${x.code} | ${t(`dtc.kinds.${x.kind}`)} | ${x.ecu} | ${describeDtc(x.code, lang).title || t('dtc.unknown')} |`);
  }
  L.push('');

  if (snap.freezeFrame) {
    L.push(`## ${t('dtc.freezeFrame')} (${snap.freezeFrame.dtc})`, '');
    L.push(`| ${t('record.signal')} | ${t('report.value')} |`, '|---|---|');
    for (const [id, val] of Object.entries(snap.freezeFrame.values)) {
      const def = SIGNAL_BY_ID[id];
      if (def) L.push(`| ${def.name[lang]} | ${fmt(val, def.digits)} ${baseUnit(def)} |`);
    }
    L.push('');
  }

  if (snap.onboardTests?.length) {
    L.push(`## ${t('dtc.tests.title')} (Mode 06)`, '');
    L.push(`| ${t('report.monitor')} | ${t('report.test')} | ${t('report.value')} | ${t('dtc.tests.range')} | ${t('report.result')} |`, '|---|---|---|---|---|');
    for (const x of snap.onboardTests)
      L.push(`| ${monitorName(x.mid)[lang]} | ${testName(x.mid, x.tid)[lang]} | ${x.value}${x.unit ? ` ${x.unit}` : ''} | ${x.min} … ${x.max} | ${x.pass ? '✅ ' + t('dtc.tests.pass') : '❌ ' + t('dtc.tests.fail')} |`);
    L.push('');
  }

  if (snap.monitor) {
    L.push(`## ${t('vehicle.readiness.title')}`, '');
    for (const m of snap.monitor.monitors.filter((x) => x.supported))
      L.push(`- ${m.complete ? '✅' : '⏳'} ${t(`monitors.${m.id}`)} — ${m.complete ? t('vehicle.readiness.complete') : t('vehicle.readiness.incomplete')}`);
    L.push('');
  }

  if (d.kind === 'recording' && d.meta) {
    L.push(`## ${t('report.recording')}`, '');
    L.push(`- **${t('record.duration')}:** ${round((d.endedAt - d.startedAt) / 1000, 0)} s`);
    L.push(`- **${t('record.samples')}:** ${d.series.reduce((a, s) => a + s.v.length, 0)}`);
    L.push(`- **${t('report.preset')}:** ${t(`record.presets.${d.meta.config.preset}.title`)}`, '');
    L.push(`| ${t('record.signal')} | ${t('report.unit')} | ${t('stats.min')} | ${t('stats.mean')} | ${t('stats.max')} | p95 | n | ${t('live.normal')} |`);
    L.push('|---|---|---|---|---|---|---|---|');
    for (const s of d.series) {
      const st = s.stats;
      const normal = s.def.normal ? `${s.def.normal[0]}–${s.def.normal[1]}` : '';
      L.push(`| ${s.def.name[lang]} (\`${s.def.id}\`) | ${s.unit} | ${fmt(st?.min, s.def.digits)} | ${fmt(st?.mean, s.def.digits)} | ${fmt(st?.max, s.def.digits)} | ${fmt(st?.p95, s.def.digits)} | ${st?.count ?? 0} | ${normal} |`);
    }
    L.push('');
    if (d.meta.markers.length) {
      L.push(`## ${t('record.markers')}`, '');
      for (const m of d.meta.markers) {
        const vals = markerValues(d, m.t);
        const brief = Object.entries(vals)
          .slice(0, 8)
          .map(([id, val]) => `${id}=${val}`)
          .join(', ');
        L.push(`- **${round(m.t / 1000, 1)} s** — ${m.note ?? t('record.noNote')}${brief ? `  \n  \`${brief}\`` : ''}`);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

export function toAiReadme(d: Dataset): string {
  return `# Shindan data pack — read me first

This archive contains OBD-II diagnostic data from one vehicle, captured in a web browser by **Shindan**
through an ELM327-compatible Bluetooth adapter. It is designed to be analysed by people and by AI assistants.

## Files
| File | What it is |
|---|---|
| \`summary.md\` | Human-readable summary: findings, fault codes, readiness, statistics, markers. Start here. |
| \`session.json\` | Complete structured data (schema \`${SCHEMA}\`): vehicle, adapter, DTCs with descriptions, readiness, freeze frame, per-signal metadata and statistics, and the full time series. |
| \`samples_long.csv\` | Every reading, one per row: \`t_ms, iso_time, signal, value, unit\`. Lossless. |
| \`timeline.csv\` | All signals aligned on a 0.5 s grid (latest value, blank if stale). Convenient for correlation and spreadsheets. |
| \`adapter_log.txt\` | (If present) raw ELM327 commands and answers — for troubleshooting the connection, not for vehicle analysis. |

## Conventions
- Values are in base units: km/h, °C, kPa, g/s, L/h, V, %, rpm, λ (lambda), s, km.
- \`t_ms\` is milliseconds since the start of the recording. Signals are polled round-robin, so they are **not**
  sampled at the same instants; fast signals (rpm, speed, load) update more often than slow ones (temperatures).
- \`markers\` are moments the driver flagged, often with a note describing a symptom. \`valuesAtMarker\` gives the
  latest reading of each signal at that moment.
- \`connectionEvents\` explain gaps (adapter link paused/resumed).
- Fuel trims: positive = ECU adding fuel (lean condition), negative = removing fuel (rich). |STFT+LTFT| > 10 % is notable.
- \`findings\` are conservative rule-based observations, not a diagnosis.
${d.snapshot.demo ? '\n> **Note:** this pack was generated in demo mode from a simulated vehicle.\n' : ''}
## Suggested prompt
"Here is OBD-II data from my car (Shindan data pack). Read README.md and summary.md, then analyse session.json.
Explain any fault codes, check whether sensor values are plausible and consistent with each other, relate the
markers to the data, and list the most likely causes and what to check first."
`;
}

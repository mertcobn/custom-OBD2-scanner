import { jsPDF } from 'jspdf';
import i18n from '@/i18n';
import { describeDtc } from '@/data/dtc';
import { SIGNAL_BY_ID, type SignalDef } from '@/obd/signals';
import type { Language } from '@/state/settings';
import { convert, formatNumber, unitLabel, type UnitPrefs } from '@/units/units';
import sansUrl from '@/assets/fonts/NotoSans_400Regular.ttf?url';
import sansBoldUrl from '@/assets/fonts/NotoSans_700Bold.ttf?url';
import serifUrl from '@/assets/fonts/NotoSerif_600SemiBold.ttf?url';
import monoUrl from '@/assets/fonts/JetBrainsMono_400Regular.ttf?url';
import type { Dataset, SignalSeries } from './dataset';
import { findingTexts } from './formats';
import { monitorName, testName } from '@/obd/protocol/mode06';

type RGB = [number, number, number];
const C = {
  ink: [30, 28, 26] as RGB,
  muted: [107, 101, 92] as RGB,
  faint: [163, 155, 142] as RGB,
  line: [228, 220, 205] as RGB,
  paper: [246, 241, 231] as RGB,
  sakura: [185, 86, 111] as RGB,
  beni: [184, 52, 47] as RGB,
  matcha: [95, 112, 50] as RGB,
  kin: [154, 116, 38] as RGB,
  ai: [45, 74, 99] as RGB,
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16; // margin
const CONTENT_W = PAGE_W - 2 * M;

async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function registerFonts(doc: jsPDF) {
  const fonts: [string, string, string, string][] = [
    [sansUrl, 'NotoSans-Regular.ttf', 'Sans', 'normal'],
    [sansBoldUrl, 'NotoSans-Bold.ttf', 'Sans', 'bold'],
    [serifUrl, 'NotoSerif-SemiBold.ttf', 'Serif', 'bold'],
    [monoUrl, 'JetBrainsMono.ttf', 'Mono', 'normal'],
  ];
  const data = await Promise.all(fonts.map(([url]) => fontBase64(url)));
  fonts.forEach(([, file, family, style], i) => {
    doc.addFileToVFS(file, data[i]!);
    doc.addFont(file, family, style);
  });
}

/** Draw the hanko seal with the system's Japanese font via canvas (falls back to a plain seal). */
function hankoImage(): string | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.translate(80, 80);
    ctx.rotate((-6 * Math.PI) / 180);
    ctx.fillStyle = '#b8342f';
    const r = 40;
    ctx.beginPath();
    ctx.roundRect(-66, -66, 132, 132, r);
    ctx.fill();
    ctx.fillStyle = '#fbf3ea';
    ctx.font = 'bold 84px "Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP","Noto Serif JP",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('診', 0, 4);
    return c.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

export interface PdfOptions {
  lang: Language;
  units: UnitPrefs;
}

export async function buildPdf(d: Dataset, { lang, units }: PdfOptions): Promise<Blob> {
  const t = i18n.getFixedT(lang);
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await registerFonts(doc);
  doc.setProperties({ title: t('report.title'), creator: 'Shindan', subject: 'OBD-II diagnosis' });

  const snap = d.snapshot;
  let y = M;

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (family: 'Sans' | 'Serif' | 'Mono', style: 'normal' | 'bold' = 'normal', size = 10) => {
    doc.setFont(family, family === 'Serif' ? 'bold' : family === 'Mono' ? 'normal' : style);
    doc.setFontSize(size);
  };
  const stroke = (c: RGB, w = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(w);
  };
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);

  const header = () => {
    font('Serif', 'bold', 9);
    color(C.ink);
    doc.text('Shindan', M, 10);
    font('Sans', 'normal', 7.5);
    color(C.muted);
    const right = [snap.vehicle?.vin, new Date(d.generatedAt).toLocaleDateString(locale)].filter(Boolean).join('  ·  ');
    doc.text(right, PAGE_W - M, 10, { align: 'right' });
    stroke(C.line);
    doc.line(M, 12.5, PAGE_W - M, 12.5);
  };

  const newPage = () => {
    doc.addPage();
    header();
    y = 20;
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - 18) newPage();
  };

  const section = (title: string) => {
    ensure(16);
    y += 4;
    fill(C.sakura);
    doc.rect(M, y - 3.6, 1.2, 4.6, 'F');
    font('Serif', 'bold', 13);
    color(C.ink);
    doc.text(title, M + 4, y);
    y += 6;
  };

  const paragraph = (text: string, size = 9.5, c: RGB = C.ink, indent = 0) => {
    font('Sans', 'normal', size);
    color(c);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent) as string[];
    const lh = size * 0.42;
    ensure(lines.length * lh + 1);
    doc.text(lines, M + indent, y);
    y += lines.length * lh + 1.5;
  };

  const display = (def: SignalDef, v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    const c = convert(v, def.quantity, units);
    return formatNumber(c.value, c.digits ?? def.digits, locale);
  };
  const unitOf = (def: SignalDef) => def.unit ?? unitLabel(def.quantity, units);

  // ── Cover ──
  header();
  y = 24;
  const seal = hankoImage();
  if (seal) doc.addImage(seal, 'PNG', PAGE_W - M - 18, y - 4, 18, 18);
  font('Serif', 'bold', 22);
  color(C.ink);
  doc.text(t('report.title'), M, y + 6, { maxWidth: CONTENT_W - 24 });
  y += 14;
  font('Sans', 'normal', 9.5);
  color(C.muted);
  doc.text(`${t('report.generated')}: ${new Date(d.generatedAt).toLocaleString(locale)}`, M, y);
  y += 5;
  if (snap.demo) {
    color(C.sakura);
    doc.text(t('report.demoNote'), M, y);
    y += 5;
  }
  y += 3;

  // Vehicle box
  const v = snap.vehicle;
  const rows: [string, string][] = [
    ['VIN', v?.vin ?? '—'],
    [t('vehicle.make'), [v?.make, v?.modelYear, v?.country].filter(Boolean).join(' · ') || '—'],
    [t('vehicle.protocol'), snap.protocol ?? '—'],
    [t('vehicle.adapter.name'), [snap.adapter?.name, snap.adapter?.elmVersion].filter(Boolean).join(' · ') || '—'],
    [t('vehicle.ecus'), v?.ecus.join(', ') || '—'],
    [t('vehicle.obdStandard'), v?.obdStandard ?? '—'],
  ];
  const boxH = rows.length * 6 + 6;
  fill(C.paper);
  doc.roundedRect(M, y, CONTENT_W, boxH, 3, 3, 'F');
  rows.forEach(([k, val], i) => {
    const ry = y + 7 + i * 6;
    font('Sans', 'normal', 8.5);
    color(C.muted);
    doc.text(k, M + 5, ry);
    font(k === 'VIN' ? 'Mono' : 'Sans', 'normal', 9.5);
    color(C.ink);
    doc.text(val, M + 48, ry, { maxWidth: CONTENT_W - 53 });
  });
  y += boxH + 6;

  // Status cards
  const stored = snap.dtcs.filter((x) => x.kind === 'stored').length;
  const incomplete = snap.monitor?.monitors.filter((m) => m.supported && !m.complete).length ?? 0;
  const cards: [string, string, RGB][] = [
    [snap.monitor?.mil ? t('dtc.milOn') : t('dtc.milOff'), 'MIL', snap.monitor?.mil ? C.beni : C.matcha],
    [String(snap.dtcs.length), `${t('nav.dtc')} (${stored} ${t('dtc.kinds.stored').toLowerCase()})`, snap.dtcs.length ? C.beni : C.matcha],
    [incomplete ? t('vehicle.readiness.notReady') : t('vehicle.readiness.ready'), t('vehicle.readiness.title'), incomplete ? C.kin : C.matcha],
  ];
  const cw = (CONTENT_W - 8) / 3;
  font('Sans', 'bold', 10.5);
  const bigLines = cards.map(([big]) => doc.splitTextToSize(big, cw - 8) as string[]);
  const cardH = 13 + Math.max(...bigLines.map((l) => l.length)) * 4.6;
  cards.forEach(([, small, c], i) => {
    const x = M + i * (cw + 4);
    stroke(C.line);
    doc.roundedRect(x, y, cw, cardH, 2.5, 2.5, 'S');
    fill(c);
    doc.rect(x, y + 3, 1.2, cardH - 6, 'F');
    font('Sans', 'bold', 10.5);
    color(c);
    doc.text(bigLines[i]!, x + 5, y + 7.5);
    font('Sans', 'normal', 8);
    color(C.muted);
    doc.text(small, x + 5, y + cardH - 4, { maxWidth: cw - 8 });
  });
  y += cardH + 6;

  // Findings
  section(t('report.findingsTitle'));
  for (const f of findingTexts(d, lang)) {
    const c = f.level === 'high' ? C.beni : f.level === 'medium' ? C.kin : C.ai;
    font('Sans', 'normal', 9.5);
    const lines = doc.splitTextToSize(f.text, CONTENT_W - 6) as string[];
    ensure(lines.length * 4.2 + 1.5);
    fill(c);
    doc.circle(M + 1.5, y - 1.2, 1.1, 'F');
    color(C.ink);
    doc.text(lines, M + 6, y);
    y += lines.length * 4.2 + 1.5;
  }

  // DTCs
  section(t('nav.dtc'));
  if (snap.dtcs.length === 0) paragraph(t('dtc.noneBody'), 9.5, C.muted);
  else {
    font('Sans', 'bold', 8);
    color(C.muted);
    doc.text(t('report.code'), M, y);
    doc.text(t('report.type'), M + 22, y);
    doc.text('ECU', M + 44, y);
    doc.text(t('report.description'), M + 58, y);
    y += 2;
    stroke(C.line);
    doc.line(M, y, PAGE_W - M, y);
    y += 4.5;
    for (const x of snap.dtcs) {
      const info = describeDtc(x.code, lang);
      font('Sans', 'normal', 9);
      const desc = doc.splitTextToSize(info.title || t('dtc.unknown'), CONTENT_W - 58) as string[];
      ensure(desc.length * 4 + 4);
      font('Mono', 'normal', 10);
      color(info.severity === 'high' ? C.beni : C.ink);
      doc.text(x.code, M, y);
      font('Sans', 'normal', 9);
      color(C.ink);
      doc.text(t(`dtc.kinds.${x.kind}`), M + 22, y);
      font('Mono', 'normal', 8.5);
      doc.text(x.ecu, M + 44, y);
      font('Sans', 'normal', 9);
      doc.text(desc, M + 58, y);
      y += desc.length * 4 + 2.5;
    }
  }

  // Freeze frame
  if (snap.freezeFrame) {
    section(`${t('dtc.freezeFrame')} · ${snap.freezeFrame.dtc}`);
    const entries = Object.entries(snap.freezeFrame.values).filter(([id]) => SIGNAL_BY_ID[id]);
    const colW = CONTENT_W / 4;
    entries.forEach(([id, val], i) => {
      const def = SIGNAL_BY_ID[id]!;
      if (i % 4 === 0) {
        if (i) y += 11;
        ensure(11);
      }
      const x = M + (i % 4) * colW;
      font('Sans', 'normal', 7.5);
      color(C.muted);
      doc.text(def.short[lang], x, y);
      font('Mono', 'normal', 10);
      color(C.ink);
      doc.text(`${display(def, val)} ${unitOf(def)}`, x, y + 5);
    });
    y += 13;
  }

  // On-board tests (Mode 06)
  if (snap.onboardTests?.length) {
    section(`${t('dtc.tests.title')} · Mode 06`);
    for (const x of snap.onboardTests) {
      const name = `${monitorName(x.mid)[lang]} — ${testName(x.mid, x.tid)[lang]}`;
      font('Sans', 'normal', 9);
      const lines = doc.splitTextToSize(name, CONTENT_W - 62) as string[];
      ensure(lines.length * 4 + 2);
      color(C.ink);
      doc.text(lines, M, y);
      font('Mono', 'normal', 8.5);
      color(x.pass ? C.ink : C.beni);
      doc.text(`${formatNumber(x.value, 3, locale).replace(/[.,]?0+$/, '')} ${x.unit}`, M + CONTENT_W - 36, y, { align: 'right' });
      color(C.muted);
      font('Mono', 'normal', 7.5);
      doc.text(`${x.min} … ${x.max}`, M + CONTENT_W - 34, y);
      font('Sans', 'bold', 8.5);
      color(x.pass ? C.matcha : C.beni);
      doc.text(x.pass ? t('dtc.tests.pass') : t('dtc.tests.fail'), PAGE_W - M, y, { align: 'right' });
      y += lines.length * 4 + 2;
    }
  }

  // Readiness
  if (snap.monitor) {
    section(t('vehicle.readiness.title'));
    const mons = snap.monitor.monitors.filter((m) => m.supported);
    const half = Math.ceil(mons.length / 2);
    ensure(half * 5 + 2);
    mons.forEach((m, i) => {
      const x = M + (i < half ? 0 : CONTENT_W / 2);
      const ry = y + (i % half) * 5;
      fill(m.complete ? C.matcha : C.kin);
      doc.circle(x + 1.2, ry - 1.1, 1, 'F');
      font('Sans', 'normal', 9);
      color(C.ink);
      doc.text(t(`monitors.${m.id}`), x + 4.5, ry);
      color(m.complete ? C.matcha : C.kin);
      doc.text(m.complete ? t('vehicle.readiness.complete') : t('vehicle.readiness.incomplete'), x + CONTENT_W / 2 - 6, ry, { align: 'right' });
    });
    y += half * 5 + 2;
  }

  // Recording
  if (d.kind === 'recording' && d.meta) {
    newPage();
    section(t('report.recording'));
    const dur = Math.round((d.endedAt - d.startedAt) / 1000);
    paragraph(
      [
        `${t('record.duration')}: ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
        `${t('record.samples')}: ${formatNumber(d.series.reduce((a, s) => a + s.v.length, 0), 0, locale)}`,
        `${t('report.preset')}: ${t(`record.presets.${d.meta.config.preset}.title`)}`,
        new Date(d.startedAt).toLocaleString(locale),
      ].join('   ·   '),
      9.5,
      C.muted,
    );

    // Stats table
    section(t('report.statsTitle'));
    const cols = [M, M + 70, M + 92, M + 114, M + 136, M + 158];
    font('Sans', 'bold', 8);
    color(C.muted);
    [t('record.signal'), t('report.unit'), t('stats.min'), t('stats.mean'), t('stats.max'), 'n'].forEach((h, i) =>
      doc.text(h, i < 2 ? cols[i]! : cols[i]! + 18, y, { align: i < 2 ? 'left' : 'right' }),
    );
    y += 2;
    stroke(C.line);
    doc.line(M, y, PAGE_W - M, y);
    y += 4.5;
    for (const s of d.series) {
      ensure(5.5);
      font('Sans', 'normal', 9);
      color(C.ink);
      doc.text(s.def.name[lang], cols[0]!, y, { maxWidth: 68 });
      color(C.muted);
      doc.text(unitOf(s.def), cols[1]!, y);
      font('Mono', 'normal', 9);
      color(C.ink);
      [s.stats?.min, s.stats?.mean, s.stats?.max].forEach((val, i) => doc.text(display(s.def, val), cols[i + 2]! + 18, y, { align: 'right' }));
      color(C.muted);
      doc.text(String(s.stats?.count ?? 0), cols[5]! + 18, y, { align: 'right' });
      y += 5.5;
    }

    // Charts
    section(t('report.charts'));
    for (const s of d.series.filter((x) => x.v.length > 1)) drawChart(s);

    if (d.meta.markers.length) {
      section(t('record.markers'));
      for (const m of d.meta.markers) {
        const sec = Math.round(m.t / 1000);
        paragraph(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} — ${m.note ?? t('record.noNote')}`, 9.5);
      }
    }
  }

  // Appendix
  section(t('report.appendix'));
  font('Sans', 'bold', 9);
  color(C.ink);
  ensure(6);
  doc.text(t('report.supported'), M, y);
  y += 4.5;
  paragraph(snap.supported.map((id) => SIGNAL_BY_ID[id]?.short[lang] ?? id).join(', '), 8.5, C.muted);
  y += 1;
  font('Sans', 'bold', 9);
  color(C.ink);
  ensure(6);
  doc.text(t('report.glossaryTitle'), M, y);
  y += 4.5;
  for (const k of ['mil', 'dtc', 'trims', 'maf', 'readiness', 'freeze']) paragraph(t(`report.glossary.${k}`), 8.5, C.muted);
  y += 2;
  paragraph(t('report.disclaimer'), 8, C.faint);

  // Footer with page numbers
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    font('Sans', 'normal', 7.5);
    color(C.faint);
    doc.text(t('report.page', { n, total }), PAGE_W - M, PAGE_H - 8, { align: 'right' });
    doc.text('shindan · OBD-II', M, PAGE_H - 8);
  }
  return doc.output('blob');

  function drawChart(s: SignalSeries) {
    const h = 34;
    ensure(h + 10);
    const x0 = M + 12;
    const w = CONTENT_W - 12;
    const top = y + 4;
    font('Sans', 'bold', 9);
    color(C.ink);
    doc.text(`${s.def.name[lang]}`, M, y);
    font('Sans', 'normal', 8);
    color(C.muted);
    doc.text(unitOf(s.def), PAGE_W - M, y, { align: 'right' });

    const vals = s.v.map((val) => convert(val, s.def.quantity, units).value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    // Shared time axis for every chart so markers line up vertically across signals.
    const tMax = Math.max(1, d.endedAt - d.startedAt, s.t[s.t.length - 1]!);
    const px = (tm: number) => x0 + (tm / tMax) * w;
    const py = (val: number) => top + h - ((val - lo) / (hi - lo)) * h;

    stroke(C.line, 0.15);
    doc.rect(x0, top, w, h, 'S');
    for (const f of [0.25, 0.5, 0.75]) doc.line(x0, top + h * f, x0 + w, top + h * f);
    font('Mono', 'normal', 6.5);
    color(C.faint);
    const axisDigits = Math.min(3, s.def.digits + (hi - lo < 10 ? 1 : 0));
    doc.text(formatNumber(hi, axisDigits, locale), x0 - 1, top + 2, { align: 'right' });
    doc.text(formatNumber(lo, axisDigits, locale), x0 - 1, top + h, { align: 'right' });
    const mm = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    doc.text('0:00', x0, top + h + 3.5);
    doc.text(mm(tMax), x0 + w, top + h + 3.5, { align: 'right' });

    // Markers
    doc.setLineDashPattern([0.8, 0.8], 0);
    stroke(C.beni, 0.25);
    for (const m of d.meta?.markers ?? []) if (m.t <= tMax) doc.line(px(m.t), top, px(m.t), top + h);
    doc.setLineDashPattern([], 0);

    // Down-sample to ~2 points per 0.5 mm column (min/max per bucket) to keep the PDF small.
    const buckets = Math.min(vals.length, 360);
    const pts: [number, number][] = [];
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor((b * vals.length) / buckets);
      const to = Math.max(from + 1, Math.floor(((b + 1) * vals.length) / buckets));
      let iMin = from;
      let iMax = from;
      for (let i = from; i < to; i++) {
        if (vals[i]! < vals[iMin]!) iMin = i;
        if (vals[i]! > vals[iMax]!) iMax = i;
      }
      for (const i of iMin < iMax ? [iMin, iMax] : [iMax, iMin]) pts.push([px(s.t[i]!), py(vals[i]!)]);
    }
    stroke(C.ai, 0.35);
    const segs: [number, number][] = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]]);
    if (pts.length > 1) doc.lines(segs, pts[0]![0], pts[0]![1], [1, 1], 'S', false);
    y = top + h + 9;
  }
}

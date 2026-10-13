import type { Localized } from '@/obd/signals';
import type { EcuMessage } from './frames';

/**
 * Mode 06 — on-board monitoring test results (ISO 15765-4 / CAN format, SAE J1979 Appendix D/E).
 *
 * Response payload: 46 MID { TID UASID V(2) MIN(2) MAX(2) } × n
 * A test passes when MIN ≤ value ≤ MAX. The values are what the engine computer actually measured
 * during its self-tests (catalyst efficiency, O2 sensor switch times, misfire counts…).
 */

export interface OnboardTest {
  /** Monitor ID, e.g. 0x21 = catalyst bank 1 */
  mid: number;
  /** Test ID within the monitor */
  tid: number;
  ecu: string;
  /** Scaled values (unit below) */
  value: number;
  min: number;
  max: number;
  unit: string;
  pass: boolean;
  /** Raw words, for exports and auditing */
  raw: { uasid: number; value: number; min: number; max: number };
}

interface Scale {
  unit: string;
  factor: number;
  offset?: number;
  signed?: boolean;
}

/** Unit and Scaling IDs (UASID). Unsigned 0x01–0x7F, signed 0x81–0xFE. */
const UASID: Record<number, Scale> = {
  0x01: { unit: '', factor: 1 },
  0x02: { unit: '', factor: 0.1 },
  0x03: { unit: '', factor: 0.01 },
  0x04: { unit: '', factor: 0.001 },
  0x05: { unit: '', factor: 0.0000305 },
  0x06: { unit: '', factor: 0.000305 },
  0x07: { unit: 'rpm', factor: 0.25 },
  0x08: { unit: 'km/h', factor: 0.01 },
  0x09: { unit: 'km/h', factor: 1 },
  0x0a: { unit: 'mV', factor: 0.122 },
  0x0b: { unit: 'V', factor: 0.001 },
  0x0c: { unit: 'V', factor: 0.01 },
  0x0d: { unit: 'mA', factor: 0.00390625 },
  0x0e: { unit: 'A', factor: 0.001 },
  0x0f: { unit: 'A', factor: 0.01 },
  0x10: { unit: 'ms', factor: 1 },
  0x11: { unit: 'ms', factor: 100 },
  0x12: { unit: 's', factor: 1 },
  0x13: { unit: 'mΩ', factor: 1 },
  0x14: { unit: 'Ω', factor: 1 },
  0x15: { unit: 'kΩ', factor: 1 },
  0x16: { unit: '°C', factor: 0.1, offset: -40 },
  0x17: { unit: 'kPa', factor: 0.01 },
  0x18: { unit: 'kPa', factor: 0.0117 },
  0x19: { unit: 'kPa', factor: 0.079 },
  0x1a: { unit: 'kPa', factor: 1 },
  0x1b: { unit: 'kPa', factor: 10 },
  0x1c: { unit: '°', factor: 0.01 },
  0x1d: { unit: '°', factor: 0.5 },
  0x1e: { unit: 'λ', factor: 0.0000305 },
  0x1f: { unit: 'A/F', factor: 0.05 },
  0x20: { unit: '', factor: 0.0039062 },
  0x21: { unit: 'mHz', factor: 1 },
  0x22: { unit: 'Hz', factor: 1 },
  0x23: { unit: 'kHz', factor: 1 },
  0x24: { unit: '', factor: 1 }, // counts
  0x25: { unit: 'km', factor: 1 },
  0x26: { unit: 'mV/ms', factor: 0.1 },
  0x27: { unit: 'g/s', factor: 0.01 },
  0x28: { unit: 'g/s', factor: 1 },
  0x29: { unit: 'Pa/s', factor: 0.25 },
  0x2a: { unit: 'kg/h', factor: 0.001 },
  0x2b: { unit: '', factor: 1 }, // switches
  0x2c: { unit: 'g/cyl', factor: 0.01 },
  0x2d: { unit: 'mg/stroke', factor: 0.01 },
  0x2e: { unit: '', factor: 1 }, // boolean
  0x2f: { unit: '%', factor: 0.01 },
  0x30: { unit: '%', factor: 0.001526 },
  0x31: { unit: 'L', factor: 0.001 },
  0x32: { unit: 'in', factor: 0.0000305 },
  0x33: { unit: '', factor: 0.00024414 },
  0x34: { unit: 'min', factor: 1 },
  0x35: { unit: 'ms', factor: 10 },
  0x36: { unit: 'g', factor: 0.01 },
  0x37: { unit: 'g', factor: 0.1 },
  0x38: { unit: 'g', factor: 1 },
  0x39: { unit: '%', factor: 0.01, offset: -327.68 },
  0x3a: { unit: 'g', factor: 0.001 },
  0x3b: { unit: 'g', factor: 0.0001 },
  0x3c: { unit: 'µs', factor: 0.1 },
  0x3d: { unit: 'mA', factor: 0.01 },
  0x3e: { unit: 'mm²', factor: 0.00006103516 },
  0x3f: { unit: 'L', factor: 0.01 },
  0x40: { unit: 'ppm', factor: 1 },
  0x41: { unit: 'µA', factor: 0.01 },
  0x81: { unit: '', factor: 1, signed: true },
  0x82: { unit: '', factor: 0.1, signed: true },
  0x83: { unit: '', factor: 0.01, signed: true },
  0x84: { unit: '', factor: 0.001, signed: true },
  0x85: { unit: '', factor: 0.0000305, signed: true },
  0x86: { unit: '', factor: 0.000305, signed: true },
  0x8a: { unit: 'mV', factor: 0.122, signed: true },
  0x8b: { unit: 'V', factor: 0.001, signed: true },
  0x8c: { unit: 'V', factor: 0.01, signed: true },
  0x8d: { unit: 'mA', factor: 0.00390625, signed: true },
  0x8e: { unit: 'A', factor: 0.001, signed: true },
  0x90: { unit: 'ms', factor: 1, signed: true },
  0x96: { unit: '°C', factor: 0.1, signed: true },
  0x9c: { unit: '°', factor: 0.01, signed: true },
  0x9d: { unit: '°', factor: 0.5, signed: true },
  0xa8: { unit: 'g/s', factor: 1, signed: true },
  0xa9: { unit: 'Pa/s', factor: 0.25, signed: true },
  0xad: { unit: 'mg/stroke', factor: 0.01, signed: true },
  0xae: { unit: 'mg/stroke', factor: 0.1, signed: true },
  0xaf: { unit: '%', factor: 0.01, signed: true },
  0xb0: { unit: '%', factor: 0.003052, signed: true },
  0xb1: { unit: 'mV/s', factor: 2, signed: true },
  0xfc: { unit: 'kPa', factor: 0.01, signed: true },
  0xfd: { unit: 'kPa', factor: 0.001, signed: true },
  0xfe: { unit: 'Pa', factor: 0.25, signed: true },
};

export function scaleValue(uasid: number, raw: number): { value: number; unit: string; known: boolean } {
  const s = UASID[uasid];
  if (!s) return { value: raw, unit: '', known: false };
  const v = s.signed && raw >= 0x8000 ? raw - 0x10000 : raw;
  const value = v * s.factor + (s.offset ?? 0);
  // Round away float noise while keeping the scale's resolution.
  const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(s.factor)) + 1));
  return { value: Number(value.toFixed(digits)), unit: s.unit, known: true };
}

/** Decode one Mode 06 response (CAN format) into individual tests. */
export function decodeMode06(messages: EcuMessage[], mid: number): OnboardTest[] {
  const out: OnboardTest[] = [];
  for (const m of messages) {
    if (m.data[0] !== 0x46 || m.data[1] !== mid) continue;
    const body = m.data.slice(2);
    for (let i = 0; i + 8 <= body.length; i += 8) {
      const [tid, uasid, v1, v2, n1, n2, x1, x2] = body.slice(i, i + 8) as [number, number, number, number, number, number, number, number];
      const rv = (v1 << 8) | v2;
      const rn = (n1 << 8) | n2;
      const rx = (x1 << 8) | x2;
      const value = scaleValue(uasid, rv);
      const min = scaleValue(uasid, rn).value;
      const max = scaleValue(uasid, rx).value;
      out.push({
        mid,
        tid,
        ecu: m.ecu,
        value: value.value,
        min,
        max,
        unit: value.unit,
        pass: value.value >= min && value.value <= max,
        raw: { uasid, value: rv, min: rn, max: rx },
      });
    }
  }
  return out;
}

// ── Names ────────────────────────────────────────────────────────────────

const L = (tr: string, en: string): Localized => ({ tr, en });

function sensorName(mid: number, base: number, perBank: number, tr: string, en: string): Localized | undefined {
  const i = mid - base;
  if (i < 0 || i >= perBank * 4) return undefined;
  const bank = Math.floor(i / perBank) + 1;
  const sensor = (i % perBank) + 1;
  return L(`${tr} (Banka ${bank} Sensör ${sensor})`, `${en} (Bank ${bank} Sensor ${sensor})`);
}

function bankName(mid: number, base: number, count: number, tr: string, en: string): Localized | undefined {
  const i = mid - base;
  if (i < 0 || i >= count) return undefined;
  return L(`${tr} (Banka ${i + 1})`, `${en} (Bank ${i + 1})`);
}

/** Monitor ID → human name. */
export function monitorName(mid: number): Localized {
  return (
    sensorName(mid, 0x01, 4, 'O2 sensörü', 'O2 sensor') ??
    bankName(mid, 0x21, 4, 'Katalizör', 'Catalyst') ??
    bankName(mid, 0x31, 4, 'EGR', 'EGR') ??
    bankName(mid, 0x35, 4, 'VVT', 'VVT') ??
    (mid === 0x39 ? L('EVAP kaçak testi (1,0 mm)', 'EVAP leak (0.040")') : undefined) ??
    (mid === 0x3a ? L('EVAP kaçak testi (2,3 mm)', 'EVAP leak (0.090")') : undefined) ??
    (mid === 0x3b ? L('EVAP kaçak testi (1,0 mm)', 'EVAP leak (0.040")') : undefined) ??
    (mid === 0x3c ? L('EVAP kaçak testi (0,5 mm)', 'EVAP leak (0.020")') : undefined) ??
    (mid === 0x3d ? L('EVAP tahliye akışı', 'Purge flow') : undefined) ??
    sensorName(mid, 0x41, 4, 'O2 sensörü ısıtıcısı', 'O2 sensor heater') ??
    bankName(mid, 0x61, 4, 'Isıtmalı katalizör', 'Heated catalyst') ??
    bankName(mid, 0x71, 4, 'İkincil hava', 'Secondary air') ??
    bankName(mid, 0x81, 4, 'Yakıt sistemi', 'Fuel system') ??
    bankName(mid, 0x85, 2, 'Turbo basınç kontrolü', 'Boost pressure control') ??
    bankName(mid, 0x90, 2, 'NOx adsorber', 'NOx adsorber') ??
    bankName(mid, 0x98, 2, 'NOx / SCR katalizörü', 'NOx / SCR catalyst') ??
    (mid === 0xa1 ? L('Tekleme (genel)', 'Misfire (general)') : undefined) ??
    (mid >= 0xa2 && mid <= 0xad ? L(`Tekleme — ${mid - 0xa1}. silindir`, `Misfire — cylinder ${mid - 0xa1}`) : undefined) ??
    bankName(mid, 0xb0, 2, 'Partikül filtresi', 'Particulate filter') ??
    L(`Monitör ${hex(mid)}`, `Monitor ${hex(mid)}`)
  );
}

const O2_TIDS: Record<number, Localized> = {
  0x01: L('Zenginden fakire eşik voltajı', 'Rich-to-lean threshold voltage'),
  0x02: L('Fakirden zengine eşik voltajı', 'Lean-to-rich threshold voltage'),
  0x03: L('Geçiş süresi için düşük voltaj', 'Low voltage for switch time'),
  0x04: L('Geçiş süresi için yüksek voltaj', 'High voltage for switch time'),
  0x05: L('Zenginden fakire geçiş süresi', 'Rich-to-lean switch time'),
  0x06: L('Fakirden zengine geçiş süresi', 'Lean-to-rich switch time'),
  0x07: L('En düşük sensör voltajı', 'Minimum sensor voltage'),
  0x08: L('En yüksek sensör voltajı', 'Maximum sensor voltage'),
  0x09: L('Geçişler arası süre', 'Time between transitions'),
  0x0a: L('Sensör periyodu', 'Sensor period'),
};

/** Test ID → name. Standard TIDs are named; 0x80+ are manufacturer-defined. */
export function testName(mid: number, tid: number): Localized {
  if (mid >= 0xa1 && mid <= 0xad) {
    if (tid === 0x0b) return L('Tekleme sayısı (son 10 sürüş ortalaması)', 'Misfire count (EWMA, last 10 drive cycles)');
    if (tid === 0x0c) return L('Tekleme sayısı (son/şu anki sürüş)', 'Misfire count (last/current drive cycle)');
  }
  if (mid >= 0x01 && mid <= 0x10 && O2_TIDS[tid]) return O2_TIDS[tid]!;
  if (tid >= 0x80) return L(`Üretici testi ${hex(tid)}`, `Manufacturer test ${hex(tid)}`);
  return L(`Test ${hex(tid)}`, `Test ${hex(tid)}`);
}

const hex = (n: number) => `$${n.toString(16).toUpperCase().padStart(2, '0')}`;

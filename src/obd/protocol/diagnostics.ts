import type { Dtc, DtcKind, MonitorId, MonitorStatus, ReadinessMonitor } from '@/obd/types';
import type { EcuMessage, FrameFormat } from './frames';

// ── DTCs (Mode 03 / 07 / 0A) ─────────────────────────────────────────────

/** Two bytes → "P0301" per SAE J2012. */
export function decodeDtc(hi: number, lo: number): string {
  const system = 'PCBU'[hi >> 6]!;
  const d1 = (hi >> 4) & 0x03;
  const rest = ((hi & 0x0f) << 8) | lo;
  return `${system}${d1}${rest.toString(16).toUpperCase().padStart(3, '0')}`;
}

/**
 * Decode DTC responses. CAN responses carry a count byte after the service byte
 * ([43, n, hi, lo, …]); legacy protocols don't and pad with 00 00.
 */
export function decodeDtcMessages(messages: EcuMessage[], service: number, kind: DtcKind, format: FrameFormat): Dtc[] {
  const out: Dtc[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    if (m.data[0] !== service) continue;
    const pairs = format === 'legacy' ? m.data.slice(1) : m.data.slice(2);
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const hi = pairs[i]!;
      const lo = pairs[i + 1]!;
      if (hi === 0 && lo === 0) continue;
      const code = decodeDtc(hi, lo);
      const key = `${m.ecu}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code, kind, ecu: m.ecu });
    }
  }
  return out;
}

// ── Monitor status (Mode 01 PID 01) ─────────────────────────────────────

const CONTINUOUS: MonitorId[] = ['misfire', 'fuelSystem', 'components'];
const SPARK: MonitorId[] = ['catalyst', 'heatedCatalyst', 'evap', 'secondaryAir', 'acRefrigerant', 'o2Sensor', 'o2Heater', 'egr'];
// Bits 2 and 4 are reserved for compression ignition.
const COMPRESSION: (MonitorId | undefined)[] = ['nmhcCatalyst', 'noxScr', undefined, 'boostPressure', undefined, 'exhaustGas', 'pmFilter', 'egr'];

export function decodeMonitorStatus(d: number[]): MonitorStatus {
  const [a = 0, b = 0, c = 0, dd = 0] = d;
  const ignition = b & 0x08 ? 'compression' : 'spark';
  const monitors: ReadinessMonitor[] = [];
  CONTINUOUS.forEach((id, i) => monitors.push({ id, supported: !!(b & (1 << i)), complete: !(b & (1 << (i + 4))) }));
  const table = ignition === 'spark' ? SPARK : COMPRESSION;
  table.forEach((id, i) => {
    if (id) monitors.push({ id, supported: !!(c & (1 << i)), complete: !(dd & (1 << i)) });
  });
  return { mil: !!(a & 0x80), dtcCount: a & 0x7f, ignition, monitors };
}

// ── Vehicle information (Mode 09) ───────────────────────────────────────

const printable = (bytes: number[]) =>
  String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f))
    .trim();

/** Collect the payload after "49 PID" from CAN (one message) or legacy (one message per line, with sequence byte). */
function mode09Payload(messages: EcuMessage[], pid: number, format: FrameFormat): number[] {
  const own = messages.filter((m) => m.data[0] === 0x49 && m.data[1] === pid);
  if (own.length === 0) return [];
  if (format === 'legacy') {
    return own
      .slice()
      .sort((x, y) => (x.data[2] ?? 0) - (y.data[2] ?? 0))
      .flatMap((m) => m.data.slice(3));
  }
  // CAN: 49 PID count …
  return own[0]!.data.slice(3);
}

export function decodeVin(messages: EcuMessage[], format: FrameFormat): string | undefined {
  const vin = printable(mode09Payload(messages, 0x02, format)).replace(/[^A-HJ-NPR-Z0-9]/gi, '');
  const v = vin.slice(-17);
  return v.length === 17 ? v.toUpperCase() : undefined;
}

export function decodeCalibrationIds(messages: EcuMessage[], format: FrameFormat): string[] {
  const payload = mode09Payload(messages, 0x04, format);
  const out: string[] = [];
  for (let i = 0; i + 16 <= payload.length; i += 16) {
    const id = printable(payload.slice(i, i + 16).map((b) => (b === 0 ? 0x20 : b)));
    if (id) out.push(id);
  }
  return out;
}

export function decodeEcuName(messages: EcuMessage[], format: FrameFormat): string | undefined {
  return printable(mode09Payload(messages, 0x0a, format).map((b) => (b === 0 ? 0x20 : b))) || undefined;
}

// ── VIN decoding (WMI + model year) ─────────────────────────────────────

const WMI: Record<string, string> = {
  JT: 'Toyota', JN: 'Nissan', JH: 'Honda', JM: 'Mazda', JF: 'Subaru', JS: 'Suzuki', JA: 'Mitsubishi', JY: 'Yamaha',
  KM: 'Hyundai', KN: 'Kia', KL: 'Daewoo / GM Korea', KP: 'SsangYong',
  WVW: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', WAU: 'Audi', WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz', W1K: 'Mercedes-Benz', WP0: 'Porsche', WP1: 'Porsche',
  WF0: 'Ford Germany', W0L: 'Opel', W0V: 'Opel', WME: 'smart', TMB: 'Škoda', TMA: 'Hyundai Czech', TRU: 'Audi Hungary',
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën', VR3: 'Peugeot', VR7: 'Citroën', VSS: 'SEAT', VSK: 'Nissan Spain',
  UU1: 'Dacia', ZFA: 'Fiat', ZFF: 'Ferrari', ZAR: 'Alfa Romeo', ZHW: 'Lamborghini', ZLA: 'Lancia',
  SAJ: 'Jaguar', SAL: 'Land Rover', SCC: 'Lotus', SCF: 'Aston Martin', SB1: 'Toyota UK', SJN: 'Nissan UK',
  YV1: 'Volvo', YS3: 'Saab', NMT: 'Toyota Türkiye', NM0: 'Ford Otosan', NM4: 'Tofaş (Fiat)', NLH: 'Hyundai Assan',
  NLA: 'Honda Türkiye', NMA: 'MAN Türkiye', NL1: 'TOGG', VNK: 'Toyota France', MAL: 'Hyundai India', MA3: 'Suzuki India',
  LSV: 'SAIC Volkswagen', LFV: 'FAW-Volkswagen', LVS: 'Ford China', LRW: 'Tesla China', LGB: 'Dongfeng Nissan',
  '1G': 'General Motors', '1F': 'Ford', '1C': 'Chrysler', '1H': 'Honda USA', '1N': 'Nissan USA', '2T': 'Toyota Canada',
  '3VW': 'Volkswagen Mexico', '5YJ': 'Tesla', '4T': 'Toyota USA', '5T': 'Toyota USA',
};

const COUNTRY: [RegExp, string][] = [
  [/^J/, 'Japan'], [/^K[L-R]/, 'South Korea'], [/^L/, 'China'], [/^M[A-E]/, 'India'], [/^N[L-R]/, 'Türkiye'],
  [/^S[A-M]/, 'United Kingdom'], [/^T[J-P]/, 'Czechia'], [/^TR|^TS/, 'Hungary'], [/^V[F-R]/, 'France'], [/^V[S-W]/, 'Spain'],
  [/^U[U-Z]/, 'Romania'], [/^W/, 'Germany'], [/^Y[S-W]/, 'Sweden'], [/^Z[A-R]/, 'Italy'], [/^[1-5]/, 'North America'],
  [/^9[A-E]/, 'Brazil'], [/^6/, 'Australia'],
];

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/** Model year from the 10th character. The code repeats every 30 years; pick the latest year not in the future. */
export function decodeModelYear(vin: string, now = new Date()): number | undefined {
  const idx = YEAR_CODES.indexOf(vin[9]?.toUpperCase() ?? '');
  if (idx < 0) return undefined;
  const maxYear = now.getFullYear() + 1;
  let year = 1980 + idx;
  while (year + 30 <= maxYear) year += 30;
  return year;
}

export function decodeVinInfo(vin: string): { make?: string; country?: string; modelYear?: number } {
  const make = WMI[vin.slice(0, 3)] ?? WMI[vin.slice(0, 2)];
  const country = COUNTRY.find(([re]) => re.test(vin))?.[1];
  return { make, country, modelYear: decodeModelYear(vin) };
}

// ── Misc Mode 01 enumerations ───────────────────────────────────────────

const OBD_STANDARDS: Record<number, string> = {
  1: 'OBD-II (CARB)', 2: 'OBD (EPA)', 3: 'OBD and OBD-II', 4: 'OBD-I', 5: 'Not OBD compliant', 6: 'EOBD (Europe)',
  7: 'EOBD and OBD-II', 8: 'EOBD and OBD', 9: 'EOBD, OBD and OBD-II', 10: 'JOBD (Japan)', 11: 'JOBD and OBD-II',
  12: 'JOBD and EOBD', 13: 'JOBD, EOBD and OBD-II', 17: 'EMD', 18: 'EMD+', 19: 'HD OBD-C', 20: 'HD OBD',
  21: 'WWH OBD', 23: 'HD EOBD-I', 24: 'HD EOBD-I N', 25: 'HD EOBD-II', 26: 'HD EOBD-II N', 28: 'OBDBr-1',
  29: 'OBDBr-2', 30: 'KOBD (Korea)', 31: 'IOBD I (India)', 32: 'IOBD II (India)', 33: 'HD EOBD-IV',
};

export function decodeObdStandard(a: number | undefined): string | undefined {
  return a === undefined ? undefined : (OBD_STANDARDS[a] ?? `Code ${a}`);
}

const FUEL_TYPES: Record<number, string> = {
  1: 'gasoline', 2: 'methanol', 3: 'ethanol', 4: 'diesel', 5: 'lpg', 6: 'cng', 7: 'propane', 8: 'electric',
  9: 'bifuelGasoline', 10: 'bifuelMethanol', 11: 'bifuelEthanol', 12: 'bifuelLpg', 13: 'bifuelCng', 14: 'bifuelPropane',
  15: 'bifuelElectric', 16: 'bifuelElectricCombustion', 17: 'hybridGasoline', 18: 'hybridEthanol', 19: 'hybridDiesel',
  20: 'hybridElectric', 21: 'hybridElectricCombustion', 22: 'hybridRegenerative', 23: 'bifuelDiesel',
};

export function decodeFuelType(a: number | undefined): string | undefined {
  return a === undefined || a === 0 ? undefined : (FUEL_TYPES[a] ?? `code${a}`);
}

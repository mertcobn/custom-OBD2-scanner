import type { Quantity } from '@/units/units';

/**
 * Catalogue of standard SAE J1979 Mode 01 signals.
 * One PID may yield more than one signal (e.g. O2 sensor voltage + trim), so signals have
 * their own stable `id`; that id is what the UI, recorder and exports use.
 */

export type SignalCategory =
  | 'engine'
  | 'fuel'
  | 'air'
  | 'emissions'
  | 'temperature'
  | 'electrical'
  | 'distance';

export type PollTier = 'fast' | 'medium' | 'slow';

export interface Localized {
  tr: string;
  en: string;
}

export interface SignalDef {
  id: string;
  /** 'elm' = adapter-level reading (ATRV), not an OBD request */
  source: 'obd' | 'elm';
  mode: 0x01;
  pid: number;
  /** Data bytes expected after the "41 xx" header. */
  bytes: number;
  quantity: Quantity;
  /** Unit label for quantity 'none'/'count' signals that still have a unit (e.g. min). */
  unit?: string;
  min: number;
  max: number;
  /** Fraction digits shown in base unit. */
  digits: number;
  category: SignalCategory;
  tier: PollTier;
  name: Localized;
  short: Localized;
  /** Formula as text — exported so humans/AI can audit the decoding. */
  formula: string;
  decode: (d: number[]) => number;
  /** Typical healthy range in base units — used for colouring and reports. Optional. */
  normal?: [number, number];
}

const u16 = (d: number[]) => (d[0] ?? 0) * 256 + (d[1] ?? 0);
const pct = (d: number[]) => ((d[0] ?? 0) * 100) / 255;
const trim = (v: number) => ((v - 128) * 100) / 128;
const temp = (d: number[]) => (d[0] ?? 0) - 40;

type Def = Omit<SignalDef, 'mode' | 'source'> & { source?: 'obd' | 'elm' };

const defs: Def[] = [
  // ── Engine ──────────────────────────────────────────────────────────────
  {
    id: 'rpm', pid: 0x0c, bytes: 2, quantity: 'rpm', min: 0, max: 8000, digits: 0, category: 'engine', tier: 'fast',
    name: { tr: 'Motor devri', en: 'Engine speed' }, short: { tr: 'Devir', en: 'RPM' },
    formula: '(256A+B)/4', decode: (d) => u16(d) / 4,
  },
  {
    id: 'speed', pid: 0x0d, bytes: 1, quantity: 'speed', min: 0, max: 255, digits: 0, category: 'engine', tier: 'fast',
    name: { tr: 'Araç hızı', en: 'Vehicle speed' }, short: { tr: 'Hız', en: 'Speed' },
    formula: 'A', decode: (d) => d[0] ?? 0,
  },
  {
    id: 'engineLoad', pid: 0x04, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'fast',
    name: { tr: 'Hesaplanan motor yükü', en: 'Calculated engine load' }, short: { tr: 'Yük', en: 'Load' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'absLoad', pid: 0x43, bytes: 2, quantity: 'percent', min: 0, max: 400, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Mutlak yük değeri', en: 'Absolute load value' }, short: { tr: 'Mutlak yük', en: 'Abs load' },
    formula: '(256A+B)*100/255', decode: (d) => (u16(d) * 100) / 255,
  },
  {
    id: 'throttle', pid: 0x11, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'fast',
    name: { tr: 'Gaz kelebeği konumu', en: 'Throttle position' }, short: { tr: 'Gaz', en: 'Throttle' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'relThrottle', pid: 0x45, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Bağıl gaz kelebeği konumu', en: 'Relative throttle position' }, short: { tr: 'Bağıl gaz', en: 'Rel throttle' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'throttleB', pid: 0x47, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Mutlak gaz konumu B', en: 'Absolute throttle position B' }, short: { tr: 'Gaz B', en: 'Throttle B' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'pedalD', pid: 0x49, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'fast',
    name: { tr: 'Gaz pedalı konumu D', en: 'Accelerator pedal position D' }, short: { tr: 'Pedal D', en: 'Pedal D' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'pedalE', pid: 0x4a, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Gaz pedalı konumu E', en: 'Accelerator pedal position E' }, short: { tr: 'Pedal E', en: 'Pedal E' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'cmdThrottle', pid: 0x4c, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Komut edilen gaz aktüatörü', en: 'Commanded throttle actuator' }, short: { tr: 'Gaz komutu', en: 'Cmd throttle' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'timingAdvance', pid: 0x0e, bytes: 1, quantity: 'angle', min: -64, max: 63.5, digits: 1, category: 'engine', tier: 'medium',
    name: { tr: 'Ateşleme avansı', en: 'Timing advance' }, short: { tr: 'Avans', en: 'Timing' },
    formula: 'A/2-64 (° before TDC)', decode: (d) => (d[0] ?? 0) / 2 - 64,
  },
  {
    id: 'runTime', pid: 0x1f, bytes: 2, quantity: 'duration', min: 0, max: 65535, digits: 0, category: 'engine', tier: 'slow',
    name: { tr: 'Motor çalışma süresi', en: 'Run time since engine start' }, short: { tr: 'Çalışma', en: 'Run time' },
    formula: '256A+B', decode: u16,
  },
  {
    id: 'demandTorque', pid: 0x61, bytes: 1, quantity: 'percent', min: -125, max: 130, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Sürücü talep torku', en: "Driver's demand engine torque" }, short: { tr: 'Talep tork', en: 'Demand torque' },
    formula: 'A-125', decode: (d) => (d[0] ?? 0) - 125,
  },
  {
    id: 'actualTorque', pid: 0x62, bytes: 1, quantity: 'percent', min: -125, max: 130, digits: 0, category: 'engine', tier: 'medium',
    name: { tr: 'Gerçek motor torku', en: 'Actual engine torque' }, short: { tr: 'Tork', en: 'Torque' },
    formula: 'A-125', decode: (d) => (d[0] ?? 0) - 125,
  },
  {
    id: 'refTorque', pid: 0x63, bytes: 2, quantity: 'torque', min: 0, max: 65535, digits: 0, category: 'engine', tier: 'slow',
    name: { tr: 'Referans motor torku', en: 'Engine reference torque' }, short: { tr: 'Ref. tork', en: 'Ref torque' },
    formula: '256A+B', decode: u16,
  },

  // ── Air ─────────────────────────────────────────────────────────────────
  {
    id: 'maf', pid: 0x10, bytes: 2, quantity: 'airflow', min: 0, max: 655.35, digits: 2, category: 'air', tier: 'fast',
    name: { tr: 'Hava akış oranı (MAF)', en: 'Mass air flow (MAF)' }, short: { tr: 'MAF', en: 'MAF' },
    formula: '(256A+B)/100', decode: (d) => u16(d) / 100,
  },
  {
    id: 'map', pid: 0x0b, bytes: 1, quantity: 'pressure', min: 0, max: 255, digits: 0, category: 'air', tier: 'fast',
    name: { tr: 'Emme manifoldu basıncı (MAP)', en: 'Intake manifold pressure (MAP)' }, short: { tr: 'MAP', en: 'MAP' },
    formula: 'A', decode: (d) => d[0] ?? 0,
  },
  {
    id: 'baro', pid: 0x33, bytes: 1, quantity: 'pressure', min: 0, max: 255, digits: 0, category: 'air', tier: 'slow',
    name: { tr: 'Atmosfer basıncı', en: 'Barometric pressure' }, short: { tr: 'Baro', en: 'Baro' },
    formula: 'A', decode: (d) => d[0] ?? 0, normal: [70, 106],
  },

  // ── Temperatures ────────────────────────────────────────────────────────
  {
    id: 'coolantTemp', pid: 0x05, bytes: 1, quantity: 'temperature', min: -40, max: 215, digits: 0, category: 'temperature', tier: 'slow',
    name: { tr: 'Motor soğutma suyu sıcaklığı', en: 'Engine coolant temperature' }, short: { tr: 'Soğutma', en: 'Coolant' },
    formula: 'A-40', decode: temp, normal: [75, 105],
  },
  {
    id: 'intakeTemp', pid: 0x0f, bytes: 1, quantity: 'temperature', min: -40, max: 215, digits: 0, category: 'temperature', tier: 'slow',
    name: { tr: 'Emme havası sıcaklığı', en: 'Intake air temperature' }, short: { tr: 'Emme havası', en: 'Intake air' },
    formula: 'A-40', decode: temp,
  },
  {
    id: 'ambientTemp', pid: 0x46, bytes: 1, quantity: 'temperature', min: -40, max: 215, digits: 0, category: 'temperature', tier: 'slow',
    name: { tr: 'Dış ortam sıcaklığı', en: 'Ambient air temperature' }, short: { tr: 'Dış hava', en: 'Ambient' },
    formula: 'A-40', decode: temp,
  },
  {
    id: 'oilTemp', pid: 0x5c, bytes: 1, quantity: 'temperature', min: -40, max: 210, digits: 0, category: 'temperature', tier: 'slow',
    name: { tr: 'Motor yağı sıcaklığı', en: 'Engine oil temperature' }, short: { tr: 'Yağ', en: 'Oil' },
    formula: 'A-40', decode: temp, normal: [80, 120],
  },
  ...([
    [0x3c, 'catTempB1S1', 'Bank 1, Sensor 1', 'Banka 1, Sensör 1'],
    [0x3d, 'catTempB2S1', 'Bank 2, Sensor 1', 'Banka 2, Sensör 1'],
    [0x3e, 'catTempB1S2', 'Bank 1, Sensor 2', 'Banka 1, Sensör 2'],
    [0x3f, 'catTempB2S2', 'Bank 2, Sensor 2', 'Banka 2, Sensör 2'],
  ] as const).map(([pid, id, en, tr]): Def => ({
    id, pid, bytes: 2, quantity: 'temperature', min: -40, max: 6513.5, digits: 0, category: 'temperature', tier: 'slow',
    name: { tr: `Katalizör sıcaklığı (${tr})`, en: `Catalyst temperature (${en})` },
    short: { tr: `Katalizör ${id.slice(7)}`, en: `Cat ${id.slice(7)}` },
    formula: '(256A+B)/10-40', decode: (d) => u16(d) / 10 - 40,
  })),

  // ── Fuel ────────────────────────────────────────────────────────────────
  ...([
    [0x06, 'stftB1', 'Short term fuel trim — Bank 1', 'Kısa dönem yakıt düzeltmesi — Banka 1', 'STFT B1', 'fast'],
    [0x07, 'ltftB1', 'Long term fuel trim — Bank 1', 'Uzun dönem yakıt düzeltmesi — Banka 1', 'LTFT B1', 'medium'],
    [0x08, 'stftB2', 'Short term fuel trim — Bank 2', 'Kısa dönem yakıt düzeltmesi — Banka 2', 'STFT B2', 'fast'],
    [0x09, 'ltftB2', 'Long term fuel trim — Bank 2', 'Uzun dönem yakıt düzeltmesi — Banka 2', 'LTFT B2', 'medium'],
  ] as const).map(([pid, id, en, tr, short, tier]): Def => ({
    id, pid, bytes: 1, quantity: 'percent', min: -100, max: 99.2, digits: 1, category: 'fuel', tier,
    name: { tr, en }, short: { tr: short, en: short },
    formula: '(A-128)*100/128', decode: (d) => trim(d[0] ?? 128), normal: [-10, 10],
  })),
  {
    id: 'fuelLevel', pid: 0x2f, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'fuel', tier: 'slow',
    name: { tr: 'Yakıt seviyesi', en: 'Fuel tank level' }, short: { tr: 'Yakıt', en: 'Fuel' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'fuelRate', pid: 0x5e, bytes: 2, quantity: 'fuelRate', min: 0, max: 3276.75, digits: 2, category: 'fuel', tier: 'medium',
    name: { tr: 'Motor yakıt tüketim oranı', en: 'Engine fuel rate' }, short: { tr: 'Tüketim', en: 'Fuel rate' },
    formula: '(256A+B)/20', decode: (d) => u16(d) / 20,
  },
  {
    id: 'fuelPressure', pid: 0x0a, bytes: 1, quantity: 'pressure', min: 0, max: 765, digits: 0, category: 'fuel', tier: 'medium',
    name: { tr: 'Yakıt basıncı', en: 'Fuel pressure' }, short: { tr: 'Yakıt bas.', en: 'Fuel press' },
    formula: '3A', decode: (d) => (d[0] ?? 0) * 3,
  },
  {
    id: 'fuelRailPressure', pid: 0x23, bytes: 2, quantity: 'pressure', min: 0, max: 655350, digits: 0, category: 'fuel', tier: 'medium',
    name: { tr: 'Yakıt rayı basıncı (gösterge)', en: 'Fuel rail gauge pressure' }, short: { tr: 'Ray basıncı', en: 'Rail press' },
    formula: '10(256A+B)', decode: (d) => u16(d) * 10,
  },
  {
    id: 'fuelRailRelPressure', pid: 0x22, bytes: 2, quantity: 'pressure', min: 0, max: 5177.27, digits: 1, category: 'fuel', tier: 'medium',
    name: { tr: 'Yakıt rayı basıncı (manifolda göre)', en: 'Fuel rail pressure (rel. to manifold)' }, short: { tr: 'Ray bağıl', en: 'Rail rel' },
    formula: '0.079(256A+B)', decode: (d) => u16(d) * 0.079,
  },
  {
    id: 'ethanol', pid: 0x52, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'fuel', tier: 'slow',
    name: { tr: 'Etanol yakıt oranı', en: 'Ethanol fuel %' }, short: { tr: 'Etanol', en: 'Ethanol' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'injectionTiming', pid: 0x5d, bytes: 2, quantity: 'angle', min: -210, max: 301.99, digits: 2, category: 'fuel', tier: 'medium',
    name: { tr: 'Yakıt enjeksiyon zamanlaması', en: 'Fuel injection timing' }, short: { tr: 'Enj. zaman', en: 'Inj timing' },
    formula: '(256A+B)/128-210', decode: (d) => u16(d) / 128 - 210,
  },

  // ── Emissions / O2 ──────────────────────────────────────────────────────
  ...([
    [0x14, 'B1S1'], [0x15, 'B1S2'], [0x16, 'B1S3'], [0x17, 'B1S4'],
    [0x18, 'B2S1'], [0x19, 'B2S2'], [0x1a, 'B2S3'], [0x1b, 'B2S4'],
  ] as const).flatMap(([pid, s]): Def[] => [
    {
      id: `o2V${s}`, pid, bytes: 2, quantity: 'voltage', min: 0, max: 1.275, digits: 3, category: 'emissions', tier: 'medium',
      name: { tr: `O2 sensör voltajı ${s}`, en: `O2 sensor voltage ${s}` }, short: { tr: `O2 ${s}`, en: `O2 ${s}` },
      formula: 'A/200', decode: (d) => (d[0] ?? 0) / 200,
    },
    {
      id: `o2Trim${s}`, pid, bytes: 2, quantity: 'percent', min: -100, max: 99.2, digits: 1, category: 'emissions', tier: 'medium',
      name: { tr: `O2 sensör yakıt düzeltmesi ${s}`, en: `O2 sensor fuel trim ${s}` }, short: { tr: `O2 trim ${s}`, en: `O2 trim ${s}` },
      formula: '(B-128)*100/128', decode: (d) => trim(d[1] ?? 128),
    },
  ]),
  ...([
    [0x24, 'S1'], [0x25, 'S2'], [0x26, 'S3'], [0x27, 'S4'],
    [0x34, 'S1'], [0x35, 'S2'], [0x36, 'S3'], [0x37, 'S4'],
  ] as const).map(([pid, s]): Def => ({
    id: `lambda${pid.toString(16).toUpperCase()}${s}`, pid, bytes: 4, quantity: 'ratio', min: 0, max: 2, digits: 3, category: 'emissions', tier: 'medium',
    name: { tr: `Geniş bant O2 lambda ${s}`, en: `Wide-band O2 lambda ${s}` }, short: { tr: `λ ${s}`, en: `λ ${s}` },
    formula: '2/65536*(256A+B)', decode: (d) => (2 / 65536) * u16(d), normal: [0.9, 1.1],
  })),
  {
    id: 'cmdLambda', pid: 0x44, bytes: 2, quantity: 'ratio', min: 0, max: 2, digits: 3, category: 'emissions', tier: 'medium',
    name: { tr: 'Komut edilen hava/yakıt oranı (λ)', en: 'Commanded air-fuel equivalence ratio (λ)' }, short: { tr: 'λ komut', en: 'Cmd λ' },
    formula: '2/65536*(256A+B)', decode: (d) => (2 / 65536) * u16(d),
  },
  {
    id: 'cmdEgr', pid: 0x2c, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'emissions', tier: 'medium',
    name: { tr: 'Komut edilen EGR', en: 'Commanded EGR' }, short: { tr: 'EGR', en: 'EGR' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'egrError', pid: 0x2d, bytes: 1, quantity: 'percent', min: -100, max: 99.2, digits: 1, category: 'emissions', tier: 'medium',
    name: { tr: 'EGR hatası', en: 'EGR error' }, short: { tr: 'EGR hata', en: 'EGR err' },
    formula: '(A-128)*100/128', decode: (d) => trim(d[0] ?? 128),
  },
  {
    id: 'evapPurge', pid: 0x2e, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'emissions', tier: 'slow',
    name: { tr: 'Komut edilen buharlaşma tahliyesi', en: 'Commanded evaporative purge' }, short: { tr: 'EVAP', en: 'EVAP' },
    formula: 'A*100/255', decode: pct,
  },
  {
    id: 'evapVaporPressure', pid: 0x32, bytes: 2, quantity: 'pressure', min: -8.192, max: 8.192, digits: 3, category: 'emissions', tier: 'slow',
    name: { tr: 'EVAP sistemi buhar basıncı', en: 'Evap system vapor pressure' }, short: { tr: 'EVAP bas.', en: 'EVAP press' },
    formula: 'signed(256A+B)/4 Pa', decode: (d) => { const v = u16(d); return (v >= 0x8000 ? v - 0x10000 : v) / 4 / 1000; },
  },
  {
    id: 'warmUps', pid: 0x30, bytes: 1, quantity: 'count', min: 0, max: 255, digits: 0, category: 'emissions', tier: 'slow',
    name: { tr: 'Kodlar silindikten sonraki ısınma sayısı', en: 'Warm-ups since codes cleared' }, short: { tr: 'Isınma', en: 'Warm-ups' },
    formula: 'A', decode: (d) => d[0] ?? 0,
  },

  // ── Electrical ──────────────────────────────────────────────────────────
  {
    id: 'moduleVoltage', pid: 0x42, bytes: 2, quantity: 'voltage', min: 0, max: 65.535, digits: 2, category: 'electrical', tier: 'slow',
    name: { tr: 'Kontrol modülü voltajı', en: 'Control module voltage' }, short: { tr: 'ECU volt', en: 'ECU volt' },
    formula: '(256A+B)/1000', decode: (d) => u16(d) / 1000, normal: [12.2, 14.8],
  },
  {
    id: 'adapterVoltage', source: 'elm', pid: 0, bytes: 0, quantity: 'voltage', min: 0, max: 20, digits: 1, category: 'electrical', tier: 'slow',
    name: { tr: 'Akü voltajı (adaptör)', en: 'Battery voltage (adapter)' }, short: { tr: 'Akü', en: 'Battery' },
    formula: 'ATRV', decode: () => NaN, normal: [12.2, 14.8],
  },
  {
    id: 'hybridBattery', pid: 0x5b, bytes: 1, quantity: 'percent', min: 0, max: 100, digits: 0, category: 'electrical', tier: 'slow',
    name: { tr: 'Hibrit batarya kalan ömrü', en: 'Hybrid battery pack remaining life' }, short: { tr: 'Hibrit bat.', en: 'Hybrid bat' },
    formula: 'A*100/255', decode: pct,
  },

  // ── Distance / time ─────────────────────────────────────────────────────
  {
    id: 'distanceMil', pid: 0x21, bytes: 2, quantity: 'distance', min: 0, max: 65535, digits: 0, category: 'distance', tier: 'slow',
    name: { tr: 'Arıza lambası yanarken gidilen mesafe', en: 'Distance traveled with MIL on' }, short: { tr: 'MIL mesafe', en: 'MIL dist' },
    formula: '256A+B', decode: u16,
  },
  {
    id: 'distanceCleared', pid: 0x31, bytes: 2, quantity: 'distance', min: 0, max: 65535, digits: 0, category: 'distance', tier: 'slow',
    name: { tr: 'Kodlar silindikten sonraki mesafe', en: 'Distance since codes cleared' }, short: { tr: 'Silme sonrası', en: 'Since clear' },
    formula: '256A+B', decode: u16,
  },
  {
    id: 'timeMil', pid: 0x4d, bytes: 2, quantity: 'none', unit: 'min', min: 0, max: 65535, digits: 0, category: 'distance', tier: 'slow',
    name: { tr: 'Arıza lambası yanık süre', en: 'Time run with MIL on' }, short: { tr: 'MIL süre', en: 'MIL time' },
    formula: '256A+B (minutes)', decode: u16,
  },
  {
    id: 'timeCleared', pid: 0x4e, bytes: 2, quantity: 'none', unit: 'min', min: 0, max: 65535, digits: 0, category: 'distance', tier: 'slow',
    name: { tr: 'Kodlar silindikten sonraki süre', en: 'Time since codes cleared' }, short: { tr: 'Silme süresi', en: 'Since clear (t)' },
    formula: '256A+B (minutes)', decode: u16,
  },
  {
    id: 'odometer', pid: 0xa6, bytes: 4, quantity: 'distance', min: 0, max: 429496729.5, digits: 1, category: 'distance', tier: 'slow',
    name: { tr: 'Kilometre sayacı', en: 'Odometer' }, short: { tr: 'Km sayacı', en: 'Odometer' },
    formula: '(A·2²⁴+B·2¹⁶+C·2⁸+D)/10', decode: (d) => (((d[0] ?? 0) * 2 ** 24) + ((d[1] ?? 0) << 16) + ((d[2] ?? 0) << 8) + (d[3] ?? 0)) / 10,
  },
];

export const SIGNALS: SignalDef[] = defs.map((d) => ({ source: 'obd', mode: 0x01, ...d }));

export const SIGNAL_BY_ID: Record<string, SignalDef> = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));

export const CATEGORIES: SignalCategory[] = ['engine', 'fuel', 'air', 'temperature', 'emissions', 'electrical', 'distance'];

export function getSignal(id: string): SignalDef {
  const s = SIGNAL_BY_ID[id];
  if (!s) throw new Error(`Unknown signal: ${id}`);
  return s;
}

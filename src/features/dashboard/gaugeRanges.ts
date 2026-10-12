import type { SignalDef } from '@/obd/signals';

/**
 * Practical gauge scales (base units). The catalogue min/max are protocol limits
 * (e.g. speed up to 255 km/h, MAF to 655 g/s) which make real-world needles barely move.
 */
const RANGES: Record<string, [number, number]> = {
  rpm: [0, 7000],
  speed: [0, 220],
  coolantTemp: [40, 130],
  intakeTemp: [-20, 80],
  ambientTemp: [-20, 50],
  oilTemp: [40, 150],
  map: [0, 200],
  maf: [0, 150],
  fuelRate: [0, 30],
  timingAdvance: [-10, 50],
  moduleVoltage: [10, 16],
  adapterVoltage: [10, 16],
  catTempB1S1: [0, 1000],
  catTempB1S2: [0, 1000],
  catTempB2S1: [0, 1000],
  catTempB2S2: [0, 1000],
  stftB1: [-25, 25],
  ltftB1: [-25, 25],
  stftB2: [-25, 25],
  ltftB2: [-25, 25],
  fuelRailPressure: [0, 20000],
  baro: [60, 110],
};

export function gaugeRange(sig: SignalDef): [number, number] {
  return RANGES[sig.id] ?? [sig.min, sig.max];
}

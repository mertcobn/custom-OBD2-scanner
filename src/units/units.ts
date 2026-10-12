/**
 * Physical quantities and unit conversion.
 * All values inside the app are stored in SI-ish "base" units (km/h, °C, kPa, g/s, L/h …);
 * conversion happens only at the display/export edge.
 */

export type Quantity =
  | 'speed'
  | 'temperature'
  | 'pressure'
  | 'airflow'
  | 'fuelRate'
  | 'distance'
  | 'percent'
  | 'rpm'
  | 'voltage'
  | 'current'
  | 'angle'
  | 'duration'
  | 'ratio'
  | 'count'
  | 'torque'
  | 'none';

export type SpeedUnit = 'km/h' | 'mph';
export type TemperatureUnit = '°C' | '°F';
export type PressureUnit = 'kPa' | 'bar' | 'psi';
export type DistanceUnit = 'km' | 'mi';
export type FuelRateUnit = 'L/h' | 'gal/h';
export type AirflowUnit = 'g/s' | 'lb/min';

export interface UnitPrefs {
  speed: SpeedUnit;
  temperature: TemperatureUnit;
  pressure: PressureUnit;
  distance: DistanceUnit;
  fuelRate: FuelRateUnit;
  airflow: AirflowUnit;
}

export const METRIC: UnitPrefs = {
  speed: 'km/h',
  temperature: '°C',
  pressure: 'kPa',
  distance: 'km',
  fuelRate: 'L/h',
  airflow: 'g/s',
};

export const IMPERIAL: UnitPrefs = {
  speed: 'mph',
  temperature: '°F',
  pressure: 'psi',
  distance: 'mi',
  fuelRate: 'gal/h',
  airflow: 'lb/min',
};

/** Base unit symbol for every quantity (what the decoders produce). */
export const BASE_UNIT: Record<Quantity, string> = {
  speed: 'km/h',
  temperature: '°C',
  pressure: 'kPa',
  airflow: 'g/s',
  fuelRate: 'L/h',
  distance: 'km',
  percent: '%',
  rpm: 'rpm',
  voltage: 'V',
  current: 'mA',
  angle: '°',
  duration: 's',
  ratio: 'λ',
  count: '',
  torque: 'Nm',
  none: '',
};

type Converter = { unit: string; to: (v: number) => number; digits?: number };

const KM_PER_MI = 1.609344;
const L_PER_GAL = 3.785411784;

function converterFor(q: Quantity, prefs: UnitPrefs): Converter {
  switch (q) {
    case 'speed':
      return prefs.speed === 'mph' ? { unit: 'mph', to: (v) => v / KM_PER_MI } : { unit: 'km/h', to: (v) => v };
    case 'distance':
      return prefs.distance === 'mi' ? { unit: 'mi', to: (v) => v / KM_PER_MI } : { unit: 'km', to: (v) => v };
    case 'temperature':
      return prefs.temperature === '°F' ? { unit: '°F', to: (v) => (v * 9) / 5 + 32 } : { unit: '°C', to: (v) => v };
    case 'pressure':
      if (prefs.pressure === 'bar') return { unit: 'bar', to: (v) => v / 100, digits: 2 };
      if (prefs.pressure === 'psi') return { unit: 'psi', to: (v) => v * 0.1450377377, digits: 1 };
      return { unit: 'kPa', to: (v) => v };
    case 'fuelRate':
      return prefs.fuelRate === 'gal/h'
        ? { unit: 'gal/h', to: (v) => v / L_PER_GAL, digits: 2 }
        : { unit: 'L/h', to: (v) => v };
    case 'airflow':
      return prefs.airflow === 'lb/min'
        ? { unit: 'lb/min', to: (v) => v * 0.132277357, digits: 2 }
        : { unit: 'g/s', to: (v) => v };
    default:
      return { unit: BASE_UNIT[q], to: (v) => v };
  }
}

export function convert(value: number, q: Quantity, prefs: UnitPrefs): { value: number; unit: string; digits?: number } {
  const c = converterFor(q, prefs);
  return { value: c.to(value), unit: c.unit, digits: c.digits };
}

export function unitLabel(q: Quantity, prefs: UnitPrefs): string {
  return converterFor(q, prefs).unit;
}

/** Format a value with a sensible number of fraction digits. */
export function formatNumber(value: number, digits: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

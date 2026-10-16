import type { LucideIcon } from 'lucide-react';
import { Car, Fuel, HeartPulse, PencilLine, Waves, Zap } from 'lucide-react';
import type { PollTier } from '@/obd/signals';
import type { Dtc } from '@/obd/types';
import type { PresetId } from '@/state/recording';

/** A signal, or alternatives of which the first one the car supports is used (e.g. narrow- or wide-band O2). */
type Slot = string | string[];

export interface Preset {
  id: PresetId;
  icon: LucideIcon;
  signals: Slot[];
  /** Poll-rate overrides while recording. */
  tiers?: Partial<Record<string, PollTier>>;
  /** Suggested duration when the preset is picked. */
  durationSec?: number;
  /** Signals depend on the fault codes (e.g. which catalyst bank). */
  resolve?: (codes: string[]) => Slot[];
}

/** P0420–P0424: catalyst bank 1; P0430–P0434: bank 2. */
const CAT_BANK1 = /^P042[0-4]$/;
const CAT_BANK2 = /^P043[0-4]$/;

/** The catalyst-efficiency code the car reports, if any. */
export function catalystCode(dtcs: Dtc[]): string | undefined {
  return dtcs.find((d) => CAT_BANK1.test(d.code) || CAT_BANK2.test(d.code))?.code;
}

const FRONT_B1 = ['o2VB1S1', 'lambda24S1', 'lambda34S1'];
const REAR_B1 = 'o2VB1S2';
const FRONT_B2 = ['o2VB2S1'];
const REAR_B2 = 'o2VB2S2';

/** The preset's signals for this car: supported ones only, alternatives resolved. */
export function presetSignals(p: Preset, supported: string[], dtcs: Dtc[] = []): string[] {
  const has = (id: string) => supported.length === 0 || supported.includes(id);
  const slots = p.resolve ? p.resolve(dtcs.map((d) => d.code)) : p.signals;
  const out: string[] = [];
  for (const slot of slots) {
    const pick = typeof slot === 'string' ? (has(slot) ? slot : undefined) : slot.find(has);
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/**
 * Curated signal sets. Each is chosen so that the recording is self-explanatory when analysed later
 * (by a person or an AI): it always includes the context signals (rpm, speed, load) needed to interpret the rest.
 */
export const PRESETS: Preset[] = [
  {
    id: 'drive',
    icon: Car,
    signals: ['rpm', 'speed', 'engineLoad', 'throttle', 'coolantTemp', 'intakeTemp', 'maf', 'stftB1', 'ltftB1', 'fuelLevel', 'moduleVoltage'],
  },
  {
    id: 'performance',
    icon: Zap,
    signals: ['rpm', 'speed', 'throttle', 'pedalD', 'engineLoad', 'map', 'maf', 'timingAdvance'],
  },
  {
    id: 'fuel',
    icon: Fuel,
    signals: ['rpm', 'speed', 'maf', 'fuelRate', 'fuelLevel', 'stftB1', 'ltftB1', 'cmdLambda', 'engineLoad'],
  },
  {
    id: 'health',
    icon: HeartPulse,
    signals: ['rpm', 'engineLoad', 'stftB1', 'ltftB1', 'stftB2', 'ltftB2', 'o2VB1S1', 'o2VB1S2', 'coolantTemp', 'timingAdvance', 'catTempB1S1', 'map', 'maf', 'moduleVoltage'],
  },
  {
    // Catalyst efficiency: the front sensor switches rich/lean ~1–2×/s; behind a healthy catalyst the rear one
    // stays nearly flat. Seeing that needs several samples per second, so only the two sensors are polled fast,
    // with rpm and coolant temperature slowly for context (warm engine, steady speed).
    id: 'catalyst',
    icon: Waves,
    signals: [FRONT_B1, REAR_B1, 'rpm', 'coolantTemp'],
    resolve: (codes) => {
      const b1 = codes.some((c) => CAT_BANK1.test(c));
      const b2 = codes.some((c) => CAT_BANK2.test(c));
      return [...(b1 || !b2 ? [FRONT_B1, REAR_B1] : []), ...(b2 ? [FRONT_B2, REAR_B2] : []), 'rpm', 'coolantTemp'];
    },
    tiers: Object.fromEntries([
      ...[...FRONT_B1, REAR_B1, ...FRONT_B2, REAR_B2].map((id) => [id, 'fast' as const]),
      ['rpm', 'slow'],
      ['coolantTemp', 'slow'],
    ]),
    durationSec: 300,
  },
  { id: 'custom', icon: PencilLine, signals: [] },
];

export const DURATIONS: (number | null)[] = [null, 60, 300, 900, 1800];

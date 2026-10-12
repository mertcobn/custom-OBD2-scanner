import type { LucideIcon } from 'lucide-react';
import { Car, Fuel, HeartPulse, PencilLine, Zap } from 'lucide-react';
import type { PresetId } from '@/state/recording';

export interface Preset {
  id: PresetId;
  icon: LucideIcon;
  signals: string[];
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
  { id: 'custom', icon: PencilLine, signals: [] },
];

export const DURATIONS: (number | null)[] = [null, 60, 300, 900, 1800];

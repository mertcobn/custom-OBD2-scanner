import { useCallback } from 'react';
import { SIGNAL_BY_ID, type Localized, type SignalDef } from '@/obd/signals';
import { useSettings, type Language } from '@/state/settings';
import { convert, formatNumber, unitLabel, type UnitPrefs } from '@/units/units';

export const LOCALE: Record<Language, string> = { tr: 'tr-TR', en: 'en-GB' };

export function loc(l: Localized, lang: Language): string {
  return l[lang];
}

export function signalUnit(sig: SignalDef, units: UnitPrefs): string {
  return sig.unit ?? unitLabel(sig.quantity, units);
}

export function formatSignal(
  sig: SignalDef,
  value: number | undefined,
  units: UnitPrefs,
  lang: Language,
): { text: string; unit: string; display?: number } {
  const unit = signalUnit(sig, units);
  if (value === undefined || !Number.isFinite(value)) return { text: '—', unit };
  const c = convert(value, sig.quantity, units);
  const digits = c.digits ?? sig.digits;
  if (sig.quantity === 'duration') return { text: formatDuration(value), unit: '', display: value };
  return { text: formatNumber(c.value, digits, LOCALE[lang]), unit, display: c.value };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Hook returning a formatter bound to the user's language and unit preferences. */
export function useFormatter() {
  const units = useSettings((s) => s.units);
  const lang = useSettings((s) => s.language);
  return useCallback(
    (id: string, value: number | undefined) => {
      const sig = SIGNAL_BY_ID[id];
      if (!sig) return { text: '—', unit: '' };
      return formatSignal(sig, value, units, lang);
    },
    [units, lang],
  );
}

/** Convert a base-unit value into the user's display unit (numbers only, for charts/gauges). */
export function useDisplayValue() {
  const units = useSettings((s) => s.units);
  return useCallback(
    (id: string, value: number) => {
      const sig = SIGNAL_BY_ID[id];
      return sig ? convert(value, sig.quantity, units).value : value;
    },
    [units],
  );
}

/** Health classification against a signal's normal range. */
export type Health = 'normal' | 'low' | 'high' | 'unknown';

export function health(sig: SignalDef, value: number | undefined): Health {
  if (!sig.normal || value === undefined) return 'unknown';
  if (value < sig.normal[0]) return 'low';
  if (value > sig.normal[1]) return 'high';
  return 'normal';
}

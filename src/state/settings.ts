import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IMPERIAL, METRIC, type UnitPrefs } from '@/units/units';

export type Language = 'tr' | 'en';
export type ThemePref = 'system' | 'light' | 'dark';
export type UnitSystem = 'metric' | 'imperial' | 'custom';

export const DEFAULT_DASHBOARD = ['rpm', 'speed', 'coolantTemp', 'engineLoad', 'throttle', 'adapterVoltage'];

interface SettingsState {
  language: Language;
  theme: ThemePref;
  unitSystem: UnitSystem;
  units: UnitPrefs;
  dashboard: string[];
  pinned: string[];
  analytics: boolean;
  onboarded: boolean;
  setLanguage: (l: Language) => void;
  setTheme: (t: ThemePref) => void;
  setUnitSystem: (s: UnitSystem) => void;
  setUnit: <K extends keyof UnitPrefs>(key: K, value: UnitPrefs[K]) => void;
  setDashboard: (ids: string[]) => void;
  togglePinned: (id: string) => void;
  setAnalytics: (on: boolean) => void;
  setOnboarded: (v: boolean) => void;
}

function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      theme: 'system',
      unitSystem: 'metric',
      units: METRIC,
      dashboard: DEFAULT_DASHBOARD,
      pinned: ['rpm', 'speed', 'coolantTemp'],
      analytics: true,
      onboarded: false,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setUnitSystem: (unitSystem) =>
        set((s) => ({
          unitSystem,
          units: unitSystem === 'metric' ? METRIC : unitSystem === 'imperial' ? IMPERIAL : s.units,
        })),
      setUnit: (key, value) => set((s) => ({ unitSystem: 'custom', units: { ...s.units, [key]: value } })),
      setDashboard: (dashboard) => set({ dashboard }),
      togglePinned: (id) =>
        set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((p) => p !== id) : [...s.pinned, id] })),
      setAnalytics: (analytics) => set({ analytics }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: 'shindan.settings', version: 1 },
  ),
);

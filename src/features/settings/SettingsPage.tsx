import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Code, X } from 'lucide-react';
import { detectCompat } from '@/lib/compat';
import { errorReportingAvailable } from '@/lib/errorReporting';
import { useRecording } from '@/state/recording';
import { useSettings, type Language, type ThemePref, type UnitSystem } from '@/state/settings';
import type { UnitPrefs } from '@/units/units';
import { Button } from '@/ui/Button';
import { Card, SectionTitle, Segmented, Switch } from '@/ui/controls';
import { Hanko } from '@/ui/Hanko';
import { PageHeader } from '@/ui/layout';

const UNIT_OPTIONS: { [K in keyof UnitPrefs]: UnitPrefs[K][] } = {
  speed: ['km/h', 'mph'],
  temperature: ['°C', '°F'],
  pressure: ['kPa', 'bar', 'psi'],
  distance: ['km', 'mi'],
  fuelRate: ['L/h', 'gal/h'],
  airflow: ['g/s', 'lb/min'],
};

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-sm text-ink-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const compat = useMemo(() => detectCompat(), []);
  const [cleared, setCleared] = useState(false);

  const clearLocal = () => {
    try {
      localStorage.removeItem('shindan.settings');
    } catch {
      /* storage may be unavailable */
    }
    void useRecording.getState().clearAll();
    setCleared(true);
    setTimeout(() => location.reload(), 600);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.settings')} kanji="設定" />

      <Card className="px-5 py-1">
        <SettingRow label={t('settings.language')}>
          <Segmented<Language>
            label={t('settings.language')}
            value={s.language}
            onChange={s.setLanguage}
            options={[
              { value: 'tr', label: 'Türkçe' },
              { value: 'en', label: 'English' },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('settings.theme')}>
          <Segmented<ThemePref>
            label={t('settings.theme')}
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { value: 'system', label: t('settings.themes.system') },
              { value: 'light', label: t('settings.themes.light') },
              { value: 'dark', label: t('settings.themes.dark') },
            ]}
          />
        </SettingRow>
      </Card>

      <Card className="px-5 pt-5 pb-1">
        <SectionTitle kanji="単位">{t('settings.units')}</SectionTitle>
        <Segmented<UnitSystem>
          label={t('settings.units')}
          className="flex w-full"
          value={s.unitSystem}
          onChange={s.setUnitSystem}
          options={[
            { value: 'metric', label: t('settings.unitSystems.metric') },
            { value: 'imperial', label: t('settings.unitSystems.imperial') },
            { value: 'custom', label: t('settings.unitSystems.custom') },
          ]}
        />
        <div className="mt-2">
          {(Object.keys(UNIT_OPTIONS) as (keyof UnitPrefs)[]).map((key) => (
            <SettingRow key={key} label={t(`settings.unitNames.${key}`)}>
              <Segmented
                label={t(`settings.unitNames.${key}`)}
                value={s.units[key]}
                onChange={(v) => s.setUnit(key, v as never)}
                options={UNIT_OPTIONS[key].map((u) => ({ value: u, label: <span className="unit">{u}</span> }))}
              />
            </SettingRow>
          ))}
        </div>
      </Card>

      <Card className="px-5 pt-5 pb-1">
        <SectionTitle kanji="秘密">{t('settings.privacy')}</SectionTitle>
        <p className="-mt-1 text-sm leading-relaxed text-ink-muted">{t('settings.privacyBody')}</p>
        <SettingRow label={t('settings.analytics')} hint={t('settings.analyticsHint')}>
          <Switch checked={s.analytics} onChange={s.setAnalytics} label={t('settings.analytics')} />
        </SettingRow>
        {errorReportingAvailable && (
          <SettingRow label={t('settings.errorReports')} hint={t('settings.errorReportsHint')}>
            <Switch checked={s.errorReports} onChange={s.setErrorReports} label={t('settings.errorReports')} />
          </SettingRow>
        )}
        <SettingRow label={t('settings.clearData')} hint={t('settings.clearDataHint')}>
          <Button size="sm" variant="secondary" className="text-beni" onClick={clearLocal} disabled={cleared}>
            {cleared ? t('settings.cleared') : t('settings.clearDataCta')}
          </Button>
        </SettingRow>
      </Card>

      <Card className="px-5 pt-5 pb-3">
        <SectionTitle kanji="互換">{t('settings.compat')}</SectionTitle>
        <ul className="text-[15px]">
          {[
            [t('settings.compatBle'), compat.ble],
            [t('settings.compatSerial'), compat.serial],
            [t('settings.compatSecure'), compat.secure],
          ].map(([label, ok]) => (
            <li key={String(label)} className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
              <span>{label}</span>
              <span className={ok ? 'text-matcha' : 'text-ink-faint'}>{ok ? <Check size={18} /> : <X size={18} />}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex items-center gap-4 p-5">
        <Hanko char="診" size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg font-semibold">Shindan · 診断</div>
          <p className="text-sm text-ink-muted">{t('settings.about', { version: __APP_VERSION__ })}</p>
        </div>
        <a
          href="https://github.com/mertcobn/custom-OBD2-scanner"
          target="_blank"
          rel="noreferrer"
          className="grid size-11 place-items-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
          aria-label="GitHub" title="GitHub"
        >
          <Code size={20} />
        </a>
      </Card>
    </div>
  );
}

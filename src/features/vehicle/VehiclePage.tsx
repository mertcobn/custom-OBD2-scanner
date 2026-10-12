import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Check, Copy, Hourglass } from 'lucide-react';
import { cx } from '@/lib/cx';
import { LOCALE } from '@/lib/format';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useVehicle } from '@/state/vehicle';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Card, Row, SectionTitle } from '@/ui/controls';
import { Hanko } from '@/ui/Hanko';
import { EmptyState, PageHeader } from '@/ui/layout';

export function VehiclePage() {
  const { t } = useTranslation();
  const connected = useConnection((s) => s.status === 'connected');
  const openConnect = useUi((s) => s.openConnect);
  if (!connected)
    return (
      <>
        <PageHeader title={t('nav.vehicle')} kanji="車両" />
        <EmptyState
          title={t('vehicle.emptyTitle')}
          body={t('vehicle.emptyBody')}
          action={
            <Button variant="primary" icon={<Bluetooth size={18} />} onClick={openConnect}>
              {t('common.connect')}
            </Button>
          }
        />
      </>
    );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.vehicle')} kanji="車両" />
      <VinCard />
      <div className="grid gap-5 lg:grid-cols-2">
        <ReadinessCard />
        <AdapterCard />
      </div>
    </div>
  );
}

function VinCard() {
  const { t } = useTranslation();
  const info = useVehicle((s) => s.info);
  const [copied, setCopied] = useState(false);
  const vin = info?.vin;
  const copy = async () => {
    if (!vin) return;
    try {
      await navigator.clipboard.writeText(vin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be unavailable */
    }
  };
  return (
    <Card className="seigaiha relative overflow-hidden p-5 sm:p-6">
      <div className="text-xs font-medium tracking-wide text-ink-muted">{t('vehicle.vin')}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {vin ? (
          <p className="num text-xl font-medium tracking-[0.12em] break-all sm:text-3xl" aria-label={vin}>
            <span className="text-sakura-deep">{vin.slice(0, 3)}</span>
            <span>{vin.slice(3, 9)}</span>
            <span className="text-ink-muted">{vin.slice(9)}</span>
          </p>
        ) : (
          <p className="text-ink-muted">{t('vehicle.vinUnavailable')}</p>
        )}
        {vin && (
          <Button size="sm" variant="ghost" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy()}>
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('vehicle.make'), info?.make],
          [t('vehicle.country'), info?.country],
          [t('vehicle.modelYear'), info?.modelYear],
          [t('vehicle.fuelType'), info?.fuelType ? t(`fuelTypes.${info.fuelType}`, { defaultValue: info.fuelType }) : undefined],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-surface/80 px-3 py-2.5">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-0.5 truncate text-[15px]">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ReadinessCard() {
  const { t } = useTranslation();
  const monitor = useVehicle((s) => s.monitor);
  if (!monitor) return null;
  const supported = monitor.monitors.filter((m) => m.supported);
  const incomplete = supported.filter((m) => !m.complete);
  // Most inspection schemes tolerate 1 incomplete monitor on newer cars; we keep the verdict simple and explain it.
  const ready = incomplete.length === 0 && !monitor.mil;

  return (
    <Card className="p-5">
      <SectionTitle kanji="準備">{t('vehicle.readiness.title')}</SectionTitle>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <Hanko char={ready ? '可' : '待'} tone={ready ? 'matcha' : 'kin'} size={40} />
        <div>
          <div className="font-medium">{ready ? t('vehicle.readiness.ready') : t('vehicle.readiness.notReady')}</div>
          <div className="text-sm text-ink-muted">
            {ready ? t('vehicle.readiness.readyBody') : t('vehicle.readiness.notReadyBody', { count: incomplete.length })}
          </div>
        </div>
      </div>
      <ul>
        {supported.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
            <span className="text-[15px]">{t(`monitors.${m.id}`)}</span>
            <span className={cx('inline-flex items-center gap-1.5 text-sm font-medium', m.complete ? 'text-matcha' : 'text-kin')}>
              {m.complete ? <Check size={16} /> : <Hourglass size={15} />}
              {m.complete ? t('vehicle.readiness.complete') : t('vehicle.readiness.incomplete')}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-faint">
        {t('vehicle.readiness.unsupported', { count: monitor.monitors.length - supported.length })} · {t(`vehicle.readiness.ignition.${monitor.ignition}`)}
      </p>
    </Card>
  );
}

function AdapterCard() {
  const { t } = useTranslation();
  const { adapter, protocol } = useConnection();
  const info = useVehicle((s) => s.info);
  const supported = useLive((s) => s.supported.length);
  const rate = useLive((s) => s.rate);
  const lang = useSettings((s) => s.language);
  return (
    <Card className="p-5">
      <SectionTitle kanji="通信">{t('vehicle.adapter.title')}</SectionTitle>
      <dl>
        <Row label={t('vehicle.adapter.name')}>{adapter?.name ?? '—'}</Row>
        <Row label={t('vehicle.adapter.transport')}>{adapter ? t(`transport.${adapter.transport}`) : '—'}</Row>
        <Row label={t('vehicle.adapter.chip')} mono>{adapter?.elmVersion ?? '—'}</Row>
        <Row label={t('vehicle.protocol')}>{protocol ?? '—'}</Row>
        <Row label={t('vehicle.obdStandard')}>{info?.obdStandard ?? '—'}</Row>
        <Row label={t('vehicle.ecus')} mono>{info?.ecus.join(', ') || '—'}</Row>
        <Row label={t('vehicle.calIds')} mono>{info?.calibrationIds?.join(', ') || '—'}</Row>
        <Row label={t('vehicle.supportedCount')} mono>{supported}</Row>
        <Row label={t('vehicle.adapter.rate')} mono>{formatNumber(rate, 1, LOCALE[lang])} /s</Row>
      </dl>
    </Card>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowDown, ArrowUp, Bluetooth, ClipboardCheck, FileDown, Pencil, Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useWatch } from '@/obd/controller';
import { SIGNAL_BY_ID } from '@/obd/signals';
import { formatSignal, health, loc, LOCALE } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useVehicle } from '@/state/vehicle';
import { convert, formatNumber } from '@/units/units';
import { startConnect } from '@/features/connect/ConnectSheet';
import { Button } from '@/ui/Button';
import { EnsoGauge } from '@/ui/EnsoGauge';
import { PageHeader } from '@/ui/layout';
import { Sheet } from '@/ui/Sheet';
import { gaugeRange } from './gaugeRanges';

const MAX_GAUGES = 8;

export function DashboardPage() {
  const connected = useConnection((s) => s.status === 'connected');
  return connected ? <LiveDashboard /> : <Welcome />;
}

function Welcome() {
  const { t } = useTranslation();
  const openConnect = useUi((s) => s.openConnect);
  const features = [
    { icon: Activity, key: 'live' },
    { icon: TriangleAlert, key: 'dtc' },
    { icon: FileDown, key: 'export' },
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="card seigaiha relative overflow-hidden px-6 pt-10 pb-8 sm:px-10 sm:pt-14">
        <svg viewBox="0 0 200 200" className="pointer-events-none absolute -top-16 -right-16 size-72 opacity-[0.13] sm:size-96" aria-hidden>
          <path
            d="M 60 168 C 18 140 12 78 52 42 C 92 8 160 20 180 72 C 198 118 170 166 120 178"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="16"
            strokeLinecap="round"
          />
        </svg>
        <div className="relative max-w-xl">
          <div className="font-serif text-sm tracking-[0.4em] text-sakura-deep" aria-hidden>
            診断
          </div>
          <h1 className="mt-3 font-serif text-[2.1rem] leading-[1.15] font-semibold tracking-tight sm:text-5xl">{t('welcome.title')}</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">{t('welcome.body')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="primary" size="lg" icon={<Bluetooth size={20} />} onClick={openConnect}>
              {t('welcome.connect')}
            </Button>
            <Button variant="secondary" size="lg" icon={<Sparkles size={18} />} onClick={() => startConnect('demo')}>
              {t('welcome.demo')}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('welcome.featuresLabel')}>
        {features.map(({ icon: Icon, key }) => (
          <div key={key} className="card p-5">
            <Icon size={22} className="text-sakura-deep" />
            <h2 className="mt-3 font-serif text-lg font-semibold">{t(`welcome.features.${key}.title`)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t(`welcome.features.${key}.body`)}</p>
          </div>
        ))}
      </section>
      <p className="px-1 text-center text-xs leading-relaxed text-ink-faint">{t('welcome.privacy')}</p>
    </div>
  );
}

function StatusStrip() {
  const { t } = useTranslation();
  const monitor = useVehicle((s) => s.monitor);
  const dtcCount = useVehicle((s) => s.dtcs.length);
  const dtcState = useVehicle((s) => s.dtcState);
  const incomplete = monitor?.monitors.filter((m) => m.supported && !m.complete).length ?? 0;
  const mil = monitor?.mil;

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <Link
        to="/dtc"
        className={cx(
          'flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-medium',
          dtcCount > 0 ? 'border-beni/30 bg-beni-soft text-beni' : 'border-line bg-surface text-ink-muted',
        )}
      >
        <TriangleAlert size={17} />
        {dtcState === 'loading' ? t('dash.dtcReading') : dtcCount > 0 ? t('dash.dtcCount', { count: dtcCount }) : t('dash.noDtc')}
      </Link>
      {monitor && (
        <Link to="/dtc" className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 text-sm font-medium text-ink-muted">
          <span className={cx('size-2.5 rounded-full', mil ? 'bg-kin' : 'bg-matcha')} />
          {mil ? t('dash.milOn') : t('dash.milOff')}
        </Link>
      )}
      {monitor && (
        <Link
          to="/vehicle"
          className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 text-sm font-medium text-ink-muted"
        >
          <ClipboardCheck size={17} className={incomplete ? 'text-kin' : 'text-matcha'} />
          {incomplete ? t('dash.readinessIncomplete', { count: incomplete }) : t('dash.readinessOk')}
        </Link>
      )}
    </div>
  );
}

function GaugeTile({ id, large }: { id: string; large?: boolean }) {
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const reading = useLive((s) => s.values[id]);
  const sig = SIGNAL_BY_ID[id];
  if (!sig) return null;
  const f = formatSignal(sig, reading?.v, units, lang);
  const [lo, hi] = gaugeRange(sig);
  const min = convert(lo, sig.quantity, units).value;
  const max = convert(hi, sig.quantity, units).value;
  return (
    <div className={cx('card p-3 sm:p-4', large && 'col-span-1')}>
      <EnsoGauge
        label={loc(sig.short, lang)}
        text={f.text}
        unit={f.unit}
        value={f.display}
        min={min}
        max={max}
        health={health(sig, reading?.v)}
        accent={large}
        size={large ? 'lg' : 'md'}
        className={large ? 'mx-auto max-w-[19rem]' : 'mx-auto max-w-[13rem]'}
      />
    </div>
  );
}

function LiveDashboard() {
  const { t } = useTranslation();
  const ids = useSettings((s) => s.dashboard);
  const supported = useLive((s) => s.supported);
  const rate = useLive((s) => s.rate);
  const lang = useSettings((s) => s.language);
  const [editing, setEditing] = useState(false);
  const shown = ids.filter((id) => supported.includes(id));
  useWatch(shown);
  const [first, second, ...rest] = shown;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('nav.dashboard')}
        kanji="計器"
        subtitle={<span className="num text-sm">{t('dash.rate', { rate: formatNumber(rate, 1, LOCALE[lang]) })}</span>}
        actions={
          <Button size="sm" variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            {t('dash.edit')}
          </Button>
        }
      />
      <StatusStrip />
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">{t('dash.empty')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {first && <GaugeTile id={first} large />}
            {second && <GaugeTile id={second} large />}
          </div>
          {rest.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {rest.map((id) => (
                <GaugeTile key={id} id={id} />
              ))}
            </div>
          )}
        </>
      )}
      <EditGauges open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function EditGauges({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const ids = useSettings((s) => s.dashboard);
  const setIds = useSettings((s) => s.setDashboard);
  const supported = useLive((s) => s.supported);
  const available = supported.filter((id) => !ids.includes(id));

  const move = (i: number, dir: -1 | 1) => {
    const next = ids.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setIds(next);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('dash.editTitle')} kanji="編集" footer={<Button variant="primary" block onClick={onClose}>{t('common.done')}</Button>}>
      <p className="mb-3 text-sm text-ink-muted">{t('dash.editHint', { max: MAX_GAUGES })}</p>
      <ul className="mb-5 flex flex-col gap-1.5">
        {ids.map((id, i) => {
          const sig = SIGNAL_BY_ID[id];
          if (!sig) return null;
          return (
            <li key={id} className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pr-1.5 pl-4">
              <span className="num w-5 text-xs text-ink-faint">{i + 1}</span>
              <span className={cx('flex-1 text-[15px]', !supported.includes(id) && 'text-ink-faint line-through')}>{loc(sig.name, lang)}</span>
              <button className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('common.moveUp')}>
                <ArrowUp size={16} />
              </button>
              <button className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label={t('common.moveDown')}>
                <ArrowDown size={16} />
              </button>
              <button className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-beni" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t('common.remove')}>
                <X size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <h3 className="mb-2 text-sm font-medium text-ink-muted">{t('dash.addGauge')}</h3>
      <ul className="flex flex-wrap gap-2">
        {available.map((id) => (
          <li key={id}>
            <button
              disabled={ids.length >= MAX_GAUGES}
              onClick={() => setIds([...ids, id])}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm hover:border-ink disabled:opacity-40"
            >
              <Plus size={14} />
              {loc(SIGNAL_BY_ID[id]!.short, lang)}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

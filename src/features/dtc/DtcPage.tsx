import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Eraser, RefreshCw, TriangleAlert } from 'lucide-react';
import { clearDtcs, readDtcs } from '@/obd/controller';
import { SIGNAL_BY_ID } from '@/obd/signals';
import type { Dtc, DtcKind } from '@/obd/types';
import { describeDtc } from '@/data/dtc';
import { cx } from '@/lib/cx';
import { formatSignal, loc, LOCALE } from '@/lib/format';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useVehicle } from '@/state/vehicle';
import { Button } from '@/ui/Button';
import { Badge, Card, SectionTitle } from '@/ui/controls';
import { EnsoLoader } from '@/ui/EnsoLoader';
import { Hanko } from '@/ui/Hanko';
import { EmptyState, PageHeader } from '@/ui/layout';
import { Sheet } from '@/ui/Sheet';
import { OnboardTests } from './OnboardTests';

const KINDS: DtcKind[] = ['stored', 'pending', 'permanent'];

export function DtcPage() {
  const { t } = useTranslation();
  const connected = useConnection((s) => s.status === 'connected');
  const openConnect = useUi((s) => s.openConnect);
  const dtcState = useVehicle((s) => s.dtcState);

  if (!connected)
    return (
      <>
        <PageHeader title={t('nav.dtc')} kanji="故障" />
        <EmptyState
          title={t('dtc.emptyTitle')}
          body={t('dtc.emptyBody')}
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
      <PageHeader
        title={t('nav.dtc')}
        kanji="故障"
        actions={
          <Button size="sm" variant="secondary" icon={<RefreshCw size={15} className={dtcState === 'loading' ? 'animate-spin' : undefined} />} disabled={dtcState === 'loading'} onClick={() => void readDtcs()}>
            {t('dtc.reread')}
          </Button>
        }
      />
      <Summary />
      {dtcState === 'loading' ? (
        <div className="card flex flex-col items-center gap-4 py-12">
          <EnsoLoader size={64} />
          <p className="text-ink-muted">{t('dtc.reading')}</p>
        </div>
      ) : (
        <CodeLists />
      )}
      <FreezeFrameCard />
      <OnboardTests />
      <ClearZone />
    </div>
  );
}

function Summary() {
  const { t } = useTranslation();
  const monitor = useVehicle((s) => s.monitor);
  const dtcs = useVehicle((s) => s.dtcs);
  const readAt = useVehicle((s) => s.dtcReadAt);
  const lang = useSettings((s) => s.language);
  const mil = monitor?.mil ?? dtcs.some((d) => d.kind === 'stored');

  return (
    <Card className="flex items-center gap-4 p-5">
      <Hanko char={mil ? '警' : '安'} tone={mil ? 'beni' : 'matcha'} size={52} />
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-lg font-semibold">{mil ? t('dtc.milOn') : t('dtc.milOff')}</h2>
        <p className="text-sm text-ink-muted">{mil ? t('dtc.milOnBody') : t('dtc.milOffBody')}</p>
        {readAt && (
          <p className="num mt-1 text-xs text-ink-faint">
            {t('dtc.readAt', { time: new Date(readAt).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }) })}
          </p>
        )}
      </div>
      <dl className="hidden gap-4 text-center sm:flex">
        {KINDS.map((k) => (
          <div key={k}>
            <dd className="num text-2xl">{dtcs.filter((d) => d.kind === k).length}</dd>
            <dt className="text-xs text-ink-muted">{t(`dtc.kinds.${k}`)}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CodeLists() {
  const { t } = useTranslation();
  const dtcs = useVehicle((s) => s.dtcs);
  const dtcState = useVehicle((s) => s.dtcState);
  if (dtcState !== 'ready') return null;
  if (dtcs.length === 0) return <EmptyState title={t('dtc.noneTitle')} body={t('dtc.noneBody')} />;

  return (
    <>
      {KINDS.map((kind) => {
        const list = dtcs.filter((d) => d.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind}>
            <SectionTitle>{t(`dtc.kinds.${kind}`)}</SectionTitle>
            <p className="-mt-2 mb-3 text-sm text-ink-muted">{t(`dtc.kindHelp.${kind}`)}</p>
            <ul className="flex flex-col gap-3">
              {list.map((d) => (
                <DtcCard key={`${d.kind}-${d.code}-${d.ecu}`} dtc={d} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

const SEVERITY_TONE = { high: 'beni', medium: 'kin', low: 'ai' } as const;

function DtcCard({ dtc }: { dtc: Dtc }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const d = describeDtc(dtc.code, lang);
  return (
    <li className={cx('card overflow-hidden border-l-4', d.severity === 'high' ? 'border-l-beni' : d.severity === 'medium' ? 'border-l-kin' : 'border-l-line')}>
      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="num shrink-0 text-2xl font-medium tracking-wide">{dtc.code}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-ink">{d.title || t('dtc.unknown')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.severity && <Badge tone={SEVERITY_TONE[d.severity]}>{t(`dtc.severity.${d.severity}`)}</Badge>}
            <Badge>{t(`dtc.systems.${d.system}`)}</Badge>
            <Badge>{d.generic ? t('dtc.generic') : t('dtc.manufacturer')}</Badge>
            <Badge className="num">ECU {dtc.ecu}</Badge>
          </div>
          {d.subsystem && d.known && <p className="mt-2 text-xs text-ink-faint">{d.subsystem}</p>}
        </div>
      </div>
    </li>
  );
}

function FreezeFrameCard() {
  const { t } = useTranslation();
  const ff = useVehicle((s) => s.freezeFrame);
  const dtcState = useVehicle((s) => s.dtcState);
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  if (!ff || dtcState !== 'ready') return null;
  return (
    <Card className="p-5">
      <SectionTitle kanji="凍結">{t('dtc.freezeFrame')}</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-muted">{t('dtc.freezeFrameHelp', { code: ff.dtc })}</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(ff.values).map(([id, v]) => {
          const sig = SIGNAL_BY_ID[id];
          if (!sig) return null;
          const f = formatSignal(sig, v, units, lang);
          return (
            <div key={id} className="rounded-2xl bg-surface-2 px-3 py-2.5">
              <dt className="truncate text-xs text-ink-muted">{loc(sig.short, lang)}</dt>
              <dd className="num mt-0.5 text-[15px]">
                {f.text} <span className="text-xs text-ink-muted">{f.unit}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

function ClearZone() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const dtcCount = useVehicle((s) => s.dtcs.length);
  const clearState = useVehicle((s) => s.clearState);
  const rpm = useLive((s) => s.values.rpm?.v);
  const engineRunning = rpm !== undefined && rpm > 300;

  const close = () => {
    setOpen(false);
    setAck(false);
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-dashed border-beni/40 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="font-serif text-lg font-semibold">{t('dtc.clear.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('dtc.clear.summary')}</p>
        </div>
        <Button variant="secondary" className="border-beni/40 text-beni" icon={<Eraser size={17} />} disabled={clearState === 'loading'} onClick={() => setOpen(true)}>
          {t('dtc.clear.cta')}
        </Button>
      </div>
      {clearState === 'ready' && dtcCount === 0 && <p className="mt-3 text-sm text-matcha">{t('dtc.clear.done')}</p>}

      <Sheet
        open={open}
        onClose={close}
        title={t('dtc.clear.confirmTitle')}
        kanji="消去"
        footer={
          <div className="flex gap-2">
            <Button block onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              block
              variant="danger"
              disabled={!ack || clearState === 'loading'}
              onClick={() => {
                void clearDtcs().then(close);
              }}
            >
              {clearState === 'loading' ? t('dtc.clear.working') : t('dtc.clear.confirm')}
            </Button>
          </div>
        }
      >
        {engineRunning && (
          <div className="mb-4 flex gap-3 rounded-2xl bg-kin-soft p-4 text-sm">
            <TriangleAlert size={18} className="shrink-0 text-kin" />
            <p>{t('dtc.clear.engineRunning')}</p>
          </div>
        )}
        <ul className="mb-5 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-muted">
          <li>{t('dtc.clear.w1')}</li>
          <li>{t('dtc.clear.w2')}</li>
          <li>{t('dtc.clear.w3')}</li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-4">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-5 accent-[var(--beni)]" />
          <span className="text-[15px]">{t('dtc.clear.ack')}</span>
        </label>
      </Sheet>
    </section>
  );
}

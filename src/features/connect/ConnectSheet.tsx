import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Check, ChevronDown, Copy, History, KeyRound, Plug, Smartphone, Sparkles, Usb, X } from 'lucide-react';
import { connect, disconnect, type ConnectTarget } from '@/obd/controller';
import { BLUEFY_URL, detectCompat } from '@/lib/compat';
import { cx } from '@/lib/cx';
import { LOCALE } from '@/lib/format';
import { useConnection, type ConnectStep } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Badge, Row } from '@/ui/controls';
import { EnsoLoader } from '@/ui/EnsoLoader';
import { Sheet } from '@/ui/Sheet';
import { SerialTransport } from '@/obd/transport/serial';

export function ConnectSheet() {
  const { t } = useTranslation();
  const open = useUi((s) => s.connectOpen);
  const close = useUi((s) => s.closeConnect);
  const status = useConnection((s) => s.status);
  const picking = useConnection((s) => s.picking);
  const busy = (status === 'connecting' || status === 'reconnecting') && !picking;

  return (
    <Sheet open={open} onClose={close} title={t(status === 'connected' ? 'connect.titleConnected' : 'connect.title')} kanji="接続">
      {status === 'connected' ? <Connected /> : busy ? <Progress /> : <Choose />}
    </Sheet>
  );
}

/** Starts a connection; usable from any "Connect" button in the app. */
export function startConnect(target: ConnectTarget) {
  useUi.getState().openConnect();
  void connect(target).then(() => {
    if (useConnection.getState().status === 'connected') setTimeout(() => useUi.getState().closeConnect(), 900);
  });
}

function Choose() {
  const { t } = useTranslation();
  const compat = useMemo(() => detectCompat(), []);
  const error = useConnection((s) => s.error);
  // While the browser's picker is open, a second click would only be rejected by the browser.
  const picking = useConnection((s) => s.picking);
  const noBle = !compat.ble;
  const mac = typeof navigator !== 'undefined' && /Macintosh/.test(navigator.userAgent) && !compat.ios;
  // A serial port granted earlier survives reloads: offer it without the picker.
  const [hasKnownPort, setHasKnownPort] = useState(false);
  useEffect(() => {
    if (!compat.serial) return;
    let alive = true;
    void SerialTransport.knownPorts().then((p) => alive && setHasKnownPort(p.length > 0));
    return () => {
      alive = false;
    };
  }, [compat.serial]);

  return (
    <div className="flex flex-col gap-5" data-connect-view="choose" aria-busy={picking || undefined}>
      {error && <ErrorBox code={error.code} message={error.message} report={error.report} />}

      {compat.ios && !compat.ble && (
        <Notice tone="kin" icon={<Smartphone size={18} />} title={t('compat.ios.title')}>
          <p>{t('compat.ios.body')}</p>
          <a href={BLUEFY_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-ink underline underline-offset-4">
            {t('compat.ios.cta')}
          </a>
        </Notice>
      )}
      {!compat.ios && noBle && (
        <Notice tone="kin" icon={<Bluetooth size={18} />} title={t('compat.browser.title')}>
          <p>{t('compat.browser.body')}</p>
        </Notice>
      )}

      <ol className="grid gap-2 sm:grid-cols-3" aria-label={t('connect.prepTitle')}>
        {[
          { icon: Plug, key: 'plug' },
          { icon: KeyRound, key: 'ignition' },
          { icon: Bluetooth, key: 'pair' },
        ].map(({ icon: Icon, key }, i) => (
          <li key={key} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 sm:flex-col sm:items-start sm:gap-2">
            <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-surface text-sm text-sakura-deep">{i + 1}</span>
            <span className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
              <Icon size={18} className="text-ink-muted" />
              <span className="text-sm leading-snug">{t(`connect.prep.${key}`)}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" block icon={<Bluetooth size={20} />} disabled={noBle || picking} onClick={() => startConnect('ble')}>
          {t('connect.ble')}
        </Button>
        {!noBle && (
          <button disabled={picking} onClick={() => startConnect('bleAll')} className="mx-auto -mt-1 py-1 text-sm text-ink-muted underline underline-offset-4 hover:text-ink">
            {t('connect.bleAll')}
          </button>
        )}
        {compat.serial && hasKnownPort && (
          <Button variant="secondary" size="lg" block icon={<History size={20} />} disabled={picking} onClick={() => startConnect('serialKnown')}>
            {t('connect.serialKnown')}
          </Button>
        )}
        {compat.serial && (
          <Button variant="secondary" size="lg" block icon={<Usb size={20} />} disabled={picking} onClick={() => startConnect('serial')}>
            {t('connect.serial')}
          </Button>
        )}
        {compat.serial && mac && <p className="rounded-2xl bg-ai-soft p-3 text-sm leading-relaxed text-ink">{t('connect.macHint')}</p>}
        <Button variant="ghost" size="md" block icon={<Sparkles size={18} />} onClick={() => startConnect('demo')}>
          {t('connect.demo')}
        </Button>
      </div>

      <AdapterHelp />
    </div>
  );
}

function AdapterHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
      >
        {t('connect.help.title')}
        <ChevronDown size={18} className={cx('text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-ink-muted">
          <p>{t('connect.help.p1')}</p>
          <p>{t('connect.help.p2')}</p>
          <p>{t('connect.help.p3')}</p>
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: ConnectStep }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={cx(
          'grid size-7 shrink-0 place-items-center rounded-full border text-xs',
          step.state === 'done' && 'border-matcha bg-matcha text-on-accent',
          step.state === 'active' && 'animate-breathe border-sakura-deep text-sakura-deep',
          step.state === 'pending' && 'border-line text-ink-faint',
          step.state === 'failed' && 'border-beni bg-beni text-on-accent',
        )}
      >
        {step.state === 'done' ? <Check size={14} /> : step.state === 'failed' ? <X size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[15px]', step.state === 'pending' ? 'text-ink-faint' : 'text-ink')}>{t(`connect.steps.${step.id}`)}</span>
        {step.detail && <span className="num block truncate text-xs text-ink-muted">{step.detail}</span>}
      </span>
    </li>
  );
}

function Progress() {
  const { t } = useTranslation();
  const steps = useConnection((s) => s.steps);
  return (
    <div className="flex flex-col items-center gap-6 py-2" data-connect-view="progress">
      <EnsoLoader size={88} />
      <p className="text-center text-sm text-ink-muted">{t('connect.waitHint')}</p>
      <ol className="w-full max-w-sm">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </ol>
      <Button variant="ghost" onClick={() => void disconnect()}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

function Connected() {
  const { t } = useTranslation();
  const { adapter, protocol, demo } = useConnection();
  const rate = useLive((s) => s.rate);
  const lang = useSettings((s) => s.language);
  return (
    <div className="flex flex-col gap-5" data-connect-view="connected">
      <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
        <EnsoLoader size={56} done />
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold">
            {demo ? t('connect.demoName') : adapter?.name}
            {demo && <Badge tone="sakura">{t('common.demo')}</Badge>}
          </div>
          <div className="text-sm text-ink-muted">{t('connect.readyBody')}</div>
        </div>
      </div>
      <dl>
        <Row label={t('vehicle.adapter.chip')} mono>{adapter?.elmVersion ?? '—'}</Row>
        <Row label={t('vehicle.adapter.transport')}>{adapter ? t(`transport.${adapter.transport}`) : '—'}</Row>
        <Row label={t('vehicle.protocol')}>{protocol ?? '—'}</Row>
        <Row label={t('vehicle.adapter.voltage')} mono>
          {adapter?.voltage !== undefined ? `${formatNumber(adapter.voltage, 1, LOCALE[lang])} V` : '—'}
        </Row>
        <Row label={t('vehicle.adapter.rate')} mono>
          {formatNumber(rate, 1, LOCALE[lang])} /s
        </Row>
      </dl>
      <Button variant="secondary" block onClick={() => void disconnect()}>
        {t('connect.disconnect')}
      </Button>
    </div>
  );
}

function Notice({ tone, icon, title, children }: { tone: 'kin' | 'beni'; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div
      className={cx('flex gap-3 rounded-2xl p-4 text-sm leading-relaxed', tone === 'kin' ? 'bg-kin-soft' : 'bg-beni-soft')}
      role="note"
      data-error={tone === 'beni' ? '' : undefined}
    >
      <span className={tone === 'kin' ? 'text-kin' : 'text-beni'}>{icon}</span>
      <div className="min-w-0 text-ink">
        <div className="mb-1 font-medium">{title}</div>
        <div className="text-ink-muted">{children}</div>
      </div>
    </div>
  );
}

function ErrorBox({ code, message, report }: { code: string; message?: string; report?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (code === 'cancelled') return null;
  return (
    <Notice tone="beni" icon={<X size={18} />} title={t(`connect.errors.${code}.title`)}>
      <p>{t(`connect.errors.${code}.body`)}</p>
      {message && <p className="num mt-1 text-xs opacity-70">{message}</p>}
      {report && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t('connect.report.show')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={copied ? <Check size={15} /> : <Copy size={15} />}
              onClick={() => {
                void navigator.clipboard?.writeText(report).then(() => setCopied(true));
              }}
            >
              {copied ? t('common.copied') : t('connect.report.copy')}
            </Button>
          </div>
          {open && (
            <pre className="num mt-2 max-h-64 overflow-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink" data-testid="connection-report">
              {report}
            </pre>
          )}
        </div>
      )}
    </Notice>
  );
}

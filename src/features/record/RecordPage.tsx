import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Check, ChevronRight, CircleDot, Clock, MapPin, Plus, Square, Trash2 } from 'lucide-react';
import { CATEGORIES, SIGNAL_BY_ID } from '@/obd/signals';
import { PollScheduler } from '@/obd/services/scheduler';
import { cx } from '@/lib/cx';
import { formatDuration, formatSignal, loc, LOCALE } from '@/lib/format';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useRecording, type SessionMeta } from '@/state/recording';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Badge, Card, SectionTitle, Segmented } from '@/ui/controls';
import { Hanko } from '@/ui/Hanko';
import { PageHeader } from '@/ui/layout';
import { Sheet } from '@/ui/Sheet';
import { DURATIONS, PRESETS } from './presets';
import { SessionSummary } from './SessionSummary';

export function RecordPage() {
  const { t } = useTranslation();
  const status = useRecording((s) => s.status);
  const current = useRecording((s) => s.current);
  const [viewing, setViewing] = useState<string>();
  const sessions = useRecording((s) => s.sessions);
  const viewed = sessions.find((s) => s.id === viewing);

  if (status === 'recording') return <Recording />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.record')} kanji="記録" subtitle={t('record.subtitle')} />
      <RecoveredNotice onOpen={setViewing} />
      {viewed ? (
        <SessionSummary session={viewed} onBack={() => setViewing(undefined)} />
      ) : status === 'finished' && current ? (
        <SessionSummary session={current} onBack={() => useRecording.getState().discard()} fresh />
      ) : (
        <Wizard />
      )}
      {!viewed && <History onOpen={setViewing} />}
    </div>
  );
}

function Wizard() {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const connected = useConnection((s) => s.status === 'connected');
  const supported = useLive((s) => s.supported);
  const rate = useLive((s) => s.rate);
  const config = useRecording((s) => s.config);
  const setConfig = useRecording((s) => s.setConfig);
  const start = useRecording((s) => s.start);
  const openConnect = useUi((s) => s.openConnect);
  const [picking, setPicking] = useState(false);

  // Apply the preset against what this car actually supports.
  useEffect(() => {
    if (config.preset === 'custom') return;
    const preset = PRESETS.find((p) => p.id === config.preset)!;
    const signals = supported.length ? preset.signals.filter((id) => supported.includes(id)) : preset.signals;
    if (signals.join() !== config.signals.join()) setConfig({ signals });
  }, [config.preset, config.signals, supported, setConfig]);

  const hz = PollScheduler.estimateRate(config.signals, rate || 12);

  return (
    <>
      <section>
        <SectionTitle>
          <span className="num mr-1 text-sakura-deep">1</span> {t('record.step1')}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PRESETS.map((p) => {
            const active = config.preset === p.id;
            const n = p.id === 'custom' ? null : (supported.length ? p.signals.filter((id) => supported.includes(id)) : p.signals).length;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setConfig({ preset: p.id });
                  if (p.id === 'custom') setPicking(true);
                }}
                aria-pressed={active}
                className={cx(
                  'card relative flex flex-col items-start gap-2 p-4 text-left transition-all',
                  // Odd one out on the 2-column phone grid: span the full row instead of leaving a hole.
                  p.id === 'custom' && 'col-span-2 sm:col-span-1',
                  active ? 'border-ink ring-1 ring-ink' : 'hover:border-ink-faint',
                )}
              >
                <p.icon size={22} className={active ? 'text-sakura-deep' : 'text-ink-muted'} />
                <span className="font-medium">{t(`record.presets.${p.id}.title`)}</span>
                <span className="text-xs leading-snug text-ink-muted">{t(`record.presets.${p.id}.body`)}</span>
                {n !== null && <span className="num mt-auto text-xs text-ink-faint">{t('record.signalCount', { count: n })}</span>}
                {active && <Check size={16} className="absolute top-3 right-3 text-sakura-deep" />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {config.signals.map((id) => (
            <Badge key={id} className="h-7">
              {loc(SIGNAL_BY_ID[id]?.short ?? { tr: id, en: id }, lang)}
            </Badge>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setPicking(true)}>
            {t('record.editSignals')}
          </Button>
        </div>
      </section>

      <section>
        <SectionTitle>
          <span className="num mr-1 text-sakura-deep">2</span> {t('record.step2')}
        </SectionTitle>
        <Segmented
          label={t('record.step2')}
          className="flex w-full"
          value={String(config.durationSec)}
          onChange={(v) => setConfig({ durationSec: v === 'null' ? null : Number(v) })}
          options={DURATIONS.map((d) => ({ value: String(d), label: d === null ? t('record.untilStop') : t('record.minutes', { count: d / 60 }) }))}
        />
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
          <Clock size={15} />
          {t('record.estimate', { hz: formatNumber(hz.fast, 1, LOCALE[lang]), slow: formatNumber(hz.slow, 2, LOCALE[lang]) })}
        </p>
      </section>

      <div className="sticky bottom-20 z-10 lg:bottom-6">
        {connected ? (
          <Button variant="primary" size="lg" block icon={<CircleDot size={20} className="text-sakura" />} disabled={config.signals.length === 0} onClick={start}>
            {t('record.start')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block icon={<Bluetooth size={20} />} onClick={openConnect}>
            {t('record.connectFirst')}
          </Button>
        )}
      </div>

      <SignalPicker open={picking} onClose={() => setPicking(false)} />
    </>
  );
}

function SignalPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const supported = useLive((s) => s.supported);
  const config = useRecording((s) => s.config);
  const setConfig = useRecording((s) => s.setConfig);
  const pool = supported.length ? supported : Object.keys(SIGNAL_BY_ID);

  const toggle = (id: string) => {
    const signals = config.signals.includes(id) ? config.signals.filter((x) => x !== id) : [...config.signals, id];
    setConfig({ preset: 'custom', signals });
  };
  /** Select or clear a group of signals at once (keeps the catalogue order). */
  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(config.signals);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setConfig({ preset: 'custom', signals: pool.filter((id) => next.has(id)) });
  };
  const allSelected = pool.length > 0 && pool.every((id) => config.signals.includes(id));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('record.pickTitle')}
      kanji="選択"
      wide
      footer={
        <Button variant="primary" block onClick={onClose}>
          {t('record.pickDone', { count: config.signals.length })}
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">{t('record.pickHint')}</p>
        <Button size="sm" variant="secondary" onClick={() => setMany(pool, !allSelected)}>
          {allSelected ? t('record.clearAll') : t('record.selectAll', { count: pool.length })}
        </Button>
      </div>
      {CATEGORIES.map((cat) => {
        const ids = pool.filter((id) => SIGNAL_BY_ID[id]?.category === cat);
        if (!ids.length) return null;
        const catAll = ids.every((id) => config.signals.includes(id));
        return (
          <section key={cat} className="mb-5" role="group" aria-labelledby={`pick-${cat}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id={`pick-${cat}`} className="text-sm font-medium text-ink-muted">
                {t(`categories.${cat}`)} <span className="num text-xs text-ink-faint">{ids.filter((id) => config.signals.includes(id)).length}/{ids.length}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMany(ids, !catAll)}
                className="min-h-9 rounded-xl px-2 text-sm font-medium text-sakura-deep hover:bg-surface-2"
                aria-label={`${catAll ? t('record.clearGroup') : t('record.selectGroup')}: ${t(`categories.${cat}`)}`}
              >
                {catAll ? t('record.clearGroup') : t('record.selectGroup')}
              </button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ids.map((id) => {
                const checked = config.signals.includes(id);
                return (
                  <label
                    key={id}
                    className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-[15px]', checked ? 'border-ink bg-surface' : 'border-line')}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="size-4.5 accent-[var(--ink)]" />
                    <span className="min-w-0 flex-1 truncate">{loc(SIGNAL_BY_ID[id]!.name, lang)}</span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </Sheet>
  );
}

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Recording() {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const current = useRecording((s) => s.current)!;
  const count = useRecording((s) => s.sampleCount);
  const stop = useRecording((s) => s.stop);
  const addMarker = useRecording((s) => s.addMarker);
  const values = useLive((s) => s.values);
  const rate = useLive((s) => s.rate);
  const status = useConnection((s) => s.status);
  const now = useNow();
  const [noteFor, setNoteFor] = useState<number>();
  const [note, setNote] = useState('');
  const elapsed = (now - current.startedAt) / 1000;
  const limit = current.config.durationSec;

  const saveNote = () => {
    if (noteFor === undefined) return;
    useRecording.getState().setMarkerNote(noteFor, note);
    setNoteFor(undefined);
    setNote('');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('record.recordingTitle')} kanji="録画中" />
      {status !== 'connected' && (
        <div className="rounded-2xl bg-kin-soft p-4 text-sm">{t('record.connectionLost')}</div>
      )}
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <Hanko char="録" pulse size={44} />
        <div className="num mt-3 text-6xl font-medium tracking-tight sm:text-7xl" role="timer" aria-live="off">
          {formatDuration(elapsed)}
        </div>
        {limit && (
          <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-sakura-deep transition-[width]" style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} />
          </div>
        )}
        <dl className="mt-4 grid w-full max-w-md grid-cols-3 gap-2">
          {[
            [t('record.samples'), formatNumber(count, 0, LOCALE[lang])],
            [t('record.rate'), `${formatNumber(rate, 1, LOCALE[lang])}/s`],
            [t('record.markers'), String(current.markers.length)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface-2 py-2.5">
              <dd className="num text-lg">{v}</dd>
              <dt className="text-xs text-ink-muted">{k}</dt>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {current.config.signals.slice(0, 8).map((id) => {
          const sig = SIGNAL_BY_ID[id];
          if (!sig) return null;
          const f = formatSignal(sig, values[id]?.v, units, lang);
          return (
            <div key={id} className="card px-3 py-2.5">
              <div className="truncate text-xs text-ink-muted">{loc(sig.short, lang)}</div>
              <div className="num text-lg">
                {f.text} <span className="text-xs text-ink-muted">{f.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {noteFor !== undefined && (
        <Card className="flex flex-col gap-3 p-4">
          <label htmlFor="marker-note" className="text-sm font-medium">
            {t('record.notePrompt', { time: formatDuration((current.markers[noteFor]?.t ?? 0) / 1000) })}
          </label>
          <div className="flex gap-2">
            <input
              id="marker-note"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveNote()}
              placeholder={t('record.notePlaceholder')}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 text-[15px] focus:border-ink focus:outline-none"
            />
            <Button variant="primary" onClick={saveNote}>
              {t('common.save')}
            </Button>
          </div>
        </Card>
      )}

      <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-3 lg:bottom-6">
        <Button
          size="lg"
          variant="secondary"
          icon={<MapPin size={20} className="text-beni" />}
          onClick={() => {
            setNoteFor(addMarker());
            setNote('');
          }}
        >
          {t('record.mark')}
        </Button>
        <Button size="lg" variant="primary" icon={<Square size={18} fill="currentColor" />} onClick={() => void stop()}>
          {t('record.stop')}
        </Button>
      </div>
      <p className="text-center text-xs text-ink-faint">{t('record.markHint')}</p>
    </div>
  );
}

function History({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const sessions = useRecording((s) => s.sessions);
  const remove = useRecording((s) => s.removeSession);
  const list = useMemo(() => sessions.filter((s) => s.endedAt), [sessions]);

  return (
    <section>
      <SectionTitle kanji="履歴">{t('record.history')}</SectionTitle>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{t('record.historyEmpty')}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((s: SessionMeta) => (
            <li key={s.id} className="flex items-center">
              <button onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">
                    {new Date(s.startedAt).toLocaleString(LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="num block text-xs text-ink-muted">
                    {formatDuration(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)} · {t('record.samplesCount', { count: s.sampleCount })} ·{' '}
                    {t(`record.presets.${s.config.preset}.title`)}
                    {s.status === 'interrupted' && ` · ${t('record.interrupted')}`}
                  </span>
                </span>
                <ChevronRight size={18} className="text-ink-faint" />
              </button>
              <button onClick={() => void remove(s.id)} className="grid size-12 place-items-center text-ink-faint hover:text-beni" aria-label={t('common.delete')}>
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-faint">{t('record.localOnly')}</p>
    </section>
  );
}

function RecoveredNotice({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const recovered = useRecording((s) => s.recovered);
  const dismiss = useRecording((s) => s.dismissRecovered);
  const first = recovered[0];
  if (!first) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-kin-soft p-4 sm:flex-row sm:items-center" role="status">
      <p className="flex-1 text-[15px]">{t('record.recovered', { count: recovered.length })}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => { onOpen(first); dismiss(); }}>
          {t('record.recoveredOpen')}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

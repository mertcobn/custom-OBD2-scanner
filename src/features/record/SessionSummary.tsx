import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, MapPin, Package, RotateCcw, Sheet as SheetIcon, Trash2 } from 'lucide-react';
import { SIGNAL_BY_ID } from '@/obd/signals';
import { formatDuration, formatSignal, loc, LOCALE, signalUnit, useDisplayValue } from '@/lib/format';
import { computeStats } from '@/lib/stats';
import type { Sample } from '@/obd/types';
import { useRecording, type SessionMeta } from '@/state/recording';
import { useSettings } from '@/state/settings';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Badge, Card, Chip, SectionTitle } from '@/ui/controls';
import { TimeChart } from '@/ui/TimeChart';

export function SessionSummary({ session, onBack, fresh }: { session: SessionMeta; onBack: () => void; fresh?: boolean }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const toDisplay = useDisplayValue();
  const remove = useRecording((s) => s.removeSession);
  const signals = useMemo(() => session.config.signals.filter((id) => SIGNAL_BY_ID[id]), [session.config.signals]);
  const [chartId, setChartId] = useState(signals[0]);
  const [samples, setSamples] = useState<Sample[]>();
  useEffect(() => {
    let alive = true;
    void useRecording
      .getState()
      .loadSamples(session.id)
      .then((s) => alive && setSamples(s));
    return () => {
      alive = false;
    };
  }, [session.id]);
  const duration = ((session.endedAt ?? session.startedAt) - session.startedAt) / 1000;

  const bySignal = useMemo(() => {
    const m: Record<string, { t: number[]; v: number[] }> = {};
    for (const s of samples ?? []) {
      const e = (m[s.id] ??= { t: [], v: [] });
      e.t.push(s.t);
      e.v.push(s.v);
    }
    return m;
  }, [samples]);

  const stats = useMemo(() => Object.fromEntries(signals.map((id) => [id, computeStats(bySignal[id]?.v ?? [])])), [bySignal, signals]);

  const chart = useMemo(() => {
    const d = chartId ? bySignal[chartId] : undefined;
    if (!d || !chartId) return { x: [] as number[], y: [] as number[] };
    return { x: d.t.map((t) => t / 1000), y: d.v.map((v) => toDisplay(chartId, v)) };
  }, [bySignal, chartId, toDisplay]);

  const chartSig = chartId ? SIGNAL_BY_ID[chartId] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={fresh ? <RotateCcw size={15} /> : <ArrowLeft size={15} />} onClick={onBack}>
          {fresh ? t('record.newRecording') : t('common.back')}
        </Button>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-semibold">{fresh ? t('record.finishedTitle') : t('record.sessionTitle')}</h2>
          <Badge tone="sakura">{t(`record.presets.${session.config.preset}.title`)}</Badge>
          {session.status === 'interrupted' && <Badge tone="kin">{t('record.interrupted')}</Badge>}
          {session.snapshot.demo && <Badge>{t('common.demo')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {new Date(session.startedAt).toLocaleString(LOCALE[lang], { dateStyle: 'full', timeStyle: 'short' })}
        </p>
        {session.events.some((e) => e.type === 'paused') && (
          <p className="mt-3 rounded-2xl bg-kin-soft px-3 py-2 text-sm">
            {t('record.pauses', { count: session.events.filter((e) => e.type === 'paused').length })}
          </p>
        )}
        {!samples && <p className="mt-3 text-sm text-ink-muted">{t('record.loading')}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t('record.duration'), formatDuration(duration)],
            [t('record.samples'), formatNumber(samples?.length ?? session.sampleCount, 0, LOCALE[lang])],
            [t('record.signals'), String(signals.length)],
            [t('record.markers'), String(session.markers.length)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface-2 px-3 py-2.5">
              <dt className="text-xs text-ink-muted">{k}</dt>
              <dd className="num text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5">
        <SectionTitle kanji="出力">{t('export.title')}</SectionTitle>
        <p className="-mt-2 mb-4 text-sm text-ink-muted">{t('export.body')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { key: 'pdf', icon: FileText },
            { key: 'ai', icon: Package },
            { key: 'csv', icon: SheetIcon },
          ].map(({ key, icon: Icon }) => (
            <button
              key={key}
              disabled
              className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon size={22} className="mt-0.5 shrink-0 text-sakura-deep" />
              <span>
                <span className="block font-medium">{t(`export.${key}.title`)}</span>
                <span className="block text-xs leading-snug text-ink-muted">{t(`export.${key}.body`)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-faint">{t('export.soon')}</p>
      </Card>

      {signals.length > 0 && (
        <Card className="p-5">
          <SectionTitle kanji="図表">{t('record.chart')}</SectionTitle>
          <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
            {signals.map((id) => (
              <Chip key={id} active={chartId === id} onClick={() => setChartId(id)}>
                {loc(SIGNAL_BY_ID[id]!.short, lang)}
              </Chip>
            ))}
          </div>
          {chartSig && (
            <TimeChart
              x={chart.x}
              series={[{ label: loc(chartSig.short, lang), values: chart.y }]}
              unit={signalUnit(chartSig, units)}
              markers={session.markers.map((m) => (session.startedAt + m.t) / 1000)}
            />
          )}
        </Card>
      )}

      {session.markers.length > 0 && (
        <Card className="p-5">
          <SectionTitle kanji="印">{t('record.markers')}</SectionTitle>
          <ul>
            {session.markers.map((m, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <MapPin size={16} className="text-beni" />
                <span className="num text-sm text-ink-muted">{formatDuration(m.t / 1000)}</span>
                <span className="text-[15px]">{m.note || t('record.noNote')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <SectionTitle kanji="統計">{t('record.stats')}</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs text-ink-muted">
                <th className="px-5 py-2 font-medium">{t('record.signal')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('stats.min')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('stats.mean')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('stats.max')}</th>
                <th className="px-5 py-2 text-right font-medium">{t('stats.count')}</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((id) => {
                const sig = SIGNAL_BY_ID[id]!;
                const st = stats[id];
                const f = (v?: number) => formatSignal(sig, v, units, lang).text;
                return (
                  <tr key={id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      {loc(sig.short, lang)} <span className="text-xs text-ink-faint">{signalUnit(sig, units)}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{f(st?.min)}</td>
                    <td className="num px-3 py-2.5 text-right">{f(st?.mean)}</td>
                    <td className="num px-3 py-2.5 text-right">{f(st?.max)}</td>
                    <td className="num px-5 py-2.5 text-right text-ink-muted">{st?.count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Button
        variant="ghost"
        className="self-center text-beni"
        icon={<Trash2 size={16} />}
        onClick={() => {
          void remove(session.id);
          if (fresh) useRecording.getState().discard();
          onBack();
        }}
      >
        {t('record.deleteSession')}
      </Button>
    </div>
  );
}

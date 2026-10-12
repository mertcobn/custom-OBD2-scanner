import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { SIGNAL_BY_ID } from '@/obd/signals';
import { formatSignal, loc, signalUnit, useDisplayValue } from '@/lib/format';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Badge, Row } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { TimeChart } from '@/ui/TimeChart';
import { CATEGORY_COLOR } from '@/lib/categoryColor';

export function SignalDetailSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const pinned = useSettings((s) => (id ? s.pinned.includes(id) : false));
  const togglePinned = useSettings((s) => s.togglePinned);
  const history = useLive((s) => (id ? s.history[id] : undefined));
  const toDisplay = useDisplayValue();
  const sig = id ? SIGNAL_BY_ID[id] : undefined;

  const chart = useMemo(() => {
    const pts = history ?? [];
    return {
      x: pts.map((p) => p.t / 1000),
      y: pts.map((p) => (sig ? toDisplay(sig.id, p.v) : p.v)),
    };
  }, [history, sig, toDisplay]);

  const stats = useMemo(() => {
    const pts = history ?? [];
    if (!pts.length) return undefined;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const p of pts) {
      min = Math.min(min, p.v);
      max = Math.max(max, p.v);
      sum += p.v;
    }
    return { min, max, mean: sum / pts.length, last: pts[pts.length - 1]!.v };
  }, [history]);

  if (!sig) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const fmt = (v?: number) => {
    const f = formatSignal(sig, v, units, lang);
    return `${f.text} ${f.unit}`.trim();
  };
  const series = [{ label: loc(sig.short, lang), values: chart.y, color: getComputedStyle(document.documentElement).getPropertyValue(CATEGORY_COLOR[sig.category].slice(4, -1)).trim() || undefined }];

  return (
    <Sheet open={!!id} onClose={onClose} title={loc(sig.name, lang)} kanji="詳細" wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="ai">{t(`categories.${sig.category}`)}</Badge>
        <Badge className="num">{sig.source === 'elm' ? 'ATRV' : `Mode 01 · PID ${sig.pid.toString(16).toUpperCase().padStart(2, '0')}`}</Badge>
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Star size={15} fill={pinned ? 'currentColor' : 'none'} />} onClick={() => togglePinned(sig.id)}>
          {pinned ? t('live.unpin') : t('live.pin')}
        </Button>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="num text-4xl font-medium">{formatSignal(sig, stats?.last, units, lang).text}</span>
        <span className="text-sm text-ink-muted">{signalUnit(sig, units)}</span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">{t('live.windowHint')}</p>

      <div className="-mx-1 mb-5 rounded-2xl bg-surface-2/50 p-2">
        <TimeChart x={chart.x} series={series} unit={signalUnit(sig, units)} height={200} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {(['min', 'mean', 'max'] as const).map((k) => (
          <div key={k} className="rounded-2xl bg-surface-2 px-2 py-3">
            <dt className="text-xs text-ink-muted">{t(`stats.${k}`)}</dt>
            <dd className="num mt-1 text-[15px]">{fmt(stats?.[k])}</dd>
          </div>
        ))}
      </dl>

      <dl className="mt-4">
        <Row label={t('live.formula')} mono>{sig.formula}</Row>
        <Row label={t('live.range')} mono>
          {fmt(sig.min)} … {fmt(sig.max)}
        </Row>
        {sig.normal && (
          <Row label={t('live.normal')} mono>
            {fmt(sig.normal[0])} … {fmt(sig.normal[1])}
          </Row>
        )}
      </dl>
    </Sheet>
  );
}

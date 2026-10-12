import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Search, Star } from 'lucide-react';
import { useWatch } from '@/obd/controller';
import { CATEGORIES, SIGNAL_BY_ID, type SignalCategory } from '@/obd/signals';
import { PollScheduler } from '@/obd/services/scheduler';
import { cx } from '@/lib/cx';
import { formatSignal, health, loc, LOCALE } from '@/lib/format';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/controls';
import { EmptyState, PageHeader } from '@/ui/layout';
import { Sparkline } from '@/ui/Sparkline';
import { SignalDetailSheet } from './SignalDetailSheet';
import { CATEGORY_COLOR } from '@/lib/categoryColor';

type Filter = 'all' | 'pinned' | SignalCategory;

export function LivePage() {
  const { t } = useTranslation();
  const connected = useConnection((s) => s.status === 'connected');
  const openConnect = useUi((s) => s.openConnect);
  if (!connected)
    return (
      <>
        <PageHeader title={t('nav.live')} kanji="数値" />
        <EmptyState
          title={t('live.emptyTitle')}
          body={t('live.emptyBody')}
          action={
            <Button variant="primary" icon={<Bluetooth size={18} />} onClick={openConnect}>
              {t('common.connect')}
            </Button>
          }
        />
      </>
    );
  return <LiveList />;
}

function LiveList() {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const pinned = useSettings((s) => s.pinned);
  const supported = useLive((s) => s.supported);
  const rate = useLive((s) => s.rate);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<string>();
  const [visible, setVisible] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: supported.length, pinned: supported.filter((id) => pinned.includes(id)).length };
    for (const id of supported) {
      const cat = SIGNAL_BY_ID[id]?.category;
      if (cat) c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [supported, pinned]);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang);
    const items = supported
      .map((id) => SIGNAL_BY_ID[id]!)
      .filter(Boolean)
      .filter((s) => (filter === 'all' ? true : filter === 'pinned' ? pinned.includes(s.id) : s.category === filter))
      .filter(
        (s) =>
          !q ||
          loc(s.name, lang).toLocaleLowerCase(lang).includes(q) ||
          loc(s.short, lang).toLocaleLowerCase(lang).includes(q) ||
          s.pid.toString(16).padStart(2, '0').includes(q),
      );
    // Pinned first, then catalogue order.
    return items.sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  }, [supported, filter, query, pinned, lang]);

  const visibleIds = useMemo(() => [...visible], [visible]);
  useWatch(detail ? [...visibleIds, detail] : visibleIds);
  const perSignalHz = PollScheduler.estimateRate(visibleIds, rate || 1).fast;

  const onVisible = useCallback(
    (id: string, isVisible: boolean) =>
      setVisible((prev) => {
        if (prev.has(id) === isVisible) return prev;
        const next = new Set(prev);
        if (isVisible) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );

  return (
    <div>
      <PageHeader
        title={t('nav.live')}
        kanji="数値"
        subtitle={
          <span className="num text-sm">
            {t('live.subtitle', { count: supported.length, hz: formatNumber(perSignalHz, 1, LOCALE[lang]) })}
          </span>
        }
      />
      <div className="sticky top-14 z-20 -mx-4 bg-bg/90 px-4 pt-1 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <label className="relative block">
          <span className="sr-only">{t('live.search')}</span>
          <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('live.search')}
            className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px] placeholder:text-ink-faint focus:border-ink focus:outline-none"
          />
        </label>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="toolbar" aria-label={t('live.filters')}>
          {(['all', 'pinned', ...CATEGORIES] as Filter[])
            .filter((f) => f === 'all' || f === 'pinned' || counts[f])
            .map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={counts[f] ?? 0}>
                {f === 'pinned' && <Star size={13} />}
                {f !== 'all' && f !== 'pinned' && <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[f] }} aria-hidden />}
                {t(`categories.${f}`)}
              </Chip>
            ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-ink-muted">{filter === 'pinned' ? t('live.noPinned') : t('live.noResults')}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((s) => (
            <LiveRow key={s.id} id={s.id} onOpen={() => setDetail(s.id)} onVisible={onVisible} />
          ))}
        </ul>
      )}
      <SignalDetailSheet id={detail} onClose={() => setDetail(undefined)} />
    </div>
  );
}

function LiveRow({ id, onOpen, onVisible }: { id: string; onOpen: () => void; onVisible: (id: string, v: boolean) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLLIElement>(null);
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const isPinned = useSettings((s) => s.pinned.includes(id));
  const togglePinned = useSettings((s) => s.togglePinned);
  const reading = useLive((s) => s.values[id]);
  const history = useLive((s) => s.history[id]);
  const sig = SIGNAL_BY_ID[id]!;
  const f = formatSignal(sig, reading?.v, units, lang);
  const h = health(sig, reading?.v);

  // Only signals on screen are polled — keeps the adapter fast for what you actually look at.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => onVisible(id, !!e?.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => {
      io.disconnect();
      onVisible(id, false);
    };
  }, [id, onVisible]);

  return (
    <li ref={ref} className="flex items-center">
      <button
        onClick={() => togglePinned(id)}
        className={cx('grid h-16 w-12 shrink-0 place-items-center', isPinned ? 'text-sakura-deep' : 'text-ink-faint hover:text-ink-muted')}
        aria-label={isPinned ? t('live.unpin') : t('live.pin')}
        aria-pressed={isPinned}
      >
        <Star size={17} fill={isPinned ? 'currentColor' : 'none'} />
      </button>
      <button onClick={onOpen} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pr-4 text-left hover:bg-surface-2/60">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[sig.category] }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-ink">{loc(sig.name, lang)}</span>
          <span className="num block text-xs text-ink-faint">
            {sig.source === 'elm' ? 'ATRV' : `01 ${sig.pid.toString(16).toUpperCase().padStart(2, '0')}`}
          </span>
        </span>
        <span className="hidden sm:block">
          <Sparkline points={history} color={CATEGORY_COLOR[sig.category]} />
        </span>
        <span className="w-28 shrink-0 text-right">
          <span className={cx('num text-lg font-medium', h === 'high' && 'text-beni', h === 'low' && 'text-ai', !reading && 'text-ink-faint')}>
            {f.text}
          </span>
          <span className="unit ml-1 text-xs text-ink-muted">{f.unit}</span>
        </span>
      </button>
    </li>
  );
}

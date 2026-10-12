import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/units/units';
import { LOCALE } from '@/lib/format';
import { useConnection } from '@/state/connection';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { Hanko } from '@/ui/Hanko';

/** Always-visible connection status. Opens the connection sheet. */
export function ConnectionPill({ variant }: { variant: 'pill' | 'card' }) {
  const { t } = useTranslation();
  const status = useConnection((s) => s.status);
  const adapter = useConnection((s) => s.adapter);
  const demo = useConnection((s) => s.demo);
  const lang = useSettings((s) => s.language);
  const open = useUi((s) => s.openConnect);

  const connected = status === 'connected';
  const busy = status === 'connecting' || status === 'reconnecting';
  const label = connected
    ? demo
      ? t('connect.demoName')
      : adapter?.name ?? t('connect.connected')
    : busy
      ? t(`connect.status.${status}`)
      : status === 'error'
        ? t('connect.status.error')
        : t('connect.status.idle');
  const voltage =
    connected && adapter?.voltage !== undefined ? `${formatNumber(adapter.voltage, 1, LOCALE[lang])} V` : undefined;

  const seal = (
    <Hanko
      char={connected ? '接' : status === 'error' ? '!' : '断'}
      tone={connected ? 'beni' : status === 'error' ? 'kin' : 'muted'}
      filled={connected || status === 'error'}
      pulse={busy}
      size={variant === 'card' ? 34 : 24}
    />
  );

  if (variant === 'pill') {
    return (
      <button
        onClick={open}
        className={cx(
          'flex h-10 min-w-0 items-center gap-2 rounded-full border pr-3.5 pl-2 text-sm font-medium transition-colors',
          connected ? 'border-line bg-surface' : 'border-line bg-surface text-ink-muted',
        )}
        aria-label={t('connect.open')}
      >
        {seal}
        <span className="min-w-0 max-w-[8.5rem] truncate">{connected ? voltage ?? label : label}</span>
      </button>
    );
  }

  return (
    <button onClick={open} className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-2" aria-label={t('connect.open')}>
      {seal}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-ink-muted">
          {connected ? [adapter?.elmVersion, voltage].filter(Boolean).join(' · ') : t('connect.tapToConnect')}
        </span>
      </span>
      <ChevronRight size={18} className="text-ink-faint" />
    </button>
  );
}

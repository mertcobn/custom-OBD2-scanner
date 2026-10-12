import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, FileText, Loader2, Package, Share2, Sheet as SheetIcon, type LucideIcon } from 'lucide-react';
import type { Dataset } from '@/export/dataset';
import { buildExport, canShareFiles, download, share, type ExportKind } from '@/export';
import { cx } from '@/lib/cx';
import { useSettings } from '@/state/settings';
import { track } from '@/lib/telemetry';

const ITEMS: { key: ExportKind; icon: LucideIcon }[] = [
  { key: 'pdf', icon: FileText },
  { key: 'ai', icon: Package },
  { key: 'csv', icon: SheetIcon },
];

/** Export buttons. `getDataset` is called lazily so large recordings are only loaded when needed. */
export function ExportPanel({ getDataset, kinds = ['pdf', 'ai', 'csv'] }: { getDataset: () => Promise<Dataset>; kinds?: ExportKind[] }) {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const units = useSettings((s) => s.units);
  const [busy, setBusy] = useState<ExportKind>();
  const [done, setDone] = useState<ExportKind>();
  const [error, setError] = useState(false);
  const shareable = canShareFiles();

  const run = async (kind: ExportKind, via: 'download' | 'share') => {
    setBusy(kind);
    setError(false);
    try {
      const file = await buildExport(kind, await getDataset(), { lang, units });
      if (via === 'share') await share(file);
      else download(file);
      setDone(kind);
      track('export', { kind, via });
      setTimeout(() => setDone((d) => (d === kind ? undefined : d)), 2500);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div>
      <div className={cx('grid gap-3', kinds.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {ITEMS.filter((i) => kinds.includes(i.key)).map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-surface">
            <button
              onClick={() => void run(key, 'download')}
              disabled={!!busy}
              className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              {busy === key ? (
                <Loader2 size={22} className="mt-0.5 shrink-0 animate-spin text-sakura-deep" />
              ) : done === key ? (
                <Check size={22} className="mt-0.5 shrink-0 text-matcha" />
              ) : (
                <Icon size={22} className="mt-0.5 shrink-0 text-sakura-deep" />
              )}
              <span className="min-w-0">
                <span className="block font-medium">{busy === key ? t('report.working') : t(`export.${key}.title`)}</span>
                <span className="block text-xs leading-snug text-ink-muted">{t(`export.${key}.body`)}</span>
              </span>
            </button>
            {shareable && (
              <button
                onClick={() => void run(key, 'share')}
                disabled={!!busy}
                className="grid w-11 shrink-0 place-items-center border-l border-line text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60"
                aria-label={`${t('report.share')}: ${t(`export.${key}.title`)}`}
              >
                <Share2 size={17} />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-beni">{t('report.failed')}</p>}
    </div>
  );
}

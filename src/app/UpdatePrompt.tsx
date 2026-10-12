import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import { useRecording } from '@/state/recording';
import { Button } from '@/ui/Button';

/** "New version available" — only offered when it can't interrupt a recording. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const recording = useRecording((s) => s.status === 'recording');
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // The "works offline" note is informational: let it fade away by itself.
  useEffect(() => {
    if (!offlineReady) return;
    const id = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(id);
  }, [offlineReady, setOfflineReady]);

  if (recording || (!needRefresh && !offlineReady)) return null;
  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };
  return (
    <div role="status" className="card fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 p-3 pl-4 lg:bottom-6">
      <p className="flex-1 text-sm">{needRefresh ? t('pwa.update') : t('pwa.offline')}</p>
      {needRefresh && (
        <Button size="sm" variant="primary" icon={<RefreshCw size={15} />} onClick={() => void updateServiceWorker(true)}>
          {t('pwa.reload')}
        </Button>
      )}
      <button onClick={close} className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface-2" aria-label={t('common.close')}>
        <X size={16} />
      </button>
    </div>
  );
}

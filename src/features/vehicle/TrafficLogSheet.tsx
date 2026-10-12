import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ScrollText } from 'lucide-react';
import { formatTrafficLog, trafficLog } from '@/obd/services/realBackend';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';

/** Raw ELM327 conversation — the first thing to look at when a real adapter misbehaves. */
export function TrafficLogButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const show = () => {
    setText(formatTrafficLog(trafficLog.slice(-150)));
    setOpen(true);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatTrafficLog(trafficLog));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" icon={<ScrollText size={15} />} onClick={show}>
        {t('vehicle.log.open')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('vehicle.log.title')}
        kanji="記録"
        wide
        footer={
          <Button block icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? t('common.copied') : t('vehicle.log.copy')}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-ink-muted">{t('vehicle.log.hint')}</p>
        <pre className="num max-h-[55dvh] overflow-auto rounded-2xl bg-surface-2 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {text || t('vehicle.log.empty')}
        </pre>
      </Sheet>
    </>
  );
}

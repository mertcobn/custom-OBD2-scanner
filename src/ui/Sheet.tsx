import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';

/**
 * Modal sheet: slides up from the bottom on phones, centred dialog on wide screens.
 * Built on <dialog> for native focus trapping, Esc handling and inert background.
 */
export function Sheet({
  open,
  onClose,
  title,
  kanji,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kanji?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-[rgb(20_18_16/0.42)] backdrop:backdrop-blur-[2px]',
        'sm:m-auto sm:w-[calc(100%-2rem)]',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
    >
      {open && (
        <div className="card safe-bottom flex max-h-[88dvh] flex-col rounded-b-none sm:max-h-[85dvh] sm:rounded-b-[var(--radius-card)]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <header className="flex items-start gap-3 px-5 pb-2 pt-4 sm:pt-5">
            <div className="min-w-0 flex-1">
              {kanji && <div className="font-serif text-xs tracking-[0.3em] text-sakura-deep">{kanji}</div>}
              <h2 className="font-serif text-xl font-semibold leading-tight">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="-mr-2 grid size-10 place-items-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <footer className="border-t border-line px-5 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

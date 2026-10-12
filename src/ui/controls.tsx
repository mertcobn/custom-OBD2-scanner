import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-2xl bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-9 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium transition-all',
              active ? 'bg-surface text-ink shadow-[var(--shadow)]' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-sakura-deep' : 'bg-line')}
    >
      <span
        className={cx(
          'absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('num text-xs', active ? 'opacity-70' : 'text-ink-faint')}>{count}</span>}
    </button>
  );
}

export type BadgeTone = 'neutral' | 'beni' | 'kin' | 'matcha' | 'ai' | 'sakura';

const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  beni: 'bg-beni-soft text-beni',
  kin: 'bg-kin-soft text-kin',
  matcha: 'bg-matcha-soft text-matcha',
  ai: 'bg-ai-soft text-ai',
  sakura: 'bg-sakura-soft text-sakura-deep',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('card', className)}>{children}</As>;
}

export function SectionTitle({ children, kanji, action }: { children: ReactNode; kanji?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-baseline gap-2 font-serif text-lg font-semibold">
        {children}
        {kanji && <span className="text-xs font-normal tracking-[0.25em] text-ink-faint">{kanji}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Label/value row for definition lists. */
export function Row({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={cx('min-w-0 text-right text-[15px] text-ink', mono && 'num break-all')}>{children}</dd>
    </div>
  );
}

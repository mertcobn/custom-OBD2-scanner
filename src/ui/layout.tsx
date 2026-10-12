import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { BranchIllustration } from './Sakura';

export function PageHeader({ title, kanji, subtitle, actions }: { title: string; kanji: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="mb-1 font-serif text-xs tracking-[0.35em] text-sakura-deep" aria-hidden>
          {kanji}
        </div>
        <h1 className="font-serif text-[1.85rem] font-semibold leading-none tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
  illustration = true,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  illustration?: boolean;
}) {
  return (
    <div className={cx('card seigaiha relative overflow-hidden px-6 py-10 text-center', className)}>
      {illustration && <BranchIllustration className="mx-auto mb-5 h-20 w-auto" />}
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}

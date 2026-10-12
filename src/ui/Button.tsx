import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sakura';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-ink/90 active:bg-ink/80 shadow-[var(--shadow)]',
  sakura: 'bg-sakura-deep text-on-accent hover:bg-sakura-deep/90 active:bg-sakura-deep/80 shadow-[var(--shadow)]',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 active:bg-surface-2',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-beni text-on-accent hover:bg-beni/90 active:bg-beni/80',
};

const SIZES: Record<Size, string> = {
  // min-h (not h): a label that has to wrap makes the button taller instead of spilling out.
  sm: 'min-h-9 px-3 py-1.5 text-sm gap-1.5 rounded-xl whitespace-nowrap',
  md: 'min-h-11 px-4 py-2 text-[15px] gap-2 rounded-2xl',
  lg: 'min-h-14 px-6 py-3 text-base gap-2.5 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center text-center leading-tight font-medium transition-colors duration-150 disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

import { cx } from '@/lib/cx';

/** A brush circle that keeps drawing itself — the "please wait" mark. */
export function EnsoLoader({ size = 72, className, done }: { size?: number; className?: string; done?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cx('shrink-0', className)} aria-hidden>
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke={done ? 'var(--beni)' : 'var(--ink)'}
        strokeWidth="7"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={done ? '92 100' : '70 100'}
        transform="rotate(115 50 50)"
        className={done ? undefined : 'origin-center animate-spin [animation-duration:1.6s]'}
        style={{ transition: 'stroke-dasharray 500ms ease, stroke 300ms' }}
      />
    </svg>
  );
}

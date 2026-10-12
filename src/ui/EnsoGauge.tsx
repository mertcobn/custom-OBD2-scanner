import { useId, useMemo } from 'react';
import { cx } from '@/lib/cx';
import type { Health } from '@/lib/format';

/**
 * Ensō (円相) gauge — a brush-stroke circle that "fills with ink" as the value rises.
 * The sweep is 300°, leaving the traditional open gap at the bottom.
 */

const START_DEG = 120;
const SWEEP_DEG = 300;
const CX = 100;
const CY = 100;
const R = 78;

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** A slightly irregular arc, so the ring reads as a hand-drawn brush stroke rather than a perfect circle. */
function brushPath(fromDeg: number, sweep: number, wobble: number, phase: number): string {
  const steps = Math.max(8, Math.round(sweep / 4));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const deg = fromDeg + (sweep * i) / steps;
    const r = R + Math.sin((deg * Math.PI) / 60 + phase) * wobble + Math.sin((deg * Math.PI) / 23) * wobble * 0.4;
    const [x, y] = polar(deg, r);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

const TONE: Record<Health, string> = {
  normal: 'var(--ink)',
  unknown: 'var(--ink)',
  low: 'var(--ai)',
  high: 'var(--beni)',
};

export interface EnsoGaugeProps {
  label: string;
  /** Formatted value text */
  text: string;
  unit: string;
  /** Numeric value in display unit, used for the arc */
  value?: number;
  min: number;
  max: number;
  health?: Health;
  accent?: boolean;
  /** Ink colour for a normal reading (a CSS colour, e.g. the signal category's traditional colour). */
  color?: string;
  size?: 'md' | 'lg';
  className?: string;
}

export function EnsoGauge({ label, text, unit, value, min, max, health = 'unknown', accent, color: ink, size = 'md', className }: EnsoGaugeProps) {
  const id = useId();
  const track = useMemo(() => brushPath(START_DEG, SWEEP_DEG, 1.6, 0.4), []);
  const echo = useMemo(() => brushPath(START_DEG + 4, SWEEP_DEG - 10, 2.4, 2.1), []);
  const frac = value === undefined || !Number.isFinite(value) ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const color = health === 'high' || health === 'low' ? TONE[health] : (ink ?? (accent ? 'var(--sakura-deep)' : TONE[health]));
  const [tx, ty] = polar(START_DEG + SWEEP_DEG * frac, R);
  const hasValue = value !== undefined && Number.isFinite(value);

  return (
    <figure
      className={cx('relative flex aspect-square w-full select-none items-center justify-center', className)}
      aria-label={`${label}: ${text} ${unit}`}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="1.6" />
          </filter>
        </defs>
        {/* track */}
        <path d={track} fill="none" stroke="var(--line)" strokeWidth={size === 'lg' ? 11 : 12} strokeLinecap="round" />
        <path d={echo} fill="none" stroke="var(--line)" strokeOpacity={0.6} strokeWidth={3} strokeLinecap="round" />
        {/* ink */}
        <path
          d={track}
          fill="none"
          stroke={color}
          strokeWidth={size === 'lg' ? 11 : 12}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${frac * 100} 100`}
          filter={`url(#${id}-rough)`}
          style={{ transition: 'stroke-dasharray 420ms cubic-bezier(.3,.7,.4,1), stroke 300ms' }}
        />
        {hasValue && frac > 0.01 && (
          <circle cx={tx} cy={ty} r={3.2} fill="var(--bg)" stroke={color} strokeWidth={1.5} style={{ transition: 'all 420ms cubic-bezier(.3,.7,.4,1)' }} />
        )}
      </svg>
      <figcaption className="relative z-10 flex flex-col items-center px-3 text-center">
        <span
          className={cx(
            'num font-medium leading-none tracking-tight text-ink',
            size === 'lg' ? 'text-[clamp(2.2rem,9vw,3.6rem)]' : 'text-[clamp(1.5rem,6vw,2.35rem)]',
            !hasValue && 'text-ink-faint',
          )}
        >
          {text}
        </span>
        <span className="unit mt-1 text-xs font-medium text-ink-muted">{unit || ' '}</span>
        <span className="mt-1.5 line-clamp-1 max-w-[9rem] text-[13px] text-ink-muted">{label}</span>
      </figcaption>
    </figure>
  );
}

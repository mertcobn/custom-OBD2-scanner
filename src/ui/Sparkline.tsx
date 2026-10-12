import { useMemo } from 'react';
import type { Reading } from '@/state/live';

/** Minimal ink-line sparkline. Values are in base units; scale is relative so units don't matter. */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  color = 'var(--ai)',
  windowMs = 30_000,
}: {
  points: Reading[] | undefined;
  width?: number;
  height?: number;
  color?: string;
  windowMs?: number;
}) {
  const d = useMemo(() => {
    if (!points || points.length < 2) return '';
    const end = points[points.length - 1]!.t;
    const start = end - windowMs;
    const visible = points.filter((p) => p.t >= start);
    if (visible.length < 2) return '';
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of visible) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    const span = hi - lo || Math.abs(hi) || 1;
    const pad = 2;
    return visible
      .map((p, i) => {
        const x = ((p.t - start) / windowMs) * width;
        const y = height - pad - ((p.v - lo) / span) * (height - pad * 2);
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, width, height, windowMs]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      {d && <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

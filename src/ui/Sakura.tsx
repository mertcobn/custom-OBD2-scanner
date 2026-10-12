import { useEffect, useState, type CSSProperties } from 'react';

/** Five-petal sakura blossom mark. */
export function SakuraMark({ size = 20, className, color = 'var(--sakura)' }: { size?: number; className?: string; color?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className={className} aria-hidden>
      {[0, 72, 144, 216, 288].map((r) => (
        <path
          key={r}
          transform={`rotate(${r})`}
          d="M0 -6 C -14 -16 -18 -34 -8 -44 L 0 -38 L 8 -44 C 18 -34 14 -16 0 -6 Z"
          fill={color}
        />
      ))}
      <circle r="6" fill="var(--sakura-deep)" opacity="0.8" />
    </svg>
  );
}

/** A single falling petal shape. */
function Petal({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 20 24" width="14" height="17" className="absolute top-0 animate-fall" style={style} aria-hidden>
      <path d="M10 23 C 2 16 -1 8 4 2 L 10 6 L 16 2 C 21 8 18 16 10 23 Z" fill="var(--sakura)" opacity="0.9" />
    </svg>
  );
}

function makePetals(count: number): { key: number; style: CSSProperties }[] {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    style: {
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 0.9}s`,
      '--fall-duration': `${2.6 + Math.random() * 1.8}s`,
      '--drift': `${(Math.random() - 0.3) * 160}px`,
      '--spin': `${(Math.random() > 0.5 ? 1 : -1) * (300 + Math.random() * 400)}deg`,
    } as CSSProperties,
  }));
}

function Burst({ count }: { count: number }) {
  const [petals] = useState(() => makePetals(count));
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 5200);
    return () => clearTimeout(t);
  }, []);
  if (done || petals.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {petals.map((p) => (
        <Petal key={p.key} style={p.style} />
      ))}
    </div>
  );
}

/** A short, gentle shower of petals (e.g. on successful connection). Each new `trigger` value starts a new burst. */
export function SakuraShower({ trigger, count = 18 }: { trigger: number; count?: number }) {
  return trigger ? <Burst key={trigger} count={count} /> : null;
}

/** A few petals drifting slowly and endlessly — background atmosphere for the welcome screen. */
export function AmbientPetals({ count = 9 }: { count?: number }) {
  const [petals] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      key: i,
      style: {
        left: `${(i / count) * 100 + Math.random() * 8}%`,
        animationDelay: `${-Math.random() * 14}s`,
        '--fall-duration': `${11 + Math.random() * 7}s`,
        '--drift': `${(Math.random() - 0.3) * 120}px`,
        '--spin': `${(Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 300)}deg`,
      } as CSSProperties,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {petals.map((p) => (
        <svg key={p.key} viewBox="0 0 20 24" width="13" height="16" className="absolute top-0 animate-drift" style={p.style}>
          <path d="M10 23 C 2 16 -1 8 4 2 L 10 6 L 16 2 C 21 8 18 16 10 23 Z" fill="var(--sakura)" opacity="0.75" />
        </svg>
      ))}
    </div>
  );
}

/** Ink-drawn blossom branch, used in empty states. */
export function BranchIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" className={className} aria-hidden>
      <path
        d="M4 108 C 40 96 70 84 96 64 C 118 48 140 40 170 34 M96 64 C 104 46 108 30 122 18 M140 44 C 150 52 162 60 178 62"
        fill="none"
        stroke="var(--ink)"
        strokeOpacity="0.75"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[
        [170, 34, 1],
        [122, 18, 0.85],
        [178, 62, 0.9],
        [96, 64, 0.7],
        [150, 38, 0.6],
        [60, 86, 0.65],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${(s as number) * 0.24})`}>
          {[0, 72, 144, 216, 288].map((r) => (
            <path key={r} transform={`rotate(${r + i * 11})`} d="M0 -6 C -14 -16 -18 -34 -8 -44 L 0 -38 L 8 -44 C 18 -34 14 -16 0 -6 Z" fill="var(--sakura)" />
          ))}
          <circle r="7" fill="var(--sakura-deep)" />
        </g>
      ))}
    </svg>
  );
}

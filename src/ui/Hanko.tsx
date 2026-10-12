import { cx } from '@/lib/cx';

export type HankoTone = 'beni' | 'muted' | 'kin' | 'matcha';

const FILLED: Record<HankoTone, string> = {
  beni: 'border-beni bg-beni text-[#fbf3ea]',
  muted: 'border-ink-faint bg-ink-faint text-bg',
  kin: 'border-kin bg-kin text-[#fbf3ea]',
  matcha: 'border-matcha bg-matcha text-[#fbf3ea]',
};

const TONES: Record<HankoTone, string> = {
  beni: 'text-beni border-beni',
  muted: 'text-ink-faint border-ink-faint/60',
  kin: 'text-kin border-kin',
  matcha: 'text-matcha border-matcha',
};

/**
 * Hanko (判子) — a red personal seal. Used as the connection status mark and as the brand stamp.
 * Filled = active/stamped, outline = inactive.
 */
export function Hanko({
  char,
  tone = 'beni',
  filled = true,
  size = 28,
  pulse,
  className,
  title,
}: {
  char: string;
  tone?: HankoTone;
  filled?: boolean;
  size?: number;
  pulse?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      className={cx(
        'relative inline-grid shrink-0 -rotate-6 place-items-center rounded-[28%] border-2 font-serif font-bold leading-none',
        filled ? FILLED[tone] : TONES[tone],
        pulse && 'animate-breathe',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.56 }}
    >
      <span className="translate-y-[-3%]">{char}</span>
      {filled && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[28%] opacity-40 mix-blend-screen"
          style={{ backgroundImage: 'var(--paper-noise)', backgroundSize: '80px' }}
        />
      )}
    </span>
  );
}

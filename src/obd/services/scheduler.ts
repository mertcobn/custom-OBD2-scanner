import { SIGNAL_BY_ID, type PollTier } from '@/obd/signals';

/** A tier is polled once every N rounds. */
const TIER_EVERY: Record<PollTier, number> = { fast: 1, medium: 3, slow: 10 };

/** Per-signal tier overrides, e.g. a catalyst test polls the O2 sensors fast and the context slowly. */
export type TierOverrides = Partial<Record<string, PollTier>>;

const tierOf = (id: string, tiers: TierOverrides) => tiers[id] ?? SIGNAL_BY_ID[id]!.tier;

/**
 * Weighted round-robin poll scheduler.
 *
 * Each "round" contains every fast signal, medium signals every 3rd round and
 * slow signals every 10th round. Signals that share a PID (e.g. O2 voltage + trim)
 * are collapsed so the PID is requested only once per round.
 */
export class PollScheduler {
  private queue: string[] = [];
  private round = 0;
  private watched: string[] = [];
  private tiers: TierOverrides = {};

  setWatched(ids: string[], tiers: TierOverrides = {}): void {
    const next = [...new Set(ids)].filter((id) => SIGNAL_BY_ID[id]);
    const same =
      next.length === this.watched.length &&
      next.every((id, i) => id === this.watched[i] && tiers[id] === this.tiers[id]);
    if (same) return;
    this.watched = next;
    this.tiers = tiers;
    // Drop queued signals that are no longer watched.
    this.queue = this.queue.filter((id) => next.includes(id));
  }

  get size(): number {
    return this.watched.length;
  }

  /** Next signal id to request, or undefined when nothing is watched. */
  next(): string | undefined {
    if (this.watched.length === 0) return undefined;
    while (this.queue.length === 0) this.fillRound();
    return this.queue.shift();
  }

  private fillRound(): void {
    const seenKeys = new Set<string>();
    for (const id of this.watched) {
      const s = SIGNAL_BY_ID[id];
      if (!s) continue;
      if (this.round % TIER_EVERY[tierOf(id, this.tiers)] !== 0) continue;
      const key = s.source === 'elm' ? id : `${s.mode}:${s.pid}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      this.queue.push(id);
    }
    this.round++;
  }

  /** Signals that are answered by the same request as `id` (same PID). */
  static siblings(id: string, watched: Iterable<string>): string[] {
    const s = SIGNAL_BY_ID[id];
    if (!s || s.source === 'elm') return [id];
    const out: string[] = [];
    for (const w of watched) {
      const o = SIGNAL_BY_ID[w];
      if (o && o.source === 'obd' && o.pid === s.pid) out.push(w);
    }
    return out.length ? out : [id];
  }

  /** Expected per-signal update rate (Hz) for a given total request throughput. */
  static estimateRate(ids: string[], requestsPerSecond: number, tiers: TierOverrides = {}): Record<PollTier, number> {
    const counts: Record<PollTier, number> = { fast: 0, medium: 0, slow: 0 };
    const seen = new Set<string>();
    for (const id of ids) {
      const s = SIGNAL_BY_ID[id];
      if (!s) continue;
      const key = s.source === 'elm' ? id : `${s.pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[tierOf(id, tiers)]++;
    }
    // Requests per round, averaged over a 30-round cycle.
    const perRound = counts.fast + counts.medium / 3 + counts.slow / 10;
    if (perRound === 0) return { fast: 0, medium: 0, slow: 0 };
    const roundsPerSec = requestsPerSecond / perRound;
    return { fast: roundsPerSec, medium: roundsPerSec / 3, slow: roundsPerSec / 10 };
  }
}

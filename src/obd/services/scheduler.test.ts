import { describe, expect, it } from 'vitest';
import { PollScheduler } from './scheduler';

function take(s: PollScheduler, n: number): string[] {
  return Array.from({ length: n }, () => s.next()!);
}

describe('PollScheduler', () => {
  it('returns nothing when no signal is watched', () => {
    expect(new PollScheduler().next()).toBeUndefined();
  });

  it('polls fast signals more often than slow ones', () => {
    const s = new PollScheduler();
    s.setWatched(['rpm', 'coolantTemp']);
    const out = take(s, 200);
    const rpm = out.filter((x) => x === 'rpm').length;
    const coolant = out.filter((x) => x === 'coolantTemp').length;
    expect(rpm).toBeGreaterThan(coolant * 5);
    expect(coolant).toBeGreaterThan(0);
  });

  it('requests a shared PID only once per round', () => {
    const s = new PollScheduler();
    s.setWatched(['o2VB1S1', 'o2TrimB1S1']);
    const out = take(s, 3);
    expect(out.every((x) => x === 'o2VB1S1')).toBe(true);
    expect(PollScheduler.siblings('o2VB1S1', ['o2VB1S1', 'o2TrimB1S1', 'rpm'])).toEqual(['o2VB1S1', 'o2TrimB1S1']);
  });

  it('ignores unknown ids and drops unwatched queued items', () => {
    const s = new PollScheduler();
    s.setWatched(['rpm', 'speed', 'nope']);
    expect(s.size).toBe(2);
    s.next();
    s.setWatched(['rpm']);
    expect(take(s, 5).every((x) => x === 'rpm')).toBe(true);
  });

  it('estimates per-tier rates', () => {
    const r = PollScheduler.estimateRate(['rpm', 'speed'], 10);
    expect(r.fast).toBeCloseTo(5);
  });
});

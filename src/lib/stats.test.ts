import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';

describe('computeStats', () => {
  it('handles empty input', () => {
    expect(computeStats([])).toBeUndefined();
    expect(computeStats([NaN])).toBeUndefined();
  });

  it('computes descriptive statistics', () => {
    const s = computeStats([1, 2, 3, 4, 5])!;
    expect(s).toMatchObject({ count: 5, min: 1, max: 5, mean: 3, p50: 3 });
    expect(s.std).toBeCloseTo(Math.SQRT2);
    expect(s.p95).toBeCloseTo(4.8);
  });
});

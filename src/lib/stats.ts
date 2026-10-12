export interface Stats {
  count: number;
  min: number;
  max: number;
  mean: number;
  std: number;
  p05: number;
  p50: number;
  p95: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Descriptive statistics; NaN/Infinity are ignored. Returns undefined for an empty series. */
export function computeStats(values: number[]): Stats | undefined {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return undefined;
  const sorted = v.slice().sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  return {
    count: v.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    std: Math.sqrt(variance),
    p05: quantile(sorted, 0.05),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
  };
}

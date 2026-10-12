import { describe, expect, it } from 'vitest';
import { convert, IMPERIAL, METRIC, unitLabel } from './units';

describe('units', () => {
  it('keeps metric values untouched', () => {
    expect(convert(100, 'speed', METRIC)).toMatchObject({ value: 100, unit: 'km/h' });
    expect(convert(90, 'temperature', METRIC)).toMatchObject({ value: 90, unit: '°C' });
  });

  it('converts to imperial', () => {
    expect(convert(100, 'speed', IMPERIAL).value).toBeCloseTo(62.137, 2);
    expect(convert(100, 'temperature', IMPERIAL).value).toBe(212);
    expect(convert(101.325, 'pressure', IMPERIAL).value).toBeCloseTo(14.696, 2);
    expect(convert(10, 'fuelRate', IMPERIAL).value).toBeCloseTo(2.6417, 3);
  });

  it('supports bar pressure', () => {
    expect(convert(250, 'pressure', { ...METRIC, pressure: 'bar' })).toMatchObject({ value: 2.5, unit: 'bar' });
  });

  it('labels unit-less quantities', () => {
    expect(unitLabel('percent', METRIC)).toBe('%');
    expect(unitLabel('rpm', IMPERIAL)).toBe('rpm');
  });
});

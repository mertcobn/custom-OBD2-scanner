import { describe, expect, it } from 'vitest';
import { describeDtc, dtcSystem, isGeneric } from './dtc';

describe('dtc descriptions', () => {
  it('describes known codes in both languages', () => {
    expect(describeDtc('P0301', 'en').title).toBe('Cylinder 1 misfire detected');
    expect(describeDtc('P0301', 'tr').title).toContain('tekleme');
    expect(describeDtc('P0301', 'en').severity).toBe('high');
  });

  it('falls back to the subsystem for unknown codes', () => {
    const d = describeDtc('P0399', 'en');
    expect(d.known).toBe(false);
    expect(d.title).toBe('Ignition system or misfire');
  });

  it('classifies system and generic/manufacturer codes', () => {
    expect(dtcSystem('U0100')).toBe('network');
    expect(dtcSystem('C0035')).toBe('chassis');
    expect(isGeneric('P0420')).toBe(true);
    expect(isGeneric('P1234')).toBe(false);
    expect(isGeneric('P3400')).toBe(true);
    expect(isGeneric('P3000')).toBe(false);
    expect(isGeneric('B1000')).toBe(false);
  });
});

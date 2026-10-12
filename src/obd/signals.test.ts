import { describe, expect, it } from 'vitest';
import { getSignal, SIGNALS } from './signals';

const dec = (id: string, bytes: number[]) => getSignal(id).decode(bytes);

describe('signal decoders (SAE J1979 examples)', () => {
  it.each([
    ['rpm', [0x1a, 0xf8], 1726],
    ['speed', [0x32], 50],
    ['coolantTemp', [0x7b], 83],
    ['intakeTemp', [0x00], -40],
    ['engineLoad', [0xff], 100],
    ['throttle', [0x80], 50.19607843137255],
    ['timingAdvance', [0x80], 0],
    ['maf', [0x01, 0x2c], 3],
    ['stftB1', [0x80], 0],
    ['stftB1', [0x00], -100],
    ['ltftB1', [0x8c], 9.375],
    ['o2VB1S1', [0x5a, 0x80], 0.45],
    ['o2TrimB1S1', [0x5a, 0x80], 0],
    ['lambda24S1', [0x80, 0x00, 0, 0], 1],
    ['catTempB1S1', [0x11, 0x94], 410],
    ['moduleVoltage', [0x37, 0x14], 14.1],
    ['fuelRate', [0x00, 0x64], 5],
    ['fuelPressure', [0x64], 300],
    ['fuelRailPressure', [0x01, 0x00], 2560],
    ['evapVaporPressure', [0xff, 0xfc], -0.001],
    ['odometer', [0x00, 0x00, 0x30, 0x39], 1234.5],
    ['demandTorque', [0x7d], 0],
    ['injectionTiming', [0x69, 0x00], 0],
    ['cmdLambda', [0x80, 0x00], 1],
    ['runTime', [0x01, 0x00], 256],
  ] as [string, number[], number][])('%s %j → %d', (id, bytes, expected) => {
    expect(dec(id, bytes)).toBeCloseTo(expected, 6);
  });

  it('O2 trim byte FF means "not used"', () => {
    expect(getSignal('o2TrimB1S1').valid!([0x5a, 0xff])).toBe(false);
    expect(getSignal('o2TrimB1S1').valid!([0x5a, 0x80])).toBe(true);
  });

  it('every decoder stays inside its declared range for extreme inputs', () => {
    for (const s of SIGNALS.filter((x) => x.source === 'obd')) {
      for (const fill of [0x00, 0x7f, 0x80, 0xff]) {
        const v = s.decode(Array(s.bytes).fill(fill));
        expect(v, `${s.id} @${fill}`).toBeGreaterThanOrEqual(s.min - 1e-6);
        expect(v, `${s.id} @${fill}`).toBeLessThanOrEqual(s.max + 1e-6);
      }
    }
  });

  it('has unique ids and bilingual names', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SIGNALS) {
      expect(s.name.tr && s.name.en && s.short.tr && s.short.en, s.id).toBeTruthy();
    }
  });
});

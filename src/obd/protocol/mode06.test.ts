import { describe, expect, it } from 'vitest';
import { parseResponse } from './frames';
import { decodeMode06, monitorName, scaleValue, testName } from './mode06';

describe('Mode 06 scaling (UASID)', () => {
  it('scales unsigned and signed values', () => {
    expect(scaleValue(0x0b, 450)).toMatchObject({ value: 0.45, unit: 'V' }); // 0.001 V
    expect(scaleValue(0x10, 72)).toMatchObject({ value: 72, unit: 'ms' });
    expect(scaleValue(0x16, 1200)).toMatchObject({ value: 80, unit: '°C' }); // 0.1 °C − 40
    expect(scaleValue(0x24, 37)).toMatchObject({ value: 37, unit: '' });
    expect(scaleValue(0x8b, 0xfffe)).toMatchObject({ value: -0.002, unit: 'V' }); // signed
    expect(scaleValue(0x77, 5)).toMatchObject({ value: 5, known: false });
  });
});

describe('Mode 06 decoding', () => {
  it('decodes a multi-test, multi-frame CAN response with pass/fail', () => {
    // 46 01 | TID01 UASID0B 0x01C2(0.450) min 0x0190(0.400) max 0x01F4(0.500)
    //       | TID05 UASID10 0x0048(72ms)  min 0x0000 max 0x0064(100ms)
    //       | TID06 UASID10 0x00C8(200ms) min 0x0000 max 0x0064(100ms)  → FAIL
    const lines = [
      '7E8 10 1A 46 01 01 0B 01 C2',
      '7E8 21 01 90 01 F4 05 10 00',
      '7E8 22 48 00 00 00 64 06 10',
      '7E8 23 00 C8 00 00 00 64 00',
    ];
    const tests = decodeMode06(parseResponse(lines, 'can11'), 0x01);
    expect(tests).toHaveLength(3);
    expect(tests[0]).toMatchObject({ tid: 0x01, value: 0.45, min: 0.4, max: 0.5, unit: 'V', pass: true, ecu: '7E8' });
    expect(tests[1]).toMatchObject({ tid: 0x05, value: 72, unit: 'ms', pass: true });
    expect(tests[2]).toMatchObject({ tid: 0x06, value: 200, max: 100, pass: false });
  });

  it('ignores answers for other monitors', () => {
    expect(decodeMode06(parseResponse(['7E8 0A 46 21 80 24 00 01 00 00 00 05'], 'can11'), 0x01)).toEqual([]);
  });

  it('names monitors and tests', () => {
    expect(monitorName(0x01).en).toBe('O2 sensor (Bank 1 Sensor 1)');
    expect(monitorName(0x06).en).toBe('O2 sensor (Bank 2 Sensor 2)');
    expect(monitorName(0x21).tr).toBe('Katalizör (Banka 1)');
    expect(monitorName(0xa2).en).toBe('Misfire — cylinder 1');
    expect(monitorName(0xee).en).toBe('Monitor $EE');
    expect(testName(0x01, 0x05).en).toBe('Rich-to-lean switch time');
    expect(testName(0xa2, 0x0c).en).toContain('Misfire count');
    expect(testName(0x21, 0x80).en).toBe('Manufacturer test $80');
  });
});

import { describe, expect, it } from 'vitest';
import { findPidData, frameFormatFor, parseResponse, protocolName } from './frames';

describe('frame format', () => {
  it('maps protocol numbers', () => {
    expect(frameFormatFor('A6')).toBe('can11');
    expect(frameFormatFor('7')).toBe('can29');
    expect(frameFormatFor('3')).toBe('legacy');
    expect(protocolName('A6')).toContain('11 bit, 500');
  });
});

describe('parseResponse — CAN 11 bit', () => {
  it('parses single frames from several ECUs', () => {
    const msgs = parseResponse(['7E8 06 41 00 BE 3F A8 13', '7E9 06 41 00 98 18 80 11'], 'can11');
    expect(msgs).toEqual([
      { ecu: '7E8', data: [0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13] },
      { ecu: '7E9', data: [0x41, 0x00, 0x98, 0x18, 0x80, 0x11] },
    ]);
  });

  it('ignores padding bytes beyond the PCI length', () => {
    const msgs = parseResponse(['7E8 04 41 0C 1A F8 55 55 55'], 'can11');
    expect(msgs[0]!.data).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
  });

  it('parses unspaced output', () => {
    const msgs = parseResponse(['7E8044105' + '7B'], 'can11');
    expect(msgs[0]).toEqual({ ecu: '7E8', data: [0x41, 0x05, 0x7b] });
  });

  it('reassembles ISO-TP multi-frame (VIN)', () => {
    const msgs = parseResponse(
      ['7E8 10 14 49 02 01 31 44 34', '7E8 21 47 50 30 30 52 35 35', '7E8 22 42 31 32 33 34 35 36'],
      'can11',
    );
    expect(msgs).toHaveLength(1);
    const d = msgs[0]!.data;
    expect(d.slice(0, 3)).toEqual([0x49, 0x02, 0x01]);
    expect(String.fromCharCode(...d.slice(3))).toBe('1D4GP00R55B123456');
  });

  it('prefers the engine ECU when finding PID data', () => {
    const msgs = parseResponse(['7E9 03 41 0D 10', '7E8 03 41 0D 32'], 'can11');
    expect(findPidData(msgs, 0x41, 0x0d)).toEqual({ ecu: '7E8', data: [0x32] });
    expect(findPidData(msgs, 0x41, 0x0c)).toBeUndefined();
  });
});

describe('parseResponse — CAN 29 bit', () => {
  it('parses 4-byte headers', () => {
    const msgs = parseResponse(['18 DA F1 10 03 41 0D 32'], 'can29');
    expect(msgs).toEqual([{ ecu: '18DAF110', data: [0x41, 0x0d, 0x32] }]);
  });
});

describe('parseResponse — legacy', () => {
  it('strips header and checksum', () => {
    const msgs = parseResponse(['48 6B 10 41 0C 1A F8 C3'], 'legacy');
    expect(msgs).toEqual([{ ecu: '10', data: [0x41, 0x0c, 0x1a, 0xf8] }]);
  });

  it('ignores junk lines', () => {
    expect(parseResponse(['SEARCHING...', 'NO DATA', ''], 'legacy')).toEqual([]);
    expect(parseResponse(['BUS INIT: ...OK'], 'can11')).toEqual([]);
  });
});

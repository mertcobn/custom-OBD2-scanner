import { describe, expect, it } from 'vitest';
import { decodeSupportedMask, encodeSupportedMask, hasNextRange, signalsForPids } from './supported';

describe('supported PID masks', () => {
  it('decodes the classic example BE 1F A8 13', () => {
    const pids = decodeSupportedMask(0x00, [0xbe, 0x1f, 0xa8, 0x13]);
    expect(pids).toEqual([0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x13, 0x15, 0x1c, 0x1f, 0x20]);
    expect(hasNextRange(0x00, pids)).toBe(true);
  });

  it('round-trips', () => {
    const pids = [0x21, 0x2f, 0x33, 0x40];
    expect(decodeSupportedMask(0x20, encodeSupportedMask(0x20, pids))).toEqual(pids);
  });

  it('maps PIDs to signals including multi-signal PIDs', () => {
    const ids = signalsForPids([0x0c, 0x14]);
    expect(ids).toEqual(expect.arrayContaining(['rpm', 'o2VB1S1', 'o2TrimB1S1', 'adapterVoltage']));
    expect(ids).not.toContain('speed');
  });
});

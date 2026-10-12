import { SIGNALS } from '@/obd/signals';

/**
 * Supported-PID bitmasks (Mode 01 PIDs 00, 20, 40, …): 4 bytes, MSB of the first byte = base+1.
 * Returns the set of supported PIDs in (base, base+0x20].
 */
export function decodeSupportedMask(base: number, data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const byte = data[i >> 3] ?? 0;
    if (byte & (0x80 >> (i & 7))) out.push(base + i + 1);
  }
  return out;
}

/** Does the mask announce the next range (bit for base+0x20)? */
export function hasNextRange(base: number, pids: number[]): boolean {
  return pids.includes(base + 0x20);
}

/** Inverse of decodeSupportedMask — used by the simulator. */
export function encodeSupportedMask(base: number, pids: number[]): number[] {
  const out = [0, 0, 0, 0];
  for (const pid of pids) {
    const i = pid - base - 1;
    if (i < 0 || i >= 32) continue;
    out[i >> 3]! |= 0x80 >> (i & 7);
  }
  return out;
}

/** Signal ids served by a set of supported Mode 01 PIDs (plus adapter-level readings). */
export function signalsForPids(pids: Iterable<number>): string[] {
  const set = new Set(pids);
  return SIGNALS.filter((s) => (s.source === 'elm' ? true : set.has(s.pid))).map((s) => s.id);
}

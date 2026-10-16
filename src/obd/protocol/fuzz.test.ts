import { describe, expect, it } from 'vitest';
import { Elm327, ElmError } from '@/obd/elm/elm327';
import { SIGNALS } from '@/obd/signals';
import { Listeners, type Transport } from '@/obd/transport/types';
import { decodeCalibrationIds, decodeDtcMessages, decodeEcuName, decodeMonitorStatus, decodeVin } from './diagnostics';
import { parseResponse, type FrameFormat } from './frames';
import { decodeMode06 } from './mode06';

/**
 * Robustness: whatever a broken, noisy or hostile adapter prints, parsing and decoding must never
 * throw, hang or produce values outside a signal's physical range.
 */

/** Small deterministic PRNG (mulberry32) so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = '0123456789ABCDEF';
const JUNK = ['SEARCHING...', 'NO DATA', '?', 'STOPPED', 'BUS INIT: ...OK', 'CAN ERROR', '<DATA ERROR', 'OK', '', ' ', '>', '\0', 'ÿþ', '7E8', '18 DA F1', '0:', '1:', '014'];

function randomLine(r: () => number): string {
  const kind = r();
  if (kind < 0.15) return JUNK[Math.floor(r() * JUNK.length)]!;
  const n = Math.floor(r() * 14);
  const bytes = Array.from({ length: n }, () => HEX[Math.floor(r() * 16)]! + HEX[Math.floor(r() * 16)]!);
  if (kind < 0.45) return ['7E8', ...bytes].join(' ');
  if (kind < 0.6) return ['18', 'DA', 'F1', '10', ...bytes].join(' ');
  if (kind < 0.75) return ['48', '6B', '10', ...bytes].join(' ');
  if (kind < 0.85) return bytes.join(''); // unspaced
  return Array.from({ length: Math.floor(r() * 40) }, () => String.fromCharCode(Math.floor(r() * 128))).join('');
}

describe('fuzz: frame parsing and decoding', () => {
  it('never throws on 20 000 random responses, in every frame format', () => {
    const r = rng(1979);
    for (let i = 0; i < 20_000; i++) {
      const lines = Array.from({ length: 1 + Math.floor(r() * 6) }, () => randomLine(r));
      for (const format of ['can11', 'can29', 'legacy'] as FrameFormat[]) {
        const msgs = parseResponse(lines, format);
        for (const m of msgs) {
          expect(typeof m.ecu).toBe('string');
          expect(m.data.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
        }
        decodeDtcMessages(msgs, 0x43, 'stored', format);
        const vin = decodeVin(msgs, format);
        if (vin !== undefined) expect(vin).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/);
        decodeCalibrationIds(msgs, format);
        decodeEcuName(msgs, format);
        decodeMode06(msgs, Math.floor(r() * 256));
      }
    }
  });

  it('every signal decodes any byte pattern to a value within its declared range (or rejects it)', () => {
    const r = rng(42);
    const outOfRange: string[] = [];
    for (const s of SIGNALS) {
      if (s.source !== 'obd') continue;
      const patterns = [new Array(s.bytes).fill(0), new Array(s.bytes).fill(0xff)];
      for (let i = 0; i < 300; i++) patterns.push(Array.from({ length: s.bytes }, () => Math.floor(r() * 256)));
      for (const d of patterns) {
        if (s.valid && !s.valid(d)) continue;
        const v = s.decode(d);
        expect(Number.isFinite(v), `${s.id} ${d.join(',')}`).toBe(true);
        // 1 % slack for rounding in the declared bounds
        const slack = (s.max - s.min) * 0.01;
        if (v < s.min - slack || v > s.max + slack) outOfRange.push(`${s.id}: ${v} from [${d.join(', ')}] (range ${s.min}…${s.max})`);
      }
    }
    expect([...new Set(outOfRange.map((x) => x.split(':')[0]))], outOfRange.slice(0, 10).join('\n')).toEqual([]);
  });

  it('monitor status decodes any 4 bytes', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const m = decodeMonitorStatus(Array.from({ length: Math.floor(r() * 6) }, () => Math.floor(r() * 256)));
      expect(m.dtcCount).toBeGreaterThanOrEqual(0);
      expect(m.dtcCount).toBeLessThanOrEqual(127);
    }
  });
});

describe('fuzz: ELM327 driver against a garbage-spewing adapter', () => {
  it('every command settles (answer, typed error or timeout) and the queue never wedges', async () => {
    const r = rng(2024);
    const data = new Listeners<[string]>();
    const close = new Listeners<[Error | undefined]>();
    const t: Transport = {
      kind: 'sim',
      deviceName: 'garbage',
      connect: async () => undefined,
      disconnect: async () => undefined,
      write: async () => {
        // Random output: sometimes nothing, sometimes several prompts, random fragmentation.
        const roll = r();
        if (roll < 0.1) return;
        const lines = Array.from({ length: Math.floor(r() * 4) }, () => randomLine(r).replace(/>/g, ''));
        let out = `${lines.join('\r')}\r\r>`;
        if (roll > 0.9) out += 'junk\r>';
        let i = 0;
        while (i < out.length) {
          const n = 1 + Math.floor(r() * 12);
          const chunk = out.slice(i, i + n);
          setTimeout(() => data.emit(chunk), Math.floor(r() * 3));
          i += n;
        }
      },
      onData: (cb) => data.add(cb),
      onClose: (cb) => close.add(cb),
    };
    const elm = new Elm327(t);
    let ok = 0;
    let typed = 0;
    for (let i = 0; i < 300; i++) {
      try {
        const lines = await elm.send(i % 3 ? '010C' : 'ATRV', { timeoutMs: 40 });
        expect(Array.isArray(lines)).toBe(true);
        ok++;
      } catch (e) {
        expect(e).toBeInstanceOf(ElmError);
        typed++;
      }
    }
    expect(ok + typed).toBe(300);
    expect(ok).toBeGreaterThan(100);
  }, 60_000);
});

import { afterEach, describe, expect, it } from 'vitest';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useVehicle } from '@/state/vehicle';
import { Elm327Emulator, type EmulatorOptions } from '@/obd/sim/elmEmulator';
import { DEMO_SCENARIO, type SimScenario } from '@/obd/sim/scenario';
import { createVehicleModel } from '@/obd/sim/vehicleModel';
import { Listeners, type Transport } from '@/obd/transport/types';
import type { Sample } from '@/obd/types';
import { sampleBus } from './bus';
import { RealBackend } from './realBackend';

/**
 * Compatibility matrix: the full connect → poll → DTC → VIN pipeline against adapters with the
 * quirks seen on real (mostly clone) ELM327s, and against cars on every OBD-II protocol.
 */

interface Quirks {
  /** Per-command latency (ms). */
  latencyMs?: number;
  /** Bytes per notification (BLE packets are often 20). */
  chunkSize?: number;
  /** "\r\n" line endings instead of "\r". */
  crlf?: boolean;
  /** NUL bytes sprinkled into the output (seen on some cheap clones). */
  nulls?: boolean;
  /** ATE0 is accepted but echo stays on. */
  echoStuck?: boolean;
  /** AT commands this clone answers with "?". */
  unknownAt?: string[];
  /** Junk the adapter prints when the link comes up (stale buffer, half a frame, a stray prompt). */
  bootGarbage?: string;
  /** The first ATZ is swallowed (adapter still booting). */
  firstAtzLost?: boolean;
  /** ATI / ATZ banner. */
  banner?: string;
  /** First OBD request takes this long (slow automatic search). */
  searchDelayMs?: number;
  /** Unsolicited frames from another module mixed into answers. */
  busChatter?: boolean;
  /** Every nth OBD request fails with a transient bus error (BUS BUSY / CAN ERROR / STOPPED). */
  flakyEvery?: number;
  /** Trailing spaces / blank lines around answers. */
  sloppyWhitespace?: boolean;
  emulator?: EmulatorOptions;
  scenario?: Partial<SimScenario>;
}

class QuirkyAdapter implements Transport {
  readonly kind = 'sim' as const;
  readonly deviceName = 'Quirky ELM327';
  readonly sent: string[] = [];
  private emu: Elm327Emulator;
  private data = new Listeners<[string]>();
  private close = new Listeners<[Error | undefined]>();
  private pending = '';
  private queue: Promise<void> = Promise.resolve();
  private open = false;
  private atzSeen = 0;
  private obdCount = 0;
  private searched = false;

  get latencyMs() {
    return this.q.latencyMs;
  }

  constructor(private readonly q: Quirks = {}) {
    this.emu = new Elm327Emulator(createVehicleModel(3), { ...DEMO_SCENARIO, ...q.scenario }, q.emulator ?? { secondEcu: true });
  }

  async connect() {
    this.open = true;
    if (this.q.bootGarbage) setTimeout(() => this.emit(this.q.bootGarbage!), 0);
  }

  async disconnect() {
    this.open = false;
    this.close.emit(undefined);
    this.data.clear();
    this.close.clear();
  }

  async write(text: string) {
    this.pending += text;
    let i: number;
    while ((i = this.pending.indexOf('\r')) !== -1) {
      const cmd = this.pending.slice(0, i);
      this.pending = this.pending.slice(i + 1);
      this.sent.push(cmd);
      this.queue = this.queue.then(() => this.answer(cmd));
    }
  }

  private async answer(cmd: string) {
    const q = this.q;
    const c = cmd.trim().toUpperCase().replace(/\s+/g, '');
    let delay = q.latencyMs ?? 1;
    const obd = /^[0-9A-F]{2,}$/.test(c);
    if (obd && !this.searched && q.searchDelayMs) {
      this.searched = true;
      delay += q.searchDelayMs;
    }
    await new Promise((r) => setTimeout(r, delay));
    if (!this.open) return;

    if (c === 'ATZ' && q.firstAtzLost && this.atzSeen++ === 0) return; // swallowed
    let out: string;
    const at = c.startsWith('AT') ? c.slice(2) : undefined;
    if (at !== undefined && q.unknownAt?.includes(at)) out = `${this.emu.echo ? `${cmd}\r` : ''}?\r\r>`;
    else if (obd && q.flakyEvery && ++this.obdCount % q.flakyEvery === 0 && this.obdCount > 12)
      out = `${this.emu.echo ? `${cmd}\r` : ''}${['BUS BUSY', 'CAN ERROR', 'STOPPED'][this.obdCount % 3]}\r\r>`;
    else {
      out = this.emu.handle(cmd);
      if (q.echoStuck) this.emu.echo = true;
    }
    if (q.banner) out = out.replace(/ELM327 v1\.5/g, q.banner);
    if (obd && q.busChatter) out = out.replace(/\r\r>$/, '\r7EB 03 7F 22 11\r7E0 02 01 0C\r\r>');
    if (q.sloppyWhitespace) out = out.replace(/\r/g, '  \r').replace(/>$/, '\r \r>');
    if (q.crlf) out = out.replace(/\r/g, '\r\n');
    if (q.nulls) out = out.replace(/\r/g, '\0\r');
    this.emit(out);
  }

  private emit(out: string) {
    const size = this.q.chunkSize ?? 20;
    for (let i = 0; i < out.length; i += size) this.data.emit(out.slice(i, i + size));
  }

  onData(cb: (chunk: string) => void) {
    return this.data.add(cb);
  }

  onClose(cb: (error?: Error) => void) {
    return this.close.add(cb);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fullRun(adapter: QuirkyAdapter) {
  const backend = new RealBackend('sim', adapter);
  try {
    await backend.connect();
    const c = useConnection.getState();
    expect(c.status, c.error?.report).toBe('connected');

    // Live data flows
    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    backend.setWatched(['rpm', 'speed', 'coolantTemp']);
    await wait(Math.max(700, (adapter.latencyMs ?? 1) * 25));
    off();
    backend.setWatched([]);
    const rpm = got.filter((s) => s.id === 'rpm').map((s) => s.v);
    expect(rpm.length, 'rpm samples').toBeGreaterThan(0);
    expect(Math.min(...rpm)).toBeGreaterThan(500);
    expect(Math.max(...rpm)).toBeLessThan(8000);
    expect(new Set(got.map((s) => s.id))).toEqual(new Set(['rpm', 'speed', 'coolantTemp']));

    // Vehicle info + DTCs
    await wait(50);
    await backend.readDtcs();
    const v = useVehicle.getState();
    expect(v.info?.vin).toBe('JTDBR32E720012345');
    expect(v.dtcs.map((d) => `${d.kind}:${d.code}`).sort()).toEqual(['pending:P0171', 'stored:P0301']);
    expect(v.freezeFrame?.values.rpm).toBe(812);
    return { protocol: c.protocol!, ecus: useVehicle.getState().info?.ecus ?? [] };
  } finally {
    await backend.disconnect();
  }
}

afterEach(() => {
  useConnection.getState().reset();
  useLive.getState().clear();
  useVehicle.getState().reset();
});

describe('adapter quirks (clone ELM327s)', () => {
  const cases: [string, Quirks][] = [
    ['clean v1.5', {}],
    ['BLE: 1-byte packets', { chunkSize: 1 }],
    ['BLE: 20-byte packets, 120 ms latency', { chunkSize: 20, latencyMs: 120 }],
    ['CR LF line endings', { crlf: true }],
    ['NUL bytes in output', { nulls: true }],
    ['echo cannot be turned off', { echoStuck: true }],
    ['stale buffer + half frame + stray prompt at boot (field report)', { bootGarbage: '7EB CF A0 24 92\r>41 0C 1A\r' }],
    ['first ATZ swallowed', { firstAtzLost: true }],
    ['first ATZ swallowed, slow BLE', { firstAtzLost: true, latencyMs: 80, chunkSize: 20 }],
    ['v2.1 clone without ATAT / ATL / ATDPN', { banner: 'ELM327 v2.1', unknownAt: ['AT1', 'L0', 'DPN'] }],
    ['slow automatic search (6 s)', { searchDelayMs: 6000 }],
    ['other modules chattering on the bus', { busChatter: true }],
    ['busy bus: BUS BUSY / CAN ERROR now and then', { flakyEvery: 5 }],
    ['sloppy whitespace', { sloppyWhitespace: true }],
    ['automatic search gives up (field report: OBDBLE)', { emulator: { secondEcu: true, autoSearchFails: true } }],
    ['everything at once', { chunkSize: 3, crlf: true, nulls: true, echoStuck: true, bootGarbage: 'xx\r>', busChatter: true, sloppyWhitespace: true }],
  ];
  for (const [name, q] of cases) {
    it(name, async () => {
      const r = await fullRun(new QuirkyAdapter(q));
      expect(r.protocol).toBe('ISO 15765-4 CAN (11 bit, 500 kbaud)');
      expect(r.ecus[0]).toBe('7E8');
    }, 40_000);
  }
});

describe('cars on every OBD-II protocol', () => {
  const cases: [SimScenario['protocol'], string, string][] = [
    ['6', 'ISO 15765-4 CAN (11 bit, 500 kbaud)', '7E8'],
    ['8', 'ISO 15765-4 CAN (11 bit, 250 kbaud)', '7E8'],
    ['7', 'ISO 15765-4 CAN (29 bit, 500 kbaud)', '18DAF110'],
    ['9', 'ISO 15765-4 CAN (29 bit, 250 kbaud)', '18DAF110'],
    ['3', 'ISO 9141-2 (5 baud init)', '10'],
    ['4', 'ISO 14230-4 KWP (5 baud init)', '10'],
    ['5', 'ISO 14230-4 KWP (fast init)', '10'],
    ['1', 'SAE J1850 PWM (41.6 kbaud)', '10'],
    ['2', 'SAE J1850 VPW (10.4 kbaud)', '10'],
  ];
  for (const autoFails of [false, true]) {
    for (const [protocol, name, ecu] of cases) {
      it(`protocol ${protocol}${autoFails ? ' (automatic search fails)' : ''}`, async () => {
        const r = await fullRun(new QuirkyAdapter({ scenario: { protocol }, emulator: { secondEcu: true, autoSearchFails: autoFails } }));
        expect(r.protocol).toBe(name);
        expect(r.ecus[0]).toBe(ecu);
      }, 40_000);
    }
  }
});

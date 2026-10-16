import { afterEach, describe, expect, it } from 'vitest';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { Elm327Emulator } from '@/obd/sim/elmEmulator';
import { DEMO_SCENARIO } from '@/obd/sim/scenario';
import { createVehicleModel } from '@/obd/sim/vehicleModel';
import { RealBackend } from '@/obd/services/realBackend';
import { sampleBus } from '@/obd/services/bus';
import type { Sample } from '@/obd/types';
import { BLE_PROFILES, BleTransport } from './ble';

/**
 * A fake Web Bluetooth adapter: GATT services/characteristics as real ELM327 BLE clones expose
 * them, with an ELM327 emulator behind the write characteristic and 20-byte notifications.
 */

const u16 = (x: number) => `0000${x.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

interface Props {
  write?: boolean;
  writeWithoutResponse?: boolean;
  notify?: boolean;
  indicate?: boolean;
  read?: boolean;
}

class FakeChar extends EventTarget {
  value?: DataView;
  notifying = false;
  writes: Uint8Array[] = [];
  constructor(
    readonly uuid: string,
    readonly properties: Props,
    private readonly sink?: (bytes: Uint8Array) => void,
  ) {
    super();
  }
  async startNotifications() {
    this.notifying = true;
    return this;
  }
  async stopNotifications() {
    this.notifying = false;
    return this;
  }
  async writeValueWithResponse(b: Uint8Array) {
    if (!this.properties.write) throw new DOMException('GATT operation not permitted.', 'NotSupportedError');
    this.writes.push(b);
    this.sink?.(b);
  }
  async writeValueWithoutResponse(b: Uint8Array) {
    if (!this.properties.writeWithoutResponse) throw new DOMException('GATT operation not permitted.', 'NotSupportedError');
    this.writes.push(b);
    this.sink?.(b);
  }
  push(bytes: Uint8Array) {
    if (!this.notifying) return;
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeService {
  constructor(
    readonly uuid: string,
    readonly chars: FakeChar[],
  ) {}
  async getCharacteristic(uuid: string) {
    const c = this.chars.find((x) => x.uuid === uuid);
    if (!c) throw new DOMException('No Characteristics matching UUID found.', 'NotFoundError');
    return c;
  }
  async getCharacteristics() {
    return this.chars;
  }
}

interface Layout {
  service: string;
  /** [uuid, props, role] — role says which one the emulator answers on / listens to. */
  chars: [string, Props, ('rx' | 'tx' | 'both' | 'none')][];
}

class FakeBleAdapter {
  connected = false;
  gattFailures: number;
  emulator = new Elm327Emulator(createVehicleModel(5), DEMO_SCENARIO);
  private pending = '';
  private notifyChar?: FakeChar;
  readonly writeChars: FakeChar[] = [];
  readonly device: EventTarget & { name: string; gatt: unknown };

  constructor(layouts: Layout[], opts: { gattFailures?: number; name?: string } = {}) {
    this.gattFailures = opts.gattFailures ?? 0;
    const services = layouts.map(
      (l) =>
        new FakeService(
          l.service,
          l.chars.map(([uuid, props, role]) => {
            const c = new FakeChar(uuid, props, role === 'tx' || role === 'both' ? (b) => this.onWrite(b) : undefined);
            if (role === 'rx' || role === 'both') this.notifyChar = c;
            if (role === 'tx' || role === 'both') this.writeChars.push(c);
            return c;
          }),
        ),
    );
    const adapter = () => this.connected;
    const server = {
      get connected() {
        return adapter();
      },
      connect: async () => {
        if (this.gattFailures > 0) {
          this.gattFailures--;
          throw new DOMException('Connection attempt failed.', 'NetworkError');
        }
        this.connected = true;
        return server;
      },
      disconnect: () => {
        this.connected = false;
      },
      getPrimaryService: async (uuid: string) => {
        const s = services.find((x) => x.uuid === uuid);
        if (!s) throw new DOMException('No Services matching UUID found in Device.', 'NotFoundError');
        return s;
      },
      getPrimaryServices: async () => services,
    };
    this.device = Object.assign(new EventTarget(), { name: opts.name ?? 'OBDBLE', gatt: server });
  }

  private onWrite(bytes: Uint8Array) {
    this.pending += new TextDecoder().decode(bytes);
    let i: number;
    while ((i = this.pending.indexOf('\r')) !== -1) {
      const cmd = this.pending.slice(0, i);
      this.pending = this.pending.slice(i + 1);
      const out = new TextEncoder().encode(this.emulator.handle(cmd));
      setTimeout(() => {
        for (let o = 0; o < out.length; o += 20) this.notifyChar?.push(out.slice(o, o + 20));
      }, 3);
    }
  }

  /** The adapter loses power / goes out of range. */
  drop() {
    this.connected = false;
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  }

  install(onRequest?: (options: RequestDeviceOptions) => void) {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async (options: RequestDeviceOptions) => {
          onRequest?.(options);
          return this.device;
        },
      },
    });
  }
}

const known = (name: string): Layout => {
  const p = BLE_PROFILES.find((x) => x.name === name)!;
  if (p.write === p.notify) return { service: p.service, chars: [[p.write, { write: true, writeWithoutResponse: true, notify: true }, 'both']] };
  return {
    service: p.service,
    chars: [
      [p.notify, { notify: true }, 'rx'],
      [p.write, { write: true, writeWithoutResponse: true }, 'tx'],
    ],
  };
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('BLE transport against fake GATT adapters', () => {
  let backend: RealBackend | undefined;
  afterEach(async () => {
    await backend?.disconnect();
    backend = undefined;
    useConnection.getState().reset();
    useLive.getState().clear();
  });

  async function connectAndPoll(adapter: FakeBleAdapter, transport = new BleTransport()) {
    adapter.install();
    backend = new RealBackend('ble', transport);
    await backend.connect();
    const c = useConnection.getState();
    expect(c.status, c.error?.report).toBe('connected');
    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    backend.setWatched(['rpm']);
    await wait(400);
    off();
    expect(got.some((s) => s.id === 'rpm')).toBe(true);
    return transport;
  }

  for (const name of BLE_PROFILES.map((p) => p.name)) {
    it(`known profile ${name}`, async () => {
      const t = await connectAndPoll(new FakeBleAdapter([known(name)]));
      expect(t.profile).toBe(name);
      expect(useConnection.getState().adapter?.name).toBe('OBDBLE');
    }, 20_000);
  }

  it('unknown adapter: finds any service with a notify + write characteristic', async () => {
    const svc = 'a1b2c3d4-0000-1000-8000-00805f9b34fb';
    const t = await connectAndPoll(
      new FakeBleAdapter([
        { service: u16(0x180a), chars: [[u16(0x2a29), { read: true }, 'none']] }, // device information
        { service: svc, chars: [[`${svc.slice(0, 4)}0001-0000-1000-8000-00805f9b34fb`, { indicate: true }, 'rx'], [`${svc.slice(0, 4)}0002-0000-1000-8000-00805f9b34fb`, { writeWithoutResponse: true }, 'tx']] },
      ]),
    );
    expect(t.profile).toMatch(/^generic:/);
  }, 20_000);

  it('known service UUID but the write characteristic is elsewhere → falls back to the generic search', async () => {
    const t = await connectAndPoll(
      new FakeBleAdapter([
        { service: u16(0xfff0), chars: [[u16(0xfff1), { notify: true }, 'rx'], [u16(0xfff3), { write: true }, 'tx']] },
      ]),
    );
    expect(t.profile).toBe('generic:fff0');
  }, 20_000);

  it('write-with-response-only adapters still work', async () => {
    const p = BLE_PROFILES.find((x) => x.name === 'FFE0')!;
    await connectAndPoll(new FakeBleAdapter([{ service: p.service, chars: [[p.write, { write: true, notify: true }, 'both']] }]));
  }, 20_000);

  it('long commands are split into 20-byte writes', async () => {
    const adapter = new FakeBleAdapter([known('FFF0')]);
    const t = await connectAndPoll(adapter);
    await t.write('AT SH 7E0 AT CAF1 AT SH 7DF AT CAF0\r');
    expect(adapter.writeChars[0]!.writes.every((w) => w.length <= 20)).toBe(true);
  }, 20_000);

  it('flaky GATT connect right after pairing (Android): retried', async () => {
    await connectAndPoll(new FakeBleAdapter([known('FFF0')], { gattFailures: 2 }));
  }, 20_000);

  it('no usable service → "noCompatibleService" with a report', async () => {
    const adapter = new FakeBleAdapter([{ service: u16(0x180f), chars: [[u16(0x2a19), { read: true, notify: true }, 'none']] }]);
    adapter.install();
    backend = new RealBackend('ble', new BleTransport());
    await expect(backend.connect()).rejects.toBeTruthy();
    const e = useConnection.getState().error!;
    expect(e.code).toBe('noCompatibleService');
    expect(e.report).toContain('✗ device');
  }, 20_000);

  it('closing the picker is a quiet cancel, not an error', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async () => {
          throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
        },
      },
    });
    backend = new RealBackend('ble', new BleTransport());
    await expect(backend.connect()).rejects.toBeTruthy();
    expect(useConnection.getState().status).toBe('idle');
    expect(useConnection.getState().error).toBeUndefined();
  });

  it('the picker asks for every known service and the usual adapter names', async () => {
    let options: RequestDeviceOptions | undefined;
    new FakeBleAdapter([known('FFF0')]).install((o) => (options = o));
    backend = new RealBackend('ble', new BleTransport());
    await backend.connect();
    const filters = (options as { filters: BluetoothLEScanFilter[] }).filters;
    for (const p of BLE_PROFILES) expect(filters.some((f) => f.services?.includes(p.service))).toBe(true);
    for (const prefix of ['OBD', 'V-LINK', 'IOS-Vlink', 'vLinker', 'Veepeak']) expect(filters.some((f) => f.namePrefix === prefix)).toBe(true);
    expect((options as { optionalServices: string[] }).optionalServices).toHaveLength(BLE_PROFILES.length);
  }, 20_000);

  it('adapter drops mid-session → reconnects without the picker and keeps polling', async () => {
    const adapter = new FakeBleAdapter([known('FFF0')]);
    adapter.install();
    backend = new RealBackend('ble', new BleTransport(), { reconnectDelayMs: 50 });
    await backend.connect();
    backend.setWatched(['rpm']);
    await wait(200);
    adapter.drop();
    expect(useConnection.getState().status).toBe('reconnecting');
    await wait(1500);
    expect(useConnection.getState().status).toBe('connected');
    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    await wait(400);
    off();
    expect(got.some((s) => s.id === 'rpm')).toBe(true);
  }, 20_000);
});

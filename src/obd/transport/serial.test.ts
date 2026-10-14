import { afterEach, describe, expect, it } from 'vitest';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { Elm327Emulator } from '@/obd/sim/elmEmulator';
import { DEMO_SCENARIO } from '@/obd/sim/scenario';
import { createVehicleModel } from '@/obd/sim/vehicleModel';
import { RealBackend } from '@/obd/services/realBackend';
import { SerialTransport } from './serial';

/**
 * A Web Serial port that behaves like a macOS Bluetooth SPP port (/dev/cu.OBDII) with an ELM327 behind it:
 * - open() can fail with NetworkError a few times (link busy / still closing)
 * - close() rejects while a stream is locked (per spec) — closing too early leaves the port open
 * - for `linkUpMs` after opening, written bytes are lost (RFCOMM link not carrying data yet)
 */
class FakeBtSerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  opens = 0;
  closes = 0;
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private openedAt = 0;
  private emulator = new Elm327Emulator(createVehicleModel(1), DEMO_SCENARIO);
  private pending = '';

  constructor(private opts: { failOpens?: number; linkUpMs?: number; silent?: boolean } = {}) {}

  getInfo() {
    return {}; // macOS cu.* port: no USB ids, no service class
  }

  async open(_o: SerialOptions) {
    if (this.readable) throw new DOMException('The port is already open.', 'InvalidStateError');
    this.opens++;
    if ((this.opts.failOpens ?? 0) >= this.opens) throw new DOMException('Failed to open serial port.', 'NetworkError');
    this.openedAt = Date.now();
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) });
    this.writable = new WritableStream<Uint8Array>({ write: (chunk) => this.onWrite(chunk) });
  }

  private onWrite(chunk: Uint8Array) {
    if (Date.now() - this.openedAt < (this.opts.linkUpMs ?? 0)) return; // lost while the link comes up
    if (this.opts.silent) return;
    this.pending += new TextDecoder().decode(chunk);
    let i: number;
    while ((i = this.pending.indexOf('\r')) !== -1) {
      const cmd = this.pending.slice(0, i);
      this.pending = this.pending.slice(i + 1);
      const out = this.emulator.handle(cmd);
      const c = this.controller;
      setTimeout(() => {
        try {
          if (this.readable && c === this.controller) c?.enqueue(new TextEncoder().encode(out));
        } catch {
          /* port closed meanwhile — a real port drops these bytes too */
        }
      }, 2);
    }
  }

  async close() {
    if (this.readable?.locked || this.writable?.locked) throw new DOMException('Cannot close a locked port.', 'InvalidStateError');
    if (!this.readable) throw new DOMException('The port is already closed.', 'InvalidStateError');
    this.closes++;
    try {
      this.controller?.close();
    } catch {
      /* already cancelled by the reader */
    }
    this.readable = null;
    this.writable = null;
  }
}

function installSerial(port: FakeBtSerialPort) {
  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    value: { requestPort: async () => port, getPorts: async () => [port] },
  });
}

describe('SerialTransport + RealBackend over a (fake) Bluetooth serial port', () => {
  let backend: RealBackend | undefined;
  afterEach(async () => {
    await backend?.disconnect();
    backend = undefined;
    useConnection.getState().reset();
    useLive.getState().clear();
  });

  it('retries a busy port, waits for the link to come up, and connects', async () => {
    const port = new FakeBtSerialPort({ failOpens: 2, linkUpMs: 400 });
    installSerial(port);
    const t = new SerialTransport({ retryDelaysMs: [0, 50, 50, 50] });
    backend = new RealBackend('serial', t);
    await backend.connect();
    expect(useConnection.getState().status).toBe('connected');
    expect(useConnection.getState().protocol).toContain('CAN');
    expect(t.attempts).toEqual([
      'open #1: NetworkError: Failed to open serial port.',
      'open #2: NetworkError: Failed to open serial port.',
      'open #3: ok',
    ]);
  }, 20_000);

  it('really closes the port, so connecting again works (no "already open")', async () => {
    const port = new FakeBtSerialPort();
    installSerial(port);
    for (let i = 0; i < 3; i++) {
      const b = new RealBackend('serial', new SerialTransport({ retryDelaysMs: [0] }));
      await b.connect();
      expect(useConnection.getState().status, `round ${i}`).toBe('connected');
      await b.disconnect();
      expect(port.readable, `port closed after round ${i}`).toBeNull();
      useConnection.getState().reset();
    }
    expect(port.opens).toBe(3);
    expect(port.closes).toBe(3);
  }, 30_000);

  it('recovers a port left open by an earlier session in the same tab', async () => {
    const port = new FakeBtSerialPort();
    installSerial(port);
    await port.open({ baudRate: 38400 }); // left open
    backend = new RealBackend('serial', new SerialTransport({ retryDelaysMs: [0, 20] }));
    await backend.connect();
    expect(useConnection.getState().status).toBe('connected');
  }, 20_000);

  it('reconnects to the previously used port without the picker', async () => {
    const port = new FakeBtSerialPort();
    installSerial(port);
    expect(await SerialTransport.knownPorts()).toHaveLength(1);
    backend = new RealBackend('serialKnown');
    await backend.connect();
    expect(useConnection.getState().status).toBe('connected');
  }, 20_000);

  it('a port that never opens ends with "portBusy" and a connection test report', async () => {
    installSerial(new FakeBtSerialPort({ failOpens: 99 }));
    backend = new RealBackend('serial', new SerialTransport({ retryDelaysMs: [0, 10, 10] }));
    await expect(backend.connect()).rejects.toBeTruthy();
    const e = useConnection.getState().error!;
    expect(e.code).toBe('portBusy');
    expect(e.report).toContain('open #3: NetworkError');
    expect(e.report).toContain('✗ device');
    expect(e.report).toContain('nothing was exchanged with the adapter');
  }, 20_000);

  it('an adapter that never answers ends with "adapterSilent" and shows what was sent', async () => {
    installSerial(new FakeBtSerialPort({ silent: true }));
    backend = new RealBackend('serial', new SerialTransport({ retryDelaysMs: [0] }));
    await expect(backend.connect()).rejects.toBeTruthy();
    const e = useConnection.getState().error!;
    expect(e.code).toBe('adapterSilent');
    expect(e.report).toContain('✓ device');
    expect(e.report).toContain('✗ adapter');
  }, 40_000);
});

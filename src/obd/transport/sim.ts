import { Elm327Emulator } from '@/obd/sim/elmEmulator';
import { DEMO_SCENARIO, type SimScenario } from '@/obd/sim/scenario';
import { createVehicleModel, type VehicleModel } from '@/obd/sim/vehicleModel';
import { Listeners, type Transport } from './types';

export interface SimOptions {
  /** Per-command adapter latency in ms (a real ELM327 on CAN is ~40–90 ms). */
  latencyMs?: number;
  /** Bytes per notification, mimicking BLE packet fragmentation. */
  chunkSize?: number;
  scenario?: SimScenario;
  seed?: number;
}

/** A virtual adapter plugged into a virtual car. Behaves like a BLE transport, byte for byte. */
export class SimTransport implements Transport {
  readonly kind = 'sim' as const;
  readonly deviceName = 'Shindan Demo';
  readonly model: VehicleModel;
  readonly emulator: Elm327Emulator;
  private data = new Listeners<[string]>();
  private close = new Listeners<[Error | undefined]>();
  private open = false;
  private lastStep = 0;
  private pending = '';
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly opts: SimOptions = {}) {
    this.model = createVehicleModel(opts.seed ?? 7);
    this.emulator = new Elm327Emulator(this.model, opts.scenario ?? DEMO_SCENARIO);
  }

  async connect(): Promise<void> {
    this.open = true;
    this.lastStep = performance.now();
  }

  async disconnect(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    this.close.emit(undefined);
    this.data.clear();
    this.close.clear();
  }

  async write(text: string): Promise<void> {
    if (!this.open) throw new Error('closed');
    this.pending += text;
    let idx: number;
    while ((idx = this.pending.indexOf('\r')) !== -1) {
      const cmd = this.pending.slice(0, idx);
      this.pending = this.pending.slice(idx + 1);
      this.queue = this.queue.then(() => this.answer(cmd));
    }
  }

  private async answer(cmd: string) {
    const latency = this.opts.latencyMs ?? 55;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency * (0.75 + Math.random() * 0.5)));
    if (!this.open) return;
    const now = performance.now();
    this.model.step(now - this.lastStep);
    this.lastStep = now;
    const out = this.emulator.handle(cmd);
    const size = this.opts.chunkSize ?? 20;
    for (let i = 0; i < out.length; i += size) this.data.emit(out.slice(i, i + size));
  }

  onData(cb: (chunk: string) => void) {
    return this.data.add(cb);
  }

  onClose(cb: (error?: Error) => void) {
    return this.close.add(cb);
  }
}

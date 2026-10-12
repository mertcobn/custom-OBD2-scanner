import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useVehicle } from '@/state/vehicle';
import type { ObdBackend } from '@/obd/controller';
import { sampleBus } from '@/obd/services/bus';
import { PollScheduler } from '@/obd/services/scheduler';
import { createVehicleModel, SIM_SUPPORTED, type VehicleModel } from '@/obd/sim/vehicleModel';
import type { Dtc, MonitorStatus, Sample } from '@/obd/types';

/** Simulated adapter throughput (OBD responses per second), similar to a decent ELM327 clone on CAN. */
const REQUESTS_PER_SECOND = 14;
const TICK_MS = 50;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEMO_DTCS: Dtc[] = [
  { code: 'P0301', kind: 'stored', ecu: '7E8' },
  { code: 'P0171', kind: 'pending', ecu: '7E8' },
];

export const DEMO_MONITOR: MonitorStatus = {
  mil: true,
  dtcCount: 1,
  ignition: 'spark',
  monitors: [
    { id: 'misfire', supported: true, complete: true },
    { id: 'fuelSystem', supported: true, complete: true },
    { id: 'components', supported: true, complete: true },
    { id: 'catalyst', supported: true, complete: false },
    { id: 'heatedCatalyst', supported: false, complete: false },
    { id: 'evap', supported: true, complete: false },
    { id: 'secondaryAir', supported: false, complete: false },
    { id: 'acRefrigerant', supported: false, complete: false },
    { id: 'o2Sensor', supported: true, complete: true },
    { id: 'o2Heater', supported: true, complete: true },
    { id: 'egr', supported: true, complete: true },
  ],
};

/**
 * Demo mode: a virtual car with a virtual adapter. Lets anyone try the app without hardware
 * and is the reference data source while building the UI.
 */
export class DemoBackend implements ObdBackend {
  private model: VehicleModel = createVehicleModel(Date.now() & 0xffff);
  private scheduler = new PollScheduler();
  private watched: string[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private budget = 0;
  private responses: number[] = [];
  private alive = true;
  private cleared = false;

  async connect(): Promise<void> {
    const c = useConnection.getState();
    c.begin('sim', true);
    c.step('device', 'active');
    await wait(450);
    c.step('device', 'done', 'Shindan Demo');
    c.step('adapter', 'active');
    await wait(500);
    c.step('adapter', 'done', 'ELM327 v1.5');
    c.step('protocol', 'active');
    await wait(800);
    const protocol = 'ISO 15765-4 CAN (11 bit, 500 kbaud)';
    c.step('protocol', 'done', protocol);
    c.step('vehicle', 'active');
    await wait(400);
    if (!this.alive) return;
    c.step('vehicle', 'done', 'JTDBR32E720012345');

    useLive.getState().setSupported(SIM_SUPPORTED);
    useVehicle.getState().setInfo({
      vin: 'JTDBR32E720012345',
      make: 'Toyota',
      country: 'Japan',
      modelYear: 2002,
      protocol,
      ecus: ['7E8', '7E9'],
      calibrationIds: ['34D21000', '8966102A2000'],
      obdStandard: 'EOBD (Europe)',
      fuelType: 'gasoline',
    });
    useVehicle.getState().setMonitor(DEMO_MONITOR);
    c.connected({ transport: 'sim', name: 'Shindan Demo', elmVersion: 'ELM327 v1.5', voltage: 14.1 }, protocol);

    this.timer = setInterval(() => this.tick(), TICK_MS);
    void this.readDtcs();
  }

  async disconnect(): Promise<void> {
    this.alive = false;
    clearInterval(this.timer);
  }

  setWatched(ids: string[]): void {
    this.watched = ids;
    this.scheduler.setWatched(ids.filter((id) => SIM_SUPPORTED.includes(id)));
  }

  async readDtcs(): Promise<void> {
    const v = useVehicle.getState();
    v.setDtcState('loading');
    await wait(900);
    if (!this.alive) return;
    if (this.cleared) {
      v.setDtcs([]);
      return;
    }
    v.setDtcs(DEMO_DTCS, {
      dtc: 'P0301',
      values: { rpm: 812, speed: 0, coolantTemp: 88, engineLoad: 24.3, stftB1: 2.3, ltftB1: 4.7, intakeTemp: 27, map: 33 },
    });
  }

  async clearDtcs(): Promise<void> {
    const v = useVehicle.getState();
    v.setClearState('loading');
    await wait(1200);
    if (!this.alive) return;
    this.cleared = true;
    v.setClearState('ready');
    v.setMonitor({
      ...DEMO_MONITOR,
      mil: false,
      dtcCount: 0,
      monitors: DEMO_MONITOR.monitors.map((m) => ({ ...m, complete: m.supported ? m.id === 'components' : false })),
    });
    await this.readDtcs();
  }

  private tick() {
    this.model.step(TICK_MS);
    this.budget += (REQUESTS_PER_SECOND * TICK_MS) / 1000;
    const now = Date.now();
    const samples: Sample[] = [];
    while (this.budget >= 1) {
      this.budget -= 1;
      const id = this.scheduler.next();
      if (!id) break;
      this.responses.push(now);
      for (const sib of PollScheduler.siblings(id, this.watched)) {
        const v = this.model.read(sib);
        if (v !== undefined) samples.push({ t: now, id: sib, v });
      }
    }
    if (samples.length) sampleBus.emit(samples);

    const volt = samples.find((s) => s.id === 'adapterVoltage');
    if (volt) useConnection.getState().setVoltage(volt.v);

    this.responses = this.responses.filter((t) => now - t < 2000);
    useLive.getState().setRate(this.responses.length / 2);
    if (this.scheduler.size === 0) this.budget = 0;
  }
}

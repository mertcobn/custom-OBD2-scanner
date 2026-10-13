import { afterEach, describe, expect, it } from 'vitest';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { SimTransport } from '@/obd/transport/sim';
import type { Sample } from '@/obd/types';
import { sampleBus } from './bus';
import { RealBackend } from './realBackend';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RealBackend over the simulated adapter', () => {
  let backend: RealBackend | undefined;
  afterEach(async () => {
    await backend?.disconnect();
    useConnection.getState().reset();
    useLive.getState().clear();
  });

  it('initialises, detects protocol, discovers PIDs and polls', async () => {
    backend = new RealBackend('sim', new SimTransport({ latencyMs: 2, chunkSize: 7 }));
    await backend.connect();

    const c = useConnection.getState();
    expect(c.status).toBe('connected');
    expect(c.adapter?.elmVersion).toBe('ELM327 v1.5');
    expect(c.protocol).toBe('ISO 15765-4 CAN (11 bit, 500 kbaud)');
    expect(c.steps.every((s) => s.state === 'done')).toBe(true);
    expect(c.steps.find((s) => s.id === 'vehicle')?.detail).toBe('7E8, 7E9');

    const supported = useLive.getState().supported;
    expect(supported).toEqual(expect.arrayContaining(['rpm', 'speed', 'coolantTemp', 'o2VB1S1', 'adapterVoltage']));
    expect(supported).not.toContain('odometer');
    // O2 trim is announced via PID 14 but carries FF ("not used"): it may be listed but never produces samples.

    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    backend.setWatched(['rpm', 'speed', 'coolantTemp', 'o2VB1S1', 'o2TrimB1S1', 'adapterVoltage']);
    await wait(400);
    off();

    const ids = new Set(got.map((s) => s.id));
    expect(ids).toEqual(new Set(['rpm', 'speed', 'coolantTemp', 'o2VB1S1', 'adapterVoltage']));
    const rpm = got.find((s) => s.id === 'rpm')!.v;
    expect(rpm).toBeGreaterThan(700);
    expect(rpm).toBeLessThan(7000);
    expect(useConnection.getState().adapter?.voltage).toBeGreaterThan(13);
  });

  it('reads vehicle info, readiness, DTCs and freeze frame, then clears codes', async () => {
    const { useVehicle } = await import('@/state/vehicle');
    backend = new RealBackend('sim', new SimTransport({ latencyMs: 0 }));
    await backend.connect();
    await backend.readDtcs();
    let v = useVehicle.getState();
    expect(v.info).toMatchObject({
      vin: 'JTDBR32E720012345',
      make: 'Toyota',
      country: 'Japan',
      modelYear: 2002,
      calibrationIds: ['34D21000', '8966102A2000'],
      obdStandard: 'EOBD (Europe)',
      fuelType: 'gasoline',
      ecus: ['7E8', '7E9'],
    });
    expect(v.monitor).toMatchObject({ mil: true, dtcCount: 1, ignition: 'spark' });
    expect(v.monitor!.monitors.find((m) => m.id === 'catalyst')).toEqual({ id: 'catalyst', supported: true, complete: false });
    expect(v.dtcs).toEqual([
      { code: 'P0301', kind: 'stored', ecu: '7E8' },
      { code: 'P0171', kind: 'pending', ecu: '7E8' },
    ]);
    expect(v.freezeFrame?.dtc).toBe('P0301');
    expect(v.freezeFrame?.values.rpm).toBe(812);
    expect(v.freezeFrame?.values.coolantTemp).toBe(88);

    await backend.clearDtcs();
    v = useVehicle.getState();
    expect(v.clearState).toBe('ready');
    expect(v.dtcs).toEqual([]);
    expect(v.monitor?.mil).toBe(false);
    expect(v.monitor!.monitors.find((m) => m.id === 'catalyst')?.complete).toBe(false);
    useVehicle.getState().reset();
  });

  it('connects reliably across adapter timing variations (no response shift)', async () => {
    for (const latencyMs of [0, 1, 3, 8, 15]) {
      for (const chunkSize of [1, 5, 20]) {
        const b = new RealBackend('sim', new SimTransport({ latencyMs, chunkSize }));
        await b.connect();
        expect(useConnection.getState().protocol, `${latencyMs}ms/${chunkSize}`).toContain('CAN');
        expect(useLive.getState().supported).toContain('rpm');
        await b.disconnect();
        useConnection.getState().reset();
      }
    }
  }, 30_000);

  it('reads Mode 06 on-board test results with pass/fail', async () => {
    const { useVehicle } = await import('@/state/vehicle');
    backend = new RealBackend('sim', new SimTransport({ latencyMs: 0 }));
    await backend.connect();
    await backend.readTests();
    const v = useVehicle.getState();
    expect(v.testsState).toBe('ready');
    expect(new Set(v.tests.map((t) => t.mid))).toEqual(new Set([0x01, 0x21, 0xa2, 0xa3]));
    const o2 = v.tests.find((t) => t.mid === 0x01 && t.tid === 0x01)!;
    expect(o2).toMatchObject({ value: 0.45, min: 0.4, max: 0.5, unit: 'V', pass: true });
    const misfire = v.tests.filter((t) => t.mid === 0xa2);
    expect(misfire.every((t) => !t.pass)).toBe(true);
    expect(v.tests.filter((t) => !t.pass)).toHaveLength(2);

    await backend.clearDtcs();
    expect(useVehicle.getState().tests).toEqual([]);
    useVehicle.getState().reset();
  });

  it('does not poll unsupported signals', async () => {
    backend = new RealBackend('sim', new SimTransport({ latencyMs: 0 }));
    await backend.connect();
    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    backend.setWatched(['odometer']);
    await wait(150);
    off();
    expect(got).toEqual([]);
  });

  it('reconnects after the adapter drops and keeps polling', async () => {
    const t = new SimTransport({ latencyMs: 1 });
    backend = new RealBackend('sim', t, { reconnectDelayMs: 20 });
    await backend.connect();
    backend.setWatched(['rpm']);
    t.simulateDrop();
    expect(useConnection.getState().status).toBe('reconnecting');
    await wait(300);
    expect(useConnection.getState().status).toBe('connected');
    const got: Sample[] = [];
    const off = sampleBus.subscribe((s) => got.push(...s));
    await wait(150);
    off();
    expect(got.some((s) => s.id === 'rpm')).toBe(true);
  });

  it('gives up and reports a lost link when reconnecting fails', async () => {
    const t = new SimTransport({ latencyMs: 1 });
    t.reconnect = async () => {
      throw new Error('out of range');
    };
    backend = new RealBackend('sim', t, { reconnectDelayMs: 5, reconnectAttempts: 2 });
    await backend.connect();
    t.simulateDrop();
    await wait(200);
    expect(useConnection.getState().status).toBe('error');
    expect(useConnection.getState().error?.code).toBe('lost');
  });
});

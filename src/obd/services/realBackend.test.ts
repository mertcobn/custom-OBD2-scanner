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

  it('reports a lost link', async () => {
    const t = new SimTransport({ latencyMs: 1 });
    backend = new RealBackend('sim', t);
    await backend.connect();
    // Simulate the adapter disappearing (not a user disconnect).
    (t as unknown as { close: { emit: (e: Error) => void } }).close.emit(new Error('gone'));
    expect(useConnection.getState().status).toBe('error');
    expect(useConnection.getState().error?.code).toBe('lost');
  });
});

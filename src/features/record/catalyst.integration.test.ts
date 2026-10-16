import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { connect, disconnect } from '@/obd/controller';
import { sampleBus } from '@/obd/services/bus';
import type { Sample } from '@/obd/types';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useRecording } from '@/state/recording';
import { PRESETS, presetSignals } from './presets';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Record `ms` of demo data with a preset and return samples per signal per second. */
async function recordRates(presetId: 'catalyst' | 'health', ms: number) {
  const p = PRESETS.find((x) => x.id === presetId)!;
  const signals = presetSignals(p, useLive.getState().supported);
  useRecording.setState({ config: { preset: presetId, signals, tiers: p.tiers, durationSec: null } });
  const got: Sample[] = [];
  const off = sampleBus.subscribe((s) => got.push(...s));
  useRecording.getState().start();
  await wait(ms);
  await useRecording.getState().stop();
  off();
  const rate = (id: string) => got.filter((s) => s.id === id).length / (ms / 1000);
  return { signals, rate };
}

describe('catalyst test over the full pipeline (demo car, real ELM327 driver)', () => {
  afterEach(async () => {
    await disconnect();
    useConnection.getState().reset();
  });

  it('the rear O2 sensor is sampled far more often than in "Engine health"', async () => {
    await connect('demo');
    expect(useConnection.getState().status).toBe('connected');
    await wait(2500); // let the background vehicle-info / DTC reads finish

    const health = await recordRates('health', 4000);
    const cat = await recordRates('catalyst', 4000);
    expect(cat.signals).toEqual(['o2VB1S1', 'o2VB1S2', 'rpm', 'coolantTemp']);

    const h = health.rate('o2VB1S2');
    const c = cat.rate('o2VB1S2');
    expect(c).toBeGreaterThan(h * 5);
    expect(cat.rate('o2VB1S1')).toBeGreaterThan(h * 5);
    // context is still there
    expect(cat.rate('rpm')).toBeGreaterThan(0);
    // after the recording, the tier overrides are gone again
    expect(useRecording.getState().status).toBe('finished');
  }, 30_000);
});

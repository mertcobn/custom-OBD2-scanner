import { describe, expect, it } from 'vitest';
import { PollScheduler } from '@/obd/services/scheduler';
import type { Dtc } from '@/obd/types';
import { catalystCode, PRESETS, presetSignals } from './presets';

const cat = PRESETS.find((p) => p.id === 'catalyst')!;
const health = PRESETS.find((p) => p.id === 'health')!;
const dtc = (code: string, kind: Dtc['kind'] = 'stored'): Dtc => ({ code, kind, ecu: '7E8' });
const NARROW = ['rpm', 'coolantTemp', 'o2VB1S1', 'o2VB1S2', 'o2VB2S1', 'o2VB2S2', 'speed'];

describe('catalyst test preset', () => {
  it('recognises catalyst-efficiency codes in any list (stored, pending, permanent)', () => {
    expect(catalystCode([dtc('P0301'), dtc('P0420', 'pending')])).toBe('P0420');
    expect(catalystCode([dtc('P0430', 'permanent')])).toBe('P0430');
    for (const c of ['P0421', 'P0422', 'P0423', 'P0424', 'P0431', 'P0434']) expect(catalystCode([dtc(c)])).toBe(c);
    // P0425–P0429 are catalyst temperature-sensor circuits, not efficiency
    expect(catalystCode([dtc('P0425'), dtc('P0171'), dtc('P0440')])).toBeUndefined();
  });

  it('P0420 (or no code): front + rear O2 of bank 1, rpm and coolant as context', () => {
    expect(presetSignals(cat, NARROW)).toEqual(['o2VB1S1', 'o2VB1S2', 'rpm', 'coolantTemp']);
    expect(presetSignals(cat, NARROW, [dtc('P0420')])).toEqual(['o2VB1S1', 'o2VB1S2', 'rpm', 'coolantTemp']);
  });

  it('P0430: bank 2 sensors; both codes: both banks', () => {
    expect(presetSignals(cat, NARROW, [dtc('P0430')])).toEqual(['o2VB2S1', 'o2VB2S2', 'rpm', 'coolantTemp']);
    expect(presetSignals(cat, NARROW, [dtc('P0420'), dtc('P0430')])).toEqual(['o2VB1S1', 'o2VB1S2', 'o2VB2S1', 'o2VB2S2', 'rpm', 'coolantTemp']);
  });

  it('wide-band front sensor: uses the lambda PID instead of the voltage PID', () => {
    expect(presetSignals(cat, ['rpm', 'coolantTemp', 'lambda24S1', 'o2VB1S2'])).toEqual(['lambda24S1', 'o2VB1S2', 'rpm', 'coolantTemp']);
    expect(presetSignals(cat, ['rpm', 'coolantTemp', 'lambda34S1', 'o2VB1S2'])).toEqual(['lambda34S1', 'o2VB1S2', 'rpm', 'coolantTemp']);
  });

  it('samples the O2 sensors ~10× more often than the "Engine health" preset does', () => {
    const rps = 10; // a typical BLE ELM327
    const catSignals = presetSignals(cat, NARROW, [dtc('P0420')]);
    const catHz = PollScheduler.estimateRate(catSignals, rps, cat.tiers).fast;
    const healthHz = PollScheduler.estimateRate(health.signals as string[], rps).medium;
    expect(catHz).toBeGreaterThan(4); // enough to see a 1–2 Hz switching front sensor
    expect(healthHz).toBeLessThan(0.5);
    expect(catHz / healthHz).toBeGreaterThan(9);
  });
});

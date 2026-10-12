import { describe, expect, it } from 'vitest';
import { SIGNAL_BY_ID } from '@/obd/signals';
import { createVehicleModel, SIM_SUPPORTED } from './vehicleModel';

describe('vehicleModel', () => {
  it('only claims signals that exist in the catalogue', () => {
    for (const id of SIM_SUPPORTED) expect(SIGNAL_BY_ID[id], id).toBeDefined();
  });

  it('produces values inside each signal range over a full cycle', () => {
    const m = createVehicleModel(1);
    for (let i = 0; i < 2000; i++) {
      m.step(100);
      for (const id of SIM_SUPPORTED) {
        const v = m.read(id)!;
        const s = SIGNAL_BY_ID[id]!;
        expect(Number.isFinite(v), id).toBe(true);
        expect(v, id).toBeGreaterThanOrEqual(s.min);
        expect(v, id).toBeLessThanOrEqual(s.max);
      }
    }
  });

  it('actually drives: speed rises and rpm follows', () => {
    const m = createVehicleModel(2);
    let maxSpeed = 0;
    for (let i = 0; i < 600; i++) {
      m.step(100);
      maxSpeed = Math.max(maxSpeed, m.read('speed')!);
    }
    expect(maxSpeed).toBeGreaterThan(40);
    expect(m.read('odometer')).toBeUndefined();
  });

  it('warms the engine up', () => {
    const m = createVehicleModel(3);
    const start = m.read('coolantTemp')!;
    for (let i = 0; i < 3000; i++) m.step(100);
    expect(m.read('coolantTemp')!).toBeGreaterThan(start + 30);
  });
});

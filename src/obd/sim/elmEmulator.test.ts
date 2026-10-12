import { describe, expect, it } from 'vitest';
import { findPidData, parseResponse } from '@/obd/protocol/frames';
import { SIGNALS } from '@/obd/signals';
import { Elm327Emulator, encodeDtc } from './elmEmulator';
import { DEMO_SCENARIO } from './scenario';
import { createVehicleModel, SIM_SUPPORTED } from './vehicleModel';

function lines(out: string, cmd: string): string[] {
  return out
    .replace(/>$/, '')
    .split('\r')
    .map((l) => l.trim())
    .filter((l) => l && l !== cmd && l !== 'SEARCHING...');
}

describe('Elm327Emulator', () => {
  it('echoes until ATE0 and prints a prompt', () => {
    const e = new Elm327Emulator(createVehicleModel(1), DEMO_SCENARIO);
    expect(e.handle('ATZ')).toBe('ATZ\r\rELM327 v1.5\r\r>');
    expect(e.handle('ATE0')).toBe('ATE0\rOK\r\r>');
    expect(e.handle('ATI')).toBe('ELM327 v1.5\r\r>');
    expect(e.handle('ATXYZ')).toBe('?\r\r>');
  });

  it('every simulated signal decodes back to the model value', () => {
    const model = createVehicleModel(5);
    for (let i = 0; i < 400; i++) model.step(100);
    const e = new Elm327Emulator(model, DEMO_SCENARIO);
    e.handle('ATE0');
    e.handle('ATH1');
    for (const sig of SIGNALS.filter((s) => s.source === 'obd' && SIM_SUPPORTED.includes(s.id))) {
      const cmd = `01${sig.pid.toString(16).padStart(2, '0').toUpperCase()}`;
      const msgs = parseResponse(lines(e.handle(cmd), cmd), 'can11');
      const hit = findPidData(msgs, 0x41, sig.pid);
      expect(hit, sig.id).toBeDefined();
      const decoded = sig.decode(hit!.data);
      const expected = model.read(sig.id)!;
      const resolution = Math.max(1, Math.abs(sig.max - sig.min) / 200);
      expect(Math.abs(decoded - expected), `${sig.id}: ${decoded} vs ${expected}`).toBeLessThanOrEqual(resolution);
    }
  });

  it('answers PID 00 from two ECUs and NO DATA for unsupported PIDs', () => {
    const e = new Elm327Emulator(createVehicleModel(1), DEMO_SCENARIO);
    e.handle('ATE0');
    e.handle('ATH1');
    const out = lines(e.handle('0100'), '0100');
    expect(out.map((l) => l.slice(0, 3))).toEqual(['7E8', '7E9']);
    expect(lines(e.handle('01A6'), '01A6')).toEqual(['NO DATA']);
  });

  it('encodes DTCs per SAE J2012', () => {
    expect(encodeDtc('P0301')).toEqual([0x03, 0x01]);
    expect(encodeDtc('U0100')).toEqual([0xc1, 0x00]);
    expect(encodeDtc('C1234')).toEqual([0x52, 0x34]);
  });

  it('prints multi-frame VIN with headers', () => {
    const e = new Elm327Emulator(createVehicleModel(1), DEMO_SCENARIO);
    e.handle('ATE0');
    e.handle('ATH1');
    const out = lines(e.handle('0902'), '0902');
    expect(out[0]).toMatch(/^7E8 10 14 49 02 01/);
    const msgs = parseResponse(out, 'can11');
    expect(String.fromCharCode(...msgs[0]!.data.slice(3))).toBe(DEMO_SCENARIO.vin);
  });
});

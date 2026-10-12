import { describe, expect, it } from 'vitest';
import { parseResponse } from './frames';
import {
  decodeCalibrationIds,
  decodeDtc,
  decodeDtcMessages,
  decodeFuelType,
  decodeModelYear,
  decodeMonitorStatus,
  decodeObdStandard,
  decodeVin,
  decodeVinInfo,
} from './diagnostics';

describe('DTC decoding', () => {
  it('decodes the code structure', () => {
    expect(decodeDtc(0x01, 0x33)).toBe('P0133');
    expect(decodeDtc(0x03, 0x01)).toBe('P0301');
    expect(decodeDtc(0x41, 0x23)).toBe('C0123');
    expect(decodeDtc(0x92, 0x34)).toBe('B1234');
    expect(decodeDtc(0xc1, 0x00)).toBe('U0100');
    expect(decodeDtc(0x2a, 0xbc)).toBe('P2ABC');
  });

  it('decodes CAN responses with count byte from multiple ECUs', () => {
    const msgs = parseResponse(['7E8 06 43 02 03 01 01 71', '7E9 02 43 00'], 'can11');
    expect(decodeDtcMessages(msgs, 0x43, 'stored', 'can11')).toEqual([
      { code: 'P0301', kind: 'stored', ecu: '7E8' },
      { code: 'P0171', kind: 'stored', ecu: '7E8' },
    ]);
  });

  it('decodes multi-frame CAN DTC lists', () => {
    const msgs = parseResponse(['7E8 10 0A 43 04 01 33 03 01', '7E8 21 04 20 01 71 00 00 00'], 'can11');
    expect(decodeDtcMessages(msgs, 0x43, 'stored', 'can11').map((d) => d.code)).toEqual(['P0133', 'P0301', 'P0420', 'P0171']);
  });

  it('decodes legacy responses (no count byte, zero padding)', () => {
    const msgs = parseResponse(['48 6B 10 43 01 33 03 01 00 00 AA'], 'legacy');
    expect(decodeDtcMessages(msgs, 0x43, 'stored', 'legacy').map((d) => d.code)).toEqual(['P0133', 'P0301']);
  });

  it('returns nothing for an empty list', () => {
    const msgs = parseResponse(['7E8 02 47 00'], 'can11');
    expect(decodeDtcMessages(msgs, 0x47, 'pending', 'can11')).toEqual([]);
  });
});

describe('monitor status (01 01)', () => {
  it('decodes a spark-ignition car with MIL on', () => {
    // A: MIL + 1 DTC; B: 3 continuous supported, none incomplete; C: cat, evap, O2, O2 heater, EGR; D: cat + evap incomplete
    const s = decodeMonitorStatus([0x81, 0x07, 0xe5, 0x05]);
    expect(s.mil).toBe(true);
    expect(s.dtcCount).toBe(1);
    expect(s.ignition).toBe('spark');
    const byId = Object.fromEntries(s.monitors.map((m) => [m.id, m]));
    expect(byId.misfire).toEqual({ id: 'misfire', supported: true, complete: true });
    expect(byId.catalyst).toEqual({ id: 'catalyst', supported: true, complete: false });
    expect(byId.evap).toMatchObject({ supported: true, complete: false });
    expect(byId.o2Sensor).toMatchObject({ supported: true, complete: true });
    expect(byId.secondaryAir).toMatchObject({ supported: false });
  });

  it('decodes a diesel car', () => {
    const s = decodeMonitorStatus([0x00, 0x0f, 0xc1, 0x40]);
    expect(s.ignition).toBe('compression');
    expect(s.mil).toBe(false);
    const ids = s.monitors.filter((m) => m.supported).map((m) => m.id);
    expect(ids).toEqual(['misfire', 'fuelSystem', 'components', 'nmhcCatalyst', 'pmFilter', 'egr']);
    expect(s.monitors.find((m) => m.id === 'pmFilter')!.complete).toBe(false);
  });
});

describe('vehicle information', () => {
  it('decodes a CAN VIN', () => {
    const msgs = parseResponse(
      ['7E8 10 14 49 02 01 4A 54 44', '7E8 21 42 52 33 32 45 37 32', '7E8 22 30 30 31 32 33 34 35'],
      'can11',
    );
    expect(decodeVin(msgs, 'can11')).toBe('JTDBR32E720012345');
  });

  it('decodes a legacy VIN spread over numbered lines', () => {
    const lines = [
      '48 6B 10 49 02 01 00 00 00 31 AA',
      '48 6B 10 49 02 02 44 34 47 50 AA',
      '48 6B 10 49 02 03 30 30 52 35 AA',
      '48 6B 10 49 02 04 35 42 31 32 AA',
      '48 6B 10 49 02 05 33 34 35 36 AA',
    ];
    expect(decodeVin(parseResponse(lines, 'legacy'), 'legacy')).toBe('1D4GP00R55B123456');
  });

  it('decodes calibration IDs', () => {
    const id = (s: string) => [...s.padEnd(16, '\0')].map((c) => c.charCodeAt(0));
    const data = [0x49, 0x04, 0x02, ...id('34D21000'), ...id('8966102A2000')];
    expect(decodeCalibrationIds([{ ecu: '7E8', data }], 'can11')).toEqual(['34D21000', '8966102A2000']);
  });

  it('decodes WMI, country and model year', () => {
    expect(decodeVinInfo('JTDBR32E720012345')).toEqual({ make: 'Toyota', country: 'Japan', modelYear: 2002 });
    expect(decodeVinInfo('NMTBB0JE60R123456').make).toBe('Toyota Türkiye');
    expect(decodeVinInfo('WVWZZZ1KZ6W612345')).toMatchObject({ make: 'Volkswagen', country: 'Germany', modelYear: 2006 });
    expect(decodeModelYear('XXXXXXXXXR', new Date('2026-06-01'))).toBe(2024);
    expect(decodeModelYear('XXXXXXXXXT', new Date('2026-06-01'))).toBe(2026);
    expect(decodeModelYear('XXXXXXXXXY', new Date('2026-06-01'))).toBe(2000);
  });

  it('maps OBD standard and fuel type', () => {
    expect(decodeObdStandard(6)).toBe('EOBD (Europe)');
    expect(decodeFuelType(4)).toBe('diesel');
    expect(decodeFuelType(0)).toBeUndefined();
  });
});

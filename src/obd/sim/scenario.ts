import type { Dtc, MonitorStatus } from '@/obd/types';

/** The demo car's fixed "story": a 2002 Toyota with a misfire and a lean condition. */
export interface SimScenario {
  vin: string;
  calibrationIds: string[];
  ecuName: string;
  /** ELM protocol number the car speaks. */
  protocol: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
  dtcs: Dtc[];
  monitor: MonitorStatus;
  freezeFrame: { dtc: string; values: Record<number, number[]> };
  /** Mode 06 results: MID → [TID, UASID, value, min, max] raw words. */
  mode06: Record<number, [number, number, number, number, number][]>;
}

export const DEMO_SCENARIO: SimScenario = {
  vin: 'JTDBR32E720012345',
  calibrationIds: ['34D21000', '8966102A2000'],
  ecuName: 'ECM-EngineControl',
  protocol: '6',
  dtcs: [
    { code: 'P0301', kind: 'stored', ecu: '7E8' },
    { code: 'P0171', kind: 'pending', ecu: '7E8' },
  ],
  monitor: {
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
  },
  // Raw Mode 02 data bytes per PID at the moment P0301 was set.
  freezeFrame: {
    dtc: 'P0301',
    values: {
      0x0c: [0x0c, 0xb0], // 812 rpm
      0x0d: [0x00],
      0x05: [0x80], // 88 °C
      0x04: [0x3e], // 24.3 %
      0x06: [0x83], // +2.3 %
      0x07: [0x86], // +4.7 %
      0x0f: [0x43], // 27 °C
      0x0b: [0x21], // 33 kPa
    },
  },
  mode06: {
    // O2 sensor B1S1: threshold 0.450 V, switch times 72 / 64 ms — healthy
    0x01: [
      [0x01, 0x0b, 450, 400, 500],
      [0x05, 0x10, 72, 0, 100],
      [0x06, 0x10, 64, 0, 100],
    ],
    // Catalyst B1: manufacturer index, within limits
    0x21: [[0x80, 0x01, 118, 0, 255]],
    // Misfire cylinder 1: counts above the limit — the cause of P0301
    0xa2: [
      [0x0b, 0x24, 46, 0, 30],
      [0x0c, 0x24, 52, 0, 30],
    ],
    // Misfire cylinder 2: fine
    0xa3: [
      [0x0b, 0x24, 1, 0, 30],
      [0x0c, 0x24, 0, 0, 30],
    ],
  },
};

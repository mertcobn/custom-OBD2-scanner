export type TransportKind = 'ble' | 'serial' | 'sim';

export type DtcKind = 'stored' | 'pending' | 'permanent';

export interface Dtc {
  /** e.g. "P0301" */
  code: string;
  kind: DtcKind;
  /** Responding ECU header, e.g. "7E8" */
  ecu: string;
}

export type MonitorId =
  | 'misfire'
  | 'fuelSystem'
  | 'components'
  | 'catalyst'
  | 'heatedCatalyst'
  | 'evap'
  | 'secondaryAir'
  | 'acRefrigerant'
  | 'o2Sensor'
  | 'o2Heater'
  | 'egr'
  | 'nmhcCatalyst'
  | 'noxScr'
  | 'boostPressure'
  | 'exhaustGas'
  | 'pmFilter';

export interface ReadinessMonitor {
  id: MonitorId;
  supported: boolean;
  complete: boolean;
}

export interface MonitorStatus {
  mil: boolean;
  dtcCount: number;
  ignition: 'spark' | 'compression';
  monitors: ReadinessMonitor[];
}

export interface FreezeFrame {
  dtc: string;
  /** signal id → value in base units */
  values: Record<string, number>;
}

export interface VehicleInfo {
  vin?: string;
  make?: string;
  country?: string;
  modelYear?: number;
  protocol?: string;
  ecus: string[];
  calibrationIds?: string[];
  obdStandard?: string;
  fuelType?: string;
}

export interface AdapterInfo {
  transport: TransportKind;
  name: string;
  elmVersion?: string;
  voltage?: number;
}

export interface Sample {
  /** epoch ms */
  t: number;
  id: string;
  v: number;
}

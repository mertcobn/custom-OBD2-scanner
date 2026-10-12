import { Listeners, TransportError, type Transport } from './types';

/**
 * Known GATT layouts of ELM327-style BLE adapters. Adding support for a new adapter is
 * usually one more row here.
 */
export interface BleProfile {
  name: string;
  service: string;
  write: string;
  notify: string;
}

const uuid16 = (x: number) => `0000${x.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

export const BLE_PROFILES: BleProfile[] = [
  { name: 'FFF0', service: uuid16(0xfff0), write: uuid16(0xfff2), notify: uuid16(0xfff1) },
  { name: 'FFE0', service: uuid16(0xffe0), write: uuid16(0xffe1), notify: uuid16(0xffe1) },
  { name: '18F0', service: uuid16(0x18f0), write: uuid16(0x2af1), notify: uuid16(0x2af0) },
  {
    name: 'OBDLink',
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    notify: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  // Nordic UART service (some ESP32/DIY and newer clones)
  {
    name: 'NUS',
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

/** Advertised name prefixes of common OBD adapters (many don't advertise their service UUID). */
export const NAME_PREFIXES = [
  'OBD', 'Obd', 'obd', 'ELM', 'V-LINK', 'Vlink', 'VLINK', 'vLinker', 'IOS-Vlink', 'Android-Vlink', 'VEEPEAK', 'Veepeak',
  'KONNWEI', 'Viecar', 'iCar', 'Carista', 'CX', 'MX+', 'LELink', 'BLE', 'HH', 'Kiwi', 'OBDLink', 'ScanTool', 'V0', 'OBDII',
];

const MTU_PAYLOAD = 20;

type Char = BluetoothRemoteGATTCharacteristic;

/** Web Bluetooth (BLE GATT) transport. */
export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  deviceName = 'Bluetooth adapter';
  profile?: string;
  private device?: BluetoothDevice;
  private writer?: Char;
  private notifier?: Char;
  private data = new Listeners<[string]>();
  private close = new Listeners<[Error | undefined]>();
  private decoder = new TextDecoder();
  private manualClose = false;

  constructor(private readonly opts: { acceptAll?: boolean } = {}) {}

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async connect(): Promise<void> {
    if (!BleTransport.supported()) throw new TransportError('unsupported');
    const optionalServices = BLE_PROFILES.map((p) => p.service);
    try {
      this.device = await navigator.bluetooth.requestDevice(
        this.opts.acceptAll
          ? { acceptAllDevices: true, optionalServices }
          : {
              filters: [...BLE_PROFILES.map((p) => ({ services: [p.service] })), ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
              optionalServices,
            },
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') throw new TransportError('cancelled', e.message);
      if (e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'NotSupportedError')) throw new TransportError('unsupported', e.message);
      throw new TransportError('unknown', e instanceof Error ? e.message : String(e));
    }
    this.deviceName = this.device.name || this.deviceName;
    this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
    await this.openGatt();
  }

  private onDisconnected = () => {
    if (this.manualClose) return;
    this.close.emit(new TransportError('lost'));
  };

  private async openGatt(): Promise<void> {
    const server = await this.withRetry(() => this.device!.gatt!.connect());
    const found = (await this.findKnownProfile(server)) ?? (await this.findGeneric(server));
    if (!found) {
      server.disconnect();
      throw new TransportError('noCompatibleService');
    }
    this.writer = found.write;
    this.notifier = found.notify;
    this.profile = found.name;
    await this.notifier.startNotifications();
    this.notifier.addEventListener('characteristicvaluechanged', this.onNotify);
  }

  /** GATT connect is flaky on some Android stacks right after pairing — retry briefly. */
  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw new TransportError('unknown', last instanceof Error ? last.message : String(last));
  }

  private async findKnownProfile(server: BluetoothRemoteGATTServer) {
    for (const p of BLE_PROFILES) {
      try {
        const svc = await server.getPrimaryService(p.service);
        const write = await svc.getCharacteristic(p.write);
        const notify = p.notify === p.write ? write : await svc.getCharacteristic(p.notify);
        return { name: p.name, write, notify };
      } catch {
        /* try the next layout */
      }
    }
    return undefined;
  }

  /** Unknown adapter: pick any service exposing a notify + a write characteristic. */
  private async findGeneric(server: BluetoothRemoteGATTServer) {
    let services: BluetoothRemoteGATTService[];
    try {
      services = await server.getPrimaryServices();
    } catch {
      return undefined;
    }
    for (const svc of services) {
      try {
        const chars = await svc.getCharacteristics();
        const notify = chars.find((c) => c.properties.notify || c.properties.indicate);
        const write = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (notify && write) return { name: `generic:${svc.uuid.slice(4, 8)}`, write, notify };
      } catch {
        /* skip */
      }
    }
    return undefined;
  }

  private onNotify = (ev: Event) => {
    const value = (ev.target as Char).value;
    if (value) this.data.emit(this.decoder.decode(value, { stream: true }));
  };

  async write(text: string): Promise<void> {
    const w = this.writer;
    if (!w) throw new TransportError('lost');
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += MTU_PAYLOAD) {
      const chunk = bytes.slice(i, i + MTU_PAYLOAD);
      if (w.properties.writeWithoutResponse && w.writeValueWithoutResponse) await w.writeValueWithoutResponse(chunk);
      else await w.writeValueWithResponse(chunk);
    }
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    try {
      this.notifier?.removeEventListener('characteristicvaluechanged', this.onNotify);
      await this.notifier?.stopNotifications().catch(() => undefined);
    } finally {
      this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
      this.device?.gatt?.disconnect();
      this.close.emit(undefined);
      this.data.clear();
      this.close.clear();
    }
  }

  onData(cb: (chunk: string) => void) {
    return this.data.add(cb);
  }

  onClose(cb: (error?: Error) => void) {
    return this.close.add(cb);
  }
}

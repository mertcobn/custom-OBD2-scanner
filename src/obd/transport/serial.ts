import { Listeners, TransportError, type Transport } from './types';

/** Bluetooth Serial Port Profile — Classic Bluetooth ELM327 adapters expose this RFCOMM service. */
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';

/**
 * Web Serial transport: Classic Bluetooth adapters (RFCOMM, Chrome/Edge 117+ on desktop) and
 * USB ELM327 cables / OS-paired Bluetooth COM ports.
 */
export class SerialTransport implements Transport {
  readonly kind = 'serial' as const;
  deviceName = 'Serial adapter';
  private port?: SerialPort;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private data = new Listeners<[string]>();
  private close = new Listeners<[Error | undefined]>();
  private manualClose = false;

  constructor(private readonly baudRate = 38400) {}

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  async connect(): Promise<void> {
    if (!SerialTransport.supported()) throw new TransportError('unsupported');
    try {
      this.port = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] } as SerialPortRequestOptions);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') throw new TransportError('cancelled', e.message);
      throw new TransportError('unknown', e instanceof Error ? e.message : String(e));
    }
    const info = this.port.getInfo() as SerialPortInfo & { bluetoothServiceClassId?: string };
    this.deviceName = info.bluetoothServiceClassId
      ? 'Bluetooth SPP'
      : info.usbVendorId
        ? `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`
        : this.deviceName;
    try {
      await this.port.open({ baudRate: this.baudRate, bufferSize: 4096 });
    } catch (e) {
      throw new TransportError('unknown', e instanceof Error ? e.message : String(e));
    }
    void this.readLoop();
  }

  private async readLoop() {
    const decoder = new TextDecoder();
    while (this.port?.readable && !this.manualClose) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.data.emit(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        if (!this.manualClose) this.close.emit(new TransportError('lost', e instanceof Error ? e.message : String(e)));
        return;
      } finally {
        this.reader.releaseLock();
      }
    }
  }

  async write(text: string): Promise<void> {
    const writable = this.port?.writable;
    if (!writable) throw new TransportError('lost');
    const w = writable.getWriter();
    try {
      await w.write(new TextEncoder().encode(text));
    } finally {
      w.releaseLock();
    }
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    try {
      await this.reader?.cancel().catch(() => undefined);
      await this.port?.close().catch(() => undefined);
    } finally {
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

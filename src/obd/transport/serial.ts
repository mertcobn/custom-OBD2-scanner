import { Listeners, TransportError, type Transport } from './types';

/** Bluetooth Serial Port Profile — Classic Bluetooth ELM327 adapters expose this RFCOMM service. */
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PortInfo = SerialPortInfo & { bluetoothServiceClassId?: string };

export interface SerialOptions {
  baudRate?: number;
  /** Re-use a port the user already granted (no picker). */
  port?: SerialPort;
  /** Re-use the most recently used granted port (after a reload), without the picker. */
  previous?: boolean;
  /** Delays between open attempts. A Bluetooth serial link that was just closed can stay busy for a few seconds. */
  retryDelaysMs?: number[];
}

// Duck-typed: DOMException may come from another realm (iframe, test env), so instanceof is unreliable.
const errorName = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : 'Error');
const errorMessage = (e: unknown) => {
  const name = errorName(e);
  const msg = e instanceof Error || (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : String(e);
  return msg.startsWith(`${name}: `) ? msg.slice(name.length + 2) : msg;
};

const LAST_PORT = 'shindan.lastSerialPort';
const portKey = (i: PortInfo) => JSON.stringify([i.bluetoothServiceClassId ?? null, i.usbVendorId ?? null, i.usbProductId ?? null]);
function rememberPort(info: PortInfo) {
  try {
    localStorage.setItem(LAST_PORT, portKey(info));
  } catch {
    /* storage unavailable */
  }
}
function lastPortKey(): string | null {
  try {
    return localStorage.getItem(LAST_PORT);
  } catch {
    return null;
  }
}

/** Human-readable description of what the user picked — shown in the connection test report. */
export function describePort(info: PortInfo): string {
  if (info.bluetoothServiceClassId) return 'Bluetooth RFCOMM (SPP)';
  if (info.usbVendorId !== undefined)
    return `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`;
  return 'System serial port (e.g. macOS cu.OBDII, Windows COM)';
}

/**
 * Web Serial transport: Classic Bluetooth adapters (RFCOMM, Chrome/Edge 117+ on desktop) and
 * USB ELM327 cables / OS-paired Bluetooth COM ports (macOS /dev/cu.*, Windows COMx).
 */
export class SerialTransport implements Transport {
  readonly kind = 'serial' as const;
  deviceName = 'Serial adapter';
  /** What happened while opening — included in the connection test report. */
  readonly attempts: string[] = [];
  private port?: SerialPort;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private reading?: Promise<void>;
  private data = new Listeners<[string]>();
  private close = new Listeners<[Error | undefined]>();
  private manualClose = false;
  onPicked?: () => void;
  private readonly onPageHide = () => void this.closePort();

  constructor(private readonly opts: SerialOptions = {}) {}

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  /** Ports this site was already given access to (survive reloads). */
  static async knownPorts(): Promise<SerialPort[]> {
    if (!SerialTransport.supported()) return [];
    try {
      return await navigator.serial.getPorts();
    } catch {
      return [];
    }
  }

  /** The granted port matching the last one used, or the only granted port. */
  static async previousPort(): Promise<SerialPort | undefined> {
    const ports = await SerialTransport.knownPorts();
    if (ports.length <= 1) return ports[0];
    const last = lastPortKey();
    return ports.find((p) => portKey(p.getInfo() as PortInfo) === last) ?? ports[ports.length - 1];
  }

  async connect(): Promise<void> {
    if (!SerialTransport.supported()) throw new TransportError('unsupported');
    if (this.opts.port) this.port = this.opts.port;
    else if (this.opts.previous) {
      this.port = await SerialTransport.previousPort();
      if (!this.port) throw new TransportError('cancelled', 'no previously used port');
    } else {
      try {
        this.port = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] } as SerialPortRequestOptions);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError') throw new TransportError('cancelled', e.message);
        throw new TransportError('unknown', e instanceof Error ? e.message : String(e));
      }
      this.onPicked?.();
    }
    const info = this.port.getInfo() as PortInfo;
    this.deviceName = describePort(info);
    rememberPort(info);
    await this.openWithRetry();
    this.manualClose = false;
    this.reading = this.readLoop();
    window.addEventListener('pagehide', this.onPageHide);
  }

  private async openWithRetry(): Promise<void> {
    const delays = this.opts.retryDelaysMs ?? [0, 800, 1600, 3000];
    let last: unknown;
    for (const [i, delay] of delays.entries()) {
      if (delay) await sleep(delay);
      try {
        await this.port!.open({ baudRate: this.opts.baudRate ?? 38400, bufferSize: 4096 });
        this.attempts.push(`open #${i + 1}: ok`);
        return;
      } catch (e) {
        last = e;
        const name = errorName(e);
        const msg = errorMessage(e);
        this.attempts.push(`open #${i + 1}: ${name}: ${msg}`);
        // Still open from an earlier session in this tab → close it and try again.
        if (name === 'InvalidStateError') await this.port!.close().catch(() => undefined);
        // NetworkError = the OS couldn't open the link (busy, out of range, still closing): retry.
        else if (name !== 'NetworkError') break;
      }
    }
    const name = errorName(last);
    const msg = errorMessage(last);
    throw new TransportError(name === 'NetworkError' || name === 'InvalidStateError' ? 'portBusy' : 'unknown', msg);
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
        this.reader = undefined;
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

  /**
   * Close reliably: cancel the reader, wait until the read loop has released its lock, then close.
   * (Closing while the stream is still locked fails silently and leaves the port open — the next
   * connection attempt would then get "port already open".)
   */
  private async closePort(): Promise<void> {
    this.manualClose = true;
    window.removeEventListener('pagehide', this.onPageHide);
    await this.reader?.cancel().catch(() => undefined);
    await this.reading?.catch(() => undefined);
    for (let i = 0; i < 3; i++) {
      try {
        await this.port?.close();
        return;
      } catch (e) {
        if (errorName(e) === 'InvalidStateError' && !this.port?.readable) return; // already closed
        await sleep(100);
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.closePort();
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

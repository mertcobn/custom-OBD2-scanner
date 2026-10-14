import type { TransportKind } from '@/obd/types';

/** A byte pipe to an ELM327-compatible adapter. All text is ASCII. */
export interface Transport {
  readonly kind: TransportKind;
  readonly deviceName: string;
  /** Must be called from a user gesture for BLE/Serial (browser device picker). */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(text: string): Promise<void>;
  onData(cb: (chunk: string) => void): () => void;
  onClose(cb: (error?: Error) => void): () => void;
  /** Re-open the same device after an unexpected drop, without the picker. Optional. */
  reconnect?(): Promise<void>;
}

export type TransportErrorCode = 'cancelled' | 'unsupported' | 'noCompatibleService' | 'portBusy' | 'lost' | 'unknown';

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TransportError';
  }
}

/** Tiny listener set helper shared by transports. */
export class Listeners<T extends unknown[]> {
  private set = new Set<(...args: T) => void>();
  add(fn: (...args: T) => void): () => void {
    this.set.add(fn);
    return () => this.set.delete(fn);
  }
  emit(...args: T): void {
    for (const fn of this.set) fn(...args);
  }
  clear(): void {
    this.set.clear();
  }
}

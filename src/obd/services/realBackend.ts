import { useConnection } from '@/state/connection';
import type { ObdBackend } from '@/obd/controller';
import type { TransportKind } from '@/obd/types';

/** Placeholder until the transport + ELM327 driver lands (Phase 2). */
export class RealBackend implements ObdBackend {
  constructor(private readonly kind: TransportKind) {}

  async connect(): Promise<void> {
    const c = useConnection.getState();
    c.begin(this.kind, false);
    c.step('device', 'active');
    c.fail('unknown', 'Hardware connection is not available yet.');
    throw new Error('not implemented');
  }

  async disconnect(): Promise<void> {}
  setWatched(): void {}
  async readDtcs(): Promise<void> {}
  async clearDtcs(): Promise<void> {}
}

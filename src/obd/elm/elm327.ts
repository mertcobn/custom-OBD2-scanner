import type { Transport } from '@/obd/transport/types';

/** Well-known ELM327 status words that mean "no usable answer". */
export type ElmErrorCode =
  | 'noData'
  | 'unknownCommand'
  | 'unableToConnect'
  | 'busError'
  | 'canError'
  | 'bufferFull'
  | 'stopped'
  | 'timeout'
  | 'closed';

export class ElmError extends Error {
  constructor(
    readonly code: ElmErrorCode,
    readonly command: string,
    readonly raw: string[] = [],
  ) {
    super(`${command}: ${code}${raw.length ? ` (${raw.join(' | ')})` : ''}`);
    this.name = 'ElmError';
  }
}

const STATUS: [RegExp, ElmErrorCode][] = [
  [/^NO DATA$/, 'noData'],
  [/^\?$/, 'unknownCommand'],
  [/UNABLE TO CONNECT/, 'unableToConnect'],
  [/BUS INIT:.*ERROR|BUS ERROR|BUS BUSY|FB ERROR|DATA ERROR|<RX ERROR|<DATA ERROR/, 'busError'],
  [/CAN ERROR/, 'canError'],
  [/BUFFER FULL/, 'bufferFull'],
  [/^STOPPED$/, 'stopped'],
];

/** Lines that are informational and never part of the answer. */
const NOISE = /^(SEARCHING\.*|BUS INIT:?\s*\.*\s*(OK)?|OK)$/;

export interface SendOptions {
  timeoutMs?: number;
  /** Keep "OK" lines (for AT commands) instead of treating them as noise. */
  raw?: boolean;
}

export interface ElmLogEntry {
  t: number;
  tx: string;
  rx: string[];
  ms: number;
}

/**
 * ELM327 command driver: serialises commands, collects output up to the '>' prompt,
 * strips echo/noise and maps status words to typed errors.
 */
export class Elm327 {
  private buffer = '';
  private waiter?: { resolve: (lines: string[]) => void; reject: (e: Error) => void; cmd: string };
  private chain: Promise<unknown> = Promise.resolve();
  /** After a timeout, everything up to the next prompt belongs to the abandoned command. */
  private discardUntilPrompt = false;
  private closed = false;
  private readonly offData: () => void;
  private readonly offClose: () => void;
  /** Optional raw traffic log (for exports and debugging). */
  log?: (entry: ElmLogEntry) => void;

  constructor(private readonly transport: Transport) {
    this.offData = transport.onData((chunk) => this.onChunk(chunk));
    this.offClose = transport.onClose(() => {
      this.closed = true;
      this.waiter?.reject(new ElmError('closed', this.waiter.cmd));
      this.waiter = undefined;
    });
  }

  dispose(): void {
    this.offData();
    this.offClose();
  }

  private onChunk(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('>')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (this.discardUntilPrompt) {
        this.discardUntilPrompt = false;
        continue;
      }
      const w = this.waiter;
      this.waiter = undefined;
      w?.resolve(block.split(/[\r\n]+/).map((l) => l.replace(/\0/g, '').trim()).filter(Boolean));
    }
  }

  /** Send one command and resolve with the meaningful response lines. */
  send(cmd: string, opts: SendOptions = {}): Promise<string[]> {
    const run = () => this.exec(cmd, opts);
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private exec(cmd: string, { timeoutMs = 2500, raw = false }: SendOptions): Promise<string[]> {
    if (this.closed) return Promise.reject(new ElmError('closed', cmd));
    const started = performance.now();
    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter !== waiter) return;
        this.waiter = undefined;
        this.discardUntilPrompt = true;
        reject(new ElmError('timeout', cmd));
      }, timeoutMs);

      const waiter: NonNullable<Elm327['waiter']> = {
        cmd,
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        resolve: (lines) => {
          clearTimeout(timer);
          // Drop echo (ATE1 after reset) — compare without spaces, case-insensitively.
          const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
          const body = lines.filter((l) => norm(l) !== norm(cmd));
          this.log?.({ t: Date.now(), tx: cmd, rx: body, ms: performance.now() - started });
          for (const line of body) {
            for (const [re, code] of STATUS) if (re.test(line.toUpperCase())) return reject(new ElmError(code, cmd, body));
          }
          resolve(raw ? body : body.filter((l) => !NOISE.test(l.toUpperCase())));
        },
      };
      this.waiter = waiter;
      this.buffer = '';
      this.transport.write(`${cmd}\r`).catch((e: unknown) => {
        clearTimeout(timer);
        this.waiter = undefined;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  /** Send an AT command, ignoring "?" from clones that don't implement it. Returns undefined on failure. */
  async at(cmd: string, timeoutMs?: number): Promise<string[] | undefined> {
    try {
      return await this.send(cmd, { timeoutMs, raw: true });
    } catch (e) {
      if (e instanceof ElmError && (e.code === 'unknownCommand' || e.code === 'timeout')) return undefined;
      throw e;
    }
  }
}

/** Extract "ELM327 v1.5" (or similar) from ATZ / ATI output. */
export function parseVersion(lines: string[] | undefined): string | undefined {
  const line = lines?.find((l) => /ELM|STN|OBDLINK|V\d/i.test(l));
  return line?.trim();
}

/** Parse ATRV output like "12.6V". */
export function parseVoltage(lines: string[] | undefined): number | undefined {
  const m = lines?.join(' ').match(/(\d+(?:\.\d+)?)\s*V/i);
  return m ? parseFloat(m[1]!) : undefined;
}

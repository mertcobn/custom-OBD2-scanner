/**
 * Parsing of ELM327 output (headers ON, spaces ON) into per-ECU messages.
 *
 * CAN 11-bit:  "7E8 06 41 00 BE 3F A8 13"            header = 3 hex chars, then ISO-TP PCI
 * CAN 29-bit:  "18 DA F1 10 06 41 00 BE 3F A8 13"     header = 4 bytes, then PCI
 * Legacy (J1850 / ISO 9141 / KWP2000): "48 6B 10 41 0C 1A F8 C3"  header = 3 bytes, data, checksum
 */

export type FrameFormat = 'can11' | 'can29' | 'legacy';

export interface EcuMessage {
  /** Responding ECU address, e.g. "7E8", "18DAF110" or "10" (legacy source address). */
  ecu: string;
  /** Payload starting with the service byte (e.g. 0x41). */
  data: number[];
}

/** Map an ELM327 protocol number (ATDPN, without the "A" auto prefix) to a frame format. */
export function frameFormatFor(protocol: string): FrameFormat {
  const p = protocol.replace(/^A/i, '').toUpperCase();
  if (p === '6' || p === '8' || p === 'B') return 'can11';
  if (p === '7' || p === '9' || p === 'A' || p === 'C') return 'can29';
  return 'legacy';
}

const HEX_BYTE = /^[0-9A-F]{2}$/i;

function bytes(tokens: string[]): number[] | undefined {
  const out: number[] = [];
  for (const t of tokens) {
    if (!HEX_BYTE.test(t)) return undefined;
    out.push(parseInt(t, 16));
  }
  return out;
}

/** Split raw lines into tokens; supports both spaced and unspaced output. */
function tokenize(line: string, format: FrameFormat): string[] {
  const clean = line.trim().toUpperCase();
  if (clean.includes(' ')) return clean.split(/\s+/);
  // Unspaced: carve the header, then pairs.
  const headerLen = format === 'can11' ? 3 : 0;
  const head = headerLen ? [clean.slice(0, headerLen)] : [];
  const rest = clean.slice(headerLen);
  const pairs = rest.match(/.{1,2}/g) ?? [];
  return [...head, ...pairs];
}

interface CanFrame {
  ecu: string;
  payload: number[];
}

function parseCanLine(line: string, format: 'can11' | 'can29'): CanFrame | undefined {
  const tokens = tokenize(line, format);
  if (format === 'can11') {
    const [header, ...rest] = tokens;
    if (!header || !/^[0-9A-F]{3}$/.test(header)) return undefined;
    const b = bytes(rest);
    return b ? { ecu: header, payload: b } : undefined;
  }
  const b = bytes(tokens);
  if (!b || b.length < 5) return undefined;
  const ecu = b
    .slice(0, 4)
    .map((x) => x.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  return { ecu, payload: b.slice(4) };
}

/** Reassemble ISO-TP (ISO 15765-2) single / first / consecutive frames per ECU. */
function assembleCan(frames: CanFrame[]): EcuMessage[] {
  const out: EcuMessage[] = [];
  const pending = new Map<string, { len: number; data: number[] }>();
  for (const { ecu, payload } of frames) {
    const pci = payload[0];
    if (pci === undefined) continue;
    const type = pci >> 4;
    if (type === 0) {
      const len = pci & 0x0f;
      out.push({ ecu, data: payload.slice(1, 1 + len) });
    } else if (type === 1) {
      const len = ((pci & 0x0f) << 8) | (payload[1] ?? 0);
      pending.set(ecu, { len, data: payload.slice(2) });
    } else if (type === 2) {
      const p = pending.get(ecu);
      if (!p) continue;
      p.data.push(...payload.slice(1));
      if (p.data.length >= p.len) {
        out.push({ ecu, data: p.data.slice(0, p.len) });
        pending.delete(ecu);
      }
    }
  }
  // Incomplete multi-frame messages: return what arrived rather than nothing.
  for (const [ecu, p] of pending) out.push({ ecu, data: p.data });
  return out;
}

/** Legacy protocols: one message per line; header is priority, target, source; last byte is checksum. */
function parseLegacy(lines: string[]): EcuMessage[] {
  const out: EcuMessage[] = [];
  for (const line of lines) {
    const b = bytes(tokenize(line, 'legacy'));
    if (!b || b.length < 5) continue;
    const ecu = b[2]!.toString(16).toUpperCase().padStart(2, '0');
    out.push({ ecu, data: b.slice(3, -1) });
  }
  return out;
}

/** Parse the response lines of one request (prompt, echo and status lines already removed). */
export function parseResponse(lines: string[], format: FrameFormat): EcuMessage[] {
  if (format === 'legacy') return parseLegacy(lines);
  const frames = lines.map((l) => parseCanLine(l, format)).filter((f): f is CanFrame => !!f);
  return assembleCan(frames);
}

/** Order ECUs so the engine ECU (7E8 / 18DAF110 / 10) comes first. */
export function sortEcus(ecus: string[]): string[] {
  const rank = (e: string) => (e === '7E8' || e === '18DAF110' || e === '10' ? 0 : 1);
  return [...ecus].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Find the payload answering `service`/`pid` (e.g. 0x41, 0x0C), preferring the engine ECU. Returns bytes after the PID. */
export function findPidData(messages: EcuMessage[], service: number, pid: number): { ecu: string; data: number[] } | undefined {
  const order = sortEcus(messages.map((m) => m.ecu));
  for (const ecu of order) {
    for (const m of messages) {
      if (m.ecu === ecu && m.data[0] === service && m.data[1] === pid) return { ecu, data: m.data.slice(2) };
    }
  }
  return undefined;
}

export const PROTOCOL_NAMES: Record<string, string> = {
  '1': 'SAE J1850 PWM (41.6 kbaud)',
  '2': 'SAE J1850 VPW (10.4 kbaud)',
  '3': 'ISO 9141-2 (5 baud init)',
  '4': 'ISO 14230-4 KWP (5 baud init)',
  '5': 'ISO 14230-4 KWP (fast init)',
  '6': 'ISO 15765-4 CAN (11 bit, 500 kbaud)',
  '7': 'ISO 15765-4 CAN (29 bit, 500 kbaud)',
  '8': 'ISO 15765-4 CAN (11 bit, 250 kbaud)',
  '9': 'ISO 15765-4 CAN (29 bit, 250 kbaud)',
  A: 'SAE J1939 CAN (29 bit, 250 kbaud)',
  B: 'USER1 CAN (11 bit, 125 kbaud)',
  C: 'USER2 CAN (11 bit, 50 kbaud)',
};

export function protocolName(dpn: string): string {
  const p = dpn.replace(/^A/i, '').toUpperCase();
  return PROTOCOL_NAMES[p] ?? `Protocol ${dpn}`;
}

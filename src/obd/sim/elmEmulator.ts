import { SIGNALS } from '@/obd/signals';
import { frameFormatFor } from '@/obd/protocol/frames';
import { encodeSupportedMask } from '@/obd/protocol/supported';
import type { Dtc, MonitorId } from '@/obd/types';
import type { SimScenario } from './scenario';
import { SIM_SUPPORTED, type VehicleModel } from './vehicleModel';

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const u16 = (n: number) => {
  const v = Math.max(0, Math.min(0xffff, Math.round(n)));
  return [v >> 8, v & 0xff];
};
const pct = (v: number) => [clampByte((v * 255) / 100)];
const trim = (v: number) => [clampByte((v * 128) / 100 + 128)];

/** Encode the model's current value(s) for a Mode 01 PID into data bytes (inverse of the catalogue decoders). */
function encodePid(pid: number, m: VehicleModel): number[] | undefined {
  const r = (id: string) => m.read(id) ?? 0;
  switch (pid) {
    case 0x04: return pct(r('engineLoad'));
    case 0x05: return [clampByte(r('coolantTemp') + 40)];
    case 0x06: return trim(r('stftB1'));
    case 0x07: return trim(r('ltftB1'));
    case 0x0b: return [clampByte(r('map'))];
    case 0x0c: return u16(r('rpm') * 4);
    case 0x0d: return [clampByte(r('speed'))];
    case 0x0e: return [clampByte((r('timingAdvance') + 64) * 2)];
    case 0x0f: return [clampByte(r('intakeTemp') + 40)];
    case 0x10: return u16(r('maf') * 100);
    case 0x11: return pct(r('throttle'));
    case 0x14: return [clampByte(r('o2VB1S1') * 200), 0xff];
    case 0x15: return [clampByte(r('o2VB1S2') * 200), 0xff];
    case 0x1f: return u16(r('runTime'));
    case 0x21: return u16(r('distanceMil'));
    case 0x2e: return pct(r('evapPurge'));
    case 0x2f: return pct(r('fuelLevel'));
    case 0x30: return [clampByte(r('warmUps'))];
    case 0x31: return u16(r('distanceCleared'));
    case 0x32: {
      const raw = Math.round(r('evapVaporPressure') * 1000 * 4);
      const v = raw < 0 ? raw + 0x10000 : raw;
      return [(v >> 8) & 0xff, v & 0xff];
    }
    case 0x33: return [clampByte(r('baro'))];
    case 0x3c: return u16((r('catTempB1S1') + 40) * 10);
    case 0x3e: return u16((r('catTempB1S2') + 40) * 10);
    case 0x42: return u16(r('moduleVoltage') * 1000);
    case 0x43: return u16((r('absLoad') * 255) / 100);
    case 0x44: return u16((r('cmdLambda') * 65536) / 2);
    case 0x45: return pct(r('relThrottle'));
    case 0x46: return [clampByte(r('ambientTemp') + 40)];
    case 0x49: return pct(r('pedalD'));
    case 0x4a: return pct(r('pedalE'));
    case 0x4c: return pct(r('cmdThrottle'));
    case 0x4d: return u16(r('timeMil'));
    case 0x4e: return u16(r('timeCleared'));
    case 0x5c: return [clampByte(r('oilTemp') + 40)];
    case 0x5e: return u16(r('fuelRate') * 20);
    default: return undefined;
  }
}

/** Mode 01 PIDs the simulated ECU answers (derived from the model, plus status PIDs). */
export const SIM_PIDS: number[] = [
  ...new Set([
    0x01, 0x03, 0x1c, 0x51,
    ...SIGNALS.filter((s) => s.source === 'obd' && SIM_SUPPORTED.includes(s.id)).map((s) => s.pid),
  ]),
].sort((a, b) => a - b);

const SPARK_BITS: MonitorId[] = ['catalyst', 'heatedCatalyst', 'evap', 'secondaryAir', 'acRefrigerant', 'o2Sensor', 'o2Heater', 'egr'];
const CONTINUOUS: MonitorId[] = ['misfire', 'fuelSystem', 'components'];

export function encodeDtc(code: string): [number, number] {
  const sys = 'PCBU'.indexOf(code[0]!);
  const d1 = parseInt(code[1]!, 16);
  const rest = parseInt(code.slice(2), 16);
  return [(sys << 6) | (d1 << 4) | (rest >> 8), rest & 0xff];
}

export interface EmulatorOptions {
  /** Answer from a second ECU (transmission, 7E9) to PID 00 — exercises multi-ECU parsing. */
  secondEcu?: boolean;
  /** Like some clones: the automatic search (ATSP0) gives up with "NO DATA"; only an explicit ATSPn works. */
  autoSearchFails?: boolean;
  /** No car on the bus (ignition off): every OBD request fails. */
  noCar?: boolean;
}

/**
 * Text-level ELM327 emulator. Feed it command strings, get exactly what an adapter would print
 * (including echo, "SEARCHING...", headers and the '>' prompt).
 */
export class Elm327Emulator {
  echo = true;
  headers = false;
  spaces = true;
  private connected = false;
  /** Protocol set with ATSP/ATTP ('0' = automatic). */
  private sp = '0';
  private dtcs: Dtc[];
  private cleared = false;

  constructor(
    private readonly model: VehicleModel,
    private readonly scenario: SimScenario,
    private readonly opts: EmulatorOptions = { secondEcu: true },
  ) {
    this.dtcs = scenario.dtcs;
  }

  /** Process one command line (without "\r"). Returns the full adapter output. */
  handle(input: string): string {
    const cmd = input.trim().toUpperCase().replace(/\s+/g, '');
    // Echo happens as characters arrive, i.e. with the setting in force *before* this command.
    const echo = this.echo ? `${input.trim()}\r` : '';
    const lines = this.respond(cmd);
    return `${echo}${lines.join('\r')}\r\r>`;
  }

  private respond(cmd: string): string[] {
    if (cmd === '') return ['?'];
    if (cmd.startsWith('AT')) return this.at(cmd.slice(2));
    if (!/^[0-9A-F]+$/.test(cmd) || cmd.length < 2) return ['?'];
    const auto = this.sp === '0';
    if (this.opts.noCar || (auto && this.opts.autoSearchFails)) return auto ? ['SEARCHING...', 'NO DATA'] : ['NO DATA'];
    if (!auto && this.sp !== this.scenario.protocol) return [Number.parseInt(this.sp, 16) <= 5 ? 'BUS INIT: ...ERROR' : 'NO DATA'];
    // First request on a slow-init bus (ISO 9141 / KWP 5 baud) prints the init result, like a real ELM.
    const init = !this.connected && ['3', '4'].includes(this.protocol) ? ['BUS INIT: ...OK'] : [];
    const searching = [...(!this.connected && auto ? ['SEARCHING...'] : []), ...init];
    this.connected = true;
    const out = this.obd(cmd);
    return [...searching, ...(out.length ? out : ['NO DATA'])];
  }

  private at(c: string): string[] {
    if (c === 'Z' || c === 'WS') {
      this.echo = true;
      this.headers = false;
      this.spaces = true;
      this.connected = false;
      return ['', 'ELM327 v1.5'];
    }
    if (c === 'I') return ['ELM327 v1.5'];
    if (c === '@1') return ['OBDII to RS232 Interpreter'];
    if (c === 'RV') return [`${(this.model.read('adapterVoltage') ?? 12.4).toFixed(1)}V`];
    if (c === 'E0' || c === 'E1') return (this.echo = c === 'E1'), ['OK'];
    if (c === 'H0' || c === 'H1') return (this.headers = c === 'H1'), ['OK'];
    if (c === 'S0' || c === 'S1') return (this.spaces = c === 'S1'), ['OK'];
    const sp = /^(?:SP|TP)A?([0-9A-C])$/.exec(c);
    if (sp) {
      this.sp = sp[1]!;
      this.connected = false;
      return ['OK'];
    }
    if (c === 'DPN') return this.sp !== '0' ? [this.sp] : [this.connected ? `A${this.scenario.protocol}` : 'A0'];
    if (c === 'DP') return [this.connected ? `AUTO, ${this.scenario.protocol}` : 'AUTO'];
    if (/^(L[01]|M[01]|AT[012]|ST[0-9A-F]{2}|SP[0-9A-C]|TP[0-9A-C]|CAF[01]|D|PC|AL|NL|CFC[01]|AR)$/.test(c)) return ['OK'];
    return ['?'];
  }

  private obd(cmd: string): string[] {
    const mode = parseInt(cmd.slice(0, 2), 16);
    const args = (cmd.slice(2).match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));
    switch (mode) {
      case 0x01: {
        // Optional trailing response-count digit ("010C1") — ignore.
        const all = cmd.length % 2 === 1 ? args.slice(0, -1) : args;
        // Pre-CAN ECUs answer one PID per request.
        const pids = this.format === 'legacy' ? all.slice(0, 1) : all;
        const payload: number[] = [0x41];
        for (const pid of pids.slice(0, 6)) {
          const data = this.mode01(pid);
          if (data) payload.push(pid, ...data);
        }
        const out: string[] = [];
        if (payload.length > 1) out.push(...this.frame('7E8', payload));
        if (this.opts.secondEcu && pids[0] === 0x00) out.push(...this.frame('7E9', [0x41, 0x00, 0x98, 0x18, 0x00, 0x10]));
        return out;
      }
      case 0x02: {
        const [pid = 0, frameNo = 0] = args;
        if (frameNo !== 0 || this.cleared) return [];
        if (pid === 0x00) return this.frame('7E8', [0x42, 0x00, 0x00, ...encodeSupportedMask(0, [0x02, ...Object.keys(this.scenario.freezeFrame.values).map(Number)])]);
        if (pid === 0x02) return this.frame('7E8', [0x42, 0x02, 0x00, ...encodeDtc(this.scenario.freezeFrame.dtc)]);
        const v = this.scenario.freezeFrame.values[pid];
        return v ? this.frame('7E8', [0x42, pid, 0x00, ...v]) : [];
      }
      case 0x03:
      case 0x07:
      case 0x0a: {
        const kind = mode === 0x03 ? 'stored' : mode === 0x07 ? 'pending' : 'permanent';
        const codes = this.dtcs.filter((d) => d.kind === kind);
        const payload = [mode + 0x40, codes.length, ...codes.flatMap((d) => encodeDtc(d.code))];
        return this.frame('7E8', payload);
      }
      case 0x04:
        this.dtcs = this.dtcs.filter((d) => d.kind === 'permanent');
        this.cleared = true;
        return this.frame('7E8', [0x44]);
      case 0x09:
        return this.mode09(args[0] ?? 0);
      case 0x06:
        return this.mode06(args[0] ?? 0);
      default:
        return [];
    }
  }

  private mode01(pid: number): number[] | undefined {
    if (pid % 0x20 === 0) {
      const all = SIM_PIDS.filter((p) => p > pid && p <= pid + 0x20);
      const hasMore = SIM_PIDS.some((p) => p > pid + 0x20);
      if (!all.length && pid !== 0) return undefined;
      return encodeSupportedMask(pid, hasMore ? [...all, pid + 0x20] : all);
    }
    if (pid === 0x01) return this.monitorStatus();
    if (pid === 0x03) return [0x02, 0x00]; // closed loop
    if (pid === 0x1c) return [0x06]; // EOBD
    if (pid === 0x51) return [0x01]; // gasoline
    if (!SIM_PIDS.includes(pid)) return undefined;
    return encodePid(pid, this.model);
  }

  private monitorStatus(): number[] {
    const m = this.scenario.monitor;
    const stored = this.dtcs.filter((d) => d.kind === 'stored').length;
    const mil = !this.cleared && m.mil;
    const byId = new Map(m.monitors.map((x) => [x.id, x]));
    const resetComplete = (id: MonitorId) => (this.cleared ? id === 'components' : (byId.get(id)?.complete ?? false));
    let b = 0;
    CONTINUOUS.forEach((id, i) => {
      if (byId.get(id)?.supported) b |= 1 << i;
      if (byId.get(id)?.supported && !resetComplete(id)) b |= 1 << (i + 4);
    });
    let c = 0;
    let d = 0;
    SPARK_BITS.forEach((id, i) => {
      if (byId.get(id)?.supported) {
        c |= 1 << i;
        if (!resetComplete(id)) d |= 1 << i;
      }
    });
    return [(mil ? 0x80 : 0) | (stored & 0x7f), b, c, d];
  }

  private mode06(mid: number): string[] {
    const mids = Object.keys(this.scenario.mode06).map(Number).sort((a, b) => a - b);
    if (mid % 0x20 === 0) {
      const inRange = mids.filter((m) => m > mid && m <= mid + 0x20);
      const more = mids.some((m) => m > mid + 0x20);
      if (!inRange.length && !more) return [];
      return this.frame('7E8', [0x46, mid, ...encodeSupportedMask(mid, more ? [...inRange, mid + 0x20] : inRange)]);
    }
    const tests = this.scenario.mode06[mid];
    if (!tests || this.cleared) return [];
    const w = (n: number) => [(n >> 8) & 0xff, n & 0xff];
    return this.frame('7E8', [0x46, mid, ...tests.flatMap(([tid, uasid, v, lo, hi]) => [tid, uasid, ...w(v), ...w(lo), ...w(hi)])]);
  }

  private mode09(pid: number): string[] {
    const ascii = (s: string, len: number) => [...s.padEnd(len, '\0')].slice(0, len).map((ch) => ch.charCodeAt(0));
    if (pid === 0x00) return this.frame('7E8', [0x49, 0x00, ...encodeSupportedMask(0, [0x02, 0x04, 0x0a])]);
    if (pid === 0x02) return this.frame('7E8', [0x49, 0x02, 0x01, ...ascii(this.scenario.vin, 17)]);
    if (pid === 0x04) {
      const ids = this.scenario.calibrationIds;
      return this.frame('7E8', [0x49, 0x04, ids.length, ...ids.flatMap((id) => ascii(id, 16))]);
    }
    if (pid === 0x0a) return this.frame('7E8', [0x49, 0x0a, 0x01, ...ascii(this.scenario.ecuName, 20)]);
    return [];
  }

  /** The protocol in use: the one forced with ATSP, else the car's own. */
  private get protocol(): string {
    return this.sp !== '0' ? this.sp : this.scenario.protocol;
  }

  private get format() {
    return frameFormatFor(this.protocol);
  }

  /** Format a payload the way the ELM prints it for the protocol in use (`ecu` is the CAN 11-bit id). */
  private frame(ecu: string, payload: number[]): string[] {
    if (this.format === 'legacy') return this.legacyFrames(ecu, payload);
    if (this.format === 'can29') return this.canFrames(['18', 'DA', 'F1', ecu === '7E8' ? '10' : '18'], payload);
    return this.canFrames([ecu], payload);
  }

  /**
   * J1850 / ISO 9141 / KWP: one message per line, at most 7 data bytes, header + checksum.
   * Long answers are split the legacy way: Mode 09 with a sequence byte, DTCs three per line.
   */
  private legacyFrames(ecu: string, payload: number[]): string[] {
    const src = ecu === '7E8' ? 0x10 : 0x18;
    const p = this.protocol;
    const line = (data: number[]) => {
      const head = p === '1' ? [0x41, 0x6b, src] : p === '4' || p === '5' ? [0x80 | data.length, 0xf1, src] : [0x48, 0x6b, src];
      const all = [...head, ...data];
      const sum = all.reduce((a, b) => a + b, 0) & 0xff;
      const sep = this.spaces ? ' ' : '';
      return this.headers ? [...all, sum].map(hex).join(sep) : data.map(hex).join(sep);
    };
    const [svc = 0, pid = 0] = payload;
    if (svc === 0x49 && (pid === 0x02 || pid === 0x04 || pid === 0x0a)) {
      const body = payload.slice(3);
      const padded = [...new Array<number>((4 - (body.length % 4)) % 4).fill(0), ...body];
      const out: string[] = [];
      for (let i = 0, seq = 1; i < padded.length; i += 4, seq++) out.push(line([0x49, pid, seq, ...padded.slice(i, i + 4)]));
      return out;
    }
    if (svc === 0x43 || svc === 0x47 || svc === 0x4a) {
      const codes = payload.slice(2);
      const padded = [...codes, ...new Array<number>((6 - (codes.length % 6)) % 6 || (codes.length ? 0 : 6)).fill(0)];
      const out: string[] = [];
      for (let i = 0; i < padded.length; i += 6) out.push(line([svc, ...padded.slice(i, i + 6)]));
      return out;
    }
    return [line(payload.slice(0, 7))];
  }

  private canFrames(header: string[], payload: number[]): string[] {
    const ecu = header.join(this.spaces ? ' ' : '');
    const sep = this.spaces ? ' ' : '';
    const bytes = (b: number[]) => b.map(hex).join(sep);
    const head = (b: number[]) => (this.headers ? `${ecu}${sep}${bytes(b)}` : bytes(b));
    if (payload.length <= 7) {
      return [this.headers ? head([payload.length, ...payload]) : bytes(payload)];
    }
    // ISO-TP multi-frame
    const lines: string[] = [];
    if (!this.headers) lines.push(payload.length.toString(16).toUpperCase().padStart(3, '0'));
    const first = payload.slice(0, 6);
    lines.push(this.headers ? head([0x10 | (payload.length >> 8), payload.length & 0xff, ...first]) : `0:${sep}${bytes(first)}`);
    let seq = 1;
    for (let i = 6; i < payload.length; i += 7) {
      const chunk = payload.slice(i, i + 7);
      lines.push(this.headers ? head([0x20 | (seq & 0x0f), ...chunk]) : `${(seq & 0x0f).toString(16).toUpperCase()}:${sep}${bytes(chunk)}`);
      seq++;
    }
    return lines;
  }
}

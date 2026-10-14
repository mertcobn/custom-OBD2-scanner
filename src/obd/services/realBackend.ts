import { useConnection, type ConnectErrorCode } from '@/state/connection';
import { useLive } from '@/state/live';
import { useVehicle } from '@/state/vehicle';
import type { ObdBackend } from '@/obd/controller';
import { Elm327, ElmError, parseVersion, parseVoltage, type ElmLogEntry } from '@/obd/elm/elm327';
import { findPidData, frameFormatFor, parseResponse, protocolName, sortEcus, type EcuMessage, type FrameFormat } from '@/obd/protocol/frames';
import {
  decodeCalibrationIds,
  decodeDtc,
  decodeDtcMessages,
  decodeFuelType,
  decodeMonitorStatus,
  decodeObdStandard,
  decodeVin,
  decodeVinInfo,
} from '@/obd/protocol/diagnostics';
import { decodeMode06 } from '@/obd/protocol/mode06';
import { decodeSupportedMask, hasNextRange, signalsForPids } from '@/obd/protocol/supported';
import { SIGNALS, SIGNAL_BY_ID } from '@/obd/signals';
import { BleTransport } from '@/obd/transport/ble';
import { SerialTransport } from '@/obd/transport/serial';
import { SimTransport } from '@/obd/transport/sim';
import { TransportError, type Transport } from '@/obd/transport/types';
import type { Dtc, DtcKind, FreezeFrame, Sample } from '@/obd/types';
import { track } from '@/lib/telemetry';
import { sampleBus } from './bus';
import { PollScheduler } from './scheduler';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RealTarget = 'ble' | 'bleAll' | 'serial' | 'serialKnown' | 'sim';

function makeTransport(target: RealTarget): Transport {
  switch (target) {
    case 'ble':
      return new BleTransport();
    case 'bleAll':
      return new BleTransport({ acceptAll: true });
    case 'serial':
      return new SerialTransport();
    case 'serialKnown':
      return new SerialTransport({ previous: true });
    case 'sim':
      return new SimTransport();
  }
}

class ConnectFailure extends Error {
  constructor(
    readonly code: ConnectErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Raw traffic ring buffer — exported with recordings so problems can be diagnosed later. */
export const trafficLog: ElmLogEntry[] = [];
const TRAFFIC_MAX = 400;

/** "HH:MM:SS.mmm  > 010C  < 7E8 04 41 0C 1A F8  (52 ms)" — one line per command. */
export function formatTrafficLog(entries: ElmLogEntry[]): string {
  return entries
    .map((e) => {
      const time = new Date(e.t).toISOString().slice(11, 23);
      return `${time}  > ${e.tx || '(CR)'}  < ${e.rx.join(' | ') || '(empty)'}  (${Math.round(e.ms)} ms)`;
    })
    .join('\n');
}

/**
 * Real connection: transport → ELM327 driver → OBD protocol, feeding the stores and sample bus.
 */
export class RealBackend implements ObdBackend {
  readonly transport: Transport;
  private elm: Elm327;
  private format: FrameFormat = 'can11';
  private scheduler = new PollScheduler();
  private watched: string[] = [];
  private supportedPids = new Set<number>();
  private alive = true;
  private polling = false;
  private paused = 0;
  private responses: number[] = [];
  private consecutiveFailures = 0;
  private dpn = '0';
  private reconnecting = false;

  constructor(
    readonly target: RealTarget,
    transport?: Transport,
    private readonly opts: { reconnectDelayMs?: number; reconnectAttempts?: number } = {},
  ) {
    this.transport = transport ?? makeTransport(target);
    this.elm = new Elm327(this.transport);
    this.elm.log = (e) => {
      trafficLog.push(e);
      if (trafficLog.length > TRAFFIC_MAX) trafficLog.splice(0, trafficLog.length - TRAFFIC_MAX);
    };
  }

  async connect(): Promise<void> {
    const c = useConnection.getState();
    // Targets that open the browser's device picker: the chooser stays on screen until a device is chosen.
    const picking = this.target === 'ble' || this.target === 'bleAll' || this.target === 'serial';
    c.begin(this.transport.kind, this.transport.kind === 'sim', picking);
    if (picking) this.transport.onPicked = () => useConnection.getState().picked();
    trafficLog.length = 0; // the log (and the connection test report) describe this connection only
    try {
      c.step('device', 'active');
      await this.transport.connect();
      if (!this.alive) return;
      if (useConnection.getState().picking) c.picked();
      c.step('device', 'done', this.transport.deviceName);
      this.transport.onClose((err) => this.onClosed(err));

      c.step('adapter', 'active');
      const version = await this.initAdapter();
      c.step('adapter', 'done', version);

      c.step('protocol', 'active');
      const protocol = await this.detectProtocol();
      c.step('protocol', 'done', protocol);

      c.step('vehicle', 'active');
      const ecus = await this.discover();
      c.step('vehicle', 'done', ecus.join(', '));

      const voltage = parseVoltage(await this.elm.at('ATRV'));
      useVehicle.getState().setInfo({ ...useVehicle.getState().info, protocol, ecus });
      c.connected({ transport: this.transport.kind, name: this.transport.deviceName, elmVersion: version, voltage }, protocol);
      track('connect_success', { transport: this.transport.kind, chip: version, protocol: this.dpn });
      void this.afterConnect();
      void this.pollLoop();
    } catch (e) {
      const failure = this.toFailure(e);
      // Closing the browser's device picker is not an error worth showing.
      if (failure.code === 'cancelled') useConnection.getState().pickCancelled();
      else {
        useConnection.getState().fail(failure.code, failure.message === failure.code ? undefined : failure.message, this.connectionReport(failure));
        track('connect_fail', { transport: this.transport.kind, reason: failure.code });
      }
      await this.shutdown();
      throw failure;
    }
  }

  /** Plain-text "connection test" report: what was tried, where it stopped, and the raw adapter conversation. */
  private connectionReport(failure: ConnectFailure): string {
    const c = useConnection.getState();
    const t = this.transport as Transport & { attempts?: string[] };
    const lines = [
      `Shindan ${__APP_VERSION__} — connection test`,
      `Time: ${new Date().toISOString()}`,
      `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
      `Connection: ${this.target} (${this.transport.kind})`,
      `Device: ${this.transport.deviceName}`,
      ...(t.attempts?.length ? ['Port:', ...t.attempts.map((a) => `  ${a}`)] : []),
      'Steps:',
      // The step still "active" when the error hit is the one that failed.
      ...c.steps.map((s) => `  ${s.state === 'done' ? '✓' : s.state === 'failed' || s.state === 'active' ? '✗' : '·'} ${s.id}${s.detail ? ` — ${s.detail}` : ''}`),
      `Result: ${failure.code}${failure.message && failure.message !== failure.code ? ` — ${failure.message}` : ''}`,
      'Adapter traffic (> sent, < received):',
      trafficLog.length ? formatTrafficLog(trafficLog.slice(-40)) : '  (nothing was exchanged with the adapter)',
    ];
    return lines.join('\n');
  }

  /** Vehicle identity, readiness and fault codes — read once right after connecting. */
  private async afterConnect(): Promise<void> {
    await this.readVehicleInfo().catch(() => undefined);
    await this.readMonitor().catch(() => undefined);
    await this.readDtcs().catch(() => undefined);
  }

  /** Request that tolerates "NO DATA" / unsupported answers. */
  private async tryRequest(cmd: string, timeoutMs = 3000): Promise<EcuMessage[]> {
    try {
      return await this.exclusive(() => this.request(cmd, timeoutMs));
    } catch (e) {
      if (e instanceof ElmError && e.code !== 'closed') return [];
      throw e;
    }
  }

  private async readVehicleInfo(): Promise<void> {
    const vin = decodeVin(await this.tryRequest('0902', 5000), this.format);
    const calibrationIds = decodeCalibrationIds(await this.tryRequest('0904', 5000), this.format);
    const std = this.supportedPids.has(0x1c) ? findPidData(await this.tryRequest('011C'), 0x41, 0x1c)?.data[0] : undefined;
    const fuel = this.supportedPids.has(0x51) ? findPidData(await this.tryRequest('0151'), 0x41, 0x51)?.data[0] : undefined;
    const prev = useVehicle.getState().info ?? { ecus: [] };
    useVehicle.getState().setInfo({
      ...prev,
      vin,
      ...(vin ? decodeVinInfo(vin) : {}),
      calibrationIds: calibrationIds.length ? calibrationIds : undefined,
      obdStandard: decodeObdStandard(std),
      fuelType: decodeFuelType(fuel),
    });
  }

  private async readMonitor(): Promise<void> {
    const hit = findPidData(await this.tryRequest('0101'), 0x41, 0x01);
    if (hit) useVehicle.getState().setMonitor(decodeMonitorStatus(hit.data));
  }

  private async readFreezeFrame(): Promise<FreezeFrame | undefined> {
    const head = findPidData(await this.tryRequest('020200'), 0x42, 0x02);
    if (!head || head.data.length < 3 || (head.data[1] === 0 && head.data[2] === 0)) return undefined;
    const dtc = decodeDtc(head.data[1]!, head.data[2]!);
    const wanted = [0x0c, 0x0d, 0x05, 0x04, 0x06, 0x07, 0x08, 0x09, 0x0f, 0x0b, 0x10, 0x11, 0x0e, 0x03].filter((p) => this.supportedPids.has(p));
    const values: Record<string, number> = {};
    for (const pid of wanted) {
      const hit = findPidData(await this.tryRequest(`02${pid.toString(16).padStart(2, '0').toUpperCase()}00`), 0x42, pid);
      if (!hit || hit.data.length < 2) continue;
      const bytes = hit.data.slice(1); // drop frame number
      for (const s of SIGNALS) {
        if (s.source !== 'obd' || s.pid !== pid || (s.valid && !s.valid(bytes))) continue;
        values[s.id] = s.decode(bytes);
      }
    }
    return { dtc, values };
  }
  private toFailure(e: unknown): ConnectFailure {
    if (e instanceof ConnectFailure) return e;
    if (e instanceof TransportError) return new ConnectFailure(e.code === 'lost' ? 'lost' : e.code, e.message);
    if (e instanceof ElmError) {
      if (e.code === 'unableToConnect' || e.code === 'noData' || e.code === 'busError' || e.code === 'canError')
        return new ConnectFailure('noVehicle', e.message);
      if (e.code === 'timeout') return new ConnectFailure('adapterSilent', e.message);
      if (e.code === 'closed') return new ConnectFailure('lost', e.message);
    }
    return new ConnectFailure('unknown', e instanceof Error ? e.message : String(e));
  }

  private async initAdapter(): Promise<string> {
    // Some clones need a moment after the link comes up. A bare CR flushes any partial input;
    // it goes through the command queue so its "?" + prompt is consumed and can't be taken
    // as the answer to the next command (which would shift every response by one).
    // Classic Bluetooth serial links (macOS cu.*, Windows COM) take a second or two to carry data
    // after the port opens; commands sent earlier are silently lost.
    const serial = this.transport.kind === 'serial';
    await sleep(this.transport.kind === 'sim' ? 0 : serial ? 1500 : 200);
    await this.elm.at('', serial ? 2000 : 1000);
    let reset: string[] | undefined;
    for (let attempt = 0; attempt < (serial ? 3 : 2) && !reset; attempt++) reset = await this.elm.at('ATZ', serial ? 4000 : 3000);
    if (!reset) throw new ConnectFailure('adapterSilent');
    await this.elm.at('ATE0');
    await this.elm.at('ATL0');
    await this.elm.at('ATS1'); // keep spaces: more robust parsing across clones
    await this.elm.at('ATH1'); // headers: tell ECUs apart, needed for multi-frame
    await this.elm.at('ATAT1'); // adaptive timing
    await this.elm.at('ATSP0'); // automatic protocol search
    const version = parseVersion(await this.elm.at('ATI')) ?? parseVersion(reset) ?? 'ELM327';
    return version;
  }

  private async detectProtocol(): Promise<string> {
    // The first request triggers the protocol search, which can take several seconds.
    await this.elm.send('0100', { timeoutMs: 12000 });
    const dpn = (await this.elm.at('ATDPN'))?.[0] ?? '6';
    this.dpn = dpn.replace(/^A/i, '');
    this.format = frameFormatFor(dpn);
    return protocolName(dpn);
  }

  private async request(cmd: string, timeoutMs = 2000): Promise<EcuMessage[]> {
    const lines = await this.elm.send(cmd, { timeoutMs });
    return parseResponse(lines, this.format);
  }

  private async discover(): Promise<string[]> {
    const ecus = new Set<string>();
    const pids = new Set<number>();
    for (let base = 0; base <= 0xc0; base += 0x20) {
      let msgs: EcuMessage[];
      try {
        msgs = await this.request(`01${base.toString(16).padStart(2, '0').toUpperCase()}`, 4000);
      } catch (e) {
        if (e instanceof ElmError && e.code === 'noData') break;
        throw e;
      }
      let more = false;
      for (const m of msgs) {
        if (m.data[0] !== 0x41 || m.data[1] !== base) continue;
        ecus.add(m.ecu);
        const found = decodeSupportedMask(base, m.data.slice(2, 6));
        found.forEach((p) => pids.add(p));
        more ||= hasNextRange(base, found);
      }
      if (!more) break;
    }
    if (ecus.size === 0) throw new ConnectFailure('noVehicle');
    this.supportedPids = pids;
    useLive.getState().setSupported(signalsForPids(pids));
    return sortEcus([...ecus]);
  }

  setWatched(ids: string[]): void {
    this.watched = ids;
    this.scheduler.setWatched(ids.filter((id) => {
      const s = SIGNAL_BY_ID[id];
      return !!s && (s.source === 'elm' || this.supportedPids.has(s.pid));
    }));
  }

  /** Run a one-off command between poll requests (e.g. DTC read). */
  protected async exclusive<T>(fn: (elm: Elm327) => Promise<T>): Promise<T> {
    this.paused++;
    try {
      return await fn(this.elm);
    } finally {
      this.paused--;
    }
  }

  protected requestMessages(cmd: string, timeoutMs?: number) {
    return this.request(cmd, timeoutMs);
  }

  private async pollLoop() {
    if (this.polling) return;
    this.polling = true;
    while (this.alive) {
      const id = this.paused ? undefined : this.scheduler.next();
      if (!id) {
        await sleep(this.paused ? 30 : 120);
        this.updateRate();
        continue;
      }
      await this.pollOne(id);
      this.updateRate();
    }
    this.polling = false;
  }

  private async pollOne(id: string) {
    const sig = SIGNAL_BY_ID[id];
    if (!sig) return;
    const now = Date.now();
    try {
      if (sig.source === 'elm') {
        const v = parseVoltage(await this.elm.send('ATRV', { timeoutMs: 1500, raw: true }));
        if (v !== undefined) {
          sampleBus.emit([{ t: now, id, v }]);
          useConnection.getState().setVoltage(v);
        }
      } else {
        const pidHex = sig.pid.toString(16).padStart(2, '0').toUpperCase();
        const msgs = await this.request(`01${pidHex}`, 1500);
        const hit = findPidData(msgs, 0x41, sig.pid);
        if (hit) {
          const samples: Sample[] = [];
          for (const sib of PollScheduler.siblings(id, this.watched)) {
            const s = SIGNAL_BY_ID[sib]!;
            if (hit.data.length === 0 || (s.valid && !s.valid(hit.data))) continue;
            const v = s.decode(hit.data);
            if (Number.isFinite(v)) samples.push({ t: now, id: sib, v });
          }
          sampleBus.emit(samples);
        }
      }
      this.responses.push(now);
      this.consecutiveFailures = 0;
      if (useConnection.getState().status === 'reconnecting') useConnection.getState().setStatus('connected');
    } catch (e) {
      if (e instanceof ElmError && (e.code === 'closed' || e.code === 'noData')) return; // closed, or PID not answered right now
      this.consecutiveFailures++;
      // Many failures in a row: the car went quiet (ignition off?) or the link is degrading.
      if (this.consecutiveFailures >= 8 && useConnection.getState().status === 'connected') useConnection.getState().setStatus('reconnecting');
      await sleep(Math.min(1000, 50 * this.consecutiveFailures));
    }
  }

  private updateRate() {
    const now = Date.now();
    while (this.responses.length && now - this.responses[0]! > 2000) this.responses.shift();
    useLive.getState().setRate(this.responses.length / 2);
  }

  private onClosed(err?: Error) {
    if (!this.alive) return;
    if (err && this.transport.reconnect) {
      void this.tryReconnect(err);
      return;
    }
    this.alive = false;
    if (err) useConnection.getState().fail('lost', err.message);
  }

  /** Link dropped (out of range, adapter power blip): re-open the same device a few times before giving up. */
  private async tryReconnect(err: Error) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.paused++;
    useConnection.getState().setStatus('reconnecting');
    const attempts = this.opts.reconnectAttempts ?? 3;
    const delay = this.opts.reconnectDelayMs ?? 1500;
    try {
      for (let i = 1; i <= attempts && this.alive; i++) {
        await sleep(delay * i);
        if (!this.alive) return;
        try {
          await this.transport.reconnect!();
          this.elm.reopen();
          await this.elm.at('', 1000);
          if (!(await this.elm.at('ATZ', 3000))) throw new Error('adapter silent');
          for (const cmd of ['ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATAT1', `ATSP${this.dpn}`]) await this.elm.at(cmd);
          useConnection.getState().setStatus('connected');
          return;
        } catch {
          /* next attempt */
        }
      }
      this.alive = false;
      useConnection.getState().fail('lost', err.message);
      await this.transport.disconnect().catch(() => undefined);
    } finally {
      this.paused--;
      this.reconnecting = false;
    }
  }

  async readDtcs(): Promise<void> {
    const v = useVehicle.getState();
    v.setDtcState('loading');
    try {
      const dtcs: Dtc[] = [];
      const modes: [string, number, DtcKind][] = [
        ['03', 0x43, 'stored'],
        ['07', 0x47, 'pending'],
        ['0A', 0x4a, 'permanent'],
      ];
      for (const [cmd, service, kind] of modes) dtcs.push(...decodeDtcMessages(await this.tryRequest(cmd, 4000), service, kind, this.format));
      const ff = dtcs.length ? await this.readFreezeFrame().catch(() => undefined) : undefined;
      useVehicle.getState().setDtcs(dtcs, ff);
    } catch {
      useVehicle.getState().setDtcState('error');
    }
  }

  /** Mode 06 on-board test results. Only the CAN format is standardised enough to decode reliably. */
  async readTests(): Promise<void> {
    const v = useVehicle.getState();
    if (this.format === 'legacy') {
      v.setTests('unsupported');
      return;
    }
    v.setTestsState('loading');
    try {
      const mids: number[] = [];
      for (let base = 0; base <= 0xe0; base += 0x20) {
        const hit = findPidData(await this.tryRequest(`06${base.toString(16).padStart(2, '0').toUpperCase()}`, 4000), 0x46, base);
        if (!hit) break;
        const found = decodeSupportedMask(base, hit.data.slice(0, 4));
        mids.push(...found.filter((m) => m % 0x20 !== 0));
        if (!hasNextRange(base, found)) break;
      }
      if (mids.length === 0) {
        useVehicle.getState().setTests('unsupported');
        return;
      }
      const tests = [];
      for (const mid of mids) {
        tests.push(...decodeMode06(await this.tryRequest(`06${mid.toString(16).padStart(2, '0').toUpperCase()}`, 4000), mid));
      }
      useVehicle.getState().setTests(tests);
    } catch {
      useVehicle.getState().setTestsState('error');
    }
  }

  async clearDtcs(): Promise<void> {
    const v = useVehicle.getState();
    v.setClearState('loading');
    try {
      const msgs = await this.exclusive(() => this.request('04', 5000));
      if (!msgs.some((m) => m.data[0] === 0x44)) throw new Error('no positive response');
      v.setClearState('ready');
    } catch {
      v.setClearState('error');
    }
    await sleep(this.transport.kind === 'sim' ? 0 : 800);
    await this.readMonitor().catch(() => undefined);
    await this.readDtcs();
    // Clearing codes also erases the on-board test results; refresh them if they were shown.
    if (useVehicle.getState().testsState === 'ready') await this.readTests();
  }

  private async shutdown() {
    this.alive = false;
    this.elm.dispose();
    await this.transport.disconnect().catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    await this.shutdown();
  }
}

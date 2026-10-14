import { create } from 'zustand';
import type { AdapterInfo, TransportKind } from '@/obd/types';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** Human-facing connection steps, shown live while connecting. */
export type ConnectStepId = 'device' | 'adapter' | 'protocol' | 'vehicle';
export type StepState = 'pending' | 'active' | 'done' | 'failed';

export type ConnectErrorCode =
  | 'cancelled'
  | 'unsupported'
  | 'noCompatibleService'
  | 'portBusy'
  | 'adapterSilent'
  | 'noVehicle'
  | 'lost'
  | 'unknown';

export interface ConnectStep {
  id: ConnectStepId;
  state: StepState;
  /** Extra detail, e.g. "ELM327 v1.5" or the protocol name. */
  detail?: string;
}

interface ConnectionState {
  status: ConnectionStatus;
  /** The browser's device picker is open: nothing has started yet, so the chooser stays on screen. */
  picking: boolean;
  demo: boolean;
  transport?: TransportKind;
  adapter?: AdapterInfo;
  protocol?: string;
  steps: ConnectStep[];
  /** `report`: the connection test report (steps, port, raw adapter traffic) for troubleshooting. */
  error?: { code: ConnectErrorCode; message?: string; report?: string };
  connectedAt?: number;
  /** With `picking`, the previous error stays visible until a device is chosen (no flash of an empty chooser). */
  begin: (transport: TransportKind, demo: boolean, picking?: boolean) => void;
  /** A device was chosen in the picker. */
  picked: () => void;
  /** The picker was closed without choosing: back to exactly what was shown before. */
  pickCancelled: () => void;
  step: (id: ConnectStepId, state: StepState, detail?: string) => void;
  connected: (adapter: AdapterInfo, protocol?: string) => void;
  fail: (code: ConnectErrorCode, message?: string, report?: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setVoltage: (v: number) => void;
  reset: (keepError?: boolean) => void;
}

const initialSteps = (): ConnectStep[] =>
  (['device', 'adapter', 'protocol', 'vehicle'] as const).map((id) => ({ id, state: 'pending' }));

export const useConnection = create<ConnectionState>()((set) => ({
  status: 'idle',
  picking: false,
  demo: false,
  steps: initialSteps(),
  begin: (transport, demo, picking = false) =>
    set((s) => ({
      status: 'connecting',
      picking,
      transport,
      demo,
      steps: initialSteps(),
      error: picking ? s.error : undefined,
      adapter: undefined,
      protocol: undefined,
    })),
  picked: () => set({ picking: false, error: undefined }),
  pickCancelled: () => set((s) => ({ status: s.error ? 'error' : 'idle', picking: false, steps: initialSteps() })),
  step: (id, state, detail) =>
    set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, state, detail: detail ?? st.detail } : st)) })),
  connected: (adapter, protocol) => set({ status: 'connected', adapter, protocol, connectedAt: Date.now() }),
  fail: (code, message, report) =>
    set((s) => ({
      status: 'error',
      picking: false,
      error: { code, message, report },
      steps: s.steps.map((st) => (st.state === 'active' ? { ...st, state: 'failed' } : st)),
    })),
  setStatus: (status) => set({ status }),
  setVoltage: (voltage) => set((s) => (s.adapter ? { adapter: { ...s.adapter, voltage } } : {})),
  reset: (keepError = false) =>
    set((s) => ({
      status: keepError && s.error ? 'error' : 'idle',
      picking: false,
      demo: false,
      transport: undefined,
      adapter: undefined,
      protocol: undefined,
      steps: initialSteps(),
      error: keepError ? s.error : undefined,
      connectedAt: undefined,
    })),
}));

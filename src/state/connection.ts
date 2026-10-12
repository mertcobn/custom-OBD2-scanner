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
  demo: boolean;
  transport?: TransportKind;
  adapter?: AdapterInfo;
  protocol?: string;
  steps: ConnectStep[];
  error?: { code: ConnectErrorCode; message?: string };
  connectedAt?: number;
  begin: (transport: TransportKind, demo: boolean) => void;
  step: (id: ConnectStepId, state: StepState, detail?: string) => void;
  connected: (adapter: AdapterInfo, protocol?: string) => void;
  fail: (code: ConnectErrorCode, message?: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setVoltage: (v: number) => void;
  reset: () => void;
}

const initialSteps = (): ConnectStep[] =>
  (['device', 'adapter', 'protocol', 'vehicle'] as const).map((id) => ({ id, state: 'pending' }));

export const useConnection = create<ConnectionState>()((set) => ({
  status: 'idle',
  demo: false,
  steps: initialSteps(),
  begin: (transport, demo) =>
    set({ status: 'connecting', transport, demo, steps: initialSteps(), error: undefined, adapter: undefined, protocol: undefined }),
  step: (id, state, detail) =>
    set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, state, detail: detail ?? st.detail } : st)) })),
  connected: (adapter, protocol) => set({ status: 'connected', adapter, protocol, connectedAt: Date.now() }),
  fail: (code, message) =>
    set((s) => ({
      status: 'error',
      error: { code, message },
      steps: s.steps.map((st) => (st.state === 'active' ? { ...st, state: 'failed' } : st)),
    })),
  setStatus: (status) => set({ status }),
  setVoltage: (voltage) => set((s) => (s.adapter ? { adapter: { ...s.adapter, voltage } } : {})),
  reset: () =>
    set({ status: 'idle', demo: false, transport: undefined, adapter: undefined, protocol: undefined, steps: initialSteps(), error: undefined, connectedAt: undefined }),
}));

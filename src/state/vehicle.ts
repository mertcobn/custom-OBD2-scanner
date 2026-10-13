import { create } from 'zustand';
import type { Dtc, FreezeFrame, MonitorStatus, VehicleInfo } from '@/obd/types';
import type { OnboardTest } from '@/obd/protocol/mode06';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface VehicleState {
  info?: VehicleInfo;
  monitor?: MonitorStatus;
  dtcs: Dtc[];
  freezeFrame?: FreezeFrame;
  dtcState: LoadState;
  dtcReadAt?: number;
  clearState: LoadState;
  /** Mode 06 results; 'unsupported' when the car/protocol doesn't offer them. */
  tests: OnboardTest[];
  testsState: LoadState | 'unsupported';
  testsReadAt?: number;
  setTests: (tests: OnboardTest[] | 'unsupported') => void;
  setTestsState: (s: LoadState) => void;
  setInfo: (info: VehicleInfo) => void;
  setMonitor: (m: MonitorStatus) => void;
  setDtcState: (s: LoadState) => void;
  setDtcs: (dtcs: Dtc[], freezeFrame?: FreezeFrame) => void;
  setClearState: (s: LoadState) => void;
  reset: () => void;
}

export const useVehicle = create<VehicleState>()((set) => ({
  dtcs: [],
  dtcState: 'idle',
  clearState: 'idle',
  tests: [],
  testsState: 'idle',
  setTests: (tests) =>
    set(tests === 'unsupported' ? { tests: [], testsState: 'unsupported', testsReadAt: Date.now() } : { tests, testsState: 'ready', testsReadAt: Date.now() }),
  setTestsState: (testsState) => set({ testsState }),
  setInfo: (info) => set({ info }),
  setMonitor: (monitor) => set({ monitor }),
  setDtcState: (dtcState) => set({ dtcState }),
  setDtcs: (dtcs, freezeFrame) => set({ dtcs, freezeFrame, dtcState: 'ready', dtcReadAt: Date.now() }),
  setClearState: (clearState) => set({ clearState }),
  reset: () =>
    set({
      info: undefined,
      monitor: undefined,
      dtcs: [],
      freezeFrame: undefined,
      dtcState: 'idle',
      dtcReadAt: undefined,
      clearState: 'idle',
      tests: [],
      testsState: 'idle',
      testsReadAt: undefined,
    }),
}));

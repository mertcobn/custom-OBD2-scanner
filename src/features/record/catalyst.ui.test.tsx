import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// jsdom has no matchMedia (used by the theme and layout hooks).
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import '@/i18n';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { DtcPage } from '@/features/dtc/DtcPage';
import type { Dtc } from '@/obd/types';
import { useConnection } from '@/state/connection';
import { useLive } from '@/state/live';
import { useRecording } from '@/state/recording';
import { useSettings } from '@/state/settings';
import { useVehicle } from '@/state/vehicle';
import { RecordPage } from './RecordPage';

const SUPPORTED = ['rpm', 'speed', 'engineLoad', 'coolantTemp', 'o2VB1S1', 'o2VB1S2', 'stftB1', 'ltftB1', 'maf'];

function setCar(dtcs: Dtc[]) {
  useConnection.setState({ status: 'connected' });
  useLive.getState().setSupported(SUPPORTED);
  useVehicle.getState().setDtcs(dtcs);
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/record', element: <RecordPage /> },
      { path: '/dtc', element: <DtcPage /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const pressed = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('catalyst test in the UI', () => {
  beforeEach(() => {
    useSettings.setState({ language: 'tr' });
    useRecording.setState({ status: 'idle', config: { preset: 'drive', signals: [], durationSec: null } });
  });
  afterEach(() => {
    cleanup();
    useVehicle.getState().reset();
    useConnection.getState().reset();
    useLive.getState().clear();
  });

  it('P0420 on the car → the catalyst test is selected, with its code shown and a 5 min duration', async () => {
    setCar([{ code: 'P0420', kind: 'stored', ecu: '7E8' }]);
    renderAt('/record');
    expect(pressed(/Katalizör testi/)).toBe('true');
    expect(screen.getByText('P0420 bulundu: Katalizör testi seçildi.')).toBeInTheDocument();
    const c = useRecording.getState().config;
    expect(c.signals).toEqual(['o2VB1S1', 'o2VB1S2', 'rpm', 'coolantTemp']);
    expect(c.tiers?.o2VB1S2).toBe('fast');
    expect(c.durationSec).toBe(300);
  });

  it('a preset the user picked is not overridden by a code that appears later', async () => {
    setCar([]);
    renderAt('/record');
    expect(pressed(/Günlük sürüş/)).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Yakıt tüketimi/ }));
    await act(async () => useVehicle.getState().setDtcs([{ code: 'P0420', kind: 'pending', ecu: '7E8' }]));
    expect(pressed(/Yakıt tüketimi/)).toBe('true');
    expect(pressed(/Katalizör testi/)).toBe('false');
    expect(useRecording.getState().config.tiers).toBeUndefined();
  });

  it('no catalyst code → nothing changes', () => {
    setCar([{ code: 'P0301', kind: 'stored', ecu: '7E8' }]);
    renderAt('/record');
    expect(pressed(/Günlük sürüş/)).toBe('true');
    expect(screen.queryByText(/bulundu: Katalizör testi/)).toBeNull();
  });

  it('editing the signals by hand drops the poll-rate overrides', async () => {
    setCar([{ code: 'P0420', kind: 'stored', ecu: '7E8' }]);
    renderAt('/record');
    expect(useRecording.getState().config.tiers).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sinyalleri seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Araç hızı/ }));
    expect(useRecording.getState().config.preset).toBe('custom');
    expect(useRecording.getState().config.tiers).toBeUndefined();
  });

  it('DTC page: a catalyst code offers "Record a catalyst test", which opens the recorder ready to go', async () => {
    setCar([
      { code: 'P0301', kind: 'stored', ecu: '7E8' },
      { code: 'P0420', kind: 'stored', ecu: '7E8' },
    ]);
    const router = renderAt('/dtc');
    const buttons = screen.getAllByRole('button', { name: 'Katalizör testi kaydet' });
    expect(buttons).toHaveLength(1); // only on P0420, not on P0301
    fireEvent.click(buttons[0]!);
    await act(async () => undefined);
    expect(router.state.location.pathname).toBe('/record');
    expect(pressed(/Katalizör testi/)).toBe('true');
    expect(useRecording.getState().config.chosen).toBe(true);
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleBus } from '@/obd/services/bus';
import * as store from '@/storage/db';
import { useConnection } from './connection';
import { useRecording, type SessionMeta } from './recording';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('recording engine', () => {
  beforeEach(async () => {
    await useRecording.getState().clearAll();
    useRecording.setState({ config: { preset: 'custom', signals: ['rpm', 'speed'], durationSec: null } });
  });

  it('records only the selected signals, persists them and the markers', async () => {
    const r = useRecording.getState();
    r.start();
    expect(useRecording.getState().status).toBe('recording');
    const t0 = Date.now();
    sampleBus.emit([
      { t: t0, id: 'rpm', v: 800 },
      { t: t0, id: 'coolantTemp', v: 90 },
      { t: t0 + 50, id: 'speed', v: 12 },
    ]);
    const idx = useRecording.getState().addMarker();
    useRecording.getState().setMarkerNote(idx, '  shaking at idle ');
    sampleBus.emit([{ t: t0 + 100, id: 'rpm', v: 820 }]);
    await useRecording.getState().stop();

    const s = useRecording.getState();
    expect(s.status).toBe('finished');
    expect(s.sampleCount).toBe(3);
    expect(s.current?.markers[0]?.note).toBe('shaking at idle');

    const saved = await store.listSessions();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ status: 'finished', sampleCount: 3, config: { signals: ['rpm', 'speed'] } });
    expect(saved[0]!.markers).toHaveLength(1);
    const samples = await store.loadSamples(saved[0]!.id);
    expect(samples.map((x) => x.id)).toEqual(['rpm', 'speed', 'rpm']);
  });

  it('notes connection drops as pause/resume events', async () => {
    useConnection.setState({ status: 'connected' });
    useRecording.getState().start();
    useConnection.getState().setStatus('reconnecting');
    useConnection.getState().setStatus('connected');
    await useRecording.getState().stop();
    expect(useRecording.getState().current!.events.map((e) => e.type)).toEqual(['paused', 'resumed']);
    useConnection.getState().reset();
  });

  it('auto-stops after the chosen duration', async () => {
    useRecording.setState({ config: { preset: 'custom', signals: ['rpm'], durationSec: 0.05 } });
    useRecording.getState().start();
    await wait(120);
    expect(useRecording.getState().status).toBe('finished');
  });

  it('recovers a recording interrupted by a page close', async () => {
    const meta: SessionMeta = {
      id: 'crashed',
      startedAt: 1000,
      status: 'recording',
      config: { preset: 'drive', signals: ['rpm'], durationSec: null },
      markers: [],
      events: [],
      sampleCount: 0,
      snapshot: { dtcs: [], supported: [], demo: true },
    };
    await store.putSession(meta);
    await store.appendChunk('crashed', 0, [
      { t: 1100, id: 'rpm', v: 800 },
      { t: 1900, id: 'rpm', v: 900 },
    ]);
    await useRecording.getState().init();
    const s = useRecording.getState();
    expect(s.recovered).toEqual(['crashed']);
    const rec = s.sessions.find((x) => x.id === 'crashed')!;
    expect(rec).toMatchObject({ status: 'interrupted', endedAt: 1900, sampleCount: 2 });
    expect(await useRecording.getState().loadSamples('crashed')).toHaveLength(2);
  });

  it('deletes a session and its samples', async () => {
    useRecording.getState().start();
    sampleBus.emit([{ t: Date.now(), id: 'rpm', v: 1 }]);
    await useRecording.getState().stop();
    const id = useRecording.getState().current!.id;
    await useRecording.getState().removeSession(id);
    expect(await store.listSessions()).toEqual([]);
    expect(await store.loadSamples(id)).toEqual([]);
  });
});

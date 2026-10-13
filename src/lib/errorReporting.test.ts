import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const captureException = vi.fn();
const close = vi.fn(() => Promise.resolve(true));
vi.mock('@sentry/react', () => ({ init, captureException, close }));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('error reporting', () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockClear();
    captureException.mockClear();
    close.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('scrubs VINs and URL query strings', async () => {
    const { scrubDeep, scrubText } = await import('./errorReporting');
    expect(scrubText('VIN JTDBR32E720012345 read')).toBe('VIN [VIN] read');
    expect(scrubText('at https://x.app/live?vin=abc#frag end')).toBe('at https://x.app/live end');
    expect(scrubText('Is it ok? yes')).toBe('Is it ok? yes');
    expect(scrubDeep({ a: ['WVWZZZ1KZ6W612345'], b: { c: 3 } })).toEqual({ a: ['[VIN]'], b: { c: 3 } });
  });

  it('does nothing at all without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { useSettings } = await import('@/state/settings');
    const { errorReportingAvailable, initErrorReporting, reportError } = await import('./errorReporting');
    useSettings.setState({ errorReports: true });
    initErrorReporting();
    reportError(new Error('x'));
    await flush();
    expect(errorReportingAvailable).toBe(false);
    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('loads only after opt-in, scrubs events, and stops when turned off', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1');
    const { useSettings } = await import('@/state/settings');
    const { initErrorReporting, reportError } = await import('./errorReporting');
    useSettings.setState({ errorReports: false });
    initErrorReporting();
    await flush();
    expect(init).not.toHaveBeenCalled();

    useSettings.getState().setErrorReports(true);
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0]![0];
    expect(opts.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false });

    const event = opts.beforeSend(
      {
        message: 'failed for JTDBR32E720012345',
        user: { id: 'u' },
        request: { url: 'https://x.app/dtc?vin=1', headers: { a: 'b' } },
      },
      {},
    );
    expect(event.message).toBe('failed for [VIN]');
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: 'https://x.app/dtc' });
    expect(opts.beforeBreadcrumb({ category: 'console', message: 'rpm 812' })).toBeNull();

    reportError(new Error('boom'), 'route');
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { context: 'route' } });

    useSettings.getState().setErrorReports(false);
    await flush();
    expect(close).toHaveBeenCalled();
    reportError(new Error('after off'));
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

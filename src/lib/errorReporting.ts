import { useSettings } from '@/state/settings';

/**
 * Optional, opt-in error reporting (Sentry).
 *
 * - Off by default. Only offered when the deployment defines VITE_SENTRY_DSN.
 * - The SDK is loaded lazily, only after the user turns it on — otherwise no code and no requests.
 * - Every event is scrubbed before it leaves the device: no VIN, no query strings, no user/IP,
 *   no console breadcrumbs (they could contain readings). Vehicle data is never sent.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const errorReportingAvailable = !!DSN;

type SentryModule = typeof import('@sentry/react');
let sentry: SentryModule | undefined;
let loading: Promise<SentryModule | undefined> | undefined;

/** 17-character VIN (no I, O, Q). */
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

/** Query strings and fragments of URLs. */
const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi;

export function scrubText(s: string): string {
  return s.replace(VIN, '[VIN]').replace(URL_QUERY, '$1');
}

/** Deeply scrub every string in an event-like object. */
export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (Array.isArray(value)) return value.map(scrubDeep) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v);
    return out as T;
  }
  return value;
}

async function load(): Promise<SentryModule | undefined> {
  if (!DSN) return undefined;
  loading ??= import('@sentry/react').then((S) => {
    S.init({
      dsn: DSN,
      release: `shindan@${__APP_VERSION__}`,
      environment: import.meta.env.VITE_VERCEL_ENV ?? 'local',
      // Collect nothing beyond the error itself: no user info, cookies, headers, query params or bodies.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      tracesSampleRate: 0,
      beforeBreadcrumb: (b) => (b.category === 'console' ? null : scrubDeep(b)),
      beforeSend: (event) => {
        const e = scrubDeep(event);
        delete e.user;
        if (e.request) {
          delete e.request.headers;
          delete e.request.cookies;
          if (e.request.url) e.request.url = e.request.url.split(/[?#]/)[0];
        }
        return e;
      },
    });
    sentry = S;
    return S;
  });
  return loading;
}

async function unload() {
  const s = sentry;
  sentry = undefined;
  loading = undefined;
  await s?.close().catch(() => undefined);
}

/** Report a caught error (no-op unless the user enabled reporting). */
export function reportError(error: unknown, context?: string): void {
  if (!sentry || !useSettings.getState().errorReports) return;
  try {
    sentry.captureException(error, context ? { tags: { context } } : undefined);
  } catch {
    /* reporting must never throw */
  }
}

/** Start/stop the SDK as the user's choice changes. Call once at start-up. */
export function initErrorReporting(): void {
  if (!DSN) return;
  const apply = (on: boolean) => void (on ? load() : unload());
  apply(useSettings.getState().errorReports);
  useSettings.subscribe((s, prev) => {
    if (s.errorReports !== prev.errorReports) apply(s.errorReports);
  });
}

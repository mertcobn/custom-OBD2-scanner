import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { useSettings } from '@/state/settings';

/** Only on the Vercel production deployment (where /_vercel/insights exists), or when forced via VITE_ANALYTICS=1. */
export const ANALYTICS_AVAILABLE = import.meta.env.VITE_VERCEL_ENV === 'production' || import.meta.env.VITE_ANALYTICS === '1';

/** Cookie-free page views; mounted only while the user allows it. URLs carry no personal data. */
export function Analytics() {
  const enabled = useSettings((s) => s.analytics);
  if (!enabled || !ANALYTICS_AVAILABLE) return null;
  return <VercelAnalytics beforeSend={(e) => ({ ...e, url: e.url.split('?')[0]! })} />;
}

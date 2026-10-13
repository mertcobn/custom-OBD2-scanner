import { Component, type ReactNode } from 'react';
import { Analytics as VercelAnalytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { useSettings } from '@/state/settings';
import { reportError } from '@/lib/errorReporting';

/** Only on the Vercel production deployment (where /_vercel/insights exists), or when forced via VITE_ANALYTICS=1. */
const available = () => import.meta.env.VITE_VERCEL_ENV === 'production' || import.meta.env.VITE_ANALYTICS === '1';

/** Stable reference: an inline function would re-register on every render. Drops query strings. */
function stripQuery(e: BeforeSendEvent): BeforeSendEvent {
  return { ...e, url: e.url.split('?')[0]! };
}

/** Optional widgets must never take the app down: on error, render nothing and stay quiet. */
export class Isolated extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[shindan] ${this.props.name} disabled after an error:`, error);
    reportError(error, this.props.name);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Cookie-free page views; mounted only while the user allows it. URLs carry no personal data. */
export function Analytics() {
  const enabled = useSettings((s) => s.analytics);
  if (!enabled || !available()) return null;
  return (
    <Isolated name="analytics">
      <VercelAnalytics beforeSend={stripQuery} />
    </Isolated>
  );
}

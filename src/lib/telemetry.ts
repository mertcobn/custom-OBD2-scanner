import { track as vercelTrack } from '@vercel/analytics';
import { useSettings } from '@/state/settings';

type Props = Record<string, string | number | boolean | null>;

/**
 * Anonymous product events (only when the user allows analytics). Never include vehicle data:
 * no VIN, no values, no codes — only coarse facts like "connected via BLE with ELM327 v1.5".
 */
export function track(event: 'connect_success' | 'connect_fail' | 'export' | 'recording', props: Props = {}): void {
  if (!useSettings.getState().analytics) return;
  if (import.meta.env.VITE_VERCEL_ENV !== 'production' && import.meta.env.VITE_ANALYTICS !== '1') return;
  try {
    vercelTrack(event, props);
  } catch {
    /* analytics must never break the app */
  }
}

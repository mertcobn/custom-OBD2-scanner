export type BrowserFamily = 'chrome' | 'edge' | 'opera' | 'samsung' | 'bluefy' | 'safari' | 'firefox' | 'other';

export interface Compat {
  ble: boolean;
  serial: boolean;
  ios: boolean;
  android: boolean;
  secure: boolean;
  browser: BrowserFamily;
}

export function detectBrowser(ua: string): BrowserFamily {
  if (/Bluefy/i.test(ua)) return 'bluefy';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\//i.test(ua)) return 'opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS|Chromium/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

export function isIOS(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS reports itself as Macintosh; touch points give it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

export function detectCompat(): Compat {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const ua = nav?.userAgent ?? '';
  return {
    ble: !!nav && 'bluetooth' in nav && !!nav.bluetooth,
    serial: !!nav && 'serial' in nav && !!nav.serial,
    ios: isIOS(ua, nav?.maxTouchPoints ?? 0),
    android: /Android/i.test(ua),
    secure: typeof window === 'undefined' ? true : window.isSecureContext,
    browser: detectBrowser(ua),
  };
}

export const BLUEFY_URL = 'https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055';

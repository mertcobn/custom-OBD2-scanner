/** Keep the screen on while recording (Screen Wake Lock API, best effort). */

let sentinel: WakeLockSentinel | undefined;
let wanted = false;

async function request() {
  try {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => (sentinel = undefined));
  } catch {
    /* denied or unsupported (e.g. low battery) */
  }
}

// The lock is dropped whenever the tab is hidden; take it back when we return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && !sentinel && document.visibilityState === 'visible') void request();
  });
}

export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  if (!sentinel) await request();
}

export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  const s = sentinel;
  sentinel = undefined;
  await s?.release().catch(() => undefined);
}

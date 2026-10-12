import { useEffect } from 'react';
import { useSettings } from '@/state/settings';

const THEME_COLOR = { light: '#f6f1e7', dark: '#121417' } as const;

/** Resolve the theme preference and reflect it on <html data-theme> and the browser chrome colour. */
export function useApplyTheme(): void {
  const pref = useSettings((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

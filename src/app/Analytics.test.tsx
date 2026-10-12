import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Analytics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (window as { va?: unknown }).va;
  });

  it('a failing analytics script never breaks the app', async () => {
    vi.stubEnv('VITE_ANALYTICS', '1');
    // What a broken/changed Vercel analytics script looks like from our side.
    (window as { va?: unknown }).va = () => {
      throw new TypeError('l is not a function');
    };
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    const { Analytics } = await import('./Analytics');
    const { container } = render(
      <div>
        <Analytics />
        <p>app</p>
      </div>,
    );
    window.removeEventListener('error', onError);
    expect(container.textContent).toBe('app');
    expect(errors).toEqual([]);
  });
});

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Exposed automatically by Vercel for Vite projects: 'production' | 'preview' | 'development'. */
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_ANALYTICS?: string;
  /** Sentry DSN; when absent, error reporting is not offered at all. */
  readonly VITE_SENTRY_DSN?: string;
}

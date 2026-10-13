import { useEffect, useState } from 'react';
import { reportError } from '@/lib/errorReporting';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';

/** Shown instead of a blank/English crash page. Lets the user copy the details to report the problem. */
export function RouteError() {
  const error = useRouteError();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    reportError(error, 'route');
  }, [error]);
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  // A new version was deployed while this tab was open: the old code chunk no longer exists. A reload fixes it.
  const staleChunk = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);
  const details = [
    `Shindan ${__APP_VERSION__}`,
    `URL: ${location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    `Error: ${message}`,
    error instanceof Error && error.stack ? error.stack : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6 py-10">
      <span className="grid size-14 -rotate-6 place-items-center rounded-[28%] bg-beni font-serif text-3xl font-bold text-[#fbf3ea]" aria-hidden>
        !
      </span>
      <h1 className="font-serif text-3xl font-semibold">{t('crash.title')}</h1>
      <p className="text-ink-muted">{staleChunk ? t('crash.stale') : t('crash.body')}</p>
      <div className="flex flex-wrap gap-2">
        <button className="h-11 rounded-2xl bg-ink px-5 font-medium text-bg" onClick={() => location.reload()}>
          {t('crash.reload')}
        </button>
        <button
          className="h-11 rounded-2xl border border-line bg-surface px-5 font-medium"
          onClick={() => {
            void navigator.clipboard?.writeText(details).then(() => setCopied(true));
          }}
        >
          {copied ? t('common.copied') : t('crash.copy')}
        </button>
      </div>
      <pre className="num max-h-60 overflow-auto rounded-2xl bg-surface-2 p-3 text-[11px] whitespace-pre-wrap text-ink-muted">{details}</pre>
    </main>
  );
}

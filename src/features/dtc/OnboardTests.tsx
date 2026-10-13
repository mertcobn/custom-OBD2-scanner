import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { readTests } from '@/obd/controller';
import { monitorName, testName, type OnboardTest } from '@/obd/protocol/mode06';
import { cx } from '@/lib/cx';
import { LOCALE } from '@/lib/format';
import { useSettings } from '@/state/settings';
import { useVehicle } from '@/state/vehicle';
import { formatNumber } from '@/units/units';
import { Button } from '@/ui/Button';
import { Badge, Card, SectionTitle } from '@/ui/controls';
import { EnsoLoader } from '@/ui/EnsoLoader';

/** Where the value sits relative to its limits, as a 0–100 % position on a bar with padding either side. */
function barGeometry(t: OnboardTest) {
  const span = t.max - t.min || Math.abs(t.max) || 1;
  const lo = t.min - span * 0.25;
  const hi = t.max + span * 0.25;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  return { from: pos(t.min), to: pos(t.max), at: pos(t.value) };
}

function TestRow({ t }: { t: OnboardTest }) {
  const { t: tr } = useTranslation();
  const lang = useSettings((s) => s.language);
  const fmt = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : Math.min(3, String(v).split('.')[1]?.length ?? 0), LOCALE[lang]);
  const g = barGeometry(t);
  return (
    <li className="border-b border-line py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[15px] leading-snug">{testName(t.mid, t.tid)[lang]}</span>
        <Badge tone={t.pass ? 'matcha' : 'beni'} className="shrink-0">
          {t.pass ? tr('dtc.tests.pass') : tr('dtc.tests.fail')}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded-full bg-surface-2" aria-hidden>
          <div className="absolute inset-y-0 rounded-full bg-matcha/25" style={{ left: `${g.from}%`, width: `${g.to - g.from}%` }} />
          <div
            className={cx('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', t.pass ? 'bg-matcha' : 'bg-beni')}
            style={{ left: `${g.at}%` }}
          />
        </div>
        <span className={cx('num w-24 shrink-0 text-right text-sm', !t.pass && 'text-beni')}>
          {fmt(t.value)} <span className="text-xs text-ink-muted">{t.unit}</span>
        </span>
      </div>
      <div className="num mt-1 text-xs text-ink-faint">
        {tr('dtc.tests.range')}: {fmt(t.min)} … {fmt(t.max)} {t.unit}
      </div>
    </li>
  );
}

export function OnboardTests() {
  const { t } = useTranslation();
  const lang = useSettings((s) => s.language);
  const tests = useVehicle((s) => s.tests);
  const state = useVehicle((s) => s.testsState);

  const groups = useMemo(() => {
    const m = new Map<number, OnboardTest[]>();
    for (const x of tests) m.set(x.mid, [...(m.get(x.mid) ?? []), x]);
    // Failing monitors first — that's what the user is looking for.
    return [...m.entries()].sort(([a, ta], [b, tb]) => Number(ta.every((x) => x.pass)) - Number(tb.every((x) => x.pass)) || a - b);
  }, [tests]);
  const failed = tests.filter((x) => !x.pass).length;

  return (
    <Card className="p-5">
      <SectionTitle
        kanji="検査"
        action={
          <Button size="sm" variant="secondary" icon={<FlaskConical size={15} />} disabled={state === 'loading'} onClick={() => void readTests()}>
            {state === 'ready' ? t('dtc.reread') : t('dtc.tests.read')}
          </Button>
        }
      >
        {t('dtc.tests.title')}
      </SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('dtc.tests.body')}</p>

      {state === 'loading' && (
        <div className="flex items-center gap-3 py-6">
          <EnsoLoader size={40} />
          <span className="text-ink-muted">{t('dtc.tests.reading')}</span>
        </div>
      )}
      {state === 'unsupported' && <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">{t('dtc.tests.unsupported')}</p>}
      {state === 'error' && <p className="text-sm text-beni">{t('report.failed')}</p>}
      {state === 'ready' && tests.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">{t('dtc.tests.none')}</p>}

      {state === 'ready' && tests.length > 0 && (
        <>
          <p className={cx('mb-2 text-sm font-medium', failed ? 'text-beni' : 'text-matcha')}>
            {t('dtc.tests.summary', { count: tests.length, failed })}
          </p>
          <div className="flex flex-col gap-4">
            {groups.map(([mid, list]) => (
              <section key={mid} className="rounded-2xl border border-line px-4 pt-3">
                <h3 className="flex items-center gap-2 font-medium">
                  <span className={cx('size-2 rounded-full', list.every((x) => x.pass) ? 'bg-matcha' : 'bg-beni')} aria-hidden />
                  {monitorName(mid)[lang]}
                </h3>
                <ul>
                  {list.map((x) => (
                    <TestRow key={`${x.ecu}-${x.tid}`} t={x} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-faint">{t('dtc.tests.note')}</p>
        </>
      )}
    </Card>
  );
}

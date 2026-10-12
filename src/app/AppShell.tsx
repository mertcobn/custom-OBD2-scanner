import { NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Activity, Car, CircleDot, Gauge, Settings, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cx } from '@/lib/cx';
import { useConnection } from '@/state/connection';
import { useRecording } from '@/state/recording';
import { useUi } from '@/state/ui';
import { useVehicle } from '@/state/vehicle';
import { ConnectSheet } from '@/features/connect/ConnectSheet';
import { ConnectionPill } from '@/features/connect/ConnectionPill';
import { Hanko } from '@/ui/Hanko';
import { SakuraShower } from '@/ui/Sakura';
import { Analytics, Isolated } from './Analytics';
import { UpdatePrompt } from './UpdatePrompt';

interface NavItem {
  to: string;
  key: string;
  kanji: string;
  icon: LucideIcon;
  mobile: boolean;
}

const NAV: NavItem[] = [
  { to: '/', key: 'dashboard', kanji: '計器', icon: Gauge, mobile: true },
  { to: '/live', key: 'live', kanji: '数値', icon: Activity, mobile: true },
  { to: '/dtc', key: 'dtc', kanji: '故障', icon: TriangleAlert, mobile: true },
  { to: '/record', key: 'record', kanji: '記録', icon: CircleDot, mobile: true },
  { to: '/vehicle', key: 'vehicle', kanji: '車両', icon: Car, mobile: true },
  { to: '/settings', key: 'settings', kanji: '設定', icon: Settings, mobile: false },
];

function NavBadge({ item }: { item: NavItem }) {
  const dtcCount = useVehicle((s) => s.dtcs.length);
  const recording = useRecording((s) => s.status === 'recording');
  if (item.key === 'dtc' && dtcCount > 0)
    return (
      <span className="num absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-beni px-1 text-[10px] font-semibold text-on-accent">
        {dtcCount}
      </span>
    );
  if (item.key === 'record' && recording)
    return <span className="absolute -top-0.5 -right-1 size-2.5 animate-breathe rounded-full bg-beni" aria-hidden />;
  return null;
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex min-h-10 shrink-0 items-center gap-2.5" aria-label="Shindan">
      <Hanko char="診" size={compact ? 28 : 34} />
      {/* On very narrow phones (< 360 px) the seal alone is the logo, so the status pill keeps its room. */}
      <span className={cx('font-serif text-xl font-semibold tracking-tight', compact && 'hidden min-[360px]:inline')}>
        Shindan
        {!compact && <span className="ml-2 text-xs font-normal tracking-[0.3em] text-ink-faint">診断</span>}
      </span>
    </NavLink>
  );
}

function SideNav() {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav className="mt-10 flex flex-col gap-1" aria-label={t('nav.label')}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cx(
                'group relative flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition-colors',
                isActive ? 'bg-surface text-ink shadow-[var(--shadow)]' : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-sakura-deep' : undefined} />
                  <NavBadge item={item} />
                </span>
                <span className="flex-1">{t(`nav.${item.key}`)}</span>
                <span className="font-serif text-xs tracking-widest text-ink-faint" aria-hidden>
                  {item.kanji}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <ConnectionPill variant="card" />
      </div>
    </aside>
  );
}

function TopBar() {
  const { t } = useTranslation();
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
        <Brand compact />
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <ConnectionPill variant="pill" />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx('grid size-10 place-items-center rounded-full', isActive ? 'text-sakura-deep' : 'text-ink-muted hover:text-ink')
            }
            aria-label={t('nav.settings')}
          >
            <Settings size={20} />
          </NavLink>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('nav.label')}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/92 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {NAV.filter((n) => n.mobile).map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx('flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-ink-faint')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.7} className={isActive ? 'text-sakura-deep' : undefined} />
                    <NavBadge item={item} />
                  </span>
                  <span>{t(`nav.${item.key}`)}</span>
                  <span className={cx('h-0.5 w-4 rounded-full transition-colors', isActive ? 'bg-sakura' : 'bg-transparent')} />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Fires the petal shower once per successful connection. */
function useCelebrateOnConnect() {
  const status = useConnection((s) => s.status);
  const prev = useRef(status);
  const fire = useUi((s) => s.fireCelebrate);
  useEffect(() => {
    if (prev.current !== 'connected' && status === 'connected') fire();
    prev.current = status;
  }, [status, fire]);
}

export function AppShell() {
  const celebrate = useUi((s) => s.celebrate);
  const { pathname } = useLocation();
  useCelebrateOnConnect();
  // Block body on purpose: newer Chrome returns a Promise from scrollTo, and React would call
  // whatever an effect returns as its cleanup ("l is not a function").
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <div className="min-w-0 flex-1">
        <TopBar />
        <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 sm:px-6 lg:max-w-5xl lg:px-10 lg:pt-10 lg:pb-16">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ConnectSheet />
      <SakuraShower trigger={celebrate} />
      <Isolated name="update-prompt">
        <UpdatePrompt />
      </Isolated>
      <Analytics />
    </div>
  );
}

import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import {
  IconSales,
  IconMarketing,
  IconSupport,
  IconRealtors,
  IconMedia,
  IconLogOut,
} from './icons';
import { DateRangePicker } from './DateRangePicker';
import type { ComponentType, SVGProps } from 'react';

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV: NavItem[] = [
  { to: '/sales', label: 'Sales (Land)', shortLabel: 'Sales', Icon: IconSales },
  { to: '/marketing', label: 'Marketing', shortLabel: 'Marketing', Icon: IconMarketing },
  { to: '/customer-support', label: 'Customer Support', shortLabel: 'Support', Icon: IconSupport },
  { to: '/realtor-management', label: 'Realtor Management', shortLabel: 'Realtors', Icon: IconRealtors },
  { to: '/media-content', label: 'Media & Content', shortLabel: 'Media', Icon: IconMedia },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-brand-50 text-brand-900">
      <header className="sticky top-0 z-30 border-b border-brand-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg bg-brand-900 text-white font-heading text-sm font-semibold"
              aria-hidden
            >
              PG
            </div>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="font-heading text-sm font-semibold text-brand-900">
                Pertinence Dashboard
              </span>
              <span className="text-xs text-brand-500">Half-year reporting</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <DateRangePicker />

            <button
              type="button"
              onClick={() => void signOut()}
              className="group inline-flex h-10 items-center gap-2 rounded-lg border border-brand-200 bg-white px-2.5 text-sm font-medium text-brand-700 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50 cursor-pointer md:px-3"
              title={profile?.email ?? 'Sign out'}
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-full bg-brand-900 text-xs font-semibold text-white"
                aria-hidden
              >
                {initials || '?'}
              </span>
              <span className="hidden md:inline">Sign out</span>
              <IconLogOut className="h-4 w-4 md:hidden" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-24 pt-5 md:px-6 md:pb-10 md:pt-8">
        <aside className="sticky top-[73px] hidden h-[calc(100vh-89px)] w-56 shrink-0 self-start md:block">
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer',
                    isActive
                      ? 'bg-brand-900 text-white shadow-card'
                      : 'text-brand-700 hover:bg-white hover:text-brand-900',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-5">
          {NAV.map(({ to, shortLabel, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 cursor-pointer',
                  isActive ? 'text-brand-900' : 'text-brand-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('h-5 w-5', isActive ? 'stroke-[2]' : 'stroke-[1.75]')} />
                  <span>{shortLabel}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

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
import { RepullButton } from './RepullButton';
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
  // Prefer full_name → email local-part → 'U' (for "User"). Avoids the bare
  // '?' the avatar used to show when profile had no full_name and the email
  // tokenizer produced no letters.
  const emailLocal = profile?.email ? profile.email.split('@')[0] : '';
  const initialsSource = profile?.full_name?.trim() || emailLocal;
  const initials =
    initialsSource
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'U';
  const displayName = profile?.full_name?.trim() || emailLocal || 'Signed in';

  return (
    <div className="min-h-screen bg-brand-50 text-brand-900">
      <header className="sticky top-0 z-30 border-b border-brand-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <div className="flex items-center gap-2.5 md:gap-3">
            <img
              src="/logo.jpeg"
              alt="Pertinence Group"
              className="h-10 w-10 shrink-0 object-contain"
              width={40}
              height={40}
            />
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="font-heading text-sm font-semibold text-brand-900">
                Pertinence Dashboard
              </span>
              <span className="text-xs text-brand-500">Half-year reporting</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <DateRangePicker />

            <RepullButton />

            {/* Mobile-only sign-out — no sidebar to host the desktop sign-out card. */}
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title={profile?.email ?? 'Sign out'}
              className="group inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-white text-brand-700 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 md:hidden"
            >
              <IconLogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-24 pt-5 md:px-6 md:pb-10 md:pt-8">
        {/* Sticky top matches the sidebar's natural y position
            (61px header + 32px pt-8 = 93px). With those equal, the sidebar
            is pinned from scroll-0 and never travels with the page. */}
        <aside className="sticky top-[93px] hidden h-[calc(100vh-117px)] w-56 shrink-0 self-start md:flex md:flex-col">
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer',
                    isActive
                      ? 'bg-accent text-white shadow-card'
                      : 'text-brand-700 hover:bg-white hover:text-brand-900',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => void signOut()}
              title={profile?.email ?? 'Sign out'}
              className="group flex w-full items-center gap-3 rounded-lg border border-brand-200 bg-white px-2.5 py-2 text-left transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white"
                aria-hidden
              >
                {initials || '?'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-brand-900">
                  {displayName}
                </span>
                <span className="block text-[11px] text-brand-500">Sign out</span>
              </span>
              <IconLogOut className="h-4 w-4 shrink-0 text-brand-500 group-hover:text-brand-700" />
            </button>
          </div>
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
                  isActive ? 'text-accent' : 'text-brand-500',
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

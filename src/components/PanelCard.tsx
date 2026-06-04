import type { ReactNode } from 'react';

// Locked Sales-panel card frame per PROGRESS.md 2026-05-18 design-lock.
// No shadow — B2B sales-intelligence reads flatter; shadows fight density.
export function PanelCard({
  title,
  subtitle,
  right,
  source,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  source?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 md:mb-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-heading text-base font-semibold text-slate-900 md:text-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 md:text-sm">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
      {source && (
        <p className="mt-3 text-[10px] text-slate-400 md:mt-4">{source}</p>
      )}
    </section>
  );
}

import type { ReactNode } from 'react';

// Inline accordion container used as the body of every drill-down on the
// Sales panel. Sits below the clickable trigger; closes when the trigger is
// tapped again (parent owns the open/closed state).
export function DrillPanel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 md:p-4"
    >
      {title && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

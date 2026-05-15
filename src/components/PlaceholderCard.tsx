import type { ReactNode } from 'react';

export function PlaceholderCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-4 shadow-card md:p-5">
      <h2 className="font-heading text-base font-semibold text-brand-900 md:text-lg">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-brand-500">{description}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

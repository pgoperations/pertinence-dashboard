// Card variant for the Realtor Management v1 panel: shows the SHAPE of the
// card that will appear when the realtor_manager_weekly ingest is deployed,
// without painting fake data. Visually less muted than GreyedCard (which is
// for permanently-out-of-scope items) so the supervisor can tell at a glance
// what's "ingest pending" vs "won't ever ship in v1".

export function PendingPanelCard({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  /** Bullet labels showing the metrics the card will render. */
  metrics: string[];
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-slate-900 md:text-lg">
            {title}
          </h3>
          <p className="mt-1 text-xs text-slate-600 md:text-sm">{description}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200">
          Ingest pending
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs text-slate-700">
        {metrics.map((m) => (
          <li key={m} className="flex items-baseline gap-2">
            <span aria-hidden className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

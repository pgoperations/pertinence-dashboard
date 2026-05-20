// Greyed-out blocker card for Sales-panel views whose data source is not yet
// ingestible. Per design-lock 2026-05-18: opacity-50 + cursor-not-allowed, name
// the *specific* blocker (not a generic "coming soon").
export function GreyedCard({
  title,
  blocker,
}: {
  title: string;
  blocker: string;
}) {
  return (
    <section
      aria-disabled="true"
      className="rounded-2xl border border-slate-200 bg-white p-4 opacity-50 cursor-not-allowed md:p-6"
    >
      <h3 className="font-heading text-base font-semibold text-slate-900 md:text-lg">
        {title}
      </h3>
      <p className="mt-1 text-xs text-slate-500 md:text-sm">{blocker}</p>
      <div className="mt-3 grid h-20 place-items-center rounded-lg bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
        Data source pending
      </div>
    </section>
  );
}

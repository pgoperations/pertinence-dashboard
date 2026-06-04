import { IconSparkles, IconAlert } from './icons';
import { formatAsOf } from '../lib/format';
import type { NarrativeTone, SectionNarrative } from '../lib/narrative/types';

// Rule-based "executive summary" card. Sits directly under each section's hero
// numbers and turns the loaded panel data into a few plain-language sentences,
// plus a "data notes" block that surfaces (never reconciles) quality caveats.
// Auto-generated and timestamped so it's never mistaken for a human analyst note.

const DOT: Record<NarrativeTone, string> = {
  neutral: 'bg-slate-300',
  positive: 'bg-accent',
  caution: 'bg-amber-400',
};

export function NarrativeCard({
  narrative,
  loading = false,
}: {
  narrative: SectionNarrative | null;
  loading?: boolean;
}) {
  if (loading && !narrative) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-slate-100" />
          <span className="h-3 w-20 rounded bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="block h-3.5 w-full rounded bg-slate-100" />
          <span className="block h-3.5 w-4/5 rounded bg-slate-100" />
          <span className="block h-3 w-2/3 rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (!narrative) return null;

  const { headline, points, caveats, asOf, empty } = narrative;

  if (empty) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <div className="flex items-center gap-2 text-slate-400">
          <IconSparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Summary</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">{headline}</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Accent rule down the left edge marks this as the editorial summary. */}
      <div className="border-l-[3px] border-accent p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-accent-emphasis">
            <IconSparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Summary</span>
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-emphasis">
              Auto
            </span>
          </div>
          {asOf && (
            <span className="shrink-0 text-[10px] text-slate-400">As of {formatAsOf(asOf)}</span>
          )}
        </div>

        <p className="mt-3 text-[15px] font-medium leading-relaxed text-slate-900 md:text-base">
          {headline}
        </p>

        {points.length > 0 && (
          <ul className="mt-3 space-y-2">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[p.tone ?? 'neutral']}`}
                  aria-hidden
                />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        )}

        {caveats.length > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-inset ring-amber-100">
            <div className="flex items-center gap-1.5 text-amber-800">
              <IconAlert className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Data notes</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {caveats.map((c, i) => (
                <li key={i} className="text-xs leading-relaxed text-amber-900/90">
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-[10px] text-slate-400">
          Auto-generated from live data · rule-based summary
        </p>
      </div>
    </section>
  );
}

import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { formatNairaCompact, formatNumber, formatPersonName } from '../../lib/format';
import type { TopRealtorEntry } from '../../lib/queries/sales';

const DEFAULT_TOP = 5;

export function TopRealtors({
  realtors,
  loading,
}: {
  realtors: TopRealtorEntry[];
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? realtors.slice(0, 10) : realtors.slice(0, DEFAULT_TOP);
  const max = Math.max(1, ...visible.map((r) => r.revenue));

  return (
    <PanelCard
      title="Top realtors"
      subtitle="By revenue (Bank Deposit, LAND tab, SALES PERSON column)."
      source="Aggregated from the SALES PERSON cell on each deposit row. Unattributed deposits (~56% of rows per project brief) bucket into a single 'Unattributed' row when in the top set."
    >
      {!loading && realtors.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-lg bg-slate-50 text-xs text-slate-500">
          No realtor activity in this range.
        </div>
      ) : (
        <ol className="space-y-2">
          {loading
            ? Array.from({ length: DEFAULT_TOP }).map((_, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-slate-100" />
                  <span className="block h-3 flex-1 rounded bg-slate-100" />
                </li>
              ))
            : visible.map((r, i) => (
                <li key={r.salesPerson} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="inline-flex items-baseline gap-2 min-w-0">
                      <span className="w-5 shrink-0 text-right text-[11px] font-semibold text-slate-400 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium text-slate-900">
                        {formatPersonName(r.salesPerson)}
                      </span>
                      <span className="shrink-0 text-[11px] font-normal text-slate-500 tabular-nums">
                        · {formatNumber(r.dealCount)} {r.dealCount === 1 ? 'deal' : 'deals'}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                      {formatNairaCompact(r.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${(r.revenue / max) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
        </ol>
      )}

      {!loading && realtors.length > DEFAULT_TOP && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-3 inline-flex items-center text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
        >
          {showAll
            ? 'Show top 5'
            : `Show top 10 of ${realtors.length}`}
        </button>
      )}
    </PanelCard>
  );
}


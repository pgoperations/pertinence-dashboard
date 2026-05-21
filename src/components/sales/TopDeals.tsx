import { PanelCard } from '../PanelCard';
import { formatNairaCompact } from '../../lib/format';
import type { TopDealEntry } from '../../lib/queries/sales';
import { format, parseISO } from 'date-fns';

export function TopDeals({
  deals,
  loading,
}: {
  deals: TopDealEntry[];
  loading: boolean;
}) {
  return (
    <PanelCard
      title="Top 5 deals"
      subtitle="Largest single Bank Deposit transactions in this range."
      source="One row per Bank Deposit entry. Multi-instalment deals appear once per receipt — supervisor #3: no silent reconciliation."
    >
      {!loading && deals.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-lg bg-slate-50 text-xs text-slate-500">
          No deals in this range.
        </div>
      ) : (
        <ol className="space-y-2.5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-5 w-5 shrink-0 rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-1">
                    <span className="block h-3 w-2/3 rounded bg-slate-100" />
                    <span className="block h-2 w-1/2 rounded bg-slate-100" />
                  </div>
                  <span className="block h-3 w-14 rounded bg-slate-100" />
                </li>
              ))
            : deals.map((d, i) => (
                <li key={`${d.txnDate}-${i}`} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {d.clientName?.trim() || <span className="italic text-slate-400">No client name</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="tabular-nums">{formatDate(d.txnDate)}</span>
                      {d.locationName && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{d.locationName}</span>
                        </>
                      )}
                      {d.purposeName && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{d.purposeName}</span>
                        </>
                      )}
                      {d.salesPerson && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{d.salesPerson}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                    {formatNairaCompact(d.amount)}
                  </span>
                </li>
              ))}
        </ol>
      )}
    </PanelCard>
  );
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return iso;
  }
}

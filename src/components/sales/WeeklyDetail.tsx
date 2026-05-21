import { useState, useEffect } from 'react';
import { PanelCard } from '../PanelCard';
import { IconChevronDown } from '../icons';
import { formatNaira, formatNairaCompact, formatNumber } from '../../lib/format';
import type { WeekBucket } from '../../lib/queries/sales';
import { format, parseISO } from 'date-fns';

export function WeeklyDetail({
  weeks,
  loading,
}: {
  weeks: WeekBucket[];
  loading: boolean;
}) {
  // Default to the most recent week (weeks are pre-sorted desc by weekStart).
  const [selectedWeek, setSelectedWeek] = useState<string | null>(
    weeks[0]?.weekStart ?? null,
  );
  const [expanded, setExpanded] = useState(false);

  // Reset selection if the date range changes and the previously selected week
  // is no longer in the list.
  useEffect(() => {
    if (weeks.length === 0) {
      setSelectedWeek(null);
      return;
    }
    if (!weeks.some((w) => w.weekStart === selectedWeek)) {
      setSelectedWeek(weeks[0].weekStart);
    }
  }, [weeks, selectedWeek]);

  const current = weeks.find((w) => w.weekStart === selectedWeek) ?? null;

  return (
    <PanelCard
      title="Weekly transactions"
      subtitle="Pick a week to inspect individual Bank Deposit rows."
      source="Mon–Sun weeks. Rows scoped by the global date range; pick a week within that range to inspect."
    >
      {!loading && weeks.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-lg bg-slate-50 text-xs text-slate-500">
          No transactions in this range.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block min-w-0 flex-1 md:max-w-md">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Week
              </span>
              <select
                value={selectedWeek ?? ''}
                onChange={(e) => setSelectedWeek(e.target.value)}
                disabled={loading || weeks.length === 0}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer disabled:opacity-50"
              >
                {weeks.map((w) => (
                  <option key={w.weekStart} value={w.weekStart}>
                    {formatWeekRange(w.weekStart, w.weekEnd)} ·{' '}
                    {formatNairaCompact(w.revenue)} · {formatNumber(w.dealCount)}{' '}
                    {w.dealCount === 1 ? 'deal' : 'deals'}
                  </option>
                ))}
              </select>
            </label>
            {current && (
              <div className="text-right text-xs text-slate-500">
                <div>
                  Revenue{' '}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatNairaCompact(current.revenue)}
                  </span>
                </div>
                <div className="mt-0.5">
                  {formatNumber(current.dealCount)} deal{current.dealCount === 1 ? '' : 's'}
                </div>
              </div>
            )}
          </div>

          {current && current.entries.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((s) => !s)}
                aria-expanded={expanded}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
              >
                <IconChevronDown
                  className={[
                    'h-3.5 w-3.5 transition-transform',
                    expanded ? 'rotate-180' : '',
                  ].join(' ')}
                />
                {expanded ? 'Hide transactions' : `Show ${current.entries.length} transaction${current.entries.length === 1 ? '' : 's'}`}
              </button>

              {expanded && (
                <div className="mt-3 -mx-4 overflow-x-auto md:mx-0">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Client</Th>
                        <Th>Location</Th>
                        <Th>Purpose</Th>
                        <Th>Salesperson</Th>
                        <Th align="right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.entries.map((e, i) => (
                        <tr key={`${e.txnDate}-${i}`} className="hover:bg-slate-50">
                          <Td>{formatDate(e.txnDate)}</Td>
                          <Td>
                            {e.clientName?.trim() || (
                              <span className="italic text-slate-400">—</span>
                            )}
                          </Td>
                          <Td>{e.locationName ?? <span className="italic text-slate-400">—</span>}</Td>
                          <Td>{e.purposeName ?? <span className="italic text-slate-400">—</span>}</Td>
                          <Td>{e.salesPerson ?? <span className="italic text-slate-400">—</span>}</Td>
                          <Td align="right" emphasis>
                            {formatNaira(e.amount)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PanelCard>
  );
}

function formatWeekRange(startIso: string, endIso: string): string {
  try {
    const s = parseISO(startIso);
    const e = parseISO(endIso);
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) {
      return `${format(s, 'd')}–${format(e, 'd MMM yyyy')}`;
    }
    return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return iso;
  }
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={[
        'border-b border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500',
        align === 'right' ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  emphasis,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  emphasis?: boolean;
}) {
  return (
    <td
      className={[
        'border-b border-slate-100 px-3 py-2 text-slate-700',
        align === 'right' ? 'text-right tabular-nums' : 'text-left',
        emphasis ? 'font-semibold text-slate-900' : '',
      ].join(' ')}
    >
      {children}
    </td>
  );
}

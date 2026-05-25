import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronRight } from '../icons';
import { formatMonthShort, formatNumber } from '../../lib/format';
import type { MetricRow } from '../../lib/queries/realtor';

// Shared table for Recruitment Metrics + Activity Measurement cards.
// Rows = metrics. Cols = months in the range + Total. Sticky first column
// on mobile per the Sales-panel PlotSizePivot convention.
//
// Rows with a `subRows` array (e.g. the synthesized "Weekly Realtor Meeting"
// that merges Master Class 1 + 2) render a chevron that toggles an inline
// expansion showing each sub-row indented, with the same columns.

export function MetricMonthlyTable({
  title,
  subtitle,
  rows,
  source,
  right,
}: {
  title: string;
  subtitle?: string;
  rows: MetricRow[];
  source?: string;
  right?: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Union of months across all rows (including sub-rows) — sorted asc.
  const monthSet = new Set<string>();
  const collect = (r: MetricRow) => {
    for (const m of r.monthly) monthSet.add(m.month);
    if (r.subRows) for (const sr of r.subRows) collect(sr);
  };
  for (const r of rows) collect(r);
  const months = [...monthSet].sort();

  if (rows.length === 0 || months.length === 0) {
    return (
      <PanelCard title={title} subtitle={subtitle} right={right} source={source}>
        <p className="text-sm text-slate-500">No data in this range yet.</p>
      </PanelCard>
    );
  }

  return (
    <PanelCard title={title} subtitle={subtitle} right={right} source={source}>
      <div className="-mx-4 overflow-x-auto md:mx-0">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 shadow-[1px_0_0_0_rgba(226,232,240,1)] md:px-2">
                Metric
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  {formatMonthShort(m)}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expandable = (row.subRows?.length ?? 0) > 0;
              const isOpen = expandable && openKey === row.key;
              return (
                <MetricRowFragment
                  key={row.key}
                  row={row}
                  months={months}
                  expandable={expandable}
                  isOpen={isOpen}
                  onToggle={() => setOpenKey(isOpen ? null : row.key)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelCard>
  );
}

function MetricRowFragment({
  row,
  months,
  expandable,
  isOpen,
  onToggle,
}: {
  row: MetricRow;
  months: string[];
  expandable: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const valueByMonth = new Map(row.monthly.map((m) => [m.month, m.value]));

  return (
    <>
      <tr
        className={[
          'border-b border-slate-100 last:border-0',
          expandable ? 'cursor-pointer hover:bg-slate-50' : '',
          isOpen ? 'bg-accent/5' : '',
        ].join(' ')}
        onClick={expandable ? onToggle : undefined}
      >
        <td className="sticky left-0 z-10 bg-inherit px-4 py-2 text-slate-700 shadow-[1px_0_0_0_rgba(226,232,240,1)] md:px-2">
          <div className="flex items-center gap-2">
            {expandable && (
              <button
                type="button"
                aria-label={isOpen ? 'Collapse sub-rows' : 'Expand sub-rows'}
                aria-expanded={isOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="-ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <IconChevronRight
                  className={[
                    'h-3.5 w-3.5 transition-transform',
                    isOpen ? 'rotate-90' : '',
                  ].join(' ')}
                />
              </button>
            )}
            <span>{row.displayName}</span>
            {row.hasMismatch && (
              <StatusChip tone="amber">Total mismatch</StatusChip>
            )}
          </div>
        </td>
        {months.map((m) => {
          const v = valueByMonth.get(m);
          return (
            <td
              key={m}
              className="px-3 py-2 text-right tabular-nums text-slate-700"
            >
              {v == null || v === 0 ? (
                <span className="text-slate-300">—</span>
              ) : (
                formatNumber(v)
              )}
            </td>
          );
        })}
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
          {formatNumber(row.total)}
        </td>
      </tr>
      {isOpen && row.subRows && (
        <>
          {row.subRows.map((sr) => {
            const subValueByMonth = new Map(sr.monthly.map((m) => [m.month, m.value]));
            return (
              <tr
                key={sr.key}
                className="border-b border-slate-100 bg-accent/5 text-[13px]"
              >
                <td className="sticky left-0 z-10 bg-accent/5 px-4 py-1.5 text-slate-600 shadow-[1px_0_0_0_rgba(226,232,240,1)] md:px-2">
                  <span className="ml-6 inline-flex items-baseline gap-1">
                    <span className="text-slate-400" aria-hidden>└</span>
                    <span>{sr.displayName}</span>
                  </span>
                </td>
                {months.map((m) => {
                  const v = subValueByMonth.get(m);
                  return (
                    <td
                      key={m}
                      className="px-3 py-1.5 text-right tabular-nums text-slate-600"
                    >
                      {v == null || v === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        formatNumber(v)
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                  {formatNumber(sr.total)}
                </td>
              </tr>
            );
          })}
        </>
      )}
    </>
  );
}

import { format, parseISO } from 'date-fns';

export type TxnDetailRow = {
  key: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Primary line — customer name (or em dash when blank). */
  title: string;
  /** Right-aligned headline value, already formatted (₦ or plot count). */
  value: string;
  /** Secondary descriptors (salesperson, location, plot type/purpose). */
  meta: string[];
};

// Transaction-level list shown inside a KPI drill-down. Stacked rather than a
// table so it stays legible inside the narrow drill panel on a phone; the list
// scrolls within a fixed height so a long range doesn't blow out the card.
export function TxnDetailList({ rows }: { rows: TxnDetailRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No transactions in this range.</p>;
  }
  return (
    <ul className="mt-2 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {rows.map((r) => (
        <li key={r.key} className="px-3 py-2">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-800">{r.title}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.value}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">
            {[formatTxnDate(r.date), ...r.meta].filter(Boolean).join(' · ')}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatTxnDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

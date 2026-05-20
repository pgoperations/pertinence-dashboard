import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNairaCompact } from '../../lib/format';
import type { RevenueByLocationRow } from '../../lib/queries/sales';

const TOP_N = 8;

const COLOR_PAYABLE = '#94A3B8';
const COLOR_RECEIVED = '#0369A1';

export function RevenueByLocation({
  rows,
  loading,
}: {
  rows: RevenueByLocationRow[];
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  if (!loading && rows.length === 0) {
    return (
      <PanelCard
        title="Revenue by location"
        subtitle="Payable (Weekly Sales) vs Received (Bank Deposit)."
        right={<StatusChip tone="sky">Side-by-side</StatusChip>}
        source="Sources surfaced together — never reconciled. Delta = Received − Payable. Negative delta means cash still owed."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No revenue activity in this range.
        </div>
      </PanelCard>
    );
  }

  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const hidden = rows.slice(TOP_N);
  const hiddenPayableSum = hidden.reduce((acc, r) => acc + r.payable, 0);
  const hiddenReceivedSum = hidden.reduce((acc, r) => acc + r.received, 0);
  const max = Math.max(
    1,
    ...visible.map((r) => Math.max(r.payable, r.received)),
  );

  return (
    <PanelCard
      title="Revenue by location"
      subtitle="Payable (Weekly Sales) vs Received (Bank Deposit). Top 8 shown by default."
      right={<StatusChip tone="sky">Side-by-side</StatusChip>}
      source="Sources surfaced together — never reconciled. Delta = Received − Payable. Negative delta means cash still owed."
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="space-y-1.5">
                <span className="block h-3 w-24 rounded bg-slate-100" />
                <span className="block h-2 rounded bg-slate-100" />
                <span className="block h-2 w-5/6 rounded bg-slate-100" />
              </li>
            ))
          : visible.map((r) => (
              <LocationRow key={r.locationName} row={r} max={max} />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more location{hidden.length === 1 ? '' : 's'} —{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hiddenPayableSum)}
              </span>{' '}
              payable /{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hiddenReceivedSum)}
              </span>{' '}
              received combined.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
          >
            {showAll ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function LocationRow({ row, max }: { row: RevenueByLocationRow; max: number }) {
  const payablePct = (row.payable / max) * 100;
  const receivedPct = (row.received / max) * 100;
  const owed = Math.max(0, row.payable - row.received);

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{row.locationName}</span>
        {owed > 0 ? (
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Owed <span className="tabular-nums text-slate-700">{formatNairaCompact(owed)}</span>
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wide text-emerald-700">
            Paid in full
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        <Bar
          label="Payable"
          color={COLOR_PAYABLE}
          pct={payablePct}
          amount={formatNairaCompact(row.payable)}
        />
        <Bar
          label="Received"
          color={COLOR_RECEIVED}
          pct={receivedPct}
          amount={formatNairaCompact(row.received)}
        />
      </div>
    </li>
  );
}

function Bar({
  label,
  color,
  pct,
  amount,
}: {
  label: string;
  color: string;
  pct: number;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-slate-700">
        {amount}
      </span>
    </div>
  );
}

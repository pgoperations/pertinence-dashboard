import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronRight } from '../icons';
import { DrillPanel } from './DrillPanel';
import { formatNairaCompact, formatNumber, formatMonthYear } from '../../lib/format';
import type { RevenueByLocationRow } from '../../lib/queries/sales';

const TOP_N = 8;

const COLOR_PAYABLE = '#94A3B8';      // slate-400 — payable (commitment)
const COLOR_RECEIVED = '#56B845';     // brand green (Pertinence) — received (cash in)

export function RevenueByLocation({
  rows,
  otherReceived,
  otherDealCount,
  loading,
}: {
  rows: RevenueByLocationRow[];
  otherReceived: number;
  otherDealCount: number;
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (loc: string) => setExpanded((cur) => (cur === loc ? null : loc));

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
      subtitle="Payable (Weekly Sales) vs Received (Bank Deposit). Tap a row for its monthly trend."
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
              <LocationRow
                key={r.locationName}
                row={r}
                max={max}
                isOpen={expanded === r.locationName}
                onToggle={() => toggle(r.locationName)}
              />
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

      {!loading && otherReceived > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Plus{' '}
          <span className="font-semibold tabular-nums text-slate-700">
            {formatNairaCompact(otherReceived)}
          </span>{' '}
          across{' '}
          <span className="font-semibold tabular-nums text-slate-700">
            {formatNumber(otherDealCount)}
          </span>{' '}
          transaction{otherDealCount === 1 ? '' : 's'} without a location tag —
          typically fees &amp; general deposits (Allocation, Security, Change of
          Ownership, etc.) that don&rsquo;t belong to a specific land project.
        </p>
      )}
    </PanelCard>
  );
}

function LocationRow({
  row,
  max,
  isOpen,
  onToggle,
}: {
  row: RevenueByLocationRow;
  max: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const payablePct = (row.payable / max) * 100;
  const receivedPct = (row.received / max) * 100;
  const owed = Math.max(0, row.payable - row.received);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`rev-drill-${slug(row.locationName)}`}
        className="block w-full rounded-lg px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-baseline gap-1.5 text-sm font-medium text-slate-900">
            <IconChevronRight
              className={[
                'h-3.5 w-3.5 shrink-0 self-center text-slate-400 transition-transform',
                isOpen ? 'rotate-90 text-accent' : '',
              ].join(' ')}
            />
            <span>{row.locationName}</span>
            {row.dealCount > 0 && (
              <span className="text-[11px] font-normal text-slate-500 tabular-nums">
                · {formatNumber(row.dealCount)} {row.dealCount === 1 ? 'deal' : 'deals'}
              </span>
            )}
          </span>
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
      </button>

      {isOpen && (
        <div id={`rev-drill-${slug(row.locationName)}`}>
          <DrillPanel title={`${row.locationName} — month-by-month`}>
            <MonthlyTrend row={row} />
          </DrillPanel>
        </div>
      )}
    </li>
  );
}

function MonthlyTrend({ row }: { row: RevenueByLocationRow }) {
  if (row.monthly.length === 0) {
    return <p className="text-xs text-slate-500">No monthly entries.</p>;
  }
  const monthMax = Math.max(
    1,
    ...row.monthly.map((m) => Math.max(m.payable, m.received)),
  );
  return (
    <ul className="space-y-2.5">
      {row.monthly.map((m) => {
        const monthOwed = Math.max(0, m.payable - m.received);
        return (
          <li key={m.month} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-700">{formatMonthYear(m.month)}</span>
              {monthOwed > 0 ? (
                <span className="text-[11px] text-slate-500 tabular-nums">
                  Owed {formatNairaCompact(monthOwed)}
                </span>
              ) : m.received > 0 ? (
                <span className="text-[11px] text-emerald-700">Paid in full</span>
              ) : null}
            </div>
            <Bar
              label="Payable"
              color={COLOR_PAYABLE}
              pct={(m.payable / monthMax) * 100}
              amount={formatNairaCompact(m.payable)}
              compact
            />
            <Bar
              label="Received"
              color={COLOR_RECEIVED}
              pct={(m.received / monthMax) * 100}
              amount={formatNairaCompact(m.received)}
              compact
            />
          </li>
        );
      })}
    </ul>
  );
}

function Bar({
  label,
  color,
  pct,
  amount,
  compact,
}: {
  label: string;
  color: string;
  pct: number;
  amount: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={[
        'shrink-0 font-medium uppercase tracking-wide text-slate-500',
        compact ? 'w-14 text-[9px]' : 'w-16 text-[10px]',
      ].join(' ')}>
        {label}
      </span>
      <div className={[
        'relative flex-1 overflow-hidden rounded-full bg-slate-100',
        compact ? 'h-2' : 'h-3',
      ].join(' ')}>
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className={[
        'shrink-0 text-right tabular-nums text-slate-700',
        compact ? 'w-14 text-[10px]' : 'w-16 text-[11px]',
      ].join(' ')}>
        {amount}
      </span>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

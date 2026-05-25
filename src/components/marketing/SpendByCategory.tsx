import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronRight } from '../icons';
import { DrillPanel } from '../sales/DrillPanel';
import { formatNairaCompact, formatNumber, formatMonthYear } from '../../lib/format';
import type { CategoryRow } from '../../lib/queries/marketing';

const TOP_N = 8;
const COLOR_BAR = '#0369A1'; // sky-700, single-series

export function SpendByCategory({
  rows,
  fallbackCount,
  totalRowCount,
  loading,
}: {
  rows: CategoryRow[];
  fallbackCount: number;
  totalRowCount: number;
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (cat: string) => setExpanded((cur) => (cur === cat ? null : cat));

  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const hidden = rows.slice(TOP_N);
  const hiddenSum = hidden.reduce((acc, r) => acc + r.amount, 0);
  const max = Math.max(1, ...visible.map((r) => r.amount));
  const total = rows.reduce((acc, r) => acc + r.amount, 0);

  // Honest chip: every 2026 row today is keyword-fallback-categorized because
  // the supervisor added the CATEGORY dropdown but hasn't backfilled it yet.
  // Surfacing it on this card (the one most directly affected) honors
  // supervisors #2 (reduce manual entry — but also flag the gap) and #3
  // (surface, don't reconcile).
  const fallbackChip =
    totalRowCount > 0 && fallbackCount > 0 ? (
      <StatusChip tone="amber">
        {fallbackCount === totalRowCount
          ? `Keyword-fallback (all ${formatNumber(fallbackCount)})`
          : `Keyword-fallback ${formatNumber(fallbackCount)} / ${formatNumber(totalRowCount)}`}
      </StatusChip>
    ) : undefined;

  if (!loading && rows.length === 0) {
    return (
      <PanelCard
        title="Spend by category"
        subtitle="Ranked by total spend in the selected range."
        right={fallbackChip}
        source="Source: Marketing Fund Expense Sheet. Category from dropdown when present, keyword-fallback otherwise."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No spend in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Spend by category"
      subtitle="Tap a row for its monthly trend and sample line items."
      right={fallbackChip}
      source="Source: Marketing Fund Expense Sheet. Category from CATEGORY dropdown when present, keyword-fallback otherwise — supervisor has not backfilled the dropdown for 2026 rows yet."
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="space-y-1.5">
                <span className="block h-3 w-24 rounded bg-slate-100" />
                <span className="block h-2 rounded bg-slate-100" />
              </li>
            ))
          : visible.map((r) => (
              <CategoryRowItem
                key={r.categoryName}
                row={r}
                max={max}
                total={total}
                isOpen={expanded === r.categoryName}
                onToggle={() => toggle(r.categoryName)}
              />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more categor{hidden.length === 1 ? 'y' : 'ies'} —{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hiddenSum)}
              </span>{' '}
              combined.
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

function CategoryRowItem({
  row,
  max,
  total,
  isOpen,
  onToggle,
}: {
  row: CategoryRow;
  max: number;
  total: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const pct = (row.amount / max) * 100;
  const sharePct = total > 0 ? (row.amount / total) * 100 : 0;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`cat-drill-${slug(row.categoryName)}`}
        className="block w-full rounded-lg px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-slate-900">
            <IconChevronRight
              className={[
                'h-3.5 w-3.5 shrink-0 self-center text-slate-400 transition-transform',
                isOpen ? 'rotate-90 text-accent' : '',
              ].join(' ')}
            />
            <span className="truncate">{row.categoryName}</span>
            {row.rowCount > 0 && (
              <span className="shrink-0 text-[11px] font-normal text-slate-500 tabular-nums">
                · {formatNumber(row.rowCount)} {row.rowCount === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
            <span className="tabular-nums text-slate-700">{sharePct.toFixed(1)}%</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${pct}%`, backgroundColor: COLOR_BAR }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-slate-700">
            {formatNairaCompact(row.amount)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div id={`cat-drill-${slug(row.categoryName)}`}>
          <DrillPanel title={`${row.categoryName} — monthly trend + sample entries`}>
            <CategoryDrill row={row} />
          </DrillPanel>
        </div>
      )}
    </li>
  );
}

function CategoryDrill({ row }: { row: CategoryRow }) {
  return (
    <div className="space-y-4">
      {row.monthly.length > 0 ? (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Monthly trend
          </div>
          <MonthlyMini monthly={row.monthly} />
        </div>
      ) : (
        <p className="text-xs text-slate-500">No monthly entries.</p>
      )}

      {row.samples.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Top {row.samples.length} {row.samples.length === 1 ? 'entry' : 'entries'} by amount
          </div>
          <ul className="space-y-1.5">
            {row.samples.map((s, i) => (
              <li
                key={`${s.description}-${i}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-slate-700">{s.description}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatNairaCompact(s.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.fallbackCount > 0 && (
        <p className="text-[11px] text-slate-500">
          {row.fallbackCount === row.rowCount
            ? `All ${formatNumber(row.rowCount)} entries categorized by keyword-fallback rule.`
            : `${formatNumber(row.fallbackCount)} of ${formatNumber(row.rowCount)} entries categorized by keyword-fallback rule.`}
        </p>
      )}
    </div>
  );
}

function MonthlyMini({
  monthly,
}: {
  monthly: { month: string; amount: number }[];
}) {
  const max = Math.max(1, ...monthly.map((m) => m.amount));
  return (
    <ul className="space-y-2">
      {monthly.map((m) => {
        const pct = (m.amount / max) * 100;
        return (
          <li key={m.month} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-700">{formatMonthYear(m.month)}</span>
              <span className="text-[11px] tabular-nums text-slate-700">
                {formatNairaCompact(m.amount)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: COLOR_BAR }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

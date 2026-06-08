import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { IconChevronRight } from '../icons';
import { DrillPanel } from '../sales/DrillPanel';
import { formatNumber, formatMonthYear } from '../../lib/format';
import type { CategoryRow } from '../../lib/queries/customerSupport';

const TOP_N = 8;
const COLOR_RESOLVED = '#059669';   // emerald-600 — resolved + responded
const COLOR_UNRESOLVED = '#D97706'; // amber-600 — pending + in progress
const COLOR_OTHER = '#CBD5E1';      // slate-300 — other / no status

export function ComplaintsByCategory({
  rows,
  loading,
}: {
  rows: CategoryRow[];
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (cat: string) => setExpanded((cur) => (cur === cat ? null : cat));

  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const hidden = rows.slice(TOP_N);
  const hiddenSum = hidden.reduce((acc, r) => acc + r.count, 0);
  const hiddenResolved = hidden.reduce((acc, r) => acc + r.resolvedCount, 0);
  const max = Math.max(1, ...visible.map((r) => r.count));

  if (!loading && rows.length === 0) {
    return (
      <PanelCard
        title="Complaints by category"
        subtitle="Each bar splits resolved / unresolved / other."
        source="Source: customer_support_logs filtered to rows with a complaint_category_id. Resolved = RESOLVED/RESPONDED; Unresolved = PENDING/IN PROGRESS."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No complaints in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Complaints by category"
      subtitle="Bar = resolved / unresolved / other. Tap a row for its monthly trend and sample raw text."
      source='Source: customer_support_logs filtered to rows with a complaint_category_id. Resolved = status RESOLVED or RESPONDED; Unresolved = PENDING or IN PROGRESS; everything else is Other. A multi-complaint ticket counts in each of its categories.'
      right={<CatLegend />}
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
              <span className="tabular-nums text-slate-700">{formatNumber(hiddenSum)}</span> complaints,{' '}
              <span className="tabular-nums text-slate-700">{formatNumber(hiddenResolved)}</span> resolved.
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
  isOpen,
  onToggle,
}: {
  row: CategoryRow;
  max: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const otherCount = Math.max(0, row.count - row.resolvedCount - row.unresolvedCount);
  const scale = (row.count / max) * 100; // bar length vs the busiest category
  const seg = (n: number) => (row.count > 0 ? (n / row.count) * scale : 0);

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
          </span>
          {/* Explicit resolved vs unresolved counts so the split reads at a glance. */}
          <span className="shrink-0 text-[11px] tabular-nums">
            <span className="font-semibold text-emerald-700">{formatNumber(row.resolvedCount)}</span>
            <span className="text-slate-400"> · </span>
            <span className="font-semibold text-amber-700">{formatNumber(row.unresolvedCount)}</span>
            <span className="text-slate-400"> / {formatNumber(row.count)}</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {/* Tri-segment bar: resolved (green) | unresolved (amber) | other (slate). */}
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="absolute inset-y-0 left-0 rounded-l-full"
              style={{ width: `${seg(row.resolvedCount)}%`, backgroundColor: COLOR_RESOLVED }}
            />
            <span
              className="absolute inset-y-0"
              style={{
                left: `${seg(row.resolvedCount)}%`,
                width: `${seg(row.unresolvedCount)}%`,
                backgroundColor: COLOR_UNRESOLVED,
              }}
            />
            <span
              className="absolute inset-y-0"
              style={{
                left: `${seg(row.resolvedCount) + seg(row.unresolvedCount)}%`,
                width: `${seg(otherCount)}%`,
                backgroundColor: COLOR_OTHER,
              }}
            />
          </div>
        </div>
      </button>

      {isOpen && (
        <div id={`cat-drill-${slug(row.categoryName)}`}>
          <DrillPanel title={`${row.categoryName} — monthly resolution + sample raw text`}>
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
            Monthly — <span className="text-emerald-700">resolved</span> ·{' '}
            <span className="text-amber-700">unresolved</span> · other
          </div>
          <MonthlyMini monthly={row.monthly} />
        </div>
      ) : (
        <p className="text-xs text-slate-500">No monthly entries.</p>
      )}

      {row.samples.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Most-common raw text — top {row.samples.length}
          </div>
          <ul className="space-y-1.5">
            {row.samples.map((s, i) => (
              <li
                key={`${s.raw}-${i}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-slate-700">{s.raw}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatNumber(s.count)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MonthlyMini({
  monthly,
}: {
  monthly: { month: string; count: number; resolvedCount: number; unresolvedCount: number }[];
}) {
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <ul className="space-y-2">
      {monthly.map((m) => {
        const otherCount = Math.max(0, m.count - m.resolvedCount - m.unresolvedCount);
        const scale = (m.count / max) * 100;
        const seg = (n: number) => (m.count > 0 ? (n / m.count) * scale : 0);
        return (
          <li key={m.month} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-700">{formatMonthYear(m.month)}</span>
              <span className="text-[11px] tabular-nums">
                <span className="font-semibold text-emerald-700">{formatNumber(m.resolvedCount)}</span>
                <span className="text-slate-400"> · </span>
                <span className="font-semibold text-amber-700">{formatNumber(m.unresolvedCount)}</span>
                <span className="text-slate-400"> / {formatNumber(m.count)}</span>
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{ width: `${seg(m.resolvedCount)}%`, backgroundColor: COLOR_RESOLVED }}
              />
              <span
                className="absolute inset-y-0"
                style={{
                  left: `${seg(m.resolvedCount)}%`,
                  width: `${seg(m.unresolvedCount)}%`,
                  backgroundColor: COLOR_UNRESOLVED,
                }}
              />
              <span
                className="absolute inset-y-0"
                style={{
                  left: `${seg(m.resolvedCount) + seg(m.unresolvedCount)}%`,
                  width: `${seg(otherCount)}%`,
                  backgroundColor: COLOR_OTHER,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CatLegend() {
  const items: Array<{ label: string; color: string }> = [
    { label: 'Resolved', color: COLOR_RESOLVED },
    { label: 'Unresolved', color: COLOR_UNRESOLVED },
    { label: 'Other', color: COLOR_OTHER },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2 w-2.5 rounded-sm"
            style={{ backgroundColor: i.color }}
          />
          <span>{i.label}</span>
        </span>
      ))}
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

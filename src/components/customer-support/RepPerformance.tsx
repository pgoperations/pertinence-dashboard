import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { IconChevronRight } from '../icons';
import { DrillPanel } from '../sales/DrillPanel';
import { formatNumber, formatMonthYear, formatPersonName } from '../../lib/format';
import type { RepRow, RepMonthlyEntry } from '../../lib/queries/customerSupport';

const COLOR_RESOLVED = '#059669';   // emerald-600 — resolved + responded
const COLOR_UNRESOLVED = '#D97706'; // amber-600 — pending + in progress
const COLOR_OTHER = '#CBD5E1';      // slate-300 — no / other status

const BRAND_LABEL: Record<string, string> = {
  ppl: 'PPL',
  realvest: 'RealVest',
};

// Per-rep performance — replaces the old "Logs by channel" card (supervisor
// 2026-06-04: channel had no analytical value; rep performance does). Each rep
// is one stacked bar: resolved (emerald) + unresolved (amber) + other (slate),
// with the rep's resolution rate and brand. Brand == rep grouping is the same
// signal the PPL/RealVest toggle uses, surfaced explicitly here.
export function RepPerformance({
  rows,
  showBrand,
  loading,
}: {
  rows: RepRow[];
  /** Show the per-rep brand chip (only meaningful when the "All" filter mixes brands). */
  showBrand: boolean;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  const max = Math.max(1, ...rows.map((r) => r.total));

  if (!loading && rows.length === 0) {
    return (
      <PanelCard
        title="Performance by representative"
        subtitle="Resolved vs unresolved logs per customer-support rep."
        source="Source: customer_support_logs grouped by rep tab. Brand is attributed by rep (PPL = Catherine/Mariam/Mary, RealVest = Yetunde/Lovinal)."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No logs in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Performance by representative"
      subtitle="Tap a rep for their monthly trend. Bar = resolved / unresolved / other. % = resolved ÷ (resolved + unresolved)."
      source="Source: customer_support_logs grouped by rep tab, counted as tickets (one per sheet row). Brand is attributed by rep (PPL = Catherine/Mariam/Mary, RealVest = Yetunde/Lovinal) — the CS sheet has no per-customer brand column."
      right={<RepLegend />}
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="space-y-1.5">
                <span className="block h-3 w-24 rounded bg-slate-100" />
                <span className="block h-3 rounded bg-slate-100" />
              </li>
            ))
          : rows.map((r) => (
              <RepRowItem
                key={r.repId}
                row={r}
                max={max}
                showBrand={showBrand}
                isOpen={expanded === r.repId}
                onToggle={() => toggle(r.repId)}
              />
            ))}
      </ul>
    </PanelCard>
  );
}

function RepRowItem({
  row,
  max,
  showBrand,
  isOpen,
  onToggle,
}: {
  row: RepRow;
  max: number;
  showBrand: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const scale = (row.total / max) * 100; // bar length relative to busiest rep
  const seg = (n: number) => (row.total > 0 ? (n / row.total) * scale : 0);
  const ratePct = Math.round(row.resolutionRate * 100);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`rep-drill-${slug(row.repId)}`}
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
            <span className="truncate">{formatPersonName(row.name)}</span>
            {showBrand && BRAND_LABEL[row.brandSlug] && (
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {BRAND_LABEL[row.brandSlug]}
              </span>
            )}
          </span>
          {/* Explicit resolved vs unresolved counts + efficiency, colour-coded. */}
          <span className="shrink-0 text-[11px] tabular-nums">
            <span className="font-semibold text-emerald-700">{formatNumber(row.resolved)}</span>
            <span className="text-slate-400"> · </span>
            <span className="font-semibold text-amber-700">{formatNumber(row.unresolved)}</span>
            <span className="text-slate-500"> · {ratePct}%</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="absolute inset-y-0 left-0 rounded-l-full"
              style={{ width: `${seg(row.resolved)}%`, backgroundColor: COLOR_RESOLVED }}
            />
            <span
              className="absolute inset-y-0"
              style={{
                left: `${seg(row.resolved)}%`,
                width: `${seg(row.unresolved)}%`,
                backgroundColor: COLOR_UNRESOLVED,
              }}
            />
            <span
              className="absolute inset-y-0"
              style={{
                left: `${seg(row.resolved) + seg(row.unresolved)}%`,
                width: `${seg(row.other)}%`,
                backgroundColor: COLOR_OTHER,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-700">
            {formatNumber(row.total)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div id={`rep-drill-${slug(row.repId)}`}>
          <DrillPanel title={`${formatPersonName(row.name)} — monthly`}>
            <RepMonthly monthly={row.monthly} />
          </DrillPanel>
        </div>
      )}
    </li>
  );
}

function RepMonthly({ monthly }: { monthly: RepMonthlyEntry[] }) {
  if (monthly.length === 0) {
    return <p className="text-xs text-slate-500">No monthly entries.</p>;
  }
  const max = Math.max(1, ...monthly.map((m) => m.total));
  return (
    <ul className="space-y-2">
      {monthly.map((m) => {
        const scale = (m.total / max) * 100;
        const seg = (n: number) => (m.total > 0 ? (n / m.total) * scale : 0);
        const denom = m.resolved + m.unresolved;
        const ratePct = denom > 0 ? Math.round((m.resolved / denom) * 100) : 0;
        return (
          <li key={m.month} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-700">{formatMonthYear(m.month)}</span>
              <span className="text-[11px] tabular-nums text-slate-500">
                {formatNumber(m.total)} · <span className="text-emerald-700">{ratePct}%</span>
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{ width: `${seg(m.resolved)}%`, backgroundColor: COLOR_RESOLVED }}
              />
              <span
                className="absolute inset-y-0"
                style={{
                  left: `${seg(m.resolved)}%`,
                  width: `${seg(m.unresolved)}%`,
                  backgroundColor: COLOR_UNRESOLVED,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RepLegend() {
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

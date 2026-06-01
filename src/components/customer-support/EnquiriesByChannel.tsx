import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { IconChevronRight } from '../icons';
import { DrillPanel } from '../sales/DrillPanel';
import { formatNumber, formatMonthYear } from '../../lib/format';
import type { ChannelRow } from '../../lib/queries/customerSupport';

const TOP_N = 6;
const COLOR_BAR = '#56B845'; // brand green (Pertinence)

export function EnquiriesByChannel({
  rows,
  loading,
}: {
  rows: ChannelRow[];
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (ch: string) => setExpanded((cur) => (cur === ch ? null : ch));

  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const hidden = rows.slice(TOP_N);
  const hiddenSum = hidden.reduce((acc, r) => acc + r.count, 0);
  const max = Math.max(1, ...visible.map((r) => r.count));
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  if (!loading && rows.length === 0) {
    return (
      <PanelCard
        title="Logs by channel"
        subtitle="How customers reached us in the selected range."
        source="Source: customer_support_logs.channel. Includes both enquiries and channel-tagged complaints."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No channel-tagged logs in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Logs by channel"
      subtitle="Tap a row for its monthly trend."
      source="Source: customer_support_logs.channel. Both enquiries and complaints are channel-tagged."
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="space-y-1.5">
                <span className="block h-3 w-24 rounded bg-slate-100" />
                <span className="block h-2 rounded bg-slate-100" />
              </li>
            ))
          : visible.map((r) => (
              <ChannelRowItem
                key={r.channel}
                row={r}
                max={max}
                total={total}
                isOpen={expanded === r.channel}
                onToggle={() => toggle(r.channel)}
              />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more channel{hidden.length === 1 ? '' : 's'} —{' '}
              <span className="tabular-nums text-slate-700">{formatNumber(hiddenSum)}</span> combined.
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

function ChannelRowItem({
  row,
  max,
  total,
  isOpen,
  onToggle,
}: {
  row: ChannelRow;
  max: number;
  total: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const pct = (row.count / max) * 100;
  const sharePct = total > 0 ? (row.count / total) * 100 : 0;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`ch-drill-${slug(row.channel)}`}
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
            <span className="truncate">{row.channel}</span>
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
            {formatNumber(row.count)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div id={`ch-drill-${slug(row.channel)}`}>
          <DrillPanel title={`${row.channel} — monthly trend`}>
            <MonthlyMini monthly={row.monthly} />
          </DrillPanel>
        </div>
      )}
    </li>
  );
}

function MonthlyMini({
  monthly,
}: {
  monthly: { month: string; count: number }[];
}) {
  if (monthly.length === 0) {
    return <p className="text-xs text-slate-500">No monthly entries.</p>;
  }
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <ul className="space-y-2">
      {monthly.map((m) => {
        const pct = (m.count / max) * 100;
        return (
          <li key={m.month} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-700">{formatMonthYear(m.month)}</span>
              <span className="text-[11px] tabular-nums text-slate-700">
                {formatNumber(m.count)}
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

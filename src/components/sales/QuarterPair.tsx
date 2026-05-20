import { useMemo, useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNairaCompact } from '../../lib/format';
import type { RevenueByLocationRow } from '../../lib/queries/sales';

// Per design-lock 2026-05-18: paired horizontal bars per location, Q1 vs Q2,
// using Received (Bank Deposit = financial source of truth per supervisor #1).
// Q2 chip flips amber while the quarter is still open (today <= year-06-30).

const TOP_N = 8;
const COLOR_Q1 = '#94A3B8'; // slate-400
const COLOR_Q2 = '#0369A1'; // sky-700  (accent)

type QuarterRow = {
  locationName: string;
  q1: number;
  q2: number;
};

export function QuarterPair({
  rows,
  loading,
  year,
  today = new Date(),
}: {
  rows: RevenueByLocationRow[];
  loading: boolean;
  year: number;
  today?: Date;
}) {
  const [showAll, setShowAll] = useState(false);

  const quarters = useMemo(() => computeQuarters(rows, year), [rows, year]);

  // Q2 ends June 30 of the chosen year (end-of-day local time).
  const q2End = new Date(year, 5, 30, 23, 59, 59);
  const q2InProgress = today <= q2End;

  const title = `Q1 vs Q2 — ${year}`;
  const subtitle = 'Received revenue per location (Bank Deposit).';

  if (!loading && quarters.length === 0) {
    return (
      <PanelCard title={title} subtitle={subtitle}>
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-500">
          No Q1 or Q2 {year} activity in this date range.
        </div>
      </PanelCard>
    );
  }

  const visible = showAll ? quarters : quarters.slice(0, TOP_N);
  const hidden = quarters.slice(TOP_N);
  const max = Math.max(1, ...visible.map((r) => Math.max(r.q1, r.q2)));

  const totalQ1 = quarters.reduce((a, r) => a + r.q1, 0);
  const totalQ2 = quarters.reduce((a, r) => a + r.q2, 0);
  const deltaPct = totalQ1 > 0 ? ((totalQ2 - totalQ1) / totalQ1) * 100 : null;

  const source = buildSource(totalQ1, totalQ2, deltaPct, q2InProgress);

  return (
    <PanelCard
      title={title}
      subtitle={subtitle}
      right={
        q2InProgress ? (
          <StatusChip tone="amber">Q2 in progress</StatusChip>
        ) : (
          <StatusChip tone="slate">Q1 & Q2 final</StatusChip>
        )
      }
      source={source}
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
              <QuarterRowView
                key={r.locationName}
                row={r}
                max={max}
                q2InProgress={q2InProgress}
              />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more location{hidden.length === 1 ? '' : 's'} —{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hidden.reduce((a, r) => a + r.q1, 0))}
              </span>{' '}
              Q1 /{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hidden.reduce((a, r) => a + r.q2, 0))}
              </span>{' '}
              Q2 combined.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
          >
            {showAll ? 'Show fewer' : `Show all ${quarters.length}`}
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function QuarterRowView({
  row,
  max,
  q2InProgress,
}: {
  row: QuarterRow;
  max: number;
  q2InProgress: boolean;
}) {
  const q1Pct = (row.q1 / max) * 100;
  const q2Pct = (row.q2 / max) * 100;
  const deltaPct = row.q1 > 0 ? ((row.q2 - row.q1) / row.q1) * 100 : null;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{row.locationName}</span>
        {deltaPct !== null && (
          <span
            className={[
              'text-[11px] uppercase tracking-wide tabular-nums',
              deltaPct >= 0 ? 'text-emerald-700' : 'text-slate-500',
            ].join(' ')}
          >
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct.toFixed(0)}% vs Q1
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        <Bar
          label="Q1"
          color={COLOR_Q1}
          pct={q1Pct}
          amount={formatNairaCompact(row.q1)}
        />
        <Bar
          label="Q2"
          labelSuffix={q2InProgress ? 'in-progress' : undefined}
          color={COLOR_Q2}
          pct={q2Pct}
          amount={formatNairaCompact(row.q2)}
        />
      </div>
    </li>
  );
}

function Bar({
  label,
  labelSuffix,
  color,
  pct,
  amount,
}: {
  label: string;
  labelSuffix?: string;
  color: string;
  pct: number;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
        {labelSuffix && (
          <span className="ml-1 text-[9px] normal-case tracking-normal text-amber-700">
            {labelSuffix}
          </span>
        )}
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

function computeQuarters(rows: RevenueByLocationRow[], year: number): QuarterRow[] {
  const yearStr = String(year);
  return rows
    .map((r) => {
      let q1 = 0;
      let q2 = 0;
      for (const m of r.monthly) {
        if (m.month.slice(0, 4) !== yearStr) continue;
        const mNum = Number(m.month.slice(5, 7));
        if (mNum <= 3) q1 += m.received;
        else if (mNum <= 6) q2 += m.received;
      }
      return { locationName: r.locationName, q1, q2 };
    })
    .filter((r) => r.q1 > 0 || r.q2 > 0)
    .sort((a, b) => Math.max(b.q1, b.q2) - Math.max(a.q1, a.q2));
}

function buildSource(
  q1: number,
  q2: number,
  deltaPct: number | null,
  q2InProgress: boolean,
): string {
  const totals = `Q1 ${formatNairaCompact(q1)} · Q2 ${formatNairaCompact(q2)}${
    q2InProgress ? ' (partial)' : ''
  }`;
  if (deltaPct === null) {
    return `Bank Deposit. ${totals}.`;
  }
  const sign = deltaPct >= 0 ? '+' : '';
  return `Bank Deposit. ${totals} — ${sign}${deltaPct.toFixed(1)}% overall.`;
}

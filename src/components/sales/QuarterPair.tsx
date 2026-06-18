import { useMemo, useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNairaCompact } from '../../lib/format';
import type { RevenueByLocationRow } from '../../lib/queries/sales';

// Per design-lock 2026-05-18 this was a Q1-vs-Q2 pair (the report started as a
// half-year deck). Generalised 2026-06-18 to ALL FOUR quarters: it shows every
// quarter of the selected year that has activity, plus the current quarter once
// it begins, so it grows from Q1 → Q1–Q4 as the year fills in and needs no edit
// for future years. Uses Received (Bank Deposit = financial source of truth per
// supervisor #1). The current (open) quarter is flagged "in progress".

const TOP_N = 8;
// Light → dark green ramp: earlier quarters lighter, the latest darker (brand
// green at Q3, emphasis at Q4) so the year visibly "deepens" left-to-right.
const QUARTER_COLORS = ['#A7D9A0', '#7BC56F', '#56B845', '#2F6E25'];

type QuarterRow = {
  locationName: string;
  /** Received per quarter, index 0..3 = Q1..Q4. */
  quarters: number[];
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

  const computed = useMemo(() => computeQuarters(rows, year), [rows, year]);

  // The open quarter is the one containing `today`, but only when the selected
  // year IS the current year (past years are all final; future years have no
  // data). Quarters are 0-indexed here: Q1 = 0 … Q4 = 3.
  const currentQ = year === today.getFullYear() ? Math.floor(today.getMonth() / 3) : -1;

  // Which quarters to render: any with revenue, plus the open quarter (so it
  // shows even before the first deposit of the quarter lands).
  const hasData = (qi: number) => computed.some((r) => r.quarters[qi] > 0);
  const visibleQ = [0, 1, 2, 3].filter((qi) => hasData(qi) || qi === currentQ);
  const inProgress = currentQ >= 0 && visibleQ.includes(currentQ);

  const title = `Quarterly revenue — ${year}`;
  const subtitle = 'Received revenue per location (Bank Deposit).';

  const locations = useMemo(
    () =>
      computed
        .filter((r) => visibleQ.some((qi) => r.quarters[qi] > 0))
        .sort(
          (a, b) =>
            Math.max(...visibleQ.map((qi) => b.quarters[qi])) -
            Math.max(...visibleQ.map((qi) => a.quarters[qi])),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computed, visibleQ.join(',')],
  );

  if (!loading && (locations.length === 0 || visibleQ.length === 0)) {
    return (
      <PanelCard title={title} subtitle={subtitle}>
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-500">
          No quarterly {year} activity in this date range.
        </div>
      </PanelCard>
    );
  }

  const visible = showAll ? locations : locations.slice(0, TOP_N);
  const hidden = locations.slice(TOP_N);
  const max = Math.max(1, ...visible.flatMap((r) => visibleQ.map((qi) => r.quarters[qi])));

  const quarterTotals = visibleQ.map((qi) => computed.reduce((a, r) => a + r.quarters[qi], 0));
  const source = buildSource(visibleQ, quarterTotals, currentQ);

  return (
    <PanelCard
      title={title}
      subtitle={subtitle}
      right={
        inProgress ? (
          <StatusChip tone="amber">Q{currentQ + 1} in progress</StatusChip>
        ) : (
          <StatusChip tone="slate">
            {visibleQ.length === 1
              ? `Q${visibleQ[0] + 1} final`
              : `Q${visibleQ[0] + 1}–Q${visibleQ[visibleQ.length - 1] + 1} final`}
          </StatusChip>
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
                visibleQ={visibleQ}
                currentQ={inProgress ? currentQ : -1}
              />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more location{hidden.length === 1 ? '' : 's'} —{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(
                  hidden.reduce((a, r) => a + visibleQ.reduce((s, qi) => s + r.quarters[qi], 0), 0),
                )}
              </span>{' '}
              combined across {visibleQ.length === 1 ? 'the quarter' : 'these quarters'}.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
          >
            {showAll ? 'Show fewer' : `Show all ${locations.length}`}
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function QuarterRowView({
  row,
  max,
  visibleQ,
  currentQ,
}: {
  row: QuarterRow;
  max: number;
  visibleQ: number[];
  currentQ: number;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{row.locationName}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {visibleQ.map((qi) => (
          <Bar
            key={qi}
            label={`Q${qi + 1}`}
            labelSuffix={qi === currentQ ? 'in-progress' : undefined}
            color={QUARTER_COLORS[qi]}
            pct={(row.quarters[qi] / max) * 100}
            amount={formatNairaCompact(row.quarters[qi])}
          />
        ))}
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
  return rows.map((r) => {
    const quarters = [0, 0, 0, 0];
    for (const m of r.monthly) {
      if (m.month.slice(0, 4) !== yearStr) continue;
      const mNum = Number(m.month.slice(5, 7)); // 1..12
      quarters[Math.floor((mNum - 1) / 3)] += m.received; // 0..3
    }
    return { locationName: r.locationName, quarters };
  });
}

function buildSource(visibleQ: number[], totals: number[], currentQ: number): string {
  const parts = visibleQ.map(
    (qi, i) =>
      `Q${qi + 1} ${formatNairaCompact(totals[i])}${qi === currentQ ? ' (partial)' : ''}`,
  );
  return `Bank Deposit. ${parts.join(' · ')}.`;
}

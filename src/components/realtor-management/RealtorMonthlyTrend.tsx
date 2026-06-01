import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PanelCard } from '../PanelCard';
import { BreakdownList, type BreakdownItem } from '../sales/BreakdownList';
import { DrillPanel } from '../sales/DrillPanel';
import { formatMonthShort, formatMonthYear, formatNumber } from '../../lib/format';
import type {
  MetricRow,
  MonthlyTrendBucket,
} from '../../lib/queries/realtor';

const COLOR_REFERRALS = '#56B845';     // brand green (Pertinence) — new referrals
const COLOR_BUSINESS_REPS = '#334155'; // slate-700 — new business reps
const COLOR_GRID = '#E2E8F0';

// Stacked bars: New Referrals (brand green) + New Business Reps (slate-700)
// = New Realtors total. Stack reads as a single bar whose pieces are the
// two recruitment-channel breakdowns. Per-bar click reveals every
// recruitment + activity metric for that month.
export function RealtorMonthlyTrend({
  monthly,
  recruitment,
  activity,
}: {
  monthly: MonthlyTrendBucket[];
  recruitment: MetricRow[];
  activity: MetricRow[];
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const empty = monthly.length === 0;
  const expandedRow = selectedMonth
    ? monthly.find((m) => m.month === selectedMonth) ?? null
    : null;
  const toggleMonth = (month: string) =>
    setSelectedMonth((cur) => (cur === month ? null : month));

  return (
    <PanelCard
      title="Monthly trend"
      subtitle="New realtor pipeline per month — green=referrals, slate=business reps. Tap a bar or month chip for that month's full metric breakdown."
      source="Source: realtor_metrics_monthly. Stack equals New Realtors total — where it disagrees with the metric source's 'Number of New Realtors' total, the per-month drill surfaces both."
    >
      {empty ? (
        <div className="grid h-56 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No realtor metric rows in this range yet.
        </div>
      ) : (
        <>
          <div className="h-64 w-full md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly}
                margin={{ top: 16, right: 8, left: 0, bottom: 16 }}
                barCategoryGap="20%"
              >
                <CartesianGrid stroke={COLOR_GRID} strokeDasharray="2 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: COLOR_GRID }}
                  height={32}
                  interval={0}
                  tick={(props) => (
                    <MonthTick {...props} selected={selectedMonth} />
                  )}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickFormatter={formatNumber}
                  width={48}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ fill: 'rgba(86,184,69,0.07)' }}
                />
                <Bar
                  dataKey="newReferrals"
                  stackId="recruits"
                  fill={COLOR_REFERRALS}
                  name="New referrals"
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <Bar
                  dataKey="newBusinessReps"
                  stackId="recruits"
                  fill={COLOR_BUSINESS_REPS}
                  name="New business reps"
                  radius={[4, 4, 0, 0]}
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Legend />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {monthly.map((m) => {
              const isSelected = m.month === selectedMonth;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => toggleMonth(m.month)}
                  aria-pressed={isSelected}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer',
                    isSelected
                      ? 'bg-accent text-white ring-accent'
                      : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-white',
                  ].join(' ')}
                >
                  {formatMonthShort(m.month)}
                </button>
              );
            })}
          </div>

          {expandedRow && (
            <DrillPanel
              title={`${formatMonthYear(expandedRow.month)} — full metric breakdown`}
            >
              <MonthDrill
                row={expandedRow}
                recruitment={recruitment}
                activity={activity}
              />
            </DrillPanel>
          )}
        </>
      )}
    </PanelCard>
  );
}

function MonthDrill({
  row,
  recruitment,
  activity,
}: {
  row: MonthlyTrendBucket;
  recruitment: MetricRow[];
  activity: MetricRow[];
}) {
  const stackTotal = row.newReferrals + row.newBusinessReps;
  const sourceTotal = row.newRealtorsTotal;
  const recruitItems: BreakdownItem[] = recruitment.map((m) => {
    const v = row.allMetrics[m.key];
    return {
      label: m.displayName,
      display: v == null ? '—' : formatNumber(v),
      weight: typeof v === 'number' ? v : 0,
    };
  });
  const activityItems: BreakdownItem[] = activity.map((m) => {
    const v = row.allMetrics[m.key];
    return {
      label: m.displayName,
      display: v == null ? '—' : formatNumber(v),
      weight: typeof v === 'number' ? v : 0,
    };
  });
  return (
    <>
      <div className="mb-3 text-xs text-slate-600">
        Stack: {formatNumber(row.newReferrals)} referrals · {formatNumber(row.newBusinessReps)} business reps ={' '}
        <span className="tabular-nums">{formatNumber(stackTotal)}</span>
        {sourceTotal !== stackTotal && (
          <>
            {' '}· source-reported total {formatNumber(sourceTotal)}{' '}
            <span className="text-amber-700">(differs by {formatNumber(Math.abs(sourceTotal - stackTotal))})</span>
          </>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent-emphasis">
            Recruitment metrics
          </div>
          <BreakdownList items={recruitItems} emptyMessage="No data this month." />
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Activity measurement
          </div>
          <BreakdownList items={activityItems} emptyMessage="No data this month." />
        </div>
      </div>
    </>
  );
}

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  selected: string | null;
};

function MonthTick({ x = 0, y = 0, payload, selected }: TickProps) {
  if (!payload) return null;
  const xn = typeof x === 'number' ? x : Number(x) || 0;
  const yn = typeof y === 'number' ? y : Number(y) || 0;
  const isSelected = selected === payload.value;
  return (
    <g transform={`translate(${xn}, ${yn})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={isSelected ? '#56B845' : '#475569'}
        fontSize={11}
        fontWeight={isSelected ? 700 : 500}
      >
        {formatMonthShort(payload.value)}
      </text>
    </g>
  );
}

function Legend() {
  const items: Array<{ label: string; color: string }> = [
    { label: 'New referrals', color: COLOR_REFERRALS },
    { label: 'New business reps', color: COLOR_BUSINESS_REPS },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-3 rounded-sm"
            style={{ backgroundColor: i.color }}
          />
          <span>{i.label}</span>
        </span>
      ))}
    </div>
  );
}

type TooltipPayloadEntry = {
  payload?: MonthlyTrendBucket;
};

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const stackTotal = row.newReferrals + row.newBusinessReps;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="text-xs font-semibold text-slate-900">{formatMonthYear(label)}</div>
      <table className="mt-1 text-xs">
        <tbody>
          <tr>
            <td className="pr-2">
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ backgroundColor: COLOR_REFERRALS }}
              />
              <span className="text-slate-600">New referrals</span>
            </td>
            <td className="text-right tabular-nums text-slate-900">
              {formatNumber(row.newReferrals)}
            </td>
          </tr>
          <tr>
            <td className="pr-2">
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ backgroundColor: COLOR_BUSINESS_REPS }}
              />
              <span className="text-slate-600">New business reps</span>
            </td>
            <td className="text-right tabular-nums text-slate-900">
              {formatNumber(row.newBusinessReps)}
            </td>
          </tr>
          <tr className="border-t border-slate-100">
            <td className="pr-2 pt-1 text-slate-700">Stack total</td>
            <td className="pt-1 text-right tabular-nums font-semibold text-slate-900">
              {formatNumber(stackTotal)}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="pt-1 text-[10px] italic text-slate-400">
              tap bar / chip below for full breakdown
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

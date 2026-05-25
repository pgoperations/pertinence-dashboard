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
import { formatNumber, formatMonthShort, formatMonthYear } from '../../lib/format';
import type { CsMonthBucket } from '../../lib/queries/customerSupport';

const COLOR_ENQ = '#0369A1';      // sky-700 — enquiries
const COLOR_COMP = '#334155';     // slate-700 — complaints unresolved
const COLOR_RESOLVED = '#059669'; // emerald-600 — resolved (distinct hue → reads as positive outcome)
const COLOR_GRID = '#E2E8F0';

export function CsMonthlyTrend({
  monthly,
  loading,
}: {
  monthly: CsMonthBucket[];
  loading: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const empty = !loading && monthly.length === 0;
  const expandedRow = selectedMonth
    ? monthly.find((m) => m.month === selectedMonth) ?? null
    : null;

  const toggleMonth = (month: string) =>
    setSelectedMonth((cur) => (cur === month ? null : month));

  return (
    <PanelCard
      title="Monthly trend"
      subtitle="Enquiries (sky) vs Complaints (slate) per month, with resolved overlay. Tap a bar or month chip for that month's breakdown."
      source="Source: customer_support_logs. Enquiries = no complaint_category_id. Complaints = with category. Resolved is the strict-resolved subset of complaints."
    >
      {empty ? (
        <div className="grid h-56 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No logs in this range.
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
                  cursor={{ fill: 'rgba(2,132,199,0.05)' }}
                />
                <Bar
                  dataKey="enquiries"
                  fill={COLOR_ENQ}
                  name="Enquiries"
                  radius={[4, 4, 0, 0]}
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                {/* Complaints bar — sits next to enquiries via default groupBy */}
                <Bar
                  dataKey="complaints"
                  stackId="comp"
                  fill={COLOR_COMP}
                  name="Complaints (unresolved)"
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <Bar
                  dataKey="resolvedComplaints"
                  stackId="comp"
                  fill={COLOR_RESOLVED}
                  name="Complaints (resolved)"
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
            <DrillPanel title={`${formatMonthYear(expandedRow.month)} — channels + complaint categories`}>
              <MonthDrill row={expandedRow} />
            </DrillPanel>
          )}
        </>
      )}
    </PanelCard>
  );
}

function MonthDrill({ row }: { row: CsMonthBucket }) {
  const channels: BreakdownItem[] = row.byChannel.map((e) => ({
    label: e.channel,
    display: formatNumber(e.count),
    weight: e.count,
  }));
  const cats: BreakdownItem[] = row.byCategory.map((e) => ({
    label: e.categoryName,
    display: `${formatNumber(e.resolvedCount)} / ${formatNumber(e.count)}`,
    weight: e.count,
  }));
  return (
    <>
      <div className="mb-3 text-xs text-slate-600">
        {formatNumber(row.enquiries)} enquiries · {formatNumber(row.complaints)} complaints ·{' '}
        <span className="tabular-nums">{formatNumber(row.resolvedComplaints)}</span> resolved
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            By channel
          </div>
          <BreakdownList items={channels} emptyMessage="No channel-tagged logs this month." />
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            By complaint category (resolved / total)
          </div>
          <BreakdownList items={cats} emptyMessage="No complaints this month." />
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
        fill={isSelected ? '#0369A1' : '#475569'}
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
    { label: 'Enquiries', color: COLOR_ENQ },
    { label: 'Complaints (unresolved)', color: COLOR_COMP },
    { label: 'Complaints (resolved)', color: COLOR_RESOLVED },
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
  payload?: CsMonthBucket;
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
  const rate = row.complaints > 0 ? (row.resolvedComplaints / row.complaints) * 100 : null;
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
                style={{ backgroundColor: COLOR_ENQ }}
              />
              <span className="text-slate-600">Enquiries</span>
            </td>
            <td className="text-right tabular-nums text-slate-900">
              {formatNumber(row.enquiries)}
            </td>
          </tr>
          <tr>
            <td className="pr-2">
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ backgroundColor: COLOR_COMP }}
              />
              <span className="text-slate-600">Complaints</span>
            </td>
            <td className="text-right tabular-nums text-slate-900">
              {formatNumber(row.complaints)}
            </td>
          </tr>
          <tr>
            <td className="pr-2">
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ backgroundColor: COLOR_RESOLVED }}
              />
              <span className="text-slate-600">Resolved</span>
            </td>
            <td className="text-right tabular-nums text-slate-900">
              {formatNumber(row.resolvedComplaints)}
              {rate !== null ? (
                <span className="ml-1 text-slate-500">({rate.toFixed(0)}%)</span>
              ) : null}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="pt-1 text-[10px] italic text-slate-400">
              tap bar / chip below for breakdown
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { BreakdownList, type BreakdownItem } from './BreakdownList';
import { DrillPanel } from './DrillPanel';
import { formatNairaCompact, formatMonthShort, formatMonthYear, formatNumber } from '../../lib/format';
import type { SalesMonthBucket } from '../../lib/queries/sales';

type ChartRow = SalesMonthBucket & {
  received: number;
  owed: number;
};

const COLOR_INITIAL = '#0369A1';
const COLOR_FURTHER = '#475569';
const COLOR_PAYABLE = '#94A3B8';
const COLOR_GRID = '#E2E8F0';

export function MoMChart({
  monthly,
  loading,
}: {
  monthly: SalesMonthBucket[];
  loading: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const data: ChartRow[] = monthly.map((m) => {
    const received = m.initial + m.further;
    return { ...m, received, owed: Math.max(0, m.payable - received) };
  });

  const empty = !loading && data.length === 0;
  const expandedRow = selectedMonth ? data.find((d) => d.month === selectedMonth) ?? null : null;

  const toggleMonth = (month: string) =>
    setSelectedMonth((cur) => (cur === month ? null : month));

  return (
    <PanelCard
      title="Month-on-month received vs payable"
      subtitle="Initial + Further stacked. Tick line = Payable. Tap a month chip for that month's breakdown."
      right={<StatusChip tone="sky">Stacked</StatusChip>}
      source="Bank Deposit 2026 LAND (received side) • Weekly Sales 2026 (payable side). Surfaced together, never reconciled."
    >
      {empty ? (
        <div className="grid h-56 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No sales activity in this range.
        </div>
      ) : (
        <>
          <div className="h-64 w-full md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                barCategoryGap="22%"
              >
                <CartesianGrid stroke={COLOR_GRID} strokeDasharray="2 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: COLOR_GRID }}
                  height={48}
                  interval={0}
                  tick={(props) => <MonthOwedTick {...props} rows={data} selected={selectedMonth} />}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickFormatter={formatNairaCompact}
                  width={56}
                />
                <Tooltip content={<MoMTooltip />} cursor={{ fill: 'rgba(2,132,199,0.05)' }} />
                <Bar
                  dataKey="initial"
                  stackId="received"
                  fill={COLOR_INITIAL}
                  name="Initial received"
                  radius={[0, 0, 0, 0]}
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <Bar
                  dataKey="further"
                  stackId="received"
                  fill={COLOR_FURTHER}
                  name="Further received"
                  radius={[4, 4, 0, 0]}
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <Line
                  type="stepAfter"
                  dataKey="payable"
                  stroke={COLOR_PAYABLE}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2.5, fill: COLOR_PAYABLE, stroke: COLOR_PAYABLE }}
                  activeDot={{ r: 3.5 }}
                  name="Payable"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <Legend />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.map((d) => {
              const isSelected = d.month === selectedMonth;
              return (
                <button
                  key={d.month}
                  type="button"
                  onClick={() => toggleMonth(d.month)}
                  aria-pressed={isSelected}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer',
                    isSelected
                      ? 'bg-accent text-white ring-accent'
                      : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-white',
                  ].join(' ')}
                >
                  {formatMonthShort(d.month)}
                </button>
              );
            })}
          </div>

          {expandedRow && (
            <DrillPanel title={`${formatMonthYear(expandedRow.month)} — where the month's numbers came from`}>
              <MonthDrill row={expandedRow} />
            </DrillPanel>
          )}
        </>
      )}
    </PanelCard>
  );
}

function MonthDrill({ row }: { row: ChartRow }) {
  const initial: BreakdownItem[] = row.initialBreakdown.map((e) => ({
    label: e.purposeName,
    display: formatNairaCompact(e.amount),
    weight: e.amount,
  }));
  const further: BreakdownItem[] = row.furtherBreakdown.map((e) => ({
    label: e.purposeName,
    display: formatNairaCompact(e.amount),
    weight: e.amount,
  }));
  const payable: BreakdownItem[] = row.payableBreakdown.map((e) => ({
    label: `${e.plotTypeName} (${formatNumber(e.count)})`,
    display: formatNairaCompact(e.payable),
    weight: e.payable,
  }));
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
          Initial received • {formatNairaCompact(row.initial)}
        </div>
        <BreakdownList items={initial} emptyMessage="None this month." />
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          Further received • {formatNairaCompact(row.further)}
        </div>
        <BreakdownList items={further} emptyMessage="None this month." />
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Payable • {formatNairaCompact(row.payable)}
        </div>
        <BreakdownList items={payable} emptyMessage="No contracts this month." />
      </div>
    </div>
  );
}

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows: ChartRow[];
  selected: string | null;
};

function MonthOwedTick({ x = 0, y = 0, payload, rows, selected }: TickProps) {
  if (!payload) return null;
  const row = rows.find((r) => r.month === payload.value);
  const owed = row?.owed ?? 0;
  const xn = typeof x === 'number' ? x : Number(x) || 0;
  const yn = typeof y === 'number' ? y : Number(y) || 0;
  const isSelected = selected === payload.value;
  return (
    <g transform={`translate(${xn}, ${yn})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill={isSelected ? '#0369A1' : '#475569'}
        fontSize={11}
        fontWeight={isSelected ? 700 : 500}
      >
        {formatMonthShort(payload.value)}
      </text>
      <text
        x={0}
        y={0}
        dy={28}
        textAnchor="middle"
        fill="#94A3B8"
        fontSize={10}
      >
        {owed > 0 ? `Owed ${formatNairaCompact(owed)}` : ''}
      </text>
    </g>
  );
}

function Legend() {
  const items: Array<{ label: string; color: string; style?: 'fill' | 'dash' }> = [
    { label: 'Initial received', color: COLOR_INITIAL, style: 'fill' },
    { label: 'Further received', color: COLOR_FURTHER, style: 'fill' },
    { label: 'Payable',          color: COLOR_PAYABLE, style: 'dash' },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.style === 'dash' ? (
            <span
              aria-hidden
              className="inline-block h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: i.color }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-2 w-3 rounded-sm"
              style={{ backgroundColor: i.color }}
            />
          )}
          <span>{i.label}</span>
        </span>
      ))}
    </div>
  );
}

type TooltipPayloadEntry = {
  name?: string | number;
  value?: number | string;
  dataKey?: string | number;
  payload?: ChartRow;
};

function MoMTooltip({
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
  const rows: Array<[string, number, string]> = [
    ['Initial received', row.initial, COLOR_INITIAL],
    ['Further received', row.further, COLOR_FURTHER],
    ['Payable',          row.payable, COLOR_PAYABLE],
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="text-xs font-semibold text-slate-900">{formatMonthYear(label)}</div>
      <table className="mt-1 text-xs">
        <tbody>
          {rows.map(([name, value, color]) => (
            <tr key={name}>
              <td className="pr-2">
                <span
                  aria-hidden
                  className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-600">{name}</span>
              </td>
              <td className="text-right tabular-nums text-slate-900">
                {formatNairaCompact(value)}
              </td>
            </tr>
          ))}
          {row.owed > 0 && (
            <tr>
              <td className="pr-2 pt-1 text-slate-500">Owed</td>
              <td className="pt-1 text-right tabular-nums text-slate-700">
                {formatNairaCompact(row.owed)}
              </td>
            </tr>
          )}
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

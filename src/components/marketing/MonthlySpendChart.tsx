import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PanelCard } from '../PanelCard';
import { BreakdownList, type BreakdownItem } from '../sales/BreakdownList';
import { DrillPanel } from '../sales/DrillPanel';
import { formatNairaCompact, formatMonthShort, formatMonthYear } from '../../lib/format';
import type { MarketingMonthBucket } from '../../lib/queries/marketing';

const COLOR_BAR = '#0369A1';
const COLOR_BAR_SELECTED = '#0C4A6E';
const COLOR_GRID = '#E2E8F0';

export function MonthlySpendChart({
  monthly,
  loading,
}: {
  monthly: MarketingMonthBucket[];
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
      title="Monthly spend trend"
      subtitle="Tap a bar or month chip for the category split that month."
      source="Source: marketing_monthly aggregate (refreshed by ingest-marketing-expense)."
    >
      {empty ? (
        <div className="grid h-56 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No spend in this range.
        </div>
      ) : (
        <>
          <div className="h-64 w-full md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly}
                margin={{ top: 24, right: 8, left: 0, bottom: 16 }}
                barCategoryGap="24%"
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
                  tickFormatter={formatNairaCompact}
                  width={56}
                />
                <Tooltip content={<SpendTooltip />} cursor={{ fill: 'rgba(2,132,199,0.05)' }} />
                <Bar
                  dataKey="total"
                  radius={[4, 4, 0, 0]}
                  name="Spend"
                  onClick={(d: unknown) => {
                    const month = (d as { payload?: { month?: string } })?.payload?.month;
                    if (month) toggleMonth(month);
                  }}
                  style={{ cursor: 'pointer' }}
                  shape={(props: unknown) => (
                    <SelectableBar
                      {...(props as BarShapeProps)}
                      selectedMonth={selectedMonth}
                    />
                  )}
                >
                  <LabelList
                    dataKey="total"
                    position="top"
                    content={(props) => <ValueLabel {...(props as LabelProps)} />}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

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
            <DrillPanel title={`${formatMonthYear(expandedRow.month)} — by category`}>
              <MonthCategoryDrill row={expandedRow} />
            </DrillPanel>
          )}
        </>
      )}
    </PanelCard>
  );
}

function MonthCategoryDrill({ row }: { row: MarketingMonthBucket }) {
  if (row.byCategory.length === 0) {
    return <p className="text-xs text-slate-500">No category-level entries for this month.</p>;
  }
  const items: BreakdownItem[] = row.byCategory.map((e) => ({
    label: e.categoryName,
    display: formatNairaCompact(e.amount),
    weight: e.amount,
  }));
  return (
    <>
      <div className="mb-3 text-xs text-slate-600">
        Total spend this month:{' '}
        <span className="font-semibold tabular-nums text-slate-900">
          {formatNairaCompact(row.total)}
        </span>
      </div>
      <BreakdownList items={items} emptyMessage="No spend this month." />
    </>
  );
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { month?: string };
};

function SelectableBar({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload,
  selectedMonth,
}: BarShapeProps & { selectedMonth: string | null }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  const isSelected = !!selectedMonth && payload?.month === selectedMonth;
  const fill = isSelected ? COLOR_BAR_SELECTED : COLOR_BAR;
  // Custom rounded-top bar to match Recharts radius={[4,4,0,0]} but with our fill switch.
  return (
    <g>
      <path
        d={roundedTopBarPath(x, y, width, height, 4)}
        fill={fill}
      />
    </g>
  );
}

function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M ${x},${y + rr}`,
    `Q ${x},${y} ${x + rr},${y}`,
    `L ${x + w - rr},${y}`,
    `Q ${x + w},${y} ${x + w},${y + rr}`,
    `L ${x + w},${y + h}`,
    `L ${x},${y + h}`,
    'Z',
  ].join(' ');
}

type LabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
};

function ValueLabel({ x = 0, y = 0, width = 0, value }: LabelProps) {
  if (typeof value !== 'number' || value <= 0) return null;
  const xn = (typeof x === 'number' ? x : Number(x) || 0) + (typeof width === 'number' ? width : Number(width) || 0) / 2;
  const yn = (typeof y === 'number' ? y : Number(y) || 0) - 6;
  return (
    <text
      x={xn}
      y={yn}
      textAnchor="middle"
      fill="#334155"
      fontSize={11}
      fontWeight={600}
      className="tabular-nums"
    >
      {formatNairaCompact(value)}
    </text>
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

type TooltipPayloadEntry = {
  value?: number | string;
  payload?: MarketingMonthBucket;
};

function SpendTooltip({
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
  const topCats = row.byCategory.slice(0, 3);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="text-xs font-semibold text-slate-900">{formatMonthYear(label)}</div>
      <div className="mt-1 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-slate-600">Total spend</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatNairaCompact(row.total)}
          </span>
        </div>
        {topCats.length > 0 && (
          <table className="mt-1.5">
            <tbody>
              {topCats.map((c) => (
                <tr key={c.categoryName}>
                  <td className="pr-2 text-slate-500">{c.categoryName}</td>
                  <td className="text-right tabular-nums text-slate-700">
                    {formatNairaCompact(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-1 text-[10px] italic text-slate-400">tap bar for full breakdown</div>
      </div>
    </div>
  );
}

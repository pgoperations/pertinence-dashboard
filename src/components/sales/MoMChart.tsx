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
import { BreakdownList, type BreakdownItem } from './BreakdownList';
import { DrillPanel } from './DrillPanel';
import { formatNairaCompact, formatMonthShort, formatMonthYear, formatNumber } from '../../lib/format';
import type { SalesMonthBucket } from '../../lib/queries/sales';

type ChartRow = SalesMonthBucket & {
  received: number;
  owed: number;
};

type ViewMode = 'received-vs-payable' | 'total-revenue';

const COLOR_INITIAL = '#56B845'; // brand green (Pertinence) — primary received-stage tone
const COLOR_FURTHER = '#334155'; // slate-700
const COLOR_FEES = '#8B5CF6';    // violet-500 — third tone, distinct from both sky and slate
const COLOR_PAYABLE = '#94A3B8'; // slate-400
const COLOR_GRID = '#E2E8F0';

export function MoMChart({
  monthly,
  loading,
}: {
  monthly: SalesMonthBucket[];
  loading: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('received-vs-payable');

  const data: ChartRow[] = monthly.map((m) => {
    const received = m.initial + m.further;
    return { ...m, received, owed: Math.max(0, m.payable - received) };
  });

  const isTotalView = view === 'total-revenue';

  const empty = !loading && data.length === 0;
  const expandedRow = selectedMonth ? data.find((d) => d.month === selectedMonth) ?? null : null;

  const toggleMonth = (month: string) =>
    setSelectedMonth((cur) => (cur === month ? null : month));

  return (
    <PanelCard
      title={isTotalView ? 'Month-on-month total revenue' : 'Month-on-month received vs payable'}
      subtitle={
        isTotalView
          ? 'Total revenue = Initial + Further + Fees. Tap a month chip for that month’s breakdown.'
          : 'Initial + Further stacked. Tick line = Payable. Tap a month chip for that month’s breakdown.'
      }
      right={
        <ViewToggle
          view={view}
          onChange={(next) => {
            setView(next);
            setSelectedMonth(null);
          }}
        />
      }
      source={
        isTotalView
          ? 'Bank Deposit, LAND tab — every naira received in the period, including fees & charges.'
          : 'Bank Deposit, LAND tab (received side) • Weekly Sales tab (payable side). Surfaced together, never reconciled.'
      }
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
                  tick={(props) => (
                    <MonthOwedTick
                      {...props}
                      rows={data}
                      selected={selectedMonth}
                      showOwed={!isTotalView}
                    />
                  )}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickFormatter={formatNairaCompact}
                  width={56}
                />
                <Tooltip
                  content={<MoMTooltip view={view} />}
                  cursor={{ fill: 'rgba(86,184,69,0.07)' }}
                />
                {isTotalView ? (
                  <>
                    <Bar
                      dataKey="initial"
                      stackId="total"
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
                      stackId="total"
                      fill={COLOR_FURTHER}
                      name="Further received"
                      radius={[0, 0, 0, 0]}
                      onClick={(d: unknown) => {
                        const month = (d as { payload?: { month?: string } })?.payload?.month;
                        if (month) toggleMonth(month);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <Bar
                      dataKey="fees"
                      stackId="total"
                      fill={COLOR_FEES}
                      name="Fees & charges"
                      radius={[4, 4, 0, 0]}
                      onClick={(d: unknown) => {
                        const month = (d as { payload?: { month?: string } })?.payload?.month;
                        if (month) toggleMonth(month);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <Legend view={view} />

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
              <MonthDrill row={expandedRow} view={view} />
            </DrillPanel>
          )}
        </>
      )}
    </PanelCard>
  );
}

function MonthDrill({ row, view }: { row: ChartRow; view: ViewMode }) {
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
  const fees: BreakdownItem[] = row.feesBreakdown.map((e) => ({
    label: e.purposeName,
    display: formatNairaCompact(e.amount),
    weight: e.amount,
  }));
  const payable: BreakdownItem[] = row.payableBreakdown.map((e) => ({
    label: `${e.plotTypeName} (${formatNumber(e.count)})`,
    display: formatNairaCompact(e.payable),
    weight: e.payable,
  }));

  if (view === 'total-revenue') {
    return (
      <>
        <div className="mb-3 text-xs text-slate-600">
          Total revenue this month:{' '}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatNairaCompact(row.totalRevenue)}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent-emphasis">
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
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              Fees &amp; charges • {formatNairaCompact(row.fees)}
            </div>
            <BreakdownList items={fees} emptyMessage="None this month." />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent-emphasis">
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

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const opts: Array<{ id: ViewMode; label: string }> = [
    { id: 'received-vs-payable', label: 'Received vs Payable' },
    { id: 'total-revenue',       label: 'Total Revenue'      },
  ];
  return (
    <div
      role="tablist"
      aria-label="Chart view"
      className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium"
    >
      {opts.map((o) => {
        const active = o.id === view;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={[
              'rounded-md px-2.5 py-1 transition-colors cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              active
                ? 'bg-white text-accent shadow-sm ring-1 ring-inset ring-slate-200'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows: ChartRow[];
  selected: string | null;
  showOwed: boolean;
};

function MonthOwedTick({ x = 0, y = 0, payload, rows, selected, showOwed }: TickProps) {
  if (!payload) return null;
  const row = rows.find((r) => r.month === payload.value);
  const owed = row?.owed ?? 0;
  const total = row?.totalRevenue ?? 0;
  const xn = typeof x === 'number' ? x : Number(x) || 0;
  const yn = typeof y === 'number' ? y : Number(y) || 0;
  const isSelected = selected === payload.value;
  const subline = showOwed
    ? (owed > 0 ? `Owed ${formatNairaCompact(owed)}` : '')
    : (total > 0 ? formatNairaCompact(total) : '');
  return (
    <g transform={`translate(${xn}, ${yn})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill={isSelected ? '#56B845' : '#475569'}
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
        {subline}
      </text>
    </g>
  );
}

function Legend({ view }: { view: ViewMode }) {
  const items: Array<{ label: string; color: string; style?: 'fill' | 'dash' }> =
    view === 'total-revenue'
      ? [
          { label: 'Initial received', color: COLOR_INITIAL, style: 'fill' },
          { label: 'Further received', color: COLOR_FURTHER, style: 'fill' },
          { label: 'Fees & charges',   color: COLOR_FEES,    style: 'fill' },
        ]
      : [
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
  view,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  view: ViewMode;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const rows: Array<[string, number, string]> =
    view === 'total-revenue'
      ? [
          ['Initial received', row.initial, COLOR_INITIAL],
          ['Further received', row.further, COLOR_FURTHER],
          ['Fees & charges',   row.fees,    COLOR_FEES],
        ]
      : [
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
          {view === 'total-revenue' ? (
            <tr>
              <td className="pr-2 pt-1 font-semibold text-slate-700">Total</td>
              <td className="pt-1 text-right tabular-nums font-semibold text-slate-900">
                {formatNairaCompact(row.totalRevenue)}
              </td>
            </tr>
          ) : row.owed > 0 ? (
            <tr>
              <td className="pr-2 pt-1 text-slate-500">Owed</td>
              <td className="pt-1 text-right tabular-nums text-slate-700">
                {formatNairaCompact(row.owed)}
              </td>
            </tr>
          ) : null}
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

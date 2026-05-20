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
import { formatNairaCompact, formatMonthShort, formatMonthYear } from '../../lib/format';
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
  const data: ChartRow[] = monthly.map((m) => {
    const received = m.initial + m.further;
    return { ...m, received, owed: Math.max(0, m.payable - received) };
  });

  const empty = !loading && data.length === 0;

  return (
    <PanelCard
      title="Month-on-month received vs payable"
      subtitle="Initial + Further stacked. Tick line = Payable. Visible gap = unpaid balance."
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
                  tick={(props) => <MonthOwedTick {...props} rows={data} />}
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
                />
                <Bar
                  dataKey="further"
                  stackId="received"
                  fill={COLOR_FURTHER}
                  name="Further received"
                  radius={[4, 4, 0, 0]}
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
        </>
      )}
    </PanelCard>
  );
}

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows: ChartRow[];
};

function MonthOwedTick({ x = 0, y = 0, payload, rows }: TickProps) {
  if (!payload) return null;
  const row = rows.find((r) => r.month === payload.value);
  const owed = row?.owed ?? 0;
  const xn = typeof x === 'number' ? x : Number(x) || 0;
  const yn = typeof y === 'number' ? y : Number(y) || 0;
  return (
    <g transform={`translate(${xn}, ${yn})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="#475569"
        fontSize={11}
        fontWeight={500}
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
        </tbody>
      </table>
    </div>
  );
}

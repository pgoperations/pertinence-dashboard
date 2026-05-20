import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNumber } from '../../lib/format';
import type { PlotPivotRow } from '../../lib/queries/sales';

export function PlotSizePivot({
  pivot,
  loading,
}: {
  pivot: PlotPivotRow[];
  loading: boolean;
}) {
  const empty = !loading && pivot.length === 0;

  return (
    <PanelCard
      title="Plots sold by location × size"
      subtitle="Rows sorted by total plots desc. Scroll the table on phone for size columns."
      right={<StatusChip tone="sky">Weekly Sales</StatusChip>}
      source="Source: Weekly Sales 2026. Special bucket covers QUARTER / ACRE / HECTARE / sub-300 SQM per the plot-type spec."
    >
      {empty ? (
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No plots sold in this range.
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <Th sticky>Location</Th>
                <Th align="right">Starter</Th>
                <Th align="right">Classic</Th>
                <Th align="right">Executive</Th>
                <Th align="right">Special</Th>
                <Th align="right" emphasis>Total</Th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`s-${i}`}>
                      <Td sticky>
                        <span className="block h-3 w-24 rounded bg-slate-100" />
                      </Td>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Td key={j} align="right">
                          <span className="ml-auto block h-3 w-8 rounded bg-slate-100" />
                        </Td>
                      ))}
                    </tr>
                  ))
                : pivot.map((r) => (
                    <tr key={r.locationName}>
                      <Td sticky>
                        <span className="font-medium text-slate-900">{r.locationName}</span>
                      </Td>
                      <Td align="right">{cellNum(r.starter)}</Td>
                      <Td align="right">{cellNum(r.classic)}</Td>
                      <Td align="right">{cellNum(r.executive)}</Td>
                      <Td align="right">{cellNum(r.special)}</Td>
                      <Td align="right" emphasis>
                        {formatNumber(r.total)}
                      </Td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

function cellNum(n: number) {
  return n === 0 ? <span className="text-slate-300">—</span> : formatNumber(n);
}

function Th({
  children,
  align = 'left',
  sticky,
  emphasis,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  sticky?: boolean;
  emphasis?: boolean;
}) {
  return (
    <th
      scope="col"
      className={[
        'border-b border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500',
        align === 'right' ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-10 shadow-[1px_0_0_0_rgb(226_232_240)]' : '',
        emphasis ? 'text-slate-700' : '',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  sticky,
  emphasis,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  sticky?: boolean;
  emphasis?: boolean;
}) {
  return (
    <td
      className={[
        'border-b border-slate-100 bg-white px-3 py-2.5 tabular-nums text-slate-700',
        align === 'right' ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-10 shadow-[1px_0_0_0_rgb(241_245_249)]' : '',
        emphasis ? 'font-semibold text-slate-900' : '',
      ].join(' ')}
    >
      {children}
    </td>
  );
}

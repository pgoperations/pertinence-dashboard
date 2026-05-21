import { useState, type ReactNode } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronRight } from '../icons';
import { formatNumber } from '../../lib/format';
import { formatMonthYear } from '../../lib/format';
import type { PlotPivotRow } from '../../lib/queries/sales';

export function PlotSizePivot({
  pivot,
  loading,
}: {
  pivot: PlotPivotRow[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const empty = !loading && pivot.length === 0;
  const toggle = (loc: string) => setExpanded((cur) => (cur === loc ? null : loc));

  return (
    <PanelCard
      title="Plots sold by location × size"
      subtitle="Tap a location row for its monthly breakdown."
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
                : pivot.map((r) => {
                    const isOpen = expanded === r.locationName;
                    return (
                      <FragmentRow key={r.locationName}>
                        <tr
                          onClick={() => toggle(r.locationName)}
                          className={[
                            'cursor-pointer transition-colors',
                            isOpen ? 'bg-accent/5' : 'hover:bg-slate-50',
                          ].join(' ')}
                        >
                          <Td sticky highlighted={isOpen}>
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={`pivot-drill-${slug(r.locationName)}`}
                              className="flex items-center gap-1.5 text-left font-medium text-slate-900 focus:outline-none cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(r.locationName);
                              }}
                            >
                              <IconChevronRight
                                className={[
                                  'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                                  isOpen ? 'rotate-90 text-accent' : '',
                                ].join(' ')}
                              />
                              <span>{r.locationName}</span>
                            </button>
                          </Td>
                          <Td align="right" highlighted={isOpen}>{cellNum(r.starter)}</Td>
                          <Td align="right" highlighted={isOpen}>{cellNum(r.classic)}</Td>
                          <Td align="right" highlighted={isOpen}>{cellNum(r.executive)}</Td>
                          <Td align="right" highlighted={isOpen}>{cellNum(r.special)}</Td>
                          <Td align="right" emphasis highlighted={isOpen}>
                            {formatNumber(r.total)}
                          </Td>
                        </tr>
                        {isOpen && (
                          <tr id={`pivot-drill-${slug(r.locationName)}`}>
                            <td
                              colSpan={6}
                              className="border-b border-slate-100 bg-slate-50 p-0"
                            >
                              <DrillBody row={r} />
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
            </tbody>
            {!loading && pivot.length > 0 && (
              <tfoot>
                <tr>
                  <TotalTd sticky>Total</TotalTd>
                  <TotalTd align="right">{cellNum(sumKey(pivot, 'starter'))}</TotalTd>
                  <TotalTd align="right">{cellNum(sumKey(pivot, 'classic'))}</TotalTd>
                  <TotalTd align="right">{cellNum(sumKey(pivot, 'executive'))}</TotalTd>
                  <TotalTd align="right">{cellNum(sumKey(pivot, 'special'))}</TotalTd>
                  <TotalTd align="right" grand>{formatNumber(sumKey(pivot, 'total'))}</TotalTd>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </PanelCard>
  );
}

function sumKey(rows: PlotPivotRow[], key: 'starter' | 'classic' | 'executive' | 'special' | 'total'): number {
  let n = 0;
  for (const r of rows) n += r[key];
  return n;
}

function TotalTd({
  children,
  align = 'left',
  sticky,
  grand,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  sticky?: boolean;
  grand?: boolean;
}) {
  return (
    <td
      className={[
        'border-t-2 border-slate-300 bg-slate-50 px-3 py-2.5 tabular-nums font-semibold',
        grand ? 'text-slate-900' : 'text-slate-700',
        align === 'right' ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-10' : '',
      ].join(' ')}
      style={sticky ? { boxShadow: '1px 0 0 0 rgb(226 232 240)' } : undefined}
    >
      {children}
    </td>
  );
}

function DrillBody({ row }: { row: PlotPivotRow }) {
  if (row.monthly.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-slate-500">No monthly entries.</div>
    );
  }
  return (
    <div className="px-4 py-3 md:px-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Month by month — plot counts
      </div>
      <table className="text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="pb-1 pr-3 text-left font-medium">Month</th>
            <th className="pb-1 pr-3 text-right font-medium">Starter</th>
            <th className="pb-1 pr-3 text-right font-medium">Classic</th>
            <th className="pb-1 pr-3 text-right font-medium">Executive</th>
            <th className="pb-1 pr-3 text-right font-medium">Special</th>
            <th className="pb-1 text-right font-medium text-slate-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {row.monthly.map((m) => (
            <tr key={m.month}>
              <td className="py-1 pr-3 text-slate-700">{formatMonthYear(m.month)}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{cellNum(m.starter)}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{cellNum(m.classic)}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{cellNum(m.executive)}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{cellNum(m.special)}</td>
              <td className="py-1 text-right tabular-nums font-semibold text-slate-900">
                {formatNumber(m.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function cellNum(n: number) {
  return n === 0 ? <span className="text-slate-300">—</span> : formatNumber(n);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function Th({
  children,
  align = 'left',
  sticky,
  emphasis,
}: {
  children: ReactNode;
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
  highlighted,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  sticky?: boolean;
  emphasis?: boolean;
  highlighted?: boolean;
}) {
  const bg = highlighted ? 'bg-accent/5' : 'bg-white';
  const sep = highlighted ? 'rgb(2 132 199 / 0.20)' : 'rgb(241 245 249)';
  return (
    <td
      className={[
        'border-b border-slate-100 px-3 py-2.5 tabular-nums text-slate-700',
        bg,
        align === 'right' ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-10' : '',
        emphasis ? 'font-semibold text-slate-900' : '',
      ].join(' ')}
      style={sticky ? { boxShadow: `1px 0 0 0 ${sep}` } : undefined}
    >
      {children}
    </td>
  );
}

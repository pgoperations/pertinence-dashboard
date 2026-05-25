import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronDown } from '../icons';
import { BreakdownList, type BreakdownItem } from '../sales/BreakdownList';
import { DrillPanel } from '../sales/DrillPanel';
import {
  formatNairaCompact,
  formatNumber,
  formatAsOf,
  formatMonthYear,
} from '../../lib/format';
import type {
  KpiBreakdowns,
  MarketingKpis,
  MarketingSources,
} from '../../lib/queries/marketing';

type TileId = 'total' | 'categories' | 'busiest' | 'largest' | 'avg';

type Tile = {
  id: TileId;
  label: string;
  value: string;
  hint: string;
};

export function MarketingKpiStrip({
  kpis,
  breakdowns,
  largestCategory,
  sources,
  loading,
}: {
  kpis: MarketingKpis;
  breakdowns: KpiBreakdowns;
  largestCategory: { name: string; amount: number } | null;
  sources: MarketingSources;
  loading: boolean;
}) {
  const [open, setOpen] = useState<TileId | null>(null);
  const toggle = (id: TileId) => setOpen((cur) => (cur === id ? null : id));

  const heroOpen = open === 'total';
  const asOf = freshest(sources);

  const tiles: Tile[] = [
    {
      id: 'categories',
      label: 'Categories active',
      value: loading ? '—' : formatNumber(kpis.categoriesActive),
      hint: 'Of 11 H1 canonicals',
    },
    {
      id: 'busiest',
      label: 'Busiest month',
      value: loading || !kpis.busiestMonth ? '—' : formatMonthYear(kpis.busiestMonth.month),
      hint: loading || !kpis.busiestMonth
        ? 'No spend in range'
        : formatNairaCompact(kpis.busiestMonth.amount),
    },
    {
      id: 'largest',
      label: 'Largest category',
      value: loading || !largestCategory ? '—' : truncate(largestCategory.name, 18),
      hint: loading || !largestCategory ? 'No spend in range' : formatNairaCompact(largestCategory.amount),
    },
    {
      id: 'avg',
      label: 'Avg monthly',
      value: loading ? '—' : formatNairaCompact(kpis.avgMonthlySpend),
      hint: loading ? '' : `${kpis.monthsObserved} month${kpis.monthsObserved === 1 ? '' : 's'} observed`,
    },
  ];

  return (
    <PanelCard
      title="Marketing summary"
      subtitle="Petty cashbook expenditure only. Tap a tile for the breakdown."
      right={asOf ? <StatusChip tone="slate">As of {formatAsOf(asOf)}</StatusChip> : undefined}
      source="Source: Marketing Fund Expense Sheet. Billboard cost and finance-direct programmes (Wealth Summit, etc.) are out of scope for v1 — surfaced as separate cards below."
    >
      <button
        type="button"
        onClick={() => toggle('total')}
        disabled={loading}
        aria-expanded={heroOpen}
        aria-controls="mk-kpi-drill"
        className={[
          'group mb-3 flex w-full flex-col rounded-xl p-4 text-left ring-1 ring-inset transition-colors md:mb-4 md:p-5',
          'focus:outline-none focus:ring-2 focus:ring-accent',
          heroOpen
            ? 'bg-white ring-accent shadow-sm'
            : 'bg-gradient-to-br from-accent/10 to-slate-50 ring-accent/30 hover:from-accent/15 hover:ring-accent/50',
          loading ? 'cursor-default opacity-70' : 'cursor-pointer',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
            Total marketing spend
          </span>
          <IconChevronDown
            className={[
              'h-4 w-4 shrink-0 text-accent transition-transform',
              heroOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
        </div>
        <div className="mt-1 font-heading text-3xl font-bold tabular-nums text-slate-900 md:text-4xl">
          {loading ? '—' : formatNairaCompact(kpis.totalSpend)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Expenditure across {kpis.categoriesActive} categor{kpis.categoriesActive === 1 ? 'y' : 'ies'}
          {kpis.monthsObserved > 0 && ` · ${kpis.monthsObserved} month${kpis.monthsObserved === 1 ? '' : 's'}`}
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiles.map((t) => {
          const isOpen = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              disabled={loading}
              aria-expanded={isOpen}
              aria-controls="mk-kpi-drill"
              className={[
                'group flex flex-col rounded-xl p-3 text-left ring-1 ring-inset transition-colors md:p-4',
                'focus:outline-none focus:ring-2 focus:ring-accent',
                isOpen
                  ? 'bg-white ring-accent shadow-sm'
                  : 'bg-slate-50 ring-slate-100 hover:bg-white hover:ring-slate-200',
                loading ? 'cursor-default opacity-70' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {t.label}
                </span>
                <IconChevronDown
                  className={[
                    'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                    isOpen ? 'rotate-180 text-accent' : '',
                  ].join(' ')}
                />
              </div>
              <div className="mt-1 truncate font-heading text-xl font-bold tabular-nums text-slate-900 md:text-2xl">
                {t.value}
              </div>
              <div className="mt-1 truncate text-[10px] text-slate-400">{t.hint}</div>
            </button>
          );
        })}
      </div>

      {!loading && open && (
        <div id="mk-kpi-drill">
          <DrillPanel title={drillTitle(open, kpis)}>
            {renderDrill(open, breakdowns, largestCategory)}
          </DrillPanel>
        </div>
      )}
    </PanelCard>
  );
}

function drillTitle(id: TileId, kpis: MarketingKpis): string {
  switch (id) {
    case 'total':      return 'Total marketing spend — by category';
    case 'categories': return 'Categories active — ranked by spend';
    case 'busiest':    return kpis.busiestMonth
      ? `${formatMonthYear(kpis.busiestMonth.month)} — by category`
      : 'Busiest month — no spend in range';
    case 'largest':    return 'Largest category — overall ranking';
    case 'avg':        return 'Avg monthly spend — per-month totals';
  }
}

function renderDrill(
  id: TileId,
  b: KpiBreakdowns,
  largestCategory: { name: string; amount: number } | null,
) {
  switch (id) {
    case 'total':
    case 'categories': {
      const items: BreakdownItem[] = b.totalSpend.map((e) => ({
        label: e.categoryName,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No spend in this range." />;
    }
    case 'busiest': {
      const items: BreakdownItem[] = b.busiestMonth.map((e) => ({
        label: e.categoryName,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No spend in the busiest month." />;
    }
    case 'largest': {
      const items: BreakdownItem[] = b.totalSpend.map((e) => ({
        label: e.categoryName === (largestCategory?.name ?? '') ? `${e.categoryName} (top)` : e.categoryName,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No categories in this range." />;
    }
    case 'avg': {
      const items: BreakdownItem[] = b.avgMonthlySpend.map((e) => ({
        label: formatMonthYear(e.month),
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No months in this range." />;
    }
  }
}

function freshest(s: MarketingSources): string | null {
  const a = s.marketingMonthlyRefreshedAt;
  const b = s.marketingExpensesUpdatedAt;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

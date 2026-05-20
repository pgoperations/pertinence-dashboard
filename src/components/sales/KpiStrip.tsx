import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronDown } from '../icons';
import { BreakdownList, type BreakdownItem } from './BreakdownList';
import { DrillPanel } from './DrillPanel';
import { formatNairaCompact, formatNumber, formatAsOf } from '../../lib/format';
import type {
  KpiBreakdowns,
  SalesKpis,
  SalesPanelSources,
} from '../../lib/queries/sales';

type TileId = 'plots' | 'payable' | 'initial' | 'further';

type Tile = {
  id: TileId;
  label: string;
  value: string;
  hint: string;
};

export function KpiStrip({
  kpis,
  breakdowns,
  sources,
  loading,
}: {
  kpis: SalesKpis;
  breakdowns: KpiBreakdowns;
  sources: SalesPanelSources;
  loading: boolean;
}) {
  const [open, setOpen] = useState<TileId | null>(null);
  const [feesOpen, setFeesOpen] = useState(false);
  const toggle = (id: TileId) => setOpen((cur) => (cur === id ? null : id));

  const tiles: Tile[] = [
    {
      id: 'plots',
      label: 'Plots sold',
      value: loading ? '—' : formatNumber(kpis.plotsSold),
      hint: 'Weekly Sales',
    },
    {
      id: 'payable',
      label: 'Total payable',
      value: loading ? '—' : formatNairaCompact(kpis.totalPayable),
      hint: 'Contract value',
    },
    {
      id: 'initial',
      label: 'Initial received',
      value: loading ? '—' : formatNairaCompact(kpis.initialReceived),
      hint: 'Initial + Outright',
    },
    {
      id: 'further',
      label: 'Further received',
      value: loading ? '—' : formatNairaCompact(kpis.furtherReceived),
      hint: 'Further + Balance',
    },
  ];

  const asOf = freshest(sources);

  return (
    <PanelCard
      title="Sales summary"
      subtitle="Tap a tile for the breakdown that produced it."
      right={asOf ? <StatusChip tone="slate">As of {formatAsOf(asOf)}</StatusChip> : undefined}
      source="Bank Deposit 2026 LAND (received) • Weekly Sales 2026 (payable + plot count). Fees & charges shown separately on the panel."
    >
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
              aria-controls="kpi-drill"
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
              <div className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 md:text-3xl">
                {t.value}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">{t.hint}</div>
            </button>
          );
        })}
      </div>

      {!loading && open && (
        <div id="kpi-drill">
          <DrillPanel title={drillTitle(open)}>
            {renderDrill(open, breakdowns)}
          </DrillPanel>
        </div>
      )}

      {!loading && kpis.feesReceived > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setFeesOpen((s) => !s)}
            aria-expanded={feesOpen}
            aria-controls="fees-drill"
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <span>
              Fees &amp; charges (allocation, security, change of ownership, …):{' '}
              <span className="font-semibold tabular-nums text-slate-700">
                {formatNairaCompact(kpis.feesReceived)}
              </span>
              {' '}— surfaced separately, not folded into Received above.
            </span>
            <IconChevronDown
              className={[
                'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                feesOpen ? 'rotate-180 text-accent' : '',
              ].join(' ')}
            />
          </button>
          {feesOpen && (
            <div id="fees-drill">
              <DrillPanel title="Fees & charges by purpose">
                <BreakdownList
                  items={breakdowns.feesReceived.map((e) => ({
                    label: e.purposeName,
                    display: formatNairaCompact(e.amount),
                    weight: e.amount,
                  }))}
                  emptyMessage="No fee receipts in this range."
                />
              </DrillPanel>
            </div>
          )}
        </div>
      )}
    </PanelCard>
  );
}

function drillTitle(id: TileId): string {
  switch (id) {
    case 'plots': return 'Plots sold — by plot type';
    case 'payable': return 'Total payable — by plot type';
    case 'initial': return 'Initial received — by purpose';
    case 'further': return 'Further received — by purpose';
  }
}

function renderDrill(id: TileId, b: KpiBreakdowns) {
  switch (id) {
    case 'plots': {
      const items: BreakdownItem[] = b.plotsSold.map((e) => ({
        label: e.plotTypeName,
        display: `${formatNumber(e.count)} ${e.count === 1 ? 'plot' : 'plots'}`,
        weight: e.count,
      }));
      return <BreakdownList items={items} emptyMessage="No plots in this range." />;
    }
    case 'payable': {
      const items: BreakdownItem[] = b.totalPayable.map((e) => ({
        label: `${e.plotTypeName} (${formatNumber(e.count)})`,
        display: formatNairaCompact(e.payable),
        weight: e.payable,
      }));
      return <BreakdownList items={items} emptyMessage="No payable contracts in this range." />;
    }
    case 'initial': {
      const items: BreakdownItem[] = b.initialReceived.map((e) => ({
        label: e.purposeName,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No Initial / Outright receipts in this range." />;
    }
    case 'further': {
      const items: BreakdownItem[] = b.furtherReceived.map((e) => ({
        label: e.purposeName,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No Further / Balance receipts in this range." />;
    }
  }
}

function freshest(s: SalesPanelSources): string | null {
  const a = s.bankDepositRefreshedAt;
  const b = s.plotSalesRefreshedAt;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

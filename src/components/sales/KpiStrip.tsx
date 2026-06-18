import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronDown } from '../icons';
import { BreakdownList, type BreakdownItem } from './BreakdownList';
import { DrillPanel } from './DrillPanel';
import { TxnDetailList, type TxnDetailRow } from './TxnDetailList';
import { formatNaira, formatNairaCompact, formatNumber, formatPersonName, formatAsOf } from '../../lib/format';
import type {
  KpiBreakdowns,
  KpiTransactions,
  SalesKpis,
  SalesPanelSources,
  SalesTxnDetail,
} from '../../lib/queries/sales';

type TileId = 'total' | 'plots' | 'payable' | 'initial' | 'further';

type Tile = {
  id: TileId;
  label: string;
  value: string;
  hint: string;
};

export function KpiStrip({
  kpis,
  breakdowns,
  transactions,
  sources,
  loading,
}: {
  kpis: SalesKpis;
  breakdowns: KpiBreakdowns;
  transactions: KpiTransactions;
  sources: SalesPanelSources;
  loading: boolean;
}) {
  const [open, setOpen] = useState<TileId | null>(null);
  const [feesOpen, setFeesOpen] = useState(false);
  const toggle = (id: TileId) => setOpen((cur) => (cur === id ? null : id));

  const heroOpen = open === 'total';

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
      subtitle="Tap a tile for the breakdown — and the transactions — behind it."
      right={asOf ? <StatusChip tone="slate">As of {formatAsOf(asOf)}</StatusChip> : undefined}
      source="Bank Deposit, LAND tab (received) • Weekly Sales tab (payable + plot count). Fees & charges shown separately on the panel."
    >
      <button
        type="button"
        onClick={() => toggle('total')}
        disabled={loading}
        aria-expanded={heroOpen}
        aria-controls="kpi-drill"
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
            Total revenue inflow
          </span>
          <IconChevronDown
            className={[
              'h-4 w-4 shrink-0 text-accent transition-transform',
              heroOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
        </div>
        <div className="mt-1 font-heading text-3xl font-bold tabular-nums text-slate-900 md:text-4xl">
          {loading ? '—' : formatNairaCompact(kpis.totalRevenueInflow)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Initial + Further + Fees received (Bank Deposit, LAND tab)
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
            {(() => {
              const rows = txnRowsFor(open, transactions);
              return rows && rows.length > 0 ? <KpiTxnDetails key={open} rows={rows} /> : null;
            })()}
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
    case 'total':   return 'Total revenue inflow — by stage';
    case 'plots':   return 'Plots sold — by plot type';
    case 'payable': return 'Total payable — by plot type';
    case 'initial': return 'Initial received — by purpose';
    case 'further': return 'Further received — by purpose';
  }
}

function renderDrill(id: TileId, b: KpiBreakdowns) {
  switch (id) {
    case 'total': {
      const items: BreakdownItem[] = b.totalRevenueInflow.map((e) => ({
        label: e.label,
        display: formatNairaCompact(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No receipts in this range." />;
    }
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

// Maps a tile's transaction list into display rows. Returns null for tiles that
// have no per-row source (the hero "Total" tile, whose detail is the by-stage
// split plus the separately-surfaced fees).
function txnRowsFor(id: TileId, t: KpiTransactions): TxnDetailRow[] | null {
  switch (id) {
    case 'plots':
      return t.weeklySales.map((x, i) => ({
        key: `ws-${i}`,
        date: x.date,
        title: x.customerName?.trim() || '—',
        value: `${formatNumber(x.plotCount ?? 0)} ${(x.plotCount ?? 0) === 1 ? 'plot' : 'plots'}`,
        meta: metaOf(x),
      }));
    case 'payable':
      return t.weeklySales.map((x, i) => ({
        key: `ws-${i}`,
        date: x.date,
        title: x.customerName?.trim() || '—',
        value: formatNaira(x.amount),
        meta: metaOf(x),
      }));
    case 'initial':
      return t.initialReceived.map((x, i) => ({
        key: `in-${i}`,
        date: x.date,
        title: x.customerName?.trim() || '—',
        value: formatNaira(x.amount),
        meta: metaOf(x),
      }));
    case 'further':
      return t.furtherReceived.map((x, i) => ({
        key: `fu-${i}`,
        date: x.date,
        title: x.customerName?.trim() || '—',
        value: formatNaira(x.amount),
        meta: metaOf(x),
      }));
    case 'total':
      return null;
  }
}

function metaOf(x: SalesTxnDetail): string[] {
  return [
    x.salesPerson ? formatPersonName(x.salesPerson) : '',
    x.locationName ?? '',
    x.detail ?? '',
  ].filter(Boolean);
}

// Collapsible transaction list under a KPI breakdown. Defaults closed so the
// drill opens to the summary; one tap reveals the underlying rows for a
// presentation. Remounted per tile via `key` so the open state resets cleanly.
function KpiTxnDetails({ rows }: { rows: TxnDetailRow[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
      >
        <IconChevronDown
          className={['h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : ''].join(' ')}
        />
        {expanded
          ? 'Hide transactions'
          : `Show ${rows.length} transaction${rows.length === 1 ? '' : 's'}`}
      </button>
      {expanded && <TxnDetailList rows={rows} />}
    </div>
  );
}

function freshest(s: SalesPanelSources): string | null {
  const a = s.bankDepositRefreshedAt;
  const b = s.plotSalesRefreshedAt;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

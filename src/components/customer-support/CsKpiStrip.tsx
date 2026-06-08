import { useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronDown } from '../icons';
import { BreakdownList, type BreakdownItem } from '../sales/BreakdownList';
import { DrillPanel } from '../sales/DrillPanel';
import {
  formatNumber,
  formatAsOf,
  formatMonthYear,
} from '../../lib/format';
import type {
  CsKpiBreakdowns,
  CsKpis,
  CsPanelSources,
} from '../../lib/queries/customerSupport';

type TileId = 'total' | 'resolved' | 'unresolved' | 'rate';

type Tile = {
  id: TileId;
  label: string;
  value: string;
  hint: string;
};

export function CsKpiStrip({
  kpis,
  breakdowns,
  sources,
  loading,
}: {
  kpis: CsKpis;
  breakdowns: CsKpiBreakdowns;
  sources: CsPanelSources;
  loading: boolean;
}) {
  const [open, setOpen] = useState<TileId | null>(null);
  const toggle = (id: TileId) => setOpen((cur) => (cur === id ? null : id));
  const heroOpen = open === 'total';
  const asOf = sources.logsUpdatedAt;

  const tiles: Tile[] = [
    {
      id: 'resolved',
      label: 'Resolved',
      value: loading ? '—' : formatNumber(kpis.resolved),
      hint: 'Resolved + Responded',
    },
    {
      id: 'unresolved',
      label: 'Unresolved',
      value: loading ? '—' : formatNumber(kpis.unresolved),
      hint: 'Pending + In progress',
    },
    {
      id: 'rate',
      label: 'Resolution rate',
      value: loading || kpis.totalLogs === 0 ? '—' : `${(kpis.resolutionRate * 100).toFixed(0)}%`,
      hint: loading ? '' : `${formatNumber(kpis.resolved)} of ${formatNumber(kpis.totalLogs)}`,
    },
  ];

  return (
    <PanelCard
      title="Customer Support summary"
      subtitle="Tap a tile for the breakdown that produced it."
      right={asOf ? <StatusChip tone="slate">As of {formatAsOf(asOf)}</StatusChip> : undefined}
      source='Source: customer_support_logs, counted as tickets (one per sheet row) by date of entry — matches the CX portal. Resolved = status exactly RESOLVED or RESPONDED; Unresolved = PENDING or IN PROGRESS; everything else (incl. composite/blank) is Other. Resolution rate = Resolved ÷ Total logs.'
    >
      <button
        type="button"
        onClick={() => toggle('total')}
        disabled={loading}
        aria-expanded={heroOpen}
        aria-controls="cs-kpi-drill"
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
            Total customer logs
          </span>
          <IconChevronDown
            className={[
              'h-4 w-4 shrink-0 text-accent transition-transform',
              heroOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
        </div>
        <div className="mt-1 font-heading text-3xl font-bold tabular-nums text-slate-900 md:text-4xl">
          {loading ? '—' : formatNumber(kpis.totalLogs)}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {formatNumber(kpis.resolved)} resolved · {formatNumber(kpis.unresolved)} unresolved
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {tiles.map((t) => {
          const isOpen = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              disabled={loading}
              aria-expanded={isOpen}
              aria-controls="cs-kpi-drill"
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
              <div className="mt-1 truncate text-[10px] text-slate-400">{t.hint}</div>
            </button>
          );
        })}
      </div>

      {!loading && open && (
        <div id="cs-kpi-drill">
          <DrillPanel title={drillTitle(open)}>
            {renderDrill(open, breakdowns, kpis)}
          </DrillPanel>
        </div>
      )}
    </PanelCard>
  );
}

function drillTitle(id: TileId): string {
  switch (id) {
    case 'total':      return 'Total logs — status composition';
    case 'resolved':   return 'Resolved — by rep';
    case 'unresolved': return 'Unresolved — by rep';
    case 'rate':       return 'Resolution rate — by month';
  }
}

function renderDrill(id: TileId, b: CsKpiBreakdowns, kpis: CsKpis) {
  switch (id) {
    case 'total': {
      const items: BreakdownItem[] = b.totalLogs.map((e) => ({
        label: e.label,
        display: formatNumber(e.amount),
        weight: e.amount,
      }));
      return <BreakdownList items={items} emptyMessage="No logs in this range." />;
    }
    case 'resolved': {
      const items: BreakdownItem[] = b.resolved
        .filter((e) => e.resolved > 0)
        .map((e) => ({
          label: e.name,
          display: `${formatNumber(e.resolved)} of ${formatNumber(e.total)}`,
          weight: e.resolved,
        }));
      return <BreakdownList items={items} emptyMessage="No resolved logs in this range." />;
    }
    case 'unresolved': {
      const items: BreakdownItem[] = b.unresolved
        .filter((e) => e.unresolved > 0)
        .map((e) => ({
          label: e.name,
          display: `${formatNumber(e.unresolved)} of ${formatNumber(e.total)}`,
          weight: e.unresolved,
        }));
      return <BreakdownList items={items} emptyMessage="No unresolved logs in this range." />;
    }
    case 'rate': {
      if (kpis.totalLogs === 0) {
        return <p className="text-xs text-slate-500">No logs in this range.</p>;
      }
      const items: BreakdownItem[] = b.resolutionRate.map((e) => ({
        label: formatMonthYear(e.month),
        display: e.total > 0
          ? `${(e.rate * 100).toFixed(0)}% (${formatNumber(e.resolved)} of ${formatNumber(e.total)})`
          : '— no logs',
        weight: e.rate * 100,
      }));
      return <BreakdownList items={items} emptyMessage="No months in this range." />;
    }
  }
}

import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNairaCompact, formatNumber, formatAsOf } from '../../lib/format';
import type { SalesKpis, SalesPanelSources } from '../../lib/queries/sales';

type Tile = {
  label: string;
  value: string;
  hint?: string;
};

export function KpiStrip({
  kpis,
  sources,
  loading,
}: {
  kpis: SalesKpis;
  sources: SalesPanelSources;
  loading: boolean;
}) {
  const tiles: Tile[] = [
    {
      label: 'Plots sold',
      value: loading ? '—' : formatNumber(kpis.plotsSold),
      hint: 'Weekly Sales',
    },
    {
      label: 'Total payable',
      value: loading ? '—' : formatNairaCompact(kpis.totalPayable),
      hint: 'Contract value',
    },
    {
      label: 'Initial received',
      value: loading ? '—' : formatNairaCompact(kpis.initialReceived),
      hint: 'Initial + Outright',
    },
    {
      label: 'Further received',
      value: loading ? '—' : formatNairaCompact(kpis.furtherReceived),
      hint: 'Further + Balance',
    },
  ];

  const asOf = freshest(sources);

  return (
    <PanelCard
      title="Sales summary"
      subtitle="Plots and revenue for the selected period"
      right={asOf ? <StatusChip tone="slate">As of {formatAsOf(asOf)}</StatusChip> : undefined}
      source="Bank Deposit 2026 LAND (received) • Weekly Sales 2026 (payable + plot count). Fees & charges shown separately on the panel."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 md:p-4"
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {t.label}
            </div>
            <div className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900 md:text-3xl">
              {t.value}
            </div>
            {t.hint && <div className="mt-1 text-[10px] text-slate-400">{t.hint}</div>}
          </div>
        ))}
      </div>
      {!loading && kpis.feesReceived > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Fees &amp; charges (allocation, security, change of ownership, …):{' '}
          <span className="font-semibold tabular-nums text-slate-700">
            {formatNairaCompact(kpis.feesReceived)}
          </span>
          {' '}— surfaced separately, not folded into Received above.
        </p>
      )}
    </PanelCard>
  );
}

function freshest(s: SalesPanelSources): string | null {
  const a = s.bankDepositRefreshedAt;
  const b = s.plotSalesRefreshedAt;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

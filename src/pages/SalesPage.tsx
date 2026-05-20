import { useEffect, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';
import { KpiStrip } from '../components/sales/KpiStrip';
import { MoMChart } from '../components/sales/MoMChart';
import { PlotSizePivot } from '../components/sales/PlotSizePivot';
import { RevenueByLocation } from '../components/sales/RevenueByLocation';
import { useDateRange } from '../hooks/useDateRange';
import {
  loadPurposeStages,
  loadSalesPanelData,
  type PurposeStages,
  type SalesPanelData,
} from '../lib/queries/sales';

export default function SalesPage() {
  const { range } = useDateRange();
  const [stages, setStages] = useState<PurposeStages | null>(null);
  const [data, setData] = useState<SalesPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPurposeStages()
      .then((s) => {
        if (!cancelled) setStages(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stages) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSalesPanelData(range, stages)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, stages]);

  const kpis = data?.kpis ?? {
    plotsSold: 0,
    totalPayable: 0,
    initialReceived: 0,
    furtherReceived: 0,
    feesReceived: 0,
  };
  const monthly = data?.monthly ?? [];
  const pivot = data?.pivot ?? [];
  const byLocation = data?.byLocation ?? [];
  const sources = data?.sources ?? {
    bankDepositRefreshedAt: null,
    plotSalesRefreshedAt: null,
  };

  return (
    <>
      <SectionHeading title="Sales (Land)" subtitle="Plots, revenue, realtor attribution" />

      <div className="grid gap-4 md:gap-5">
        {error && (
          <StatusBanner tone="pending" title="Could not load sales data">
            {error}
          </StatusBanner>
        )}

        <KpiStrip kpis={kpis} sources={sources} loading={loading} />
        <MoMChart monthly={monthly} loading={loading} />
        <PlotSizePivot pivot={pivot} loading={loading} />
        <RevenueByLocation rows={byLocation} loading={loading} />

        <PlaceholderCard
          title="Quarter pair (Q1 vs Q2)"
          description="Paired horizontal bars per location — Commit 3."
        >
          <div className="grid h-32 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
            Coming next
          </div>
        </PlaceholderCard>

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <PlaceholderCard
            title="OneApp Customer Interaction"
            description="Awaiting AWS API access (Phase 2)."
          >
            <div className="grid h-24 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
              Data source pending
            </div>
          </PlaceholderCard>
          <PlaceholderCard
            title="Year-on-year (2024 vs 2025)"
            description="2025 source data not yet ingested."
          >
            <div className="grid h-24 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
              Data source pending
            </div>
          </PlaceholderCard>
          <PlaceholderCard
            title="Realtor sale tiers"
            description="Per-customer realtor attribution pending."
          >
            <div className="grid h-24 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
              Data source pending
            </div>
          </PlaceholderCard>
        </div>
      </div>
    </>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

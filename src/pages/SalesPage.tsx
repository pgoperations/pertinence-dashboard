import { useEffect, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { KpiStrip } from '../components/sales/KpiStrip';
import { MoMChart } from '../components/sales/MoMChart';
import { PlotSizePivot } from '../components/sales/PlotSizePivot';
import { RevenueByLocation } from '../components/sales/RevenueByLocation';
import { QuarterPair } from '../components/sales/QuarterPair';
import { TopRealtors } from '../components/sales/TopRealtors';
import { TopDeals } from '../components/sales/TopDeals';
import { WeeklyDetail } from '../components/sales/WeeklyDetail';
import { GreyedCard } from '../components/sales/GreyedCard';
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
    totalRevenueInflow: 0,
  };
  const kpiBreakdowns = data?.kpiBreakdowns ?? {
    plotsSold: [],
    totalPayable: [],
    initialReceived: [],
    furtherReceived: [],
    feesReceived: [],
    totalRevenueInflow: [],
  };
  const monthly = data?.monthly ?? [];
  const pivot = data?.pivot ?? [];
  const byLocation = data?.byLocation ?? [];
  const byLocationOtherReceived = data?.byLocationOtherReceived ?? 0;
  const byLocationOtherDealCount = data?.byLocationOtherDealCount ?? 0;
  const topRealtors = data?.topRealtors ?? [];
  const topDeals = data?.topDeals ?? [];
  const weeks = data?.weeks ?? [];
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

        <KpiStrip
          kpis={kpis}
          breakdowns={kpiBreakdowns}
          sources={sources}
          loading={loading}
        />
        <MoMChart monthly={monthly} loading={loading} />
        <PlotSizePivot pivot={pivot} loading={loading} />
        <RevenueByLocation
          rows={byLocation}
          otherReceived={byLocationOtherReceived}
          otherDealCount={byLocationOtherDealCount}
          loading={loading}
        />

        <QuarterPair
          rows={byLocation}
          loading={loading}
          year={Number(range.to.slice(0, 4))}
        />

        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <TopRealtors realtors={topRealtors} loading={loading} />
          <TopDeals deals={topDeals} loading={loading} />
        </div>

        <WeeklyDetail weeks={weeks} loading={loading} />

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <GreyedCard
            title="OneApp Customer Interaction"
            blocker="Awaiting AWS API access (Phase 2)."
          />
          <GreyedCard
            title="Year-on-year (2024 vs 2025)"
            blocker="2025 source data not yet ingested."
          />
          <GreyedCard
            title="Realtor sale tiers"
            blocker="Per-customer realtor attribution pending — sub-1M / 1–5M / 5–10M tiers from H1 PDF."
          />
        </div>
      </div>
    </>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

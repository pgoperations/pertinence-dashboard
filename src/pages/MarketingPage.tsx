import { useEffect, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';
import { MarketingKpiStrip } from '../components/marketing/MarketingKpiStrip';
import { SpendByCategory } from '../components/marketing/SpendByCategory';
import { useDateRange } from '../hooks/useDateRange';
import {
  loadMarketingPanelData,
  type MarketingPanelData,
} from '../lib/queries/marketing';

export default function MarketingPage() {
  const { range } = useDateRange();
  const [data, setData] = useState<MarketingPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadMarketingPanelData(range)
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
  }, [range]);

  const kpis = data?.kpis ?? {
    totalSpend: 0,
    categoriesActive: 0,
    busiestMonth: null,
    avgMonthlySpend: 0,
    monthsObserved: 0,
  };
  const kpiBreakdowns = data?.kpiBreakdowns ?? {
    totalSpend: [],
    categoriesActive: [],
    busiestMonth: [],
    avgMonthlySpend: [],
  };
  const byCategory = data?.byCategory ?? [];
  const largestCategory = byCategory[0]
    ? { name: byCategory[0].categoryName, amount: byCategory[0].amount }
    : null;
  const sources = data?.sources ?? {
    marketingMonthlyRefreshedAt: null,
    marketingExpensesUpdatedAt: null,
  };

  return (
    <>
      <SectionHeading title="Marketing" subtitle="Spend by category and month" />

      <div className="grid gap-4 md:gap-5">
        {error && (
          <StatusBanner tone="pending" title="Could not load marketing data">
            {error}
          </StatusBanner>
        )}

        <MarketingKpiStrip
          kpis={kpis}
          breakdowns={kpiBreakdowns}
          largestCategory={largestCategory}
          sources={sources}
          loading={loading}
        />

        <SpendByCategory
          rows={byCategory}
          fallbackCount={data?.fallbackCount ?? 0}
          totalRowCount={data?.totalRowCount ?? 0}
          loading={loading}
        />

        <PlaceholderCard
          title="Monthly spend trend"
          description="Coming in Commit 2 — Recharts bars with per-month drill into the category split."
        >
          <div className="h-32 rounded-lg bg-brand-100" aria-hidden />
        </PlaceholderCard>

        <PlaceholderCard
          title="Out-of-scope (greyed)"
          description="Coming in Commit 2 — Billboard cost, Activities-with-metrics table, Income side. Each card names its specific blocker."
        >
          <div className="h-20 rounded-lg bg-brand-100" aria-hidden />
        </PlaceholderCard>
      </div>
    </>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

import { useEffect, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { MarketingKpiStrip } from '../components/marketing/MarketingKpiStrip';
import { SpendByCategory } from '../components/marketing/SpendByCategory';
import { MonthlySpendChart } from '../components/marketing/MonthlySpendChart';
import { GreyedCard } from '../components/sales/GreyedCard';
import { useDateRange } from '../hooks/useDateRange';
import { useRefresh } from '../hooks/useRefresh';
import {
  loadMarketingPanelData,
  type MarketingPanelData,
} from '../lib/queries/marketing';

export default function MarketingPage() {
  const { range } = useDateRange();
  const { counter: refreshCounter } = useRefresh();
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
  }, [range, refreshCounter]);

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
  const monthly = data?.monthly ?? [];
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

        <MonthlySpendChart monthly={monthly} loading={loading} />

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <GreyedCard
            title="Billboard cost"
            blocker="Finance-funded outside the petty cashbook (₦19.95M H1 2025 ref: Ajah ₦13.5M + Egbeda ₦6.45M). Manual-entry form pending."
          />
          <GreyedCard
            title="Activities with metrics"
            blocker="Activity × month × expense × attendance/recruitment table from H1 2025 PDF. Needs a structured activity log — manual-entry form pending."
          />
          <GreyedCard
            title="Income side"
            blocker="Petty cashbook receipts (Balance b/f, transfers) excluded from v1 ingest. Manual reconciliation required."
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

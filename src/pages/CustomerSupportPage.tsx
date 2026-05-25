import { useEffect, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';
import { BrandToggle } from '../components/customer-support/BrandToggle';
import { CsKpiStrip } from '../components/customer-support/CsKpiStrip';
import { EnquiriesByChannel } from '../components/customer-support/EnquiriesByChannel';
import { ComplaintsByCategory } from '../components/customer-support/ComplaintsByCategory';
import { useDateRange } from '../hooks/useDateRange';
import {
  loadCsPanelData,
  type BrandFilter,
  type CsPanelData,
} from '../lib/queries/customerSupport';

export default function CustomerSupportPage() {
  const { range } = useDateRange();
  const [brand, setBrand] = useState<BrandFilter>('ppl');
  const [data, setData] = useState<CsPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCsPanelData(range, brand)
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
  }, [range, brand]);

  const kpis = data?.kpis ?? {
    totalLogs: 0,
    enquiries: 0,
    complaints: 0,
    resolvedComplaints: 0,
    resolutionRate: 0,
  };
  const kpiBreakdowns = data?.kpiBreakdowns ?? {
    totalLogs: [],
    enquiries: [],
    complaints: [],
    resolvedComplaints: [],
    resolutionRate: [],
  };
  const byChannel = data?.byChannel ?? [];
  const byCategory = data?.byCategory ?? [];
  const sources = data?.sources ?? { logsUpdatedAt: null };
  const brands = data?.brands ?? [];

  return (
    <>
      <SectionHeading title="Customer Support" subtitle="Enquiries, complaints, resolution" />

      <div className="grid gap-4 md:gap-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Brand filter applies to every card below. PPL default mirrors the H1 PDF.
          </p>
          <BrandToggle
            brands={brands}
            value={brand}
            onChange={setBrand}
            disabled={loading && brands.length === 0}
          />
        </div>

        {error && (
          <StatusBanner tone="pending" title="Could not load customer support data">
            {error}
          </StatusBanner>
        )}

        <CsKpiStrip
          kpis={kpis}
          breakdowns={kpiBreakdowns}
          sources={sources}
          loading={loading}
        />

        <EnquiriesByChannel rows={byChannel} loading={loading} />

        <ComplaintsByCategory rows={byCategory} loading={loading} />

        <PlaceholderCard
          title="Monthly trend"
          description="Coming in Commit 2 — enquiries vs complaints bars per month with per-bar drill into that month's channel + category split."
        >
          <div className="h-32 rounded-lg bg-brand-100" aria-hidden />
        </PlaceholderCard>

        <PlaceholderCard
          title="Out-of-scope (greyed)"
          description="Coming in Commit 2 — Avg resolution time, Per-rep breakdown, Customer satisfaction score. Each names its specific source gap."
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

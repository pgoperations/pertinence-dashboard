import { useEffect, useMemo, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { NarrativeCard } from '../components/NarrativeCard';
import { buildCustomerSupportNarrative } from '../lib/narrative';
import { BrandToggle } from '../components/customer-support/BrandToggle';
import { CsKpiStrip } from '../components/customer-support/CsKpiStrip';
import { EnquiriesByChannel } from '../components/customer-support/EnquiriesByChannel';
import { ComplaintsByCategory } from '../components/customer-support/ComplaintsByCategory';
import { CsMonthlyTrend } from '../components/customer-support/CsMonthlyTrend';
import { GreyedCard } from '../components/sales/GreyedCard';
import { useDateRange } from '../hooks/useDateRange';
import { useRefresh } from '../hooks/useRefresh';
import {
  loadCsPanelData,
  type BrandFilter,
  type CsPanelData,
} from '../lib/queries/customerSupport';

export default function CustomerSupportPage() {
  const { range } = useDateRange();
  const { counter: refreshCounter } = useRefresh();
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
  }, [range, brand, refreshCounter]);

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
  const monthly = data?.monthly ?? [];
  const sources = data?.sources ?? { logsUpdatedAt: null };
  const brands = data?.brands ?? [];

  const narrative = useMemo(
    () => (data ? buildCustomerSupportNarrative(data, range) : null),
    [data, range],
  );

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

        <NarrativeCard narrative={narrative} loading={loading} />

        <EnquiriesByChannel rows={byChannel} loading={loading} />

        <ComplaintsByCategory rows={byCategory} loading={loading} />

        <CsMonthlyTrend monthly={monthly} loading={loading} />

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <GreyedCard
            title="Avg resolution time"
            blocker="Resolution-time fields (cols O–Q on each rep tab) need supervisor input on time-zone / business-hours math. Migration 014 sets avg_resolution_minutes to NULL until that decision lands."
          />
          <GreyedCard
            title="Per-rep breakdown"
            blocker="Per-rep metrics (Catherine / Mariam / Mary / Yetunde / Lovinal) — currently aggregated to brand level. Phase 2 candidate once the supervisor confirms the configurable roster."
          />
          <GreyedCard
            title="Customer satisfaction"
            blocker="No CSAT survey source today. Manual-entry form or post-resolution survey pending."
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

import { useEffect, useMemo, useState } from 'react';
import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { StatusChip } from '../components/StatusChip';
import { NarrativeCard } from '../components/NarrativeCard';
import { buildRealtorNarrative } from '../lib/narrative';
import { GreyedCard } from '../components/sales/GreyedCard';
import { MetricMonthlyTable } from '../components/realtor-management/MetricMonthlyTable';
import { RealtorMonthlyTrend } from '../components/realtor-management/RealtorMonthlyTrend';
import { useDateRange } from '../hooks/useDateRange';
import { useRefresh } from '../hooks/useRefresh';
import { formatAsOf } from '../lib/format';
import {
  loadRealtorPanelData,
  type RealtorPanelData,
} from '../lib/queries/realtor';

// Realtor Management v1 panel — aggregate-only metrics from the 2026
// Realtors Managers Weekly Report tab. Per-manager performance (Mrs Kemi /
// Richard Makava / Debbie) is Phase 2 — see DESIGN_DECISIONS.md.

export default function RealtorManagementPage() {
  const { range } = useDateRange();
  const { counter: refreshCounter } = useRefresh();
  const [data, setData] = useState<RealtorPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRealtorPanelData(range)
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

  const recruitment = data?.recruitment ?? [];
  const activity = data?.activity ?? [];
  const monthlyTrend = data?.monthlyTrend ?? [];
  const mismatchCount = data?.mismatchCount ?? 0;
  const latestUpdatedAt = data?.sources.latestUpdatedAt ?? null;

  const sourceLine = `Source: realtor_metrics_monthly · refreshed ${formatAsOf(latestUpdatedAt)}`;

  const narrative = useMemo(
    () => (data ? buildRealtorNarrative(data, range) : null),
    [data, range],
  );

  return (
    <>
      <SectionHeading title="Realtor Management" subtitle="Recruitment, activity, performance" />

      <div className="grid gap-4 md:gap-5">
        {error && (
          <StatusBanner tone="pending" title="Could not load realtor data">
            {error}
          </StatusBanner>
        )}

        {!loading && !error && data && data.monthsObserved === 0 && (
          <StatusBanner tone="pending" title="No data in this range">
            Try widening the date range — the 2026 source tab currently has Jan–Apr
            populated. Per-manager performance (Mrs Kemi / Richard Makava / Debbie)
            remains v1-out-of-scope per DESIGN_DECISIONS.
          </StatusBanner>
        )}

        {/* Narrative only when there's data — the banner above covers the empty case. */}
        {(loading || (data && data.monthsObserved > 0)) && (
          <NarrativeCard narrative={narrative} loading={loading} />
        )}

        <MetricMonthlyTable
          title="Recruitment metrics"
          subtitle="Monthly aggregates from the wide weekly pivot. New Realtors = referrals + business reps."
          rows={recruitment}
          source={sourceLine}
          right={
            mismatchCount > 0 ? (
              <StatusChip tone="amber">
                {mismatchCount} total mismatch{mismatchCount === 1 ? '' : 'es'}
              </StatusChip>
            ) : undefined
          }
        />

        <MetricMonthlyTable
          title="Activity measurement"
          subtitle="Weekly Realtor Meeting merges Master Class 1 + 2 — tap the row to see the split. Stakeholders Meeting stays separate."
          rows={activity}
          source={sourceLine}
        />

        <RealtorMonthlyTrend
          monthly={monthlyTrend}
          recruitment={recruitment}
          activity={activity}
        />

        <div>
          <h2 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wide text-slate-600 md:text-base">
            Out of v1 scope
          </h2>
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            <GreyedCard
              title="Per-manager performance"
              blocker="Mrs Kemi / Richard Makava / Debbie tables only existed in the H1 2025 PDF as one-off MAY/JUNE snapshots. Recurring source does not exist — Phase 2 candidate once supervisor commits to a manual-entry or OneApp pull."
            />
            <GreyedCard
              title="Newly onboarded realtors — Digital Ad"
              blocker="Sub-panel only existed for MAY/JUNE 2025 in the H1 PDF (digital-ad acquisition cohort). No recurring tracking — deferred until a source appears."
            />
            <GreyedCard
              title="OneApp prospect interactions"
              blocker="Customer-to-Prospect ratio (27:95) and Conversion Rate (28.4%) from the H1 PDF are AWS-backed. Phase 2 once API access lands — same blocker as Sales OneApp card."
            />
          </div>
        </div>
      </div>
    </>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

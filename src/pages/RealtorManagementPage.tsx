import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PendingPanelCard } from '../components/realtor-management/PendingPanelCard';
import { GreyedCard } from '../components/sales/GreyedCard';

// Realtor Management v1 panel — honest placeholders.
//
// Two reasons for the all-placeholder state today:
//   1. The realtor_manager_weekly ingest is scaffolded but not deployed
//      (PROGRESS.md "Open items": pending per-manager attribution question +
//      sheet-id secret push). When it lands, the three "ingest pending" cards
//      below will start showing real numbers.
//   2. Per DESIGN_DECISIONS.md (2026-05-14 lock), v1 scope is aggregate-only.
//      The 2026 source tab is a wide weekly pivot with no per-manager
//      columns — the H1 PDF's per-manager tables (Mrs Kemi / Richard Makava /
//      Debbie) were one-off snapshots for MAY/JUNE 2025 only. Per-manager UI
//      is Phase 2 once a recurring source appears.
//
// The two visual treatments are deliberate:
//   * PendingPanelCard (amber): metrics that WILL appear when ingest deploys.
//   * GreyedCard      (slate):  metrics that are PERMANENTLY out of v1 scope.
// The supervisor sees at a glance what's coming vs what's deferred.

export default function RealtorManagementPage() {
  return (
    <>
      <SectionHeading title="Realtor Management" subtitle="Recruitment, activity, performance" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="pending" title="Panel pending ingest deployment">
          The <code className="font-mono text-[12px]">realtor_manager_weekly</code> ingest is
          scaffolded but not yet deployed against the 2026 source tab. Cards below show what
          will render once it lands. v1 scope is aggregate-only — per-manager performance
          (Mrs Kemi / Richard Makava / Debbie) is Phase 2.
        </StatusBanner>

        <div>
          <h2 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wide text-slate-600 md:text-base">
            Ships when ingest deploys
          </h2>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            <PendingPanelCard
              title="Recruitment metrics"
              description="Monthly aggregate counts from the wide weekly pivot. Mirrors the H1 PDF Recruitment Metrics table."
              metrics={[
                'Number of New Realtors (Referrals + Business Reps)',
                'Number of New Referrals',
                'Number of New Business Reps',
                'Number of Realtors that Recruited (any)',
                'Number of Realtors that Recruited Referrals',
                'Number of Realtors that Recruited Business Reps',
              ]}
            />
            <PendingPanelCard
              title="Activity measurement"
              description="Attendance metrics. Mirrors the H1 PDF Realtor Activity Measurement block."
              metrics={[
                'Realtor Corner — attendance per month',
                'Stakeholders Meeting — attendance per month',
              ]}
            />
          </div>
          <div className="mt-4 md:mt-5">
            <PendingPanelCard
              title="Monthly trend"
              description="Bar/line chart over the selected date range. Same drill-down pattern as Sales / Marketing / Customer Support — tap a month for the metric breakdown."
              metrics={[
                'Stacked bars per month: New Realtors / New Referrals / New Business Reps',
                'Per-bar click reveals all 6 recruitment metrics + both activity metrics that month',
              ]}
            />
          </div>
        </div>

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

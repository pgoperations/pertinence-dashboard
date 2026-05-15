import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';

export default function RealtorManagementPage() {
  return (
    <>
      <SectionHeading title="Realtor Management" subtitle="Recruitment, attendance, performance" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="pending" title="Ingest pending">
          The 2026 Realtor Managers Weekly Report tab exists with three month blocks (Jan–Mar)
          but carries aggregate-only metrics. v1 ships aggregate-only — per-manager performance
          is a Phase 2 UI item once a per-manager source appears.
        </StatusBanner>

        <PlaceholderCard
          title="Newly onboarded realtors – Digital Ad"
          description="Only existed for May/Jun 2025 in the source PDF. Out of scope for v1."
        >
          <div className="grid h-32 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
            Data source pending
          </div>
        </PlaceholderCard>
      </div>
    </>
  );
}

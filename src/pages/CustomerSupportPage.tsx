import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';

export default function CustomerSupportPage() {
  return (
    <>
      <SectionHeading title="Customer Support" subtitle="Enquiries, complaints, resolution" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="ready" title="Customer Support ingest live">
          10,763 log rows across 5 active reps, all complaint values matched canonical aliases on
          first run. Brand filter defaults to PPL; toggle for RealVest or all.
        </StatusBanner>

        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <PlaceholderCard title="Enquiries by channel" description="Bar chart, all brands by default.">
            <div className="h-40 rounded-lg bg-brand-100" aria-hidden />
          </PlaceholderCard>
          <PlaceholderCard
            title="Complaints by category"
            description="60 canonical categories. Composites split into rows."
          >
            <div className="h-40 rounded-lg bg-brand-100" aria-hidden />
          </PlaceholderCard>
        </div>
      </div>
    </>
  );
}

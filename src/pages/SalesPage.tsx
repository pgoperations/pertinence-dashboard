import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';

export default function SalesPage() {
  return (
    <>
      <SectionHeading title="Sales (Land)" subtitle="Plots, revenue, realtor attribution" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="ready" title="Bank Deposit ingest live">
          448 transactions ingested across 126 location-month buckets. Weekly Sales and Customer
          File ingests pending — needed before plot counts and customer-level sales appear.
        </StatusBanner>

        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <PlaceholderCard
            title="Revenue by location"
            description="From Bank Deposit 2026 LAND — the financial source of truth."
          >
            <div className="h-40 rounded-lg bg-brand-100" aria-hidden />
          </PlaceholderCard>
          <PlaceholderCard
            title="Plots sold by location × size"
            description="From Weekly Sales — pending ingest."
          >
            <div className="grid h-40 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
              Data source pending
            </div>
          </PlaceholderCard>
        </div>

        <PlaceholderCard
          title="OneApp performance"
          description="AWS-backed. Phase 2."
        >
          <div className="grid h-32 place-items-center rounded-lg bg-brand-100 text-xs text-brand-500">
            Data source pending
          </div>
        </PlaceholderCard>
      </div>
    </>
  );
}

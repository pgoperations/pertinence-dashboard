import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';

export default function MarketingPage() {
  return (
    <>
      <SectionHeading title="Marketing" subtitle="Spend by category and month" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="ready" title="Marketing Expense ingest live">
          94 expense rows across Jan–May 2026. Every 2026 row is keyword-fallback-categorized
          today — the supervisor has not backfilled the new Category dropdown yet.
        </StatusBanner>

        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <PlaceholderCard title="Spend by category" description="Donut + table side-by-side.">
            <div className="h-40 rounded-lg bg-brand-100" aria-hidden />
          </PlaceholderCard>
          <PlaceholderCard title="Monthly spend trend" description="From marketing_monthly aggregate.">
            <div className="h-40 rounded-lg bg-brand-100" aria-hidden />
          </PlaceholderCard>
        </div>
      </div>
    </>
  );
}

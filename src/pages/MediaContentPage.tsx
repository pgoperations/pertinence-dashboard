import { SectionHeading } from '../components/SectionHeading';
import { StatusBanner } from '../components/StatusBanner';
import { PlaceholderCard } from '../components/PlaceholderCard';

export default function MediaContentPage() {
  return (
    <>
      <SectionHeading title="Media & Content" subtitle="Per-brand × per-platform metrics" />

      <div className="grid gap-4 md:gap-5">
        <StatusBanner tone="pending" title="Manual entry — not yet wired">
          Phase 1 collects metrics through a manual entry form for the four brands (PG, PPL,
          RealVest, Genius). Social media APIs land in Phase 2.
        </StatusBanner>

        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <PlaceholderCard title="PG (FB / IG / YT)" description="Manual entry pending." />
          <PlaceholderCard title="PPL (FB / IG)" description="Manual entry pending." />
          <PlaceholderCard title="RealVest (FB / IG)" description="Manual entry pending." />
          <PlaceholderCard title="Genius (IG only)" description="Manual entry pending." />
        </div>
      </div>
    </>
  );
}

import { SectionHeading } from '../components/SectionHeading';
import { MediaPanel } from '../components/media/MediaPanel';

export default function MediaContentPage() {
  return (
    <>
      <SectionHeading
        title="Media & Content"
        subtitle="Per-brand × per-platform weekly metrics"
      />
      <MediaPanel />
    </>
  );
}

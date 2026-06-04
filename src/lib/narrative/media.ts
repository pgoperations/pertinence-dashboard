import { formatNumber } from '../format';
import type {
  BrandSummary,
  MediaPlatform,
  PlatformMetricSummary,
} from '../queries/media';
import type { DateRange } from '../../types/date-range';
import type { NarrativePoint, SectionNarrative } from './types';
import { emptyNarrative, rangeLabel } from './helpers';

const PLATFORM_NAME: Record<MediaPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

// Per-platform "headline" metric preference — falls back to the largest-value
// metric when none of the preferred keywords is present.
const PREFERRED: Record<MediaPlatform, RegExp> = {
  facebook: /reach/i,
  instagram: /reach/i,
  youtube: /view/i,
};

function primaryMetric(
  platform: MediaPlatform,
  metrics: PlatformMetricSummary[],
): PlatformMetricSummary | null {
  if (metrics.length === 0) return null;
  const preferred = metrics.find(
    (m) => PREFERRED[platform].test(m.metricKey) || PREFERRED[platform].test(m.displayName),
  );
  if (preferred) return preferred;
  return [...metrics].sort((a, b) => b.value - a.value)[0];
}

export function buildMediaNarrative(
  summary: BrandSummary | null,
  brandName: string,
  range: DateRange,
  asOf: string | null,
): SectionNarrative {
  const platforms = summary?.platforms ?? [];
  const hasAny = platforms.some((p) => p.metrics.length > 0);

  if (!hasAny) {
    return emptyNarrative(asOf);
  }

  const headline =
    `Social activity for ${brandName} across ${rangeLabel(range)}, summarized over ` +
    `Facebook, Instagram and YouTube.`;

  const points: NarrativePoint[] = [];

  for (const ps of platforms) {
    const m = primaryMetric(ps.platform, ps.metrics);
    if (!m) continue;
    points.push({
      text: `${PLATFORM_NAME[ps.platform]} — ${m.displayName}: ${formatNumber(m.value)}.`,
    });
  }

  const caveats: NarrativePoint[] = [];
  caveats.push({
    text: `Weekly grid only — the per-month summary block and YouTube Monetization Report are out of v1 scope.`,
  });
  if (brandName === 'All brands') {
    caveats.push({
      text: `"All brands" sums across every brand; tap a brand chip to scope the figures.`,
    });
  }

  return { headline, points, caveats, asOf };
}

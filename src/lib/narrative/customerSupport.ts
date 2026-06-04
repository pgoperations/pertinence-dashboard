import { formatNumber } from '../format';
import type { BrandFilter, CsPanelData } from '../queries/customerSupport';
import type { DateRange } from '../../types/date-range';
import type { NarrativePoint, SectionNarrative } from './types';
import { emptyNarrative, mostRecent, plural, rangeLabel } from './helpers';

const BRAND_LABEL: Record<BrandFilter, string> = {
  ppl: 'PPL',
  realvest: 'RealVest',
  all: 'all brands',
};

export function buildCustomerSupportNarrative(
  data: CsPanelData,
  range: DateRange,
): SectionNarrative {
  const { kpis, byChannel, byCategory, appliedBrand } = data;
  const asOf = mostRecent(data.sources.logsUpdatedAt);
  const brandLabel = BRAND_LABEL[appliedBrand];

  if (kpis.totalLogs === 0) {
    return emptyNarrative(asOf);
  }

  const headline =
    `${formatNumber(kpis.totalLogs)} support ${plural(kpis.totalLogs, 'log')} for ${brandLabel} ` +
    `across ${rangeLabel(range)}: ${formatNumber(kpis.enquiries)} ${plural(kpis.enquiries, 'enquiry', 'enquiries')} ` +
    `and ${formatNumber(kpis.complaints)} ${plural(kpis.complaints, 'complaint')}.`;

  const points: NarrativePoint[] = [];

  if (kpis.complaints > 0) {
    const rate = Math.round(kpis.resolutionRate * 100);
    points.push({
      text: `${rate}% of complaints were resolved (${formatNumber(kpis.resolvedComplaints)} of ${formatNumber(kpis.complaints)}).`,
      tone: rate >= 70 ? 'positive' : rate >= 40 ? 'neutral' : 'caution',
    });
  }

  const topChannel = byChannel[0];
  if (topChannel && topChannel.count > 0) {
    points.push({
      text: `${topChannel.channel} was the busiest channel with ${formatNumber(topChannel.count)} ${plural(topChannel.count, 'log')}.`,
    });
  }

  const topCategory = byCategory[0];
  if (topCategory && topCategory.count > 0) {
    points.push({
      text: `${topCategory.categoryName} was the most common complaint (${formatNumber(topCategory.count)}).`,
    });
  }

  const caveats: NarrativePoint[] = [];

  caveats.push({
    text: `"Resolved" counts only logs marked exactly Resolved — RESPONDED, PENDING and in-progress are excluded by design.`,
    tone: 'caution',
  });

  if (appliedBrand !== 'all') {
    caveats.push({
      text: `Figures are scoped to ${brandLabel}; switch the brand filter for RealVest or all brands.`,
    });
  }

  return { headline, points, caveats, asOf };
}

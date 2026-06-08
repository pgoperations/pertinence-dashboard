import { formatNumber, formatPersonName } from '../format';
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
  const { kpis, byRep, byCategory, appliedBrand } = data;
  const asOf = mostRecent(data.sources.logsUpdatedAt);
  const brandLabel = BRAND_LABEL[appliedBrand];

  if (kpis.totalLogs === 0) {
    return emptyNarrative(asOf);
  }

  const headline =
    `${formatNumber(kpis.totalLogs)} customer ${plural(kpis.totalLogs, 'log')} for ${brandLabel} ` +
    `across ${rangeLabel(range)}: ${formatNumber(kpis.resolved)} resolved, ` +
    `${formatNumber(kpis.unresolved)} unresolved.`;

  const points: NarrativePoint[] = [];

  if (kpis.totalLogs > 0) {
    const rate = Math.round(kpis.resolutionRate * 100);
    points.push({
      text: `${rate}% of logs were resolved (${formatNumber(kpis.resolved)} of ${formatNumber(kpis.totalLogs)}).`,
      tone: rate >= 70 ? 'positive' : rate >= 40 ? 'neutral' : 'caution',
    });
  }

  const topRep = byRep[0];
  if (topRep && topRep.total > 0) {
    points.push({
      text: `${formatPersonName(topRep.name)} handled the most logs (${formatNumber(topRep.total)}, ${Math.round(topRep.resolutionRate * 100)}% resolved).`,
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
    text: `Counts are tickets (one per sheet row), matching the CX portal. "Resolved" = status exactly Resolved or Responded; "Unresolved" = Pending or In Progress; composite/blank statuses count in the total only.`,
    tone: 'caution',
  });

  if (byCategory.length > 0) {
    caveats.push({
      text: `Complaints by Category counts each complaint separately, so a ticket logging several complaints adds to multiple categories — those totals exceed the ticket count by design.`,
    });
  }

  caveats.push({
    text: `Brand is attributed by rep, not per customer — PPL = Catherine/Mariam/Mary, RealVest = Yetunde/Lovinal. The source sheet has no per-customer brand column.`,
    tone: 'caution',
  });

  if (appliedBrand !== 'all') {
    caveats.push({
      text: `Figures are scoped to ${brandLabel}; switch the brand filter for RealVest or all brands.`,
    });
  }

  return { headline, points, caveats, asOf };
}

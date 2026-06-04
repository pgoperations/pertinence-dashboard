import { formatNairaCompact } from '../format';
import type { MarketingPanelData } from '../queries/marketing';
import type { DateRange } from '../../types/date-range';
import type { NarrativePoint, SectionNarrative } from './types';
import { emptyNarrative, monthName, mostRecent, pct, plural, rangeLabel } from './helpers';

export function buildMarketingNarrative(
  data: MarketingPanelData,
  range: DateRange,
): SectionNarrative {
  const { kpis, byCategory, fallbackCount, totalRowCount } = data;
  const asOf = mostRecent(
    data.sources.marketingMonthlyRefreshedAt,
    data.sources.marketingExpensesUpdatedAt,
  );

  if (kpis.totalSpend === 0) {
    return emptyNarrative(asOf);
  }

  const headline =
    `${formatNairaCompact(kpis.totalSpend)} in marketing spend across ${rangeLabel(range)}, ` +
    `over ${kpis.monthsObserved} active ${plural(kpis.monthsObserved, 'month')} and ` +
    `${kpis.categoriesActive} ${plural(kpis.categoriesActive, 'category', 'categories')}.`;

  const points: NarrativePoint[] = [];

  const largest = byCategory[0];
  if (largest && largest.amount > 0) {
    points.push({
      text: `${largest.categoryName} was the largest line at ${formatNairaCompact(largest.amount)} (${pct(largest.amount, kpis.totalSpend)}% of spend).`,
      tone: 'positive',
    });
  }

  if (kpis.busiestMonth) {
    points.push({
      text: `${monthName(kpis.busiestMonth.month)} was the busiest month at ${formatNairaCompact(kpis.busiestMonth.amount)}.`,
    });
  }

  if (kpis.avgMonthlySpend > 0) {
    points.push({
      text: `Average monthly spend ran at ${formatNairaCompact(kpis.avgMonthlySpend)}.`,
    });
  }

  const caveats: NarrativePoint[] = [];

  if (fallbackCount > 0 && totalRowCount > 0) {
    caveats.push({
      text: `${fallbackCount} of ${totalRowCount} expense ${plural(totalRowCount, 'row')} were auto-categorized by keyword — the CATEGORY dropdown isn't backfilled yet, so category splits are best-effort.`,
      tone: 'caution',
    });
  }

  return { headline, points, caveats, asOf };
}

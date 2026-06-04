import { formatNairaCompact, formatNumber, formatPersonName } from '../format';
import type { SalesPanelData } from '../queries/sales';
import type { DateRange } from '../../types/date-range';
import type { NarrativePoint, SectionNarrative } from './types';
import { emptyNarrative, monthName, mostRecent, pct, plural, rangeLabel } from './helpers';

export function buildSalesNarrative(
  data: SalesPanelData,
  range: DateRange,
): SectionNarrative {
  const { kpis, byLocation, monthly, topRealtors, byLocationOtherReceived } = data;
  const asOf = mostRecent(
    data.sources.bankDepositRefreshedAt,
    data.sources.plotSalesRefreshedAt,
  );

  if (kpis.totalRevenueInflow === 0 && kpis.plotsSold === 0) {
    return emptyNarrative(asOf);
  }

  const headline =
    `${formatNairaCompact(kpis.totalRevenueInflow)} flowed into the bank across ` +
    `${rangeLabel(range)}, against ${formatNairaCompact(kpis.totalPayable)} in total ` +
    `payable value, from ${formatNumber(kpis.plotsSold)} ${plural(kpis.plotsSold, 'plot')} sold.`;

  const points: NarrativePoint[] = [];

  // Revenue mix (initial / further / fees).
  if (kpis.totalRevenueInflow > 0) {
    const ip = pct(kpis.initialReceived, kpis.totalRevenueInflow);
    const fp = pct(kpis.furtherReceived, kpis.totalRevenueInflow);
    const fee = pct(kpis.feesReceived, kpis.totalRevenueInflow);
    points.push({
      text: `Of that inflow, ${ip}% was initial payments, ${fp}% further & balance, and ${fee}% fees & charges.`,
    });
  }

  // Top location by cash received.
  const topByReceived = [...byLocation].sort((a, b) => b.received - a.received)[0];
  if (topByReceived && topByReceived.received > 0) {
    points.push({
      text: `${topByReceived.locationName} led on cash received at ${formatNairaCompact(topByReceived.received)} across ${formatNumber(topByReceived.dealCount)} ${plural(topByReceived.dealCount, 'deal')}.`,
      tone: 'positive',
    });
  }

  // Peak month.
  if (monthly.length >= 2) {
    const peak = [...monthly].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    if (peak && peak.totalRevenue > 0) {
      points.push({
        text: `Monthly inflow peaked in ${monthName(peak.month)} at ${formatNairaCompact(peak.totalRevenue)}.`,
      });
    }
  }

  // Top realtor (skip the Unattributed bucket).
  const topRealtor = topRealtors.find((r) => r.salesPerson !== 'Unattributed');
  if (topRealtor && topRealtor.revenue > 0) {
    points.push({
      text: `${formatPersonName(topRealtor.salesPerson)} topped realtor attribution with ${formatNairaCompact(topRealtor.revenue)} across ${formatNumber(topRealtor.dealCount)} ${plural(topRealtor.dealCount, 'deal')}.`,
      tone: 'positive',
    });
  }

  const caveats: NarrativePoint[] = [];

  // Unattributed revenue (the project brief's ~56% null SALES PERSON cohort).
  const totalRealtorRevenue = topRealtors.reduce((s, r) => s + r.revenue, 0);
  const unattributed = topRealtors.find((r) => r.salesPerson === 'Unattributed');
  if (unattributed && totalRealtorRevenue > 0) {
    const up = pct(unattributed.revenue, totalRealtorRevenue);
    if (up > 0) {
      caveats.push({
        text: `${formatNairaCompact(unattributed.revenue)} (${up}%) of inflow isn't attributed to a named realtor — shown as its own "Unattributed" cohort, not redistributed.`,
        tone: 'caution',
      });
    }
  }

  // Receipts with no mapped location.
  if (byLocationOtherReceived > 0) {
    caveats.push({
      text: `${formatNairaCompact(byLocationOtherReceived)} received has no mapped location (typically general fees) — surfaced as a footnote, not folded into a location.`,
      tone: 'caution',
    });
  }

  return { headline, points, caveats, asOf };
}

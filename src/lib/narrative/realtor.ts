import { formatNumber } from '../format';
import type { RealtorPanelData } from '../queries/realtor';
import type { DateRange } from '../../types/date-range';
import type { NarrativePoint, SectionNarrative } from './types';
import { emptyNarrative, monthName, mostRecent, plural, rangeLabel } from './helpers';

export function buildRealtorNarrative(
  data: RealtorPanelData,
  range: DateRange,
): SectionNarrative {
  const { monthlyTrend, monthsObserved, mismatchCount } = data;
  const asOf = mostRecent(data.sources.latestUpdatedAt);

  if (monthsObserved === 0 || monthlyTrend.length === 0) {
    return emptyNarrative(asOf);
  }

  const totalNew = monthlyTrend.reduce((s, m) => s + m.newRealtorsTotal, 0);
  const totalReferrals = monthlyTrend.reduce((s, m) => s + m.newReferrals, 0);
  const totalBusinessReps = monthlyTrend.reduce((s, m) => s + m.newBusinessReps, 0);
  const totalWeeklyMeeting = monthlyTrend.reduce(
    (s, m) => s + m.masterClass1 + m.masterClass2,
    0,
  );
  const totalStakeholders = monthlyTrend.reduce((s, m) => s + m.stakeholdersMeeting, 0);

  const headline =
    `${formatNumber(totalNew)} new ${plural(totalNew, 'realtor')} recruited across ${rangeLabel(range)} — ` +
    `${formatNumber(totalReferrals)} via referral and ${formatNumber(totalBusinessReps)} business ${plural(totalBusinessReps, 'rep')}.`;

  const points: NarrativePoint[] = [];

  // Peak recruitment month.
  const peak = [...monthlyTrend].sort((a, b) => b.newRealtorsTotal - a.newRealtorsTotal)[0];
  if (peak && peak.newRealtorsTotal > 0) {
    points.push({
      text: `${monthName(peak.month)} was the strongest recruitment month with ${formatNumber(peak.newRealtorsTotal)} new ${plural(peak.newRealtorsTotal, 'realtor')}.`,
      tone: 'positive',
    });
  }

  if (totalWeeklyMeeting > 0) {
    points.push({
      text: `Weekly Realtor Meetings (Master Class 1 + 2) drew ${formatNumber(totalWeeklyMeeting)} total attendances over the range.`,
    });
  }

  if (totalStakeholders > 0) {
    points.push({
      text: `Stakeholders Meeting recorded ${formatNumber(totalStakeholders)} attendances.`,
    });
  }

  const caveats: NarrativePoint[] = [];

  if (mismatchCount > 0) {
    caveats.push({
      text: `${mismatchCount} metric ${plural(mismatchCount, 'row')} show a mismatch between the source's manual total and the week-by-week sum — the week-sum is shown and both are preserved.`,
      tone: 'caution',
    });
  }

  caveats.push({
    text: `Aggregate-only by design: per-manager performance (Mrs Kemi / Richard Makava / Debbie) is out of v1 scope. Source covers ${monthsObserved} ${plural(monthsObserved, 'month')} in this range.`,
  });

  return { headline, points, caveats, asOf };
}

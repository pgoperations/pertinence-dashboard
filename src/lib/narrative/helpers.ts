import { formatMonthYear } from '../format';
import { formatRangeShort } from '../dateRange';
import type { DateRange } from '../../types/date-range';
import type { SectionNarrative } from './types';

// "1 Jan – 30 Jun 2026"
export function rangeLabel(range: DateRange): string {
  return formatRangeShort(range);
}

// "Jan 2026"
export function monthName(yyyymm: string): string {
  return formatMonthYear(yyyymm);
}

/** Whole-number percent of part within whole. 0 when whole is 0. */
export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Simple plural helper: plural(1,'plot') → 'plot', plural(3,'plot') → 'plots'. */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : pluralForm ?? `${singular}s`;
}

/** Direction word for a first→last comparison, with a 2% dead-band for "steady". */
export function trendWord(first: number, last: number): 'rose' | 'fell' | 'held steady' {
  if (first === 0) return last > 0 ? 'rose' : 'held steady';
  if (last > first * 1.02) return 'rose';
  if (last < first * 0.98) return 'fell';
  return 'held steady';
}

/** Most-recent of a set of ISO timestamps (nulls ignored). */
export function mostRecent(...isos: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const iso of isos) {
    if (iso && (!best || iso > best)) best = iso;
  }
  return best;
}

export function emptyNarrative(asOf: string | null = null): SectionNarrative {
  return {
    headline: 'Not enough data in this range to summarize.',
    points: [],
    caveats: [],
    asOf,
    empty: true,
  };
}

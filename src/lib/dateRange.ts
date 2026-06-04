import {
  endOfMonth,
  endOfQuarter,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from 'date-fns';
import type {
  DateRange,
  DateRangePreset,
  DateRangePresetId,
  IsoDate,
} from '../types/date-range';

export function toIso(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd');
}

export function parseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

// Fixed-period resolver — ignores `today` (used for named quarters / halves).
const fixed = (from: string, to: string) => (): DateRange => ({ from, to });

// Order matters: matchPreset returns the FIRST preset whose resolved range
// equals the active range. Relative presets sit first so that e.g. clicking
// "This quarter" (which today equals Q2 2026) labels as "This quarter" rather
// than "Q2 2026" — both are the same range, the relative label is friendlier.
export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  // --- Relative to today --------------------------------------------------
  {
    id: 'this-month',
    label: 'This month',
    group: 'Relative',
    resolve: (t) => ({ from: toIso(startOfMonth(t)), to: toIso(endOfMonth(t)) }),
  },
  {
    id: 'this-quarter',
    label: 'This quarter',
    group: 'Relative',
    resolve: (t) => ({ from: toIso(startOfQuarter(t)), to: toIso(endOfQuarter(t)) }),
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    group: 'Relative',
    resolve: (t) => ({ from: toIso(subDays(t, 29)), to: toIso(t) }),
  },
  {
    id: 'ytd',
    label: 'Year to date',
    group: 'Relative',
    resolve: (t) => ({ from: toIso(startOfYear(t)), to: toIso(t) }),
  },
  // --- Fixed 2026 quarters ------------------------------------------------
  { id: 'q1-2026', label: 'Q1 2026', group: 'Quarters', resolve: fixed('2026-01-01', '2026-03-31') },
  { id: 'q2-2026', label: 'Q2 2026', group: 'Quarters', resolve: fixed('2026-04-01', '2026-06-30') },
  { id: 'q3-2026', label: 'Q3 2026', group: 'Quarters', resolve: fixed('2026-07-01', '2026-09-30') },
  { id: 'q4-2026', label: 'Q4 2026', group: 'Quarters', resolve: fixed('2026-10-01', '2026-12-31') },
  // --- Fixed halves -------------------------------------------------------
  { id: 'h1-2026', label: 'H1 2026', group: 'Halves', resolve: fixed('2026-01-01', '2026-06-30') },
  { id: 'h2-2026', label: 'H2 2026', group: 'Halves', resolve: fixed('2026-07-01', '2026-12-31') },
  { id: 'h2-2025', label: 'H2 2025', group: 'Halves', resolve: fixed('2025-07-01', '2025-12-31') },
];

export const DEFAULT_PRESET: DateRangePresetId = 'h1-2026';

export function resolvePreset(id: DateRangePresetId, today: Date): DateRange | null {
  if (id === 'custom') return null;
  const preset = DATE_RANGE_PRESETS.find((p) => p.id === id);
  return preset ? preset.resolve(today) : null;
}

export function presetLabel(id: DateRangePresetId): string {
  return DATE_RANGE_PRESETS.find((p) => p.id === id)?.label ?? 'Custom';
}

export function matchPreset(range: DateRange, today: Date): DateRangePresetId {
  for (const preset of DATE_RANGE_PRESETS) {
    const resolved = preset.resolve(today);
    if (resolved && resolved.from === range.from && resolved.to === range.to) {
      return preset.id;
    }
  }
  return 'custom';
}

export function formatRangeShort(range: DateRange): string {
  const from = parseIso(range.from);
  const to = parseIso(range.to);
  if (!from || !to) return '—';
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameYear) {
    return `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`;
  }
  return `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
}

// True when the range is exactly one whole calendar month (1st → last day).
// Lets the picker show a tidy "Jun 2026" label instead of a date span.
export function singleMonthOf(range: DateRange): { value: string; label: string } | null {
  const from = parseIso(range.from);
  const to = parseIso(range.to);
  if (!from || !to) return null;
  const isStart = format(from, 'yyyy-MM-dd') === toIso(startOfMonth(from));
  const isEnd = format(to, 'yyyy-MM-dd') === toIso(endOfMonth(from));
  const sameMonth = format(from, 'yyyy-MM') === format(to, 'yyyy-MM');
  if (isStart && isEnd && sameMonth) {
    return { value: format(from, 'yyyy-MM'), label: format(from, 'MMM yyyy') };
  }
  return null;
}

// Build a whole-month range from a YYYY-MM string (the <input type="month"> value).
export function monthRange(yyyymm: string): DateRange | null {
  const d = parseIso(`${yyyymm}-01`);
  if (!d) return null;
  return { from: toIso(startOfMonth(d)), to: toIso(endOfMonth(d)) };
}

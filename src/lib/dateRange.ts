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
  PresetResolveCtx,
} from '../types/date-range';

export function toIso(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd');
}

export function parseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

// Local anchor date for the selected year — built with the local Date ctor so
// date-fns boundary helpers + toIso agree (same convention as the relative presets).
const yearDate = (year: number, monthIndex = 0, day = 1) => new Date(year, monthIndex, day);

// Year-scoped quarter resolver — q is 1..4, anchored on the selected year.
const quarterResolve =
  (q: 1 | 2 | 3 | 4) =>
  ({ year }: PresetResolveCtx): DateRange => {
    const d = yearDate(year, (q - 1) * 3, 1);
    return { from: toIso(startOfQuarter(d)), to: toIso(endOfQuarter(d)) };
  };

// Year-scoped half resolver — H1 = Jan–Jun, H2 = Jul–Dec of the selected year.
const halfResolve =
  (h: 1 | 2) =>
  ({ year }: PresetResolveCtx): DateRange =>
    h === 1
      ? { from: toIso(startOfYear(yearDate(year))), to: toIso(endOfMonth(yearDate(year, 5))) }
      : { from: toIso(startOfMonth(yearDate(year, 6))), to: toIso(endOfMonth(yearDate(year, 11))) };

// Whole selected calendar year (Jan 1 – Dec 31).
const fullYearResolve = ({ year }: PresetResolveCtx): DateRange => ({
  from: toIso(startOfYear(yearDate(year))),
  to: toIso(endOfMonth(yearDate(year, 11))),
});

// Fallback earliest year, used only until the dynamic earliest-data date loads
// (or if that query returns nothing). The live value comes from
// get_earliest_data_date() (migration 023) and flows in via ctx.earliestDate.
export const EARLIEST_DATA_YEAR = 2024;

// All-time: from the earliest date any ingest actually has (ctx.earliestDate,
// fetched at runtime) through the end of next year (the ingest carryover
// ceiling). Falls back to EARLIEST_DATA_YEAR until the dynamic value is known.
const allTimeResolve = ({ today, earliestDate }: PresetResolveCtx): DateRange => ({
  from: earliestDate ?? `${EARLIEST_DATA_YEAR}-01-01`,
  to: toIso(endOfMonth(yearDate(today.getFullYear() + 1, 11))),
});

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
    yearScoped: false,
    resolve: ({ today }) => ({ from: toIso(startOfMonth(today)), to: toIso(endOfMonth(today)) }),
  },
  {
    id: 'this-quarter',
    label: 'This quarter',
    group: 'Relative',
    yearScoped: false,
    resolve: ({ today }) => ({ from: toIso(startOfQuarter(today)), to: toIso(endOfQuarter(today)) }),
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    group: 'Relative',
    yearScoped: false,
    resolve: ({ today }) => ({ from: toIso(subDays(today, 29)), to: toIso(today) }),
  },
  {
    id: 'ytd',
    label: 'Year to date',
    group: 'Relative',
    yearScoped: false,
    resolve: ({ today }) => ({ from: toIso(startOfYear(today)), to: toIso(today) }),
  },
  // --- Year-scoped quarters (resolved against the selected year) ----------
  { id: 'q1', label: 'Q1', group: 'Quarters', yearScoped: true, resolve: quarterResolve(1) },
  { id: 'q2', label: 'Q2', group: 'Quarters', yearScoped: true, resolve: quarterResolve(2) },
  { id: 'q3', label: 'Q3', group: 'Quarters', yearScoped: true, resolve: quarterResolve(3) },
  { id: 'q4', label: 'Q4', group: 'Quarters', yearScoped: true, resolve: quarterResolve(4) },
  // --- Year-scoped halves -------------------------------------------------
  { id: 'h1', label: 'H1', group: 'Halves', yearScoped: true, resolve: halfResolve(1) },
  { id: 'h2', label: 'H2', group: 'Halves', yearScoped: true, resolve: halfResolve(2) },
  // --- Dropdown-driven (never rendered as buttons) ------------------------
  // Placed last so any range that also reads as a relative/quarter/half preset
  // matches that friendlier label first (e.g. a full current-year range on
  // Dec 31 reads as "Year to date", not "Full year").
  { id: 'full-year', label: 'Full year', group: 'Special', yearScoped: true, resolve: fullYearResolve },
  { id: 'all-time', label: 'All time', group: 'Special', yearScoped: false, resolve: allTimeResolve },
];

export const DEFAULT_PRESET: DateRangePresetId = 'h1';

export function resolvePreset(
  id: DateRangePresetId,
  today: Date,
  year: number,
  earliestDate?: string,
): DateRange | null {
  if (id === 'custom') return null;
  const preset = DATE_RANGE_PRESETS.find((p) => p.id === id);
  return preset ? preset.resolve({ today, year, earliestDate }) : null;
}

export function presetLabel(id: DateRangePresetId): string {
  return DATE_RANGE_PRESETS.find((p) => p.id === id)?.label ?? 'Custom';
}

// Trigger-friendly label. Year-scoped presets get the range's year appended
// (e.g. "Q1 2027"); relative presets keep their static label.
export function describeRange(id: DateRangePresetId, range: DateRange): string {
  const preset = DATE_RANGE_PRESETS.find((p) => p.id === id);
  if (!preset) return formatRangeShort(range);
  if (id === 'all-time') return 'All time';
  if (id === 'full-year') {
    const year = parseIso(range.from)?.getFullYear();
    return year ? String(year) : preset.label;
  }
  if (preset.yearScoped) {
    const year = parseIso(range.from)?.getFullYear();
    return year ? `${preset.label} ${year}` : preset.label;
  }
  return preset.label;
}

export function matchPreset(
  range: DateRange,
  today: Date,
  earliestDate?: string,
): DateRangePresetId {
  const yearOfRange = parseIso(range.from)?.getFullYear() ?? today.getFullYear();
  for (const preset of DATE_RANGE_PRESETS) {
    const year = preset.yearScoped ? yearOfRange : today.getFullYear();
    const resolved = preset.resolve({ today, year, earliestDate });
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

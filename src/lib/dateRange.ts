import {
  endOfMonth,
  endOfQuarter,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  subDays,
} from 'date-fns';
import type { DateRange, DateRangePreset, DateRangePresetId, IsoDate } from '../types/date-range';

export function toIso(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd');
}

export function parseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  {
    id: 'h1-2026',
    label: 'H1 2026',
    resolve: () => ({ from: '2026-01-01', to: '2026-06-30' }),
  },
  {
    id: 'ytd',
    label: 'Year to date',
    resolve: (today) => ({ from: '2026-01-01', to: toIso(today) }),
  },
  {
    id: 'this-quarter',
    label: 'This quarter',
    resolve: (today) => ({
      from: toIso(startOfQuarter(today)),
      to: toIso(endOfQuarter(today)),
    }),
  },
  {
    id: 'this-month',
    label: 'This month',
    resolve: (today) => ({
      from: toIso(startOfMonth(today)),
      to: toIso(endOfMonth(today)),
    }),
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    resolve: (today) => ({ from: toIso(subDays(today, 29)), to: toIso(today) }),
  },
  {
    id: 'h2-2025',
    label: 'H2 2025',
    resolve: () => ({ from: '2025-07-01', to: '2025-12-31' }),
  },
];

export const DEFAULT_PRESET: DateRangePresetId = 'h1-2026';

export function resolvePreset(id: DateRangePresetId, today: Date): DateRange | null {
  if (id === 'custom') return null;
  const preset = DATE_RANGE_PRESETS.find((p) => p.id === id);
  return preset ? preset.resolve(today) : null;
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

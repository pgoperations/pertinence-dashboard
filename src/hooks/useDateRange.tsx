import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PRESET,
  matchPreset,
  parseIso,
  resolvePreset,
} from '../lib/dateRange';
import { loadEarliestDataDate } from '../lib/queries/earliestData';
import type { DateRange, DateRangePresetId } from '../types/date-range';

type DateRangeContextValue = {
  range: DateRange;
  presetId: DateRangePresetId;
  setRange: (next: DateRange) => void;
  setPreset: (id: DateRangePresetId, year?: number) => void;
  /** Earliest date any ingest has data for (ISO), or null until loaded. */
  earliestDate: string | null;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function todayUtc(): Date {
  return new Date();
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Earliest date any ingest has — fetched once; drives "All time" + the year
  // dropdown floor. Null until loaded; presets fall back to EARLIEST_DATA_YEAR.
  const [earliestDate, setEarliestDate] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadEarliestDataDate()
      .then((d) => {
        if (active) setEarliestDate(d);
      })
      .catch(() => {
        /* leave null — presets fall back to the constant */
      });
    return () => {
      active = false;
    };
  }, []);

  const range = useMemo<DateRange>(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam && toParam && parseIso(fromParam) && parseIso(toParam)) {
      return { from: fromParam, to: toParam };
    }
    const now = todayUtc();
    const fallback = resolvePreset(DEFAULT_PRESET, now, now.getFullYear());
    return fallback ?? { from: '2026-01-01', to: '2026-06-30' };
  }, [searchParams]);

  const presetId = useMemo(
    () => matchPreset(range, todayUtc(), earliestDate ?? undefined),
    [range, earliestDate],
  );

  const setRange = useCallback(
    (next: DateRange) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set('from', next.from);
          sp.set('to', next.to);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPreset = useCallback(
    (id: DateRangePresetId, year?: number) => {
      if (id === 'custom') return;
      const now = todayUtc();
      const resolved = resolvePreset(id, now, year ?? now.getFullYear(), earliestDate ?? undefined);
      if (resolved) setRange(resolved);
    },
    [setRange, earliestDate],
  );

  const value = useMemo<DateRangeContextValue>(
    () => ({ range, presetId, setRange, setPreset, earliestDate }),
    [range, presetId, setRange, setPreset, earliestDate],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used inside DateRangeProvider');
  return ctx;
}

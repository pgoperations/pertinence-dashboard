import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PRESET,
  matchPreset,
  parseIso,
  resolvePreset,
} from '../lib/dateRange';
import type { DateRange, DateRangePresetId } from '../types/date-range';

type DateRangeContextValue = {
  range: DateRange;
  presetId: DateRangePresetId;
  setRange: (next: DateRange) => void;
  setPreset: (id: DateRangePresetId) => void;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function todayUtc(): Date {
  return new Date();
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo<DateRange>(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam && toParam && parseIso(fromParam) && parseIso(toParam)) {
      return { from: fromParam, to: toParam };
    }
    const fallback = resolvePreset(DEFAULT_PRESET, todayUtc());
    return fallback ?? { from: '2026-01-01', to: '2026-06-30' };
  }, [searchParams]);

  const presetId = useMemo(() => matchPreset(range, todayUtc()), [range]);

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
    (id: DateRangePresetId) => {
      if (id === 'custom') return;
      const resolved = resolvePreset(id, todayUtc());
      if (resolved) setRange(resolved);
    },
    [setRange],
  );

  const value = useMemo<DateRangeContextValue>(
    () => ({ range, presetId, setRange, setPreset }),
    [range, presetId, setRange, setPreset],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used inside DateRangeProvider');
  return ctx;
}

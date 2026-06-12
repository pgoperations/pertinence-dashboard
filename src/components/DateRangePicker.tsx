import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  DATE_RANGE_PRESETS,
  describeRange,
  EARLIEST_DATA_YEAR,
  formatRangeShort,
  monthRange,
  parseIso,
  singleMonthOf,
  toIso,
} from '../lib/dateRange';
import { useDateRange } from '../hooks/useDateRange';
import { IconCalendar, IconCheck, IconChevronDown, IconClose } from './icons';
import type { DateRangePresetGroup } from '../types/date-range';

const YEAR_SCOPED_GROUPS = ['Quarters', 'Halves'] as const;
// 'Special' (full-year / all-time) is dropdown-driven, never rendered as a
// labelled button group, so it's excluded from the label map.
const GROUP_LABEL: Record<Exclude<DateRangePresetGroup, 'Special'>, string> = {
  Relative: 'Quick ranges',
  Quarters: 'Quarters',
  Halves: 'Halves',
};

// Individually-listed years in the selector: from `earliestYear` (the year of
// the dynamically-fetched earliest data date — shared with the "All time" lower
// bound so they agree) through next year (the ingest carryover ceiling,
// currentYear + 1).
function yearOptions(earliestYear: number): number[] {
  const max = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = Math.min(earliestYear, max); y <= max; y++) years.push(y);
  return years;
}

// The dropdown is rendered in a portal to document.body. The app header carries
// `backdrop-blur`, and any element with backdrop-filter becomes the containing
// block (and a stacking context) for fixed-position descendants — which would
// otherwise anchor this bottom sheet to the 61px header instead of the viewport
// and let the bottom nav paint over it. Portaling escapes both.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function DateRangePicker() {
  const { range, presetId, setPreset, setRange, earliestDate } = useDateRange();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
  // Year the quarter / half filters resolve against. Seeded from the active
  // range and kept in sync when the range changes from elsewhere. Under
  // "All time" there's no single year, so the Q/H scope falls back to the
  // current year (clicking a quarter/half then jumps out of all-time).
  const earliestYear = parseIso(earliestDate)?.getFullYear() ?? EARLIEST_DATA_YEAR;
  const years = yearOptions(earliestYear);
  const currentYear = new Date().getFullYear();
  const isAllTime = presetId === 'all-time';
  const yearOfRange = isAllTime
    ? currentYear
    : parseIso(range.from)?.getFullYear() ?? currentYear;
  const [selectedYear, setSelectedYear] = useState(yearOfRange);
  useEffect(() => {
    setSelectedYear(yearOfRange);
  }, [yearOfRange]);
  // The year dropdown shows "All time" or the scoped year.
  const yearSelectValue = isAllTime ? 'all-time' : String(selectedYear);
  // Quick ranges are relative to *today*, so they only make sense for the
  // current year — greyed out (and not highlighted) when another year is picked.
  const quickRangesEnabled = !isAllTime && selectedYear === currentYear;
  // Desktop anchors the popover under the trigger via measured coords (it lives
  // in a body portal, so it can't use CSS `absolute` relative to the trigger).
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCustomFrom(range.from);
    setCustomTo(range.to);
  }, [range.from, range.to]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Keep the desktop popover anchored to the trigger across scroll / resize.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setCoords({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, isDesktop]);

  const monthValue = singleMonthOf(range)?.value ?? '';
  const triggerLabel =
    presetId === 'custom'
      ? singleMonthOf(range)?.label ?? formatRangeShort(range)
      : describeRange(presetId, range);

  function applyCustom() {
    const from = parseIso(customFrom);
    const to = parseIso(customTo);
    if (!from || !to) {
      setCustomError('Pick both a start and end date.');
      return;
    }
    if (from > to) {
      setCustomError('Start date must be before end date.');
      return;
    }
    setCustomError(null);
    setRange({ from: toIso(from), to: toIso(to) });
    setOpen(false);
  }

  function applyMonth(yyyymm: string) {
    const r = monthRange(yyyymm);
    if (r) {
      setRange(r);
      setOpen(false);
    }
  }

  // Year dropdown: "All time" applies the all-data range; a year applies that
  // whole calendar year. Either way the popover stays open so the user can
  // refine with a quarter / half / month below.
  function applyYearSelection(value: string) {
    if (value === 'all-time') {
      setPreset('all-time');
    } else {
      const year = Number(value);
      setSelectedYear(year);
      setPreset('full-year', year);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium text-brand-800 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50 cursor-pointer"
      >
        <IconCalendar className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="max-w-[120px] truncate sm:max-w-none">{triggerLabel}</span>
        <IconChevronDown
          className={clsx(
            'h-4 w-4 shrink-0 text-brand-500 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open
        ? createPortal(
            <>
              {!isDesktop && (
                <div
                  className="fixed inset-0 z-[60] bg-brand-900/40"
                  aria-hidden
                  onClick={() => setOpen(false)}
                />
              )}
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Choose date range"
                style={
                  isDesktop && coords
                    ? { position: 'fixed', top: coords.top, right: coords.right }
                    : undefined
                }
                className={clsx(
                  'z-[70] flex flex-col border border-brand-200 bg-white shadow-card',
                  isDesktop
                    ? 'w-80 max-h-[75vh] rounded-xl'
                    : 'fixed inset-x-3 bottom-3 max-h-[85vh] rounded-2xl',
                )}
              >
                {/* Mobile sheet header — stays put while the list scrolls below. */}
                {!isDesktop && (
                  <div className="flex shrink-0 items-center justify-between px-4 pt-4">
                    <h3 className="font-heading text-base font-semibold">Date range</h3>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-lg text-brand-500 hover:bg-brand-100 cursor-pointer"
                    >
                      <IconClose className="h-5 w-5" />
                    </button>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 md:p-3">
                  {/* Quick ranges (relative to today — current year only) */}
                  <div className="mb-2">
                    <div className="flex items-baseline justify-between px-1 pb-1 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                        {GROUP_LABEL.Relative}
                      </span>
                      {!quickRangesEnabled && (
                        <span className="text-[10px] font-medium normal-case text-brand-400">
                          {currentYear} only
                        </span>
                      )}
                    </div>
                    <ul className="grid grid-cols-2 gap-1">
                      {DATE_RANGE_PRESETS.filter((p) => p.group === 'Relative').map((p) => {
                        const active = presetId === p.id && quickRangesEnabled;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              disabled={!quickRangesEnabled}
                              onClick={() => {
                                setPreset(p.id);
                                setOpen(false);
                              }}
                              className={clsx(
                                'flex w-full items-center justify-between gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200',
                                !quickRangesEnabled
                                  ? 'cursor-not-allowed text-brand-300'
                                  : active
                                    ? 'cursor-pointer bg-accent text-white'
                                    : 'cursor-pointer text-brand-800 hover:bg-brand-50',
                              )}
                            >
                              <span className="truncate">{p.label}</span>
                              {active ? <IconCheck className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Year selector — "All time" or a specific year; drives the
                      quarter / half filters below. */}
                  <div className="mt-3 border-t border-brand-200 pt-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                      Year
                      <select
                        value={yearSelectValue}
                        onChange={(e) => applyYearSelection(e.target.value)}
                        className="mt-2 w-full cursor-pointer rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-sm font-medium normal-case text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                      >
                        <option value="all-time">All time</option>
                        {[...years].reverse().map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Year-scoped quarters + halves */}
                  {YEAR_SCOPED_GROUPS.map((group) => {
                    const items = DATE_RANGE_PRESETS.filter((p) => p.group === group);
                    if (items.length === 0) return null;
                    return (
                      <div key={group} className="mt-3">
                        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                          {GROUP_LABEL[group]}
                        </div>
                        <ul className="grid grid-cols-2 gap-1">
                          {items.map((p) => {
                            // Active only when the live range is this preset AND its year
                            // matches the year currently selected in the dropdown above.
                            const active = presetId === p.id && yearOfRange === selectedYear;
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreset(p.id, selectedYear);
                                    setOpen(false);
                                  }}
                                  className={clsx(
                                    'flex w-full items-center justify-between gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 cursor-pointer',
                                    active
                                      ? 'bg-accent text-white'
                                      : 'text-brand-800 hover:bg-brand-50',
                                  )}
                                >
                                  <span className="truncate">{`${p.label} ${selectedYear}`}</span>
                                  {active ? <IconCheck className="h-4 w-4 shrink-0" /> : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}

                  {/* Specific month */}
                  <div className="mt-3 border-t border-brand-200 pt-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                      Specific month
                      <input
                        type="month"
                        value={monthValue}
                        min={`${years[0]}-01`}
                        max={`${years[years.length - 1]}-12`}
                        onChange={(e) => {
                          if (e.target.value) applyMonth(e.target.value);
                        }}
                        className="mt-2 w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-sm font-normal normal-case text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </label>
                  </div>

                  {/* Custom range */}
                  <div className="mt-3 border-t border-brand-200 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                      Custom range
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs font-medium text-brand-600">
                        From
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-sm text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                        />
                      </label>
                      <label className="block text-xs font-medium text-brand-600">
                        To
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-sm text-brand-900 focus:border-accent focus:ring-1 focus:ring-accent"
                        />
                      </label>
                    </div>
                    {customError ? (
                      <p className="mt-2 text-xs text-red-600">{customError}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={applyCustom}
                      className="mt-3 w-full rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-800 cursor-pointer"
                    >
                      Apply custom range
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

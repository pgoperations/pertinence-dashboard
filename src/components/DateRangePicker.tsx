import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  DATE_RANGE_PRESETS,
  formatRangeShort,
  monthRange,
  parseIso,
  presetLabel,
  singleMonthOf,
  toIso,
} from '../lib/dateRange';
import { useDateRange } from '../hooks/useDateRange';
import { IconCalendar, IconCheck, IconChevronDown, IconClose } from './icons';
import type { DateRangePresetGroup } from '../types/date-range';

const GROUP_ORDER: DateRangePresetGroup[] = ['Relative', 'Quarters', 'Halves'];
const GROUP_LABEL: Record<DateRangePresetGroup, string> = {
  Relative: 'Quick ranges',
  Quarters: 'Quarters (2026)',
  Halves: 'Halves',
};

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
  const { range, presetId, setPreset, setRange } = useDateRange();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
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
      : presetLabel(presetId);

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
                  {GROUP_ORDER.map((group) => {
                    const items = DATE_RANGE_PRESETS.filter((p) => p.group === group);
                    if (items.length === 0) return null;
                    return (
                      <div key={group} className="mb-2 last:mb-0">
                        <div className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                          {GROUP_LABEL[group]}
                        </div>
                        <ul className="grid grid-cols-2 gap-1">
                          {items.map((p) => {
                            const active = presetId === p.id;
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreset(p.id);
                                    setOpen(false);
                                  }}
                                  className={clsx(
                                    'flex w-full items-center justify-between gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 cursor-pointer',
                                    active
                                      ? 'bg-accent text-white'
                                      : 'text-brand-800 hover:bg-brand-50',
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
                    );
                  })}

                  {/* Specific month */}
                  <div className="mt-3 border-t border-brand-200 pt-3">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                      Specific month
                      <input
                        type="month"
                        value={monthValue}
                        min="2025-01"
                        max="2026-12"
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

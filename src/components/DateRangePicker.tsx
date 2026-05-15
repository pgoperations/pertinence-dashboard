import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { DATE_RANGE_PRESETS, formatRangeShort, parseIso, toIso } from '../lib/dateRange';
import { useDateRange } from '../hooks/useDateRange';
import { IconCalendar, IconCheck, IconChevronDown, IconClose } from './icons';
import type { DateRangePresetId } from '../types/date-range';

const PRESET_LABEL: Record<DateRangePresetId, string> = {
  'h1-2026': 'H1 2026',
  'h2-2025': 'H2 2025',
  'this-month': 'This month',
  'this-quarter': 'This quarter',
  ytd: 'YTD',
  'last-30': 'Last 30 days',
  custom: 'Custom',
};

export function DateRangePicker() {
  const { range, presetId, setPreset, setRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
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

  const triggerLabel =
    presetId === 'custom' ? formatRangeShort(range) : PRESET_LABEL[presetId];

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
        <IconCalendar className="h-4 w-4 text-brand-500" />
        <span className="max-w-[160px] truncate sm:max-w-none">{triggerLabel}</span>
        <IconChevronDown
          className={clsx(
            'h-4 w-4 text-brand-500 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-brand-900/30 md:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose date range"
            className={clsx(
              'z-50 bg-white shadow-card border border-brand-200',
              'fixed inset-x-3 bottom-3 rounded-2xl p-4 md:absolute md:inset-auto md:right-0 md:top-12 md:w-80 md:rounded-xl md:p-3',
            )}
          >
            <div className="flex items-center justify-between md:hidden">
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

            <ul className="mt-2 grid gap-1 md:mt-0">
              {DATE_RANGE_PRESETS.map((p) => {
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
                        'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-200 cursor-pointer',
                        active
                          ? 'bg-brand-900 text-white'
                          : 'text-brand-800 hover:bg-brand-50',
                      )}
                    >
                      <span>{p.label}</span>
                      {active ? <IconCheck className="h-4 w-4" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 border-t border-brand-200 pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-brand-500">
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
        </>
      ) : null}
    </div>
  );
}

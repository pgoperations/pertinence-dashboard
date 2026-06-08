import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { supabase } from '../lib/supabase';
import { useRefresh } from '../hooks/useRefresh';
import {
  IconAlert,
  IconCheck,
  IconCloudDownload,
  IconClose,
  IconRefresh,
} from './icons';

// On-demand "Re-pull from Sheets" trigger so users can force a fresh pull
// without waiting for the 15-min cron. Hits the Sheets API for each ingest.
// All functions are deployed `--no-verify-jwt`, so any signed-in user can
// invoke them (sign-up is admin-provisioned only, so this is the right gate).
//
// Per-page scoping (supervisor 2026-06-04): refreshing the whole dashboard is
// cumbersome when you only edited one department's sheet. The button defaults
// to syncing just the ingests that feed the current page; a "Sync all sheets"
// action in the popover still runs the full pipeline.

const INGESTS = [
  { fn: 'ingest-bank-deposit', label: 'Bank Deposit' },
  { fn: 'ingest-marketing-expense', label: 'Marketing Expense' },
  { fn: 'ingest-customer-support', label: 'Customer Support' },
  { fn: 'ingest-weekly-sales', label: 'Weekly Sales' },
  { fn: 'ingest-customer-file', label: 'Customer File' },
  { fn: 'ingest-realtor-managers-weekly', label: 'Realtor Managers' },
  { fn: 'ingest-digital-marketing', label: 'Digital Marketing' },
  { fn: 'ingest-media-weekly', label: 'Media (Weekly)' },
] as const;

type IngestFn = (typeof INGESTS)[number]['fn'];
type IngestStatus = 'idle' | 'running' | 'ok' | 'failed';

const LABEL_BY_FN: Record<IngestFn, string> = Object.fromEntries(
  INGESTS.map((i) => [i.fn, i.label]),
) as Record<IngestFn, string>;

// Which ingests feed each page. Keyed by route path prefix.
const PAGE_INGESTS: Array<{ path: string; label: string; fns: IngestFn[] }> = [
  {
    path: '/sales',
    label: 'Sales',
    fns: ['ingest-bank-deposit', 'ingest-weekly-sales', 'ingest-customer-file'],
  },
  {
    path: '/marketing',
    label: 'Marketing',
    fns: ['ingest-marketing-expense', 'ingest-digital-marketing'],
  },
  {
    path: '/customer-support',
    label: 'Customer Support',
    fns: ['ingest-customer-support'],
  },
  {
    path: '/realtor-management',
    label: 'Realtor Mgmt',
    fns: ['ingest-realtor-managers-weekly'],
  },
  {
    path: '/media-content',
    label: 'Media',
    fns: ['ingest-media-weekly'],
  },
];

const ALL_FNS = INGESTS.map((i) => i.fn) as IngestFn[];

type IngestResult = {
  status: IngestStatus;
  ms: number | null;
  rowsUpserted: number | null;
  message: string | null;
};

const IDLE: IngestResult = { status: 'idle', ms: null, rowsUpserted: null, message: null };

function initialResults(): Record<IngestFn, IngestResult> {
  return Object.fromEntries(INGESTS.map((i) => [i.fn, { ...IDLE }])) as Record<
    IngestFn,
    IngestResult
  >;
}

// Per-invoke safety net so a hung invoke never spins forever.
const INVOKE_TIMEOUT_MS = 60_000;

function invokeWithTimeout(fn: string, ms: number) {
  return new Promise<{ data: unknown; error: { message: string } | null }>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ data: null, error: { message: `Timed out after ${ms / 1000}s` } });
    }, ms);
    supabase.functions
      .invoke(fn, { body: {} })
      .then((res) => {
        clearTimeout(timer);
        resolve(res as { data: unknown; error: { message: string } | null });
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        resolve({
          data: null,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      });
  });
}

function extractRowsUpserted(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.rowsUpserted === 'number') return obj.rowsUpserted;
  if (Array.isArray(obj.tabs)) {
    let total = 0;
    for (const tab of obj.tabs as Array<Record<string, unknown>>) {
      if (typeof tab.rowsUpserted === 'number') total += tab.rowsUpserted;
    }
    return total;
  }
  return null;
}

export function RepullButton() {
  const { refresh } = useRefresh();
  const { pathname } = useLocation();
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [results, setResults] = useState<Record<IngestFn, IngestResult>>(initialResults);
  const [open, setOpen] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [lastRunFns, setLastRunFns] = useState<IngestFn[] | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Resolve the current page's ingest scope.
  const page = useMemo(
    () => PAGE_INGESTS.find((p) => pathname.startsWith(p.path)) ?? null,
    [pathname],
  );
  const pageFns: IngestFn[] = page?.fns ?? ALL_FNS;
  const pageLabel = page?.label ?? 'all';

  // The ingest rows to show in the popover: the last run's scope if any,
  // otherwise the current page's scope.
  const displayFns = lastRunFns ?? pageFns;
  const total = displayFns.length;

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
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  async function handleRepull(fns: IngestFn[]) {
    if (running) return;
    setRunning(true);
    setDoneCount(0);
    setOpen(true);
    setLastRunFns(fns);
    // Reset only the scoped fns to "running"; leave others idle.
    const next = initialResults();
    for (const fn of fns) next[fn] = { status: 'running', ms: null, rowsUpserted: null, message: null };
    setResults({ ...next });

    await Promise.all(
      fns.map(async (fn) => {
        const start = performance.now();
        try {
          const { data, error } = await invokeWithTimeout(fn, INVOKE_TIMEOUT_MS);
          const ms = Math.round(performance.now() - start);
          if (error) {
            next[fn] = { status: 'failed', ms, rowsUpserted: null, message: error.message || 'invoke error' };
            console.error(`[repull] ${fn} failed`, error, data);
          } else if (data && typeof data === 'object' && 'error' in data && data.error) {
            next[fn] = { status: 'failed', ms, rowsUpserted: null, message: String((data as { error: unknown }).error) };
            console.error(`[repull] ${fn} returned error`, data);
          } else {
            next[fn] = { status: 'ok', ms, rowsUpserted: extractRowsUpserted(data), message: null };
            console.log(`[repull] ${fn} ok in ${ms}ms`, data);
          }
        } catch (err) {
          next[fn] = {
            status: 'failed',
            ms: Math.round(performance.now() - start),
            rowsUpserted: null,
            message: err instanceof Error ? err.message : String(err),
          };
          console.error(`[repull] ${fn} threw`, err);
        }
        setDoneCount((c) => c + 1);
        setResults({ ...next });
      }),
    );

    setRunning(false);
    setLastRunAt(new Date());
    // Even on partial failure: any successful ingest wrote new data, so it's
    // correct to re-query Supabase tables now.
    refresh();
  }

  const scoped = displayFns.map((fn) => results[fn]);
  const failedCount = scoped.filter((r) => r.status === 'failed').length;
  const okCount = scoped.filter((r) => r.status === 'ok').length;
  const anyRun = okCount + failedCount > 0;

  const idleLabel = page ? `Sync ${pageLabel}` : 'Sync Sheets';
  const label = running
    ? `Syncing ${doneCount}/${total}…`
    : anyRun && failedCount > 0
      ? `${okCount}/${total} pulled — ${failedCount} failed`
      : anyRun
        ? `${okCount}/${total} pulled`
        : idleLabel;

  const buttonState: 'running' | 'failed' | 'ok' | 'idle' = running
    ? 'running'
    : anyRun && failedCount > 0
      ? 'failed'
      : anyRun
        ? 'ok'
        : 'idle';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (running) {
            setOpen((o) => !o);
            return;
          }
          if (anyRun && !open) {
            setOpen(true);
            return;
          }
          if (anyRun && open) {
            void handleRepull(pageFns);
            return;
          }
          void handleRepull(pageFns);
        }}
        aria-label={`Pull fresh data from Google Sheets for ${pageLabel}`}
        aria-expanded={open}
        title={`Pull fresh ${pageLabel} data from Google Sheets`}
        className={clsx(
          'group inline-flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer md:px-3',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
          buttonState === 'running' && 'border-accent bg-accent/5 text-accent cursor-default',
          buttonState === 'failed' &&
            'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100',
          buttonState === 'ok' &&
            'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100',
          buttonState === 'idle' &&
            'border-brand-200 bg-white text-brand-700 hover:border-accent hover:bg-accent/5 hover:text-accent',
        )}
      >
        {buttonState === 'running' ? (
          <IconRefresh className="h-4 w-4 animate-spin" />
        ) : buttonState === 'failed' ? (
          <IconAlert className="h-4 w-4" />
        ) : buttonState === 'ok' ? (
          <IconCheck className="h-4 w-4" />
        ) : (
          <IconCloudDownload className="h-4 w-4" />
        )}
        <span className="hidden md:inline">{label}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Sheets re-pull progress"
          className="absolute right-0 top-full z-40 mt-2 w-[300px] rounded-xl border border-brand-200 bg-white p-3 shadow-card"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-heading text-sm font-semibold text-brand-900">
                {running
                  ? 'Pulling from Google Sheets'
                  : failedCount > 0
                    ? 'Pulled with errors'
                    : anyRun
                      ? 'Pulled successfully'
                      : `Sync ${pageLabel} from Sheets`}
              </p>
              <p className="mt-0.5 text-xs text-brand-500">
                {running
                  ? `${doneCount} of ${total} ingests complete`
                  : lastRunAt
                    ? `Last run ${lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : `${total} ingest${total === 1 ? '' : 's'} feed this page`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-md p-1 text-brand-500 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <ul className="space-y-1.5">
            {displayFns.map((fn) => {
              const r = results[fn];
              return (
                <li
                  key={fn}
                  className="flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50/40 px-2 py-1.5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {r.status === 'running' ? (
                      <IconRefresh className="h-3.5 w-3.5 animate-spin text-accent" />
                    ) : r.status === 'ok' ? (
                      <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                    ) : r.status === 'failed' ? (
                      <IconAlert className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <span className="block h-1.5 w-1.5 rounded-full bg-brand-300" />
                    )}
                  </span>
                  <span className="flex-1 truncate text-xs text-brand-800">{LABEL_BY_FN[fn]}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-brand-500">
                    {r.status === 'ok' && r.rowsUpserted !== null
                      ? `${r.rowsUpserted.toLocaleString()} rows`
                      : r.status === 'ok'
                        ? 'ok'
                        : r.status === 'failed'
                          ? (r.message ?? 'failed').slice(0, 28)
                          : r.status === 'running'
                            ? 'running…'
                            : ''}
                  </span>
                </li>
              );
            })}
          </ul>

          {!running && (
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => void handleRepull(pageFns)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent hover:border-accent hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              >
                <IconCloudDownload className="h-3.5 w-3.5" />
                {anyRun ? `Sync ${pageLabel} again` : `Sync ${pageLabel}`}
              </button>
              {pageFns.length < ALL_FNS.length && (
                <button
                  type="button"
                  onClick={() => void handleRepull(ALL_FNS)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-600 hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                >
                  Sync all {ALL_FNS.length} sheets
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

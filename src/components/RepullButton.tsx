import { useEffect, useRef, useState } from 'react';
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

// Step 9 of the roadmap (HARD launch requirement): an on-demand "Re-pull from
// Sheets" trigger so users can force a fresh pull without waiting for the cron.
// Complements (does not replace) the lightweight `Refresh` button — Refresh
// only re-queries Supabase tables, this hits the Sheets API for each ingest.
// All 6 functions are deployed `--no-verify-jwt`, so any signed-in user can
// invoke them (sign-up is admin-provisioned only, so this is the right gate).

const INGESTS = [
  { fn: 'ingest-bank-deposit', label: 'Bank Deposit' },
  { fn: 'ingest-marketing-expense', label: 'Marketing Expense' },
  { fn: 'ingest-customer-support', label: 'Customer Support' },
  { fn: 'ingest-weekly-sales', label: 'Weekly Sales' },
  { fn: 'ingest-customer-file', label: 'Customer File' },
  { fn: 'ingest-realtor-managers-weekly', label: 'Realtor Managers' },
] as const;

type IngestFn = (typeof INGESTS)[number]['fn'];
type IngestStatus = 'idle' | 'running' | 'ok' | 'failed';

type IngestResult = {
  status: IngestStatus;
  ms: number | null;
  rowsUpserted: number | null;
  message: string | null;
};

const INITIAL_RESULTS: Record<IngestFn, IngestResult> = Object.fromEntries(
  INGESTS.map((i) => [i.fn, { status: 'idle', ms: null, rowsUpserted: null, message: null }]),
) as Record<IngestFn, IngestResult>;

// Per-invoke safety net. Each ingest's typical wall-time is <15s (Customer
// Support is the longest); 60s is a generous ceiling that still guarantees
// the UI never sits on "running…" forever if an Edge Function or the network
// stalls. Without this, a hung invoke kept the spinner spinning indefinitely
// — observed when the functions were missing CORS preflight handlers, but the
// failure mode could recur with any other network-level hang.
const INVOKE_TIMEOUT_MS = 60_000;

function invokeWithTimeout(fn: string, ms: number) {
  return new Promise<{ data: unknown; error: { message: string } | null }>(
    (resolve) => {
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
    },
  );
}

function extractRowsUpserted(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  // Most ingests use `rowsUpserted`; the marketing ingest aggregates per-tab
  // and exposes `tabs[].rowsUpserted` — sum those when the top-level field is
  // missing.
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
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [results, setResults] = useState<Record<IngestFn, IngestResult>>(INITIAL_RESULTS);
  const [open, setOpen] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  async function handleRepull() {
    if (running) return;
    setRunning(true);
    setDoneCount(0);
    setOpen(true);
    const next: Record<IngestFn, IngestResult> = Object.fromEntries(
      INGESTS.map((i) => [i.fn, { status: 'running', ms: null, rowsUpserted: null, message: null }]),
    ) as Record<IngestFn, IngestResult>;
    setResults({ ...next });

    await Promise.all(
      INGESTS.map(async (ingest) => {
        const start = performance.now();
        try {
          const { data, error } = await invokeWithTimeout(ingest.fn, INVOKE_TIMEOUT_MS);
          const ms = Math.round(performance.now() - start);
          if (error) {
            next[ingest.fn] = {
              status: 'failed',
              ms,
              rowsUpserted: null,
              message: error.message || 'invoke error',
            };
            console.error(`[repull] ${ingest.fn} failed`, error, data);
          } else if (data && typeof data === 'object' && 'error' in data && data.error) {
            next[ingest.fn] = {
              status: 'failed',
              ms,
              rowsUpserted: null,
              message: String((data as { error: unknown }).error),
            };
            console.error(`[repull] ${ingest.fn} returned error`, data);
          } else {
            next[ingest.fn] = {
              status: 'ok',
              ms,
              rowsUpserted: extractRowsUpserted(data),
              message: null,
            };
            console.log(`[repull] ${ingest.fn} ok in ${ms}ms`, data);
          }
        } catch (err) {
          next[ingest.fn] = {
            status: 'failed',
            ms: Math.round(performance.now() - start),
            rowsUpserted: null,
            message: err instanceof Error ? err.message : String(err),
          };
          console.error(`[repull] ${ingest.fn} threw`, err);
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

  const failedCount = Object.values(results).filter((r) => r.status === 'failed').length;
  const okCount = Object.values(results).filter((r) => r.status === 'ok').length;
  const anyRun = okCount + failedCount > 0;

  const label = running
    ? `Re-pulling ${doneCount}/${INGESTS.length}…`
    : anyRun && failedCount > 0
      ? `${okCount}/${INGESTS.length} pulled — ${failedCount} failed`
      : anyRun
        ? `${okCount}/${INGESTS.length} pulled`
        : 'Sync Sheets';

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
            // After a completed run, the first click re-opens the popover
            // showing the last result; subsequent clicks re-run.
            setOpen(true);
            return;
          }
          if (anyRun && open) {
            void handleRepull();
            return;
          }
          void handleRepull();
        }}
        aria-label="Pull fresh data from Google Sheets"
        aria-expanded={open}
        title="Pull fresh data from Google Sheets (~15s)"
        className={clsx(
          'group inline-flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer md:px-3',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1',
          buttonState === 'running' &&
            'border-accent bg-accent/5 text-accent cursor-default',
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
                      : 'Sync from Google Sheets'}
              </p>
              <p className="mt-0.5 text-xs text-brand-500">
                {running
                  ? `${doneCount} of ${INGESTS.length} ingests complete`
                  : lastRunAt
                    ? `Last run ${lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Re-pulls all 6 ingests (~15s)'}
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
            {INGESTS.map((ingest) => {
              const r = results[ingest.fn];
              return (
                <li
                  key={ingest.fn}
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
                  <span className="flex-1 truncate text-xs text-brand-800">{ingest.label}</span>
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
            <button
              type="button"
              onClick={() => void handleRepull()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent hover:border-accent hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
            >
              <IconCloudDownload className="h-3.5 w-3.5" />
              {anyRun ? 'Pull again' : 'Pull now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

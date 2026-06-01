// Ingest the Customer Support Master Sheet — one tab per active rep — into
// public.customer_support_logs. Third ingest after Bank Deposit and
// Marketing Expense; reuses the same auth + lookup primitives.
//
// Trigger paths:
//   * Scheduled (every 15 min) via Supabase cron — wired in step 9 of the roadmap (HARD launch requirement; not yet deployed)
//   * Admin "Re-pull from Sheets" button from the dashboard — also step 9
//
// Scope decisions (locked 2026-05-14):
//
//   1. **All dates, no year filter.** The CS sheet is a continuous log
//      (CATHERINE alone has rows back to mid-2025). Dashboard's date-range
//      selector handles display filtering. Matches the H1 2025 PDF baseline
//      the supervisor benchmarks against.
//
//   2. **Only the 5 active reps per Rep_ID** (CATHERINE, MARIAM, MARY,
//      YETUNDE, LOVINAL). ABIDEMI and VICTORIA tabs exist on the sheet but
//      are not in scope — the supervisor will tell us if that changes.
//
//   3. **Composite "Nature of Complaint" cells split into multiple log rows.**
//      Many rows hold values like `Documentaion, Site Allocation` meaning the
//      customer lodged two complaints in one log entry. Per supervisor: split
//      so each category gets its own customer_support_logs row. The splitter
//      (`splitComposite` in _shared/parseCustomerSupport.ts) is quote-aware
//      so single-category values that legitimately contain commas (e.g.
//      `"Special Request- Sent Payment receipts, Contract of Sale or Deed of
//      Assignment"`) stay together.
//
//   4. **`source_row_id` = `row-{N}-{i}`** where N is the 1-indexed sheet row
//      and i is the 1-indexed position in the composite split. A
//      non-composite row gets `row-N-1`; `Documentaion, Site Allocation` at
//      row 5 becomes `row-5-1` (Documentaion) + `row-5-2` (Site Allocation).
//      Stable across re-ingest as long as the supervisor doesn't reorder the
//      comma-separated list in a cell.
//
//   5. **Channel and Status of Complaint are stored as text** (no canonical
//      mapping today). Same channel/status value goes on every split row from
//      a composite — they're row-level attributes, not per-complaint.
//
//   6. **`resolution_duration` is null in v1.** The columns "Complaint
//      Resolved Time / Resolved Date / Resolution Time" exist on the source
//      sheet (cols O–Q) but are often blank; computing duration cleanly
//      needs the supervisor's input on time-zone + business-hours math, and
//      none of the v1 KPIs require it. Read range stays at A2:N so the
//      ingest stays narrow.
//
//   7. **Stale-row sweep is NOT done in v1.** If the supervisor edits
//      `A, B` to just `A`, the row-N-2 record stays in the DB and the
//      dashboard will count it. Documented limitation; add a per-tab sweep
//      step if it becomes a real issue.
//
// Quality flags emitted:
//   * unparseable_date           — col C wasn't a serial number or D/M/YYYY
//   * unknown_complaint_category — col H had a value that didn't match any
//                                  alias in complaint_aliases. Stays null on
//                                  the FK; complaint_raw carries the original
//                                  text so the supervisor can add the alias.

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  parseSheetDate,
  readSheetValues,
} from '../_shared/sheetsAuth.ts';
import {
  loadActiveCustomerServiceReps,
  loadComplaintAliases,
  lookupCanonical,
  type CsRepLookup,
} from '../_shared/canonicalLookup.ts';
import {
  COL,
  RAW_ROW_KEYS,
  REP_TABS,
  splitComposite,
  type RepTab,
} from '../_shared/parseCustomerSupport.ts';
import { QUALITY_FLAGS, type QualityFlags } from '../_shared/quality_flags.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SOURCE_SHEET = 'customer_support_master';
const READ_RANGE_SUFFIX = 'A2:N';

type ParsedRow = {
  source_sheet: string;
  source_tab: string;
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  log_date: string | null;
  rep_id: string;
  channel: string | null;
  complaint_category_id: string | null;
  complaint_raw: string | null;
  resolution_status: string | null;
  resolution_duration: null;
  customer_name: string | null;
};

type TabStats = {
  rowsRead: number;
  rowsParsed: number;     // logical sheet rows that produced ≥1 log row
  rowsUpserted: number;   // total log rows (split included)
  blankSkipped: number;
  unparseableDate: number;
  unknownCategory: number;
  compositeSplits: number; // logical rows that produced > 1 log row
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return String(v);
    return null;
  }
  const t = v.trim();
  return t.length ? t : null;
}

function parseTab(
  tabName: RepTab,
  rep: CsRepLookup,
  rows: unknown[][],
  complaintAliases: Map<string, string>,
): { parsed: ParsedRow[]; stats: TabStats } {
  const stats: TabStats = {
    rowsRead: rows.length,
    rowsParsed: 0,
    rowsUpserted: 0,
    blankSkipped: 0,
    unparseableDate: 0,
    unknownCategory: 0,
    compositeSplits: 0,
  };
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const sheetRowNumber = i + 2; // range starts at row 2

    // A complaint row needs at least one of the three CS signals to be
    // considered populated. Rows containing only special-task data (cols
    // O–AC, which we don't read) appear blank here and are correctly
    // skipped.
    const natureCell = trimOrNull(row[COL.NATURE_OF_COMPLAINT]);
    const channelCell = trimOrNull(row[COL.CHANNEL]);
    const statusCell = trimOrNull(row[COL.STATUS_OF_COMPLAINT]);
    if (!natureCell && !channelCell && !statusCell) {
      stats.blankSkipped++;
      continue;
    }

    const flags: QualityFlags = {};

    // Date parsing — reuses Bank Deposit's serial-or-D/M/YYYY-text path.
    let log_date: string | null = null;
    const rawDate = row[COL.DATE];
    const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;
    if (!dateIsEmpty) {
      log_date = parseSheetDate(rawDate);
      if (log_date === null) {
        flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = String(rawDate);
        stats.unparseableDate++;
      }
    }

    const customer_name = trimOrNull(row[COL.CUSTOMER_NAME]);
    const channel = channelCell;
    const resolution_status = statusCell;

    // Build a single raw_row jsonb that's the same on every split — the
    // composite split is a parsing detail, not source-of-truth altering.
    const raw_row: Record<string, unknown> = {};
    RAW_ROW_KEYS.forEach((key, idx) => {
      raw_row[key] = row[idx] ?? null;
    });

    // Composite split.
    const parts = natureCell ? splitComposite(natureCell) : [];
    const splitCount = Math.max(parts.length, 1);
    if (splitCount > 1) stats.compositeSplits++;

    // splitCount=0 case: natureCell was empty but we have channel/status data —
    // still emit 1 row with a null complaint to capture the log entry.
    for (let s = 0; s < splitCount; s++) {
      const part = parts[s] ?? null;
      let complaint_category_id: string | null = null;
      if (part) {
        complaint_category_id = lookupCanonical(complaintAliases, part);
        if (complaint_category_id === null) {
          flags[QUALITY_FLAGS.UNKNOWN_COMPLAINT_CATEGORY] = part;
          stats.unknownCategory++;
        }
      }

      parsed.push({
        source_sheet: SOURCE_SHEET,
        source_tab: tabName,
        source_row_id: `row-${sheetRowNumber}-${s + 1}`,
        raw_row,
        quality_flags: { ...flags },
        log_date,
        rep_id: rep.id,
        channel,
        complaint_category_id,
        complaint_raw: part,
        resolution_status,
        resolution_duration: null,
        customer_name,
      });
    }

    stats.rowsParsed++;
  }

  stats.rowsUpserted = parsed.length;
  return { parsed, stats };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const startedAt = new Date().toISOString();
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const spreadsheetId = Deno.env.get('SHEET_ID_CUSTOMER_SUPPORT');
    if (!spreadsheetId) throw new Error('Missing env: SHEET_ID_CUSTOMER_SUPPORT');

    const [accessToken, complaintAliases, reps] = await Promise.all([
      getSheetsAccessToken(),
      loadComplaintAliases(supabase),
      loadActiveCustomerServiceReps(supabase),
    ]);

    // Resolve each tab to its rep_id up-front; bail with a clear error if any
    // tab has no matching rep (would fail FK insert otherwise).
    const tabToRep = new Map<RepTab, CsRepLookup>();
    const missing: string[] = [];
    for (const tab of REP_TABS) {
      const rep = reps.get(tab.toLowerCase());
      if (!rep) missing.push(tab);
      else tabToRep.set(tab, rep);
    }
    if (missing.length) {
      throw new Error(
        `No active customer_service_reps row matches tab names: ${missing.join(', ')}. ` +
          `Check the seed in migration 002 or the rep's active=true flag.`,
      );
    }

    const allRows: ParsedRow[] = [];
    const tabStats: Record<string, TabStats> = {};

    for (const tab of REP_TABS) {
      const range = `${tab}!${READ_RANGE_SUFFIX}`;
      const data = await readSheetValues(accessToken, spreadsheetId, range);
      const { parsed, stats } = parseTab(
        tab,
        tabToRep.get(tab)!,
        data.values ?? [],
        complaintAliases,
      );
      allRows.push(...parsed);
      tabStats[tab] = stats;
    }

    // Upsert in chunks. With 10k+ logical rows across 5 reps + composite
    // splits, total log-row count could exceed 12k. 500/chunk keeps each
    // request well under any size limit.
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('customer_support_logs')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`customer_support_logs upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } =
      await supabase.rpc('refresh_customer_support_monthly');
    if (refreshError) throw new Error(`Aggregate refresh failed: ${refreshError.message}`);

    const flagCounts: Record<string, number> = {};
    for (const r of allRows) {
      for (const key of Object.keys(r.quality_flags)) {
        flagCounts[key] = (flagCounts[key] ?? 0) + 1;
      }
    }

    return jsonResponse({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      source: { sheet: SOURCE_SHEET },
      tabsIngested: REP_TABS.length,
      tabStats,
      rowsUpserted: upserted,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-customer-support failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

// Ingest the Bank Deposit Mirror `2026 Weekly Sales Report` tab into
// public.weekly_sales, then refresh plot_sales_monthly.
//
// Source-of-truth role (supervisor non-negotiable #1):
//   * Bank Deposit  → revenue (amount_received)
//   * Weekly Sales  → plot counts + contract values (payable side)
//   * Customer File → customer-level demographics
// This function ingests the second of those three.
//
// Sheet shape (inspected 2026-05-18 via scripts/inspect-sheet-structure.mjs):
//   Header row 1: ['', NAMES, LOCATION, PLOT TYPE, AMOUNT, INITIAL, DATE, SALES PERSON]
//   Data starts at row 2. The supervisor groups same-date sales by inserting
//   "date-marker" rows that contain ONLY a serial-number date in column B
//   (e.g. `['', 46042]`). Those rows have no name, no plot type, no amount —
//   they are visual anchors. We skip them.
//
// Plot type column carries the COUNT inside the cell value ("3 EXECUTIVE" → 3
// plots of Executive). Parsed by _shared/parsePlotType.ts → parseWeeklySalesPlotType.
//
// Date handling: every data row has its own DATE in column G. No forward-fill
// needed here (unlike Bank Deposit and Customer File which forward-fill from
// the supervisor's ledger convention).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  parseSheetDate,
  readSheetValues,
} from '../_shared/sheetsAuth.ts';
import {
  loadCanonicalLookups,
  lookupCanonical,
} from '../_shared/canonicalLookup.ts';
import {
  loadPlotTypeLookup,
  parseWeeklySalesPlotType,
} from '../_shared/parsePlotType.ts';
import { QUALITY_FLAGS, type QualityFlags } from '../_shared/quality_flags.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { discoverYearTabs } from '../_shared/yearTabs.ts';

const SOURCE_SHEET = 'bank_deposit_mirror';
// Year-agnostic discovery — picks up "2027 Weekly Sales Report" automatically
// when the supervisor adds it to the same spreadsheet (carryover fix
// 2026-06-04). Read columns A:H; col A is empty by convention on this tab but
// we still read the full 8-col span so `raw_row` is a faithful traceback.
const TAB_PATTERN = /^(\d{4}) Weekly Sales Report$/;
const READ_RANGE_SUFFIX = 'A2:H';

// Named column constants (0-indexed within each row array from the API).
// Header inspected 2026-05-18: ['', NAMES, LOCATION, PLOT TYPE, AMOUNT, INITIAL, DATE, SALES PERSON]
const COL = {
  // 0: blank — always empty on this tab
  CUSTOMER_NAME: 1,
  LOCATION: 2,
  PLOT_TYPE: 3,
  AMOUNT: 4,
  INITIAL: 5,
  DATE: 6,
  SALES_PERSON: 7,
} as const;

// Stable keys for raw_row jsonb. Downstream queries depend on these.
const RAW_ROW_KEYS = [
  '_blank_A',
  'NAMES',
  'LOCATION',
  'PLOT TYPE',
  'AMOUNT',
  'INITIAL',
  'DATE',
  'SALES PERSON',
] as const;

type ParsedRow = {
  source_sheet: string;
  source_tab: string;
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  week_ending: string | null;
  amount: number | null;
  customer_name: string | null;
  sales_person: string | null;
  location_id: string | null;
  plot_type_id: string | null;
  plot_size_raw: string | null;
  plot_count: number | null;
  realtor_manager_id: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return String(v);
    return null;
  }
  const t = v.trim();
  return t.length ? t : null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.\-]/g, '');
    if (!cleaned) return null;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Detect date-marker rows: ONLY column B (index 1) is populated, and it's a
// number (the serial date). Everything else empty. These rows visually anchor
// a date block in the source sheet but contain no transaction. Skip them.
function isDateMarkerRow(row: unknown[]): boolean {
  if (row.length === 0) return false;
  if (typeof row[COL.CUSTOMER_NAME] !== 'number') return false;
  // Every other relevant column must be empty
  for (let i = 0; i < row.length; i++) {
    if (i === COL.CUSTOMER_NAME) continue;
    const v = row[i];
    if (v !== '' && v !== null && v !== undefined) return false;
  }
  return true;
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

    const spreadsheetId = Deno.env.get('SHEET_ID_BANK_DEPOSIT');
    if (!spreadsheetId) throw new Error('Missing env: SHEET_ID_BANK_DEPOSIT');

    const [accessToken, lookups, plotTypeLookup] = await Promise.all([
      getSheetsAccessToken(),
      loadCanonicalLookups(supabase),
      loadPlotTypeLookup(supabase),
    ]);

    const yearTabs = await discoverYearTabs(accessToken, spreadsheetId, TAB_PATTERN);
    if (yearTabs.length === 0) {
      throw new Error(
        'No "<year> Weekly Sales Report" tab found (expected e.g. "2026 Weekly Sales Report").',
      );
    }

    const parsed: ParsedRow[] = [];
    let rowsRead = 0;
    let blankSkipped = 0;
    let dateMarkerSkipped = 0;
    // One pass per year tab. source_row_id (`row-{N}`) resets per tab, but
    // source_tab differs per tab so the (sheet, tab, row_id) key stays unique.
    for (const { tab: sourceTab } of yearTabs) {
     const sheetData = await readSheetValues(
       accessToken,
       spreadsheetId,
       `${sourceTab}!${READ_RANGE_SUFFIX}`,
     );
     const rawRows = sheetData.values ?? [];
     rowsRead += rawRows.length;
     for (let i = 0; i < rawRows.length; i++) {
      const sheetRowNumber = i + 2; // range starts at A2
      const row = rawRows[i] ?? [];

      // Skip totally blank rows.
      if (!row.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
        blankSkipped++;
        continue;
      }

      // Skip date-marker rows (visual anchors with only the date in col B).
      if (isDateMarkerRow(row)) {
        dateMarkerSkipped++;
        continue;
      }

      const flags: QualityFlags = {};

      // Date: column G is the row's own date (serial number). No forward-fill.
      const rawDate = row[COL.DATE];
      const week_ending = parseSheetDate(rawDate);
      const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;
      if (!dateIsEmpty && week_ending === null) {
        flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = true;
      }

      // Customer name (col B).
      const customer_name = trimOrNull(row[COL.CUSTOMER_NAME]);

      // Location (col C) → canonical lookup. Missing → unknown_location.
      const locationRaw = trimOrNull(row[COL.LOCATION]);
      const location_id = locationRaw ? lookupCanonical(lookups.locationByAlias, locationRaw) : null;
      if (locationRaw && !location_id) flags[QUALITY_FLAGS.UNKNOWN_LOCATION] = locationRaw;

      // Plot type (col D) → parser. Count comes from inside the cell value.
      const plotTypeRaw = trimOrNull(row[COL.PLOT_TYPE]);
      const parsedPlot = plotTypeRaw ? parseWeeklySalesPlotType(plotTypeRaw) : null;
      let plot_type_id: string | null = null;
      let plot_count: number | null = null;
      if (parsedPlot) {
        plot_type_id = plotTypeLookup.get(parsedPlot.canonicalName) ?? null;
        plot_count = parsedPlot.count;
      } else if (plotTypeRaw) {
        flags[QUALITY_FLAGS.UNPARSEABLE_PLOT_TYPE] = plotTypeRaw;
      }

      // Amount (col E). May be missing on some rows.
      const amount = toNumberOrNull(row[COL.AMOUNT]);

      // Sales person (col H) — free text, optional. Flag if absent.
      const sales_person = trimOrNull(row[COL.SALES_PERSON]);
      if (!sales_person) flags[QUALITY_FLAGS.NULL_SALES_PERSON] = true;

      // raw_row preserves all 8 cols for traceback.
      const raw_row: Record<string, unknown> = {};
      RAW_ROW_KEYS.forEach((key, idx) => {
        raw_row[key] = row[idx] ?? null;
      });

      parsed.push({
        source_sheet: SOURCE_SHEET,
        source_tab: sourceTab,
        source_row_id: `row-${sheetRowNumber}`,
        raw_row,
        quality_flags: flags,
        week_ending,
        amount,
        customer_name,
        sales_person,
        location_id,
        plot_type_id,
        plot_size_raw: plotTypeRaw,
        plot_count,
        realtor_manager_id: null, // Weekly Sales has no realtor-manager column
      });
     }
    }

    // Chunked upsert. ~50 rows YTD fit in one chunk easily.
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('weekly_sales')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`weekly_sales upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } = await supabase
      .rpc('refresh_plot_sales_monthly');
    if (refreshError) throw new Error(`Aggregate refresh failed: ${refreshError.message}`);

    // Tally flag counts for ops triage.
    const flagCounts: Record<string, number> = {};
    for (const r of parsed) {
      for (const key of Object.keys(r.quality_flags)) {
        flagCounts[key] = (flagCounts[key] ?? 0) + 1;
      }
    }

    return jsonResponse({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      source: { sheet: SOURCE_SHEET, tabs: yearTabs.map((t) => t.tab) },
      rowsRead,
      rowsUpserted: upserted,
      blankSkipped,
      dateMarkerSkipped,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-weekly-sales failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

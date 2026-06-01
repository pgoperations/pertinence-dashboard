// Ingest the Bank Deposit Mirror `2026 LAND` tab into public.bank_deposits.
//
// Trigger paths:
//   * Scheduled (every 15 min) via Supabase cron — wired in step 9 of the roadmap (HARD launch requirement; not yet deployed)
//   * Admin "Re-pull from Sheets" button from the dashboard — also step 9
//
// Contracts (locked in DESIGN_DECISIONS.md):
//   * Auth: native Deno crypto.subtle JWT sign (no external libs)
//   * Sheets read: valueRenderOption=UNFORMATTED_VALUE → dates as serials,
//     amounts as numbers. Locale-free.
//   * Named column constants here, never positional indexes. The HR dashboard
//     burned us on positional reads — never again.
//   * `CLIENT  NAME` (column I) has an intentional double space. Match exactly.
//   * source_row_id: TRANS CODE if non-empty, else `row-{N}` (1-indexed sheet row).
//   * Idempotent upsert keyed on (source_sheet, source_tab, source_row_id).
//   * After ingest, refresh sales_by_location_monthly via the RPC in migration 010.
//
// Date handling (revised 2026-05-21):
//   * Source of truth for txn_date is column L, NOT column A. Column A is the
//     bank mirror's raw paste — it writes M/D/YYYY strings into a D/M/Y-locale
//     sheet, so day/month get swapped on some entries (e.g. "01/06/2026" Jan 6
//     → serial June 1). Column L is the supervisor's working ledger date,
//     sequential and clean. The brief's earlier "column A is the real txn
//     date" decision (2026-05-11) is superseded by today's session.
//   * UNFORMATTED_VALUE serial numbers go through sheetsSerialToIsoDate; text
//     dates go through parseDmyTextDate. Both are needed because some L cells
//     are typed text and others are date-formatted.
//   * Empty column L → forward-fill from the most recently parsed date.
//   * Non-empty but unparseable cell → flagged with unparseable_date and NOT
//     forward-filled, so a typo can't silently inherit a neighbouring date.
//   * Column M (status) remains out of scope. Column A's value is preserved
//     in raw_row as `DATE A` for traceability against the bank source.
//
// Quality flags emitted (from _shared/quality_flags.ts):
//   * unknown_purpose, unknown_location  — alias didn't match a canonical
//   * unparseable_date                    — non-empty but unparseable cell
//   * null_sales_person                   — column J empty (~56% of 2026 LAND)

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
import { QUALITY_FLAGS, type QualityFlags } from '../_shared/quality_flags.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SOURCE_SHEET = 'bank_deposit_mirror';
const SOURCE_TAB = '2026 LAND';
// Read columns A:M. We discard L/M (out of scope) but reading them keeps the
// `raw_row` jsonb a faithful traceback record of what was on the sheet.
const READ_RANGE = `${SOURCE_TAB}!A2:M`;

// Named column constants (0-indexed within each row array from the API).
// Matches the header row inspected 2026-05-11:
// ['DATE','BANK STATEMENT DETAILS','AMOUNT','BANK ACCOUNT','PURPOSE','LOCATION',
//  'ACCOUNT PAYMENT NAME','TRANS CODE','CLIENT  NAME','SALES PERSON','','DATE', '']
const COL = {
  DATE_A: 0,                  // bank-mirror raw date; preserved in raw_row only
  BANK_STATEMENT_DETAILS: 1,
  AMOUNT: 2,
  BANK_ACCOUNT: 3,
  PURPOSE: 4,
  LOCATION: 5,
  ACCOUNT_PAYMENT_NAME: 6,
  TRANS_CODE: 7,
  CLIENT_NAME: 8,             // header literally `CLIENT  NAME` (double space — supervisor confirmed)
  SALES_PERSON: 9,
  // 10: blank header column
  DATE: 11,                   // column L — supervisor's clean working date (source of truth, locked 2026-05-21)
  // 12: status (e.g. "ALERT SENT") — out of scope
} as const;

// Header keys for raw_row jsonb. Stable contract for downstream querying.
// `DATE A` keeps the bank-mirror's raw date for traceback; `DATE` is the
// column-L value the ingest uses for txn_date.
const RAW_ROW_KEYS = [
  'DATE A',
  'BANK STATEMENT DETAILS',
  'AMOUNT',
  'BANK ACCOUNT',
  'PURPOSE',
  'LOCATION',
  'ACCOUNT PAYMENT NAME',
  'TRANS CODE',
  'CLIENT  NAME',
  'SALES PERSON',
  null,    // col K — blank header
  'DATE',
] as const;

type ParsedRow = {
  source_sheet: string;
  source_tab: string;
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  txn_date: string | null;
  amount_received: number;
  amount_payable: number | null;
  customer_name: string | null;
  sales_person: string | null;
  location_id: string | null;
  purpose_id: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') {
    if (typeof v === 'number') return String(v);
    return null;
  }
  const t = v.trim();
  return t.length ? t : null;
}

function toNumberOrZero(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.\-]/g, '');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseRow(
  row: unknown[],
  sheetRowNumber: number,
  txn_date: string | null,
  dateUnparseable: boolean,
  dateFallbackToA: unknown,
  lookups: { locationByAlias: Map<string, string>; purposeByAlias: Map<string, string> },
): ParsedRow | null {
  // Skip totally blank rows (rare but happen in spreadsheets).
  if (!row.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
    return null;
  }

  const flags: QualityFlags = {};
  if (dateUnparseable) flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = true;
  if (dateFallbackToA !== null) {
    flags[QUALITY_FLAGS.DATE_FALLBACK_TO_A] = `column-A: ${String(dateFallbackToA)}`;
  }

  const amount_received = toNumberOrZero(row[COL.AMOUNT]);

  const purposeRaw = trimOrNull(row[COL.PURPOSE]);
  const purpose_id = purposeRaw ? lookupCanonical(lookups.purposeByAlias, purposeRaw) : null;
  if (purposeRaw && !purpose_id) flags[QUALITY_FLAGS.UNKNOWN_PURPOSE] = purposeRaw;

  const locationRaw = trimOrNull(row[COL.LOCATION]);
  const location_id = locationRaw ? lookupCanonical(lookups.locationByAlias, locationRaw) : null;
  if (locationRaw && !location_id) flags[QUALITY_FLAGS.UNKNOWN_LOCATION] = locationRaw;

  const customer_name = trimOrNull(row[COL.CLIENT_NAME]);
  const sales_person = trimOrNull(row[COL.SALES_PERSON]);
  if (!sales_person) flags[QUALITY_FLAGS.NULL_SALES_PERSON] = true;

  const transCode = trimOrNull(row[COL.TRANS_CODE]);
  const source_row_id = transCode ?? `row-${sheetRowNumber}`;

  const raw_row: Record<string, unknown> = {};
  RAW_ROW_KEYS.forEach((key, idx) => {
    if (key !== null) raw_row[key] = row[idx] ?? null;
  });

  return {
    source_sheet: SOURCE_SHEET,
    source_tab: SOURCE_TAB,
    source_row_id,
    raw_row,
    quality_flags: flags,
    txn_date,
    amount_received,
    amount_payable: null, // 2026 LAND has no payable column; reserved for future sources.
    customer_name,
    sales_person,
    location_id,
    purpose_id,
  };
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

    const [accessToken, lookups] = await Promise.all([
      getSheetsAccessToken(),
      loadCanonicalLookups(supabase),
    ]);

    const sheetData = await readSheetValues(accessToken, spreadsheetId, READ_RANGE);
    const rawRows = sheetData.values ?? [];

    // Date strategy on 2026 LAND:
    //   * Primary: column L (supervisor's clean working ledger).
    //   * Tail fallback: column A is consulted ONLY for rows AFTER the last
    //     non-blank L row. That section is the supervisor's L lag (he hasn't
    //     filled L for the latest bank entries yet). Within L's covered range
    //     we keep the forward-fill convention — using A there would expose us
    //     to M/D/Y typos like serial 46238 (Aug 4) that should really be Apr 4.
    //   * Empty both (and inside L's coverage) → forward-fill from L.
    //   * Non-empty but unparseable → flagged + NOT forward-filled.
    let lastLNonBlankRow = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const v = (rawRows[i] ?? [])[COL.DATE];
      if (v !== '' && v !== null && v !== undefined) lastLNonBlankRow = i;
    }

    const parsed: ParsedRow[] = [];
    let blankSkipped = 0;
    let fallbackRowIdCount = 0;
    let forwardFilledDateCount = 0;
    let dateFallbackCount = 0;
    let lastValidDate: string | null = null;
    for (let i = 0; i < rawRows.length; i++) {
      const sheetRowNumber = i + 2; // range starts at A2
      const row = rawRows[i] ?? [];
      const rawL = row[COL.DATE];
      const rawA = row[COL.DATE_A];
      const lEmpty = rawL === '' || rawL === undefined || rawL === null;
      const aEmpty = rawA === '' || rawA === undefined || rawA === null;
      const inLTail = i > lastLNonBlankRow;

      let txn_date: string | null;
      let dateUnparseable = false;
      let dateFallbackToA: unknown = null;

      if (!lEmpty) {
        txn_date = parseSheetDate(rawL);
        if (txn_date === null) dateUnparseable = true;
        else lastValidDate = txn_date;
      } else if (inLTail && !aEmpty) {
        // We're past the last L-filled row AND this row has a column-A date.
        // Supervisor hasn't backfilled L yet for this entry.
        txn_date = parseSheetDate(rawA);
        if (txn_date === null) {
          dateUnparseable = true;
        } else {
          lastValidDate = txn_date;
          dateFallbackToA = rawA;
          dateFallbackCount++;
        }
      } else {
        // L blank inside L's coverage (or both blank in the tail) → forward-fill.
        txn_date = lastValidDate;
        if (txn_date !== null) forwardFilledDateCount++;
      }

      const parsedRow = parseRow(row, sheetRowNumber, txn_date, dateUnparseable, dateFallbackToA, lookups);
      if (!parsedRow) {
        blankSkipped++;
        continue;
      }
      if (parsedRow.source_row_id.startsWith('row-')) fallbackRowIdCount++;
      // Stash the sheet row number for the dedup pass below.
      (parsedRow as ParsedRow & { _sheetRow: number })._sheetRow = sheetRowNumber;
      parsed.push(parsedRow);
    }

    // Defend against duplicate TRANS CODE entries on the sheet: without this,
    // two rows sharing one code would collide on the (source_sheet, source_tab,
    // source_row_id) unique key and the second upsert would silently overwrite
    // the first. First occurrence keeps the natural id; subsequent occurrences
    // get `{id}-row{sheetRow}` appended, which is stable across re-ingests as
    // long as rows aren't reordered.
    const seenIds = new Set<string>();
    const duplicateTransCodes: string[] = [];
    for (const r of parsed) {
      if (seenIds.has(r.source_row_id)) {
        duplicateTransCodes.push(r.source_row_id);
        const sheetRow = (r as ParsedRow & { _sheetRow: number })._sheetRow;
        r.source_row_id = `${r.source_row_id}-row${sheetRow}`;
      }
      seenIds.add(r.source_row_id);
      delete (r as Partial<ParsedRow & { _sheetRow: number }>)._sheetRow;
    }

    // Upsert in chunks. supabase-js handles arrays fine, but very large batches
    // can hit request-size limits. 500 rows × ~20 cols of jsonb is well under
    // any limit; 426 valid YTD rows fit in a single batch today.
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('bank_deposits')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`bank_deposits upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } = await supabase
      .rpc('refresh_sales_by_location_monthly');
    if (refreshError) throw new Error(`Aggregate refresh failed: ${refreshError.message}`);

    // Tally quality flags so the response is greppable for ops triage.
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
      source: { sheet: SOURCE_SHEET, tab: SOURCE_TAB, range: READ_RANGE },
      rowsRead: rawRows.length,
      rowsUpserted: upserted,
      blankSkipped,
      fallbackRowIdCount,
      forwardFilledDateCount,
      dateFallbackCount,
      duplicateTransCodes,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-bank-deposit failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

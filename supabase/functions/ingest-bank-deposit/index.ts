// Ingest the Bank Deposit Mirror `2026 LAND` tab into public.bank_deposits.
//
// Trigger paths:
//   * Scheduled (every 15 min) via Supabase cron (Phase 3 wiring TBD)
//   * Manual "Refresh now" button from the dashboard (Phase 5+)
//
// Contracts (locked in DESIGN_DECISIONS.md):
//   * Auth: native Deno crypto.subtle JWT sign (no external libs)
//   * Sheets read: valueRenderOption=UNFORMATTED_VALUE → dates as serials,
//     amounts as numbers. Locale-free.
//   * Named column constants here, never positional indexes. The HR dashboard
//     burned us on positional reads — never again.
//   * `CLIENT  NAME` (column I) has an intentional double space. Match exactly.
//   * Columns L (second DATE) and M (status) are out of scope per supervisor.
//   * source_row_id: TRANS CODE if non-empty, else `row-{N}` (1-indexed sheet row).
//   * Idempotent upsert keyed on (source_sheet, source_tab, source_row_id).
//   * After ingest, refresh sales_by_location_monthly via the RPC in migration 010.
//
// Date handling:
//   * UNFORMATTED_VALUE serial numbers go through sheetsSerialToIsoDate.
//   * Text dates ("13/01/2026", D/M/YYYY Nigerian convention) go through
//     parseDmyTextDate. ~60 such rows exist on 2026 LAND because some entries
//     were typed instead of date-formatted.
//   * Empty column A → forward-fill from the most recently parsed date on
//     this sheet. The supervisor's ledger convention is to enter the date
//     once per day and leave subsequent same-day deposits blank in column A.
//   * Non-empty but unparseable cell → real anomaly. Flagged with
//     unparseable_date and NOT forward-filled, so a typo can't silently
//     inherit a neighbouring date.
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
  DATE: 0,
  BANK_STATEMENT_DETAILS: 1,
  AMOUNT: 2,
  BANK_ACCOUNT: 3,
  PURPOSE: 4,
  LOCATION: 5,
  ACCOUNT_PAYMENT_NAME: 6,
  TRANS_CODE: 7,
  CLIENT_NAME: 8, // header literally `CLIENT  NAME` (double space — supervisor confirmed)
  SALES_PERSON: 9,
  // 10: blank header
  // 11: second DATE — out of scope
  // 12: status (e.g. "ALERT SENT") — out of scope
} as const;

// Header keys for raw_row jsonb. Stable contract for downstream querying.
const RAW_ROW_KEYS = [
  'DATE',
  'BANK STATEMENT DETAILS',
  'AMOUNT',
  'BANK ACCOUNT',
  'PURPOSE',
  'LOCATION',
  'ACCOUNT PAYMENT NAME',
  'TRANS CODE',
  'CLIENT  NAME',
  'SALES PERSON',
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
  lookups: { locationByAlias: Map<string, string>; purposeByAlias: Map<string, string> },
): ParsedRow | null {
  // Skip totally blank rows (rare but happen in spreadsheets).
  if (!row.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
    return null;
  }

  const flags: QualityFlags = {};
  if (dateUnparseable) flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = true;

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
    raw_row[key] = row[idx] ?? null;
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

    // Forward-fill convention on 2026 LAND: the supervisor enters the date
    // once for a day's first deposit and leaves column A blank for subsequent
    // deposits on the same date. Empty cell => same as the row above. We carry
    // the last successfully parsed date across rows so `txn_date` reflects what
    // the supervisor sees visually. A non-empty but unparseable date cell is
    // treated as a real anomaly (flagged with unparseable_date, NOT forward-
    // filled) so genuine typos don't silently inherit a wrong date.
    const parsed: ParsedRow[] = [];
    let blankSkipped = 0;
    let fallbackRowIdCount = 0;
    let forwardFilledDateCount = 0;
    let lastValidDate: string | null = null;
    for (let i = 0; i < rawRows.length; i++) {
      const sheetRowNumber = i + 2; // range starts at A2
      const row = rawRows[i] ?? [];
      const rawDate = row[COL.DATE];
      const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;

      let txn_date: string | null;
      let dateUnparseable = false;
      if (dateIsEmpty) {
        txn_date = lastValidDate;
        if (txn_date !== null) forwardFilledDateCount++;
      } else {
        txn_date = parseSheetDate(rawDate);
        if (txn_date === null) {
          dateUnparseable = true;
        } else {
          lastValidDate = txn_date;
        }
      }

      const parsedRow = parseRow(row, sheetRowNumber, txn_date, dateUnparseable, lookups);
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

    return new Response(
      JSON.stringify({
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        source: { sheet: SOURCE_SHEET, tab: SOURCE_TAB, range: READ_RANGE },
        rowsRead: rawRows.length,
        rowsUpserted: upserted,
        blankSkipped,
        fallbackRowIdCount,
        forwardFilledDateCount,
        duplicateTransCodes,
        flagCounts,
        aggregateRowsInserted: refreshResult,
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-bank-deposit failed:', message);
    return new Response(
      JSON.stringify({ ok: false, startedAt, error: message }, null, 2),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

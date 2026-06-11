// Ingest the Bank Deposit Mirror `2026 LAND` tab into public.bank_deposits.
//
// Trigger paths:
//   * Scheduled (every 15 min) via pg_cron + pg_net — see migration 019 (live)
//   * On-demand "Sync Sheets" button in the app header (RepullButton)
//
// Contracts (locked in DESIGN_DECISIONS.md):
//   * Auth: native Deno crypto.subtle JWT sign (no external libs)
//   * Sheets read: valueRenderOption=UNFORMATTED_VALUE → dates as serials,
//     amounts as numbers. Locale-free.
//   * Named column constants here, never positional indexes. The HR dashboard
//     burned us on positional reads — never again.
//   * `CLIENT  NAME` (column I) has an intentional double space. Match exactly.
//   * source_row_id: TRANS CODE if non-empty, else `auto-{contentHash}` — a
//     content-stable id (date+amount+client+…) that survives row moves. Replaces
//     the old positional `row-{N}`, which drifted on every insert/reorder and
//     minted orphan copies (root cause of the 2026-06-11 over-count).
//   * Idempotent upsert keyed on (source_sheet, source_tab, source_row_id), plus
//     a stale-row sweep each run so deleted/edited rows don't linger as orphans.
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
//   * future_txn_date                     — txn_date > run date + 1d grace; also
//                                           rolled up into a self-healing
//                                           data_quality_alerts row (warning)

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
import { discoverYearTabs } from '../_shared/yearTabs.ts';
import { buildIdsByTab, sweepStaleRows } from '../_shared/sweepStaleRows.ts';

const SOURCE_SHEET = 'bank_deposit_mirror';
// Year-agnostic discovery — picks up "2027 LAND" automatically when the
// supervisor adds it to the same Bank Deposit Mirror spreadsheet (carryover
// fix 2026-06-04). This is the financial source of truth, so it MUST carry
// over. Read columns A:M; we discard L/M (out of scope) but reading them keeps
// the `raw_row` jsonb a faithful traceback record of what was on the sheet.
const TAB_PATTERN = /^(\d{4}) LAND$/;
const READ_RANGE_SUFFIX = 'A2:M';

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

// FNV-1a 32-bit hash → 8-char hex. Builds a CONTENT-STABLE source_row_id for rows
// with no TRANS CODE, so they keep one identity across sheet edits. The old
// positional `row-{N}` drifted whenever rows were inserted/reordered, minting
// orphan copies that the upsert never cleaned up.
function contentHash(parts: Array<string | number | null | undefined>): string {
  const s = parts.map((p) => (p == null ? '' : String(p))).join('');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// A structurally empty row: no money AND no identifying content — a spacer,
// date-marker, or status-only row between date groups on the sheet. These used to
// ingest as zero-amount `row-{N}` rows and multiply across syncs, inflating every
// count. A real deposit always carries an AMOUNT (and usually a TRANS CODE).
function isNoiseRow(row: unknown[]): boolean {
  if (toNumberOrZero(row[COL.AMOUNT]) !== 0) return false;
  return !(
    trimOrNull(row[COL.TRANS_CODE]) ||
    trimOrNull(row[COL.CLIENT_NAME]) ||
    trimOrNull(row[COL.SALES_PERSON]) ||
    trimOrNull(row[COL.PURPOSE]) ||
    trimOrNull(row[COL.LOCATION]) ||
    trimOrNull(row[COL.BANK_STATEMENT_DETAILS]) ||
    trimOrNull(row[COL.ACCOUNT_PAYMENT_NAME]) ||
    trimOrNull(row[COL.BANK_ACCOUNT])
  );
}

function parseRow(
  row: unknown[],
  txn_date: string | null,
  dateUnparseable: boolean,
  dateFallbackToA: unknown,
  futureThreshold: string,
  lookups: { locationByAlias: Map<string, string>; purposeByAlias: Map<string, string> },
  sourceTab: string,
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
  // Future-dated row → almost certainly a date typo in column L. Flag it; the
  // serve handler rolls these up into a data_quality_alerts row.
  if (txn_date && txn_date > futureThreshold) {
    flags[QUALITY_FLAGS.FUTURE_TXN_DATE] = txn_date;
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
  const source_row_id = transCode ??
    `auto-${contentHash([
      txn_date,
      amount_received,
      customer_name,
      sales_person,
      purposeRaw,
      locationRaw,
      trimOrNull(row[COL.BANK_STATEMENT_DETAILS]),
      trimOrNull(row[COL.ACCOUNT_PAYMENT_NAME]),
    ])}`;

  const raw_row: Record<string, unknown> = {};
  RAW_ROW_KEYS.forEach((key, idx) => {
    if (key !== null) raw_row[key] = row[idx] ?? null;
  });

  return {
    source_sheet: SOURCE_SHEET,
    source_tab: sourceTab,
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

    const yearTabs = await discoverYearTabs(accessToken, spreadsheetId, TAB_PATTERN);
    if (yearTabs.length === 0) {
      throw new Error('No "<year> LAND" tab found (expected e.g. "2026 LAND").');
    }

    // Future-date threshold: ingest UTC date + 1 day of grace. The grace absorbs
    // the Lagos (UTC+1) timezone boundary so a legitimately same-day entry near
    // midnight isn't flagged; anything dated 2+ days ahead is a real anomaly.
    const runDate = startedAt.slice(0, 10);
    const graceIso = new Date(Date.parse(`${runDate}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);

    const parsed: ParsedRow[] = [];
    let rowsRead = 0;
    let blankSkipped = 0;
    let noiseSkipped = 0;
    let autoIdCount = 0;
    let forwardFilledDateCount = 0;
    let dateFallbackCount = 0;
    const duplicateTransCodes: string[] = [];

    // One pass per year tab (e.g. "2026 LAND", "2027 LAND"). The L-tail date
    // logic, forward-fill, and TRANS-CODE dedup are all per-tab: a new year's
    // ledger starts its own date sequence and its own row numbering, and the
    // (sheet, tab, row_id) unique key keeps tabs from colliding.
    for (const { tab: sourceTab } of yearTabs) {
      const sheetData = await readSheetValues(
        accessToken,
        spreadsheetId,
        `${sourceTab}!${READ_RANGE_SUFFIX}`,
      );
      const rawRows = sheetData.values ?? [];
      rowsRead += rawRows.length;

      // Date strategy on a LAND tab:
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

      const tabParsed: ParsedRow[] = [];
      let lastValidDate: string | null = null;
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i] ?? [];
        // Spacer / date-marker / status-only row — drop before it pollutes counts.
        if (isNoiseRow(row)) {
          noiseSkipped++;
          continue;
        }
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

        const parsedRow = parseRow(row, txn_date, dateUnparseable, dateFallbackToA, graceIso, lookups, sourceTab);
        if (!parsedRow) {
          blankSkipped++;
          continue;
        }
        if (parsedRow.source_row_id.startsWith('auto-')) autoIdCount++;
        tabParsed.push(parsedRow);
      }

      // Disambiguate any source_row_id that recurs within this tab's run — a
      // duplicate TRANS CODE typed on the sheet, or two code-less rows whose
      // content hashes collide. Append an OCCURRENCE index (`-2`, `-3`, …) rather
      // than the sheet row number, so the id stays stable across reorderings.
      // Combined with the stale-row sweep below, any churn is self-correcting:
      // orphaned variants are deleted on the next run. Per-tab — the same code
      // can legitimately recur across different years' tabs.
      const occurrences = new Map<string, number>();
      for (const r of tabParsed) {
        const n = (occurrences.get(r.source_row_id) ?? 0) + 1;
        occurrences.set(r.source_row_id, n);
        if (n > 1) {
          duplicateTransCodes.push(r.source_row_id);
          r.source_row_id = `${r.source_row_id}-${n}`;
        }
      }

      parsed.push(...tabParsed);
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

    // --- Stale-row sweep: reconcile to exactly what this run produced --------
    // Removes orphans (deleted rows, edited TRANS CODES, drifted positional ids)
    // that the upsert can't. Root cause of the 2026-06-11 over-count — see
    // _shared/sweepStaleRows.ts.
    const orphansDeleted = await sweepStaleRows(
      supabase,
      'bank_deposits',
      SOURCE_SHEET,
      buildIdsByTab(parsed),
    );

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

    // Surface future-dated rows as a SELF-HEALING data_quality_alert (supervisor
    // #3: surface, never silently reconcile). A typo'd ledger date weeks ahead
    // would otherwise become the "latest" week in the dashboard. We clear prior
    // unresolved alerts of this type each run, then re-insert only if any remain
    // — so correcting the sheet + re-syncing makes the alert disappear on its own.
    // Resolved alerts are left untouched. Best-effort: an alert-write failure
    // doesn't fail the ingest (the rows are already flagged + upserted).
    const futureRows = parsed.filter((r) => r.quality_flags[QUALITY_FLAGS.FUTURE_TXN_DATE]);
    let futureAlertError: string | null = null;
    const del = await supabase
      .from('data_quality_alerts')
      .delete()
      .eq('alert_type', QUALITY_FLAGS.FUTURE_TXN_DATE)
      .eq('resolved', false);
    if (del.error) {
      futureAlertError = `clear: ${del.error.message}`;
    } else if (futureRows.length > 0) {
      const { error: insErr } = await supabase.from('data_quality_alerts').insert({
        alert_type: QUALITY_FLAGS.FUTURE_TXN_DATE,
        severity: 'warning',
        period_year: null,
        period_month: null,
        subject: `${futureRows.length} Bank Deposit row(s) dated after ${runDate} — likely a date typo in column L`,
        details: {
          run_date: runDate,
          threshold: graceIso,
          count: futureRows.length,
          source_sheet: SOURCE_SHEET,
          source_tab: yearTabs.map((t) => t.tab).join(', '),
          rows: futureRows.slice(0, 25).map((r) => ({
            source_row_id: r.source_row_id,
            txn_date: r.txn_date,
            amount_received: r.amount_received,
            customer_name: r.customer_name,
            sales_person: r.sales_person,
          })),
        },
      });
      if (insErr) futureAlertError = `insert: ${insErr.message}`;
    }
    if (futureAlertError) console.error('ingest-bank-deposit alert write:', futureAlertError);

    return jsonResponse({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      source: { sheet: SOURCE_SHEET, tabs: yearTabs.map((t) => t.tab) },
      rowsRead,
      rowsUpserted: upserted,
      orphansDeleted,
      blankSkipped,
      noiseSkipped,
      autoIdCount,
      forwardFilledDateCount,
      dateFallbackCount,
      duplicateTransCodes,
      flagCounts,
      futureTxnDateCount: futureRows.length,
      futureAlertError,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-bank-deposit failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

// Ingest the Bank Deposit Mirror `2026 Customer File` tab into public.customer_files.
//
// Source-of-truth role (supervisor non-negotiable #1):
//   * Bank Deposit  → revenue (amount_received)
//   * Weekly Sales  → plot counts + contract values (the "payable" side)
//   * Customer File → customer-level demographics and contract metadata
// This function ingests the third of those three. No aggregate is refreshed —
// Customer File backs the customer ledger / demographics views, not headline
// panels. An aggregate can land in a later migration if a panel needs one.
//
// Sheet shape (inspected 2026-05-18 via scripts/inspect-sheet-structure.mjs):
//   Header row 1: Date, S/N, CLIENT NAME, PHONE NUMBER, DOB, LOCATION,
//     PLOT SIZE, NUMBER OF PLOT, EMAIL ADDRESS, NAME OF SALES PERSON,
//     SALES PERSON EMAIL, APPROVED BY, "FURTHER PAYMENT ASSIGNED TO " (with
//     trailing space — match exactly), TOTAL AMOUNT PAYABLE, INITIAL PAYMENT
//   Data starts at row 2.
//
// Date convention (col A): forward-fill. The supervisor enters the date once
// per day's first customer row and leaves col A blank for subsequent same-day
// customers. Same convention as Bank Deposit 2026 LAND (handled identically).
//
// Plot size column carries a SIZE format ("600SQM" / "1 ACRE"), and the plot
// COUNT lives in a SEPARATE column H (NUMBER OF PLOT). Parsed by
// _shared/parsePlotType.ts → parseCustomerFilePlotSize. Plot count from col H,
// not from the parser (which never returns a count for this convention).
//
// "APPROVED BY" (col L) holds CS rep names (MARY/CATHERINE/MARIAM/etc), NOT
// realtor-manager names. Preserved in raw_row but not surfaced as a typed
// column. realtor_manager_id stays null until a clear source emerges.

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
  parseCustomerFilePlotSize,
} from '../_shared/parsePlotType.ts';
import { QUALITY_FLAGS, type QualityFlags } from '../_shared/quality_flags.ts';

const SOURCE_SHEET = 'bank_deposit_mirror';
const SOURCE_TAB = '2026 Customer File';
// Read columns A:O (15 cols). Future cols beyond O are out of scope for v1.
const READ_RANGE = `${SOURCE_TAB}!A2:O`;

// Named column constants (0-indexed within each row array from the API).
// Header inspected 2026-05-18.
const COL = {
  DATE: 0,
  SN: 1,
  CLIENT_NAME: 2,
  PHONE_NUMBER: 3,
  DOB: 4,
  LOCATION: 5,
  PLOT_SIZE: 6,
  NUMBER_OF_PLOT: 7,
  EMAIL_ADDRESS: 8,
  SALES_PERSON: 9,
  SALES_PERSON_EMAIL: 10,
  APPROVED_BY: 11,
  FURTHER_PAYMENT_ASSIGNED_TO: 12, // header has trailing space — preserved in raw_row key
  TOTAL_AMOUNT_PAYABLE: 13,
  INITIAL_PAYMENT: 14,
} as const;

const RAW_ROW_KEYS = [
  'Date',
  'S/N',
  'CLIENT NAME',
  'PHONE NUMBER',
  'DOB',
  'LOCATION',
  'PLOT SIZE',
  'NUMBER OF PLOT',
  'EMAIL ADDRESS',
  'NAME OF SALES PERSON',
  'SALES PERSON EMAIL',
  'APPROVED BY',
  'FURTHER PAYMENT ASSIGNED TO ', // trailing space matches the sheet header exactly
  'TOTAL AMOUNT PAYABLE',
  'INITIAL PAYMENT (MONTH 1)',
] as const;

type ParsedRow = {
  source_sheet: string;
  source_tab: string;
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  entry_date: string | null;
  amount: number | null;          // INITIAL PAYMENT (the down payment)
  amount_payable: number | null;  // TOTAL AMOUNT PAYABLE (contract value)
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

function toIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  return Math.trunc(n);
}

Deno.serve(async (_req) => {
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

    const sheetData = await readSheetValues(accessToken, spreadsheetId, READ_RANGE);
    const rawRows = sheetData.values ?? [];

    // Forward-fill convention same as Bank Deposit 2026 LAND: empty col A →
    // inherit the last successfully-parsed date. Non-empty but unparseable →
    // flag unparseable_date and do NOT forward-fill (typo can't silently
    // inherit a wrong date).
    const parsed: ParsedRow[] = [];
    let blankSkipped = 0;
    let forwardFilledDateCount = 0;
    let lastValidDate: string | null = null;

    for (let i = 0; i < rawRows.length; i++) {
      const sheetRowNumber = i + 2;
      const row = rawRows[i] ?? [];

      if (!row.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
        blankSkipped++;
        continue;
      }

      const flags: QualityFlags = {};

      // Date: forward-fill identical to Bank Deposit.
      const rawDate = row[COL.DATE];
      const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;
      let entry_date: string | null;
      if (dateIsEmpty) {
        entry_date = lastValidDate;
        if (entry_date !== null) forwardFilledDateCount++;
      } else {
        entry_date = parseSheetDate(rawDate);
        if (entry_date === null) {
          flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = true;
        } else {
          lastValidDate = entry_date;
        }
      }

      // Location → canonical lookup.
      const locationRaw = trimOrNull(row[COL.LOCATION]);
      const location_id = locationRaw ? lookupCanonical(lookups.locationByAlias, locationRaw) : null;
      if (locationRaw && !location_id) flags[QUALITY_FLAGS.UNKNOWN_LOCATION] = locationRaw;

      // Plot size → parser (size only, no count). Plot count from separate col H.
      const plotSizeRaw = trimOrNull(row[COL.PLOT_SIZE]);
      const parsedPlot = plotSizeRaw ? parseCustomerFilePlotSize(plotSizeRaw) : null;
      let plot_type_id: string | null = null;
      if (parsedPlot) {
        plot_type_id = plotTypeLookup.get(parsedPlot.canonicalName) ?? null;
      } else if (plotSizeRaw) {
        flags[QUALITY_FLAGS.UNPARSEABLE_PLOT_TYPE] = plotSizeRaw;
      }
      const plot_count = toIntOrNull(row[COL.NUMBER_OF_PLOT]);

      // Customer + sales person — free text.
      const customer_name = trimOrNull(row[COL.CLIENT_NAME]);
      const sales_person = trimOrNull(row[COL.SALES_PERSON]);
      if (!sales_person) flags[QUALITY_FLAGS.NULL_SALES_PERSON] = true;

      // Two amounts — both nullable on the schema, both on the sheet.
      const amount_payable = toNumberOrNull(row[COL.TOTAL_AMOUNT_PAYABLE]);
      const amount = toNumberOrNull(row[COL.INITIAL_PAYMENT]);

      // raw_row preserves all 15 columns for traceback.
      const raw_row: Record<string, unknown> = {};
      RAW_ROW_KEYS.forEach((key, idx) => {
        raw_row[key] = row[idx] ?? null;
      });

      parsed.push({
        source_sheet: SOURCE_SHEET,
        source_tab: SOURCE_TAB,
        source_row_id: `row-${sheetRowNumber}`,
        raw_row,
        quality_flags: flags,
        entry_date,
        amount,
        amount_payable,
        customer_name,
        sales_person,
        location_id,
        plot_type_id,
        plot_size_raw: plotSizeRaw,
        plot_count,
        realtor_manager_id: null,
      });
    }

    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('customer_files')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`customer_files upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    // No aggregate refresh — Customer File doesn't back a headline panel yet.

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
        forwardFilledDateCount,
        flagCounts,
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-customer-file failed:', message);
    return new Response(
      JSON.stringify({ ok: false, startedAt, error: message }, null, 2),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

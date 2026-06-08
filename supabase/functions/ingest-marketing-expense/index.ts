// Ingest the Marketing Fund Expense sheet — one tab per month — into
// public.marketing_expenses. Second ingest after Bank Deposit (the v1
// reference shape lives in supabase/functions/ingest-bank-deposit/index.ts).
//
// Trigger paths:
//   * Scheduled (every 15 min) via pg_cron + pg_net — see migration 019 (live)
//   * On-demand "Sync Sheets" button in the app header (RepullButton)
//
// Key shape differences from Bank Deposit:
//
//   1. Multi-tab. The source has one tab per month ("January 2026", "May 2026",
//      etc.). Tabs are discovered dynamically via getSheetTabs() — adding next
//      month is supervisor work only, no code change. The same applies across
//      years: any `<Month> <Year>` tab from 2026 forward (e.g. "January 2027")
//      is ingested automatically — carryover needs no code change. Tabs whose
//      names don't match `<Month> <Year>` in range are silently ignored (legacy
//      bare "January" tabs are 2025 H1 and out of scope; `_Categories` is the
//      dropdown source).
//
//   2. Period anchor is the TAB NAME (DESIGN_DECISIONS rule). In-cell dates
//      are unreliable on this sheet — a "May 2026" tab can contain rows dated
//      April or June. period_year + period_month come from parseMarketingTabName;
//      in_cell_date is preserved when parseable for traceback only.
//
//   3. Header row is detected, not assumed. Rows 1–3 hold stale title text on
//      every 2026 tab (the supervisor duplicated the previous month without
//      updating the title — "Petty Cash Book August" still sits in row 2 of
//      May 2026). findExpenditureHeader() locates the `Date | Description |
//      Total | Category` quad in the first 10 rows and the data range starts
//      one row below it.
//
//   4. Category lookup is two-tier:
//        a) If the supervisor filled the Category dropdown (column H) and it
//           matches a canonical `expense_categories.name`, use that id.
//        b) Otherwise — blank dropdown OR non-canonical text — run the
//           keyword fallback on Description, take its returned category, and
//           emit `fallback_category` in quality_flags so the supervisor can
//           grep auto-categorized rows from the data-quality view.
//      As of 2026-05-14 ALL existing 2026 rows have CATEGORY blank
//      (supervisor added the dropdown but hasn't backfilled), so the fallback
//      is the default code path, not the exception.
//
//   5. `source_row_id` is `exp-row-{N}` (1-indexed sheet row, prefixed with
//      `exp-` so future Income ingest can use `inc-row-{N}` from the same
//      sheet rows without colliding on the unique constraint
//      `(source_sheet, source_tab, source_row_id)`).
//
//   6. Summary rows ("Total", "Balance c/f", "Balance b/f") are filtered out
//      by description match. They sit a few rows after the data block and
//      would otherwise pollute totals.
//
// Date handling reuses Bank Deposit's primitives (parseSheetDate handles both
// serial-number and D/M/YYYY text). April 2026 shows the supervisor mixing
// conventions within one tab — 46057, 46238, and "14/4/2026" all present —
// so we need both paths. Blank date forward-fills from the most recent parsed
// date on the same tab; non-empty but unparseable values flag
// `unparseable_date` and stay null (no false forward-fill).

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  getSheetTabs,
  parseSheetDate,
  readSheetValues,
  type SheetTabMeta,
} from '../_shared/sheetsAuth.ts';
import {
  findExpenditureHeader,
  parseMarketingTabName,
  type TabPeriod,
} from '../_shared/parseMarketingTab.ts';
import { keywordMatchCategory } from '../_shared/categoryFallback.ts';
import { QUALITY_FLAGS, type QualityFlags } from '../_shared/quality_flags.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SOURCE_SHEET = 'marketing_fund_expense';
// 200 rows is well above the ~25 expenditure rows/month seen on Apr/May 2026.
// Columns A:Q span both Income (A–C) and Expenditure (E–H plus a few
// supervisor-added breakdown cols to the right) so the raw_row jsonb stays a
// faithful traceback.
const READ_RANGE_SUFFIX = 'A1:Q200';

// Description text that marks a summary row — never a real expenditure.
const SUMMARY_DESCRIPTIONS = new Set([
  'total',
  'balance c/f',
  'balance b/f',
  'balance b/d',
]);

type ParsedRow = {
  source_sheet: string;
  source_tab: string;
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  period_year: number;
  period_month: number;
  entry_type: 'expenditure';
  amount: number;
  description: string | null;
  expense_category_id: string | null;
  in_cell_date: string | null;
};

type TabStats = {
  parsedRows: number;
  blankSkipped: number;
  summarySkipped: number;
  headerRow: number | null;
  unparseableDate: number;
  fallbackCategory: number;
};

function toNumberOrZero(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.\-]/g, '');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Loads expense_categories into a case-insensitive name → id map. Caller uses
// the returned map both for direct dropdown matches and to resolve the keyword
// fallback's returned canonical name to an id.
async function loadExpenseCategories(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('expense_categories').select('name, id');
  if (error) throw new Error(`expense_categories load failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.name && row.id) map.set(String(row.name).toLowerCase(), row.id as string);
  }
  return map;
}

function parseTab(
  tab: SheetTabMeta,
  period: TabPeriod,
  rows: unknown[][],
  categoryMap: Map<string, string>,
): { parsed: ParsedRow[]; stats: TabStats } {
  const header = findExpenditureHeader(rows);
  const stats: TabStats = {
    parsedRows: 0,
    blankSkipped: 0,
    summarySkipped: 0,
    headerRow: null,
    unparseableDate: 0,
    fallbackCategory: 0,
  };
  if (!header) return { parsed: [], stats };
  stats.headerRow = header.rowIndex + 1;

  const parsed: ParsedRow[] = [];
  let lastValidDate: string | null = null;

  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sheetRowNumber = r + 1; // 1-indexed sheet row

    const dateCell        = row[header.colDate];
    const descriptionCell = row[header.colDescription];
    const totalCell       = row[header.colTotal];
    const categoryCell    = row[header.colCategory];

    const descRaw = trimOrNull(descriptionCell);
    const totalIsEmpty = totalCell === undefined || totalCell === '' || totalCell === null;

    // Totally blank expenditure row — skip.
    if (!descRaw && totalIsEmpty) {
      stats.blankSkipped++;
      continue;
    }

    // Summary row (Total / Balance ...). Skip — these are not real expenses
    // and would double-count the month if let through.
    if (descRaw && SUMMARY_DESCRIPTIONS.has(descRaw.toLowerCase())) {
      stats.summarySkipped++;
      continue;
    }

    const flags: QualityFlags = {};

    // Date: parse + forward-fill (Bank Deposit convention). Stored as
    // in_cell_date for reference; period anchor is the tab name.
    let in_cell_date: string | null;
    const dateIsEmpty = dateCell === '' || dateCell === undefined || dateCell === null;
    if (dateIsEmpty) {
      in_cell_date = lastValidDate;
    } else {
      const parsedDate = parseSheetDate(dateCell);
      if (parsedDate === null) {
        flags[QUALITY_FLAGS.UNPARSEABLE_DATE] = String(dateCell);
        in_cell_date = null;
        stats.unparseableDate++;
      } else {
        in_cell_date = parsedDate;
        lastValidDate = parsedDate;
      }
    }

    const amount = toNumberOrZero(totalCell);

    // Category resolution.
    const categoryRaw = trimOrNull(categoryCell);
    let expense_category_id: string | null = null;
    if (categoryRaw) {
      const direct = categoryMap.get(categoryRaw.toLowerCase());
      if (direct) {
        expense_category_id = direct;
      } else {
        // Dropdown value is non-canonical (typo, free text, stale value).
        // Fall through to keyword on description and flag.
        const match = keywordMatchCategory(descRaw);
        expense_category_id = categoryMap.get(match.categoryName.toLowerCase()) ?? null;
        flags[QUALITY_FLAGS.FALLBACK_CATEGORY] =
          `non-canonical dropdown='${categoryRaw}'; matched=${match.matchedPattern} -> ${match.categoryName}`;
        stats.fallbackCategory++;
      }
    } else {
      // Blank dropdown — the common 2026 case until the supervisor backfills.
      const match = keywordMatchCategory(descRaw);
      expense_category_id = categoryMap.get(match.categoryName.toLowerCase()) ?? null;
      flags[QUALITY_FLAGS.FALLBACK_CATEGORY] =
        `blank dropdown; matched=${match.matchedPattern} -> ${match.categoryName}`;
      stats.fallbackCategory++;
    }

    const raw_row: Record<string, unknown> = {
      Date: dateCell ?? null,
      Description: descriptionCell ?? null,
      Total: totalCell ?? null,
      Category: categoryCell ?? null,
    };

    parsed.push({
      source_sheet: SOURCE_SHEET,
      source_tab: tab.title,
      source_row_id: `exp-row-${sheetRowNumber}`,
      raw_row,
      quality_flags: flags,
      period_year: period.year,
      period_month: period.month,
      entry_type: 'expenditure',
      amount,
      description: descRaw,
      expense_category_id,
      in_cell_date,
    });
  }

  stats.parsedRows = parsed.length;
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

    const spreadsheetId = Deno.env.get('SHEET_ID_MARKETING_EXPENSE');
    if (!spreadsheetId) throw new Error('Missing env: SHEET_ID_MARKETING_EXPENSE');

    const accessToken = await getSheetsAccessToken();
    const [tabs, categoryMap] = await Promise.all([
      getSheetTabs(accessToken, spreadsheetId),
      loadExpenseCategories(supabase),
    ]);

    // Filter to in-scope month tabs.
    const tabsToIngest: Array<{ tab: SheetTabMeta; period: TabPeriod }> = [];
    for (const tab of tabs) {
      const period = parseMarketingTabName(tab.title);
      if (period) tabsToIngest.push({ tab, period });
    }

    const allRows: ParsedRow[] = [];
    const tabStats: Record<string, TabStats> = {};

    for (const { tab, period } of tabsToIngest) {
      const range = `${tab.title}!${READ_RANGE_SUFFIX}`;
      const data = await readSheetValues(accessToken, spreadsheetId, range);
      const { parsed, stats } = parseTab(tab, period, data.values ?? [], categoryMap);
      allRows.push(...parsed);
      tabStats[tab.title] = stats;
    }

    // Upsert in chunks. Single-tab volume is ~25 rows; full year would be
    // ~300 rows — single chunk handles either case.
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('marketing_expenses')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`marketing_expenses upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } =
      await supabase.rpc('refresh_marketing_monthly');
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
      tabsDiscovered: tabs.length,
      tabsIngested: tabsToIngest.length,
      tabsIngestedNames: tabsToIngest.map((t) => t.tab.title),
      tabStats,
      rowsUpserted: upserted,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-marketing-expense failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

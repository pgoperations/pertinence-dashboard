// Ingest the "2026 Realtors Managers Weekly Report" tab into
// public.realtor_metrics_monthly. Sixth ingest function; closes step 3 of the
// roadmap.
//
// Shape notes (see parseRealtorMetricsTab.ts for the full algorithm):
//   * Source is a wide pivot. Each month is an 8-col block (label + Week 1–5
//     + Total + gap), arranged in row bands. The row offsets between bands
//     aren't consistent (the supervisor's manual layout), so the parser
//     anchors on "Week 1" header cells.
//   * Each metric ROW in a block becomes one fact row at month grain.
//     Weekly values are preserved in `week_values` jsonb for a future weekly
//     trend without re-ingesting.
//   * NIL / Nil / NIl etc. → 0 (locked 2026-05-25). Empty → null.
//   * `total` = sum of Week 1–5. Source Total is preserved in raw_row; a
//     `total_mismatch` quality flag fires when the two disagree (supervisor #3).
//
// Trigger paths: cron + admin "Refresh now" button (same as every other ingest
// function, both no per-request user identity → deploy --no-verify-jwt).
//
// v1 scope is aggregate-only — no per-manager dimension. The fact table has
// no realtor_manager_id column for this reason; Phase 2 per-manager data
// lands in a separate table whenever a recurring source appears.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  readSheetValues,
} from '../_shared/sheetsAuth.ts';
import { loadRealtorMetricAliases } from '../_shared/canonicalLookup.ts';
import {
  parseRealtorMetricsTab,
  type ParsedMetricRow,
} from '../_shared/parseRealtorMetricsTab.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { discoverYearTabs } from '../_shared/yearTabs.ts';

const SOURCE_SHEET = 'marketing_team_reporting_template';

// One tab per year. Discovered dynamically so a "2027 Realtors Managers Weekly
// Report" tab added to the same spreadsheet is picked up with no code change
// (carryover fix, 2026-06-04). The metric_key year anchor comes from the tab
// name's year, not a hardcoded constant.
const TAB_PATTERN = /^(\d{4}) Realtors Managers Weekly Report$/;

// Block heights vary by populated month count. A1:Z300 covers all 12 month
// blocks (~30 rows each, 2 blocks per band = 6 bands × 30 rows = 180 rows
// worst case) with generous headroom for trailing notes/blank rows.
const READ_RANGE_SUFFIX = 'A1:Z300';

type TabResult = {
  tab: string;
  year: number;
  blocksFound: number;
  rowsParsed: number;
  rowsSkipped: number;
  nonNumericValues: number;
  totalMismatches: number;
  unknownLabels: Array<{ label: string; count: number }>;
};

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

    const spreadsheetId = Deno.env.get('SHEET_ID_REALTOR_MANAGERS_WEEKLY');
    if (!spreadsheetId) throw new Error('Missing env: SHEET_ID_REALTOR_MANAGERS_WEEKLY');

    const accessToken = await getSheetsAccessToken();
    const aliasMap = await loadRealtorMetricAliases(supabase);

    const tabsToIngest = await discoverYearTabs(accessToken, spreadsheetId, TAB_PATTERN);
    if (tabsToIngest.length === 0) {
      throw new Error(
        `No "<year> Realtors Managers Weekly Report" tab found in the spreadsheet. ` +
          `Expected e.g. "2026 Realtors Managers Weekly Report".`,
      );
    }

    type TaggedRow = ParsedMetricRow & { source_tab: string };
    const allRows: TaggedRow[] = [];
    const tabResults: TabResult[] = [];

    for (const { tab, year } of tabsToIngest) {
      const range = `${tab}!${READ_RANGE_SUFFIX}`;
      const data = await readSheetValues(accessToken, spreadsheetId, range);
      const { rows, stats } = parseRealtorMetricsTab(
        data.values ?? [],
        year,
        aliasMap,
      );

      for (const r of rows) allRows.push({ ...r, source_tab: tab });

      tabResults.push({
        tab,
        year,
        blocksFound: stats.blocksFound,
        rowsParsed: stats.rowsParsed,
        rowsSkipped: stats.rowsSkipped,
        nonNumericValues: stats.nonNumericValues,
        totalMismatches: stats.totalMismatches,
        unknownLabels: Array.from(stats.unknownLabels.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
      });
    }

    const upsertRows = allRows.map((r) => ({
      source_sheet: SOURCE_SHEET,
      source_tab: r.source_tab,
      source_row_id: r.source_row_id,
      raw_row: r.raw_row,
      quality_flags: r.quality_flags,
      period_year: r.period_year,
      period_month: r.period_month,
      metric_key: r.metric_key,
      total: r.total,
      week_values: r.week_values,
    }));

    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('realtor_metrics_monthly')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) throw new Error(`realtor_metrics_monthly upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

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
      tabs: tabResults,
      rowsUpserted: upserted,
      flagCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-realtor-managers-weekly failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

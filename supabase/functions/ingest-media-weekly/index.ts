// Ingest the "Media Team Reporting" tab on the Marketing Team Reporting
// Template spreadsheet into public.media_weekly_metrics. Eighth ingest
// function; pairs with ingest-digital-marketing.
//
// Source structure recap (see parseMediaWeeklyTab.ts for the full algorithm):
//   * Year sections stack vertically. 2026 section starts at sheet row 676.
//   * Per month: WEEK 1 / 2 / 3 / 4 column blocks. Each week ~10 cols wide.
//   * Per week × platform (Facebook / Instagram / Youtube Channel): label
//     col + 8 brand cols (PG / REALVEST / PPL / HOMEWORTH / PETTY SAVE /
//     GENIUS / SETTLE QUICK / FARMWEY AFRICA). 5–7 metric rows per platform.
//   * Each month block is ~30 rows of weekly grid; Feb 2026 starts at row 732.
//
// Supervisor explicitly scoped v1 to the weekly grid only — the per-month
// summary blocks and YouTube Monetization Report sit BELOW the weekly grid
// and are skipped via SKIP_LABELS in the parser.
//
// Fact-row grain: (year, month, week, platform, brand, metric). One row per
// non-null source cell. Empty cells / dash cells are not written (sparse-by-
// design — most brand × metric pairs are blank on the source).
//
// Trigger paths: cron + admin Sync Sheets button (same posture as every
// other ingest — deploy --no-verify-jwt).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  readSheetValues,
} from '../_shared/sheetsAuth.ts';
import { loadMediaLookups } from '../_shared/canonicalLookup.ts';
import {
  parseMediaWeeklyTab,
  type ParsedMediaWeeklyRow,
} from '../_shared/parseMediaWeeklyTab.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SOURCE_SHEET = 'marketing_team_reporting_template';
const SOURCE_TAB = 'Media Team Reporting';

// Year section list. Each entry tells the parser where its year's data starts
// on the sheet (1-indexed sheet row).
//
// CARRYOVER NOTE (2026-06-04): unlike the other ingests, the Media tab is a
// single grid where each year is a sub-region at a fixed row offset — there is
// NO year-marker cell to scan for, so a 2027 section CANNOT be auto-discovered.
// When the supervisor adds the 2027 weekly grid, add its start row here:
//   { year: 2027, startRow: <row of the first 2027 month header>, endRow: <…> }
// This is the only remaining manual step for 2027 carryover across all ingests.
const YEAR_SECTIONS: Array<{ year: number; startRow: number; endRow: number }> = [
  // 2026 section starts at sheet row 676. End set to 1008 (sheet's row
  // count as of 2026-06-01) — generous upper bound; the parser stops
  // earlier when it stops finding month headers.
  { year: 2026, startRow: 676, endRow: 1008 },
];

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
    if (!spreadsheetId) {
      throw new Error('Missing env: SHEET_ID_REALTOR_MANAGERS_WEEKLY');
    }

    const accessToken = await getSheetsAccessToken();
    const lookups = await loadMediaLookups(supabase);

    const allParsed: ParsedMediaWeeklyRow[] = [];
    const perYearStats: Array<{
      year: number;
      monthsFound: number;
      weeksFound: number;
      platformSectionsFound: number;
      rowsParsed: number;
      rowsSkipped: number;
      nonNumericValues: number;
      unknownLabels: Array<{ label: string; count: number }>;
      unknownBrands: Array<{ label: string; count: number }>;
      unmappedMetricKeys: Array<{ key: string; count: number }>;
    }> = [];

    for (const section of YEAR_SECTIONS) {
      // Read the year's region of the tab. The range is 1-indexed; we read
      // from startRow to endRow, covering cols A through AO (40 cols
      // accommodates 4 weeks × ~10 cols each).
      const range = `${SOURCE_TAB}!A${section.startRow}:AO${section.endRow}`;
      const data = await readSheetValues(accessToken, spreadsheetId, range);
      const rows = data.values ?? [];

      const { rows: parsed, stats } = parseMediaWeeklyTab(
        rows,
        section.year,
        0,
        rows.length,
        lookups,
      );
      for (const r of parsed) allParsed.push(r);

      perYearStats.push({
        year: section.year,
        monthsFound: stats.monthsFound,
        weeksFound: stats.weeksFound,
        platformSectionsFound: stats.platformSectionsFound,
        rowsParsed: stats.rowsParsed,
        rowsSkipped: stats.rowsSkipped,
        nonNumericValues: stats.nonNumericValues,
        unknownLabels: Array.from(stats.unknownLabels.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
        unknownBrands: Array.from(stats.unknownBrands.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
        unmappedMetricKeys: Array.from(stats.unmappedMetricKeys.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({ key, count })),
      });
    }

    const upsertRows = allParsed.map((r) => ({
      source_sheet: SOURCE_SHEET,
      source_tab: SOURCE_TAB,
      source_row_id: r.source_row_id,
      raw_row: r.raw_row,
      quality_flags: r.quality_flags,
      period_year: r.period_year,
      period_month: r.period_month,
      week_number: r.week_number,
      platform: r.platform,
      brand_id: r.brand_id,
      brand_key: r.brand_key,
      metric_key: r.metric_key,
      value: r.value,
    }));

    // Stale-row sweep, scoped to the years we're rebuilding. If the supervisor
    // moves a brand column (PG <-> REALVEST swap) or renames a platform header,
    // the source_row_id format changes and old rows would otherwise stick
    // around undetected. Scoped delete keeps prior-year data safe.
    const yearsToIngest = YEAR_SECTIONS.map((s) => s.year);
    const { error: cleanupError } = await supabase
      .from('media_weekly_metrics')
      .delete()
      .eq('source_sheet', SOURCE_SHEET)
      .eq('source_tab', SOURCE_TAB)
      .in('period_year', yearsToIngest);
    if (cleanupError) {
      throw new Error(`media_weekly_metrics cleanup failed: ${cleanupError.message}`);
    }

    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('media_weekly_metrics')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) {
        throw new Error(`media_weekly_metrics upsert failed: ${error.message}`);
      }
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } =
      await supabase.rpc('refresh_media_monthly');
    if (refreshError) {
      throw new Error(`Aggregate refresh failed: ${refreshError.message}`);
    }

    const flagCounts: Record<string, number> = {};
    for (const r of allParsed) {
      for (const key of Object.keys(r.quality_flags)) {
        flagCounts[key] = (flagCounts[key] ?? 0) + 1;
      }
    }

    return jsonResponse({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      source: { sheet: SOURCE_SHEET, tab: SOURCE_TAB },
      yearsIngested: YEAR_SECTIONS.map((s) => s.year),
      perYearStats,
      rowsUpserted: upserted,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-media-weekly failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

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
import { discoverYearTabs } from '../_shared/yearTabs.ts';

const SOURCE_SHEET = 'marketing_team_reporting_template';

// Year-agnostic discovery (2026-06-05). The supervisor split the old single
// "Media Team Reporting" tab into one tab per year — `2026 Media Team
// Reporting`, `2027 Media Team Reporting`, … — so Media now carries over by
// tab name like every other ingest, with no row-offset config.
//
// CRITICAL: the media weekly grid has NO in-cell year marker, so the only year
// signal is the tab name. Each `<year> Media Team Reporting` tab MUST contain
// only that year's grid. (The original tab stacked 2025 in rows 3–675 and 2026
// from row 676 — those years must be separated into their own tabs, or the
// parser would tag both as the tab's year.)
const TAB_PATTERN = /^(\d{4}) Media Team Reporting$/;

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

    type TaggedMediaRow = ParsedMediaWeeklyRow & { source_tab: string };
    const allParsed: TaggedMediaRow[] = [];
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

    const yearTabs = await discoverYearTabs(accessToken, spreadsheetId, TAB_PATTERN);
    if (yearTabs.length === 0) {
      throw new Error(
        'No "<year> Media Team Reporting" tab found (expected e.g. "2026 Media Team Reporting").',
      );
    }

    for (const { tab, year } of yearTabs) {
      // Each year is its own tab holding only that year's weekly grid, so read
      // the whole tab (cols A–AO) and let the parser find the month blocks.
      const data = await readSheetValues(accessToken, spreadsheetId, `${tab}!A:AO`);
      const rows = data.values ?? [];

      const { rows: parsed, stats } = parseMediaWeeklyTab(
        rows,
        year,
        0,
        rows.length,
        lookups,
      );
      for (const r of parsed) allParsed.push({ ...r, source_tab: tab });

      perYearStats.push({
        year,
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
      source_tab: r.source_tab,
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

    // Stale-row sweep, scoped to the years we're rebuilding. Deleted by
    // source_sheet + period_year ONLY (not source_tab): this table is fed
    // solely by this ingest, and dropping the source_tab filter also clears the
    // pre-rename rows (old source_tab "Media Team Reporting") in the same pass
    // as we rebuild them under the new "<year> Media Team Reporting" tab.
    const yearsToIngest = yearTabs.map((t) => t.year);
    const { error: cleanupError } = await supabase
      .from('media_weekly_metrics')
      .delete()
      .eq('source_sheet', SOURCE_SHEET)
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
      source: { sheet: SOURCE_SHEET, tabs: yearTabs.map((t) => t.tab) },
      yearsIngested: yearTabs.map((t) => t.year),
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

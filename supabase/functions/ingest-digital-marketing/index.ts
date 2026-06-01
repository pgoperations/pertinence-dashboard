// Ingest the "Digital Marketing" tab on the Marketing Team Reporting Template
// spreadsheet into public.digital_marketing_monthly. Seventh ingest function;
// pairs with ingest-media-weekly (deployed in the same session 2026-06-01).
//
// Source structure recap (see parseDigitalMarketingTab.ts for the full
// algorithm):
//   * Year-section layout. 2024, 2025, 2026 sections stack vertically. Each
//     anchored by a literal `2026` cell (numeric or string).
//   * Within a year, ~30-row month BANDS run horizontally (multiple months
//     side-by-side per row band, 8–9 col gaps).
//   * Each month block contains nested CAMPAIGN sub-blocks. Each campaign:
//     one "Campaign Name" row + 4–7 metric rows (Reach / Impression / Leads /
//     Cost Per Lead / Cost / sometimes Visits / Follows / Cost Per Result).
//
// One fact row per (year, month, campaign_name, metric_key). Weekly values
// preserved in week_values jsonb. Same idempotency contract as every other
// ingest (`source_sheet, source_tab, source_row_id` unique).
//
// Trigger paths: cron + admin Sync Sheets button (no per-request user
// identity — deploy --no-verify-jwt). Service-account auth to Sheets +
// service-role to Postgres are both in `supabase secrets`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  getSheetsAccessToken,
  readSheetValues,
} from '../_shared/sheetsAuth.ts';
import { loadDigitalMarketingMetricAliases } from '../_shared/canonicalLookup.ts';
import {
  parseDigitalMarketingTab,
  type ParsedDigitalMarketingRow,
} from '../_shared/parseDigitalMarketingTab.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

const SOURCE_SHEET = 'marketing_team_reporting_template';
const SOURCE_TAB = 'Digital Marketing';

// Year-section list. Adding 2027 next year is a code change here on purpose:
// the supervisor confirms which year is in-scope before any ingest runs.
const YEARS_TO_INGEST: number[] = [2026];

// 2026 section begins at sheet row 129 with the year-marker cell. We read
// from row 100 down to give the year-marker scanner a comfortable window
// and to absorb any future supervisor-added rows above the marker. The tab
// is 106 cols wide (col DB is index 105); read all of them so future
// supervisor additions to the right of column AL also flow through.
const READ_RANGE = `${SOURCE_TAB}!A100:DB500`;

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
    const aliasMap = await loadDigitalMarketingMetricAliases(supabase);
    const data = await readSheetValues(accessToken, spreadsheetId, READ_RANGE);
    const rows = data.values ?? [];

    const allParsed: ParsedDigitalMarketingRow[] = [];
    const perYearStats: Array<{
      year: number;
      blocksFound: number;
      campaignsFound: number;
      rowsParsed: number;
      rowsSkipped: number;
      nonNumericValues: number;
      mixedCampaignWeeks: number;
      unknownLabels: Array<{ label: string; count: number }>;
    }> = [];

    for (const year of YEARS_TO_INGEST) {
      const { rows: parsed, stats } = parseDigitalMarketingTab(rows, year, aliasMap);
      for (const r of parsed) allParsed.push(r);
      perYearStats.push({
        year,
        blocksFound: stats.blocksFound,
        campaignsFound: stats.campaignsFound,
        rowsParsed: stats.rowsParsed,
        rowsSkipped: stats.rowsSkipped,
        nonNumericValues: stats.nonNumericValues,
        mixedCampaignWeeks: stats.mixedCampaignWeeks,
        unknownLabels: Array.from(stats.unknownLabels.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
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
      campaign_name: r.campaign_name,
      metric_key: r.metric_key,
      total: r.total,
      week_values: r.week_values,
    }));

    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('digital_marketing_monthly')
        .upsert(chunk, { onConflict: 'source_sheet,source_tab,source_row_id' });
      if (error) {
        throw new Error(`digital_marketing_monthly upsert failed: ${error.message}`);
      }
      upserted += chunk.length;
    }

    const { data: refreshResult, error: refreshError } =
      await supabase.rpc('refresh_digital_marketing_monthly');
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
      yearsIngested: YEARS_TO_INGEST,
      perYearStats,
      rowsUpserted: upserted,
      flagCounts,
      aggregateRowsInserted: refreshResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-digital-marketing failed:', message);
    return jsonResponse({ ok: false, startedAt, error: message }, 500);
  }
});

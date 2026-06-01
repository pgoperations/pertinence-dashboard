// Parse the "Digital Marketing" tab on the Marketing Team Reporting Template
// spreadsheet into long-form rows at month-grain.
//
// The 2026 section starts at sheet row 129 with a literal `2026` year marker
// (numeric or string). Row 131 holds month names (JANUARY/FEBRUARY/... at
// inconsistent column offsets — supervisor's manual layout, 8–9 col gaps).
// Row 132 holds the per-block "Week 1 / Week 2 / ... / TOTAL" header. Each
// month block runs ~28–35 rows below that.
//
// Each month block contains MULTIPLE nested CAMPAIGN sub-blocks. A sub-block is:
//   * one "Campaign Name" header row (label col + per-week campaign strings)
//   * followed by 4–7 metric rows (Reach, Impression, Leads, Cost Per Lead,
//     Cost, sometimes Visits / Follows / Cost Per Result (Combined))
//
// The first sub-block in each month is a blank template (metric labels with
// no values) — those rows are skipped because the parser requires both a
// known campaign context AND at least one non-empty week value before
// emitting a fact row.
//
// Anchor algorithm (mirrors parseRealtorMetricsTab):
//   1. Find the `2026` year-marker cell to bound the in-scope region.
//   2. Below it, find all "Week 1" cells (case-insensitive trim).
//   3. For each anchor at (row, col), labelCol = col - 1 and value cols =
//      col .. col + 5 (Week 1–5 + TOTAL).
//   4. Scan upward up to 5 rows from each anchor for a month name within
//      the block's column span — that's the block's month.
//   5. Walk downward from anchor_row + 1, tracking the current campaign:
//        - Label = "Campaign Name" → start a new sub-block. Read W1..W5
//          campaign strings. Use the first non-empty as canonical campaign
//          name; flag `mixed_campaign_weeks` if multiple distinct names
//          appear in the same row.
//        - Label matches alias map → metric row. Emit ONE fact row tagged
//          with current campaign + metric. Skip if no campaign context yet
//          or if all values are empty.
//        - Label is a section header / skip word → silently skip.
//        - Label looks like a month name → block ended, break out.
//
// Value coercion follows the established convention:
//   * Numeric → as-is (after currency-symbol strip on cost cells)
//   * NIL / Nil / NIl / Nll → 0 (event happened, count was zero)
//   * "-" → null ("not applicable", not "zero")
//   * Empty / undefined → null (no data)
//   * Other non-numeric → 0 + non_numeric_value flag

import { QUALITY_FLAGS, type QualityFlags } from './quality_flags.ts';

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

// Labels that mark the END of a metric block or are pure section text — never
// metric rows, never campaign headers. Comparison is case-insensitive against
// whitespace-normalized labels.
const SKIP_LABELS = new Set<string>([
  'summary of social media activity',
  'most performing',
  'report',
  'youtube monetization report',
  'top performing videos',
  'blocker/challenge',
  'blocker / challenge',
  'total no of subscribers',
  'youtube channel',
]);

const NIL_VARIANTS = new Set(['nil', 'nl', 'nll']);
const DASH_VARIANTS = new Set(['-', '—', '–']);

const MAX_BLOCK_ROWS = 70;
const MAX_MONTH_SCAN_UPWARD = 5;

export type ParsedDigitalMarketingRow = {
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  period_year: number;
  period_month: number;
  campaign_name: string;
  metric_key: string;
  total: number | null;
  week_values: Record<string, number | null>;
};

export type DigitalMarketingParseStats = {
  blocksFound: number;
  campaignsFound: number;
  rowsParsed: number;
  rowsSkipped: number;
  unknownLabels: Map<string, number>;
  nonNumericValues: number;
  mixedCampaignWeeks: number;
};

export type DigitalMarketingParseResult = {
  rows: ParsedDigitalMarketingRow[];
  stats: DigitalMarketingParseStats;
};

function normalizeLabel(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Coerce a single week / total cell. Strips currency symbols and thousand
// separators before number parsing — Cost cells arrive as "₦18,430.43" /
// " ₦15,000" / "₦70,000.00" with inconsistent spacing.
type Coerced = { value: number | null; flag?: string };

function coerceNumeric(v: unknown): Coerced {
  if (v === '' || v === undefined || v === null) return { value: null };
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v };
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return { value: null };
    if (DASH_VARIANTS.has(trimmed)) return { value: null };
    if (NIL_VARIANTS.has(trimmed.toLowerCase())) return { value: 0 };
    // Strip naira symbol, commas, and whitespace; keep digits, decimal, sign.
    const cleaned = trimmed.replace(/[₦,$\s]/g, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return { value: parsed };
    return { value: 0, flag: trimmed };
  }
  return { value: 0, flag: String(v) };
}

function isYearMarker(v: unknown, targetYear: number): boolean {
  if (typeof v === 'number') return v === targetYear;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === String(targetYear);
  }
  return false;
}

type BlockAnchor = {
  weekOneRow: number; // 0-indexed
  weekOneCol: number; // 0-indexed
  labelCol: number;   // weekOneCol - 1
  month: number;      // 1-12
};

function findYearMarkerRow(rows: unknown[][], targetYear: number): number | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (isYearMarker(row[c], targetYear)) return r;
    }
  }
  return null;
}

function findMonthForAnchor(
  rows: unknown[][],
  weekOneRow: number,
  labelCol: number,
  weekOneCol: number,
): number | null {
  const minCol = labelCol;
  const maxCol = weekOneCol + 5;
  const minRow = Math.max(0, weekOneRow - MAX_MONTH_SCAN_UPWARD);
  for (let r = weekOneRow - 1; r >= minRow; r--) {
    const row = rows[r] ?? [];
    for (let c = minCol; c <= maxCol; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      const m = MONTHS[cell.trim().toUpperCase()];
      if (m) return m;
    }
  }
  return null;
}

function findBlockAnchors(
  rows: unknown[][],
  yearMarkerRow: number,
): BlockAnchor[] {
  const anchors: BlockAnchor[] = [];
  for (let r = yearMarkerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      if (cell.trim().toLowerCase() !== 'week 1') continue;
      if (c < 1) continue;
      const month = findMonthForAnchor(rows, r, c - 1, c);
      if (month === null) continue;
      anchors.push({ weekOneRow: r, weekOneCol: c, labelCol: c - 1, month });
    }
  }
  return anchors;
}

function findBlockEndRow(
  anchors: BlockAnchor[],
  current: BlockAnchor,
  totalRows: number,
): number {
  let end = Math.min(totalRows, current.weekOneRow + 1 + MAX_BLOCK_ROWS);
  for (const a of anchors) {
    if (a === current) continue;
    if (a.labelCol !== current.labelCol) continue;
    if (a.weekOneRow <= current.weekOneRow) continue;
    end = Math.min(end, a.weekOneRow - 1);
    break;
  }
  return end;
}

function slugifyCampaign(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unnamed';
}

export function parseDigitalMarketingTab(
  rows: unknown[][],
  ingestYear: number,
  aliasMap: Map<string, string>,
): DigitalMarketingParseResult {
  const stats: DigitalMarketingParseStats = {
    blocksFound: 0,
    campaignsFound: 0,
    rowsParsed: 0,
    rowsSkipped: 0,
    unknownLabels: new Map(),
    nonNumericValues: 0,
    mixedCampaignWeeks: 0,
  };

  const yearMarkerRow = findYearMarkerRow(rows, ingestYear);
  if (yearMarkerRow === null) return { rows: [], stats };

  const anchors = findBlockAnchors(rows, yearMarkerRow);
  stats.blocksFound = anchors.length;

  const seen = new Map<string, ParsedDigitalMarketingRow>();

  for (const anchor of anchors) {
    const endRow = findBlockEndRow(anchors, anchor, rows.length);
    let currentCampaign: string | null = null;
    let currentCampaignMixedNames: string[] | null = null;

    for (let r = anchor.weekOneRow + 1; r < endRow; r++) {
      const row = rows[r] ?? [];
      const rawLabel = row[anchor.labelCol];
      const labelNorm = normalizeLabel(rawLabel);
      if (!labelNorm) continue;

      // Skip-list labels: silently advance.
      if (SKIP_LABELS.has(labelNorm)) {
        stats.rowsSkipped++;
        continue;
      }

      // Another month name in the label col → block ended.
      if (MONTHS[labelNorm.toUpperCase()]) break;

      // Campaign Name header: start a new sub-block.
      if (labelNorm === 'campaign name') {
        const names: string[] = [];
        for (let w = 0; w < 5; w++) {
          const cell = row[anchor.weekOneCol + w];
          const name = trimOrNull(cell);
          if (name) names.push(name);
        }
        if (names.length === 0) {
          // No campaign string yet — header row in template area. Skip.
          currentCampaign = null;
          continue;
        }
        // De-dupe case-insensitively, preserve order.
        const distinct: string[] = [];
        const seenLower = new Set<string>();
        for (const n of names) {
          const lower = n.toLowerCase();
          if (!seenLower.has(lower)) {
            seenLower.add(lower);
            distinct.push(n);
          }
        }
        currentCampaign = distinct[0].toUpperCase();
        stats.campaignsFound++;
        if (distinct.length > 1) {
          stats.mixedCampaignWeeks++;
          currentCampaignMixedNames = distinct;
        } else {
          currentCampaignMixedNames = null;
        }
        continue;
      }

      // Metric row attempt. Requires (a) campaign context + (b) at least one
      // non-empty value to emit.
      const metric_key = aliasMap.get(labelNorm);
      if (!metric_key) {
        // Unknown label — track for ops triage. Don't track if it's clearly
        // a value (numeric) — sometimes the label col gets stray data.
        if (typeof rawLabel === 'string' && rawLabel.trim().length > 0) {
          stats.unknownLabels.set(
            labelNorm,
            (stats.unknownLabels.get(labelNorm) ?? 0) + 1,
          );
        }
        continue;
      }

      if (!currentCampaign) {
        // Template / above-first-campaign row — skip silently.
        stats.rowsSkipped++;
        continue;
      }

      const flags: QualityFlags = {};
      const week_values: Record<string, number | null> = {};
      let anyValue = false;
      let weekSum = 0;
      const nonNumericDetails: string[] = [];

      for (let w = 1; w <= 5; w++) {
        const cell = row[anchor.weekOneCol + (w - 1)];
        const c = coerceNumeric(cell);
        week_values[String(w)] = c.value;
        if (c.value !== null) {
          anyValue = true;
          weekSum += c.value;
        }
        if (c.flag !== undefined) {
          stats.nonNumericValues++;
          nonNumericDetails.push(`w${w}='${c.flag}'`);
        }
      }

      if (!anyValue) {
        // Empty metric row under an active campaign — skip rather than write
        // an all-null fact row.
        continue;
      }

      const totalCell = row[anchor.weekOneCol + 5];
      const totalCoerced = coerceNumeric(totalCell);
      if (totalCoerced.flag !== undefined) {
        stats.nonNumericValues++;
        nonNumericDetails.push(`total='${totalCoerced.flag}'`);
      }

      let computedTotal: number | null = weekSum;
      const sourceTotal = totalCoerced.value;
      if (
        sourceTotal !== null &&
        Math.abs(sourceTotal - weekSum) > 0.0001
      ) {
        flags[QUALITY_FLAGS.TOTAL_MISMATCH] =
          `source=${sourceTotal}, week_sum=${weekSum}`;
      }
      // If source Total was given but week_sum is suspiciously zero (e.g. all
      // weeks blank but Total filled), prefer source Total.
      if (computedTotal === 0 && sourceTotal !== null && sourceTotal !== 0) {
        computedTotal = sourceTotal;
      }

      if (nonNumericDetails.length > 0) {
        flags[QUALITY_FLAGS.NON_NUMERIC_VALUE] = nonNumericDetails.join('; ');
      }

      if (currentCampaignMixedNames && currentCampaignMixedNames.length > 1) {
        flags[QUALITY_FLAGS.MIXED_CAMPAIGN_WEEKS] = currentCampaignMixedNames.join(' | ');
      }

      const campaignSlug = slugifyCampaign(currentCampaign);
      const source_row_id = `y${ingestYear}-m${String(anchor.month).padStart(2, '0')}-${campaignSlug}-${metric_key}`;

      const raw_row: Record<string, unknown> = {
        label: typeof rawLabel === 'string' ? rawLabel : null,
        campaign_name: currentCampaign,
        period_month: anchor.month,
        week_1: row[anchor.weekOneCol] ?? null,
        week_2: row[anchor.weekOneCol + 1] ?? null,
        week_3: row[anchor.weekOneCol + 2] ?? null,
        week_4: row[anchor.weekOneCol + 3] ?? null,
        week_5: row[anchor.weekOneCol + 4] ?? null,
        Total:  row[anchor.weekOneCol + 5] ?? null,
        sheet_row: r + 1,
      };

      const parsed: ParsedDigitalMarketingRow = {
        source_row_id,
        raw_row,
        quality_flags: flags,
        period_year: ingestYear,
        period_month: anchor.month,
        campaign_name: currentCampaign,
        metric_key,
        total: computedTotal,
        week_values,
      };

      seen.set(source_row_id, parsed);
      stats.rowsParsed++;
    }
  }

  return { rows: Array.from(seen.values()), stats };
}

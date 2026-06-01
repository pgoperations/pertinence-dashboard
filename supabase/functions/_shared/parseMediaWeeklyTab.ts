// Parse the "Media Team Reporting" tab on the Marketing Team Reporting
// Template spreadsheet into long-form weekly fact rows.
//
// 2026 section layout (start anchored on a configured row — supervisor adds
// 2027 by inserting rows above without breaking 2026, but adding a 2027
// SECTION requires bumping INGEST_2026_START_ROW or adding a 2027 entry):
//
//   row 676: month header row — "JANUARY" + "WEEK 1" / "WEEK 2" / "WEEK 3" /
//            "WEEK 4" at staggered cols (B / M / W / AG for Jan).
//   row 677: platform-A header — "Facebook" label + 8 brand cols (PG /
//            REALVEST / PPL / HOMEWORTH / PETTY SAVE / GENIUS / SETTLE QUICK /
//            FARMWEY AFRICA), repeated per week block.
//   rows 678–683: Facebook metric rows (Number of Interactions, Average Reach,
//            Number of Page Visits, Number of New Followers, Total Number of
//            Followers, No of Views, Number of Posts Delivered) × 8 brand cols
//            per week.
//   then a blank row, then Instagram platform header + metric rows, then
//   YouTube Channel platform header + metric rows.
//   block height ~30 rows / month.
//
// Each subsequent month sits ~56 rows below (Feb starts row 732 = 676 + 56).
//
// Anchor algorithm:
//   1. Scan from INGEST_2026_START_ROW for rows containing a MONTH name.
//      The row also contains WEEK 1..4 cells; we read both in the same pass.
//   2. For each week-header cell in that row, walk DOWN, alternating between
//      platform-header rows (which redefine the brand-col mapping for that
//      platform within that week) and metric rows (values in brand cols).
//   3. Stop the per-week walk when (a) MAX_BLOCK_ROWS rows scanned or (b)
//      a new month-header row is encountered.
//
// Per-cell coercion follows the same convention as the digital marketing
// parser: numeric → as-is, NIL → 0, "-" → null, empty → null, other-string
// → 0 + non_numeric_value flag.
//
// Brand-col resolution: each platform header row REDEFINES the brand-col
// mapping for that section within that week. In practice the brand order is
// stable across FB/IG/YT within a week, but spellings vary (HOMEWORTH HOTEL
// in week 2 vs HOMEWORTH in week 1) — the alias lookup handles that. A
// platform-header row with no resolvable brand in a col emits a quality
// flag on every metric row that uses that col and the row is skipped to
// avoid a null brand_id silently dropping it from the aggregate.

import { QUALITY_FLAGS, type QualityFlags } from './quality_flags.ts';
import type { MediaLookups } from './canonicalLookup.ts';

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

const PLATFORM_LABELS: Record<string, MediaPlatform> = {
  'facebook': 'facebook',
  'instagram': 'instagram',
  'youtube channel': 'youtube',
  'youtube': 'youtube',
};

const SKIP_LABELS = new Set<string>([
  'january summary', 'february summary', 'march summary', 'april summary',
  'may summary', 'june summary', 'july summary', 'august summary',
  'september summary', 'october summary', 'november summary', 'december summary',
  'youtube monetization report',
  'top performing videos',
  'blocker/challenge',
  'blocker / challenge',
  'total no of subscribers',
  'summary of social media activity',
  'most performing',
  'report',
]);

const NIL_VARIANTS = new Set(['nil', 'nl', 'nll']);
const DASH_VARIANTS = new Set(['-', '—', '–']);
const WEEK_LABEL_RE = /^week\s*([1-5])$/i;

const MAX_WEEK_BLOCK_ROWS = 60;

export type MediaPlatform = 'facebook' | 'instagram' | 'youtube';

export type ParsedMediaWeeklyRow = {
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  period_year: number;
  period_month: number;
  week_number: number;
  platform: MediaPlatform;
  brand_id: string | null;
  brand_key: string | null;
  metric_key: string;
  value: number | null;
};

export type MediaWeeklyParseStats = {
  monthsFound: number;
  weeksFound: number;
  platformSectionsFound: number;
  rowsParsed: number;
  rowsSkipped: number;
  unknownLabels: Map<string, number>;
  unknownBrands: Map<string, number>;
  unmappedMetricKeys: Map<string, number>;
  nonNumericValues: number;
};

export type MediaWeeklyParseResult = {
  rows: ParsedMediaWeeklyRow[];
  stats: MediaWeeklyParseStats;
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

type Coerced = { value: number | null; flag?: string };

function coerceNumeric(v: unknown): Coerced {
  if (v === '' || v === undefined || v === null) return { value: null };
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v };
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return { value: null };
    if (DASH_VARIANTS.has(trimmed)) return { value: null };
    if (NIL_VARIANTS.has(trimmed.toLowerCase())) return { value: 0 };
    const cleaned = trimmed.replace(/[₦,$\s]/g, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return { value: parsed };
    return { value: 0, flag: trimmed };
  }
  return { value: 0, flag: String(v) };
}

// Translate an alias-resolved metric_key to the right platform-specific
// canonical. The seed keeps only the Facebook canonical for ambiguous labels
// like "Average Reach"; this function substitutes 'fb_' → 'ig_' / 'yt_'
// when we're parsing in a non-Facebook section, and verifies the substituted
// key exists in the canonical set before returning.
function platformizeKey(
  rawKey: string,
  platform: MediaPlatform,
  keySet: Set<string>,
): string | null {
  if (keySet.has(rawKey) && rawKey.startsWith(prefixFor(platform))) {
    return rawKey;
  }
  // Substitute prefix.
  const prefix = prefixFor(platform);
  const candidate = prefix + rawKey.replace(/^(fb_|ig_|yt_)/, '');
  return keySet.has(candidate) ? candidate : null;
}

function prefixFor(platform: MediaPlatform): string {
  if (platform === 'facebook') return 'fb_';
  if (platform === 'instagram') return 'ig_';
  return 'yt_';
}

type MonthAnchor = {
  monthRow: number;       // 0-indexed row containing JANUARY / WEEK 1 / WEEK 2 / ...
  month: number;          // 1-12
  weeks: Array<{ week: number; startCol: number }>;  // platform-label / metric-label col per week
};

function findMonthAnchors(
  rows: unknown[][],
  startRow: number,
  endRow: number,
): MonthAnchor[] {
  const anchors: MonthAnchor[] = [];
  for (let r = startRow; r < Math.min(rows.length, endRow); r++) {
    const row = rows[r] ?? [];
    let month: number | null = null;
    const weeks: Array<{ week: number; startCol: number }> = [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      const text = cell.trim();
      if (!text) continue;
      const monthCandidate = MONTHS[text.toUpperCase()];
      if (monthCandidate) {
        month = monthCandidate;
        continue;
      }
      const weekMatch = text.match(WEEK_LABEL_RE);
      if (weekMatch) {
        weeks.push({ week: Number(weekMatch[1]), startCol: c });
      }
    }
    if (month !== null && weeks.length > 0) {
      anchors.push({ monthRow: r, month, weeks });
    }
  }
  return anchors;
}

function parseWeekBlock(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  startCol: number,
  weekNumber: number,
  month: number,
  year: number,
  lookups: MediaLookups,
  stats: MediaWeeklyParseStats,
): ParsedMediaWeeklyRow[] {
  const emitted: ParsedMediaWeeklyRow[] = [];
  let currentPlatform: MediaPlatform | null = null;
  // brandsForCurrentPlatform[i] is the resolved brand for col startCol + 1 + i
  let brandsForCurrentPlatform: Array<{ id: string; key: string } | null> = [];

  const blockEnd = Math.min(endRow, startRow + MAX_WEEK_BLOCK_ROWS);
  stats.weeksFound++;

  for (let r = startRow; r < blockEnd; r++) {
    const row = rows[r] ?? [];
    const rawLabel = row[startCol];
    const labelNorm = normalizeLabel(rawLabel);
    if (!labelNorm) continue;

    // Platform header row.
    const platformCandidate = PLATFORM_LABELS[labelNorm];
    if (platformCandidate) {
      currentPlatform = platformCandidate;
      stats.platformSectionsFound++;
      brandsForCurrentPlatform = [];
      for (let i = 0; i < 8; i++) {
        const brandCell = row[startCol + 1 + i];
        const brandLabel = trimOrNull(brandCell);
        if (!brandLabel) {
          brandsForCurrentPlatform.push(null);
          continue;
        }
        const match = lookups.brandByAlias.get(brandLabel.toLowerCase());
        if (match) {
          brandsForCurrentPlatform.push({ id: match.id, key: match.key });
        } else {
          brandsForCurrentPlatform.push(null);
          stats.unknownBrands.set(
            brandLabel,
            (stats.unknownBrands.get(brandLabel) ?? 0) + 1,
          );
        }
      }
      continue;
    }

    if (SKIP_LABELS.has(labelNorm)) {
      stats.rowsSkipped++;
      continue;
    }

    // Stop the block walk if we've hit the NEXT month's header row.
    if (MONTHS[labelNorm.toUpperCase()]) break;

    if (!currentPlatform) {
      // Pre-platform-header label — should not normally happen, skip.
      continue;
    }

    // Metric row attempt.
    const aliasKey = lookups.metricByAlias.get(labelNorm);
    if (!aliasKey) {
      if (typeof rawLabel === 'string' && rawLabel.trim().length > 0) {
        stats.unknownLabels.set(
          labelNorm,
          (stats.unknownLabels.get(labelNorm) ?? 0) + 1,
        );
      }
      continue;
    }
    const metric_key = platformizeKey(aliasKey, currentPlatform, lookups.metricKeySet);
    if (!metric_key) {
      stats.unmappedMetricKeys.set(
        `${currentPlatform}:${aliasKey}`,
        (stats.unmappedMetricKeys.get(`${currentPlatform}:${aliasKey}`) ?? 0) + 1,
      );
      continue;
    }

    for (let i = 0; i < 8; i++) {
      const brand = brandsForCurrentPlatform[i];
      const rawValue = row[startCol + 1 + i];
      const coerced = coerceNumeric(rawValue);
      if (coerced.value === null) continue;  // skip empty / dash cells
      const flags: QualityFlags = {};
      if (coerced.flag !== undefined) {
        stats.nonNumericValues++;
        flags[QUALITY_FLAGS.NON_NUMERIC_VALUE] = `value='${coerced.flag}'`;
      }
      if (!brand) {
        // Brand col couldn't be resolved at platform-header parse time —
        // attach a quality flag and use a synthetic brand_key so the row
        // still lands somewhere inspectable.
        flags[QUALITY_FLAGS.UNKNOWN_MEDIA_BRAND] = `col_offset=${i + 1}`;
      }
      const brand_key = brand?.key ?? null;
      const brand_id = brand?.id ?? null;
      const source_row_id = `y${year}-m${String(month).padStart(2, '0')}-w${weekNumber}-${currentPlatform}-${brand_key ?? `col${i + 1}`}-${metric_key}`;
      const raw_row: Record<string, unknown> = {
        label: typeof rawLabel === 'string' ? rawLabel : null,
        platform: currentPlatform,
        brand_col_offset: i + 1,
        raw_brand_label: trimOrNull(row[startCol + 1 + i] === rawValue ? null : row[startCol + 1 + i]),
        raw_value: rawValue,
        sheet_row: r + 1,
        sheet_col_offset: startCol + 1 + i,
      };
      emitted.push({
        source_row_id,
        raw_row,
        quality_flags: flags,
        period_year: year,
        period_month: month,
        week_number: weekNumber,
        platform: currentPlatform,
        brand_id,
        brand_key,
        metric_key,
        value: coerced.value,
      });
      stats.rowsParsed++;
    }
  }

  return emitted;
}

export function parseMediaWeeklyTab(
  rows: unknown[][],
  ingestYear: number,
  startRow: number,
  endRow: number,
  lookups: MediaLookups,
): MediaWeeklyParseResult {
  const stats: MediaWeeklyParseStats = {
    monthsFound: 0,
    weeksFound: 0,
    platformSectionsFound: 0,
    rowsParsed: 0,
    rowsSkipped: 0,
    unknownLabels: new Map(),
    unknownBrands: new Map(),
    unmappedMetricKeys: new Map(),
    nonNumericValues: 0,
  };

  const monthAnchors = findMonthAnchors(rows, startRow, endRow);
  stats.monthsFound = monthAnchors.length;
  const seen = new Map<string, ParsedMediaWeeklyRow>();

  for (let i = 0; i < monthAnchors.length; i++) {
    const anchor = monthAnchors[i];
    const nextMonthRow = i + 1 < monthAnchors.length
      ? monthAnchors[i + 1].monthRow
      : endRow;

    for (const wk of anchor.weeks) {
      const emitted = parseWeekBlock(
        rows,
        anchor.monthRow + 1,
        nextMonthRow,
        wk.startCol,
        wk.week,
        anchor.month,
        ingestYear,
        lookups,
        stats,
      );
      for (const e of emitted) {
        seen.set(e.source_row_id, e);
      }
    }
  }

  return { rows: Array.from(seen.values()), stats };
}

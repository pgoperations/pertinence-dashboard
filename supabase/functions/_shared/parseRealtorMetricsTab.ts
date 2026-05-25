// Parse the "2026 Realtors Managers Weekly Report" tab into long-form metric
// rows. The tab is a wide pivot where each month is a block of 8 columns
// (label + Week 1-5 + Total + gap) and ROWS within the block are metric
// labels. Two month blocks sit side-by-side per row band, but the row offsets
// between bands are not consistent (the supervisor's manual layout) — so we
// anchor on "Week 1" header cells rather than assuming a fixed grid.
//
// Discovery algorithm:
//   1. Scan every cell for the literal "Week 1" (case-insensitive trim).
//   2. For each match at (row, col), the metric-label column is `col - 1`
//      and value cols are `col .. col + 5` (Week 1-5 + Total).
//   3. Scan upward up to 5 rows from the anchor in cols `col - 1 .. col + 5`
//      for a recognizable month name → that's the block's month.
//   4. Scan downward from anchor_row + 1 reading label + 6 values per row.
//      Stop on the next month-header row at the same label-col, or after
//      a configured max row range (60 rows below — covers any plausible
//      block height; current Jan block is 28 rows).
//
// Each metric row is recognized by alias lookup. Section/subsection headers
// and text-only rows (Feedbacks, Bottlenecks, etc.) are silently skipped
// via SKIP_LABELS so they don't pollute the unknown-label diagnostic.
//
// Values are coerced per the convention locked 2026-05-25:
//   * Numeric → as-is
//   * NIL / Nil / NIl / Nll / Nl etc. → 0 (supervisor uses these as
//     "event happened, count was zero")
//   * Empty / undefined → null (no data)
//   * Other string → 0 + non_numeric_value flag (preserves raw_row)
//
// `total` is computed from the week sum, not from the source's Total cell.
// Most Jan rows have a blank Total column (supervisor stopped filling it in)
// while every Feb+ row has Total populated. Computing ourselves keeps the
// panel consistent. When the source Total disagrees with our sum, we emit
// a `total_mismatch` quality flag (supervisor #3) but our number wins.

import { QUALITY_FLAGS, type QualityFlags } from './quality_flags.ts';

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

// Label text that is NOT a metric row — section headers, text-only rows.
// Lookup is case-insensitive against trimmed + whitespace-normalized label.
const SKIP_LABELS = new Set([
  'realtor community metrics',
  'recruitment metrics',
  'realtor activity measurement',
  'realtor sales performance',
  'site inspection',
  'top selling location by realtors',
  'special events (realtors retreat)',
  'feedbacks',
  'bottlenecks',
]);

const NIL_VARIANTS = new Set(['nil', 'nl', 'nll']);

const MAX_BLOCK_ROWS = 60;
const MAX_MONTH_SCAN_UPWARD = 5;

export type ParsedMetricRow = {
  source_row_id: string;
  raw_row: Record<string, unknown>;
  quality_flags: QualityFlags;
  period_year: number;
  period_month: number;
  metric_key: string;
  total: number | null;
  week_values: Record<string, number | null>;
};

export type ParseStats = {
  blocksFound: number;
  rowsParsed: number;
  rowsSkipped: number;
  unknownLabels: Map<string, number>; // normalized label → occurrences
  nonNumericValues: number;
  totalMismatches: number;
};

export type ParseResult = {
  rows: ParsedMetricRow[];
  stats: ParseStats;
};

function normalizeLabel(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Coerce a single week / total cell. Returns either a number, null for empty,
// or { value: 0, flag: <raw> } for non-numeric strings the parser couldn't
// otherwise interpret.
type Coerced = { value: number | null; flag?: string };

function coerceNumeric(v: unknown): Coerced {
  if (v === '' || v === undefined || v === null) return { value: null };
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v };
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return { value: null };
    if (NIL_VARIANTS.has(trimmed.toLowerCase())) return { value: 0 };
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return { value: parsed };
    return { value: 0, flag: trimmed };
  }
  return { value: 0, flag: String(v) };
}

type BlockAnchor = {
  weekOneRow: number; // 0-indexed row of the "Week 1" cell
  weekOneCol: number; // 0-indexed col of the "Week 1" cell
  labelCol: number;   // weekOneCol - 1
  month: number;      // 1-12
};

function findMonthForAnchor(
  rows: unknown[][],
  weekOneRow: number,
  labelCol: number,
  weekOneCol: number,
): number | null {
  // Scan upward up to MAX_MONTH_SCAN_UPWARD rows, looking at any cell in the
  // block's column span for a month name. The month header is sometimes
  // placed over the label col (Jan), sometimes over the value cols (Apr).
  const minCol = labelCol;
  const maxCol = weekOneCol + 5;
  for (let r = weekOneRow - 1; r >= Math.max(0, weekOneRow - MAX_MONTH_SCAN_UPWARD); r--) {
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

function findBlockAnchors(rows: unknown[][]): BlockAnchor[] {
  const anchors: BlockAnchor[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      if (cell.trim().toLowerCase() !== 'week 1') continue;
      if (c < 1) continue; // need col-1 for label
      const month = findMonthForAnchor(rows, r, c - 1, c);
      if (month === null) continue;
      anchors.push({ weekOneRow: r, weekOneCol: c, labelCol: c - 1, month });
    }
  }
  return anchors;
}

// Find the row where the NEXT block at the SAME labelCol starts (i.e. the
// next month header below this anchor's region). That bounds how far we scan.
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
    // Block ends a few rows ABOVE the next anchor (the next month header is
    // 2 rows above its Week 1, but we'll conservatively stop at the next
    // weekOneRow - 2 to skip the header band).
    end = Math.min(end, a.weekOneRow - 1);
    break;
  }
  return end;
}

export function parseRealtorMetricsTab(
  rows: unknown[][],
  ingestYear: number,
  aliasMap: Map<string, string>,
): ParseResult {
  const anchors = findBlockAnchors(rows);
  const stats: ParseStats = {
    blocksFound: anchors.length,
    rowsParsed: 0,
    rowsSkipped: 0,
    unknownLabels: new Map(),
    nonNumericValues: 0,
    totalMismatches: 0,
  };

  // De-dupe by (period_month, metric_key) inside this tab in case the same
  // metric somehow appears twice (e.g. duplicated block). Last write wins on
  // ingest because of the source_row_id unique constraint, but the parser
  // shouldn't emit two rows that conflict either.
  const seen = new Map<string, ParsedMetricRow>();

  for (const anchor of anchors) {
    const endRow = findBlockEndRow(anchors, anchor, rows.length);
    for (let r = anchor.weekOneRow + 1; r < endRow; r++) {
      const row = rows[r] ?? [];
      const rawLabel = row[anchor.labelCol];
      const labelNorm = normalizeLabel(rawLabel);
      if (!labelNorm) continue;

      // Section / subsection / text-only rows — silently skip.
      if (SKIP_LABELS.has(labelNorm)) {
        stats.rowsSkipped++;
        continue;
      }

      // If the label looks like a month name we've stepped into another
      // block's header — stop this block.
      if (MONTHS[labelNorm.toUpperCase()]) break;

      const metric_key = aliasMap.get(labelNorm);
      if (!metric_key) {
        stats.unknownLabels.set(
          labelNorm,
          (stats.unknownLabels.get(labelNorm) ?? 0) + 1,
        );
        continue;
      }

      const flags: QualityFlags = {};
      const week_values: Record<string, number | null> = {};
      let weekSum = 0;
      let anyWeekHadValue = false;
      const nonNumericDetails: string[] = [];

      for (let w = 1; w <= 5; w++) {
        const cell = row[anchor.weekOneCol + (w - 1)];
        const c = coerceNumeric(cell);
        week_values[String(w)] = c.value;
        if (c.value !== null) {
          weekSum += c.value;
          anyWeekHadValue = true;
        }
        if (c.flag !== undefined) {
          stats.nonNumericValues++;
          nonNumericDetails.push(`w${w}='${c.flag}'`);
        }
      }

      const totalCell = row[anchor.weekOneCol + 5];
      const totalCoerced = coerceNumeric(totalCell);
      if (totalCoerced.flag !== undefined) {
        stats.nonNumericValues++;
        nonNumericDetails.push(`total='${totalCoerced.flag}'`);
      }

      // Our computed total wins; source Total is preserved in raw_row.
      // Mismatch becomes a quality flag — never a silent reconciliation.
      let computedTotal: number | null = null;
      if (anyWeekHadValue) computedTotal = weekSum;
      const sourceTotal = totalCoerced.value;
      if (
        computedTotal !== null &&
        sourceTotal !== null &&
        Math.abs(sourceTotal - computedTotal) > 0.0001
      ) {
        flags[QUALITY_FLAGS.TOTAL_MISMATCH] =
          `source=${sourceTotal}, week_sum=${computedTotal}`;
        stats.totalMismatches++;
      }
      // If no week values were populated but source Total was, fall back to it
      // so the row isn't lost (e.g. supervisor only filled the Total for the
      // month and not week-by-week).
      if (computedTotal === null && sourceTotal !== null) {
        computedTotal = sourceTotal;
      }

      if (nonNumericDetails.length > 0) {
        flags[QUALITY_FLAGS.NON_NUMERIC_VALUE] = nonNumericDetails.join('; ');
      }

      const source_row_id = `y${ingestYear}-m${String(anchor.month).padStart(2, '0')}-${metric_key}`;

      const raw_row: Record<string, unknown> = {
        label: typeof rawLabel === 'string' ? rawLabel : null,
        period_month: anchor.month,
        week_1: row[anchor.weekOneCol] ?? null,
        week_2: row[anchor.weekOneCol + 1] ?? null,
        week_3: row[anchor.weekOneCol + 2] ?? null,
        week_4: row[anchor.weekOneCol + 3] ?? null,
        week_5: row[anchor.weekOneCol + 4] ?? null,
        Total:  row[anchor.weekOneCol + 5] ?? null,
        sheet_row: r + 1, // 1-indexed for inspection in the dashboard editor
      };

      const parsed: ParsedMetricRow = {
        source_row_id,
        raw_row,
        quality_flags: flags,
        period_year: ingestYear,
        period_month: anchor.month,
        metric_key,
        total: computedTotal,
        week_values,
      };

      seen.set(source_row_id, parsed); // last write wins on duplicate metric
      stats.rowsParsed++;
    }
  }

  return { rows: Array.from(seen.values()), stats };
}

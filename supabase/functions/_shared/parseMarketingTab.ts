// Marketing Fund Expense sheet helpers.
//
// The supervisor's source sheet has one tab per month. Tab naming is
// inconsistent across years (bare "January" for 2025, explicit "January 2026"
// for 2026, etc.) — for v1 we only ingest tabs matching `^[A-Za-z]+ <YEAR>$`
// for years we explicitly opt into. Earlier years are out of scope per the
// project brief (H1 2025 PDF is the baseline; the dashboard ingests 2026
// forward).
//
// Header row detection: the expenditure block uses the literal header
// sequence `Date | Description | Total | Category` starting at some column.
// On May 2026 the sequence sits at columns E–H (indices 4–7), because rows
// 1–3 hold stale title text (e.g. "Petty Cash Book August" — the tab was
// duplicated from a prior month without updating the in-cell title). We
// scan the first SCAN_DEPTH rows for the quad rather than hard-coding row
// 4 / columns 4–7 so the function doesn't break if a future tab shifts a
// row or pads a column.
//
// Income side (columns A–C: Date | Description | Amount) is out of scope
// for v1 — the H1 KPIs are spend-side, and income rows are mostly
// "Balance b/f" carryovers. Helper still exposes the income-block detection
// hook (findIncomeHeader) so it can be wired in later without reshape.

const MONTH_NAMES: Record<string, number> = {
  january: 1,  february: 2,  march: 3,    april: 4,
  may: 5,      june: 6,      july: 7,     august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

// Years the dashboard ingests. Adding 2027 later is a one-line change here.
const INGEST_YEARS = new Set<number>([2026]);

export type TabPeriod = { year: number; month: number };

// Parses a tab name like "May 2026" → { year: 2026, month: 5 }.
// Returns null for any tab we don't ingest (bare month names, `_Categories`,
// years outside INGEST_YEARS, etc.). Trim trailing whitespace because the
// supervisor's tab names carry stray trailing spaces ("September " etc.).
export function parseMarketingTabName(name: string): TabPeriod | null {
  const trimmed = name.trim();
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (!m) return null;
  const month = MONTH_NAMES[m[1].toLowerCase()];
  const year = Number(m[2]);
  if (!month) return null;
  if (!INGEST_YEARS.has(year)) return null;
  return { year, month };
}

export type ExpenditureHeader = {
  rowIndex: number;    // 0-indexed row within the values array
  colDate: number;
  colDescription: number;
  colTotal: number;
  colCategory: number;
};

const SCAN_DEPTH = 10;

function normalizeCell(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

// Finds the expenditure-side header quad: Date | Description | Total | Category.
// The four cells must be in adjacent columns. Returns null if not found within
// the first SCAN_DEPTH rows — caller treats that as a malformed tab to skip.
export function findExpenditureHeader(rows: unknown[][]): ExpenditureHeader | null {
  const limit = Math.min(rows.length, SCAN_DEPTH);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c + 3 < row.length; c++) {
      if (
        normalizeCell(row[c])     === 'date' &&
        normalizeCell(row[c + 1]) === 'description' &&
        normalizeCell(row[c + 2]) === 'total' &&
        normalizeCell(row[c + 3]) === 'category'
      ) {
        return {
          rowIndex: r,
          colDate: c,
          colDescription: c + 1,
          colTotal: c + 2,
          colCategory: c + 3,
        };
      }
    }
  }
  return null;
}

// Marketing Fund Expense sheet helpers.
//
// The supervisor's source sheet has one tab per month, named `<Month> <Year>`
// (e.g. "September 2025", "January 2026"). Any tab matching that structure is
// ingested — no lower-year floor — so renamed/added historical month tabs
// (e.g. the 2024/2025 expense tabs) are picked up the same as current ones,
// per the data-entry standard (docs/data-entry/00-common.md). Bare month names
// with no year ("January") don't match the structure and are correctly ignored.
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

export type TabPeriod = { year: number; month: number };

// Parses a tab name like "May 2026" → { year: 2026, month: 5 }.
// Returns null for any tab that isn't a `<Month> <Year>` expense tab (bare
// month names, `_Categories`, etc.). No lower-year floor — any conforming month
// tab is ingested, so historical years (2024/2025) carry over like every other
// source; `period_year` keeps them separate in the DB and the date-range
// selector switches between them. The only guard is the upper bound (current
// UTC year + 1), a cheap defence against a typo'd far-future tab ("May 2099").
// Trim trailing whitespace because the supervisor's tab names carry stray
// trailing spaces ("September " etc.).
export function parseMarketingTabName(name: string): TabPeriod | null {
  const trimmed = name.trim();
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (!m) return null;
  const month = MONTH_NAMES[m[1].toLowerCase()];
  const year = Number(m[2]);
  if (!month) return null;
  const maxYear = new Date().getUTCFullYear() + 1;
  if (year > maxYear) return null;
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

// Year-tab discovery — the mechanism that lets the dashboard carry over into
// 2027 and beyond without a code change each January.
//
// Background (supervisor concern, 2026-06-04): the financial source of truth
// (Bank Deposit `2026 LAND`) and several other sources live in tabs whose name
// embeds the year. The supervisor confirmed he creates a NEW tab in the SAME
// spreadsheet each year ("2027 LAND", "2027 Weekly Sales Report", …). Ingests
// that hardcoded `2026` would silently stop updating on 2027-01-01.
//
// `discoverYearTabs` lists the spreadsheet's tabs and returns every one whose
// title matches a {year}-prefixed pattern, so a freshly-added "2027 …" tab is
// picked up automatically. Every fact + aggregate row already stores
// `period_year`, so multiple years coexist in the DB cleanly — this is purely
// an ingest-discovery concern.

import { getSheetTabs } from './sheetsAuth.ts';

export type YearTab = { tab: string; year: number };

// Discover all tabs whose (trimmed) title matches `pattern`, which MUST contain
// exactly one capture group for the 4-digit year — e.g. /^(\d{4}) LAND$/
// matches "2026 LAND" and "2027 LAND".
//
// IMPORTANT: pass a NON-global RegExp (no `/g` flag) — `exec` on a global regex
// is stateful and would skip matches across calls.
//
// No lower-year floor: the data-entry standard (docs/data-entry/00-common.md §6)
// is "add a year tab, never rename" and the dashboard is meant to read every
// year side by side, so ANY standard-named year tab is legitimate — including
// historical baselines like `2025 Media Team Reporting`. A previous `minYear`
// floor silently dropped that 2025 tab; removed 2026-06-11. The only remaining
// guard is the upper bound (current UTC year + 1), a cheap defence against a
// typo'd far-future tab like "3026 LAND". Results are sorted oldest-year-first.
export async function discoverYearTabs(
  accessToken: string,
  spreadsheetId: string,
  pattern: RegExp,
): Promise<YearTab[]> {
  const maxYear = new Date().getUTCFullYear() + 1;
  const tabs = await getSheetTabs(accessToken, spreadsheetId);
  const out: YearTab[] = [];
  for (const meta of tabs) {
    const m = pattern.exec(meta.title.trim());
    if (!m) continue;
    const year = Number(m[1]);
    if (Number.isFinite(year) && year <= maxYear) {
      out.push({ tab: meta.title, year });
    }
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}

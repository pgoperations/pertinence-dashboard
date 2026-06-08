import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Customer Support panel — sources every panel metric from
// `customer_support_logs` directly (one paginated fetch), keyed on the entry
// date (log_date ← source "Date" column).
//
// Resolution model — reconciled 2026-06-05 against the supervisor's own
// Apps Script Customer Service portal (getLeaderboardData / classifyStatus in
// code.gs), so the two dashboards agree on the same sheet:
//
//   * A TICKET = one sheet row. Our ingest splits composite "Nature of
//     Complaint" cells into multiple customer_support_logs rows
//     (source_row_id `row-{N}-{i}`); the portal counts the sheet row once.
//     So all ticket-level metrics (Total, Resolved, Unresolved, per-rep,
//     monthly, resolution rate) collapse our split rows back to the logical
//     ticket `row-{N}` and count it once. Only "Complaints by Category" keeps
//     the per-atom split (a 2-complaint ticket legitimately hits 2 categories).
//   * Status is matched EXACTLY, mirroring the portal's classifyStatus:
//       Resolved   = status === 'resolved' OR 'responded'
//       Unresolved = status === 'pending'  OR 'in progress'
//       Other      = anything else, INCLUDING composites like "RESPONDED,
//                    PENDING" and blanks (counted in Total, neither bucket).
//     Whitespace (incl. NBSP / zero-width) is collapsed before comparing.
//   * Resolution Rate (headline) = Resolved / Total Customer Logs ×100 — the
//     portal's KPI-card formula (e.g. 568/703 = 80.8%), supervisor-confirmed.
//   * Per-rep efficiency = Resolved / (Resolved + Unresolved) — the portal's
//     leaderboard formula (excludes "other"), so a rep's % matches his portal.
//
// Brand attribution: the CS sheet carries NO brand column. Brand is inferred
// purely from which rep's tab a log came from (PPL = Catherine/Mariam/Mary,
// RealVest = Yetunde/Lovinal — seeded in customer_service_reps.brand_id). The
// per-rep performance chart is the disaggregation of that mapping.
// ----------------------------------------------------------------------------

export type BrandFilter = 'ppl' | 'realvest' | 'all';

export type CsBrand = {
  id: string;
  slug: string;
  name: string;
};

export type CsKpis = {
  totalLogs: number;
  /** RESOLVED + RESPONDED */
  resolved: number;
  /** PENDING + IN PROGRESS */
  unresolved: number;
  /** resolved / totalLogs — 0..1. NaN-safe. */
  resolutionRate: number;
};

export type CategoryMonthlyEntry = {
  month: string;
  count: number;
  resolvedCount: number;
  unresolvedCount: number;
};

export type CategorySample = {
  raw: string;
  count: number;
};

export type CategoryRow = {
  categoryName: string;
  count: number;
  resolvedCount: number;
  /** PENDING + IN PROGRESS complaints in this category. */
  unresolvedCount: number;
  resolutionRate: number;
  monthly: CategoryMonthlyEntry[];
  /** Top distinct complaint_raw strings within this category, by occurrence count. */
  samples: CategorySample[];
};

export type CategoryBreakdownEntry = {
  categoryName: string;
  count: number;
  resolvedCount: number;
};

export type RepMonthlyEntry = {
  month: string;
  total: number;
  resolved: number;
  unresolved: number;
};

export type RepRow = {
  repId: string;
  name: string;
  brandSlug: string;
  total: number;
  resolved: number;
  unresolved: number;
  /** blank / unrecognized status */
  other: number;
  /** resolved / total — 0..1 */
  resolutionRate: number;
  monthly: RepMonthlyEntry[];
};

export type RepBreakdownEntry = {
  name: string;
  total: number;
  resolved: number;
  unresolved: number;
};

export type CsMonthBucket = {
  /** YYYY-MM */
  month: string;
  total: number;
  resolved: number;
  unresolved: number;
  byRep: RepBreakdownEntry[];
  byCategory: CategoryBreakdownEntry[];
};

export type CsKpiBreakdowns = {
  /** Total → status composition (Resolved / Unresolved / Other). */
  totalLogs: { label: string; amount: number }[];
  /** Resolved tile → reps ranked by resolved count. */
  resolved: RepBreakdownEntry[];
  /** Unresolved tile → reps ranked by unresolved count. */
  unresolved: RepBreakdownEntry[];
  /** Resolution Rate tile → per-month rate (resolved / total). */
  resolutionRate: { month: string; rate: number; resolved: number; total: number }[];
};

export type CsPanelSources = {
  logsUpdatedAt: string | null;
};

export type CsPanelData = {
  brands: CsBrand[];
  /** The brand applied this load (resolved from the brand filter). */
  appliedBrand: BrandFilter;
  kpis: CsKpis;
  kpiBreakdowns: CsKpiBreakdowns;
  byRep: RepRow[];
  byCategory: CategoryRow[];
  monthly: CsMonthBucket[];
  sources: CsPanelSources;
};

type StatusClass = 'resolved' | 'unresolved' | 'other';

// Classify a raw Status-of-Complaint cell. Mirrors the Apps Script portal's
// classifyStatus EXACTLY (exact equality, not token-splitting): whitespace
// (incl. NBSP   and zero-width ​) collapsed to single spaces,
// lower-cased, trimmed, then compared. Composite cells ("RESPONDED, PENDING")
// and blanks fall through to 'other' — matching the portal's 703 = 568 + 127
// + 8-other split.
export function classifyStatus(raw: string | null | undefined): StatusClass {
  const s = (raw ?? '')
    .toString()
    .replace(/[\s ​]+/g, ' ')
    .toLowerCase()
    .trim();
  if (s === 'resolved' || s === 'responded') return 'resolved';
  if (s === 'pending' || s === 'in progress') return 'unresolved';
  return 'other';
}

// The logical ticket key for an atom row. Our ingest emits source_row_id
// `row-{N}-{i}` per composite split; the ticket is `row-{N}` within a rep's
// tab. Combine with rep_id so identical row numbers across reps don't merge.
function ticketKey(repId: string, sourceRowId: string): string {
  return `${repId}|${sourceRowId.replace(/-\d+$/, '')}`;
}

export async function loadCsPanelData(
  range: DateRange,
  brand: BrandFilter,
): Promise<CsPanelData> {
  const [brands, reps, categoryNames, logs] = await Promise.all([
    fetchCsBrands(),
    fetchReps(),
    fetchCategoryNames(),
    fetchLogs(range),
  ]);

  // Reference maps.
  const brandIdBySlug = new Map<string, string>();
  const brandSlugById = new Map<string, string>();
  for (const b of brands) {
    brandIdBySlug.set(b.slug, b.id);
    brandSlugById.set(b.id, b.slug);
  }
  const repById = new Map<string, CsRepRow>();
  for (const r of reps) repById.set(r.id, r);

  const wantedBrandId = brand === 'all' ? null : brandIdBySlug.get(brand) ?? null;
  const filtered = wantedBrandId
    ? logs.filter((l) => repById.get(l.rep_id)?.brand_id === wantedBrandId)
    : logs;

  // --- One-pass aggregation -------------------------------------------------
  let totalLogs = 0;
  let resolved = 0;
  let unresolved = 0;
  let logsUpdatedAt: string | null = null;

  type CatAcc = {
    count: number;
    resolvedCount: number;
    unresolvedCount: number;
    monthly: Map<string, { count: number; resolvedCount: number; unresolvedCount: number }>;
    samples: Map<string, number>;
  };
  const byCatAcc = new Map<string, CatAcc>();
  const ensureCat = (name: string): CatAcc => {
    let acc = byCatAcc.get(name);
    if (!acc) {
      acc = { count: 0, resolvedCount: 0, unresolvedCount: 0, monthly: new Map(), samples: new Map() };
      byCatAcc.set(name, acc);
    }
    return acc;
  };

  type RepAcc = {
    repId: string;
    total: number;
    resolved: number;
    unresolved: number;
    other: number;
    monthly: Map<string, { total: number; resolved: number; unresolved: number }>;
  };
  const byRepAcc = new Map<string, RepAcc>();
  const ensureRep = (repId: string): RepAcc => {
    let acc = byRepAcc.get(repId);
    if (!acc) {
      acc = { repId, total: 0, resolved: 0, unresolved: 0, other: 0, monthly: new Map() };
      byRepAcc.set(repId, acc);
    }
    return acc;
  };

  type MonthAcc = {
    total: number;
    resolved: number;
    unresolved: number;
    byRep: Map<string, { total: number; resolved: number; unresolved: number }>;
    byCat: Map<string, { count: number; resolvedCount: number }>;
  };
  const monthAcc = new Map<string, MonthAcc>();
  const ensureMonth = (key: string): MonthAcc => {
    let b = monthAcc.get(key);
    if (!b) {
      b = { total: 0, resolved: 0, unresolved: 0, byRep: new Map(), byCat: new Map() };
      monthAcc.set(key, b);
    }
    return b;
  };

  // Ticket-level dedup: our ingest splits composite complaints into multiple
  // atom rows that share one date/status; the portal counts the sheet row
  // once. We process ticket-level metrics only on the FIRST atom of each
  // logical ticket (`row-{N}`), but keep per-category counts on every atom.
  const seenTickets = new Set<string>();

  for (const row of filtered) {
    if (!row.log_date) continue;
    const monthKey = row.log_date.slice(0, 7);
    const month = ensureMonth(monthKey);
    const cls = classifyStatus(row.resolution_status);
    const isResolved = cls === 'resolved';
    const isUnresolved = cls === 'unresolved';

    const key = ticketKey(row.rep_id, row.source_row_id);
    const isFirstAtom = !seenTickets.has(key);
    if (isFirstAtom) seenTickets.add(key);

    // --- Ticket-level metrics (count each sheet row once) ------------------
    if (isFirstAtom) {
      totalLogs += 1;
      month.total += 1;
      if (isResolved) {
        resolved += 1;
        month.resolved += 1;
      } else if (isUnresolved) {
        unresolved += 1;
        month.unresolved += 1;
      }

      const repAcc = ensureRep(row.rep_id);
      repAcc.total += 1;
      if (isResolved) repAcc.resolved += 1;
      else if (isUnresolved) repAcc.unresolved += 1;
      else repAcc.other += 1;
      const repMonth = repAcc.monthly.get(monthKey) ?? { total: 0, resolved: 0, unresolved: 0 };
      repMonth.total += 1;
      if (isResolved) repMonth.resolved += 1;
      else if (isUnresolved) repMonth.unresolved += 1;
      repAcc.monthly.set(monthKey, repMonth);

      const repName = repById.get(row.rep_id)?.name ?? 'Unknown';
      const mRep = month.byRep.get(repName) ?? { total: 0, resolved: 0, unresolved: 0 };
      mRep.total += 1;
      if (isResolved) mRep.resolved += 1;
      else if (isUnresolved) mRep.unresolved += 1;
      month.byRep.set(repName, mRep);
    }

    // --- Per-category (Complaints by Category card) — every atom that carries
    // a complaint nature, so a multi-complaint ticket hits each of its
    // categories. "Resolved" uses the same exact-match bucketing.
    if (row.complaint_category_id != null) {
      const catName = categoryNames.get(row.complaint_category_id) ?? 'Uncategorized';
      const acc = ensureCat(catName);
      acc.count += 1;
      if (isResolved) acc.resolvedCount += 1;
      else if (isUnresolved) acc.unresolvedCount += 1;
      const monthCat = acc.monthly.get(monthKey) ?? { count: 0, resolvedCount: 0, unresolvedCount: 0 };
      monthCat.count += 1;
      if (isResolved) monthCat.resolvedCount += 1;
      else if (isUnresolved) monthCat.unresolvedCount += 1;
      acc.monthly.set(monthKey, monthCat);
      if (row.complaint_raw && row.complaint_raw.trim()) {
        const raw = row.complaint_raw.trim();
        acc.samples.set(raw, (acc.samples.get(raw) ?? 0) + 1);
      }
      const mCat = month.byCat.get(catName) ?? { count: 0, resolvedCount: 0 };
      mCat.count += 1;
      if (isResolved) mCat.resolvedCount += 1;
      month.byCat.set(catName, mCat);
    }

    if (row.updated_at && (!logsUpdatedAt || row.updated_at > logsUpdatedAt)) {
      logsUpdatedAt = row.updated_at;
    }
  }

  // --- Materialize byRep ----------------------------------------------------
  const byRep: RepRow[] = [...byRepAcc.values()]
    .map((acc) => {
      const rep = repById.get(acc.repId);
      return {
        repId: acc.repId,
        name: rep?.name ?? 'Unknown',
        brandSlug: rep ? brandSlugById.get(rep.brand_id) ?? 'all' : 'all',
        total: acc.total,
        resolved: acc.resolved,
        unresolved: acc.unresolved,
        other: acc.other,
        // Efficiency = resolved / (resolved + unresolved), matching the Apps
        // Script portal's leaderboard (excludes "other"), so a rep's % lines up
        // with his portal rather than the headline resolved/total rate.
        resolutionRate:
          acc.resolved + acc.unresolved > 0
            ? acc.resolved / (acc.resolved + acc.unresolved)
            : 0,
        monthly: [...acc.monthly.entries()]
          .map(([month, v]) => ({ month, ...v }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    })
    // Group by brand, then by volume within brand — keeps PPL/RealVest visually
    // clustered when the "all" filter is active.
    .sort((a, b) =>
      a.brandSlug === b.brandSlug ? b.total - a.total : a.brandSlug.localeCompare(b.brandSlug),
    );

  // --- Materialize byCategory ----------------------------------------------
  const byCategory: CategoryRow[] = [...byCatAcc.entries()]
    .map(([categoryName, acc]) => ({
      categoryName,
      count: acc.count,
      resolvedCount: acc.resolvedCount,
      unresolvedCount: acc.unresolvedCount,
      resolutionRate: acc.count > 0 ? acc.resolvedCount / acc.count : 0,
      monthly: [...acc.monthly.entries()]
        .map(([month, v]) => ({
          month,
          count: v.count,
          resolvedCount: v.resolvedCount,
          unresolvedCount: v.unresolvedCount,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      samples: [...acc.samples.entries()]
        .map(([raw, count]) => ({ raw, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);

  // --- Materialize monthly --------------------------------------------------
  const monthly: CsMonthBucket[] = [...monthAcc.entries()]
    .map(([month, acc]) => ({
      month,
      total: acc.total,
      resolved: acc.resolved,
      unresolved: acc.unresolved,
      byRep: [...acc.byRep.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total),
      byCategory: [...acc.byCat.entries()]
        .map(([categoryName, v]) => ({
          categoryName,
          count: v.count,
          resolvedCount: v.resolvedCount,
        }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // --- KPI breakdowns ------------------------------------------------------
  const other = totalLogs - resolved - unresolved;
  const repsByResolved: RepBreakdownEntry[] = byRep
    .map((r) => ({ name: r.name, total: r.total, resolved: r.resolved, unresolved: r.unresolved }))
    .sort((a, b) => b.resolved - a.resolved);
  const repsByUnresolved: RepBreakdownEntry[] = byRep
    .map((r) => ({ name: r.name, total: r.total, resolved: r.resolved, unresolved: r.unresolved }))
    .sort((a, b) => b.unresolved - a.unresolved);

  const kpiBreakdowns: CsKpiBreakdowns = {
    totalLogs: [
      { label: 'Resolved (resolved + responded)', amount: resolved },
      { label: 'Unresolved (pending + in progress)', amount: unresolved },
      { label: 'No / other status', amount: other },
    ].filter((e) => e.amount > 0),
    resolved: repsByResolved,
    unresolved: repsByUnresolved,
    resolutionRate: monthly.map((m) => ({
      month: m.month,
      rate: m.total > 0 ? m.resolved / m.total : 0,
      resolved: m.resolved,
      total: m.total,
    })),
  };

  const resolutionRate = totalLogs > 0 ? resolved / totalLogs : 0;

  return {
    brands,
    appliedBrand: brand,
    kpis: {
      totalLogs,
      resolved,
      unresolved,
      resolutionRate,
    },
    kpiBreakdowns,
    byRep,
    byCategory,
    monthly,
    sources: { logsUpdatedAt },
  };
}

// ----------------------------------------------------------------------------
// Fetchers
// ----------------------------------------------------------------------------

async function fetchCsBrands(): Promise<CsBrand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('id, slug, name')
    .eq('is_cs', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CsBrand[];
}

type CsRepRow = { id: string; name: string; brand_id: string };

async function fetchReps(): Promise<CsRepRow[]> {
  const { data, error } = await supabase
    .from('customer_service_reps')
    .select('id, name, brand_id');
  if (error) throw error;
  return (data ?? []) as CsRepRow[];
}

async function fetchCategoryNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('complaint_categories')
    .select('id, name');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.name);
  return map;
}

type CsLogRow = {
  log_date: string | null;
  rep_id: string;
  source_row_id: string;
  complaint_category_id: string | null;
  complaint_raw: string | null;
  resolution_status: string | null;
  updated_at: string | null;
};

async function fetchLogs(range: DateRange): Promise<CsLogRow[]> {
  const rows: CsLogRow[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('customer_support_logs')
      .select(
        'log_date, rep_id, source_row_id, complaint_category_id, complaint_raw, resolution_status, updated_at',
      )
      .gte('log_date', range.from)
      .lte('log_date', range.to)
      .order('log_date', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as CsLogRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

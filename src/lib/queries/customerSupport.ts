import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Customer Support panel — sources every panel metric from
// `customer_support_logs` directly (one paginated fetch). The
// `customer_support_monthly` aggregate isn't sufficient by itself: the H1 PDF
// frames resolution rate as resolved-complaints / total-complaints, but the
// aggregate's `resolved_count` is over ALL logs (enquiries + complaints).
// Sourcing everything from one table also keeps brand filtering trivial via
// rep_id → brand_id, with no extra join.
//
// Semantics inherited from the ingest + migration 014:
//   * "Enquiry"  = log with no complaint_category_id (channel populated, no
//                  complaint nature)
//   * "Complaint" = log with a complaint_category_id (split by the
//                  composite-cell parser at ingest time)
//   * "Resolved" = lower(trim(resolution_status)) === 'resolved'.
//                  RESPONDED / PENDING / IN PROGRESS excluded — per
//                  migration 014.
// ----------------------------------------------------------------------------

export type BrandFilter = 'ppl' | 'realvest' | 'all';

export type CsBrand = {
  id: string;
  slug: string;
  name: string;
};

export type CsKpis = {
  totalLogs: number;
  enquiries: number;
  complaints: number;
  resolvedComplaints: number;
  /** resolvedComplaints / complaints — 0..1. NaN-safe (returns 0 when no complaints). */
  resolutionRate: number;
};

export type ChannelMonthlyEntry = {
  month: string;
  count: number;
};

export type ChannelRow = {
  channel: string;
  count: number;
  monthly: ChannelMonthlyEntry[];
};

export type CategoryMonthlyEntry = {
  month: string;
  count: number;
  resolvedCount: number;
};

export type CategorySample = {
  raw: string;
  count: number;
};

export type CategoryRow = {
  categoryName: string;
  count: number;
  resolvedCount: number;
  resolutionRate: number;
  monthly: CategoryMonthlyEntry[];
  /** Top distinct complaint_raw strings within this category, by occurrence count. */
  samples: CategorySample[];
};

export type ChannelBreakdownEntry = {
  channel: string;
  count: number;
};

export type CategoryBreakdownEntry = {
  categoryName: string;
  count: number;
  resolvedCount: number;
};

export type CsMonthBucket = {
  /** YYYY-MM */
  month: string;
  enquiries: number;
  complaints: number;
  resolvedComplaints: number;
  byChannel: ChannelBreakdownEntry[];
  byCategory: CategoryBreakdownEntry[];
};

export type CsKpiBreakdowns = {
  /** Pseudo-breakdown for the hero "Total Logs" → enquiries vs complaints. */
  totalLogs: { label: string; amount: number }[];
  /** Top channels (drives Enquiries tile drill). */
  enquiries: ChannelBreakdownEntry[];
  /** Top categories (drives Complaints tile drill). */
  complaints: CategoryBreakdownEntry[];
  /** Categories ranked by resolved count (drives Resolved tile drill). */
  resolvedComplaints: CategoryBreakdownEntry[];
  /** Per-month resolution rate (drives Resolution Rate tile drill). */
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
  byChannel: ChannelRow[];
  byCategory: CategoryRow[];
  monthly: CsMonthBucket[];
  sources: CsPanelSources;
};

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

  // brandId map for filtering
  const brandIdBySlug = new Map<string, string>();
  for (const b of brands) brandIdBySlug.set(b.slug, b.id);
  const repBrandIdById = new Map<string, string>();
  for (const r of reps) repBrandIdById.set(r.id, r.brand_id);

  const wantedBrandId = brand === 'all' ? null : brandIdBySlug.get(brand) ?? null;
  const filtered = wantedBrandId
    ? logs.filter((l) => repBrandIdById.get(l.rep_id) === wantedBrandId)
    : logs;

  // --- One-pass aggregation -------------------------------------------------
  let totalLogs = 0;
  let complaints = 0;
  let resolvedComplaints = 0;
  let logsUpdatedAt: string | null = null;

  type CatAcc = {
    count: number;
    resolvedCount: number;
    monthly: Map<string, { count: number; resolvedCount: number }>;
    samples: Map<string, number>;
  };
  const byCatAcc = new Map<string, CatAcc>();
  const ensureCat = (name: string): CatAcc => {
    let acc = byCatAcc.get(name);
    if (!acc) {
      acc = { count: 0, resolvedCount: 0, monthly: new Map(), samples: new Map() };
      byCatAcc.set(name, acc);
    }
    return acc;
  };

  type ChAcc = {
    count: number;
    monthly: Map<string, number>;
  };
  const byChannelAcc = new Map<string, ChAcc>();
  const ensureChannel = (name: string): ChAcc => {
    let acc = byChannelAcc.get(name);
    if (!acc) {
      acc = { count: 0, monthly: new Map() };
      byChannelAcc.set(name, acc);
    }
    return acc;
  };

  const monthMap = new Map<string, CsMonthBucket>();
  const ensureMonth = (key: string): CsMonthBucket => {
    let b = monthMap.get(key);
    if (!b) {
      b = {
        month: key,
        enquiries: 0,
        complaints: 0,
        resolvedComplaints: 0,
        byChannel: [],
        byCategory: [],
      };
      monthMap.set(key, b);
    }
    return b;
  };

  // Per-month per-channel + per-month per-category for the monthly buckets'
  // drill payload.
  const monthCh = new Map<string, Map<string, number>>();
  const monthCat = new Map<string, Map<string, { count: number; resolvedCount: number }>>();
  const addMonthCh = (month: string, ch: string) => {
    let inner = monthCh.get(month);
    if (!inner) {
      inner = new Map();
      monthCh.set(month, inner);
    }
    inner.set(ch, (inner.get(ch) ?? 0) + 1);
  };
  const addMonthCat = (month: string, cat: string, resolved: boolean) => {
    let inner = monthCat.get(month);
    if (!inner) {
      inner = new Map();
      monthCat.set(month, inner);
    }
    const e = inner.get(cat) ?? { count: 0, resolvedCount: 0 };
    e.count += 1;
    if (resolved) e.resolvedCount += 1;
    inner.set(cat, e);
  };

  for (const row of filtered) {
    if (!row.log_date) continue;
    const monthKey = row.log_date.slice(0, 7);
    const month = ensureMonth(monthKey);
    totalLogs += 1;

    const isResolved =
      (row.resolution_status ?? '').trim().toLowerCase() === 'resolved';
    const isComplaint = row.complaint_category_id != null;

    if (isComplaint) {
      complaints += 1;
      month.complaints += 1;
      if (isResolved) {
        resolvedComplaints += 1;
        month.resolvedComplaints += 1;
      }
      const catName = categoryNames.get(row.complaint_category_id!) ?? 'Uncategorized';
      const acc = ensureCat(catName);
      acc.count += 1;
      if (isResolved) acc.resolvedCount += 1;
      const monthAcc = acc.monthly.get(monthKey) ?? { count: 0, resolvedCount: 0 };
      monthAcc.count += 1;
      if (isResolved) monthAcc.resolvedCount += 1;
      acc.monthly.set(monthKey, monthAcc);
      if (row.complaint_raw && row.complaint_raw.trim()) {
        const raw = row.complaint_raw.trim();
        acc.samples.set(raw, (acc.samples.get(raw) ?? 0) + 1);
      }
      addMonthCat(monthKey, catName, isResolved);
    } else {
      month.enquiries += 1;
    }

    if (row.channel) {
      const ch = row.channel.trim();
      if (ch) {
        const acc = ensureChannel(ch);
        acc.count += 1;
        acc.monthly.set(monthKey, (acc.monthly.get(monthKey) ?? 0) + 1);
        addMonthCh(monthKey, ch);
      }
    }

    if (row.updated_at && (!logsUpdatedAt || row.updated_at > logsUpdatedAt)) {
      logsUpdatedAt = row.updated_at;
    }
  }

  const enquiries = totalLogs - complaints;

  // --- Materialize the result ---------------------------------------------
  const byChannel: ChannelRow[] = [...byChannelAcc.entries()]
    .map(([channel, acc]) => ({
      channel,
      count: acc.count,
      monthly: [...acc.monthly.entries()]
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    }))
    .sort((a, b) => b.count - a.count);

  const byCategory: CategoryRow[] = [...byCatAcc.entries()]
    .map(([categoryName, acc]) => ({
      categoryName,
      count: acc.count,
      resolvedCount: acc.resolvedCount,
      resolutionRate: acc.count > 0 ? acc.resolvedCount / acc.count : 0,
      monthly: [...acc.monthly.entries()]
        .map(([month, v]) => ({ month, count: v.count, resolvedCount: v.resolvedCount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      samples: [...acc.samples.entries()]
        .map(([raw, count]) => ({ raw, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);

  // Materialize monthly buckets with their per-channel/category drill payload.
  for (const [month, bucket] of monthMap) {
    const chInner = monthCh.get(month);
    if (chInner) {
      bucket.byChannel = [...chInner.entries()]
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count);
    }
    const catInner = monthCat.get(month);
    if (catInner) {
      bucket.byCategory = [...catInner.entries()]
        .map(([categoryName, v]) => ({
          categoryName,
          count: v.count,
          resolvedCount: v.resolvedCount,
        }))
        .sort((a, b) => b.count - a.count);
    }
  }
  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // --- KPI breakdowns ------------------------------------------------------
  const kpiBreakdowns: CsKpiBreakdowns = {
    totalLogs: [
      { label: 'Enquiries (no complaint nature)', amount: enquiries },
      { label: 'Complaints (with category)',      amount: complaints },
    ].filter((e) => e.amount > 0),
    enquiries: byChannel.map((c) => ({ channel: c.channel, count: c.count })),
    complaints: byCategory.map((c) => ({
      categoryName: c.categoryName,
      count: c.count,
      resolvedCount: c.resolvedCount,
    })),
    resolvedComplaints: [...byCategory]
      .filter((c) => c.resolvedCount > 0)
      .sort((a, b) => b.resolvedCount - a.resolvedCount)
      .map((c) => ({
        categoryName: c.categoryName,
        count: c.count,
        resolvedCount: c.resolvedCount,
      })),
    resolutionRate: monthly.map((m) => ({
      month: m.month,
      rate: m.complaints > 0 ? m.resolvedComplaints / m.complaints : 0,
      resolved: m.resolvedComplaints,
      total: m.complaints,
    })),
  };

  const resolutionRate = complaints > 0 ? resolvedComplaints / complaints : 0;

  return {
    brands,
    appliedBrand: brand,
    kpis: {
      totalLogs,
      enquiries,
      complaints,
      resolvedComplaints,
      resolutionRate,
    },
    kpiBreakdowns,
    byChannel,
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

type CsRepRow = { id: string; brand_id: string };

async function fetchReps(): Promise<CsRepRow[]> {
  const { data, error } = await supabase
    .from('customer_service_reps')
    .select('id, brand_id');
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
  channel: string | null;
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
        'log_date, rep_id, channel, complaint_category_id, complaint_raw, resolution_status, updated_at',
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

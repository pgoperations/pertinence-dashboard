import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Realtor Management panel — sources from `realtor_metrics_monthly` (long
// format: one row per period_year/period_month/metric_key) +
// `realtor_metric_canonicals` (display name + category + display_order).
//
// Aggregate-only by design (v1 locked 2026-05-14). Per-manager performance
// (Mrs Kemi / Richard Makava / Debbie) is Phase 2 — see DESIGN_DECISIONS.md.
// ----------------------------------------------------------------------------

export type MetricCategory = 'recruitment' | 'activity' | 'sales_perf';

export type MetricCanonical = {
  key: string;
  displayName: string;
  category: MetricCategory;
  displayOrder: number;
};

export type MonthEntry = {
  /** YYYY-MM */
  month: string;
  value: number | null;
};

export type MetricRow = {
  key: string;
  displayName: string;
  category: MetricCategory;
  displayOrder: number;
  /** Sum across all months in range (treats null as 0 for totalling). */
  total: number;
  /** Per-month values within the range, asc. Missing months omitted. */
  monthly: MonthEntry[];
  /** Whether any row for this metric in the range had a `total_mismatch` flag. */
  hasMismatch: boolean;
  /** Sub-metrics for UI drill-down. Set on synthesized merged rows
   *  (e.g. "Weekly Realtor Meeting" merges Master Class 1 + 2). The merged
   *  total/monthly are pre-summed from sub-rows; the panel can expose the
   *  split via row-drill without re-querying. */
  subRows?: MetricRow[];
};

export type MonthlyTrendBucket = {
  /** YYYY-MM */
  month: string;
  newReferrals: number;
  newBusinessReps: number;
  newRealtorsTotal: number;
  realtorsRecruitedAny: number;
  masterClass1: number;
  masterClass2: number;
  stakeholdersMeeting: number;
  /** Every recruitment + activity metric this month, keyed by metric key.
   *  Drives per-bar drill. */
  allMetrics: Record<string, number | null>;
};

export type RealtorPanelSources = {
  latestUpdatedAt: string | null;
};

export type RealtorPanelData = {
  /** All canonical metrics, ordered for UI grouping (recruitment first). */
  canonicals: MetricCanonical[];
  /** Metric rows in display order. Empty array if no data in range. */
  recruitment: MetricRow[];
  activity: MetricRow[];
  /** Sales-perf metrics — not shown on v1 cards but available if a future card
   *  wants them (the H1 PDF had a realtor-sale-tier wide table). */
  salesPerf: MetricRow[];
  /** Monthly trend buckets, asc by month. */
  monthlyTrend: MonthlyTrendBucket[];
  /** Distinct months observed in the range (drives empty-state). */
  monthsObserved: number;
  /** Total `total_mismatch`-flagged metric rows in range (for honesty chip). */
  mismatchCount: number;
  sources: RealtorPanelSources;
};

const RECRUITMENT_TREND_KEYS = [
  'new_referrals',
  'new_business_reps',
] as const;

export const MERGED_WEEKLY_MEETING_KEY = 'weekly_realtor_meeting';

function mergeActivityForDisplay(activityRaw: MetricRow[]): MetricRow[] {
  const mc1 = activityRaw.find((r) => r.key === 'master_class_1');
  const mc2 = activityRaw.find((r) => r.key === 'master_class_2');
  const others = activityRaw.filter(
    (r) => r.key !== 'master_class_1' && r.key !== 'master_class_2',
  );
  if (!mc1 || !mc2) return activityRaw;

  // Combine month buckets — null+null stays null, otherwise sum (null→0).
  const monthMap = new Map<string, number | null>();
  for (const m of mc1.monthly) monthMap.set(m.month, m.value);
  for (const m of mc2.monthly) {
    if (monthMap.has(m.month)) {
      const a = monthMap.get(m.month) ?? null;
      monthMap.set(
        m.month,
        a === null && m.value === null ? null : (a ?? 0) + (m.value ?? 0),
      );
    } else {
      monthMap.set(m.month, m.value);
    }
  }
  const merged: MetricRow = {
    key: MERGED_WEEKLY_MEETING_KEY,
    displayName: 'Weekly Realtor Meeting',
    category: 'activity',
    displayOrder: 0,
    total: mc1.total + mc2.total,
    monthly: [...monthMap.entries()]
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    hasMismatch: mc1.hasMismatch || mc2.hasMismatch,
    subRows: [mc1, mc2],
  };

  return [merged, ...others].sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function loadRealtorPanelData(
  range: DateRange,
): Promise<RealtorPanelData> {
  const [canonicals, rows] = await Promise.all([
    fetchCanonicals(),
    fetchRows(range),
  ]);

  const canonicalByKey = new Map(canonicals.map((c) => [c.key, c]));

  // ---- aggregate per metric_key ------------------------------------------
  type Acc = {
    canonical: MetricCanonical;
    total: number;
    monthly: Map<string, number | null>;
    hasMismatch: boolean;
  };
  const accByKey = new Map<string, Acc>();
  let latestUpdatedAt: string | null = null;
  let mismatchCount = 0;

  for (const row of rows) {
    const canonical = canonicalByKey.get(row.metric_key);
    if (!canonical) continue; // metric_canonicals may have been edited mid-flight
    let acc = accByKey.get(row.metric_key);
    if (!acc) {
      acc = {
        canonical,
        total: 0,
        monthly: new Map(),
        hasMismatch: false,
      };
      accByKey.set(row.metric_key, acc);
    }
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const value = row.total === null ? null : Number(row.total);
    acc.monthly.set(monthKey, value);
    if (typeof value === 'number') acc.total += value;
    const hasFlag =
      row.quality_flags && typeof row.quality_flags === 'object'
        ? 'total_mismatch' in row.quality_flags
        : false;
    if (hasFlag) {
      acc.hasMismatch = true;
      mismatchCount += 1;
    }
    if (row.updated_at && (!latestUpdatedAt || row.updated_at > latestUpdatedAt)) {
      latestUpdatedAt = row.updated_at;
    }
  }

  // ---- materialize MetricRow[] ordered by category + display_order -------
  const toMetricRow = (acc: Acc): MetricRow => ({
    key: acc.canonical.key,
    displayName: acc.canonical.displayName,
    category: acc.canonical.category,
    displayOrder: acc.canonical.displayOrder,
    total: acc.total,
    monthly: [...acc.monthly.entries()]
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    hasMismatch: acc.hasMismatch,
  });

  // Some canonicals may have zero data rows in this range — surface them as
  // empty rows so the panel structure stays stable (counts always 0, not
  // missing). Easier supervisor reading.
  const ensureEveryCanonical = (cat: MetricCategory): MetricRow[] => {
    const out: MetricRow[] = [];
    for (const c of canonicals) {
      if (c.category !== cat) continue;
      const acc = accByKey.get(c.key);
      if (acc) {
        out.push(toMetricRow(acc));
      } else {
        out.push({
          key: c.key,
          displayName: c.displayName,
          category: c.category,
          displayOrder: c.displayOrder,
          total: 0,
          monthly: [],
          hasMismatch: false,
        });
      }
    }
    return out.sort((a, b) => a.displayOrder - b.displayOrder);
  };

  const recruitment = ensureEveryCanonical('recruitment');
  const salesPerf = ensureEveryCanonical('sales_perf');

  // Activity merge (supervisor-locked 2026-05-25): Master Class 1 + 2 surface
  // as a single "Weekly Realtor Meeting" row in the Activity card. They're
  // separate programs but the boss wants the combined number with a drill
  // exposing the 1 vs 2 split. We keep both canonicals in the DB
  // (realtor_metric_canonicals stays untouched) and merge at the UI layer.
  // Stakeholders Meeting attendance keeps its own row.
  const activityRaw = ensureEveryCanonical('activity');
  const activity = mergeActivityForDisplay(activityRaw);

  // ---- monthly trend ------------------------------------------------------
  // Bars stack new_referrals + new_business_reps (which together equal
  // new_realtors_total in the source, except where rounding/typos diverge —
  // we keep both for honesty). Per-bar drill carries every recruitment +
  // activity metric for that month.
  const monthSet = new Set<string>();
  for (const acc of accByKey.values()) {
    for (const m of acc.monthly.keys()) monthSet.add(m);
  }
  const months = [...monthSet].sort();

  const valueForMonth = (key: string, month: string): number | null => {
    const acc = accByKey.get(key);
    if (!acc) return null;
    return acc.monthly.get(month) ?? null;
  };

  // `allMetrics` covers every leaf source metric_key. The Monthly Trend
  // drill consumes this map; for the merged "Weekly Realtor Meeting" key it
  // synthesizes the sum so drill labels and values stay aligned with the
  // Activity card.
  const leafKeys = [
    ...recruitment.map((r) => r.key),
    ...activityRaw.map((r) => r.key),
  ];

  const monthlyTrend: MonthlyTrendBucket[] = months.map((month) => {
    const allMetrics: Record<string, number | null> = {};
    for (const k of leafKeys) {
      allMetrics[k] = valueForMonth(k, month);
    }
    const mc1 = valueForMonth('master_class_1', month);
    const mc2 = valueForMonth('master_class_2', month);
    allMetrics[MERGED_WEEKLY_MEETING_KEY] =
      mc1 === null && mc2 === null ? null : (mc1 ?? 0) + (mc2 ?? 0);

    const newReferrals = valueForMonth(RECRUITMENT_TREND_KEYS[0], month) ?? 0;
    const newBusinessReps = valueForMonth(RECRUITMENT_TREND_KEYS[1], month) ?? 0;
    return {
      month,
      newReferrals,
      newBusinessReps,
      newRealtorsTotal: valueForMonth('new_realtors_total', month) ?? 0,
      realtorsRecruitedAny: valueForMonth('realtors_recruited_any', month) ?? 0,
      masterClass1: mc1 ?? 0,
      masterClass2: mc2 ?? 0,
      stakeholdersMeeting: valueForMonth('stakeholders_meeting_attendance', month) ?? 0,
      allMetrics,
    };
  });

  return {
    canonicals,
    recruitment,
    activity,
    salesPerf,
    monthlyTrend,
    monthsObserved: months.length,
    mismatchCount,
    sources: { latestUpdatedAt },
  };
}


// ----------------------------------------------------------------------------
// Fetchers
// ----------------------------------------------------------------------------

async function fetchCanonicals(): Promise<MetricCanonical[]> {
  const { data, error } = await supabase
    .from('realtor_metric_canonicals')
    .select('key, display_name, category, display_order')
    .order('category', { ascending: true })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.key as string,
    displayName: r.display_name as string,
    category: r.category as MetricCategory,
    displayOrder: Number(r.display_order),
  }));
}

type MetricsRow = {
  period_year: number;
  period_month: number;
  metric_key: string;
  total: number | string | null;
  quality_flags: Record<string, unknown> | null;
  updated_at: string | null;
};

async function fetchRows(range: DateRange): Promise<MetricsRow[]> {
  // Filter by period_year/period_month range. Since the table grain is one
  // row per (year, month, metric), we can use cheap comparison filters in
  // SQL — no JS-side refinement needed.
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('realtor_metrics_monthly')
    .select('period_year, period_month, metric_key, total, quality_flags, updated_at')
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return (data ?? []).filter((r) => {
    const y = Number(r.period_year);
    const m = Number(r.period_month);
    if (y < fromYear || y > toYear) return false;
    if (y === fromYear && m < fromMonth) return false;
    if (y === toYear && m > toMonth) return false;
    return true;
  });
}

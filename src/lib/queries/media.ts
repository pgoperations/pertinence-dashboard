import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Media & Content panel — derived from `media_monthly_metrics` (aggregated by
// the refresh_media_monthly RPC, which knows per-metric agg_type: sum / last /
// avg). One row per (year, month, platform, brand, metric).
//
// The query loads the full set of monthly rows in the date range, plus
// reference tables (media_brands + media_metric_canonicals), and aggregates
// by brand × platform × metric for the panel. Total live volume is small
// (~270 rows for 4 months of 2026), so JS-side rollup is fine.
// ----------------------------------------------------------------------------

export type MediaPlatform = 'facebook' | 'instagram' | 'youtube';

export type MediaBrand = {
  id: string;
  key: string;
  displayName: string;
  displayOrder: number;
};

export type MediaMetricCanonical = {
  key: string;
  displayName: string;
  platform: MediaPlatform;
  displayOrder: number;
  aggType: 'sum' | 'last' | 'avg';
};

export type PlatformMetricSummary = {
  metricKey: string;
  displayName: string;
  aggType: 'sum' | 'last' | 'avg';
  /** Aggregate value over the range, applying the metric's aggType:
   *  - sum: sum of monthly values
   *  - last: value from the most recent month in range
   *  - avg: average of monthly values
   */
  value: number;
  /** Per-month series for the mini trend (months asc). */
  monthly: { month: string; value: number }[];
};

export type PlatformSummary = {
  platform: MediaPlatform;
  metrics: PlatformMetricSummary[];
};

export type BrandSummary = {
  brandKey: string;
  brandName: string;
  platforms: PlatformSummary[];
};

export type MediaPanelData = {
  brands: MediaBrand[];
  metricCanonicals: MediaMetricCanonical[];
  /** Per-brand summary including "all" aggregation. */
  byBrand: BrandSummary[];
  allBrandsSummary: BrandSummary;
  sourceUpdatedAt: string | null;
};

export async function loadMediaPanelData(
  range: DateRange,
): Promise<MediaPanelData> {
  const [rows, brands, metricCanonicals] = await Promise.all([
    fetchMediaMonthly(range),
    fetchMediaBrands(),
    fetchMediaMetricCanonicals(),
  ]);

  const canonicalByKey = new Map<string, MediaMetricCanonical>();
  for (const c of metricCanonicals) canonicalByKey.set(c.key, c);

  // Build per-brand summary maps. brandKey "__all__" is the aggregate across all brands.
  type MetricAcc = {
    monthly: Map<string, { sum: number; count: number; lastValue: number; lastMonth: string }>;
  };
  type PlatformAcc = {
    metrics: Map<string, MetricAcc>;
  };
  type BrandAcc = {
    platforms: Map<MediaPlatform, PlatformAcc>;
  };

  const ALL_BRAND_KEY = '__all__';
  const acc = new Map<string, BrandAcc>();
  const ensureBrand = (key: string): BrandAcc => {
    let v = acc.get(key);
    if (!v) {
      v = { platforms: new Map() };
      acc.set(key, v);
    }
    return v;
  };
  const ensurePlatform = (b: BrandAcc, p: MediaPlatform): PlatformAcc => {
    let v = b.platforms.get(p);
    if (!v) {
      v = { metrics: new Map() };
      b.platforms.set(p, v);
    }
    return v;
  };
  const ensureMetric = (p: PlatformAcc, key: string): MetricAcc => {
    let v = p.metrics.get(key);
    if (!v) {
      v = { monthly: new Map() };
      p.metrics.set(key, v);
    }
    return v;
  };

  let sourceUpdatedAt: string | null = null;

  for (const row of rows) {
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const value = Number(row.value ?? 0);
    if (!Number.isFinite(value)) continue;

    const targets = [row.brand_key ?? 'unknown', ALL_BRAND_KEY];
    for (const brandKey of targets) {
      const bAcc = ensureBrand(brandKey);
      const pAcc = ensurePlatform(bAcc, row.platform as MediaPlatform);
      const mAcc = ensureMetric(pAcc, row.metric_key);
      const cur = mAcc.monthly.get(monthKey);
      if (cur) {
        cur.sum += value;
        cur.count += 1;
        if (monthKey >= cur.lastMonth) {
          cur.lastMonth = monthKey;
          cur.lastValue = value;
        }
      } else {
        mAcc.monthly.set(monthKey, {
          sum: value,
          count: 1,
          lastValue: value,
          lastMonth: monthKey,
        });
      }
    }

    if (row.refreshed_at && (!sourceUpdatedAt || row.refreshed_at > sourceUpdatedAt)) {
      sourceUpdatedAt = row.refreshed_at;
    }
  }

  // Materialize.
  const PLATFORM_ORDER: MediaPlatform[] = ['facebook', 'instagram', 'youtube'];
  function buildBrandSummary(brandKey: string, brandName: string): BrandSummary {
    const bAcc = acc.get(brandKey);
    const platforms: PlatformSummary[] = [];
    for (const platform of PLATFORM_ORDER) {
      const pAcc = bAcc?.platforms.get(platform);
      if (!pAcc) {
        platforms.push({ platform, metrics: [] });
        continue;
      }
      const platformMetrics = metricCanonicals
        .filter((c) => c.platform === platform)
        .map((c) => {
          const mAcc = pAcc.metrics.get(c.key);
          if (!mAcc) return null;
          const sortedMonths = [...mAcc.monthly.entries()].sort((a, b) =>
            a[0].localeCompare(b[0]),
          );
          if (sortedMonths.length === 0) return null;
          const monthly = sortedMonths.map(([month, bucket]) => ({
            month,
            // For 'avg' canonicals, the per-month is mean across brands (when
            // brandKey is "all") or single value (when brand-specific). The
            // aggregate within the same brand+month is always sum/count.
            value:
              c.aggType === 'avg'
                ? bucket.count > 0
                  ? bucket.sum / bucket.count
                  : 0
                : c.aggType === 'last'
                  ? bucket.lastValue
                  : bucket.sum,
          }));
          // Range-level aggregation:
          //   sum  → sum of per-month values
          //   last → value from the most recent month
          //   avg  → mean of per-month values
          let value = 0;
          if (c.aggType === 'sum') {
            value = monthly.reduce((s, m) => s + m.value, 0);
          } else if (c.aggType === 'last') {
            value = monthly[monthly.length - 1]?.value ?? 0;
          } else {
            value =
              monthly.length > 0
                ? monthly.reduce((s, m) => s + m.value, 0) / monthly.length
                : 0;
          }
          return {
            metricKey: c.key,
            displayName: c.displayName,
            aggType: c.aggType,
            value,
            monthly,
          };
        })
        .filter((m): m is PlatformMetricSummary => m !== null);
      platforms.push({ platform, metrics: platformMetrics });
    }
    return { brandKey, brandName, platforms };
  }

  const byBrand: BrandSummary[] = brands.map((b) => buildBrandSummary(b.key, b.displayName));
  const allBrandsSummary = buildBrandSummary(ALL_BRAND_KEY, 'All brands');

  return {
    brands,
    metricCanonicals,
    byBrand,
    allBrandsSummary,
    sourceUpdatedAt,
  };
}

// ----------------------------------------------------------------------------
// Fetchers
// ----------------------------------------------------------------------------

type MediaMonthlyRow = {
  period_year: number;
  period_month: number;
  platform: string;
  brand_id: string | null;
  brand_key: string | null;
  metric_key: string;
  value: number | string | null;
  weeks_observed: number;
  refreshed_at: string | null;
};

async function fetchMediaMonthly(range: DateRange): Promise<MediaMonthlyRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('media_monthly_metrics')
    .select(
      'period_year, period_month, platform, brand_id, brand_key, metric_key, value, weeks_observed, refreshed_at',
    )
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return ((data ?? []) as MediaMonthlyRow[]).filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

async function fetchMediaBrands(): Promise<MediaBrand[]> {
  const { data, error } = await supabase
    .from('media_brands')
    .select('id, key, display_name, display_order')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    key: row.key as string,
    displayName: row.display_name as string,
    displayOrder: row.display_order as number,
  }));
}

async function fetchMediaMetricCanonicals(): Promise<MediaMetricCanonical[]> {
  const { data, error } = await supabase
    .from('media_metric_canonicals')
    .select('key, display_name, platform, display_order, agg_type')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    key: row.key as string,
    displayName: row.display_name as string,
    platform: row.platform as MediaPlatform,
    displayOrder: row.display_order as number,
    aggType: row.agg_type as 'sum' | 'last' | 'avg',
  }));
}

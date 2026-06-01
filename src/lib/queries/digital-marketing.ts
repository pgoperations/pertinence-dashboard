import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Digital Marketing panel — derived from `digital_marketing_monthly` (one row
// per (year, month, campaign, metric)). The metric set is fixed by migration
// 020's canonicals (8 metrics across two units: 'count' and 'naira').
//
// v1 ingest finds ~16 campaigns × ~5 metrics in Jan–May 2026 = ~80 rows;
// well within JS-side aggregation territory, no per-campaign fan-out queries.
// ----------------------------------------------------------------------------

export type DmMetricUnit = 'count' | 'naira';

export type DmMetricCanonical = {
  key: string;
  displayName: string;
  unit: DmMetricUnit;
  displayOrder: number;
};

export type DmKpis = {
  totalReach: number;
  totalImpressions: number;
  totalLeads: number;
  totalSpend: number;
  campaignsActive: number;
  monthsObserved: number;
};

export type CampaignRow = {
  campaignName: string;
  /** Total spend across the range (naira metric 'cost'). */
  spend: number;
  /** Total leads across the range. */
  leads: number;
  /** Total reach across the range. */
  reach: number;
  /** Effective Cost Per Lead within the range — spend / leads (or null when no leads). */
  effectiveCpl: number | null;
  /** Number of (year, month) buckets this campaign appears in. */
  monthsActive: number;
  /** Per-metric totals for the drill: { [metric_key]: totalValue }. */
  perMetric: Record<string, number>;
};

export type DmMonthlyBucket = {
  /** YYYY-MM */
  month: string;
  reach: number;
  impressions: number;
  leads: number;
  spend: number;
};

export type DigitalMarketingPanelData = {
  kpis: DmKpis;
  campaigns: CampaignRow[];
  monthly: DmMonthlyBucket[];
  metricCanonicals: DmMetricCanonical[];
  /** Number of fact rows that came in with mixed_campaign_weeks set — surfaced
   *  as a chip on the card so the supervisor knows a sub-block had cross-week
   *  campaign drift. */
  mixedCampaignWeeksCount: number;
  /** Source freshness — latest updated_at across the loaded fact rows. */
  sourceUpdatedAt: string | null;
};

const KEY_REACH = 'reach';
const KEY_IMPRESSION = 'impression';
const KEY_LEADS = 'leads';
const KEY_COST = 'cost';

export async function loadDigitalMarketingPanelData(
  range: DateRange,
): Promise<DigitalMarketingPanelData> {
  const [facts, metricCanonicals] = await Promise.all([
    fetchDigitalMarketingMonthly(range),
    fetchMetricCanonicals(),
  ]);

  // Roll up by campaign.
  type CampaignAcc = {
    campaignName: string;
    monthsActiveSet: Set<string>;
    perMetric: Record<string, number>;
  };
  const byCampaign = new Map<string, CampaignAcc>();
  const ensureCampaign = (name: string): CampaignAcc => {
    let acc = byCampaign.get(name);
    if (!acc) {
      acc = { campaignName: name, monthsActiveSet: new Set(), perMetric: {} };
      byCampaign.set(name, acc);
    }
    return acc;
  };

  // Roll up by month.
  const monthMap = new Map<string, DmMonthlyBucket>();
  const ensureMonth = (key: string): DmMonthlyBucket => {
    let acc = monthMap.get(key);
    if (!acc) {
      acc = { month: key, reach: 0, impressions: 0, leads: 0, spend: 0 };
      monthMap.set(key, acc);
    }
    return acc;
  };

  let mixedCampaignWeeksCount = 0;
  let sourceUpdatedAt: string | null = null;

  for (const row of facts) {
    const total = Number(row.total ?? 0);
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const cAcc = ensureCampaign(row.campaign_name);
    cAcc.monthsActiveSet.add(monthKey);
    cAcc.perMetric[row.metric_key] = (cAcc.perMetric[row.metric_key] ?? 0) + total;

    const mAcc = ensureMonth(monthKey);
    if (row.metric_key === KEY_REACH) mAcc.reach += total;
    else if (row.metric_key === KEY_IMPRESSION) mAcc.impressions += total;
    else if (row.metric_key === KEY_LEADS) mAcc.leads += total;
    else if (row.metric_key === KEY_COST) mAcc.spend += total;

    if (row.quality_flags && typeof row.quality_flags === 'object' && 'mixed_campaign_weeks' in row.quality_flags) {
      mixedCampaignWeeksCount += 1;
    }
    if (row.updated_at && (!sourceUpdatedAt || row.updated_at > sourceUpdatedAt)) {
      sourceUpdatedAt = row.updated_at;
    }
  }

  const campaigns: CampaignRow[] = [...byCampaign.values()].map((acc) => {
    const spend = acc.perMetric[KEY_COST] ?? 0;
    const leads = acc.perMetric[KEY_LEADS] ?? 0;
    const reach = acc.perMetric[KEY_REACH] ?? 0;
    return {
      campaignName: acc.campaignName,
      spend,
      leads,
      reach,
      effectiveCpl: leads > 0 ? spend / leads : null,
      monthsActive: acc.monthsActiveSet.size,
      perMetric: acc.perMetric,
    };
  }).sort((a, b) => b.spend - a.spend);

  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  let totalReach = 0;
  let totalImpressions = 0;
  let totalLeads = 0;
  let totalSpend = 0;
  for (const m of monthly) {
    totalReach += m.reach;
    totalImpressions += m.impressions;
    totalLeads += m.leads;
    totalSpend += m.spend;
  }

  return {
    kpis: {
      totalReach,
      totalImpressions,
      totalLeads,
      totalSpend,
      campaignsActive: campaigns.length,
      monthsObserved: monthly.length,
    },
    campaigns,
    monthly,
    metricCanonicals,
    mixedCampaignWeeksCount,
    sourceUpdatedAt,
  };
}

// ----------------------------------------------------------------------------
// Fetchers
// ----------------------------------------------------------------------------

type DmRow = {
  period_year: number;
  period_month: number;
  campaign_name: string;
  metric_key: string;
  total: number | string | null;
  quality_flags: Record<string, unknown> | null;
  updated_at: string | null;
};

async function fetchDigitalMarketingMonthly(range: DateRange): Promise<DmRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('digital_marketing_monthly')
    .select('period_year, period_month, campaign_name, metric_key, total, quality_flags, updated_at')
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return ((data ?? []) as DmRow[]).filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

async function fetchMetricCanonicals(): Promise<DmMetricCanonical[]> {
  const { data, error } = await supabase
    .from('digital_marketing_metric_canonicals')
    .select('key, display_name, unit, display_order')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    key: row.key as string,
    displayName: row.display_name as string,
    unit: row.unit as DmMetricUnit,
    displayOrder: row.display_order as number,
  }));
}

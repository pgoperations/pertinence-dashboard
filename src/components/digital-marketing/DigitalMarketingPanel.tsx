import { useEffect, useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { IconChevronRight } from '../icons';
import { DrillPanel } from '../sales/DrillPanel';
import {
  formatNairaCompact,
  formatNumber,
  formatAsOf,
} from '../../lib/format';
import {
  loadDigitalMarketingPanelData,
  type CampaignRow,
  type DigitalMarketingPanelData,
  type DmMetricCanonical,
} from '../../lib/queries/digital-marketing';
import { useDateRange } from '../../hooks/useDateRange';
import { useRefresh } from '../../hooks/useRefresh';

const TOP_N = 8;
const COLOR_BAR = '#56B845'; // brand green (Pertinence), matches the rest of the dashboard

export function DigitalMarketingPanel() {
  const { range } = useDateRange();
  const { counter: refreshCounter } = useRefresh();
  const [data, setData] = useState<DigitalMarketingPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDigitalMarketingPanelData(range)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, refreshCounter]);

  const kpis = data?.kpis ?? {
    totalReach: 0,
    totalImpressions: 0,
    totalLeads: 0,
    totalSpend: 0,
    campaignsActive: 0,
    monthsObserved: 0,
  };
  const campaigns = data?.campaigns ?? [];
  const metricCanonicals = data?.metricCanonicals ?? [];
  const monthly = data?.monthly ?? [];

  return (
    <div className="grid gap-4 md:gap-5">
      <DigitalMarketingKpiCard
        kpis={kpis}
        loading={loading}
        sourceUpdatedAt={data?.sourceUpdatedAt ?? null}
        mixedCampaignWeeksCount={data?.mixedCampaignWeeksCount ?? 0}
        error={error}
      />

      <CampaignsCard
        campaigns={campaigns}
        metricCanonicals={metricCanonicals}
        loading={loading}
      />

      <MonthlyTrendCard monthly={monthly} loading={loading} />
    </div>
  );
}

function DigitalMarketingKpiCard({
  kpis,
  loading,
  sourceUpdatedAt,
  mixedCampaignWeeksCount,
  error,
}: {
  kpis: DigitalMarketingPanelData['kpis'];
  loading: boolean;
  sourceUpdatedAt: string | null;
  mixedCampaignWeeksCount: number;
  error: string | null;
}) {
  return (
    <PanelCard
      title="Digital marketing"
      subtitle="Paid ad performance from the Marketing Team Reporting Template — Digital Marketing tab."
      right={
        sourceUpdatedAt ? (
          <StatusChip tone="slate">As of {formatAsOf(sourceUpdatedAt)}</StatusChip>
        ) : undefined
      }
      source="Source: Marketing Team Reporting Template → Digital Marketing tab. One row per (year, month, campaign, metric) anchored on the 2026 year marker (sheet row 129)."
    >
      {error && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiTile
          label="Total reach"
          value={loading ? '—' : formatNumber(kpis.totalReach)}
          hint={loading ? '' : `${kpis.campaignsActive} campaign${kpis.campaignsActive === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Total impressions"
          value={loading ? '—' : formatNumber(kpis.totalImpressions)}
          hint={loading ? '' : `${kpis.monthsObserved} month${kpis.monthsObserved === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Total leads"
          value={loading ? '—' : formatNumber(kpis.totalLeads)}
          hint={
            loading || kpis.totalLeads === 0
              ? ''
              : `${formatNairaCompact(kpis.totalSpend / Math.max(1, kpis.totalLeads))} / lead`
          }
        />
        <KpiTile
          label="Total ad spend"
          value={loading ? '—' : formatNairaCompact(kpis.totalSpend)}
          hint={
            loading || kpis.monthsObserved === 0
              ? ''
              : `${formatNairaCompact(kpis.totalSpend / kpis.monthsObserved)} / month avg`
          }
        />
      </div>

      {mixedCampaignWeeksCount > 0 && (
        <p className="mt-3 text-[11px] text-slate-500">
          <StatusChip tone="amber">{`${mixedCampaignWeeksCount} mixed-campaign rows`}</StatusChip>{' '}
          <span className="ml-1">
            Source sub-blocks where campaign names varied across W1–W5 (e.g. RESET on
            W1, FARMWEY on W2–W4) are surfaced not silently reconciled. raw_row keeps
            all five week names for traceback.
          </span>
        </p>
      )}
    </PanelCard>
  );
}

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 md:p-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-1 truncate font-heading text-xl font-bold tabular-nums text-slate-900 md:text-2xl">
        {value}
      </span>
      <span className="mt-1 truncate text-[10px] text-slate-400">{hint}</span>
    </div>
  );
}

function CampaignsCard({
  campaigns,
  metricCanonicals,
  loading,
}: {
  campaigns: CampaignRow[];
  metricCanonicals: DmMetricCanonical[];
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (name: string) =>
    setExpanded((cur) => (cur === name ? null : name));

  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const visible = showAll ? sorted : sorted.slice(0, TOP_N);
  const hidden = sorted.slice(TOP_N);
  const hiddenSum = hidden.reduce((acc, r) => acc + r.spend, 0);
  const max = Math.max(1, ...visible.map((r) => r.spend));
  const totalSpend = sorted.reduce((acc, r) => acc + r.spend, 0);

  if (!loading && sorted.length === 0) {
    return (
      <PanelCard
        title="Campaigns by spend"
        subtitle="Ranked by total ad spend in the selected range."
      >
        <div className="grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No campaigns in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Campaigns by spend"
      subtitle="Tap a row for per-metric breakdown."
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="space-y-1.5">
                <span className="block h-3 w-32 rounded bg-slate-100" />
                <span className="block h-2 rounded bg-slate-100" />
              </li>
            ))
          : visible.map((row) => (
              <CampaignRowItem
                key={row.campaignName}
                row={row}
                max={max}
                totalSpend={totalSpend}
                metricCanonicals={metricCanonicals}
                isOpen={expanded === row.campaignName}
                onToggle={() => toggle(row.campaignName)}
              />
            ))}
      </ul>

      {!loading && hidden.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!showAll && (
            <p className="text-xs text-slate-500">
              +{hidden.length} more campaign{hidden.length === 1 ? '' : 's'} —{' '}
              <span className="tabular-nums text-slate-700">
                {formatNairaCompact(hiddenSum)}
              </span>{' '}
              combined.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 rounded cursor-pointer"
          >
            {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function CampaignRowItem({
  row,
  max,
  totalSpend,
  metricCanonicals,
  isOpen,
  onToggle,
}: {
  row: CampaignRow;
  max: number;
  totalSpend: number;
  metricCanonicals: DmMetricCanonical[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const pct = (row.spend / max) * 100;
  const sharePct = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="block w-full rounded-lg px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-slate-900">
            <IconChevronRight
              className={[
                'h-3.5 w-3.5 shrink-0 self-center text-slate-400 transition-transform',
                isOpen ? 'rotate-90 text-accent' : '',
              ].join(' ')}
            />
            <span className="truncate">{row.campaignName}</span>
            <span className="shrink-0 text-[11px] font-normal text-slate-500 tabular-nums">
              · {row.monthsActive} mo
            </span>
          </span>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
            <span className="tabular-nums text-slate-700">{sharePct.toFixed(1)}%</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${pct}%`, backgroundColor: COLOR_BAR }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-slate-700">
            {formatNairaCompact(row.spend)}
          </span>
        </div>
      </button>

      {isOpen && (
        <DrillPanel title={`${row.campaignName} — per-metric totals`}>
          <CampaignDrill row={row} metricCanonicals={metricCanonicals} />
        </DrillPanel>
      )}
    </li>
  );
}

// Metric keys whose stored `total` is a numeric sum of per-week rates — which
// is mathematically meaningless across weeks (you can't sum CPL rates). The
// drill replaces these with values derived from the cost + leads / cost +
// reach denominators that ARE additive. The supervisor's per-week CPL cell
// is still preserved in the underlying raw_row for traceback.
const RATE_METRIC_KEYS = new Set(['cost_per_lead', 'cost_per_result_combined']);

function CampaignDrill({
  row,
  metricCanonicals,
}: {
  row: CampaignRow;
  metricCanonicals: DmMetricCanonical[];
}) {
  const entries = metricCanonicals
    .map((m) => {
      // Replace stored sum with derived value for rate-style metrics.
      // CPL = total cost / total leads. Cost per result combined falls back
      // to CPL when no separate "results" total exists in v1.
      let value = row.perMetric[m.key] ?? 0;
      let derived = false;
      if (RATE_METRIC_KEYS.has(m.key)) {
        if (row.leads > 0) {
          value = row.spend / row.leads;
          derived = true;
        } else {
          value = 0;
        }
      }
      return { key: m.key, display: m.displayName, unit: m.unit, value, derived };
    })
    .filter((e) => e.value !== 0);
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li
            key={e.key}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="min-w-0 truncate text-slate-700">
              {e.display}
              {e.derived && (
                <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">
                  derived
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {e.unit === 'naira' ? formatNairaCompact(e.value) : formatNumber(e.value)}
            </span>
          </li>
        ))}
      </ul>
      {row.effectiveCpl !== null && row.leads > 0 && (
        <p className="text-[11px] text-slate-500">
          Cost per lead = total cost ÷ total leads ={' '}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatNairaCompact(row.effectiveCpl)}
          </span>{' '}
          across {formatNumber(row.leads)} lead{row.leads === 1 ? '' : 's'}. Per-week
          CPL cells from the source are preserved in <code>raw_row</code> for
          traceback but summing rate metrics across weeks isn't meaningful.
        </p>
      )}
    </div>
  );
}

function MonthlyTrendCard({
  monthly,
  loading,
}: {
  monthly: DigitalMarketingPanelData['monthly'];
  loading: boolean;
}) {
  if (!loading && monthly.length === 0) {
    return (
      <PanelCard title="Monthly digital marketing" subtitle="Spend + reach by month.">
        <div className="grid h-24 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No months in this range.
        </div>
      </PanelCard>
    );
  }
  const maxSpend = Math.max(1, ...monthly.map((m) => m.spend));
  const maxReach = Math.max(1, ...monthly.map((m) => m.reach));
  return (
    <PanelCard
      title="Monthly digital marketing"
      subtitle="Spend (left) vs reach (right) per month."
    >
      <ul className="space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <span className="block h-3 w-20 rounded bg-slate-100" />
                <span className="mt-2 block h-2 rounded bg-slate-100" />
              </li>
            ))
          : monthly.map((m) => (
              <li key={m.month} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    {monthLabel(m.month)}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {formatNairaCompact(m.spend)} · {formatNumber(m.reach)} reach ·{' '}
                    {formatNumber(m.leads)} leads
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Bar pct={(m.spend / maxSpend) * 100} label="Spend" color={COLOR_BAR} />
                  <Bar pct={(m.reach / maxReach) * 100} label="Reach" color="#475569" />
                </div>
              </li>
            ))}
      </ul>
    </PanelCard>
  );
}

function Bar({ pct, label, color }: { pct: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${y}`;
}

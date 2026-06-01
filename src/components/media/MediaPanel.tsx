import { useEffect, useMemo, useState } from 'react';
import { PanelCard } from '../PanelCard';
import { StatusChip } from '../StatusChip';
import { formatNumber, formatAsOf } from '../../lib/format';
import {
  loadMediaPanelData,
  type BrandSummary,
  type MediaPanelData,
  type MediaPlatform,
  type PlatformMetricSummary,
} from '../../lib/queries/media';
import { useDateRange } from '../../hooks/useDateRange';
import { useRefresh } from '../../hooks/useRefresh';

const ALL_BRAND_KEY = '__all__';

const PLATFORM_DISPLAY: Record<MediaPlatform, { name: string; tone: string }> = {
  facebook: { name: 'Facebook', tone: 'sky' },
  instagram: { name: 'Instagram', tone: 'violet' },
  youtube: { name: 'YouTube', tone: 'amber' },
};

const COLOR_BAR = '#0369A1'; // sky-700

export function MediaPanel() {
  const { range } = useDateRange();
  const { counter: refreshCounter } = useRefresh();
  const [data, setData] = useState<MediaPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrandKey, setSelectedBrandKey] = useState<string>(ALL_BRAND_KEY);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadMediaPanelData(range)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, refreshCounter]);

  const selectedSummary: BrandSummary | null = useMemo(() => {
    if (!data) return null;
    if (selectedBrandKey === ALL_BRAND_KEY) return data.allBrandsSummary;
    return data.byBrand.find((b) => b.brandKey === selectedBrandKey) ?? data.allBrandsSummary;
  }, [data, selectedBrandKey]);

  return (
    <div className="grid gap-4 md:gap-5">
      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <BrandSelector
        brands={data?.brands ?? []}
        selected={selectedBrandKey}
        onSelect={setSelectedBrandKey}
        sourceUpdatedAt={data?.sourceUpdatedAt ?? null}
        loading={loading}
      />

      {(['facebook', 'instagram', 'youtube'] as MediaPlatform[]).map((p) => (
        <PlatformCard
          key={p}
          platform={p}
          summary={selectedSummary?.platforms.find((ps) => ps.platform === p) ?? null}
          loading={loading}
        />
      ))}
    </div>
  );
}

function BrandSelector({
  brands,
  selected,
  onSelect,
  sourceUpdatedAt,
  loading,
}: {
  brands: MediaPanelData['brands'];
  selected: string;
  onSelect: (key: string) => void;
  sourceUpdatedAt: string | null;
  loading: boolean;
}) {
  const options = [
    { key: ALL_BRAND_KEY, displayName: 'All brands' },
    ...brands.map((b) => ({ key: b.key, displayName: b.displayName })),
  ];
  return (
    <PanelCard
      title="Media & content"
      subtitle="Per-brand, per-platform weekly metrics rolled up to month. Tap a brand to filter."
      right={
        sourceUpdatedAt ? (
          <StatusChip tone="slate">As of {formatAsOf(sourceUpdatedAt)}</StatusChip>
        ) : undefined
      }
      source="Source: Marketing Team Reporting Template → Media Team Reporting tab. Weekly grid only; per-month summary block and YouTube Monetization Report excluded from v1 per supervisor."
    >
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isSelected = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              disabled={loading}
              className={[
                'inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-colors cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-accent',
                isSelected
                  ? 'bg-accent text-white ring-accent'
                  : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-white hover:ring-slate-300',
                loading ? 'opacity-70 cursor-default' : '',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              {o.displayName}
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
}

function PlatformCard({
  platform,
  summary,
  loading,
}: {
  platform: MediaPlatform;
  summary: { metrics: PlatformMetricSummary[] } | null;
  loading: boolean;
}) {
  const display = PLATFORM_DISPLAY[platform];
  const metrics = summary?.metrics ?? [];

  if (!loading && metrics.length === 0) {
    return (
      <PanelCard title={display.name}>
        <div className="grid h-24 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
          No {display.name} data for this brand in this range.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title={display.name}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-3">
                <span className="block h-3 w-32 rounded bg-slate-100" />
                <span className="mt-2 block h-6 w-20 rounded bg-slate-100" />
                <span className="mt-3 block h-2 rounded bg-slate-100" />
              </div>
            ))
          : metrics.map((m) => <MetricTile key={m.metricKey} metric={m} />)}
      </div>
    </PanelCard>
  );
}

function MetricTile({ metric }: { metric: PlatformMetricSummary }) {
  const aggLabel =
    metric.aggType === 'sum'
      ? 'Sum across range'
      : metric.aggType === 'last'
        ? 'Latest month'
        : 'Avg across range';
  const maxMonthly = Math.max(1, ...metric.monthly.map((m) => m.value));
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 md:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {metric.displayName}
        </span>
        <span className="shrink-0 text-[10px] text-slate-400">{aggLabel}</span>
      </div>
      <div className="mt-1 font-heading text-xl font-bold tabular-nums text-slate-900 md:text-2xl">
        {formatNumber(metric.value)}
      </div>
      {metric.monthly.length > 0 && (
        <div className="mt-3 flex items-end gap-1">
          {metric.monthly.map((m) => {
            const pct = (m.value / maxMonthly) * 100;
            return (
              <div
                key={m.month}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${monthLabel(m.month)}: ${formatNumber(m.value)}`}
              >
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(2, (pct / 100) * 32)}px`,
                    backgroundColor: COLOR_BAR,
                  }}
                />
                <span className="text-[9px] uppercase text-slate-400">
                  {monthShort(m.month)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${y}`;
}

function monthShort(yyyymm: string): string {
  const m = yyyymm.split('-')[1];
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return months[Number(m) - 1] ?? '?';
}

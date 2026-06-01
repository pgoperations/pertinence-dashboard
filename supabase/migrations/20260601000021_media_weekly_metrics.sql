-- Migration 021: schema for the Media Team Reporting tab on the Marketing
-- Team Reporting Template spreadsheet. Closes the "Media" half of the
-- supervisor's 2026-06-01 ask (paired with migration 020 / Digital Marketing).
--
-- This also unblocks step 7 of the roadmap (Media & Content) which has been
-- sitting empty since the React scaffold landed 2026-05-15 — the source data
-- exists, it's just been waiting on supervisor decision on shape vs the
-- "manual entry form" hypothesis from the original brief. The supervisor's
-- 2026-06-01 ask supersedes that: ingest from the weekly grid, manual entry
-- is no longer needed for v1.
--
-- Shape recap (2026 section starts at sheet row 676 on the Media Team
-- Reporting tab; rows above are 2024–2025 historicals, out of v1 scope):
--   * Row 676: month header — "JANUARY" at col A, "WEEK 1" at col B,
--              "WEEK 2" at col M, "WEEK 3" at col W, "WEEK 4" at col AG.
--              Each week block is ~10 cols wide (label + 8 brand cols + gap).
--   * Row 677: platform header — "Facebook" then 8 brand names
--              (PG, REALVEST, PPL, HOMEWORTH, PETTY SAVE, GENIUS, SETTLE QUICK,
--              FARMWEY AFRICA) repeated for each week.
--   * Rows 678–683: Facebook metric rows (Number of Interactions, Average
--              Reach, Number of Page Visits, Number of New Followers, Total
--              Number of Followers, No of Views, Number of Posts Delivered).
--   * Then Instagram section (rows ~685–693): Number of Engagement,
--              Average Reach, Number of Page Visits, Average views,
--              Number of New Followers, Number of Unfollows, Total Number
--              of Followers, Number of Posts Delivered.
--   * Then Youtube Channel section: Number of Videos Delivered, Average
--              Views Per Week, Total Number of New Subscribers.
--   * Each month block is ~30 rows (weekly grid) + ~26 rows (JANUARY SUMMARY
--              + YouTube Monetization Report) = ~56 rows. Feb starts at row
--              732. Supervisor explicitly scoped v1 to the WEEKLY grid only;
--              monthly summary block is decorative and not ingested.
--
-- Brand typos visible already and locked as aliases below:
--   HOMEWORTH vs HOMEWORTH HOTEL  → both → 'homeworth'
--   PETTY SAVE vs PETTY S AVE vs PETTYSAVE → all → 'pettysave'
--
-- Grain decisions:
--   * media_weekly_metrics — fact. (year, month, week, platform, brand, metric).
--     One row per cell. Most cells are null (most brand × metric pairs sit
--     empty on the source) so the table is sparser than 4 × 3 × 8 × 6 = 576
--     rows/month suggests — typical month seen on Jan 2026 is ~50 non-null
--     cells across all 4 weeks.
--   * media_monthly_metrics — aggregate. Rolled up per (year, month, platform,
--     brand, metric) with the rule keyed by metric_canonicals.agg_type:
--       'sum'  → sum of week values (e.g. Number of Posts Delivered)
--       'last' → last non-null week (e.g. Total Number of Followers —
--                running total, not weekly delta — so summing would multiply)
--       'avg'  → mean of non-null weeks (e.g. Average Reach / Average Views)
--     The agg_type column on canonicals is non-null with a CHECK constraint,
--     so the RPC's CASE statement can't fall through to a wrong default.


-- ============================================================================
-- media_brands: canonical brand reference.
-- ============================================================================
create table public.media_brands (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  display_name  text not null,
  display_order int not null,
  created_at    timestamptz not null default now()
);

create index media_brands_order_idx
  on public.media_brands (display_order);

alter table public.media_brands enable row level security;

create policy "authenticated read"
  on public.media_brands for select to authenticated using (true);
create policy "admins manage"
  on public.media_brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create table public.media_brand_aliases (
  id          uuid primary key default gen_random_uuid(),
  brand_key   text not null references public.media_brands(key) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);

create unique index media_brand_aliases_lower_alias_uniq
  on public.media_brand_aliases (lower(alias));

create index media_brand_aliases_brand_idx
  on public.media_brand_aliases (brand_key);

alter table public.media_brand_aliases enable row level security;

create policy "authenticated read"
  on public.media_brand_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.media_brand_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- media_metric_canonicals: per-platform metric vocabulary.
-- Same metric name can mean different things on different platforms (e.g.
-- "Average Reach" semantics differ between FB and IG) so the key is namespaced
-- by platform ('fb_avg_reach', 'ig_avg_reach'). platform column lets the UI
-- group metrics into platform sections.
--
-- agg_type controls the monthly rollup (see refresh_media_monthly below):
--   'sum'  — additive over weeks (posts, interactions, new followers, ...)
--   'last' — running totals (total followers, total subscribers)
--   'avg'  — averaged over weeks where the metric is itself an average
-- ============================================================================
create table public.media_metric_canonicals (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  display_name  text not null,
  platform      text not null check (platform in ('facebook', 'instagram', 'youtube')),
  display_order int not null,
  agg_type      text not null check (agg_type in ('sum', 'last', 'avg')),
  created_at    timestamptz not null default now()
);

create index media_metric_canonicals_platform_idx
  on public.media_metric_canonicals (platform, display_order);

alter table public.media_metric_canonicals enable row level security;

create policy "authenticated read"
  on public.media_metric_canonicals for select to authenticated using (true);
create policy "admins manage"
  on public.media_metric_canonicals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create table public.media_metric_aliases (
  id          uuid primary key default gen_random_uuid(),
  metric_key  text not null
              references public.media_metric_canonicals(key) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);

create unique index media_metric_aliases_lower_alias_uniq
  on public.media_metric_aliases (lower(alias));

create index media_metric_aliases_metric_idx
  on public.media_metric_aliases (metric_key);

alter table public.media_metric_aliases enable row level security;

create policy "authenticated read"
  on public.media_metric_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.media_metric_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- media_weekly_metrics: fact table.
-- source_row_id format set by the ingest:
--   "y{YYYY}-m{MM}-w{W}-{platform}-{brand_key}-{metric_key}"
-- One row per (week, platform, brand, metric) tuple. Null `value` rows are
-- not written — the ingest skips empty source cells.
-- ============================================================================
create table public.media_weekly_metrics (
  id              uuid primary key default gen_random_uuid(),
  source_sheet    text not null,
  source_tab      text not null,
  source_row_id   text not null,
  raw_row         jsonb not null,
  quality_flags   jsonb not null default '{}'::jsonb,
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  week_number     int not null check (week_number between 1 and 5),
  platform        text not null check (platform in ('facebook', 'instagram', 'youtube')),
  brand_id        uuid references public.media_brands(id) on delete set null,
  brand_key       text,  -- denormalized for cheaper aggregate refresh
  metric_key      text not null
                  references public.media_metric_canonicals(key) on delete restrict,
  value           numeric(15,2),
  ingested_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint media_weekly_metrics_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.media_weekly_metrics
  for each row execute function public.set_updated_at();

create index media_weekly_metrics_period_idx
  on public.media_weekly_metrics (period_year, period_month);
create index media_weekly_metrics_platform_brand_idx
  on public.media_weekly_metrics (platform, brand_key);
create index media_weekly_metrics_metric_idx
  on public.media_weekly_metrics (metric_key);

alter table public.media_weekly_metrics enable row level security;

create policy "authenticated read"
  on public.media_weekly_metrics for select to authenticated using (true);


-- ============================================================================
-- media_monthly_metrics: aggregate. (year, month, platform, brand, metric).
-- Refresh recomputes from the fact table using each metric's agg_type rule.
-- No unique constraint — RPC TRUNCATEs + rebuilds (pattern locked migration 011).
-- ============================================================================
create table public.media_monthly_metrics (
  id              uuid primary key default gen_random_uuid(),
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  platform        text not null check (platform in ('facebook', 'instagram', 'youtube')),
  brand_id        uuid references public.media_brands(id) on delete set null,
  brand_key       text,
  metric_key      text not null
                  references public.media_metric_canonicals(key) on delete restrict,
  value           numeric(15,2),
  weeks_observed  int not null default 0,
  refreshed_at    timestamptz not null default now()
);

create index media_monthly_metrics_period_idx
  on public.media_monthly_metrics (period_year, period_month);
create index media_monthly_metrics_platform_brand_idx
  on public.media_monthly_metrics (platform, brand_key);

alter table public.media_monthly_metrics enable row level security;

create policy "authenticated read"
  on public.media_monthly_metrics for select to authenticated using (true);


-- ============================================================================
-- refresh_media_monthly: TRUNCATE + INSERT GROUP BY, with the per-metric
-- aggregation rule (sum / last / avg) keyed off media_metric_canonicals.agg_type.
-- "last" is implemented as: pick the value of the highest week_number with a
-- non-null value — via DISTINCT ON ordering, which is the cheapest correct
-- expression in Postgres.
-- ============================================================================
create or replace function public.refresh_media_monthly()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  truncate table public.media_monthly_metrics;

  with last_per_group as (
    select distinct on (m.period_year, m.period_month, m.platform, m.brand_key, m.metric_key)
      m.period_year,
      m.period_month,
      m.platform,
      m.brand_id,
      m.brand_key,
      m.metric_key,
      m.value as last_value
    from public.media_weekly_metrics m
    where m.value is not null
    order by m.period_year, m.period_month, m.platform, m.brand_key, m.metric_key,
             m.week_number desc
  )
  insert into public.media_monthly_metrics
    (period_year, period_month, platform, brand_id, brand_key, metric_key,
     value, weeks_observed)
  select
    m.period_year,
    m.period_month,
    m.platform,
    m.brand_id,
    m.brand_key,
    m.metric_key,
    case c.agg_type
      when 'sum'  then sum(m.value)
      when 'avg'  then avg(m.value)
      when 'last' then (
        select last_value from last_per_group lp
        where  lp.period_year  = m.period_year
          and  lp.period_month = m.period_month
          and  lp.platform     = m.platform
          and  lp.metric_key   = m.metric_key
          and  (lp.brand_key is not distinct from m.brand_key)
        limit 1
      )
    end as value,
    count(m.value) filter (where m.value is not null) as weeks_observed
  from public.media_weekly_metrics m
  join public.media_metric_canonicals c on c.key = m.metric_key
  group by m.period_year, m.period_month, m.platform, m.brand_id, m.brand_key,
           m.metric_key, c.agg_type;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.refresh_media_monthly() from public, anon, authenticated;
grant execute on function public.refresh_media_monthly() to service_role;


-- ============================================================================
-- Seed: media_brands + aliases.
-- 8 brands in display order matching the source-tab columns L→R.
-- Aliases include known typo variants from 2026-06-01 inspection. Adding
-- future variants is a one-line insert, not a code change.
-- ============================================================================
insert into public.media_brands (key, display_name, display_order) values
  ('pg',             'PG',              1),
  ('realvest',       'RealVest',        2),
  ('ppl',            'PPL',             3),
  ('homeworth',      'Homeworth',       4),
  ('pettysave',      'PettySave',       5),
  ('genius',         'Genius',          6),
  ('settlequick',    'SettleQuick',     7),
  ('farmwey_africa', 'Farmwey Africa',  8)
on conflict (key) do nothing;


insert into public.media_brand_aliases (brand_key, alias)
select v.brand_key, v.alias
from (values
  ('pg',             'PG'),
  ('realvest',       'REALVEST'),
  ('realvest',       'RealVest'),
  ('ppl',            'PPL'),
  ('homeworth',      'HOMEWORTH'),
  ('homeworth',      'HOMEWORTH HOTEL'),    -- typo / inconsistent naming
  ('pettysave',      'PETTY SAVE'),
  ('pettysave',      'PETTYSAVE'),
  ('pettysave',      'PETTY S AVE'),         -- typo seen 2026-06-01
  ('genius',         'GENIUS'),
  ('settlequick',    'SETTLE QUICK'),
  ('settlequick',    'SETTLEQUICK'),
  ('farmwey_africa', 'FARMWEY AFRICA'),
  ('farmwey_africa', 'FARMWAY AFRICA')       -- defensive spelling alt
) as v(brand_key, alias)
on conflict (lower(alias)) do nothing;


-- ============================================================================
-- Seed: media_metric_canonicals + aliases.
-- Metric set inspected on 2026-06-01. agg_type assignments:
--   sum   — additive count metrics (interactions, posts, new followers, ...)
--   last  — running totals (total followers, total subscribers)
--   avg   — average-by-definition metrics (Average Reach, Average views,
--           Average Views Per Week)
-- ============================================================================
insert into public.media_metric_canonicals (key, display_name, platform, display_order, agg_type) values
  -- Facebook (7)
  ('fb_interactions',         'Number of Interactions',      'facebook',  1, 'sum'),
  ('fb_avg_reach',            'Average Reach',                'facebook',  2, 'avg'),
  ('fb_page_visits',          'Number of Page Visits',        'facebook',  3, 'sum'),
  ('fb_new_followers',        'Number of New Followers',      'facebook',  4, 'sum'),
  ('fb_total_followers',      'Total Number of Followers',    'facebook',  5, 'last'),
  ('fb_views',                'No of Views',                  'facebook',  6, 'sum'),
  ('fb_posts_delivered',      'Number of Posts Delivered',    'facebook',  7, 'sum'),
  -- Instagram (8)
  ('ig_engagement',           'Number of Engagement',         'instagram', 1, 'sum'),
  ('ig_avg_reach',            'Average Reach',                'instagram', 2, 'avg'),
  ('ig_page_visits',          'Number of Page Visits',        'instagram', 3, 'sum'),
  ('ig_avg_views',            'Average Views',                'instagram', 4, 'avg'),
  ('ig_new_followers',        'Number of New Followers',      'instagram', 5, 'sum'),
  ('ig_unfollows',            'Number of Unfollows',          'instagram', 6, 'sum'),
  ('ig_total_followers',      'Total Number of Followers',    'instagram', 7, 'last'),
  ('ig_posts_delivered',      'Number of Posts Delivered',    'instagram', 8, 'sum'),
  -- YouTube (3)
  ('yt_videos_delivered',     'Number of Videos Delivered',   'youtube',   1, 'sum'),
  ('yt_avg_views_per_week',   'Average Views Per Week',       'youtube',   2, 'avg'),
  ('yt_new_subscribers',      'Total Number of New Subscribers', 'youtube',3, 'last')
on conflict (key) do nothing;


insert into public.media_metric_aliases (metric_key, alias)
select v.metric_key, v.alias
from (values
  -- Facebook
  ('fb_interactions',     'Number of Interactions'),
  ('fb_avg_reach',        'Average Reach'),  -- ambiguous; ingest resolves by platform section context
  ('fb_page_visits',      'Number of Page Visits'),
  ('fb_new_followers',    'Number of New Followers'),
  ('fb_total_followers',  'Total Number of Followers'),
  ('fb_views',            'No of Views'),
  ('fb_posts_delivered',  'Number of Posts Delivered'),
  -- Instagram-specific spellings (only those that differ from FB)
  ('ig_engagement',       'Number of Engagement'),
  ('ig_avg_views',        'Average views'),
  ('ig_avg_views',        'Average Views'),
  ('ig_unfollows',        'Number of Unfollows'),
  -- YouTube
  ('yt_videos_delivered', 'Number of Videos Delivered'),
  ('yt_avg_views_per_week', 'Average Views Per Week'),
  ('yt_new_subscribers',  'Total Number of New Subscribers')
) as v(metric_key, alias)
on conflict (lower(alias)) do nothing;

-- NOTE on the ambiguous aliases ("Average Reach", "Number of Page Visits",
-- "Number of New Followers", "Total Number of Followers", "Number of Posts
-- Delivered"): these labels appear identically under both Facebook and
-- Instagram sections. The lower(alias) unique index forces only ONE canonical
-- per spelling — so the seed above maps each to the Facebook canonical, and
-- the parser MUST resolve the platform from section context (the "Facebook"
-- vs "Instagram" header row above the metric) before looking up the alias.
-- The parser then substitutes the right key (fb_* vs ig_*) on output.
-- This keeps the alias table simple at the cost of moving the
-- platform-disambiguation responsibility into TypeScript — same trade-off
-- already taken on parsePlotType for the customer_files vs weekly_sales
-- format split.

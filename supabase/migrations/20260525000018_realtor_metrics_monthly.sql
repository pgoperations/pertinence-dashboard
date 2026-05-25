-- Migration 018: replace the wrong-shaped realtor_manager_weekly fact table
-- with realtor_metrics_monthly, plus a canonical-metrics seed.
--
-- Why a redesign instead of an alter:
--   The original realtor_manager_weekly (migration 004) was scaffolded as
--   one-row-per-(manager, week) with typed cols recruitments / attendance_count
--   / sales_count / sales_amount. The actual 2026 source tab is a wide weekly
--   pivot whose ROWS are metric labels and COLS are weeks within a month
--   block — no per-manager dimension at all. The v1 panel scope locked
--   2026-05-14 (DESIGN_DECISIONS.md) is aggregate-only; per-manager is Phase 2
--   when a recurring source appears (manual-entry or OneApp). Dropping the
--   wrong-shape table is safe — it was never written to.
--
-- New grain: (period_year, period_month, metric_key).
--   - Weekly granularity is preserved in week_values jsonb {"1": n, "2": n, ...}
--     so a future weekly-trend card doesn't need a schema change.
--   - total mirrors the source's "Total" column rather than sum(week_values)
--     because the supervisor's manual totals occasionally diverge from the
--     week sum — surfacing both per supervisor #3 ("never silently reconcile").
--   - metric_key is text, joins to realtor_metric_canonicals for display.
--
-- NIL/Nil/NIl handling locked in the ingest, not here: the source uses these
-- as "event happened, count was zero" (per supervisor #2 default, confirmed
-- 2026-05-25); ingest coerces to 0 with no quality flag.


-- ============================================================================
-- Drop the old shape. RLS policy on the table is dropped automatically.
-- Index on realtor_managers.realtor_manager_idx survives — it indexes a column
-- on the dropped table only, so it goes with the table. realtor_managers
-- reference table is untouched (still needed for any per-manager UI in Phase 2).
-- ============================================================================
drop table if exists public.realtor_manager_weekly;


-- ============================================================================
-- realtor_metric_canonicals: the v1 metric set, seeded immediately below.
-- Categories mirror the source-tab section headers:
--   recruitment   — 6 metrics under "Recruitment Metrics"
--   activity      — 3 metrics under "Realtor Activity Measurement"
--   sales_perf    — 10 metrics under "Realtor Sales Performance"
-- display_order controls the visual order within each category in the panel.
-- ============================================================================
create table public.realtor_metric_canonicals (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  display_name  text not null,
  category      text not null check (category in ('recruitment', 'activity', 'sales_perf')),
  display_order int not null,
  unit          text not null default 'count' check (unit in ('count', 'currency')),
  created_at    timestamptz not null default now()
);

create index realtor_metric_canonicals_category_idx
  on public.realtor_metric_canonicals (category, display_order);

alter table public.realtor_metric_canonicals enable row level security;

create policy "authenticated read"
  on public.realtor_metric_canonicals for select to authenticated using (true);
create policy "admins manage"
  on public.realtor_metric_canonicals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- realtor_metric_aliases: source-label text → canonical key.
-- Same pattern as location_aliases / purpose_aliases / complaint_aliases.
-- Lookup is case-insensitive via the lower(alias) unique index — leading /
-- trailing whitespace is handled by trim() at the ingest layer (matches the
-- behavior of the other canonical lookups).
-- ============================================================================
create table public.realtor_metric_aliases (
  id          uuid primary key default gen_random_uuid(),
  metric_key  text not null references public.realtor_metric_canonicals(key) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);

create unique index realtor_metric_aliases_lower_alias_uniq
  on public.realtor_metric_aliases (lower(alias));

create index realtor_metric_aliases_metric_idx
  on public.realtor_metric_aliases (metric_key);

alter table public.realtor_metric_aliases enable row level security;

create policy "authenticated read"
  on public.realtor_metric_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.realtor_metric_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- realtor_metrics_monthly: the fact table.
--
-- Idempotency: same (source_sheet, source_tab, source_row_id) unique contract
-- as every other fact table. source_row_id format is documented in the ingest
-- function: "y{YYYY}-m{MM}-{metric_key}".
--
-- realtor_manager_id intentionally NOT a column: v1 is aggregate-only. When
-- per-manager data starts arriving (Phase 2), the right answer is a SECOND
-- table (realtor_manager_metrics or similar) rather than smuggling per-manager
-- rows into the aggregate one — keeps the panel queries unambiguous.
-- ============================================================================
create table public.realtor_metrics_monthly (
  id              uuid primary key default gen_random_uuid(),
  source_sheet    text not null,
  source_tab      text not null,
  source_row_id   text not null,
  raw_row         jsonb not null,
  quality_flags   jsonb not null default '{}'::jsonb,
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  metric_key      text not null references public.realtor_metric_canonicals(key) on delete restrict,
  total           numeric(15,2),
  week_values     jsonb,
  ingested_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint realtor_metrics_monthly_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.realtor_metrics_monthly
  for each row execute function public.set_updated_at();

create index realtor_metrics_monthly_period_idx
  on public.realtor_metrics_monthly (period_year, period_month);
create index realtor_metrics_monthly_metric_idx
  on public.realtor_metrics_monthly (metric_key);

alter table public.realtor_metrics_monthly enable row level security;

create policy "authenticated read"
  on public.realtor_metrics_monthly for select to authenticated using (true);


-- ============================================================================
-- Seed: canonical metrics + aliases.
-- Aliases use the exact label-text spelling from the 2026 source tab. The
-- "Payabale" typo on the 6M+ tier is preserved verbatim because that is the
-- literal source spelling — fix it on the sheet and we'll add an alias for
-- the corrected variant later.
-- ============================================================================
insert into public.realtor_metric_canonicals (key, display_name, category, display_order) values
  -- Recruitment (6)
  ('new_realtors_total',                'New realtors (referrals + business reps)',  'recruitment',  1),
  ('new_referrals',                     'New referrals',                              'recruitment',  2),
  ('new_business_reps',                 'New business reps',                          'recruitment',  3),
  ('realtors_recruited_any',            'Realtors that recruited (any)',              'recruitment',  4),
  ('realtors_recruited_referrals',      'Realtors that recruited referrals',          'recruitment',  5),
  ('realtors_recruited_business_reps',  'Realtors that recruited business reps',      'recruitment',  6),
  -- Activity (3)
  ('master_class_1',                    'Real Estate Master Class 1',                 'activity',     1),
  ('master_class_2',                    'Real Estate Master Class 2',                 'activity',     2),
  ('stakeholders_meeting_attendance',   'Stakeholders Meeting — attendance',          'activity',     3),
  -- Sales performance (10)
  ('realtors_sold_new',                 'Realtors that sold (new payment)',           'sales_perf',   1),
  ('realtors_sold_further',             'Realtors that sold (further payment)',       'sales_perf',   2),
  ('further_payment_received',          'Further payments received week-on-week',     'sales_perf',   3),
  ('realtor_sales_outright',            'Realtor sales (outright payment)',           'sales_perf',   4),
  ('sale_tier_below_1m_initial',        'Sales below ₦1M (initial deposit)',          'sales_perf',   5),
  ('sale_tier_1m_5m_initial',           'Sales ₦1M–₦5M (initial deposit)',            'sales_perf',   6),
  ('sale_tier_5m_above_initial',        'Sales ₦5M and above (initial deposit)',      'sales_perf',   7),
  ('sale_tier_below_1m_payable',        'Sales below ₦1M (total amount payable)',     'sales_perf',   8),
  ('sale_tier_1m_5m_payable',           'Sales ₦1M–₦5M (total amount payable)',       'sales_perf',   9),
  ('sale_tier_6m_above_payable',        'Sales ₦6M and above (total amount payable)', 'sales_perf',  10)
on conflict (key) do nothing;


insert into public.realtor_metric_aliases (metric_key, alias)
select v.metric_key, v.alias
from (values
  -- Recruitment
  ('new_realtors_total',                'Number of New Realtors (Referrals+Business Reps)'),
  ('new_referrals',                     'Number of New Referrals'),
  ('new_business_reps',                 'Number of New Business Reps'),
  ('realtors_recruited_any',            'Number of Realtors that Recruited (Referrals +Business Reps)'),
  ('realtors_recruited_referrals',      'Number of Realtors that Recruited Referrals'),
  ('realtors_recruited_business_reps',  'Number of Realtors that Recruited Business Reps'),
  -- Activity
  ('master_class_1',                    'Real Estate Master Class 1'),
  ('master_class_2',                    'Real Estate Master Class 2'),
  ('stakeholders_meeting_attendance',   'Attendance at Stakeholders Meeting'),
  -- Sales performance — literal source spellings, including the "Payabale" typo
  ('realtors_sold_new',                 'Number of Realtors that Sold (New Payment)'),
  ('realtors_sold_further',             'Number of Realtors that Sold (Further payment)'),
  ('further_payment_received',          'Further Payment Received Week on Week'),
  ('realtor_sales_outright',            'Number of Realtor sales (outright payment)'),
  ('sale_tier_below_1m_initial',        'Number of Realtor Sale below 1M Initial Deposit'),
  ('sale_tier_1m_5m_initial',           'Number of Realtor Sale between 1M and 5M Initial Deposit'),
  ('sale_tier_5m_above_initial',        'Number of Realtor Sale Between 5M and above Initial Deposit'),
  ('sale_tier_below_1m_payable',        'Number of Realtor Sale below 1M (Total Amount Payable)'),
  ('sale_tier_1m_5m_payable',           'Number of Realtor Sale between 1M and 5M (Total Amount Payable)'),
  ('sale_tier_6m_above_payable',        'Number of Realtor Sale Between 6M and above (Total Amount Payabale)')
) as v(metric_key, alias)
on conflict (lower(alias)) do nothing;

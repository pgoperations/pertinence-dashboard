-- Migration 005: derived/cached aggregate tables.
--
-- Per DESIGN_DECISIONS.md: aggregates are REGULAR TABLES, not materialized views.
-- They are refreshed by ingest functions at the end of each run, so they always
-- reflect the latest fact-table state. refreshed_at on each row tells the panel
-- what "as of [datetime]" timestamp to display per the brief.
--
-- Scope decision: this migration ships the smallest set of aggregates we are
-- confident the dashboard panels will need. More aggregates will land in later
-- migrations as panel work surfaces specific query shapes — designing them all
-- now without seeing actual UI queries would be premature.
--
-- Three tables shipped here:
--   * marketing_monthly         — Marketing budget summary, per month
--   * customer_support_monthly  — CS panel stats, per month per brand
--   * sales_by_location_monthly — Sales-by-location panel, the most prominent
--                                 sales view (per H1 PDF and the brief)
--
-- Tables NOT shipped (deferred to per-panel migrations):
--   * sales_by_plot_type_monthly        (plots-by-location-x-size pivot)
--   * sales_by_realtor_manager_monthly  (per-manager performance)
--   * realtor_managers_attendance       (recruitment / attendance metrics)
--   * media_per_brand_per_platform      (depends on social_media_manual_entries
--                                        which is created in migration 007)
--
-- All aggregate tables have RLS enabled with no policies; reads are added in
-- migration 006.


-- ============================================================================
-- marketing_monthly
-- One row per (period_year, period_month). by_category is { expense_category_id: amount }
-- as a jsonb map for the category-distribution donut + table on the Marketing panel.
-- ============================================================================
create table public.marketing_monthly (
  id                  uuid primary key default gen_random_uuid(),
  period_year         int not null,
  period_month        int not null check (period_month between 1 and 12),
  total_income        numeric(15,2) not null default 0,
  total_expenditure   numeric(15,2) not null default 0,
  by_category         jsonb not null default '{}'::jsonb,
  refreshed_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint marketing_monthly_period_uniq unique (period_year, period_month)
);

create trigger set_updated_at before update on public.marketing_monthly
  for each row execute function public.set_updated_at();

alter table public.marketing_monthly enable row level security;


-- ============================================================================
-- customer_support_monthly
-- One row per (period_year, period_month, brand_id). brand_id is part of the PK
-- because the CS panel filters by brand (default PPL per H1 PDF).
-- by_channel and by_category are jsonb maps: { channel_text: count } and
-- { complaint_category_id: count }. avg_resolution_minutes is denormalized so
-- the panel doesn't have to recompute from interval rows.
-- ============================================================================
create table public.customer_support_monthly (
  id                          uuid primary key default gen_random_uuid(),
  period_year                 int not null,
  period_month                int not null check (period_month between 1 and 12),
  brand_id                    uuid not null references public.brands(id) on delete cascade,
  total_logs                  int not null default 0,
  by_channel                  jsonb not null default '{}'::jsonb,
  by_category                 jsonb not null default '{}'::jsonb,
  avg_resolution_minutes      numeric(10,2),
  resolved_count              int not null default 0,
  refreshed_at                timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint customer_support_monthly_period_brand_uniq unique (period_year, period_month, brand_id)
);

create trigger set_updated_at before update on public.customer_support_monthly
  for each row execute function public.set_updated_at();

create index customer_support_monthly_brand_idx
  on public.customer_support_monthly (brand_id);

alter table public.customer_support_monthly enable row level security;


-- ============================================================================
-- sales_by_location_monthly
-- One row per (period_year, period_month, location_id). location_id is nullable
-- because Bank Deposit rows with unknown_location flagged still need to be
-- aggregated — the null bucket shows up on the panel as "Unknown / unmapped".
-- amount_received and amount_payable both kept so the "payable vs received"
-- comparison view from the H1 PDF is queryable directly.
-- ============================================================================
create table public.sales_by_location_monthly (
  id                  uuid primary key default gen_random_uuid(),
  period_year         int not null,
  period_month        int not null check (period_month between 1 and 12),
  location_id         uuid references public.locations(id) on delete cascade,
  amount_received     numeric(15,2) not null default 0,
  amount_payable      numeric(15,2),
  txn_count           int not null default 0,
  plot_count          int not null default 0,
  refreshed_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unique partial indexes: one for non-null location, one for the null bucket.
-- A single unique (year, month, location_id) constraint would treat each null
-- row as distinct because NULL != NULL in unique semantics, allowing duplicate
-- "Unknown" buckets per period. Two partial indexes pin both cases cleanly.
create unique index sales_by_location_monthly_period_loc_uidx
  on public.sales_by_location_monthly (period_year, period_month, location_id)
  where location_id is not null;

create unique index sales_by_location_monthly_period_null_uidx
  on public.sales_by_location_monthly (period_year, period_month)
  where location_id is null;

create trigger set_updated_at before update on public.sales_by_location_monthly
  for each row execute function public.set_updated_at();

alter table public.sales_by_location_monthly enable row level security;

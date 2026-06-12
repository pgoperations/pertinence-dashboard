-- get_earliest_data_date(): the earliest month any ingested data exists for,
-- across every department's monthly aggregate. Powers the date-range picker's
-- "All time" lower bound and the earliest year offered in the year dropdown, so
-- both track real data instead of a hardcoded floor — when a source gains older
-- (or newer-historical) months, "All time" extends automatically with no code
-- change.
--
-- Month granularity (1st of the earliest month) is exact for the picker. All
-- seven monthly aggregates use (period_year, period_month); min over the
-- per-row make_date() respects year-then-month ordering (NOT min(year) +
-- min(month), which would invent a non-existent month). Empty tables yield NULL
-- and are ignored by the outer min(); if every table is empty the function
-- returns NULL and the client falls back to its constant.
create or replace function public.get_earliest_data_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select min(d) from (
    select min(make_date(period_year, period_month, 1)) as d from public.marketing_monthly
    union all
    select min(make_date(period_year, period_month, 1)) from public.digital_marketing_monthly
    union all
    select min(make_date(period_year, period_month, 1)) from public.media_monthly_metrics
    union all
    select min(make_date(period_year, period_month, 1)) from public.sales_by_location_monthly
    union all
    select min(make_date(period_year, period_month, 1)) from public.plot_sales_monthly
    union all
    select min(make_date(period_year, period_month, 1)) from public.realtor_metrics_monthly
    union all
    select min(make_date(period_year, period_month, 1)) from public.customer_support_monthly
  ) t;
$$;

-- Authenticated users (signed-in dashboard) may read it; service_role too.
grant execute on function public.get_earliest_data_date() to authenticated, service_role;

-- Migration 014: refresh_customer_support_monthly() RPC.
--
-- Recomputes the public.customer_support_monthly aggregate from
-- public.customer_support_logs in one statement, called via RPC at the end of
-- every ingest-customer-support run (DESIGN_DECISIONS rule: aggregates are
-- tables refreshed by ingest, not materialized views).
--
-- TRUNCATE-then-insert pattern (same as migrations 011 and 013):
--   * TRUNCATE sidesteps Supabase's `safeupdate` extension which intercepts
--     unqualified DELETE inside SECURITY DEFINER plpgsql bodies.
--   * TRUNCATE is also semantically correct here: this aggregate has exactly
--     one writer (this function), and the ACCESS EXCLUSIVE lock is held
--     sub-second for the full recompute.
--
-- Aggregate grain is (period_year, period_month, brand_id) per the unique
-- constraint in migration 005. brand_id flows from
-- customer_support_logs.rep_id → customer_service_reps.brand_id (a single
-- join in the `base` CTE).
--
-- v1 behaviour notes (will revisit when canonical_categories is seeded by
-- migration 015 and ingest produces real rows):
--
--   * resolved_count uses `lower(trim(resolution_status)) = 'resolved'`. The
--     supervisor's data has 12 distinct status values (RESOLVED dominant,
--     plus RESPONDED, PENDING, IN PROGRESS and case/comma composites). v1
--     counts only the strict 'resolved' bucket; RESPONDED is treated as
--     "answered but not closed" and excluded. If the supervisor wants
--     RESPONDED counted as resolved, change the predicate here in a follow-
--     up migration.
--
--   * avg_resolution_minutes is set to NULL. The source has resolution time
--     fields (cols O–Q on each rep tab) but they're often blank and need
--     supervisor input on time-zone / business-hours math before they can
--     be aggregated meaningfully.
--
--   * Rows with null log_date are excluded entirely — they can't be bucketed
--     into a (year, month). The ingest still upserts them (with
--     `unparseable_date` flag) so the data-quality view can surface them.
--
--   * Rows with null channel or null complaint_category_id are included in
--     total_logs and resolved_count but excluded from by_channel / by_category
--     jsonb maps respectively. The implicit "unknown" buckets in the panel
--     are `total_logs - sum(by_channel values)` and
--     `total_logs - sum(by_category values)`.

create or replace function public.refresh_customer_support_monthly()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  truncate table public.customer_support_monthly;

  with base as (
    select
      extract(year  from csl.log_date)::int  as period_year,
      extract(month from csl.log_date)::int  as period_month,
      csr.brand_id,
      csl.channel,
      csl.complaint_category_id,
      lower(trim(csl.resolution_status)) = 'resolved' as is_resolved
    from public.customer_support_logs csl
    join public.customer_service_reps csr on csr.id = csl.rep_id
    where csl.log_date is not null
  ),
  totals as (
    select
      period_year, period_month, brand_id,
      count(*)::int                                as total_logs,
      count(*) filter (where is_resolved)::int     as resolved_count
    from base
    group by period_year, period_month, brand_id
  ),
  channels as (
    select
      period_year, period_month, brand_id, channel,
      count(*)::int as ch_count
    from base
    where channel is not null
    group by period_year, period_month, brand_id, channel
  ),
  by_channel as (
    select
      period_year, period_month, brand_id,
      jsonb_object_agg(channel, ch_count) as channels_map
    from channels
    group by period_year, period_month, brand_id
  ),
  cats as (
    select
      period_year, period_month, brand_id, complaint_category_id,
      count(*)::int as cat_count
    from base
    where complaint_category_id is not null
    group by period_year, period_month, brand_id, complaint_category_id
  ),
  by_cat as (
    select
      period_year, period_month, brand_id,
      jsonb_object_agg(complaint_category_id::text, cat_count) as cats_map
    from cats
    group by period_year, period_month, brand_id
  )
  insert into public.customer_support_monthly (
    period_year,
    period_month,
    brand_id,
    total_logs,
    by_channel,
    by_category,
    avg_resolution_minutes,
    resolved_count,
    refreshed_at,
    updated_at
  )
  select
    t.period_year,
    t.period_month,
    t.brand_id,
    t.total_logs,
    coalesce(bc.channels_map, '{}'::jsonb)  as by_channel,
    coalesce(bk.cats_map,     '{}'::jsonb)  as by_category,
    null                                     as avg_resolution_minutes,
    t.resolved_count,
    now()                                    as refreshed_at,
    now()                                    as updated_at
  from totals t
  left join by_channel bc
    on  bc.period_year  = t.period_year
    and bc.period_month = t.period_month
    and bc.brand_id     = t.brand_id
  left join by_cat bk
    on  bk.period_year  = t.period_year
    and bk.period_month = t.period_month
    and bk.brand_id     = t.brand_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.refresh_customer_support_monthly() from public;
grant execute on function public.refresh_customer_support_monthly() to service_role;

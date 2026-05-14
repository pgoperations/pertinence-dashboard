-- Migration 013: refresh_marketing_monthly() RPC.
--
-- Recomputes the public.marketing_monthly aggregate from public.marketing_expenses
-- in one statement, called via RPC at the end of every ingest-marketing-expense
-- run (DESIGN_DECISIONS rule: aggregates are tables refreshed by ingest, not
-- materialized views).
--
-- Uses the same TRUNCATE-then-insert shape that migration 011 settled on for
-- sales_by_location_monthly:
--   * TRUNCATE sidesteps Supabase's `safeupdate` extension which intercepts
--     unqualified DELETE inside SECURITY DEFINER plpgsql bodies (the incident
--     from 2026-05-12 — see migration 011 header).
--   * TRUNCATE is also the correct primitive: this aggregate has one writer
--     (this function) and the ACCESS EXCLUSIVE lock is held sub-second.
--
-- Income vs expenditure: v1 of ingest-marketing-expense only writes
-- entry_type='expenditure' rows (Income side of the petty cashbook is mostly
-- "Balance b/f" and out of scope for the H1 KPIs). The aggregate query still
-- computes total_income via FILTER so when income ingest lands later this
-- function does not need to change.
--
-- by_category is a jsonb map { expense_category_id::text -> total_amount } for
-- the Marketing panel's category-distribution donut + table. Keys are stringified
-- UUIDs because jsonb_object_agg requires text keys. Rows with null
-- expense_category_id are excluded from by_category (a defensive guard — every
-- fallback path in the ingest emits some category, so this should be a no-op
-- in practice, but it keeps the jsonb shape clean if a future ingest path
-- produces a null category).

create or replace function public.refresh_marketing_monthly()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  truncate table public.marketing_monthly;

  with totals as (
    select
      period_year,
      period_month,
      coalesce(sum(amount) filter (where entry_type = 'income'),      0) as total_income,
      coalesce(sum(amount) filter (where entry_type = 'expenditure'), 0) as total_expenditure
    from public.marketing_expenses
    group by period_year, period_month
  ),
  by_cat as (
    select
      period_year,
      period_month,
      expense_category_id,
      sum(amount) as cat_total
    from public.marketing_expenses
    where entry_type = 'expenditure'
      and expense_category_id is not null
    group by period_year, period_month, expense_category_id
  )
  insert into public.marketing_monthly (
    period_year,
    period_month,
    total_income,
    total_expenditure,
    by_category,
    refreshed_at,
    updated_at
  )
  select
    t.period_year,
    t.period_month,
    t.total_income,
    t.total_expenditure,
    coalesce(
      (
        select jsonb_object_agg(bc.expense_category_id::text, bc.cat_total)
        from by_cat bc
        where bc.period_year  = t.period_year
          and bc.period_month = t.period_month
      ),
      '{}'::jsonb
    ) as by_category,
    now() as refreshed_at,
    now() as updated_at
  from totals t;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.refresh_marketing_monthly() from public;
grant execute on function public.refresh_marketing_monthly() to service_role;

-- Migration 010: aggregate-refresh Postgres function for sales_by_location_monthly.
--
-- Called by the Bank Deposit ingest Edge Function at the end of each run via
-- supabase-js `rpc('refresh_sales_by_location_monthly')`. Keeps the recompute
-- inside one SQL statement so ingest + aggregate state stay consistent without
-- coordinating transactions across HTTP boundaries.
--
-- Refresh strategy: DELETE all rows, INSERT GROUP BY from bank_deposits. Safe
-- because the cron-triggered ingest is the only writer; the aggregate has no
-- direct client writes (RLS service-role-only). Briefly empty mid-statement,
-- but the whole thing runs as a single transaction so readers see either the
-- old state or the new state — never partial.
--
-- SECURITY DEFINER so the Edge Function (running as service role anyway) can
-- call it. search_path pinned to public per the same hardening pattern used
-- on helpers in migration 003.
--
-- Returns the row count inserted so the Edge Function can log it for ops.

create or replace function public.refresh_sales_by_location_monthly()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  delete from public.sales_by_location_monthly;

  insert into public.sales_by_location_monthly (
    period_year,
    period_month,
    location_id,
    amount_received,
    amount_payable,
    txn_count,
    plot_count,
    refreshed_at,
    updated_at
  )
  select
    extract(year  from bd.txn_date)::int  as period_year,
    extract(month from bd.txn_date)::int  as period_month,
    bd.location_id,
    coalesce(sum(bd.amount_received), 0)  as amount_received,
    sum(bd.amount_payable)                as amount_payable,
    count(*)::int                         as txn_count,
    coalesce(sum(bd.plot_count), 0)::int  as plot_count,
    now()                                 as refreshed_at,
    now()                                 as updated_at
  from public.bank_deposits bd
  where bd.txn_date is not null
  group by
    extract(year  from bd.txn_date),
    extract(month from bd.txn_date),
    bd.location_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Grant execute to authenticated so the Edge Function's service role can call.
-- Service role bypasses RLS but still needs grant on functions.
revoke all on function public.refresh_sales_by_location_monthly() from public;
grant execute on function public.refresh_sales_by_location_monthly() to service_role;

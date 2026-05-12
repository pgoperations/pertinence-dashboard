-- Migration 011: switch aggregate refresh from DELETE to TRUNCATE.
--
-- Migration 010 used `delete from public.sales_by_location_monthly;` to empty
-- the table before rebuilding it. That tripped Supabase's `safeupdate`
-- extension which intercepts unqualified DELETE / UPDATE at the statement
-- level — even inside SECURITY DEFINER functions — and raises
-- "DELETE requires a WHERE clause" (caught on first live invocation of
-- ingest-bank-deposit, 2026-05-12).
--
-- TRUNCATE is the right operator here: it's the SQL primitive for "empty
-- this table", it's faster than DELETE (no per-row MVCC work, no WAL spam
-- on a multi-thousand-row aggregate), and it bypasses the safety check by
-- design. ACCESS EXCLUSIVE lock is fine because this aggregate has exactly
-- one writer (this function) and the lock is held only for the duration of
-- the recompute, which is sub-second.
--
-- The function signature, return type, grants, and refresh semantics are
-- otherwise unchanged from migration 010.

create or replace function public.refresh_sales_by_location_monthly()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  truncate table public.sales_by_location_monthly;

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

-- Grants are unchanged from migration 010 but re-asserted defensively in case
-- this migration is applied in isolation.
revoke all on function public.refresh_sales_by_location_monthly() from public;
grant execute on function public.refresh_sales_by_location_monthly() to service_role;

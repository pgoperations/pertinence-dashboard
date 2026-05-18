-- Migration 016: plot_sales_monthly aggregate + refresh RPC.
--
-- Drives the Sales panel "plots by location × size" pivot from PROJECT_BRIEF.md.
-- Source of truth: weekly_sales (per supervisor non-negotiable #1 — Bank Deposit
-- for revenue, Weekly Sales for plot counts).
--
-- Grain: (period_year, period_month, location_id, plot_type_id). Both FK columns
-- nullable so rows that fail canonical lookup (unknown_location) or plot-type
-- parse (unparseable_plot_type) still aggregate into "unknown" buckets — the
-- panel surfaces them as their own slice rather than silently dropping rows.
--
-- No unique constraint, no upserts. The RPC TRUNCATEs and rebuilds from scratch
-- on every refresh (pattern locked in migration 011). With two nullable FK
-- columns a unique constraint would need three partial indexes (loc-null,
-- type-null, both-null) and the rebuild already guarantees no duplicates.
--
-- Aggregate columns:
--   * plot_count   — sum(weekly_sales.plot_count). The headline metric.
--   * txn_count    — count(*). Rows per bucket (useful for "avg sale" derivations).
--   * total_amount — sum(weekly_sales.amount). The contract value / "payable" side
--                    for the H1-PDF payable-vs-received view. Per supervisor #1,
--                    Bank Deposit's amount_received is the "received" side; this
--                    aggregate is the "payable" side. They're surfaced together,
--                    not silently reconciled.


create table public.plot_sales_monthly (
  id              uuid primary key default gen_random_uuid(),
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  location_id     uuid references public.locations(id)  on delete cascade,
  plot_type_id    uuid references public.plot_types(id) on delete cascade,
  plot_count      int  not null default 0,
  txn_count       int  not null default 0,
  total_amount    numeric(15,2) not null default 0,
  refreshed_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index plot_sales_monthly_period_idx
  on public.plot_sales_monthly (period_year, period_month);
create index plot_sales_monthly_location_idx
  on public.plot_sales_monthly (location_id);
create index plot_sales_monthly_plot_type_idx
  on public.plot_sales_monthly (plot_type_id);

create trigger set_updated_at before update on public.plot_sales_monthly
  for each row execute function public.set_updated_at();

alter table public.plot_sales_monthly enable row level security;

-- RLS: authenticated read only. Writes are service-role only (Edge Functions
-- bypass RLS via the service-role key). Matches migration 006 pattern.
create policy "authenticated read"
  on public.plot_sales_monthly for select to authenticated using (true);


-- Refresh function: TRUNCATE + INSERT GROUP BY, single statement body.
-- SECURITY DEFINER + pinned search_path matches the established pattern from
-- migrations 010/011/013/014. Service-role only.
create or replace function public.refresh_plot_sales_monthly()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  truncate table public.plot_sales_monthly;

  insert into public.plot_sales_monthly (
    period_year,
    period_month,
    location_id,
    plot_type_id,
    plot_count,
    txn_count,
    total_amount,
    refreshed_at,
    updated_at
  )
  select
    extract(year  from ws.week_ending)::int  as period_year,
    extract(month from ws.week_ending)::int  as period_month,
    ws.location_id,
    ws.plot_type_id,
    coalesce(sum(ws.plot_count), 0)::int     as plot_count,
    count(*)::int                            as txn_count,
    coalesce(sum(ws.amount), 0)              as total_amount,
    now()                                    as refreshed_at,
    now()                                    as updated_at
  from public.weekly_sales ws
  where ws.week_ending is not null
  group by
    extract(year  from ws.week_ending),
    extract(month from ws.week_ending),
    ws.location_id,
    ws.plot_type_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.refresh_plot_sales_monthly() from public;
grant execute on function public.refresh_plot_sales_monthly() to service_role;

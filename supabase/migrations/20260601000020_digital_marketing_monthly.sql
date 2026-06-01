-- Migration 020: schema for the Digital Marketing tab on the Marketing Team
-- Reporting Template spreadsheet. Closes the "Digital Marketing" half of the
-- supervisor's 2026-06-01 ask (paired with migration 021 / Media Weekly).
--
-- Shape recap (2026 section starts at sheet row 129 on the Digital Marketing
-- tab; rows above are 2024–2025 historicals, out of v1 scope):
--   * Row 129: literal "2026" year marker (parser anchors on this)
--   * Row 131: month-name row — JANUARY at col B, FEBRUARY at K, MARCH at S,
--              APRIL at AB, MAY at AL, ... 8-9 col gaps (supervisor's manual
--              layout — the parser anchors on "Week 1" cells per block, same
--              trick as realtor_metrics)
--   * Row 132: per-block "Week 1 / Week 2 / ... / TOTAL" header
--   * Below: each month block contains MULTIPLE nested CAMPAIGN sub-blocks.
--     A sub-block is: one "Campaign Name" header row (label col + per-week
--     campaign strings) followed by 4–7 metric rows (Reach, Impression,
--     Leads, Cost Per Lead, Cost, sometimes Visits / Follows / Cost Per
--     Result (Combined)). The first sub-block in each month is a blank
--     template (no values) and is filtered by the parser.
--
-- Grain decision: (period_year, period_month, campaign_name, metric_key).
--   campaign_name is free-text (normalized to uppercased + trimmed; not
--   canonicalized in a reference table — the supervisor runs one-off
--   campaigns frequently and a closed canonical list would be wrong-shape).
--   week_values jsonb preserves the per-week granularity without a schema
--   change when the future weekly-trend card lands.
--
-- Unit: each canonical metric carries a `unit` so the UI can format values
--   correctly without sniffing per-row. Reach/Impression/Leads/Visits/Follows
--   are 'count'; Cost/Cost Per Lead/Cost Per Result Combined are 'naira'.
--
-- NIL/Nil/'-' handling: same convention as realtor metrics (NIL → 0, empty
--   → null, '-' → null since '-' here is "n/a" not "zero"). Coercion lives
--   in the parser, not in SQL.
--
-- Aggregate refresh: refresh_digital_marketing_monthly() is essentially a
--   no-op identity (the fact table is already at monthly grain) — kept for
--   parity with the other ingests' RPC pattern, so the Edge Function can
--   uniformly end with `supabase.rpc('refresh_*')`. The function returns
--   a row count so the response payload's `aggregateRowsInserted` field
--   stays meaningful.


-- ============================================================================
-- digital_marketing_metric_canonicals: small fixed metric vocabulary.
-- Seeded immediately below — these 8 metrics cover the 2026 sub-blocks
-- inspected on 2026-06-01. Supervisor adds an alias row (no canonical change)
-- when a future month introduces a new label spelling.
-- ============================================================================
create table public.digital_marketing_metric_canonicals (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  display_name  text not null,
  display_order int not null,
  unit          text not null default 'count'
                check (unit in ('count', 'naira')),
  created_at    timestamptz not null default now()
);

create index digital_marketing_metric_canonicals_order_idx
  on public.digital_marketing_metric_canonicals (display_order);

alter table public.digital_marketing_metric_canonicals enable row level security;

create policy "authenticated read"
  on public.digital_marketing_metric_canonicals for select to authenticated using (true);
create policy "admins manage"
  on public.digital_marketing_metric_canonicals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- digital_marketing_metric_aliases: source-label text → canonical key.
-- Same shape as realtor_metric_aliases. lower(alias) unique index makes the
-- ingest lookup case-insensitive; trim() at the ingest layer handles trailing
-- whitespace (e.g. "Cost " with a trailing space — common on this tab).
-- ============================================================================
create table public.digital_marketing_metric_aliases (
  id          uuid primary key default gen_random_uuid(),
  metric_key  text not null
              references public.digital_marketing_metric_canonicals(key)
              on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);

create unique index digital_marketing_metric_aliases_lower_alias_uniq
  on public.digital_marketing_metric_aliases (lower(alias));

create index digital_marketing_metric_aliases_metric_idx
  on public.digital_marketing_metric_aliases (metric_key);

alter table public.digital_marketing_metric_aliases enable row level security;

create policy "authenticated read"
  on public.digital_marketing_metric_aliases for select to authenticated using (true);
create policy "admins manage"
  on public.digital_marketing_metric_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- digital_marketing_monthly: fact table.
-- Source_row_id format set by the ingest: "y{YYYY}-m{MM}-{campaign_slug}-{metric_key}".
-- campaign_slug is the campaign_name lowercased + non-alnum stripped, capped
-- at 60 chars to stay within reasonable text key length.
-- ============================================================================
create table public.digital_marketing_monthly (
  id              uuid primary key default gen_random_uuid(),
  source_sheet    text not null,
  source_tab      text not null,
  source_row_id   text not null,
  raw_row         jsonb not null,
  quality_flags   jsonb not null default '{}'::jsonb,
  period_year     int not null,
  period_month    int not null check (period_month between 1 and 12),
  campaign_name   text not null,
  metric_key      text not null
                  references public.digital_marketing_metric_canonicals(key)
                  on delete restrict,
  total           numeric(15,2),
  week_values     jsonb,
  ingested_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint digital_marketing_monthly_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.digital_marketing_monthly
  for each row execute function public.set_updated_at();

create index digital_marketing_monthly_period_idx
  on public.digital_marketing_monthly (period_year, period_month);
create index digital_marketing_monthly_metric_idx
  on public.digital_marketing_monthly (metric_key);
create index digital_marketing_monthly_campaign_idx
  on public.digital_marketing_monthly (campaign_name);

alter table public.digital_marketing_monthly enable row level security;

create policy "authenticated read"
  on public.digital_marketing_monthly for select to authenticated using (true);


-- ============================================================================
-- refresh_digital_marketing_monthly: identity RPC kept for parity with the
-- other ingests' end-of-run refresh step. Returns the live row count so the
-- response payload's `aggregateRowsInserted` field stays informative without
-- requiring the Edge Function to do a second roundtrip.
-- ============================================================================
create or replace function public.refresh_digital_marketing_monthly()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count integer;
begin
  select count(*) into row_count from public.digital_marketing_monthly;
  return row_count;
end;
$$;

revoke all on function public.refresh_digital_marketing_monthly() from public, anon, authenticated;
grant execute on function public.refresh_digital_marketing_monthly() to service_role;


-- ============================================================================
-- Seed: canonical metrics + aliases.
-- Aliases use the exact label-text spelling from the 2026 source as of
-- 2026-06-01. New label variants land as additional alias rows in a future
-- migration (not a code change) so the supervisor's edits propagate cleanly.
-- ============================================================================
insert into public.digital_marketing_metric_canonicals (key, display_name, display_order, unit) values
  ('reach',                     'Reach',                          1, 'count'),
  ('impression',                'Impression',                     2, 'count'),
  ('leads',                     'Leads',                          3, 'count'),
  ('visits',                    'Visits',                         4, 'count'),
  ('follows',                   'Follows',                        5, 'count'),
  ('cost_per_lead',             'Cost per lead',                  6, 'naira'),
  ('cost_per_result_combined',  'Cost per result (combined)',     7, 'naira'),
  ('cost',                      'Cost',                           8, 'naira')
on conflict (key) do nothing;


insert into public.digital_marketing_metric_aliases (metric_key, alias)
select v.metric_key, v.alias
from (values
  ('reach',                     'Reach'),
  ('impression',                'Impression'),
  ('impression',                'Impression '),  -- trailing-space variant seen in source
  ('leads',                     'Leads'),
  ('leads',                     'Leads (Msgs)'),
  ('visits',                    'Visits'),
  ('visits',                    'Visits (Profile)'),
  ('follows',                   'Follows'),
  ('cost_per_lead',             'Cost Per Lead'),
  ('cost_per_lead',             'Cost Per Lead '),  -- trailing-space variant
  ('cost_per_result_combined',  'Cost Per result (Combined)'),
  ('cost_per_result_combined',  'Cost Per Results (Combined)'),
  ('cost_per_result_combined',  'Cost Per Results (Combined) '),
  ('cost',                      'Cost'),
  ('cost',                      'Cost ')  -- trailing-space variant
) as v(metric_key, alias)
on conflict (lower(alias)) do nothing;

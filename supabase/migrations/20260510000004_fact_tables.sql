-- Migration 004: fact tables.
--
-- One table per ingestion source. Conventions (apply to every fact table here):
--
--   * Common metadata columns:
--       id              uuid PK (gen_random_uuid())
--       source_sheet    text  — sheet identifier (e.g. "bank_deposit_mirror")
--       source_tab      text  — tab name within the sheet ("2026 LAND", "May 2026")
--       source_row_id   text  — stable row identifier from the sheet
--       raw_row         jsonb — the full original row, for traceback
--       quality_flags   jsonb — set per quality_flags.ts vocabulary
--       ingested_at     timestamptz
--       updated_at      timestamptz (set_updated_at trigger)
--   * Unique constraint on (source_sheet, source_tab, source_row_id) makes ingest
--     idempotent: re-runs do INSERT ... ON CONFLICT DO UPDATE.
--   * Currency columns are numeric(15,2). Never float for money.
--   * Foreign keys to reference tables use ON DELETE SET NULL — losing a canonical
--     reference shouldn't destroy fact rows; a quality_flags entry will surface
--     the dangling lookup at the next refresh.
--   * RLS is ENABLED on every table here with no policies. Service role (Edge
--     Functions) bypasses RLS for writes; authenticated read policies are added
--     in the next migration once all tables exist.
--   * The exact column shapes here are best-guess from PROJECT_BRIEF.md without
--     having seen the actual sheet data yet. Once we connect the service account
--     and inspect real rows, expect a follow-up migration to add/rename columns.
--     raw_row preserves everything in the meantime.


-- ============================================================================
-- marketing_expenses
-- Source: Marketing Fund Expense Sheet, one tab per month ("May 2026" etc.).
-- Period anchor (period_year + period_month) comes from the SOURCE TAB NAME via
-- public.parse_month_year(), NOT from in_cell_date — the in-cell dates on this
-- sheet are unreliable per the brief. in_cell_date is preserved for reference.
-- ============================================================================
create table public.marketing_expenses (
  id                   uuid primary key default gen_random_uuid(),
  source_sheet         text not null,
  source_tab           text not null,
  source_row_id        text not null,
  raw_row              jsonb not null,
  quality_flags        jsonb not null default '{}'::jsonb,
  period_year          int not null,
  period_month         int not null check (period_month between 1 and 12),
  entry_type           text not null check (entry_type in ('income', 'expenditure')),
  amount               numeric(15,2) not null,
  description          text,
  expense_category_id  uuid references public.expense_categories(id) on delete set null,
  in_cell_date         date,
  ingested_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint marketing_expenses_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.marketing_expenses
  for each row execute function public.set_updated_at();

create index marketing_expenses_period_idx
  on public.marketing_expenses (period_year, period_month);
create index marketing_expenses_category_idx
  on public.marketing_expenses (expense_category_id);

alter table public.marketing_expenses enable row level security;


-- ============================================================================
-- bank_deposits
-- Source: Bank Deposit Mirror, "2026 LAND" tab. Financial source of truth for
-- land sales revenue. txn_date pulls from DATE.1 column K (NOT primary DATE,
-- which defaults to month-start) — pending supervisor confirmation per
-- PROGRESS.md "open items".
-- ============================================================================
create table public.bank_deposits (
  id                   uuid primary key default gen_random_uuid(),
  source_sheet         text not null,
  source_tab           text not null,
  source_row_id        text not null,
  raw_row              jsonb not null,
  quality_flags        jsonb not null default '{}'::jsonb,
  txn_date             date,
  amount_received      numeric(15,2) not null,
  amount_payable       numeric(15,2),
  customer_name        text,
  sales_person         text,
  location_id          uuid references public.locations(id) on delete set null,
  purpose_id           uuid references public.purposes(id) on delete set null,
  plot_type_id         uuid references public.plot_types(id) on delete set null,
  plot_size_raw        text,
  plot_count           int,
  realtor_manager_id   uuid references public.realtor_managers(id) on delete set null,
  ingested_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bank_deposits_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.bank_deposits
  for each row execute function public.set_updated_at();

create index bank_deposits_txn_date_idx        on public.bank_deposits (txn_date);
create index bank_deposits_location_idx        on public.bank_deposits (location_id);
create index bank_deposits_purpose_idx         on public.bank_deposits (purpose_id);
create index bank_deposits_plot_type_idx       on public.bank_deposits (plot_type_id);
create index bank_deposits_realtor_idx         on public.bank_deposits (realtor_manager_id);

alter table public.bank_deposits enable row level security;


-- ============================================================================
-- weekly_sales
-- Source: Bank Deposit Mirror, "2026 Weekly Sales Report" tab. Plot counts by
-- location/size; PLOT TYPE column embeds count e.g. "1 EXECUTIVE", "1 QUARTER".
-- The (count, type_word) parse lives in _shared/parsePlotType.ts.
-- ============================================================================
create table public.weekly_sales (
  id                   uuid primary key default gen_random_uuid(),
  source_sheet         text not null,
  source_tab           text not null,
  source_row_id        text not null,
  raw_row              jsonb not null,
  quality_flags        jsonb not null default '{}'::jsonb,
  week_ending          date,
  amount               numeric(15,2),
  customer_name        text,
  sales_person         text,
  location_id          uuid references public.locations(id) on delete set null,
  plot_type_id         uuid references public.plot_types(id) on delete set null,
  plot_size_raw        text,
  plot_count           int,
  realtor_manager_id   uuid references public.realtor_managers(id) on delete set null,
  ingested_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint weekly_sales_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.weekly_sales
  for each row execute function public.set_updated_at();

create index weekly_sales_week_ending_idx  on public.weekly_sales (week_ending);
create index weekly_sales_location_idx     on public.weekly_sales (location_id);
create index weekly_sales_plot_type_idx    on public.weekly_sales (plot_type_id);
create index weekly_sales_realtor_idx      on public.weekly_sales (realtor_manager_id);

alter table public.weekly_sales enable row level security;


-- ============================================================================
-- customer_files
-- Source: Bank Deposit Mirror, "2026 Customer File" tab. Customer-level sales
-- with plot size in different format ("600SQM", "1 ACRE"). Same parsePlotType.ts
-- handles both this and the Weekly Sales convention.
-- ============================================================================
create table public.customer_files (
  id                   uuid primary key default gen_random_uuid(),
  source_sheet         text not null,
  source_tab           text not null,
  source_row_id        text not null,
  raw_row              jsonb not null,
  quality_flags        jsonb not null default '{}'::jsonb,
  entry_date           date,
  amount               numeric(15,2),
  amount_payable       numeric(15,2),
  customer_name        text,
  sales_person         text,
  location_id          uuid references public.locations(id) on delete set null,
  plot_type_id         uuid references public.plot_types(id) on delete set null,
  plot_size_raw        text,
  plot_count           int,
  realtor_manager_id   uuid references public.realtor_managers(id) on delete set null,
  ingested_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint customer_files_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.customer_files
  for each row execute function public.set_updated_at();

create index customer_files_entry_date_idx  on public.customer_files (entry_date);
create index customer_files_location_idx    on public.customer_files (location_id);
create index customer_files_plot_type_idx   on public.customer_files (plot_type_id);
create index customer_files_realtor_idx     on public.customer_files (realtor_manager_id);

alter table public.customer_files enable row level security;


-- ============================================================================
-- customer_support_logs
-- Source: Customer Support Master Sheet, one tab per rep (Catherine, Mariam,
-- Mary, Yetunde, Lovinal). Each tab has ~31 columns; we type the most queried
-- ones and keep the rest in raw_row. Brand attribution flows through rep_id →
-- customer_service_reps.brand_id (set up in migration 002).
-- ============================================================================
create table public.customer_support_logs (
  id                       uuid primary key default gen_random_uuid(),
  source_sheet             text not null,
  source_tab               text not null,
  source_row_id            text not null,
  raw_row                  jsonb not null,
  quality_flags            jsonb not null default '{}'::jsonb,
  log_date                 date,
  rep_id                   uuid not null references public.customer_service_reps(id) on delete restrict,
  channel                  text,
  complaint_category_id    uuid references public.complaint_categories(id) on delete set null,
  complaint_raw            text,
  resolution_status        text,
  resolution_duration      interval,
  customer_name            text,
  ingested_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint customer_support_logs_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.customer_support_logs
  for each row execute function public.set_updated_at();

create index customer_support_logs_log_date_idx  on public.customer_support_logs (log_date);
create index customer_support_logs_rep_idx       on public.customer_support_logs (rep_id);
create index customer_support_logs_category_idx  on public.customer_support_logs (complaint_category_id);
create index customer_support_logs_channel_idx   on public.customer_support_logs (channel);

alter table public.customer_support_logs enable row level security;


-- ============================================================================
-- realtor_manager_weekly
-- Source: Marketing Team Reporting Template, "Realtor Managers Weekly Report"
-- tab (the 2026 tab is pending creation per PROGRESS.md "open items"). One row
-- per (manager, week). Drives the Realtor Management panel: recruitment count,
-- attendance, per-manager sales attribution.
--
-- Specific column shapes are best-guess until the supervisor creates the 2026
-- tab — raw_row preserves everything for retroactive reshape if columns differ.
-- ============================================================================
create table public.realtor_manager_weekly (
  id                  uuid primary key default gen_random_uuid(),
  source_sheet        text not null,
  source_tab          text not null,
  source_row_id       text not null,
  raw_row             jsonb not null,
  quality_flags       jsonb not null default '{}'::jsonb,
  week_ending         date,
  realtor_manager_id  uuid not null references public.realtor_managers(id) on delete restrict,
  recruitments        int,
  attendance_count    int,
  sales_count         int,
  sales_amount        numeric(15,2),
  ingested_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint realtor_manager_weekly_source_uniq unique (source_sheet, source_tab, source_row_id)
);

create trigger set_updated_at before update on public.realtor_manager_weekly
  for each row execute function public.set_updated_at();

create index realtor_manager_weekly_week_idx
  on public.realtor_manager_weekly (week_ending);
create index realtor_manager_weekly_manager_idx
  on public.realtor_manager_weekly (realtor_manager_id);

alter table public.realtor_manager_weekly enable row level security;

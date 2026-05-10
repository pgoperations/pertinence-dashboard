-- Migration 002: reference tables and seed data.
--
-- Conventions:
--   * uuid primary keys via gen_random_uuid() (pgcrypto, from migration 001).
--   * Aliases live in their own tables (NOT jsonb arrays) per DESIGN_DECISIONS.md,
--     with case-insensitive uniqueness via a unique index on lower(alias).
--   * Every reference table ENABLEs RLS but ships with no policies. That locks the
--     tables down to service-role access (Edge Functions) by default. The auth/roles
--     model (profiles + admin/editor/viewer) and the actual policies come in a later
--     migration, once the role helper functions exist.
--   * updated_at maintained by the public.set_updated_at() trigger from migration 001.
--   * Seed data is inserted only for tables whose canonical values are already
--     settled. locations, purposes, expense_categories, and complaint_categories are
--     intentionally LEFT EMPTY — their canonical lists need supervisor approval
--     against the real sheets before being committed to the schema.
--
-- Design note worth flagging: the brief listed `social_brands` as a separate ref
-- table, but customer_service_reps also need a brand FK for the Customer Support
-- panel filter. I unified both under a single `brands` table with is_social / is_cs
-- scope flags so there's one source of truth for brand identity. If you want them
-- split, push back and I'll refactor.


-- ============================================================================
-- brands
-- ============================================================================
create table public.brands (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  slug         text not null unique,
  is_social    boolean not null default false,
  is_cs        boolean not null default false,
  email_domain text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

alter table public.brands enable row level security;


-- ============================================================================
-- locations + location_aliases
-- (24+ raw LOCATION variants on Bank Deposit normalize to a canonical set.)
-- ============================================================================
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;


create table public.location_aliases (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now()
);

create unique index location_aliases_lower_alias_uidx
  on public.location_aliases (lower(alias));

create index location_aliases_location_id_idx
  on public.location_aliases (location_id);

alter table public.location_aliases enable row level security;


-- ============================================================================
-- purposes + purpose_aliases
-- (Bank Deposit PURPOSE column — ~27 variants normalize to ~10 canonical
-- e.g. "OUTRIGHT D&D" / "OUTRGHT D&D" → one canonical row.)
-- ============================================================================
create table public.purposes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.purposes
  for each row execute function public.set_updated_at();

alter table public.purposes enable row level security;


create table public.purpose_aliases (
  id         uuid primary key default gen_random_uuid(),
  purpose_id uuid not null references public.purposes(id) on delete cascade,
  alias      text not null,
  created_at timestamptz not null default now()
);

create unique index purpose_aliases_lower_alias_uidx
  on public.purpose_aliases (lower(alias));

create index purpose_aliases_purpose_id_idx
  on public.purpose_aliases (purpose_id);

alter table public.purpose_aliases enable row level security;


-- ============================================================================
-- expense_categories
-- The 11 H1 categories applied to Marketing Fund Expense rows. Left empty —
-- ingest until the supervisor adds the Category dropdown to the source sheet
-- falls back to keyword-based auto-categorization with a low-confidence flag
-- (`fallback_category` quality flag).
-- ============================================================================
create table public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  display_order int,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;


-- ============================================================================
-- plot_types
-- Per DESIGN_DECISIONS.md: holds ONLY the 4 canonical names. The actual size →
-- canonical mapping rules live in TypeScript (_shared/parsePlotType.ts), not in
-- this table. The description column documents the intent for human readers.
-- ============================================================================
create table public.plot_types (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text not null,
  display_order int  not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on public.plot_types
  for each row execute function public.set_updated_at();

alter table public.plot_types enable row level security;


-- ============================================================================
-- realtor_managers
-- Configurable roster. Names today: Mrs Kemi, Richard Makava, Debbie.
-- ============================================================================
create table public.realtor_managers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.realtor_managers
  for each row execute function public.set_updated_at();

alter table public.realtor_managers enable row level security;


-- ============================================================================
-- customer_service_reps
-- Brand FK feeds the brand-filter dimension on the Customer Support panel
-- (default PPL on first load, mirroring the H1 PDF). Brand attribution is
-- sourced from the Staff_Reference tab in the Customer Support master sheet.
-- ============================================================================
create table public.customer_service_reps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  brand_id   uuid not null references public.brands(id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.customer_service_reps
  for each row execute function public.set_updated_at();

create index customer_service_reps_brand_id_idx
  on public.customer_service_reps (brand_id);

alter table public.customer_service_reps enable row level security;


-- ============================================================================
-- complaint_categories + complaint_aliases
-- ("Nature of Complaint" column — has typos like "Documentaion" that need to
-- collapse into one canonical category.)
-- ============================================================================
create table public.complaint_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.complaint_categories
  for each row execute function public.set_updated_at();

alter table public.complaint_categories enable row level security;


create table public.complaint_aliases (
  id                    uuid primary key default gen_random_uuid(),
  complaint_category_id uuid not null references public.complaint_categories(id) on delete cascade,
  alias                 text not null,
  created_at            timestamptz not null default now()
);

create unique index complaint_aliases_lower_alias_uidx
  on public.complaint_aliases (lower(alias));

create index complaint_aliases_category_id_idx
  on public.complaint_aliases (complaint_category_id);

alter table public.complaint_aliases enable row level security;


-- ============================================================================
-- Seed data
-- ============================================================================

-- Brands.
insert into public.brands (name, slug, is_social, is_cs, email_domain) values
  ('Pertinence Group',       'pg',       true, false, null),
  ('Pertinence Properties',  'ppl',      true, true,  'pertinenceproperties.com'),
  ('RealVest',               'realvest', true, true,  'realvest.ng'),
  ('Genius',                 'genius',   true, false, null);

-- Plot types (the 4 canonical names — full set, never grows).
insert into public.plot_types (name, description, display_order) values
  ('Starter',   '300 SQM',                                          1),
  ('Classic',   '450 SQM',                                          2),
  ('Executive', '500 or 600 SQM',                                   3),
  ('Special',   'Anything else (sub-300, 1 ACRE, 1 QUARTER, etc.)', 4);

-- Realtor managers (configurable roster, current as of project kickoff).
insert into public.realtor_managers (name) values
  ('Mrs Kemi'),
  ('Richard Makava'),
  ('Debbie');

-- Customer-service reps with brand attribution from Staff_Reference.
insert into public.customer_service_reps (name, brand_id) values
  ('Catherine', (select id from public.brands where slug = 'ppl')),
  ('Mariam',    (select id from public.brands where slug = 'ppl')),
  ('Mary',      (select id from public.brands where slug = 'ppl')),
  ('Yetunde',   (select id from public.brands where slug = 'realvest')),
  ('Lovinal',   (select id from public.brands where slug = 'realvest'));

# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 1 — Schema foundation (in progress).** Scaffold complete; migration 001 approved; migration 002 awaiting review.

## Build order overview

Step 1 of 9 in the roadmap from [PROJECT_BRIEF.md](PROJECT_BRIEF.md):

1. **Supabase setup, migrations, RLS, seed reference data** ← here
2. Google Sheets API service account setup, share each sheet
3. Ingestion Edge Functions — Bank Deposit first, then Customer Support, Customer File, Weekly Sales, Marketing Expense, Realtor Managers Weekly
4. React scaffold — auth, routing, layout shell, global date filter
5. Sales (Land) section — pattern-setting
6. Marketing → Customer Support → Realtor Management sections
7. Media & Content (manual-entry forms for the 4 brands)
8. Rule-based narrative engine, per-section, cached per period
9. Manual refresh button, polish, Netlify deploy

## Completed milestones

- **2026-05-07** — Project bootstrap (commit `f1942d3`):
  - Foundation docs: `PROJECT_BRIEF.md`, `DESIGN_DECISIONS.md`
  - Scaffold: Vite + React 18 + TypeScript + Tailwind v3 + Recharts + Supabase JS, all installed via pnpm
  - Supabase CLI initialized (`supabase/config.toml`); migrations + functions dirs created
  - Migration 001 (`20260507000001_extensions_and_helpers.sql`): `uuid-ossp`, `pgcrypto`, `pg_trgm` extensions; `set_updated_at()` trigger function; `parse_month_year()` helper for Marketing Expense source-tab anchoring
  - First commit on `main`, attributed to user identity
- **2026-05-10** — GitHub remote attached and pushed:
  - Repo created at `pgoperations/pertinence-dashboard`
  - Remote configured, push succeeded after collaborator-access fix
  - Migration 002 written (`20260510000001_reference_tables.sql`) — pending review
  - Workflow infrastructure: `MEMORY.md` baseline (6 files), this `PROGRESS.md`, critique-workflow integration plan all locked in

## Current focus

**Migration 002 review and follow-on migrations.** Once 002 is approved:

- 003 — auth: `profiles` table extending `auth.users`, role enum (`admin` / `editor` / `viewer`), role helper functions
- 004 — fact tables: `marketing_expenses`, `bank_deposits`, `weekly_sales`, `customer_files`, `customer_support_logs`, each with `source_sheet`/`source_tab`/`source_row_id` (unique), `raw_row` jsonb, `quality_flags` jsonb
- 005 — derived/cached aggregate tables (refreshed by ingest functions, not materialized views)
- 006 — RLS policies (now that roles exist) — service-role-only on fact tables, role-gated on reference tables
- 007 — `data_quality_alerts`, `narrative_cache`, `social_media_manual_entries`

## Next checkpoint

Migration 002 approved + migrations 003–007 written. After that, we leave SQL behind for ~3 weeks and start step 2 (Google Sheets service account) and step 3 (Edge Function ingestion, Bank Deposit first).

## Open items waiting on supervisor

From [PROJECT_BRIEF.md](PROJECT_BRIEF.md) "Open items still needing supervisor confirmation":

- [ ] Confirm `DATE.1` (column K) on `2026 LAND` is the real transaction date (default `DATE` defaults to month-start)
- [ ] Approval for the canonical location/purpose mappings (the supervisor needs to review the draft before `locations` / `purposes` ref tables get seeded — that's why migration 002 ships those tables empty)
- [ ] Marketing Expense `Category` dropdown column added to source sheet (until then, ingest falls back to keyword-based auto-categorization with `fallback_category` quality flag)
- [ ] 2026 tab created in Marketing Team Reporting Template — Realtor Managers Weekly Report
- [ ] Confirm Customer Support panel default brand filter (currently planned: PPL, mirroring H1 PDF; toggle to RealVest or "all")

## Decisions waiting on user (Shawn)

- [ ] Migration 002 approval: unified `brands` table (current draft) vs split `social_brands` + separate CS-brand mechanism (literal brief reading)

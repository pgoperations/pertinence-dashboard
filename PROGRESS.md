# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 1 — Schema foundation: migrations written end-to-end (001–007).** Awaiting application to the Supabase project, then ready to move to Phase 2 (Google Sheets service account + ingestion Edge Functions).

## Build order overview

Step 1 of 9 in the roadmap from [PROJECT_BRIEF.md](PROJECT_BRIEF.md):

1. **Supabase setup, migrations, RLS, seed reference data** ← here, complete pending review/apply
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

- **2026-05-10** — GitHub remote attached and pushed; workflow infrastructure locked in (commit `70570f9`):
  - Repo created at `pgoperations/pertinence-dashboard`; remote configured; push succeeded after collaborator-access fix
  - Migration 002 (`20260510000001_reference_tables.sql`) — reference tables + seed: `brands`, `locations` + aliases, `purposes` + aliases, `expense_categories`, `plot_types` (4 canonical seeded), `realtor_managers` (3 seeded), `customer_service_reps` (5 seeded with brand FKs), `complaint_categories` + aliases. RLS enabled, no policies (deferred to migration 006).
  - Workflow infrastructure: `MEMORY.md` baseline (6 files), this `PROGRESS.md`, critique-workflow integration plan all in place
  - `pgoperations` org → `shawnumo` collaborator path resolved the push 403

- **2026-05-10** — Schema phase end-to-end (migrations 003–007 written this session):
  - Migration 003 (`20260510000002_auth.sql`) — auth: `user_role` enum (admin/editor/viewer), `profiles` table (1:1 with `auth.users`), `handle_new_user` signup trigger, `prevent_role_self_change` BEFORE UPDATE trigger (catches what RLS WITH CHECK can't enforce), helpers `current_user_role()` / `is_admin()` / `is_editor_or_admin()` (SECURITY DEFINER + STABLE + pinned `search_path`), and profile RLS policies
  - Migration 004 (`20260510000003_fact_tables.sql`) — six fact tables: `marketing_expenses`, `bank_deposits`, `weekly_sales`, `customer_files`, `customer_support_logs`, `realtor_manager_weekly`. Common idempotency contract `(source_sheet, source_tab, source_row_id)` unique + `raw_row` jsonb + `quality_flags` jsonb. Foreign keys to reference tables `on delete set null` so canonical changes don't destroy facts.
  - Migration 005 (`20260510000004_aggregates.sql`) — minimum-viable aggregate set: `marketing_monthly`, `customer_support_monthly` (period × brand), `sales_by_location_monthly` (with the partial-index trick to keep the null-location bucket unique per period). More aggregates land per-panel during step 5+.
  - Migration 006 (`20260510000005_rls_policies.sql`) — RLS for reference / fact / aggregate: all `to authenticated`, anon role gets nothing. Reference tables admin-managed; fact + aggregate writes service-role-only.
  - Migration 007 (`20260510000006_dashboard_infra.sql`) — `data_quality_alerts` (editors + admins resolve), `narrative_cache` (service-role writes only, with `generator_version` for cache invalidation), `social_media_manual_entries` (editors + admins write, admins delete).
  - `supabase/functions/_shared/quality_flags.ts` — exported flag vocabulary (`unknown_location`, `unknown_purpose`, `fallback_category`, `missing_realtor`, `low_match_confidence`, `unparseable_plot_type`, `unparseable_date`, `null_sales_person`)

## Current focus

**Apply migrations 002–007 to the Supabase project**, then move to Phase 2.

Next session entry points:
1. Apply migrations (`supabase db push` against the live project, or via the dashboard SQL editor)
2. Smoke-test by signing up a test user → verify a profile row auto-created with role=`viewer`
3. Manually promote that test user to admin via SQL
4. Then start Phase 2: Google Cloud project + service account creation, share each sheet with the service account email

## Next checkpoint

Migrations applied to the live Supabase project + a test admin user provisioned. After that we leave SQL behind for ~3 weeks and start Phase 2 (Google Sheets service account) and Phase 3 (ingestion Edge Functions, Bank Deposit first).

## Open items waiting on supervisor

From [PROJECT_BRIEF.md](PROJECT_BRIEF.md) "Open items still needing supervisor confirmation":

- [ ] Confirm `DATE.1` (column K) on `2026 LAND` is the real transaction date (default `DATE` defaults to month-start)
- [ ] Approval for the canonical location/purpose mappings (the supervisor needs to review the draft before `locations` / `purposes` ref tables get seeded — that's why migration 002 ships those tables empty)
- [ ] Marketing Expense `Category` dropdown column added to source sheet (until then, ingest falls back to keyword-based auto-categorization with `fallback_category` quality flag)
- [ ] 2026 tab created in Marketing Team Reporting Template — Realtor Managers Weekly Report
- [ ] Confirm Customer Support panel default brand filter (currently planned: PPL, mirroring H1 PDF; toggle to RealVest or "all")

## Open items waiting on Shawn

- [ ] **Disable public Supabase Auth signup** (Supabase dashboard → Auth settings) before going live with real data. Without this, anyone with the project URL + anon key can self-register and inherit `viewer` access to all financial data. Migration 006 hard-locks anon access to zero, but leaves the door open if signup is enabled.
- [ ] Bootstrap the first admin user manually after the first signup: `update public.profiles set role = 'admin' where id = '<auth.users.id>';` (run via Supabase dashboard SQL editor with service role).
- [ ] Decide whether to apply migrations against a remote project now, or wait until Google Sheets ingest is wired (Phase 3) and apply both together.

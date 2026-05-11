# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 2 complete + Bank Deposit `2026 LAND` schema resolved with supervisor (2026-05-11).** Column A is the real transaction date; columns L and M are out of scope; `CLIENT  NAME` double-space is intentional. Next: draft canonical `locations` + `purposes` mappings from the live data for supervisor review, then Phase 3 (Bank Deposit ingest Edge Function).

## Build order overview

Step 1 of 9 in the roadmap from [PROJECT_BRIEF.md](PROJECT_BRIEF.md):

1. ~~Supabase setup, migrations, RLS, seed reference data~~ ✓ (canonical `locations` / `purposes` still pending supervisor approval before seed)
2. ~~Google Sheets API service account setup, share each sheet~~ ✓
3. Ingestion Edge Functions — Bank Deposit first, then Customer Support, Customer File, Weekly Sales, Marketing Expense, Realtor Managers Weekly ← here
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
  - Migration 002 (`20260510000002_reference_tables.sql`) — reference tables + seed: `brands`, `locations` + aliases, `purposes` + aliases, `expense_categories`, `plot_types` (4 canonical seeded), `realtor_managers` (3 seeded), `customer_service_reps` (5 seeded with brand FKs), `complaint_categories` + aliases. RLS enabled, no policies (deferred to migration 006).
  - Workflow infrastructure: `MEMORY.md` baseline (6 files), this `PROGRESS.md`, critique-workflow integration plan all in place
  - `pgoperations` org → `shawnumo` collaborator path resolved the push 403

- **2026-05-10** — Schema phase end-to-end (migrations 003–007 written this session):
  - Migration 003 (`20260510000003_auth.sql`) — auth: `user_role` enum (admin/editor/viewer), `profiles` table (1:1 with `auth.users`), `handle_new_user` signup trigger, `prevent_role_self_change` BEFORE UPDATE trigger (catches what RLS WITH CHECK can't enforce), helpers `current_user_role()` / `is_admin()` / `is_editor_or_admin()` (SECURITY DEFINER + STABLE + pinned `search_path`), and profile RLS policies
  - Migration 004 (`20260510000004_fact_tables.sql`) — six fact tables: `marketing_expenses`, `bank_deposits`, `weekly_sales`, `customer_files`, `customer_support_logs`, `realtor_manager_weekly`. Common idempotency contract `(source_sheet, source_tab, source_row_id)` unique + `raw_row` jsonb + `quality_flags` jsonb. Foreign keys to reference tables `on delete set null` so canonical changes don't destroy facts.
  - Migration 005 (`20260510000005_aggregates.sql`) — minimum-viable aggregate set: `marketing_monthly`, `customer_support_monthly` (period × brand), `sales_by_location_monthly` (with the partial-index trick to keep the null-location bucket unique per period). More aggregates land per-panel during step 5+.
  - Migration 006 (`20260510000006_rls_policies.sql`) — RLS for reference / fact / aggregate: all `to authenticated`, anon role gets nothing. Reference tables admin-managed; fact + aggregate writes service-role-only.
  - Migration 007 (`20260510000007_dashboard_infra.sql`) — `data_quality_alerts` (editors + admins resolve), `narrative_cache` (service-role writes only, with `generator_version` for cache invalidation), `social_media_manual_entries` (editors + admins write, admins delete).
  - `supabase/functions/_shared/quality_flags.ts` — exported flag vocabulary (`unknown_location`, `unknown_purpose`, `fallback_category`, `missing_realtor`, `low_match_confidence`, `unparseable_plot_type`, `unparseable_date`, `null_sales_person`)

- **2026-05-10** — Phase 1 complete. Migrations 001–008 applied to live Supabase project (`hrmrqpkcvyjwxrehrgvq`) via the dashboard SQL editor. First-admin promotion exposed a bootstrap bug: the `prevent_role_self_change` trigger in migration 003 blocked the very first role assignment because `is_admin()` returns false when no admin exists yet (and `auth.uid()` is null in the SQL editor's postgres-role context). Fixed in migration 008 by short-circuiting the trigger when `auth.uid() is null` — that's only ever true for trusted server-side contexts since anon clients are filtered by the existing profiles RLS policies before the trigger runs. Smoke test passed: test user signed up via dashboard → `handle_new_user` trigger created profile row with `role='viewer'` → promotion to admin succeeded after 008. Public signup disabled in dashboard (Auth → Sign In / Up).

- **2026-05-10** — Phase 2 partial: Google Cloud + service account + Sheets auth path verified.
  - GCP project `pertinence-dashboard` created on the Pertinence Group Google account (clean project ID, no numeric suffix — name was free).
  - Google Sheets API enabled on the project.
  - Service account `dashboard-sheets-reader@pertinence-dashboard.iam.gserviceaccount.com` created with no project-level IAM role (sheet-by-sheet sharing handles auth — more secure).
  - JSON key downloaded, stored outside the repo. `SHEETS_SERVICE_ACCOUNT_EMAIL` + `SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` set in `.env.local`.
  - All 4 source sheets shared with the service account as Viewer + IDs captured in `.env.local`:
    - Marketing Fund Expense Sheet — `SHEET_ID_MARKETING_EXPENSE`
    - Bank Deposit Mirror — `SHEET_ID_BANK_DEPOSIT` (shared same-day after supervisor approved edit access)
    - MASTER SHEET- CUSTOMER SUPPORT — `SHEET_ID_CUSTOMER_SUPPORT`
    - Marketing Team Reporting Template — `SHEET_ID_REALTOR_MANAGERS_WEEKLY`
  - `scripts/smoke-test-sheets.mjs` created — Node `googleapis`-based reader, run via `pnpm smoke:sheets`. Verified against both Marketing Fund Expense and Bank Deposit Mirror `2026 LAND!A1:N5`.
  - Note for Phase 3: Edge Functions run on Deno, so the production ingest code will use a Deno-compatible auth approach (lightweight JWT signing or `npm:googleapis` import), not the Node `googleapis` package this smoke test uses.

- **2026-05-11** — Supervisor decisions captured (recorded in PROJECT_BRIEF.md + DESIGN_DECISIONS.md):
  - Bank Deposit `2026 LAND`: column A is the real transaction date; columns L (second `DATE`) and M (status field) are out of scope; `CLIENT  NAME` double-space header is intentional.
  - Customer Support panel default brand filter: PPL (confirmed, mirrors H1 PDF).
  - Marketing Expense `Category` dropdown: supervisor agreed to add it.
  - 2026 tab in Marketing Team Reporting Template: supervisor agreed to create it.
  - Test user deleted from `auth.users` — only the real admin remains.

## Current focus

**Draft canonical `locations` + `purposes` mappings from the live Bank Deposit data so the supervisor can review them.** Migration 002 ships the `locations` / `location_aliases` / `purposes` / `purpose_aliases` tables empty by design — they only get seeded after supervisor approval. Once approved, write migration 009 with the seed rows and then start Phase 3 (Bank Deposit ingest Edge Function).

## Next checkpoint

Canonical mapping drafts produced + sent to supervisor; then first ingest Edge Function (Bank Deposit) written + deployed + producing rows in `bank_deposits` with proper `source_row_id` idempotency.

## Open items waiting on supervisor

- [ ] Approve canonical `locations` + `purposes` mappings (draft in progress, pulled from live `2026 LAND` data).
- [ ] Add `Category` dropdown column to Marketing Fund Expense source sheet (supervisor agreed 2026-05-11; awaiting actual addition).
- [ ] Create 2026 tab in Marketing Team Reporting Template — Realtor Managers Weekly Report (supervisor agreed 2026-05-11; awaiting actual creation).

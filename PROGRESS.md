# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 2 complete — all 4 sheets shared, auth verified including Bank Deposit `2026 LAND`.** Ready for Phase 3 (Bank Deposit ingest Edge Function). Three schema observations on Bank Deposit need supervisor confirmation before final ingest code — see "Open items waiting on supervisor."

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
  - 3 of 4 source sheets shared with the service account as Viewer + IDs captured in `.env.local`:
    - Marketing Fund Expense Sheet — `SHEET_ID_MARKETING_EXPENSE`
    - MASTER SHEET- CUSTOMER SUPPORT — `SHEET_ID_CUSTOMER_SUPPORT`
    - Marketing Team Reporting Template — `SHEET_ID_REALTOR_MANAGERS_WEEKLY`
  - 4 of 4 source sheets shared with the service account as Viewer + IDs captured in `.env.local` (Bank Deposit was granted same-day after the supervisor approved edit access).
  - `scripts/smoke-test-sheets.mjs` created — Node `googleapis`-based reader, run via `pnpm smoke:sheets`. Verified twice: Marketing Fund Expense (`A1:F5` of first tab, Petty Cash Book September 2022 — sheet has history back further than 2026; ingest will need to handle the full tab list and filter by period name), then Bank Deposit Mirror `2026 LAND!A1:N5` returning real 2026 transactions.
  - **Schema findings on `2026 LAND` that diverge from PROJECT_BRIEF — need supervisor confirmation before ingest:**
    - PROJECT_BRIEF says `DATE.1` is column K. Observed: column K is empty (acts as a visual separator); the second `DATE` column is column L.
    - PROJECT_BRIEF says primary `DATE` defaults to month-start. Observed: rows 1–4 show real daily dates (`1/2/2026`, `1/3/2026`), not month-start. The defaulting pattern may show up further down — worth scanning before assuming.
    - Column M holds a status field (rows 1–2 show `ALERT SENT` and `MANAGER NOT FOUND`). Not in PROJECT_BRIEF. Looks like the source sheet is already maintaining its own data-quality flags — needs investigation before the dashboard's `data_quality_alerts` table starts duplicating that work.
    - Column I header is literally `CLIENT  NAME` with a double space. Named-column constants in ingest code must match exactly — do not whitespace-normalize the header lookup.
  - Note for Phase 3: Edge Functions run on Deno, so the production ingest code will use a Deno-compatible auth approach (lightweight JWT signing or `npm:googleapis` import), not the Node `googleapis` package this smoke test uses.

## Current focus

**Phase 3: Bank Deposit ingest Edge Function.** Cleanest source, financial source of truth, drives the ingest pattern every other source will follow. Before writing code, resolve the four `2026 LAND` schema questions above with the supervisor (or by reading further into the sheet — only the column-position question requires the supervisor; the others can be answered by inspection).

## Next checkpoint

First ingest Edge Function (Bank Deposit) written + deployed + producing rows in `bank_deposits` with proper `source_row_id` idempotency.

## Open items waiting on supervisor

From [PROJECT_BRIEF.md](PROJECT_BRIEF.md) "Open items still needing supervisor confirmation":

- [ ] Bank Deposit `2026 LAND` schema clarifications (4 questions): which column is the real transaction date (column L has a second `DATE` header; column K is empty); whether primary `DATE` (column A) really defaults to month-start (first 4 rows show real daily dates); what column M's status field (`ALERT SENT` / `MANAGER NOT FOUND`) represents and how it relates to the dashboard's `data_quality_alerts`; confirm the `CLIENT  NAME` double-space in column I is intentional.
- [ ] Approval for the canonical location/purpose mappings (the supervisor needs to review the draft before `locations` / `purposes` ref tables get seeded — that's why migration 002 ships those tables empty)
- [ ] Marketing Expense `Category` dropdown column added to source sheet (until then, ingest falls back to keyword-based auto-categorization with `fallback_category` quality flag)
- [ ] 2026 tab created in Marketing Team Reporting Template — Realtor Managers Weekly Report
- [ ] Confirm Customer Support panel default brand filter (currently planned: PPL, mirroring H1 PDF; toggle to RealVest or "all")

## Open items waiting on Shawn

- [ ] Clean up the test user (`delete from auth.users where email = '<test email>';` — cascade-deletes the profile row), so the only remaining account is your real admin.

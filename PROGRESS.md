# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 1 — Schema foundation: migrations 001–008 applied.** Migration 008 patched a bootstrap bug in the role-change trigger that surfaced when promoting the first admin. Ready to move to Phase 2 (Google Sheets service account + ingestion Edge Functions).

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

## Current focus

**Phase 2: Google Cloud project + service account for Sheets API access.**

Decisions locked this session:
- Fresh GCP project (NOT reusing the AMMS HR-dashboard project) — clean separation between the two Pertinence apps.
- Owned by a Pertinence org Google account (NOT Shawn's personal account) — project survives Shawn's departure / SIWES end.

Next session entry points:
1. Log into https://console.cloud.google.com with the Pertinence org account
2. Create a new project named `pertinence-dashboard` (or whatever the supervisor approves)
3. Enable the Google Sheets API on that project
4. Create a service account inside the project (suggested name: `dashboard-sheets-reader`); no project-level IAM role needed — sheet-by-sheet sharing is what grants access
5. Download a JSON key for the service account; store the email + private_key in `.env.local` for the smoke test, eventually as Supabase Edge Function secrets (`SHEETS_SERVICE_ACCOUNT_EMAIL`, `SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`) for production
6. Share each of the four source sheets with the service account email as Viewer:
   - Marketing Fund Expense Sheet
   - Bank Deposit Mirror
   - Customer Support Master Sheet
   - Marketing Team Reporting Template (Realtor Managers Weekly Report tab)
7. Paste the four sheet IDs (the long string in each sheet URL between `/d/` and `/edit`) so they can be wired up in code
8. Smoke-test: tiny Node script using `googleapis` that reads a few rows from one tab to confirm the auth path works before any Edge Function code is written
9. Then Phase 3: Bank Deposit ingest Edge Function (cleanest source, most important — the financial source of truth). Note: Edge Functions run on Deno, so the Phase-3 code will use Deno-compatible auth (`npm:googleapis` import or a lightweight JWT-signing approach) rather than the Node `googleapis` package the smoke test uses.

## Next checkpoint

Service account provisioned, all four source sheets shared, read-access smoke test green. After that we move into Edge Function code for the first ingest (Bank Deposit).

## Open items waiting on supervisor

From [PROJECT_BRIEF.md](PROJECT_BRIEF.md) "Open items still needing supervisor confirmation":

- [ ] Confirm `DATE.1` (column K) on `2026 LAND` is the real transaction date (default `DATE` defaults to month-start)
- [ ] Approval for the canonical location/purpose mappings (the supervisor needs to review the draft before `locations` / `purposes` ref tables get seeded — that's why migration 002 ships those tables empty)
- [ ] Marketing Expense `Category` dropdown column added to source sheet (until then, ingest falls back to keyword-based auto-categorization with `fallback_category` quality flag)
- [ ] 2026 tab created in Marketing Team Reporting Template — Realtor Managers Weekly Report
- [ ] Confirm Customer Support panel default brand filter (currently planned: PPL, mirroring H1 PDF; toggle to RealVest or "all")

## Open items waiting on Shawn

- [ ] Confirm access to a Pertinence org Google account that can create new GCP projects (or coordinate with whoever owns Pertinence's Google Workspace) before next session.
- [ ] After service account is created, paste the four source-sheet IDs into the next session (between `/d/` and `/edit` in each Google Sheets URL).
- [ ] Clean up the test user (`delete from auth.users where email = '<test email>';` — cascade-deletes the profile row) once Phase 2 starts, so the only remaining account is your real admin.

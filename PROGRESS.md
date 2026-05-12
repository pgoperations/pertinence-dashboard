# Progress Log

A session-by-session narrative of what's been built, what's in flight, and what's next. Companion to `git log` (which is the underlying audit trail). Updated at the end of every working session.

## Status

**Phase 3 complete — Bank Deposit ingest live on Supabase.** First successful end-to-end invocation 2026-05-12: 448 rows upserted into `bank_deposits`, 126 monthly × location buckets in `sales_by_location_monthly`, **zero unmatched purposes or locations** (Phase 2 alias seeds cover every value on `2026 LAND` today), 1 truly unparseable date row (real anomaly worth surfacing to the supervisor). Function deployed with `--no-verify-jwt` so cron and the eventual admin button can call it without per-request auth — fact-table writes are still service-role-only via the function's internal Supabase client. Next: Marketing Expense ingest, then Customer Support ingest. The Realtor Managers Weekly ingest is gated on the supervisor populating the duplicated `Realtor Managers Weekly Report 2026` tab.

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

- **2026-05-11** — Canonical mapping drafted, sent to supervisor, returned approved:
  - `scripts/dump-bank-deposit-canonicals.mjs` + `pnpm dump:canonicals` extract unique PURPOSE + LOCATION values from `2026 LAND` (601 data rows scanned).
  - `data/canonical_mappings_bank_deposit_draft.md` is the supervisor-review doc; final approved canonical list locked at **20 PURPOSE** (27 raw variants in) + **24 LOCATION** (24 raw variants, no merges — Ire Mowe vs Ire Mowe Extension and Lavida Hills vs Lavida Prime confirmed distinct).
  - Security/Clearing sub-question resolved same day: Security Fee and Clearing Fee are conceptually distinct canonicals, but both 2026 source rows (`SECURITY FEE` and `SECURITY FEE / CLEARING FEE`) alias to "Security Fee" — treated as the same entity for this instance. Clearing Fee canonical created with no source-data alias yet; `CLEARANCE FEE` pre-seeded per supervisor spelling preference.

- **2026-05-11** — Migration 009 written and applied (`20260511000009_seed_canonicals.sql`):
  - Seeds `locations`, `location_aliases`, `purposes`, `purpose_aliases` from the approved list. Idempotent: `on conflict (name) do nothing` on canonicals, `on conflict (lower(alias)) do nothing` on aliases, alias FKs resolved via join on `name`.
  - Applied via Supabase SQL editor on the live project. Verification query returned `locations=24, location_aliases=24, purposes=20, purpose_aliases=28` — counts match exactly. Phase 2 fully closed.

- **2026-05-12** — Phase 3 deploy + first live ingest, plus two real-data fixes:
  - Migration 010 first invocation tripped Supabase's `safeupdate` extension on the unqualified `DELETE` inside `refresh_sales_by_location_monthly()` — even though the statement was wrapped in a `SECURITY DEFINER plpgsql` body. Migration 011 (`20260512000011_fix_aggregate_refresh_truncate.sql`) swaps `DELETE` for `TRUNCATE` which is the correct primitive anyway (faster, no MVCC overhead) and sidesteps the safety net by design.
  - First successful invocation revealed `unparseable_date: 397` (89% of rows). Root cause: (a) supervisor's ledger convention enters the date once per day and leaves column A blank for subsequent deposits on the same day; (b) ~60 dates are typed as text (`"13/01/2026"`, D/M/YYYY Nigerian convention) instead of as real date cells. Fixes shipped in the Edge Function:
    - `sheetsAuth.ts` now exports `parseDmyTextDate()` and a unified `parseSheetDate()` that tries serial-number first, then D/M/YYYY text. Calendar validation (`new Date(...)` round-trip) rejects Feb-30-style garbage.
    - `ingest-bank-deposit/index.ts` carries a `lastValidDate` across rows. Empty column A → forward-fill from the most recent parsed date. Non-empty but unparseable → flagged with `unparseable_date` and NOT forward-filled (so typos can't silently inherit a neighbouring date). Response payload now includes `forwardFilledDateCount` for ops triage.
  - Second invocation after the date fix: 448 rows, 126 aggregate buckets, `flagCounts.unparseable_date=1` (down from 397), `flagCounts.null_sales_person=253` (matches the brief's "~56% null SALES PERSON" prediction exactly: 253/448 = 56.5%), `forwardFilledDateCount=497` (counts forward-fills on data + blank rows; slightly noisy but a useful signal that the supervisor's date convention is heavy).
  - 6 duplicate TRANS CODES detected and disambiguated with `-row{N}` suffix (`SR-00168`, `PPL-00994`, `J-1151`, `PPL-01062`, `J-1156`, `PPL-01086`) — neither row in any pair lost.
  - 24 rows had blank TRANS CODE and got the `row-{N}` fallback id. Grep-able for ops follow-up.
  - Function deployed with `--no-verify-jwt`. Architectural rationale: the function is invoked by cron and an eventual admin-only "Refresh now" button; both contexts have no per-request user identity that matters. Internal auth still hard: service-role secret for DB writes, service-account JWT for Google Sheets. Captured in DESIGN_DECISIONS.md.
  - RLS verified working as intended: bank_deposits / sales_by_location_monthly are unreadable via the publishable (anon) key. Eyeball-level verification requires SQL editor or a signed-in admin JWT — not a regression, it's the correct posture for fact tables.

- **2026-05-11** — Phase 3 Bank Deposit ingest written (not yet deployed):
  - Decisions captured in DESIGN_DECISIONS.md → "Ingest Edge Function rules": Deno `crypto.subtle` for JWT sign, `UNFORMATTED_VALUE` Sheets render, TRANS CODE → `row-{N}` fallback for `source_row_id`, aggregate refresh via Postgres function called by RPC.
  - Header row of `2026 LAND` re-verified via the existing smoke script — confirmed columns A=`DATE`, B=`BANK STATEMENT DETAILS`, C=`AMOUNT`, D=`BANK ACCOUNT`, E=`PURPOSE`, F=`LOCATION`, G=`ACCOUNT PAYMENT NAME`, H=`TRANS CODE`, I=`CLIENT  NAME` (double space), J=`SALES PERSON`, K blank, L second `DATE`, M status (`ALERT SENT`).
  - `UNFORMATTED_VALUE` rendering confirmed via a throwaway one-shot: dates return as serial numbers (e.g. row showing `1/2/2026` D/M/YYYY came back as `46054` = 2026-02-01), amounts as numbers. Sheet locale is D/M/YYYY (Nigerian convention) but the Edge Function math is locale-free.
  - Migration 010 (`20260511000010_refresh_sales_aggregates.sql`) — `refresh_sales_by_location_monthly()` Postgres function: DELETE + INSERT GROUP BY inside a single plpgsql body, SECURITY DEFINER, search_path pinned. Returns row count. Granted to `service_role`. **Not yet applied** — pending SQL-editor run.
  - `supabase/functions/_shared/sheetsAuth.ts` — RS256 JWT sign via WebCrypto (`crypto.subtle.importKey` on PKCS8, `crypto.subtle.sign` with `RSASSA-PKCS1-v1_5`), token exchange against `oauth2.googleapis.com/token`, `readSheetValues()` helper (always uses `UNFORMATTED_VALUE` + `SERIAL_NUMBER`), `sheetsSerialToIsoDate()` helper (Lotus 1-2-3 epoch math).
  - `supabase/functions/_shared/canonicalLookup.ts` — loads `location_aliases` + `purpose_aliases` once per invocation into `Map<lower(alias), id>`; `lookupCanonical()` returns null for misses so the caller can emit `unknown_*` flags.
  - `supabase/functions/ingest-bank-deposit/index.ts` — main function. Named-column constants (`COL.DATE=0` etc.), `raw_row` preserves all 10 in-scope columns, dedup pass appends `-row{N}` to disambiguate duplicate TRANS CODES so neither row is silently lost, chunked upsert (500/chunk; ~426 YTD rows fit in one), `rpc('refresh_sales_by_location_monthly')` at the end. Response JSON tallies `rowsRead`, `rowsUpserted`, `blankSkipped`, `fallbackRowIdCount`, `duplicateTransCodes`, `flagCounts`, `aggregateRowsInserted`.

## Current focus

**Phase 3 closed. Picking up Marketing Expense ingest next.** Bank Deposit ingest is live and producing correct buckets; the two outstanding follow-ups for that source (schedule wiring + admin button) are panel work, not ingest work, so they land after the React scaffold (step 4 of the roadmap).

## Next-session entry points

1. **Investigate the 1 unparseable_date row** — pull it via SQL editor (`select * from public.bank_deposits where quality_flags ? 'unparseable_date';`) and either fix the source-sheet cell or surface to the supervisor as a real anomaly.
2. **Marketing Expense ingest scaffolding** (`supabase/functions/ingest-marketing-expense/`):
   - Supervisor will have added the `CATEGORY` column (per the dropdown plan in the previous session). Once present, parser reads E (Date) / F (Description) / G (Total) / H (CATEGORY) on the Expenditure side, and A (Date) / B (Description) / C (Amount) on the Income side, one tab per month.
   - Period anchor (period_year, period_month) comes from the tab name via `public.parse_month_year()` — DESIGN_DECISIONS rule.
   - Need migration 012 to seed `expense_categories` with the 11 H1 canonicals (`Stakeholders Meeting`, `MSME Campaign`, `Digital Ad Campaign`, `Corporate Marketing`, `Realtor Activity`, `SettleQuick`, `Realtor Manager Airtime`, `SMS Purchase`, `Genius`, `Social Media`, `Miscellaneous`).
   - Until the supervisor backfills CATEGORY on existing rows, fall back to keyword matching against `Description` and emit `fallback_category` per the quality-flag vocabulary.
3. **Customer Support ingest** comes after Marketing Expense — needs the alias mapping for `complaint_categories` (typos like "Documentaion") which is still un-seeded.
4. **Realtor Managers Weekly ingest** is unblocked at the structural level (supervisor duplicated the tab) but needs a one-time inspection pass to pin every named-cell position before code lands — the wide pivot needs unpivoting at ingest time.

## Open items waiting on supervisor

- [ ] Add `Category` dropdown column to Marketing Fund Expense source sheet (supervisor agreed 2026-05-11; awaiting actual addition).
- [ ] Create 2026 tab in Marketing Team Reporting Template — Realtor Managers Weekly Report (supervisor agreed 2026-05-11; awaiting actual creation).

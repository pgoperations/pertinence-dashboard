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

- **2026-05-14** — Marketing Expense ingest scaffolded (not yet deployed):
  - Both supervisor unblockers verified delivered via `scripts/inspect-sheet-structure.mjs` (new in this session — a generic tab-lister + range-dumper used to ground all subsequent code in real sheet shape). CATEGORY column at H on Jan–May 2026 tabs; `_Categories` tab holds the 11 H1 canonicals exactly. New `2026 Realtors Managers Weekly Report` tab exists with 3 month blocks (wide pivot: 8 cols/month = label + 5 weeks + total + gap).
  - Migration 012 (`20260514000012_seed_expense_categories.sql`) seeds `expense_categories` with the 11 H1 canonicals + `display_order`. Idempotent on `name` conflict. No alias table: typo / pre-dropdown values route through the TypeScript keyword fallback instead, keeping all category-mapping logic in one place.
  - Migration 013 (`20260514000013_refresh_marketing_monthly.sql`) ships `refresh_marketing_monthly()` — TRUNCATE-then-INSERT pattern locked in by migration 011, with two CTEs (`totals` for period-level income/expenditure, `by_cat` for the per-category breakdown) and a correlated scalar subquery into `jsonb_object_agg(expense_category_id::text, cat_total)` for the `by_category` jsonb map. v1 ingest only writes `entry_type='expenditure'` rows, but the function computes `total_income` via FILTER so it's forward-compatible if income ingest ever lands.
  - `supabase/functions/_shared/parseMarketingTab.ts` — `parseMarketingTabName()` (year/month from tab title, only `INGEST_YEARS` opt-in — currently `{2026}`), `findExpenditureHeader()` (scans first 10 rows for the `Date|Description|Total|Category` quad; verified consistent at row 4 across Jan/Feb/May 2026). Necessary because rows 1–3 carry stale "Petty Cash Book August" title text on every duplicated tab.
  - `supabase/functions/_shared/categoryFallback.ts` — 10 conservative keyword rules (most-specific first: SettleQuick → Genius → Realtor Manager → SMS → MSME → Stakeholders → digital-ad platforms → Social Media → Realtor → Market Storm). Anything unmatched falls to Miscellaneous. Every fallback-categorized row carries `fallback_category` in `quality_flags` with the rule that fired, so the data-quality view can grep them.
  - `supabase/functions/ingest-marketing-expense/index.ts` — discovers tabs dynamically via the new `getSheetTabs()` helper (added to `_shared/sheetsAuth.ts`), filters via `parseMarketingTabName()`, reads `A1:Q200` per tab, finds the header row, then parses each data row with forward-fill on `in_cell_date` (same convention as Bank Deposit since April 2026 mixes serial-number and D/M/YYYY-text dates). Summary rows (`Total`, `Balance c/f`, `Balance b/f`, `Balance b/d`) filtered out by description match. `source_row_id` is `exp-row-{N}` so future Income ingest can use `inc-row-{N}` without colliding on the unique constraint. Upsert + `rpc('refresh_marketing_monthly')`. Response payload tallies `tabsDiscovered`, `tabsIngested`, per-tab stats, `flagCounts`, `aggregateRowsInserted`.
  - Pending: apply migrations 012 + 013 via the Supabase SQL editor; deploy the function (`supabase functions deploy ingest-marketing-expense --no-verify-jwt` — same rationale as bank-deposit: cron + admin button, no per-request user identity).

- **2026-05-14** — Marketing Expense ingest deployed + first live run successful:
  - Migrations 012 + 013 applied via SQL editor.
  - First invocation needed `supabase secrets set SHEET_ID_MARKETING_EXPENSE=...` because only `SHEET_ID_BANK_DEPOSIT` was pushed in the previous session — a follow-up for every future ingest is to push its sheet-id secret as part of the deploy ritual.
  - Run stats: 22 tabs discovered, 5 ingested (Jan–May 2026), 94 rows upserted, 5 aggregate buckets, 0 unparseable dates, **94/94 rows flagged `fallback_category`** (every 2026 row has the dropdown blank, as expected from the inspection). Per-tab: Jan 13, Feb 29, Mar 20, Apr 26, May 6 rows. summarySkipped=2 on every tab (Total + Balance c/f filtered correctly).
  - Verification script `scripts/verify-marketing-ingest.mjs` added + wired to `pnpm verify:marketing`. Reads `marketing_monthly` + `marketing_expenses` and prints (a) per-month buckets, (b) category × month matrix with row counts + totals, (c) up to 5 sample descriptions per category so the keyword-rule choices can be spot-checked. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, which is NOT currently set there (RLS blocks anon reads on fact tables) — supervisor must paste it locally before running, or run the equivalent SQL in the dashboard editor.

- **2026-05-14** — Customer Support canonical dump generated for supervisor review (`data/customer_support_canonical_inputs.md`):
  - Three decisions locked before the dump: (a) ingest **all dates** (no year filter — dashboard date range handles display, mirrors the H1 PDF's 2025 baseline), (b) **dump-then-approve workflow** identical to Bank Deposit canonicals, (c) only the **5 active reps** per `Rep_ID` (CATHERINE / MARIAM / MARY / YETUNDE / LOVINAL) — ABIDEMI and VICTORIA tabs ignored.
  - Dump stats: **10,214 populated rows scanned** across the 5 reps (CATHERINE 1809, MARIAM 1993, MARY 2005, YETUNDE 1855, LOVINAL 2552 — Lovinal is by far the largest log). **329 unique "Nature of Complaint" values, 39 unique channels, 12 unique statuses.** Lovinal has 137 unique complaint values (vs Mary's 41) — large free-text variation that the supervisor probably wants to collapse aggressively. Channels and Status are NOT planned for canonical mapping (stored as text on `customer_support_logs`); they're in the dump for the supervisor to eyeball for typo cleanup.
  - **Major design question for the supervisor**, surfaced in the dump but not pre-decided here: **composite multi-category cells**. Many rows hold values like `"Documentaion, Site Allocation"` or `"Semi-finished Delivery, Conversion to Land, Refund"`. The `customer_support_logs` schema today has a single `complaint_category_id` FK — composites don't fit. Three options for the supervisor to pick: (i) split into multiple `customer_support_logs` rows (one per category — increases row count), (ii) take the first category as primary + flag the row, (iii) treat composites as their own canonicals (rejected here — combinatorial explosion).
  - **Obvious typo clusters already visible** (won't need supervisor judgment): "Documentation" / "Documentaion" (one canonical, two aliases); "General Enquiry" / "General enquiries" / "Enquirires" / "Enquiry about plot status"; "Special Task" / "Special task"; "Adit" / "Audit"; "Futher payment on proprerty" / "Further payment"; "Authorisation" / "Authorization".
  - Script wired to `pnpm dump:cs-canonicals` for re-runs as the supervisor edits the source sheet.

- **2026-05-14** — Bank Deposit unparseable_date row investigated + closed without code change:
  - Row `PPL-00979` carried `DATE = "31/03/3036"` — supervisor typed year 3036 instead of 2026. `parseDmyTextDate` rejects years > 2100 (the existing guard), so the row got `unparseable_date` correctly. Action sits with the supervisor: fix the cell on the source sheet to `31/03/2026`. Next scheduled (or manual) ingest run will pick it up cleanly. No code change.

- **2026-05-14** — Customer Support ingest scaffolded (awaiting supervisor canonical seed before deploy):
  - **Composite strategy locked**: split into multiple `customer_support_logs` rows. Supervisor's reasoning — when a customer lodges multiple complaints in one log entry, each deserves its own row for accurate panel counts.
  - **Quality-flag vocabulary extended**: `UNKNOWN_COMPLAINT_CATEGORY` added to `_shared/quality_flags.ts`. Fires when "Nature of Complaint" had a non-empty value that didn't match any seeded alias. Empty Nature cells are NOT flagged — absence is its own state.
  - `_shared/canonicalLookup.ts` gained `loadComplaintAliases()` and `loadActiveCustomerServiceReps()` (returns lower-case-name → { id, brand_id } map for case-insensitive tab-name → rep_id resolution).
  - `_shared/parseCustomerSupport.ts` ships column constants for the A–N CS region (cols O–Q "resolution time" + R–AC "special tasks" deferred), the 5-rep tab list, and a quote-aware `splitComposite()` that respects `"…, …"` quoted single-category values.
  - `supabase/functions/ingest-customer-support/index.ts` — iterates the 5 active rep tabs, parses each row, splits composite Nature cells into N log rows with `source_row_id = row-{N}-{i}` (1-indexed split position), reuses the Bank Deposit date primitives, upserts in 500-row chunks, RPC-calls `refresh_customer_support_monthly`. Bails up-front with a clear error if any tab name fails to resolve to an active rep.
  - Migration 014 (`20260514000014_refresh_customer_support_monthly.sql`) — `refresh_customer_support_monthly()` RPC, TRUNCATE pattern, aggregate grain `(year, month, brand_id)`. Joins `customer_support_logs` → `customer_service_reps` for brand. **`resolved_count` defaults to strict `lower(trim()) = 'resolved'`** — RESPONDED is treated as "answered but not closed" and excluded. Supervisor can override in a follow-up migration if they want RESPONDED counted. `avg_resolution_minutes` is null in v1 (cols O–Q not yet read; supervisor input needed on time-zone / business-hours math).
  - **Migration 015 reserved** for the supervisor-approved `complaint_categories` + `complaint_aliases` seed. Until 015 lands, every ingested row will carry `unknown_complaint_category` — expected and correct first-deploy behaviour.
  - **Known v1 limitation**: no stale-row sweep. If the supervisor edits a composite cell from `A, B` to just `A`, the old `row-N-2` (B) record stays in the DB and would be counted by the panel. Documented in the function header; add a per-tab `delete where source_row_id not in (...)` sweep if it causes real issues.

- **2026-05-14** — CS canonical mapping draft sent for supervisor review:
  - Migration 014 applied to live project. `refresh_customer_support_monthly()` function exists; will return 0 inserted rows on first call (logs table is empty until ingest runs after 015).
  - `data/canonical_mappings_customer_support_draft.md` proposes the boiled-down canonicals from the 329 raw values, with 7 explicit decision points for the supervisor.

- **2026-05-14** — CS canonical mapping approved + migration 015 written:
  - Supervisor decisions: UK spelling on `Authorisation`; OneApp vs Realvest App kept separate; "Special Request — Documents" name accepted; Birthday Messages kept (part of CS comms); long-tail singletons (Default / Default Waiver / Downtime / ETRAC / Farmwey / Edificio) each promoted to own canonical; nothing missing. Change of Plot vs Change of Plot Size returned blank — defaulted to "kept separate" per the proposal (easy to merge later if needed).
  - **Final canonical count: 60** — 11 typo-cluster merges (Documentation, General Enquiry, Audit, Special Task, Refund, Commission Payout, Follow-Up, Authorisation, Further Payment on Property, Product Pricing Complaint, Collection of Document/Receipt) + 40 distinct complaint categories + 3 "Special Request" sub-types + 6 promoted singletons. Aliases: ~80 entries, each `(canonical_name, raw_value)` pair joined to the canonical via `name` in the migration.
  - Aliases preserve case-sensitive source spellings; trim is handled by the ingest's lookup, so trailing/leading whitespace variants do not need their own rows. Double-space and intentional-typo variants (`New  Contract`, `Pick Up Of  Doucments/Recipts`, `Futher payment on proprerty`) DO have dedicated alias rows.
  - Migration 015 (`20260514000015_seed_complaint_categories.sql`) written and ready to apply. Same idempotency pattern as migration 009 (canonicals `on conflict (name)`, aliases `on conflict (lower(alias))`).

- **2026-05-14** — Customer Support ingest deployed + first run **completely clean**:
  - Migration 015 applied. Secret `SHEET_ID_CUSTOMER_SUPPORT` pushed. Function deployed `--no-verify-jwt`.
  - First-run response: **10,763 log rows upserted across 5 rep tabs, 26 aggregate buckets** (≈13 months × 2 brands). **Zero unparseable dates, zero unknown_complaint_category, zero quality flags fired.** Every complaint value — across 329 raw uniques + countless composite-split atoms — matched a seeded alias. Validates both the 60-canonical / ~80-alias mapping AND the quote-aware composite splitter.
  - Per-tab logicals → upserted (composite-split delta): CATHERINE 1,809 → 1,911 (+102, 98 composite rows); MARIAM 1,994 → 2,083 (+89, 83 composite rows); MARY 2,008 → 2,057 (+49, 49); YETUNDE 1,855 → 1,903 (+48, 46); LOVINAL 2,552 → 2,809 (+257, 224 — Lovinal's tendency to log multiple complaints per entry confirmed).
  - Total run wall-time: ~12 seconds for the full sheet read + 22 chunked upserts + aggregate refresh.

## Current focus

**Three ingests live and clean.** Bank Deposit (448 rows + 126 sales-by-location buckets), Marketing Expense (94 rows + 5 marketing-monthly buckets), Customer Support (10,763 rows + 26 cs-monthly buckets). Next on the roadmap: pick between (a) Customer File / Weekly Sales ingests (both on Bank Deposit Mirror — same source-sheet, additional tabs), (b) Realtor Managers Weekly ingest (aggregate-only per the locked design decision), or (c) start the React scaffold so the supervisor can see something. After three back-to-back ingest sessions, option (c) has the highest signal-to-effort for a supervisor demo.

## Next-session entry points

1. **Apply migrations 012 + 013** via Supabase SQL editor (live project `hrmrqpkcvyjwxrehrgvq`). Verify: `select count(*) from public.expense_categories;` returns 11. `select * from pg_proc where proname = 'refresh_marketing_monthly';` returns one row.
2. **Deploy + first-run the ingest function**: `supabase functions deploy ingest-marketing-expense --no-verify-jwt`, then `curl -X POST <function-url>`. Eyeball the response: confirm `tabsIngested=5` (Jan–May 2026), `flagCounts.fallback_category` ≈ rowsUpserted (because nothing is backfilled), and `aggregateRowsInserted=5` (one row per month).
3. **Spot-check a few categorizations** by joining `marketing_expenses` → `expense_categories` and grouping by category for May 2026. If any rule fires obviously wrong (e.g. "Gemini Subscription" landing somewhere bad — there's no rule for it, should fall to Miscellaneous), adjust `_shared/categoryFallback.ts` and re-deploy. The supervisor can also override per-row via the dropdown.
4. **Investigate the 1 leftover `unparseable_date` row** from Bank Deposit (still outstanding from 2026-05-12 session). Quick SQL: `select * from public.bank_deposits where quality_flags ? 'unparseable_date';`.
5. **Customer Support ingest** is next on the roadmap. Needs canonical mapping for `complaint_categories` (typos like "Documentaion") — a `data/canonical_mappings_customer_support_draft.md` similar to the Bank Deposit one, then migration 014 to seed.
6. **Realtor Managers Weekly ingest**: wide pivot confirmed (8 cols/month × N months) but the supervisor's tab does NOT carry per-manager breakdowns in the rows inspected — metrics are aggregate across all managers. Surface this to the supervisor before writing the ingest: either (a) per-manager attribution lives somewhere else on the tab we haven't found, (b) the data exists and is added per-row over time, or (c) v1 only ingests aggregate metrics with `realtor_manager_id` left null.

## Open items waiting on supervisor

- [x] Add `Category` dropdown column to Marketing Fund Expense source sheet — **delivered 2026-05-14**. Landed at column H on Jan–May 2026 tabs (those tabs went 26 → 27 cols; older tabs unchanged). A new `_Categories` tab holds the canonical list with all 11 H1 values matching the brief. Existing 2026 rows have CATEGORY blank — supervisor added the column but did not backfill, so `fallback_category` keyword matching is required as planned.
- [x] Create 2026 tab in Marketing Team Reporting Template — Realtor Managers Weekly Report — **delivered 2026-05-14**. Tab is named `2026 Realtors Managers Weekly Report` (note "Realtors" plural — different from the legacy `Realtor Managers Weekly Report` tab). Confirmed wide-pivot layout: each month block = label col + Week 1–5 + Total + gap col (8 cols per month). Three month blocks populated so far (Jan/Feb/Mar 2026). No per-manager breakdown visible in the top rows — that's a follow-up question for the supervisor before realtor managers ingest lands, but does not block Marketing Expense ingest.
- [ ] Surprise gotcha to flag on next supervisor sync: rows 1–3 of `May 2026` carry stale title text (row 1 = `"Marc"`, row 2 = `"Petty Cash Book August"`) — the tab was duplicated for May without updating the in-cell title. Headers live at row 4. Ingest will anchor on the header row, not assume row 1, so this is cosmetic only — but worth pointing out so it doesn't propagate into future months.

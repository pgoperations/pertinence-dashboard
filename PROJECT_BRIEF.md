I'm building an automated reporting dashboard for Pertinence Group as part of my SIWES internship. This is a complex, multi-source data consolidation project — the second major dashboard I've built for them after the HR staff dashboard.

## Context

The dashboard replaces a manually-built half-year PowerPoint report. It consolidates data across five departments (Marketing, Sales — Land, Realtor Management, Media & Content, Customer Support) from multiple Google Sheets into one live dashboard with a global date-range selector.

The output structure mirrors the existing H1 2025 PDF report (which I've reviewed and analyzed). The boss explicitly framed the goal as: "It's not going to be a presentation any longer — it'll be like a dashboard." His core principles, repeated multiple times in our requirements meeting:
1. One source of truth per data type
2. Reduce dependence on manually entered data wherever possible
3. The dashboard surfaces data discrepancies — it does NOT silently reconcile them

## Tech stack (locked)

- Frontend: React + Vite + Tailwind + Recharts on Netlify (GitHub auto-deploy)
- Backend: Supabase (Postgres + Auth + Edge Functions)
- Auth: Email/password
- Google Sheets ingestion: Service account + Google Sheets API (NOT Apps Script — burned hard on that in the prior dashboard)
- Refresh: Scheduled every 15 min + manual "Refresh now" button
- AI narratives: Rule-based templating (no paid APIs), pluggable for Gemini/Groq free tiers in Phase 2
- I edit code with Claude Code extension in VS Code

## Data sources

1. **Marketing Fund Expense Sheet** (Google Sheet, one tab per month e.g. "May 2026")
   - Petty cashbook with Income / Expenditure split
   - In-cell dates are unreliable — sheet name (e.g. "May 2026") is the authoritative period anchor
   - REQUIRES a `Category` dropdown column to be added by the supervisor (using the 11 H1 categories) before reliable ingest. Until then, fall back to keyword-based auto-categorization with low confidence flag.

2. **Bank Deposit Mirror** (Google Sheet, multi-tab):
   - `2026 LAND` — financial source of truth, ~426 valid txn rows YTD totaling ~₦621M
   - `2026 Weekly Sales Report` — plot counts by location/size; `PLOT TYPE` column embeds count e.g. "1 EXECUTIVE", "1 QUARTER"
   - `2026 Customer File` — customer-level sales, plot size in different format ("600SQM", "1 ACRE")
   - Date column on `2026 LAND`: column A (`DATE`) is the real transaction date (supervisor-confirmed 2026-05-11). Column L (second `DATE` header) and column M (status field) are out of scope — do not ingest. Column I header is literally `CLIENT  NAME` with a double space — intentional, match it exactly.
   - 27 PURPOSE variants normalize to ~10 canonical (typos like "OUTRIGHT D&D" vs "OUTRGHT D&D"; multiple "BUSINESS REP. REG" punctuation variants)
   - 24+ LOCATION variants need canonical mapping
   - ~56% of rows have null SALES PERSON — these go into an "Unattributed" bucket in revenue views (visible, not hidden)

3. **Customer Support Master Sheet** (Google Sheet, one tab per rep):
   - All 5 active reps in scope: Catherine, Mariam, Mary, Yetunde, Lovinal (per `Rep_ID` tab)
   - Brand attribution comes from `Staff_Reference` tab: Catherine/Mariam/Mary → PPL (`@pertinenceproperties.com`); Yetunde/Lovinal → RealVest (`@realvest.ng`)
   - Brand becomes a filter dimension in the UI, NOT a hard exclusion at ingest. Default the customer support section's brand filter to "PPL" on first load (mirrors H1 PDF structure), with toggle for RealVest or "all".
   - Each rep tab: ~31 columns covering complaint logs, channels, resolution times
   - "Nature of Complaint" has typos (e.g. "Documentaion") — needs canonical mapping

4. **Marketing Team Reporting Template — Realtor Managers Weekly Report tab (2026)** (Google Sheet)
   - Supervisor will create the 2026 tab parallel to my work
   - Source for realtor manager metrics (Mrs Kemi, Richard Makava, Debbie — configurable roster)

5. **OneApp data** (AWS-backed) — PHASE 2. Panel greyed out with "data source pending".

6. **Social media** — Phase 1 manual entry forms for: PG (FB/IG/YT), PPL (FB/IG), RealVest (FB/IG), Genius (IG only). APIs are Phase 2.

## Schema rules

**Plot types (4 only):**
- Starter = 300 SQM
- Classic = 450 SQM
- Executive = 500 or 600 SQM
- Special = anything else (includes sub-300 like 150SQM, "1 QUARTER", "1 ACRE", and any unrecognized size)

**Plot type parser** must handle two conventions:
- Weekly Sales: "1 EXECUTIVE" / "1 QUARTER" → parse `(count, type_word)` then map
- Customer File: "600SQM" / "1 ACRE" → parse `(count, sqm_or_label)` then map

**Reference tables** (low-churn config):
locations, purposes, expense_categories, plot_types, realtor_managers, customer_service_reps (with brand + active flag), social_brands, complaint_categories

**Fact tables** (ingested):
marketing_expenses, bank_deposits, weekly_sales, customer_files, customer_support_logs
Each row carries `source_row_id` for traceback and `quality_flags` jsonb for ingest-time annotations (missing_realtor, unknown_location, fallback_category, etc.)

**Derived / cached tables**: monthly aggregates per section, refreshed on each ingest run

**Dashboard infra tables**: users, narrative_cache (keyed by section + period), social_media_manual_entries

## Five dashboard sections (mirror the H1 PDF structure)

1. **Marketing** — budget summary, distribution by activity (table + donut), monthly cost (table + line), activities table, narrative
2. **Sales (Land)** — plots by location × size, sales by location (payable vs received), month-on-month, Q1 vs Q2, realtor sale tier breakdowns, top-selling locations, narrative. OneApp panel greyed out.
3. **Realtor Management** — recruitment metrics, attendance, per-manager performance with configurable roster, newly onboarded realtors
4. **Media & Content** — per-brand × per-platform metrics from manual entry, narrative
5. **Customer Support** — enquiries by channel, complaints by category, resolution rates, narrative. Brand filter (PPL / RealVest / all), defaults to PPL.

Plus global date-range selector driving all sections.

## Critical design rules

- Named column constants in ingest code, never positional indexes (this burned us last time on the HR dashboard)
- Fuzzy realtor name matching uses a configurable similarity threshold; matches BELOW threshold are surfaced as "needs review" — never auto-merged
- Every fact row preserves source data; quality flags annotate, not overwrite
- Every panel timestamps "as of [datetime]" — especially manually-entered ones
- Discrepancies between Bank Deposit and Weekly Sales (the OJ Awumi-style ₦117M vs ₦54M case the boss showed) are SURFACED as data-quality alerts, not reconciled into one number
- Mobile-readable (supervisor checks dashboards on his phone)

## Build order

1. Supabase project setup, migrations, RLS, seed reference tables with canonical mappings
2. Google Sheets API service account setup, share each sheet with service account email
3. Ingestion Edge Function — Bank Deposit first (cleanest, most important), then Customer Support, Customer File, Weekly Sales, Marketing Expense, Realtor Managers Weekly
4. React scaffold with auth, routing, layout, global date filter
5. Sales section first (most complex; pattern for the rest)
6. Marketing → Customer Support → Realtor Management sections
7. Media & Content with manual entry forms for the 4 brands
8. Rule-based narrative engine, per-section, cached per period
9. Manual refresh button, polish, Netlify deploy

## Open items still needing supervisor confirmation (raise but don't block on)

- Approval for the canonical location/purpose mapping (draft pending)
- Marketing expense `Category` column added to source sheet (supervisor agreed 2026-05-11; awaiting actual addition)
- 2026 tab created in Marketing Team Reporting Template (supervisor agreed 2026-05-11; awaiting actual creation)

## What I need first

Start by drafting the Supabase schema migrations: reference tables with seed data, fact tables, derived tables, and the auth/RLS setup. Show me the SQL for review before I run it. Then we'll move to the ingestion Edge Function for Bank Deposit as the first source.

I have three sample data files locally if you want to review them: marketing_expense.xlsx, bank_deposit.xlsx, customer_support.xlsx. Ask me to upload them when you need to inspect actual data shape
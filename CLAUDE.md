# Pertinence Dashboard — Claude working notes

Automated reporting dashboard for Pertinence Group. Replaces a manually-built half-year PowerPoint by consolidating five departments' data (Marketing, Sales–Land, Realtor Management, Media & Content, Customer Support) from multiple Google Sheets into one live dashboard with a global date-range selector.

## Read first, every session

These three files encode product decisions and current state that the codebase alone does not. Read top-to-bottom before responding to the first request:

1. [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — locked product brief. Stakeholders, data sources, build order, supervisor's non-negotiables.
2. [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) — locked schema and engineering decisions. Do not re-litigate unless explicitly asked.
3. [PROGRESS.md](PROGRESS.md) — session-by-session narrative of what's done, in flight, and next.

If any one is missing on a fresh session, note it once and continue.

## Supervisor's three non-negotiables

These came directly from the kickoff and govern every ingest and UI decision:

1. **One source of truth per data type.** Bank Deposit `2026 LAND` is the financial source of truth for sales revenue; Weekly Sales is for plot counts. Don't merge or average across sources to "smooth" numbers.
2. **Reduce dependence on manually entered data.** If a number can be derived from a primary record, derive it. Manual surfaces are explicit and timestamped "as of [datetime]".
3. **Surface discrepancies — never silently reconcile them.** When Bank Deposit and Weekly Sales disagree on the same period, both numbers are shown and a `data_quality_alerts` row is created.

Push back if a request would silently reconcile.

## Tech stack (locked)

- **Frontend:** React 18 + Vite + TypeScript (strict) + Tailwind v3 + Recharts → Netlify (GitHub auto-deploy)
- **Backend:** Supabase (Postgres 17, Auth, Edge Functions on Deno 2)
- **Google Sheets ingest:** service account + Sheets API v4 (NOT Apps Script). Production path uses native Deno `crypto.subtle` for RS256 JWT; local smoke scripts use Node `googleapis`.
- **Package manager:** pnpm

## Project layout

- `supabase/migrations/` — numbered SQL migrations, applied to live project via Supabase SQL editor
- `supabase/functions/<name>/index.ts` — Deno Edge Functions (ingests). Deploy with `--no-verify-jwt` (cron + admin button, no per-request user identity; internal service-role + service-account auth still enforced).
- `supabase/functions/_shared/` — code shared across ingest functions: `sheetsAuth.ts`, `canonicalLookup.ts`, `quality_flags.ts`, `cors.ts` (CORS headers + OPTIONS preflight + `jsonResponse()` helper — mandatory on every browser-callable function or `supabase.functions.invoke()` hangs at preflight; root cause of the 2026-06-01 Sync Sheets stall), plus per-source parsers
- `src/` — Vite React app. Shell live: auth ([hooks/useAuth.tsx](src/hooks/useAuth.tsx) + [components/ProtectedRoute.tsx](src/components/ProtectedRoute.tsx) + [pages/SignInPage.tsx](src/pages/SignInPage.tsx) with show/hide password toggle + **forgot-password flow (2026-06-04)**: SignInPage's "Forgot password?" mode calls `requestPasswordReset` (neutral anti-enumeration confirmation — only sends mail to existing, admin-provisioned accounts), the emailed recovery link lands on the public `/reset-password` route ([pages/ResetPasswordPage.tsx](src/pages/ResetPasswordPage.tsx)) which calls `updatePassword` then signs out and returns to sign-in with a success banner; both methods live on `useAuth`. **Requires `…/reset-password` in Supabase → Auth → Redirect URLs** (dev `localhost:5173` AND `5174` + the prod Netlify URL); Site URL should be the prod URL or the link silently falls back to it), routing ([App.tsx](src/App.tsx) — react-router v7), layout ([components/AppShell.tsx](src/components/AppShell.tsx) — header carries date-range chip + **Sync Sheets** button as the single data-freshness action; desktop sign-out moved to sidebar-bottom card; mobile keeps icon-only sign-out in header), global date filter ([hooks/useDateRange.tsx](src/hooks/useDateRange.tsx) + [components/DateRangePicker.tsx](src/components/DateRangePicker.tsx)), `useRefresh` hook ([hooks/useRefresh.tsx](src/hooks/useRefresh.tsx) — counter-bump context used by RepullButton to re-trigger every page's data-load `useEffect` after a sync completes; the standalone "Refresh" button was removed 2026-06-01 since Sync Sheets supersedes it), on-demand Sheets re-pull ([components/RepullButton.tsx](src/components/RepullButton.tsx) — invokes ALL 8 ingest Edge Functions in parallel via `supabase.functions.invoke()` (the original 6 + ingest-digital-marketing + ingest-media-weekly landed 2026-06-01), popover shows per-ingest progress/rowsUpserted/errors, bumps `useRefresh()` on completion). **Steps 8 + 9 of 10 done; only step 10 (polish + Netlify deploy) left.** Two complementary "freshness" paths: (a) pg_cron at 15-min cadence ([migration 019](supabase/migrations/20260601000019_schedule_ingest_cron.sql)) keeps Supabase silently up to date; (b) the Sync Sheets button is an on-demand override for "I just edited the sheet and want it now." **Sales (Land)** ([pages/SalesPage.tsx](src/pages/SalesPage.tsx)) — Hero "Total Revenue Inflow" + 4-tile KPI strip, MoM chart with Received-vs-Payable / Total-Revenue toggle, plots × size pivot, revenue-by-location bars with deal counts, Q1 vs Q2 paired bars, Top Realtors + Top 5 Deals (2-col), Weekly Detail card, three greyed blockers. **Marketing** ([pages/MarketingPage.tsx](src/pages/MarketingPage.tsx)) — Hero Total Marketing Spend + 4-tile strip (Categories Active / Busiest Month / Largest Category / Avg Monthly), Spend by Category bars with amber `Keyword-fallback 94/94` chip, Monthly Spend BarChart (violet fees stack on Sales), three greyed blockers (Billboard cost / Activities-with-metrics / Income side). Below that, **Digital Marketing sub-section** ([components/digital-marketing/DigitalMarketingPanel.tsx](src/components/digital-marketing/DigitalMarketingPanel.tsx)) — KPI strip (Total reach / Impressions / Leads / Spend with auto-derived effective CPL), Campaigns-by-spend list with per-metric drill, and Monthly Spend vs Reach paired bars (independently normalized to each metric's own max — shape-comparison only, the numeric header is the truth source). `mixed_campaign_weeks` rows surface as an amber chip per supervisor #3 (RESET-then-FARMWEY rotations on the same source sub-block). When a sub-block carries multiple campaigns across W1–W5 (e.g. May's MASTERCLASS 1 / 2 / 3 across W1 / W2-3 / W4-5), the parser emits one fact row per (campaign, metric) with only that campaign's weeks contributing — disambiguated in `source_row_id` by the Campaign Name header's sheet row. The drill replaces `cost_per_lead` and `cost_per_result_combined` with a derived `total cost ÷ total leads` (tagged "derived"), because summing per-week rate cells is mathematically meaningless. **Customer Support** ([pages/CustomerSupportPage.tsx](src/pages/CustomerSupportPage.tsx)) — BrandToggle (PPL default / RealVest / All), Hero Total Customer Logs + 4-tile strip (Enquiries / Complaints / Resolved / Resolution Rate), Logs by Channel bars, Complaints by Category bars with emerald-resolved overlay on slate-total, Monthly Trend stacked bars (enquiries brand-green / complaints slate-700 / resolved emerald-600), three greyed blockers. **Realtor Management** ([pages/RealtorManagementPage.tsx](src/pages/RealtorManagementPage.tsx)) — live data: Recruitment Metrics + Activity Measurement [MetricMonthlyTable](src/components/realtor-management/MetricMonthlyTable.tsx) (metrics × months × total, sticky-left col, row-drill on rows with subRows) + [RealtorMonthlyTrend](src/components/realtor-management/RealtorMonthlyTrend.tsx) (stacked bars New Referrals + New Business Reps = New Realtors, per-bar drill into all recruitment + activity metrics for that month) + three out-of-v1-scope `GreyedCard`s (Per-manager / Digital-ad newly onboarded / OneApp). Activity card renders one **"Weekly Realtor Meeting"** synthesized row merging `master_class_1` + `master_class_2` (per supervisor 2026-05-25); tap row → inline split. Stakeholders Meeting separate. Every chart drill-down follows one pattern: tap a tile/bar/row → inline DrillPanel with BreakdownList. **Rule-based narrative engine (step 8, 2026-06-04):** [lib/narrative/](src/lib/narrative/) holds one pure builder per section (`buildSalesNarrative` / `buildMarketingNarrative` / `buildCustomerSupportNarrative` / `buildRealtorNarrative` / `buildMediaNarrative`) that turns the already-loaded panel data + active date range into a `{ headline, points, caveats }` summary, rendered by [components/NarrativeCard.tsx](src/components/NarrativeCard.tsx) (accent-ruled "Summary" card with an "Auto" chip, tone-dotted insight bullets, an amber "Data notes" caveat block, "as of" timestamp). Placed under the hero KPI strip on Sales/Marketing/CS, at the top of Realtor, and inside MediaPanel (reflecting the selected brand). Generated **client-side, not cached per-period** — the global date-range selector makes per-month caching unusable and rule-based templating is free to recompute; `narrative_cache` (migration 007) stays reserved for Phase 2 AI narratives. Caveats honor supervisor #3: they surface unattributed-revenue %, unmapped-location receipts, keyword-fallback categories, realtor total-mismatches, and the CS exactly-'Resolved' rule rather than hide them. **Brand palette (rebranded 2026-06-01 evening — Pertinence Group logo dropped at [public/logo.png](public/logo.png)):** `accent` Tailwind token is brand green `#56B845` (sampled from the logo), with `accent.hover` `#3F8F32`, `accent.emphasis` `#2F6E25`, `accent.soft` `#E8F5E3`. Chart primary series swung from `#0369A1` sky-700 → `#56B845` brand green across all 14 chart components (KpiStrip / MoMChart / RevenueByLocation / QuarterPair / SpendByCategory / MonthlySpendChart / EnquiriesByChannel / CsMonthlyTrend / RealtorMonthlyTrend / DigitalMarketingPanel / MediaPanel + drill-panel `text-sky-800` → `text-accent-emphasis`); other semantic tones unchanged: slate-700 secondary, slate-400 muted/total, emerald-600 resolved/positive, violet-500 fees/third-tone, amber-600 in-progress/pending/total-mismatch chips. `StatusChip tone="sky"` + `StatusBanner tone="info"` deliberately stay sky — those encode "informational" semantics distinct from brand. Auth error banner stays red (true error, not info). SignInPage carries the logo + brand-green sign-in button; AppShell header replaces the "PG" placeholder box with `<img src="/logo.png">`, sidebar active state is `bg-accent text-white`, mobile bottom-nav active label is `text-accent`. `index.html` favicon + apple-touch-icon point at `/logo.png`; mobile status-bar `theme-color` is `#56B845`. Earlier note: the "color palette locked 2026-05-25" line that used to live here was the user's own working note, NOT supervisor sign-off — confirmed by user 2026-06-01 evening. Sidebar pinned with `sticky top-[93px]` matching its natural y position so it doesn't travel during scroll. Supabase client at [lib/supabase.ts](src/lib/supabase.ts) uses an in-memory auth lock (default navigator.locks hung on one user Chrome profile) and tab-scoped `sessionStorage` for auth persistence (closing the tab forces re-login; refresh stays signed in). [hooks/useAuth.tsx](src/hooks/useAuth.tsx) wraps `loadProfile` in a 4 s timeout and falls back to a session-derived `Profile` (`fallbackProfileFromSession`) if the `profiles` query stalls — fixes a "sign-in needs a page refresh before redirect" race observed on first sign-in of a tab. Top Realtors leaderboard merges same-person variants ("Ojewumi Victor" / "Victor Ojewumi" / "VICTOR OJEWUMI") via `nameFingerprint()` (sorted token set, punctuation-stripped, lower-cased) in [lib/queries/sales.ts](src/lib/queries/sales.ts); display name uses `formatPersonName` from [lib/format.ts](src/lib/format.ts) (Title Case for multi-token, leave single-token sentinels like STAFF/SMR/ASSETPLUS as-typed) and is applied consistently across TopRealtors / TopDeals / WeeklyDetail.
- `scripts/*.mjs` — Node helper scripts run via `pnpm`: smoke tests, canonical dumps, ingest verifiers
- `data/` — supervisor-review markdown drafts (canonical mappings, gitignored if sensitive — currently tracked)
- `docs/data-entry/` — handover data-entry standards for staff entering data into the source Google Sheets ([README](docs/data-entry/README.md)). Six files: `00-common.md` (everyone reads first) + one per active department. Authored 2026-05-29 against actual ingest `COL` constants so the doc reflects real ingest behaviour, not aspiration.
- `.env.local` — local secrets (Supabase URL/keys, service-account creds, sheet IDs). See [.env.local.example](.env.local.example).

## Hard rules — non-negotiable in code

- **Named column constants in ingest code, never positional indexes.** Burned us on the prior HR dashboard when the supervisor reshuffled columns. See `COL = { ... }` blocks in each `ingest-*/index.ts`.
- **Bank Deposit txn_date source is column L, not column A** (revised 2026-05-21, supersedes the 2026-05-11 decision). Column A is the bank's auto-paste — finance writes M/D/YYYY strings into a D/M/Y-locale sheet, so day/month get swapped on some entries (e.g. "01/06/2026" intended Jan 6 → serial June 1) and occasional year typos (3036). Column L is the supervisor's clean working ledger. Column A is used as a tail fallback ONLY for rows past the last L-non-blank row (when the supervisor's L lags the bank's auto-paste). Rows hitting the fallback get `date_fallback_to_a` quality flag. Both raw values are preserved in `raw_row` (`DATE A` + `DATE`).
- **Currency:** `numeric(15,2)`. Never float for money.
- **Every fact row carries `(source_sheet, source_tab, source_row_id)` unique + a full `raw_row` jsonb.** Re-runs upsert, never duplicate. Idempotency is contractual.
- **Quality flags vocabulary lives once** in [supabase/functions/_shared/quality_flags.ts](supabase/functions/_shared/quality_flags.ts). All ingests emit the same keys.
- **`CLIENT  NAME` (Bank Deposit col I) has an intentional double space** — match exactly.
- **Sheets reads use `valueRenderOption=UNFORMATTED_VALUE`** so dates come back as serial numbers and amounts as numbers — locale-free.
- **Aggregates are regular tables, NOT materialized views**, refreshed by Postgres functions called over RPC at the end of each ingest. Use `TRUNCATE` not `DELETE` (Supabase `safeupdate` blocks unqualified `DELETE`; migration 011 captures the rationale).
- **Mobile-readable is a hard constraint** — supervisor reviews on his phone. Every panel must work on a phone, not just shrink legibly.
- **Fact tables: no client write policies.** Only service role (Edge Functions) writes. Reads gated to authenticated users.
- **Every Edge Function must wire CORS.** Call `handlePreflight(req)` at the top of `Deno.serve` and return responses via `jsonResponse()` from [supabase/functions/_shared/cors.ts](supabase/functions/_shared/cors.ts). Server-to-server callers (pg_cron via pg_net) bypass preflight and would mask a missing handler — browser-side `supabase.functions.invoke()` will silently hang forever.

## Working commands

```
pnpm dev                     # Vite dev server (localhost only)
pnpm dev:lan                 # Vite dev server bound on 0.0.0.0 — share the Network URL it prints to anyone on the same LAN
pnpm build                   # tsc -b && vite build
pnpm test                    # vitest

pnpm smoke:sheets            # verify service-account can read a sheet
pnpm dump:canonicals         # extract unique PURPOSE/LOCATION from Bank Deposit 2026 LAND
pnpm dump:cs-canonicals      # extract unique complaint values from Customer Support tabs
pnpm verify:marketing        # read marketing_monthly + marketing_expenses, print by category
pnpm ingest:all              # manually re-pull all 6 ingests in parallel (CLI equivalent of the Sync Sheets button)
```

Supabase CLI commands (run from project root):
```
supabase functions deploy <name> --no-verify-jwt
supabase secrets set KEY=value      # push secrets per ingest (each needs its SHEET_ID_* secret)
```

## Live infra

- Supabase project ref: `hrmrqpkcvyjwxrehrgvq` (live, public signup disabled)
- GitHub remote: `pgoperations/pertinence-dashboard` (main = working branch, solo dev)
- Service account: `dashboard-sheets-reader@pertinence-dashboard.iam.gserviceaccount.com` (sheet-by-sheet sharing, no project IAM role)
- Migrations are applied to live via the Supabase dashboard SQL editor (no `supabase db push` workflow yet)

## Workflow notes

- **VS Code Claude Code extension only.** Use Bash/PowerShell and Edit/Write tools directly — don't hand the user mechanical work like "run X in your terminal" or "update line N to Y".
- **Push after every commit.** `git push` chains in the same step; standing authorization on this repo.
- **Self-critique every solution.** Red-team the happy path, question the approach, check security/RLS. Act on findings inline; surface to the user only when a decision needs them.
- **Apply [ui-ux-pro-max](skill) on every UI touch.** Mobile-readable is harder than typical responsive design here.
- **Higher-leverage gates:** Plan subagent before each non-trivial design choice; `/review` after each milestone ships; `/security-review` before merging Edge Functions to main (they hold the service-account key and bypass RLS).

## Out of scope / Phase 2

- OneApp data (AWS) — panel greyed out with "data source pending"
- Social media APIs — superseded 2026-06-01 by direct ingest of the Media Team Reporting tab's weekly grid (Facebook / Instagram / YouTube × 8 brands). Manual-entry forms are no longer needed for v1. APIs (Phase 2) would replace the manual sheet maintenance.
- Per-manager realtor performance — v1 ships aggregate-only metrics (see DESIGN_DECISIONS.md "Realtor Management panel scope")
- AI narratives — v1 ships the **rule-based client-side narrative engine** ([src/lib/narrative/](src/lib/narrative/), per-section builders + NarrativeCard); Phase 2 swaps in Gemini/Groq free-tier generation, cached in `narrative_cache`
- Media monthly summary block + YouTube Monetization Report (sits below the weekly grid on the source) — supervisor explicitly scoped v1 to the weekly grid only; the summary block is decorative.

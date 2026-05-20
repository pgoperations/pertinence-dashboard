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
- `supabase/functions/_shared/` — code shared across ingest functions: `sheetsAuth.ts`, `canonicalLookup.ts`, `quality_flags.ts`, plus per-source parsers
- `src/` — Vite React app. Shell live: auth ([hooks/useAuth.tsx](src/hooks/useAuth.tsx) + [components/ProtectedRoute.tsx](src/components/ProtectedRoute.tsx) + [pages/SignInPage.tsx](src/pages/SignInPage.tsx) with show/hide password toggle), routing ([App.tsx](src/App.tsx) — react-router v7), layout ([components/AppShell.tsx](src/components/AppShell.tsx)), global date filter ([hooks/useDateRange.tsx](src/hooks/useDateRange.tsx) + [components/DateRangePicker.tsx](src/components/DateRangePicker.tsx)). Sales (Land) panel — step 5 of 9 — Commits 1 + 2 live: KPI strip, MoM stacked-bar chart, plots × size pivot, revenue-by-location bars — all with inline drill-down (tap a KPI / month / row → see the per-purpose / per-plot-type breakdown that produced the number). Commit 3 (Q1/Q2 pair + greyed blocker cards) is the only Sales work remaining. Other four section pages are honest placeholders. Supabase client at [lib/supabase.ts](src/lib/supabase.ts) uses an in-memory auth lock (default navigator.locks hung on one user Chrome profile).
- `scripts/*.mjs` — Node helper scripts run via `pnpm`: smoke tests, canonical dumps, ingest verifiers
- `data/` — supervisor-review markdown drafts (canonical mappings, gitignored if sensitive — currently tracked)
- `.env.local` — local secrets (Supabase URL/keys, service-account creds, sheet IDs). See [.env.local.example](.env.local.example).

## Hard rules — non-negotiable in code

- **Named column constants in ingest code, never positional indexes.** Burned us on the prior HR dashboard when the supervisor reshuffled columns. See `COL = { ... }` blocks in each `ingest-*/index.ts`.
- **Currency:** `numeric(15,2)`. Never float for money.
- **Every fact row carries `(source_sheet, source_tab, source_row_id)` unique + a full `raw_row` jsonb.** Re-runs upsert, never duplicate. Idempotency is contractual.
- **Quality flags vocabulary lives once** in [supabase/functions/_shared/quality_flags.ts](supabase/functions/_shared/quality_flags.ts). All ingests emit the same keys.
- **`CLIENT  NAME` (Bank Deposit col I) has an intentional double space** — match exactly.
- **Sheets reads use `valueRenderOption=UNFORMATTED_VALUE`** so dates come back as serial numbers and amounts as numbers — locale-free.
- **Aggregates are regular tables, NOT materialized views**, refreshed by Postgres functions called over RPC at the end of each ingest. Use `TRUNCATE` not `DELETE` (Supabase `safeupdate` blocks unqualified `DELETE`; migration 011 captures the rationale).
- **Mobile-readable is a hard constraint** — supervisor reviews on his phone. Every panel must work on a phone, not just shrink legibly.
- **Fact tables: no client write policies.** Only service role (Edge Functions) writes. Reads gated to authenticated users.

## Working commands

```
pnpm dev                     # Vite dev server
pnpm build                   # tsc -b && vite build
pnpm test                    # vitest

pnpm smoke:sheets            # verify service-account can read a sheet
pnpm dump:canonicals         # extract unique PURPOSE/LOCATION from Bank Deposit 2026 LAND
pnpm dump:cs-canonicals      # extract unique complaint values from Customer Support tabs
pnpm verify:marketing        # read marketing_monthly + marketing_expenses, print by category
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
- Social media APIs — Phase 1 uses manual entry forms; APIs land in Phase 2
- Per-manager realtor performance — v1 ships aggregate-only metrics (see DESIGN_DECISIONS.md "Realtor Management panel scope")
- AI narratives use rule-based templating; pluggable for Gemini/Groq free tiers in Phase 2

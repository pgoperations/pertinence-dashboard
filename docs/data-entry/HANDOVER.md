<!-- markdownlint-disable MD025 -->
<!-- This guide intentionally uses two top-level "PART A / PART B" headings as
     major dividers between the non-technical and technical halves. -->

# Pertinence Dashboard — Handover & Operations Guide

**Purpose of this document:** everything needed to *use, maintain, and extend* the Pertinence
Dashboard without the original developer. If you are reading this, the person who built it has
likely moved on. Nothing here requires calling them.

This guide has two halves:

- **Part A — Operate** (no coding): for the supervisor / day-to-day owner. How to sign in, refresh
  data, read alerts, and handle the common things that go wrong.
- **Part B — Maintain & Extend** (technical): for whoever inherits the code. Architecture, the
  account/credential register, deployment, how the data pipeline works, and how to add or fix a
  data source.

> **Companion docs already in the repo** — read these alongside this one:
>
> - [`docs/data-entry/`](README.md) — rules for staff *entering* data into the
>   source Google Sheets. Hand these to the teams that own each sheet.
> - [`CLAUDE.md`](../../CLAUDE.md) — the engineering working-notes (deep detail, written for the AI coding assistant).
> - [`DEPLOYMENT_HANDOFF.md`](../../DEPLOYMENT_HANDOFF.md) — how the live site is hosted at
>   `pertinencegroup.com/pg-dashboard/` and how to rebuild + republish it (Part 3).
> - [`PROJECT_BRIEF.md`](../../PROJECT_BRIEF.md), [`DESIGN_DECISIONS.md`](../../DESIGN_DECISIONS.md),
>   [`PROGRESS.md`](../../PROGRESS.md) — *why* things are built the way they are.

*Last updated: 2026-06-18 — the dashboard is **live** at `https://pertinencegroup.com/pg-dashboard/`.*

---

# PART A — OPERATE (no coding required)

## A1. What this dashboard is

It is a live web dashboard that replaces the half-year PowerPoint report. It automatically reads
five departments' Google Sheets and shows the numbers on one screen with a date-range selector.

**Five sections:** Sales (Land) · Marketing (+ Digital Marketing) · Customer Support ·
Realtor Management · Media & Content.

**The golden rule the dashboard follows:** it *surfaces* data problems, it never silently "fixes"
them. If two sheets disagree, you'll see both numbers and an amber warning — that is by design, not
a bug. **Do not edit a sheet just to make the dashboard look tidy** — that hides a real problem.

## A2. How to sign in

1. Open the dashboard at **`https://pertinencegroup.com/pg-dashboard/`**.
2. Enter your email and password.
3. **Accounts are created by an administrator only** — there is no public "Sign up". If a new
   staff member needs access, an admin adds them (see §A6).
4. **Forgot your password?** Click *"Forgot password?"* on the sign-in screen, enter your email, and
   a reset link is emailed to you. The link only works for emails that already have an account.
5. Closing the browser tab signs you out (by design). A simple page-refresh keeps you signed in.

## A3. Keeping the data fresh

There are **two ways** the dashboard gets new data from the Google Sheets — you rarely need to do anything:

1. **Automatic, every 15 minutes.** A scheduled job pulls all sheets on its own. Any edit you make
   in a source sheet appears on the dashboard within ~15 minutes, no action needed.
2. **"Sync Sheets" button (top of the screen)** — use this when you edited a sheet *just now* and
   don't want to wait. It re-pulls the **current page's** data immediately and shows progress. The
   pop-up also has a **"Sync all 8 sheets"** option to refresh everything at once.

If a sync shows an error in the pop-up, see Troubleshooting (§A5).

## A4. Reading the dashboard

- **Date range** (top of screen): every number on every page obeys this. Presets include This
  month/quarter, Last 30 days, Year-to-date, 2026 quarters, halves (H1/H2), a single-month picker,
  and a custom range.
- **Automated insights ticker** (under the headline numbers): plain-English summary of the selected
  period. It auto-advances; hover to pause; use the arrows to step through.
- **Amber chips / "Note" lines:** these are *data-quality flags* — the dashboard telling you a value
  was unusual (e.g. a category it had to guess, revenue with no salesperson attached, two sources
  disagreeing). They are informational. The supervisor decides what, if anything, to fix at the source.
- **Brand toggles** (Customer Support, Media): switch between PPL / RealVest / All.
- Every panel can be opened on a phone — tap a tile/bar/row to drill in.

## A5. Troubleshooting — the five things most likely to happen

| Symptom | Most likely cause | What to do |
| --- | --- | --- |
| A number looks wrong / doesn't match the sheet | Someone left a cell blank or typed a date/number/plot oddly in the source sheet | Check the source sheet against the data-entry rules in [`docs/data-entry/`](README.md). Don't edit to "match" the dashboard. A developer can pinpoint the exact cause with the discrepancy runbook (§B12). |
| New sheet edit isn't showing | Auto-sync hasn't ticked yet (≤15 min), or the sheet tab was renamed | Press **Sync Sheets**. If still missing, a header/tab name may have changed — see §B7. |
| "Sync" shows an error for one source | The source sheet's structure changed, or it was un-shared from the service account | See §B5 (re-share) and §B7 (structure change). This is a developer task. |
| Can't sign in / no reset email | Account doesn't exist, or the email is mistyped | An admin must create or confirm the account (§A6). Reset emails are only sent to real accounts. |
| Whole dashboard won't load | The `pertinencegroup.com` website is down, or the database (Supabase) is in outage / billing lapsed | First check `pertinencegroup.com` itself loads (the dashboard files live on that same server — see §B2). Then check the Supabase project is active/paid. |

## A6. Adding or removing a dashboard user (admin task)

Users live in **Supabase** (the database/auth service), not in the code.

1. Sign in to Supabase (see §B2) → project `hrmrqpkcvyjwxrehrgvq` → **Authentication → Users**.
2. **Add user** → "Add user" → enter email + a temporary password (or invite). Public sign-up is
   intentionally disabled, so this is the only way in.
3. New users get the **viewer** role automatically. To make someone an **admin** or **editor**, open
   the SQL editor and update their row in the `profiles` table (roles: `admin`, `editor`, `viewer`).
   Ask your developer to run this if unsure — see §B6 for the exact query.
4. **To remove access:** delete the user under Authentication → Users.

## A7. Who owns what (so you know who to call)

The dashboard depends on a handful of online accounts. The full register with login locations is in
**§B2**. The short version:

- **Google account (Pertinence Group)** — owns the source Google Sheets *and* the Google Cloud
  project that lets the dashboard read them. Losing this account breaks data ingest. Keep it safe.
- **Supabase** — the database, logins, and the scheduled sync jobs.
- **GitHub** — stores the source code.
- **The `pertinencegroup.com` web server (WordPress/AWS)** — *hosts* the dashboard's static files
  under `/pg-dashboard/`. There is **no separate hosting account** (no Netlify/Vercel) — the website
  admin who manages `pertinencegroup.com` controls this. See [`DEPLOYMENT_HANDOFF.md`](../../DEPLOYMENT_HANDOFF.md).

**Keep all three online accounts' (Google, Supabase, GitHub) billing active and their passwords in
the company password manager.** The whole system is designed so that *no individual person* is a
single point of failure — but only if these account credentials are stored centrally, not in
someone's head.

---

# PART B — MAINTAIN & EXTEND (technical)

## B1. Architecture at a glance

```text
  Google Sheets (4 sheets)                Supabase (Postgres + Auth + Edge Functions)         Browser
  ─────────────────────────               ───────────────────────────────────────────        ────────
  Bank Deposit Mirror ─────┐
  Marketing Fund Expense ──┤   read via    8 ingest Edge Functions (Deno)                     React app
  MASTER - Customer Support├──────────────▶ pull → parse → upsert into fact tables ──┐        (Vite build)
  Marketing Team Reporting ┘  service-acct  then RPC-refresh aggregate tables          │ read  static files
                                            ▲                                          ▼  (anon
                              pg_cron fires every 15 min ──┘            Postgres tables (RLS-gated)  key)
                                            ▲                                          ▲
                              "Sync Sheets" button (manual) ───────────────────────────┘
```

- **Frontend:** React 18 + Vite + TypeScript + Tailwind v3 + Recharts. Built to static files and
  **published under `/pg-dashboard/` on the existing `pertinencegroup.com` (WordPress/AWS) server** —
  no Netlify/Vercel, and **not** auto-deployed from GitHub. A frontend change is a manual rebuild +
  republish (§B8 and [`DEPLOYMENT_HANDOFF.md`](../../DEPLOYMENT_HANDOFF.md)).
- **Backend:** Supabase — Postgres 17 (data + Row-Level Security), Auth (email/password), Edge
  Functions (Deno 2) for the ingests.
- **Data pipeline:** 8 ingest functions read Google Sheets via a **service account** (Sheets API v4,
  *not* Apps Script), write to fact tables, then refresh aggregate tables. Triggered two ways:
  pg_cron every 15 min, or the in-app "Sync Sheets" button.
- **Package manager:** pnpm.

## B2. Accounts & credentials register

> **No passwords or keys are stored in this file or anywhere in the git repo.** This table says
> *which* accounts exist, *who* owns them, and *where the secret lives*. The actual secrets belong
> in the **company password manager / a sealed credentials sheet** kept by the supervisor. A
> fill-in template is in §B11 — complete it once and store it securely, **never commit it**.

| # | Account / Service | What it's for | Login location | Where its secret/key lives |
| --- | --- | --- | --- | --- |
| 1 | **Google account — Pertinence Group** | Owns the 4 source Google Sheets *and* the Google Cloud project. Root of the data pipeline. | accounts.google.com | Password manager. This is the master account — protect with 2FA. |
| 2 | **Google Cloud project** `pertinence-dashboard` | Hosts the Sheets API + the service account. | console.cloud.google.com (under account #1) | Managed inside account #1. |
| 3 | **Service account** `dashboard-sheets-reader@pertinence-dashboard.iam.gserviceaccount.com` | The "robot" identity the dashboard uses to *read* the sheets. Has no project IAM role — access is granted by sharing each sheet with this email as Viewer. | n/a (a key file, not a login) | JSON key file, stored **outside the repo**. Its two fields are loaded into Supabase secrets as `SHEETS_SERVICE_ACCOUNT_EMAIL` + `SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` (see §B4). |
| 4 | **Supabase project** `hrmrqpkcvyjwxrehrgvq` | Database, Auth, Edge Functions, cron. | supabase.com — **only via "Login with GitHub"** (account #5); a native password is **not possible** (see §B2.1) | Access = GitHub (#5). Secure GitHub + add a 2nd org owner (§B2.1). API keys in Project Settings → API; service-role key is **secret** (full DB access). |
| 5 | **GitHub** `pgoperations/pertinence-dashboard` (org `pgoperations`) | Source code. **No auto-deploy** — the live site is published manually (§B8). **Also the login for Supabase (#4).** | github.com — `pgoperations@pertinencegroup.com` | Password held by the **Assistant General Manager**; put it in the company password manager + enable 2FA. |
| 6 | **`pertinencegroup.com` web server (WordPress / AWS)** | *Hosts* the dashboard's static files under the `/pg-dashboard/` path. There is **no separate hosting account** (no Netlify/Vercel). | Managed by whoever administers the `pertinencegroup.com` website. | n/a — controlled via the website admin. To update the site, hand them a rebuilt zip ([`DEPLOYMENT_HANDOFF.md`](../../DEPLOYMENT_HANDOFF.md)). |
| 7 | **Dashboard admin user** `pgoperations@pertinencegroup.com` | The first admin login *inside* the app (Supabase Auth user with `role = admin`). | the dashboard URL itself | Password manager. Manage other users from here (§A6). |

**The 4 source Google Sheets** (all owned by account #1, all shared with service account #3 as Viewer):

| Sheet (human name) | Feeds which ingests | Secret name (Sheet ID) |
| --- | --- | --- |
| Bank Deposit Mirror — tabs `2026 LAND`, `2026 Weekly Sales Report`, `2026 Customer File` | bank-deposit, weekly-sales, customer-file | `SHEET_ID_BANK_DEPOSIT` |
| Marketing Fund Expense Sheet — one tab per month | marketing-expense | `SHEET_ID_MARKETING_EXPENSE` |
| MASTER SHEET - CUSTOMER SUPPORT — one tab per rep | customer-support | `SHEET_ID_CUSTOMER_SUPPORT` |
| Marketing Team Reporting Template — Realtor Managers, Digital Marketing, and Media Team tabs | realtor-managers-weekly, digital-marketing, media-weekly | `SHEET_ID_REALTOR_MANAGERS_WEEKLY` |

> Only **4 distinct Sheet IDs** exist even though there are 8 ingests — several ingests read
> different tabs of the same workbook.

### B2.1 Securing the Supabase account (it is GitHub-only — here is the real fix)

Supabase confirmed (reset attempt, 2026-06-11) that this account is a **GitHub-linked identity and
cannot have its own password** — the only way in is "Login with GitHub". So Supabase access equals
GitHub access, permanently, for this login. You can't decouple them with a password; instead do these
two things so the database root isn't a single fragile login:

**A. Harden the GitHub account (#5) — it now *is* the Supabase key.**

1. Strong, unique password stored in the **company password manager**.
2. **Enable 2FA on GitHub and save the recovery codes** in the password manager. (Losing 2FA without
   recovery codes can lock you out of *both* GitHub and Supabase.)
3. Make sure GitHub's recovery email/phone is a **company-controlled** address, not a personal one.

**B. Add a second Supabase *organization* owner — this removes the single point of failure.**

1. Sign in to Supabase → **Organization settings → Team / Members**.
2. **Invite** a second trusted person as **Owner** (or Administrator). They sign in with *their own*
   GitHub — you are not sharing one login.
3. Now if the `pgoperations` GitHub is ever lost, another owner still has full access to the org and
   project.

The **dashboard admin user (#7) is unaffected** — that's the app's own Supabase Auth user, managed in
Supabase → Authentication → Users, and it has its own password independent of all this.

## B3. The 8 ingest functions

Each lives in `supabase/functions/<name>/index.ts`. All deployed with `--no-verify-jwt` (they're
called by cron and the admin button — no per-user identity; internal auth is still enforced via the
service-role key and the Sheets service account).

| Function | Source | Writes to | Aggregate refreshed |
| --- | --- | --- | --- |
| `ingest-bank-deposit` | Bank Deposit `2026 LAND` | `bank_deposits` | `sales_by_location_monthly` |
| `ingest-weekly-sales` | `2026 Weekly Sales Report` | `weekly_sales` | `plot_sales_monthly` |
| `ingest-customer-file` | `2026 Customer File` | `customer_files` | (none) |
| `ingest-marketing-expense` | Marketing Fund Expense (per-month tabs) | `marketing_expenses` | `marketing_monthly` |
| `ingest-customer-support` | MASTER - Customer Support (per-rep tabs) | `customer_support_logs` | `customer_support_monthly` |
| `ingest-realtor-managers-weekly` | `2026 Realtors Managers Weekly Report` | `realtor_metrics_monthly` | (in-function) |
| `ingest-digital-marketing` | Digital Marketing tab | `digital_marketing_*` | `digital_marketing_monthly` |
| `ingest-media-weekly` | Media Team Reporting tab | `media_weekly_*` | `media_weekly_metrics` |

**Shared code** in `supabase/functions/_shared/`: `sheetsAuth.ts` (RS256 JWT → Google token, sheet
reader), `canonicalLookup.ts` (alias→canonical maps), `quality_flags.ts` (the one flag vocabulary),
`cors.ts` (**mandatory** on every browser-callable function — missing it hangs the Sync button
forever), `yearTabs.ts` (auto-discovers `2027 …` tabs), `sweepStaleRows.ts` (post-upsert reconcile
— deletes any DB row the latest sheet read didn't produce, so deletions and duplicates self-heal on
the next sync; see §B12), plus per-source parsers.

## B4. Secrets the system needs (and where they live)

**Supabase Edge Function secrets** (set with `supabase secrets set KEY=value`):

- `SHEETS_SERVICE_ACCOUNT_EMAIL`, `SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` — the service-account key (#3).
- `SHEET_ID_BANK_DEPOSIT`, `SHEET_ID_MARKETING_EXPENSE`, `SHEET_ID_CUSTOMER_SUPPORT`, `SHEET_ID_REALTOR_MANAGERS_WEEKLY`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **auto-injected by the Supabase platform**; you do
  not set these yourself.

**Supabase Vault secrets** (for the cron jobs — set once via SQL, see migration 019 header):
`supabase_functions_base_url`, `supabase_anon_key`.

**Frontend env** (`.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Vite **bakes these
into the static bundle at build time** on the developer's machine, so the production deploy needs no
hosting-provider env panel — whatever is in `.env.local` when you run the build is what ships. They
are public by design (the anon key rides in the browser bundle; RLS protects the data).

Template: [`.env.local.example`](../../.env.local.example).

## B5. Routine maintenance tasks

**Re-share a sheet with the service account** (after the most common breakage — someone removed the
robot's access, or a sheet was duplicated to a new file):

1. Open the sheet in Google Sheets (as account #1).
2. Share → add `dashboard-sheets-reader@pertinence-dashboard.iam.gserviceaccount.com` as **Viewer**.
3. If it's a *new* file (new Sheet ID), update the matching `SHEET_ID_*` secret (§B4) and redeploy
   nothing — secrets take effect on the next function run.

**Manually run all ingests from your machine** (developer): `pnpm ingest:all` (needs `.env.local`).

**Check that cron is healthy** — in the Supabase SQL editor:

```sql
select jobname, schedule, active from cron.job where jobname like 'ingest-%';
select status, return_message, start_time from cron.job_run_details
  where jobid in (select jobid from cron.job where jobname like 'ingest-%')
  order by start_time desc limit 20;
```

**Inspect data-quality flags** (the things the amber chips count) — query the `quality_flags` jsonb
column on any fact table, or the `data_quality_alerts` table.

## B6. Managing users via SQL (the exact queries)

Promote a user to admin (run in Supabase SQL editor):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'person@example.com');
```

Roles: `admin` (manages reference data + users), `editor` (manual entry, resolve alerts), `viewer`
(read-only, the default). The `prevent_role_self_change` trigger stops users editing their own role.

## B7. When a source sheet changes shape (the #1 future break)

The ingests use **named column constants**, never positional indexes — but they still rely on the
header/tab names staying put. If a team renames a column, inserts a column, or renames a tab, that
ingest can silently read blanks.

To fix:

1. Identify which function (§B3) and open its `index.ts`. Look for the `COL = { ... }` block.
2. Compare against the live sheet (use `scripts/inspect-sheet-structure.mjs` to dump the real shape).
3. Update the column constant or header-detection logic, then redeploy:
   `supabase functions deploy <name> --no-verify-jwt`.
4. Re-run and confirm row counts look right.

**Prevention:** the [`docs/data-entry/`](README.md) standards tell the teams *not* to
rename headers/tabs without telling the dashboard owner. Keep those in front of staff.

**Note on `CLIENT  NAME`** (Bank Deposit col I) — that header has an **intentional double space**.
Don't "correct" it; the code matches it exactly.

## B8. Deploying

**Frontend (manual — there is no auto-deploy).** The live site is a folder of static files served at
`pertinencegroup.com/pg-dashboard/`; it does **not** rebuild from GitHub. To ship a frontend change:

1. Rebuild for the deploy path: `pnpm exec tsc -b` then `pnpm exec vite build --base=/pg-dashboard/`.
2. Stage `dist/` into a `pg-dashboard/` folder + the README, and zip it (the exact PowerShell is
   **Part 3 of [`DEPLOYMENT_HANDOFF.md`](../../DEPLOYMENT_HANDOFF.md)**).
3. Hand the zip to the `pertinencegroup.com` website admin to republish.

The URL path is compiled into the build (asset links + router `basename` + reset redirect), so these
files must be served at exactly `/pg-dashboard/` — a different path needs a rebuild with a matching
`--base`, not a folder rename. **Data and backend changes need no republish** — the browser reads
Supabase live, and Edge Functions/migrations deploy straight to Supabase (below).

**Edge Functions (manual):** `supabase functions deploy <name> --no-verify-jwt`. After deploying a
*new* function, also `supabase secrets set` its Sheet ID and add it to the cron schedule (migrations
019 + 022 pattern).

**Migrations:** SQL in `supabase/migrations/` is applied **by hand via the Supabase SQL editor**
(there is no `supabase db push` workflow). Apply new migrations in filename order.

## B9. ⚠️ Known gaps / finish before final handover

The project is **live (deployed 2026-06-18 at `pertinencegroup.com/pg-dashboard/`)**. Resolved items
are struck through below for the record; the rest remain open as of 2026-06-18:

1. ~~**SPA deep-link redirect missing.**~~ **Done.** The static deploy ships
   [`public/.htaccess`](../../public/.htaccess) (`RewriteBase /pg-dashboard/`) which falls any
   non-file `/pg-dashboard/*` request back to `index.html`, so deep-link refreshes don't 404 on the
   Apache/WordPress server. (The old Netlify `_redirects` idea is moot — there is no Netlify.)
2. ~~**Reset-password redirect URLs.**~~ **Done.** Supabase → Auth → URL Configuration now has Site
   URL `https://pertinencegroup.com/pg-dashboard` and `…/pg-dashboard/reset-password` in the
   allow-list. (This affects only the forgot-password email link, not sign-in.)
3. ~~**`ingest-media-weekly` 2027 carryover hand-edit.**~~ **No longer applies.** media-weekly was
   switched (2026-06-05) from fixed row offsets to per-year **tab discovery**
   (`discoverYearTabs`, regex `^(\d{4}) Media Team Reporting$`), so it auto-discovers
   `2027 Media Team Reporting` like the other ingests — no hand-edit needed.
4. **Re-deploy `ingest-digital-marketing`.** The 2027 tab-discovery edits (2026-06-05) shipped for
   most ingests when they were redeployed on 2026-06-11 with the stale-row sweep — **only
   `ingest-digital-marketing` is still not redeployed** with its carryover edit, and on 2026-06-18 its
   read-range ceiling was raised (1500 → 5000 rows) so future year-sections aren't truncated. Both
   land on the next `supabase functions deploy ingest-digital-marketing --no-verify-jwt`. Do it before
   year-end.
5. **Fill in the credentials template (§B11)** and store it in the company password manager.
6. **Secure the Supabase login (§B2.1).** It is GitHub-only and *cannot* take its own password —
   instead enable GitHub 2FA (save the recovery codes) and invite a 2nd Supabase org owner so the
   database root isn't a single GitHub account.

### B9.1 Known hardcoded assumptions (audited 2026-06-18)

A sweep for values that could rot as time/data move. The dangerous ones (the Digital Marketing row
ceiling; the Q1-vs-Q2 chart) were fixed on 2026-06-18. These remain — none is broken today, but know
where they are:

- **Fixed read-range row caps on two ingests.** `ingest-marketing-expense` reads `A1:Q200` (200 rows
  per monthly tab) and `ingest-realtor-managers-weekly` reads `A1:Z300`. A month/section that exceeds
  the cap, or columns added past `Q`/`Z`, would be **silently truncated**. Both have headroom now;
  widen the range constant if a sheet outgrows it. (Bank-deposit / weekly-sales / customer-file use
  open-ended `A2:M`-style ranges and are unaffected.)
- **Default landing view is "H1 of the current year"** (`DEFAULT_PRESET = 'h1'` in
  [`src/lib/dateRange.ts`](../../src/lib/dateRange.ts)). It adapts to the year automatically, but for
  a live (no longer half-year) dashboard, opening to Jan–Jun looks stale in H2. Consider switching the
  default to `ytd` or `this-quarter`. (The literal `2026-01-01/06-30` fallback beside it is a dead
  defensive path — the preset resolves first.)
- **`NON_REP_TABS` exclusion list is hardcoded** in
  [`_shared/parseCustomerSupport.ts`](../../supabase/functions/_shared/parseCustomerSupport.ts) —
  `Staff_Reference`, `ABIDEMI`, `VICTORIA`, etc. Customer-support **rep** tabs are auto-discovered, so
  a *new non-rep* tab would be mistaken for a rep (and a rep auto-created); and if `ABIDEMI` /
  `VICTORIA` ever return as active reps, they stay excluded until this list is edited.
- **`EARLIEST_DATA_YEAR = 2024`** (dateRange.ts) is only a fallback — the real earliest date comes
  from the `get_earliest_data_date()` RPC. Harmless unless that RPC ever fails.

## B10. Local development quickstart (next developer)

```bash
pnpm install
cp .env.local.example .env.local     # then fill in the values from the password manager
pnpm dev                             # http://localhost:5173
pnpm build                           # production build (tsc -b && vite build)
pnpm test                            # vitest
pnpm ingest:all                      # manually re-pull all 8 sheets
```

You'll need the Supabase CLI (`pnpm` installs it) for function deploys. Read `CLAUDE.md` first — it
has the deep engineering context and the hard rules (named column constants, currency `numeric(15,2)`,
idempotent upserts, CORS on every function, etc.).

## B11. Credentials template — fill in and store SECURELY (do not commit)

Copy this into your password manager or a sealed document. **Leave the repo copy blank.**

```text
GOOGLE (Pertinence Group account #1)
  email: ____________________   password: [in password manager]   2FA: ____
SERVICE ACCOUNT KEY (#3)
  JSON key file location: ____________________ (kept OUT of the repo)
SUPABASE (#4)  project ref: hrmrqpkcvyjwxrehrgvq
  login: via GitHub only (#5) — NO native password possible; secure GitHub + add 2nd org owner (§B2.1)
  anon key:           [Project Settings → API]
  service-role key:   [Project Settings → API — SECRET]
GITHUB (#5)   org/repo: pgoperations/pertinence-dashboard
  login: pgoperations@pertinencegroup.com   password: [held by Assistant General Manager]
WEB SERVER (#6)  pertinencegroup.com (WordPress/AWS) — hosts the static files at /pg-dashboard/
  no separate hosting account; website admin contact: ____________________
DASHBOARD ADMIN (#7)  email: pgoperations@pertinencegroup.com   password: ____________________
```

## B12. Investigating a data discrepancy (runbook)

The most common support question will be *"this number doesn't match the sheet / the supervisor's
portal."* You can almost always resolve it yourself with the steps below — that is what this section
is for. Two such cases were diagnosed on 2026-06-11 and are written up here as worked examples.

**First principle:** the dashboard never invents numbers — it sums what is in Supabase, which is a
mirror of the sheets. So a mismatch is always one of two shapes:

- **Over-count** (dashboard > sheet): the database holds rows the sheet no longer does — **duplicates
  or orphans**.
- **Under-count** (dashboard < sheet): a row was **dropped on the way in** — an unparseable value, an
  out-of-range/garbled date, or a deliberately skipped row.

Quick tell: if a *date-filtered* dashboard number is **larger than the sheet's entire column**, that
is mathematically impossible from clean data → it's an over-count (duplicates).

### Step 1 — compare the database to the sheet

Find the fact table behind the number (§B3) and compare its row count + total to the live sheet.
Example for sales revenue (`bank_deposits` ← `2026 LAND`):

```sql
select source_tab, count(*) rows, sum(amount_received) total
from bank_deposits where source_tab like '%LAND%' group by source_tab;
```

Compare to the sheet's own total: in Google Sheets, click the AMOUNT column header and read the
**Sum** in the bottom-right status bar. Equal → the pipeline is fine and the question is about
*definitions* (which date range, which column). Different → step 2 (over) or step 3 (under).

### Step 2 — over-count: find duplicates / orphans

```sql
select txn_date, amount_received, customer_name, sales_person,
       count(*) c, array_agg(source_row_id) ids
from bank_deposits where source_tab = '2026 LAND'
group by 1,2,3,4 having count(*) > 1 order by amount_received desc;
```

Each group is one real transaction stored under several ids. **This should normally return nothing**
— every ingest now runs a *stale-row sweep* (`_shared/sweepStaleRows.ts`) after upserting that deletes
any DB row the latest sheet read didn't produce, so orphans self-heal on the next sync. If you ever
see duplicates, just trigger a sync (the **Sync Sheets** button, or `pnpm ingest:all`) and they clear.

### Step 3 — under-count: find dropped rows

A row missing from the dashboard almost always carries a **quality flag**. List the flagged rows for
the relevant table:

```sql
select source_row_id, week_ending, plot_size_raw, quality_flags
from weekly_sales where quality_flags <> '{}'::jsonb;
```

The flag name says what happened (full vocabulary in
`supabase/functions/_shared/quality_flags.ts`). The ones you'll see most:

- `unparseable_plot_type` — a PLOT TYPE cell the parser couldn't read at all (now rare).
- `plot_type_fallback_special` — a non-canonical PLOT TYPE (bare size / compound) counted as Special.
- `unparseable_date` — a date cell that couldn't be read, so the row has no month bucket.
- `unknown_location` / `unknown_purpose` — a value with no canonical mapping yet (add the alias).
- `null_sales_person` — no realtor on the row; it lands in the "Unattributed" bucket (not an error).

The fix is usually a data-entry correction on the sheet (see [`docs/data-entry/`](README.md))
or, for a recurring pattern, a small parser change (§B7).

### Worked example 1 — revenue over-count (over by ~₦57M)

The Sales hero read ₦853M for H1 while the sheet's *whole* `2026 LAND` was ₦795.8M — impossible for a
subset. Step 1 showed **829 DB rows / ₦881.8M** vs the sheet's **527 / ₦795.8M**. Step 2 listed ~300
duplicate/orphan rows: the ingest had used positional ids (`row-{N}`) that drifted every time the
supervisor inserted a row, and it never deleted the strays. Fix: content-stable ids + the stale-row
sweep. After one sync the table reconciled to **527 / ₦795.8M exactly**.

### Worked example 2 — plot under-count (under by 1)

"Plots Sold" read 75 vs the portal's 76. Step 3 showed `unparseable_plot_type: 1`. The row was cell
`D110 = "1 450SQM & 1 380SQM"` — two plots written as sizes rather than the canonical words, which the
parser dropped. Fix: the parser now splits compounds and buckets any non-canonical land entry as
Special, counting the true **2** — which makes our total **77**, one *above* the portal (the portal
only counts the leading "1"). 77 is the correct figure; per principle #3 we surface the true count
rather than match the portal's undercount. A data-entry note was added so staff use the canonical
words going forward.

---

*Maintained by Pertinence Group Operations. If something here drifts from reality, fix this file —
it is the single source of truth for running the dashboard.*

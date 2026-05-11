# Locked Design Decisions

Read this file at the start of every session. These decisions are settled — do not re-litigate them unless I explicitly ask.

## Schema
- **Aliases as separate tables**, not jsonb arrays. `location_aliases`, `purpose_aliases`, `complaint_aliases` reference their canonical table. Index `lower(alias)` for case-insensitive ingest lookups.
- **Idempotent ingest via `source_row_id`.** Every fact row carries `(source_sheet, source_tab, source_row_id)` with a unique constraint, plus a full `raw_row` jsonb for traceback. Re-runs upsert, never duplicate.
- **Aggregates as regular tables**, refreshed by ingest functions. NOT materialized views.
- **Discrepancies get their own `data_quality_alerts` table.** Surfaced, never silently reconciled.
- **Plot type matching lives in TypeScript** (`_shared/parsePlotType.ts`). The `plot_types` table holds only the 4 canonical names: Starter (300), Classic (450), Executive (500/600), Special (everything else).
- **Marketing Expense period anchor is the source-tab name** ("May 2026" → 2026, 5). In-cell dates are unreliable.
- **Bank Deposit transaction date is column A (`DATE`) on `2026 LAND`.** Columns L (second `DATE` header) and M (status field) are out of scope — do not ingest. Header `CLIENT  NAME` (column I) has an intentional double space; match exactly in named-column constants.

## Quality flags vocabulary
Defined once in `supabase/functions/_shared/quality_flags.ts`. All ingest functions emit the same keys:
`unknown_location`, `unknown_purpose`, `fallback_category`, `missing_realtor`, `low_match_confidence`, `unparseable_plot_type`, `unparseable_date`, `null_sales_person`.

## Auth model
Three roles on a `profiles` table extending `auth.users`: `admin`, `editor`, `viewer` (default).
- Admin: manages reference data, all writes
- Editor: social media manual entry, resolving alerts
- Viewer: read-only
- Fact tables: NO client write policies. Only service role (Edge Functions) writes.

## Ingest principles (from supervisor, non-negotiable)
1. One source of truth per data type
2. Reduce dependence on manually entered data
3. The dashboard surfaces discrepancies — does NOT silently reconcile them

## Coding rules
- **Named column constants in ingest code**, never positional indexes. This bit us on the previous HR dashboard.
- Every panel timestamps "as of [datetime]".
- Mobile-readable (supervisor checks on phone).
- Currency: `numeric(15,2)`. Never float for money.
- Fuzzy name matching uses configurable threshold; below-threshold matches go to "needs review", never auto-merge.

## Ingest Edge Function rules (Phase 3 onward, locked 2026-05-11)
- **Google Sheets auth: native Deno `crypto.subtle`, no external lib.** Hand-roll the RS256 JWT sign + `urn:ietf:params:oauth:grant-type:jwt-bearer` token exchange. Service-account-only flow, zero deps, smallest cold-start. Smoke script (`scripts/smoke-test-sheets.mjs`) keeps using Node `googleapis` — that's local-only.
- **Sheets read uses `valueRenderOption=UNFORMATTED_VALUE`.** Dates come back as serial numbers (days since 1899-12-30 epoch), amounts as numbers. Eliminates locale ambiguity on `M/D/YYYY` vs `D/M/YYYY` and string-vs-number coercion on amounts.
- **`source_row_id` for Bank Deposit: `TRANS CODE` (column H) when non-empty, else fallback `row-{N}` where N is the 1-indexed sheet row.** TRANS CODE survives row reordering; the fallback covers blank cells. Inspectable via `source_row_id like 'row-%'`.
- **Aggregate refresh is a Postgres function, called via RPC at the end of each ingest run.** `refresh_sales_by_location_monthly()` (and future siblings) recomputes the aggregate from the fact table inside a single SQL statement, so ingest + refresh stay consistent without juggling transactions across HTTP boundaries.

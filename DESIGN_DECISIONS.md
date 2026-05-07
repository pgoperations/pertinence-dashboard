# Locked Design Decisions

Read this file at the start of every session. These decisions are settled — do not re-litigate them unless I explicitly ask.

## Schema
- **Aliases as separate tables**, not jsonb arrays. `location_aliases`, `purpose_aliases`, `complaint_aliases` reference their canonical table. Index `lower(alias)` for case-insensitive ingest lookups.
- **Idempotent ingest via `source_row_id`.** Every fact row carries `(source_sheet, source_tab, source_row_id)` with a unique constraint, plus a full `raw_row` jsonb for traceback. Re-runs upsert, never duplicate.
- **Aggregates as regular tables**, refreshed by ingest functions. NOT materialized views.
- **Discrepancies get their own `data_quality_alerts` table.** Surfaced, never silently reconciled.
- **Plot type matching lives in TypeScript** (`_shared/parsePlotType.ts`). The `plot_types` table holds only the 4 canonical names: Starter (300), Classic (450), Executive (500/600), Special (everything else).
- **Marketing Expense period anchor is the source-tab name** ("May 2026" → 2026, 5). In-cell dates are unreliable.

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

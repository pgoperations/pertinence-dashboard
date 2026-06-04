// Quality flag vocabulary used by every ingest function.
// Keys are stable contract — schema migrations and dashboard panels both depend
// on them. Adding a new flag is fine; renaming or removing requires a coordinated
// change in TypeScript, SQL queries that filter on `quality_flags ? '<key>'`,
// and any panel surface that displays the flag.
//
// Per DESIGN_DECISIONS.md (the single source for this vocabulary).

export const QUALITY_FLAGS = {
  // Bank Deposit / Customer File / Weekly Sales: LOCATION cell didn't match any
  // canonical row or alias. Row is still ingested but location_id stays null.
  UNKNOWN_LOCATION: 'unknown_location',

  // Bank Deposit: PURPOSE cell didn't match canonical or alias.
  UNKNOWN_PURPOSE: 'unknown_purpose',

  // Marketing Expense: row was auto-categorized via keyword matching because the
  // supervisor hasn't added the Category dropdown yet, OR because the value in
  // the dropdown didn't map to a canonical expense_categories row.
  FALLBACK_CATEGORY: 'fallback_category',

  // Bank Deposit / Weekly Sales / Customer File: row had no realtor manager
  // assignment that mapped to the realtor_managers roster.
  MISSING_REALTOR: 'missing_realtor',

  // Fuzzy realtor name matching produced a candidate below the configured
  // similarity threshold. Match is recorded but flagged for human review;
  // never auto-merged per DESIGN_DECISIONS.md.
  LOW_MATCH_CONFIDENCE: 'low_match_confidence',

  // Plot type cell ("1 EXECUTIVE", "600SQM", "1 ACRE") couldn't be parsed by
  // _shared/parsePlotType.ts. plot_type_id stays null; raw text is preserved
  // in plot_size_raw and the full row in raw_row.
  UNPARSEABLE_PLOT_TYPE: 'unparseable_plot_type',

  // Date cell unparseable as a real date (covers stray strings, blank, garbage).
  UNPARSEABLE_DATE: 'unparseable_date',

  // Bank Deposit specifically: ~56% of rows in 2026 LAND have a null SALES PERSON.
  // These get an "Unattributed" bucket on revenue views (visible, not hidden).
  NULL_SALES_PERSON: 'null_sales_person',

  // Customer Support: "Nature of Complaint" cell held a non-empty value that
  // didn't match any seeded `complaint_categories` row or alias. Row is still
  // ingested with `complaint_category_id` null and `complaint_raw` carrying the
  // original text; the supervisor adds the alias (or a new canonical) via the
  // admin panel and the next ingest run picks it up. Empty Nature cells are
  // NOT flagged with this — absence is its own state.
  UNKNOWN_COMPLAINT_CATEGORY: 'unknown_complaint_category',

  // Bank Deposit `2026 LAND`: row's column L (supervisor's clean working date)
  // was blank, so the ingest fell back to column A (bank-mirror auto-paste).
  // For recent transactions only — the supervisor's L column lags the bank's
  // by a few days. Tracks how many rows are "supervisor-pending" so the gap
  // is visible. Value is the column A raw date used.
  DATE_FALLBACK_TO_A: 'date_fallback_to_a',

  // Bank Deposit `2026 LAND`: the ingested txn_date (column L) lands after the
  // ingest run date — i.e. a transaction dated in the future, which is almost
  // always a date typo in the supervisor's ledger (e.g. a row dated weeks ahead
  // that then shows up as the "latest" week in the dashboard). Surfaced as a
  // self-healing `data_quality_alerts` row, never silently dropped (supervisor
  // #3). Detail carries the offending date. A 1-day grace absorbs timezone
  // boundaries so same-day Lagos entries aren't false-flagged.
  FUTURE_TXN_DATE: 'future_txn_date',

  // Realtor metrics: a week or total cell held an unexpected non-numeric,
  // non-NIL string. Numeric coercion treated it as 0 to keep aggregates
  // computable; the raw value is preserved in raw_row for inspection. Adding
  // a NIL-variant alias on the parser side is the typical fix.
  NON_NUMERIC_VALUE: 'non_numeric_value',

  // Realtor metrics: the source's Total column was non-null but disagreed
  // with the sum of Week 1–5 cells. Surfaced per supervisor #3 ("never
  // silently reconcile"). Detail carries both numbers. The fact row's
  // `total` column always carries our computed week-sum; raw_row preserves
  // the supervisor's entered Total for traceback.
  TOTAL_MISMATCH: 'total_mismatch',

  // Media Weekly: a brand-column cell in the per-week platform header row
  // didn't match any canonical brand or alias. The row still lands (so the
  // value isn't lost) with brand_id null and brand_key null; the supervisor
  // adds the alias and re-runs ingest.
  UNKNOWN_MEDIA_BRAND: 'unknown_media_brand',

  // Digital Marketing: the same Campaign Name row carried multiple distinct
  // campaign names across W1–W5 (e.g. "RESET, FARMWEY, FARMWEY, FARMWEY").
  // The fact row uses the first non-empty name; raw_row preserves all five.
  // Surfaced so the supervisor can split the sub-block manually if the mixed
  // weeks were a data-entry mistake rather than a real campaign rotation.
  MIXED_CAMPAIGN_WEEKS: 'mixed_campaign_weeks',
} as const;

export type QualityFlagKey = (typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS];

// The shape of the quality_flags jsonb column on every fact table.
// Each present key carries a short, human-readable detail string (or `true`).
// Absence of a key means the row passed that check.
export type QualityFlags = Partial<Record<QualityFlagKey, true | string>>;

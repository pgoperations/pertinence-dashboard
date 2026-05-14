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
} as const;

export type QualityFlagKey = (typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS];

// The shape of the quality_flags jsonb column on every fact table.
// Each present key carries a short, human-readable detail string (or `true`).
// Absence of a key means the row passed that check.
export type QualityFlags = Partial<Record<QualityFlagKey, true | string>>;

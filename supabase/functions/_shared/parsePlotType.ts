// Plot-type parsing for Weekly Sales and Customer File ingests.
//
// Per DESIGN_DECISIONS.md: the `plot_types` table holds only the 4 canonical
// names (Starter / Classic / Executive / Special); the actual size → canonical
// mapping rules live here, not in SQL. Migration 002 seeds the table.
//
// Two source formats, two parsers (the brief calls these out explicitly):
//
//   Weekly Sales ("2026 Weekly Sales Report"):
//     "1 EXECUTIVE", "2 CLASSIC", "1 QUARTER", "1 SPECIAL [220SQM]",
//     "1 ACRE", "1 SPECIAL[cornerpiece]"
//     Format: {count} {WORD}[ [{annotation}]]
//     WORD ∈ {STARTER, CLASSIC, EXECUTIVE, SPECIAL, QUARTER, ACRE(S), HECTAR(E)(S)}
//     Annotation is optional, free-text. Only "{N}SQM" extracts a size — other
//     content (e.g. "cornerpiece") is treated as a cosmetic note.
//     Count lives INSIDE the cell value.
//
//   Customer File ("2026 Customer File"):
//     "600SQM", "150SQM", "1 ACRE", "3 ACRES", "1 HECTAR"
//     Format: {N}SQM   OR   {count} {UNIT}
//     Plot count lives in a SEPARATE column (NUMBER OF PLOT, col H) — the
//     parser does NOT return a count for this convention, since "1 ACRE"
//     means one acre (which is N plots in the separate column), not 1 plot.
//
// Canonical mapping (locked in PROJECT_BRIEF.md):
//   * Starter   = 300 SQM
//   * Classic   = 450 SQM
//   * Executive = 500 OR 600 SQM
//   * Special   = anything else (sub-300, 1 ACRE, 1 QUARTER, unrecognized sizes)
//
// "QUARTER" in Weekly Sales is sub-300 land per the brief — bucketed as Special.
// "ACRE" / "HECTARE" in Customer File are non-SQM units — bucketed as Special.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type PlotTypeName = 'Starter' | 'Classic' | 'Executive' | 'Special';

export type ParsedWeeklyPlot = {
  canonicalName: PlotTypeName;
  count: number;            // summed across segments ("1 450SQM & 1 380SQM" → 2)
  sizeSqm: number | null;   // first [NSQM]/NSQM size seen, if any (cosmetic)
  nonStandard: boolean;     // true if any segment wasn't a canonical word → Special fallback
};

export type ParsedCustomerPlot = {
  canonicalName: PlotTypeName;
  sizeSqm: number | null;   // 600 for "600SQM"; null for "1 ACRE"
  rawUnit: string | null;   // "ACRE" / "HECTAR" / null for SQM
};

// Canonical name → uuid lookup, loaded once per Edge Function invocation.
// Same pattern as loadCanonicalLookups in canonicalLookup.ts — kept here
// because the keys are the parser output enum, not external alias text.
export async function loadPlotTypeLookup(
  supabase: SupabaseClient,
): Promise<Map<PlotTypeName, string>> {
  const { data, error } = await supabase
    .from('plot_types')
    .select('id, name');
  if (error) throw new Error(`plot_types load failed: ${error.message}`);
  const map = new Map<PlotTypeName, string>();
  for (const row of data ?? []) {
    if (row.name && row.id) {
      map.set(row.name as PlotTypeName, row.id as string);
    }
  }
  return map;
}

// Size buckets per the brief. 300/450 are exact; Executive is 500 OR 600.
// Anything outside those three exact values → Special.
export function sqmToCanonical(sqm: number): PlotTypeName {
  if (sqm === 300) return 'Starter';
  if (sqm === 450) return 'Classic';
  if (sqm === 500 || sqm === 600) return 'Executive';
  return 'Special';
}

// Weekly Sales plot-type parser.
//
// A cell carries one or more plots. The standard form is "{count} {WORD}" with an
// optional " [{NSQM or anything}]" annotation, where WORD is a canonical type or
// a known Special synonym (QUARTER / ACRE / HECTARE). But the supervisor also
// enters land in non-standard forms — bare sizes ("450SQM"), typos, and compound
// cells joining several plots with "&" / "+" / "," (e.g. "1 450SQM & 1 380SQM").
//
// Policy (supervisor 2026-06-11): every entry on this sheet IS land, so a plot is
// never dropped. We split the cell into segments, sum each segment's count
// (defaulting a count-less segment to 1), and bucket each by its type word —
// STARTER/CLASSIC/EXECUTIVE by name; everything else (SPECIAL/QUARTER/ACRE/
// HECTARE *and* any unrecognized label such as a bare SQM size) → Special. A
// segment that wasn't a canonical word sets `nonStandard`, which the ingest
// surfaces as a plot_type_fallback_special flag (supervisor #3). Returns null
// only when there is genuinely no countable content.
// Split compounds on & / + only — NOT comma, which appears inside bracketed
// sizes ("[1,200SQM]") and would shatter a number.
const SEGMENT_SPLIT_RE = /\s*[&+]\s*/;
// A count is leading digits FOLLOWED BY whitespace ("1 450SQM" → 1). Digits that
// run straight into a size ("450SQM") are the size, not a count → default to 1.
const LEADING_COUNT_RE = /^(\d+)\s+/;
const ANY_SQM_RE = /(\d+)\s*SQM/i;
const KNOWN_SPECIAL_WORD_RE = /\b(SPECIAL|QUARTER|ACRE|ACRES|HECTAR|HECTARE|HECTARES)\b/i;

export function parseWeeklySalesPlotType(raw: unknown): ParsedWeeklyPlot | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const segments = trimmed.split(SEGMENT_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  let totalCount = 0;
  let sizeSqm: number | null = null;
  let nonStandard = false;
  const canonicals = new Set<PlotTypeName>();

  for (const seg of segments) {
    const upper = seg.toUpperCase();
    const cm = LEADING_COUNT_RE.exec(seg);
    const count = cm ? Number.parseInt(cm[1], 10) : 1; // no leading number → one plot
    if (!Number.isFinite(count) || count < 1) continue;
    totalCount += count;

    let canonical: PlotTypeName;
    if (/\bSTARTER\b/.test(upper)) canonical = 'Starter';
    else if (/\bCLASSIC\b/.test(upper)) canonical = 'Classic';
    else if (/\bEXECUTIVE\b/.test(upper)) canonical = 'Executive';
    else if (KNOWN_SPECIAL_WORD_RE.test(upper)) canonical = 'Special'; // recognized Special synonym
    else { canonical = 'Special'; nonStandard = true; } // bare size / typo → Special, flagged
    canonicals.add(canonical);

    const sm = ANY_SQM_RE.exec(seg);
    if (sm && sizeSqm === null) sizeSqm = Number.parseInt(sm[1], 10);
  }

  if (totalCount < 1) return null;

  // Single canonical across all segments → use it; mixed types collapse to Special
  // (the row carries one plot_type_id, and a mixed land cell is itself non-standard).
  let canonicalName: PlotTypeName;
  if (canonicals.size === 1) {
    canonicalName = [...canonicals][0];
  } else {
    canonicalName = 'Special';
    nonStandard = true;
  }

  return { canonicalName, count: totalCount, sizeSqm, nonStandard };
}

// Customer File: either "{N}SQM" or "{count} {UNIT}".
// SQM → canonical via sqmToCanonical. Non-SQM units → Special.
const SQM_RE = /^\s*(\d+)\s*SQM\s*$/i;
const COUNT_UNIT_RE = /^\s*\d+\s+(ACRE|ACRES|HECTAR|HECTARE|HECTARES|PLOT|PLOTS)\s*$/i;

export function parseCustomerFilePlotSize(raw: unknown): ParsedCustomerPlot | null {
  if (typeof raw !== 'string') return null;

  const sqmM = SQM_RE.exec(raw);
  if (sqmM) {
    const sqm = Number.parseInt(sqmM[1], 10);
    if (!Number.isFinite(sqm) || sqm < 1) return null;
    return {
      canonicalName: sqmToCanonical(sqm),
      sizeSqm: sqm,
      rawUnit: null,
    };
  }

  const unitM = COUNT_UNIT_RE.exec(raw);
  if (unitM) {
    return {
      canonicalName: 'Special',
      sizeSqm: null,
      rawUnit: unitM[1].toUpperCase(),
    };
  }

  return null;
}

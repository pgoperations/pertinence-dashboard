// Plot-type parsing for Weekly Sales and Customer File ingests.
//
// Per DESIGN_DECISIONS.md: the `plot_types` table holds only the 4 canonical
// names (Starter / Classic / Executive / Special); the actual size → canonical
// mapping rules live here, not in SQL. Migration 002 seeds the table.
//
// Two source formats, two parsers (the brief calls these out explicitly):
//
//   Weekly Sales ("2026 Weekly Sales Report"):
//     "1 EXECUTIVE", "2 CLASSIC", "1 QUARTER", "1 SPECIAL [220SQM]"
//     Format: {count} {WORD}[ [{N}SQM]]
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
  count: number;            // from the leading number ("3 EXECUTIVE" → 3)
  sizeSqm: number | null;   // from the optional [NSQM] annotation
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

// Weekly Sales: "{count} {WORD}" with optional " [{N}SQM]" annotation.
// QUARTER is bucketed as Special per the brief (sub-300 land).
// Returns null if the cell doesn't match — caller flags unparseable_plot_type.
const WEEKLY_RE =
  /^\s*(\d+)\s+(STARTER|CLASSIC|EXECUTIVE|SPECIAL|QUARTER)(?:\s*\[\s*(\d+)\s*SQM\s*\])?\s*$/i;

export function parseWeeklySalesPlotType(raw: unknown): ParsedWeeklyPlot | null {
  if (typeof raw !== 'string') return null;
  const m = WEEKLY_RE.exec(raw);
  if (!m) return null;
  const count = Number.parseInt(m[1], 10);
  if (!Number.isFinite(count) || count < 1) return null;
  const word = m[2].toUpperCase();
  const sizeSqm = m[3] ? Number.parseInt(m[3], 10) : null;

  let canonicalName: PlotTypeName;
  if (word === 'STARTER') canonicalName = 'Starter';
  else if (word === 'CLASSIC') canonicalName = 'Classic';
  else if (word === 'EXECUTIVE') canonicalName = 'Executive';
  else canonicalName = 'Special'; // SPECIAL and QUARTER both bucket here

  return { canonicalName, count, sizeSqm };
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

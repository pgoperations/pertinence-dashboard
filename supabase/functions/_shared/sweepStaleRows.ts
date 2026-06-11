// Stale-row sweep: reconcile a fact table to exactly what an ingest run produced.
//
// Our ingests upsert on (source_sheet, source_tab, source_row_id) but never
// delete. So when a row vanishes from the sheet — deleted, edited, or its
// positional source_row_id drifts after a mid-sheet insert/reorder — the old
// copy lingers in the DB and keeps contributing to totals. That was the root
// cause of the 2026-06-11 Sales over-count: bank_deposits held ₦881.8M across
// 829 rows vs the sheet's ₦795.8M / 527.
//
// After upserting, call sweepStaleRows: for each (source_sheet, source_tab) this
// run touched, delete any DB row whose source_row_id is NOT in the current run's
// id set. Qualified DELETE (eq + in), so Supabase's safeupdate guard doesn't
// block it. Guard: a tab the run produced 0 rows for is skipped, so a transient
// empty/failed sheet read can never nuke real data.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type IdRow = { source_tab: string; source_row_id: string };

/** Group a run's parsed rows into source_tab → set of source_row_id. */
export function buildIdsByTab(rows: IdRow[]): Map<string, Set<string>> {
  const byTab = new Map<string, Set<string>>();
  for (const r of rows) {
    let set = byTab.get(r.source_tab);
    if (!set) {
      set = new Set<string>();
      byTab.set(r.source_tab, set);
    }
    set.add(r.source_row_id);
  }
  return byTab;
}

/** Delete DB rows in the swept (sheet, tab) partitions that this run didn't
 *  produce. Returns the count of orphan rows deleted. */
export async function sweepStaleRows(
  supabase: SupabaseClient,
  table: string,
  sourceSheet: string,
  currentIdsByTab: Map<string, Set<string>>,
  chunk = 500,
): Promise<number> {
  let deleted = 0;
  for (const [tab, currentIds] of currentIdsByTab) {
    if (currentIds.size === 0) continue; // never sweep on an empty/failed read

    // Page every existing id for this (sheet, tab).
    const existing: string[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('source_row_id')
        .eq('source_sheet', sourceSheet)
        .eq('source_tab', tab)
        .range(from, from + chunk - 1);
      if (error) throw new Error(`[sweepStaleRows] read ${table} (${tab}) failed: ${error.message}`);
      const batch = (data ?? []) as Array<{ source_row_id: string }>;
      for (const b of batch) existing.push(b.source_row_id);
      if (batch.length < chunk) break;
      from += chunk;
    }

    // Delete the ones not in this run, in chunks.
    const orphans = existing.filter((id) => !currentIds.has(id));
    for (let i = 0; i < orphans.length; i += chunk) {
      const slice = orphans.slice(i, i + chunk);
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('source_sheet', sourceSheet)
        .eq('source_tab', tab)
        .in('source_row_id', slice);
      if (error) throw new Error(`[sweepStaleRows] delete ${table} (${tab}) failed: ${error.message}`);
      deleted += slice.length;
    }
  }
  return deleted;
}

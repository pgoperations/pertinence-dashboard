// Canonical lookup maps for ingest functions.
//
// Loads the seeded alias tables (`location_aliases` / `purpose_aliases`) into
// in-memory Maps keyed on `lower(alias)` once per Edge Function invocation.
// Lets the ingest loop resolve every PURPOSE / LOCATION cell via case-insensitive
// O(1) lookup instead of one round-trip per row.
//
// Aliases are case-insensitive (the unique index in migration 002 is on
// `lower(alias)`), so we normalize lookup keys the same way.
//
// Missing match → null id + the caller emits `unknown_location` / `unknown_purpose`
// in `quality_flags`. Per DESIGN_DECISIONS, the dashboard surfaces unmapped values;
// it never silently buckets them.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type CanonicalLookups = {
  locationByAlias: Map<string, string>; // lower(alias) → location.id (uuid)
  purposeByAlias: Map<string, string>;  // lower(alias) → purpose.id  (uuid)
};

export async function loadCanonicalLookups(
  supabase: SupabaseClient,
): Promise<CanonicalLookups> {
  const [locRes, purRes] = await Promise.all([
    supabase.from('location_aliases').select('alias, location_id'),
    supabase.from('purpose_aliases').select('alias, purpose_id'),
  ]);
  if (locRes.error) throw new Error(`location_aliases load failed: ${locRes.error.message}`);
  if (purRes.error) throw new Error(`purpose_aliases load failed: ${purRes.error.message}`);

  const locationByAlias = new Map<string, string>();
  for (const row of locRes.data ?? []) {
    if (row.alias && row.location_id) {
      locationByAlias.set(String(row.alias).toLowerCase(), row.location_id as string);
    }
  }

  const purposeByAlias = new Map<string, string>();
  for (const row of purRes.data ?? []) {
    if (row.alias && row.purpose_id) {
      purposeByAlias.set(String(row.alias).toLowerCase(), row.purpose_id as string);
    }
  }

  return { locationByAlias, purposeByAlias };
}

export function lookupCanonical(
  map: Map<string, string>,
  rawValue: unknown,
): string | null {
  if (typeof rawValue !== 'string') return null;
  const key = rawValue.trim().toLowerCase();
  if (!key) return null;
  return map.get(key) ?? null;
}

// Customer Support ingest lookups.
// complaint_aliases works exactly like location_aliases / purpose_aliases: a
// case-insensitive alias → canonical-id map, loaded once per invocation.
export async function loadComplaintAliases(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('complaint_aliases')
    .select('alias, complaint_category_id');
  if (error) throw new Error(`complaint_aliases load failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.alias && row.complaint_category_id) {
      map.set(String(row.alias).toLowerCase(), row.complaint_category_id as string);
    }
  }
  return map;
}

// Rep lookups for Customer Support: tab name (uppercase, e.g. "CATHERINE")
// maps to the seeded customer_service_reps row (mixed case, e.g. "Catherine").
// Returns lower(name) → { id, brand_id } so the ingest can resolve every row
// to its rep without one query per tab.
export type CsRepLookup = { id: string; brand_id: string };

export async function loadActiveCustomerServiceReps(
  supabase: SupabaseClient,
): Promise<Map<string, CsRepLookup>> {
  const { data, error } = await supabase
    .from('customer_service_reps')
    .select('id, name, brand_id, active')
    .eq('active', true);
  if (error) throw new Error(`customer_service_reps load failed: ${error.message}`);
  const map = new Map<string, CsRepLookup>();
  for (const row of data ?? []) {
    if (row.name && row.id && row.brand_id) {
      map.set(String(row.name).toLowerCase(), { id: row.id as string, brand_id: row.brand_id as string });
    }
  }
  return map;
}

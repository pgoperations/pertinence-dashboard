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

// Realtor metric aliases: source-label text → canonical metric_key. Same
// pattern as the other alias loaders. Lookup is case-insensitive via lower();
// callers also normalize whitespace before lookup since the 2026 source tab
// has inconsistent spacing on some labels (e.g. "Referrals +Business Reps").
export async function loadRealtorMetricAliases(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('realtor_metric_aliases')
    .select('alias, metric_key');
  if (error) throw new Error(`realtor_metric_aliases load failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.alias && row.metric_key) {
      map.set(String(row.alias).toLowerCase(), row.metric_key as string);
    }
  }
  return map;
}


// Digital Marketing metric aliases: source-label text → canonical metric_key.
// Same pattern as realtor_metric_aliases.
export async function loadDigitalMarketingMetricAliases(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('digital_marketing_metric_aliases')
    .select('alias, metric_key');
  if (error) throw new Error(`digital_marketing_metric_aliases load failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.alias && row.metric_key) {
      map.set(String(row.alias).toLowerCase().trim(), row.metric_key as string);
    }
  }
  return map;
}


// Media Weekly lookups: brand aliases, metric aliases, and the set of valid
// canonical metric keys. The parser uses the keySet to verify platform-prefix
// substitutions (fb_ → ig_ / yt_) when resolving ambiguous metric labels.
export type MediaLookups = {
  brandByAlias: Map<string, { id: string; key: string }>;
  metricByAlias: Map<string, string>;
  metricKeySet: Set<string>;
};

export async function loadMediaLookups(
  supabase: SupabaseClient,
): Promise<MediaLookups> {
  const [brandRes, brandAliasRes, metricRes, metricAliasRes] = await Promise.all([
    supabase.from('media_brands').select('id, key'),
    supabase.from('media_brand_aliases').select('alias, brand_key'),
    supabase.from('media_metric_canonicals').select('key'),
    supabase.from('media_metric_aliases').select('alias, metric_key'),
  ]);
  if (brandRes.error) throw new Error(`media_brands load failed: ${brandRes.error.message}`);
  if (brandAliasRes.error) throw new Error(`media_brand_aliases load failed: ${brandAliasRes.error.message}`);
  if (metricRes.error) throw new Error(`media_metric_canonicals load failed: ${metricRes.error.message}`);
  if (metricAliasRes.error) throw new Error(`media_metric_aliases load failed: ${metricAliasRes.error.message}`);

  const brandKeyToId = new Map<string, string>();
  for (const row of brandRes.data ?? []) {
    if (row.key && row.id) brandKeyToId.set(String(row.key), row.id as string);
  }
  const brandByAlias = new Map<string, { id: string; key: string }>();
  for (const row of brandAliasRes.data ?? []) {
    const key = row.brand_key ? String(row.brand_key) : null;
    if (!key) continue;
    const id = brandKeyToId.get(key);
    if (!id || !row.alias) continue;
    brandByAlias.set(String(row.alias).toLowerCase().trim(), { id, key });
  }

  const metricKeySet = new Set<string>();
  for (const row of metricRes.data ?? []) {
    if (row.key) metricKeySet.add(String(row.key));
  }
  const metricByAlias = new Map<string, string>();
  for (const row of metricAliasRes.data ?? []) {
    if (row.alias && row.metric_key) {
      metricByAlias.set(String(row.alias).toLowerCase().trim(), row.metric_key as string);
    }
  }

  return { brandByAlias, metricByAlias, metricKeySet };
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

// Map lower(email_domain) → brand.id for the CS brands (is_cs). Used to infer a
// newly-discovered rep's brand from their Staff_Reference email domain so the
// rep can be auto-created (customer_service_reps.brand_id is NOT NULL).
export async function loadCsBrandByEmailDomain(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('brands')
    .select('id, email_domain, is_cs')
    .eq('is_cs', true);
  if (error) throw new Error(`brands load failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.email_domain && row.id) {
      map.set(String(row.email_domain).toLowerCase().trim(), row.id as string);
    }
  }
  return map;
}

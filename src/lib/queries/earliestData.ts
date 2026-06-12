import { supabase } from '../supabase';

// Earliest month any ingested data exists for, across all departments — drives
// the date-range picker's "All time" lower bound and the earliest year in the
// year dropdown. Returns an ISO date (1st of the earliest month) or null when
// there's no data yet / the call fails, in which case callers fall back to
// their EARLIEST_DATA_YEAR constant. See migration 023.
export async function loadEarliestDataDate(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_earliest_data_date');
  if (error || !data) return null;
  // RPC returns a `date` → PostgREST serializes it as a 'YYYY-MM-DD' string.
  return typeof data === 'string' ? data : null;
}

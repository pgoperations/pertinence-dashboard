// Browser-callable Edge Functions need CORS headers + OPTIONS preflight, or
// `supabase.functions.invoke()` calls from the dashboard hang at the preflight
// (browser never gets a response, the Promise never resolves). Server-to-server
// invocations (pg_cron → pg_net) skip the preflight, which is why the cron
// path worked while the on-demand "Sync Sheets" button stalled at 0/6.
//
// `*` origin is fine here: every Edge Function still requires the anon key in
// the `apikey` header per Supabase's gateway, so the API-key gate is the real
// auth boundary. Credentialed requests (cookie-based) aren't used by
// supabase-js, so `*` doesn't conflict with `Allow-Credentials`.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

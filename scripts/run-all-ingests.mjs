// Re-run every ingest Edge Function in parallel and print a per-ingest summary.
//
// Until step 9 of the roadmap lands (automated cron + admin "Re-pull" button),
// the dashboard never auto-pulls from Sheets. This script is the manual
// trigger — fires all six ingests concurrently against the live project, then
// reports each function's response payload (rows parsed, upserted, flag counts).
//
// Auth: hits the public function URLs with the anon key. Each ingest is
// deployed --no-verify-jwt, so the gateway accepts anon; the function itself
// authenticates to Sheets via the service account and to Postgres via the
// service-role key both stored in Supabase secrets.
//
// Run with: `pnpm ingest:all`

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env.');
  process.exit(1);
}

const INGESTS = [
  'ingest-bank-deposit',
  'ingest-marketing-expense',
  'ingest-customer-support',
  'ingest-weekly-sales',
  'ingest-customer-file',
  'ingest-realtor-managers-weekly',
  'ingest-digital-marketing',
  'ingest-media-weekly',
];

const headers = {
  'apikey': anonKey,
  'Authorization': `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
};

async function invoke(name) {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = text; }
    return { name, status: res.status, ok: res.ok, ms: Date.now() - start, payload };
  } catch (err) {
    return { name, status: 0, ok: false, ms: Date.now() - start, payload: { error: String(err) } };
  }
}

const results = await Promise.all(INGESTS.map(invoke));

let anyFailed = false;
for (const r of results) {
  const tag = r.ok ? 'OK ' : 'FAIL';
  console.log(`\n[${tag}] ${r.name}  ${r.status}  ${r.ms}ms`);
  if (typeof r.payload === 'object' && r.payload !== null) {
    console.log(JSON.stringify(r.payload, null, 2));
  } else {
    console.log(r.payload);
  }
  if (!r.ok) anyFailed = true;
}

console.log('\n=== summary ===');
for (const r of results) {
  console.log(`  ${r.ok ? 'OK ' : 'FAIL'}  ${r.name.padEnd(36)} ${r.status}  ${r.ms}ms`);
}

process.exit(anyFailed ? 1 : 0);

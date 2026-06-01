// One-shot: dump unique sales_person values from bank_deposits with revenue +
// deal counts, plus a proposed token-set fingerprint that the dashboard's Top
// Realtors merge will use. Helps audit which variants get folded together
// before the merge ships.
//
// Read-only. Run with: node --env-file=.env.local scripts/dump-sales-persons.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// Token-set fingerprint: lowercase, strip non-letters/digits, sort tokens,
// dedupe, join. Matches the algorithm we'll ship in sales.ts.
function fingerprint(raw) {
  return [...new Set(
    raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean),
  )]
    .sort()
    .join(' ');
}

const fmtNaira = (n) =>
  '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Paginate through bank_deposits.
const variantRevenue = new Map(); // raw → revenue
const variantCount = new Map();   // raw → deal count
let offset = 0;
const PAGE = 1000;
for (;;) {
  const { data, error } = await supabase
    .from('bank_deposits')
    .select('sales_person, amount_received')
    .range(offset, offset + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const sp = r.sales_person?.trim() || '(null)';
    const amt = Number(r.amount_received ?? 0);
    variantRevenue.set(sp, (variantRevenue.get(sp) ?? 0) + amt);
    variantCount.set(sp, (variantCount.get(sp) ?? 0) + 1);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}

// Group raw variants by fingerprint.
const groups = new Map(); // fp → { variants: Map<raw, {rev, cnt}>, totalRev, totalCnt }
for (const [raw, rev] of variantRevenue.entries()) {
  const fp = raw === '(null)' ? '(null)' : fingerprint(raw);
  const g = groups.get(fp) ?? { variants: new Map(), totalRev: 0, totalCnt: 0 };
  g.variants.set(raw, { rev, cnt: variantCount.get(raw) });
  g.totalRev += rev;
  g.totalCnt += variantCount.get(raw);
  groups.set(fp, g);
}

// Sort groups by total revenue desc; print only groups with >1 variant
// (the merge targets) PLUS the singleton groups for completeness.
const sortedGroups = [...groups.entries()].sort((a, b) => b[1].totalRev - a[1].totalRev);

console.log(`\n=== MERGE TARGETS (groups with >1 raw variant) ===\n`);
let mergeCount = 0;
for (const [fp, g] of sortedGroups) {
  if (g.variants.size <= 1) continue;
  mergeCount++;
  console.log(`[${fp}]  merged → ${fmtNaira(g.totalRev)} · ${g.totalCnt} deals`);
  for (const [raw, { rev, cnt }] of g.variants.entries()) {
    console.log(`    "${raw}"  →  ${fmtNaira(rev)} · ${cnt} deals`);
  }
  console.log();
}
console.log(`Total merge groups: ${mergeCount}\n`);

console.log(`\n=== ALL FINGERPRINT GROUPS (sorted by revenue) ===\n`);
for (const [fp, g] of sortedGroups) {
  const variantList = [...g.variants.keys()].join(' | ');
  console.log(`${fmtNaira(g.totalRev).padStart(15)}  ${String(g.totalCnt).padStart(4)}  [${variantList}]`);
}
console.log(`\nTotal raw variants: ${variantRevenue.size}`);
console.log(`Total fingerprint groups: ${groups.size}`);
console.log(`Variants folded: ${variantRevenue.size - groups.size}\n`);

// Quick post-ingest spot-check for ingest-marketing-expense.
//
// Dumps:
//   1. Aggregate buckets per month (one row per period_year/period_month)
//   2. Category × month matrix with row counts and total amounts
//   3. Sample row-level entries grouped by category, so keyword rules that
//      fired incorrectly are easy to spot.
//
// Read-only — uses the service-role key to bypass RLS on marketing_expenses
// / marketing_monthly. Run with: `pnpm verify:marketing`.

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const fmtNaira = (n) =>
  '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 1. Aggregate buckets.
const { data: agg, error: aggErr } = await supabase
  .from('marketing_monthly')
  .select('period_year, period_month, total_income, total_expenditure, by_category, refreshed_at')
  .order('period_year', { ascending: true })
  .order('period_month', { ascending: true });
if (aggErr) throw aggErr;

console.log('=== marketing_monthly buckets ===');
for (const r of agg ?? []) {
  console.log(
    `${r.period_year}-${String(r.period_month).padStart(2, '0')}  ` +
      `income=${fmtNaira(r.total_income)}  expenditure=${fmtNaira(r.total_expenditure)}  ` +
      `categories=${Object.keys(r.by_category ?? {}).length}`,
  );
}

// 2. Category × month matrix. Pull categories first for name resolution.
const { data: cats, error: catErr } = await supabase
  .from('expense_categories')
  .select('id, name, display_order')
  .order('display_order', { ascending: true });
if (catErr) throw catErr;
const catNameById = new Map((cats ?? []).map((c) => [c.id, c.name]));

const { data: rows, error: rowsErr } = await supabase
  .from('marketing_expenses')
  .select('period_year, period_month, expense_category_id, amount, description, source_tab')
  .order('period_year', { ascending: true })
  .order('period_month', { ascending: true });
if (rowsErr) throw rowsErr;

// matrix[category][period] = { count, total }
const matrix = new Map();
for (const r of rows ?? []) {
  const catName = catNameById.get(r.expense_category_id) ?? '(uncategorized)';
  const period = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
  if (!matrix.has(catName)) matrix.set(catName, new Map());
  const periodMap = matrix.get(catName);
  if (!periodMap.has(period)) periodMap.set(period, { count: 0, total: 0 });
  const cell = periodMap.get(period);
  cell.count += 1;
  cell.total += Number(r.amount);
}

console.log('\n=== category × month matrix (count / total) ===');
const orderedCats = [...(cats ?? []).map((c) => c.name), '(uncategorized)'];
for (const catName of orderedCats) {
  if (!matrix.has(catName)) continue;
  const periodMap = matrix.get(catName);
  const totalRows = [...periodMap.values()].reduce((s, c) => s + c.count, 0);
  const totalAmount = [...periodMap.values()].reduce((s, c) => s + c.total, 0);
  console.log(`\n${catName}  [${totalRows} rows, ${fmtNaira(totalAmount)} total]`);
  const periods = [...periodMap.keys()].sort();
  for (const p of periods) {
    const cell = periodMap.get(p);
    console.log(`    ${p}  ${cell.count} rows  ${fmtNaira(cell.total)}`);
  }
}

// 3. Sample descriptions per category (up to 5 per category) so the supervisor
// (and us) can eyeball whether the keyword rules made sensible choices.
console.log('\n=== sample descriptions per category (up to 5 each) ===');
const byCat = new Map();
for (const r of rows ?? []) {
  const catName = catNameById.get(r.expense_category_id) ?? '(uncategorized)';
  if (!byCat.has(catName)) byCat.set(catName, []);
  byCat.get(catName).push(r);
}
for (const catName of orderedCats) {
  if (!byCat.has(catName)) continue;
  console.log(`\n${catName}:`);
  for (const r of byCat.get(catName).slice(0, 5)) {
    console.log(
      `    ${r.period_year}-${String(r.period_month).padStart(2, '0')}  ${fmtNaira(r.amount).padStart(15)}  "${r.description ?? '(blank)'}"`,
    );
  }
  const more = byCat.get(catName).length - 5;
  if (more > 0) console.log(`    ... and ${more} more`);
}

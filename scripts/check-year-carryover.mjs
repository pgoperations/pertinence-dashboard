// Read-only carryover check for the year-tab discovery (2027 and beyond).
//
// Lists each source spreadsheet's tab titles and applies the SAME regex
// patterns the ingest Edge Functions use (see _shared/yearTabs.ts +
// _shared/parseMarketingTab.ts), then reports which tabs would be ingested and
// which years are present. Nothing is written — it only reads tab names, so
// it's safe to run against the live sheets anytime.
//
// Use it to (a) confirm the 2026 tabs match today, and (b) after the supervisor
// adds a "2027 …" tab, re-run to prove discovery picks it up — before any real
// ingest writes 2027 data.
//
// Run: node --env-file=.env.local scripts/check-year-carryover.mjs

import { google } from 'googleapis';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
if (!email || !rawKey) {
  console.error('Missing SHEETS_SERVICE_ACCOUNT_EMAIL / SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY in .env.local');
  process.exit(1);
}

const MIN_YEAR = 2026;
const MAX_YEAR = new Date().getUTCFullYear() + 1; // matches the ingests' upper bound
const inRange = (y) => Number.isFinite(y) && y >= MIN_YEAR && y <= MAX_YEAR;

// Mirrors NON_REP_TABS in _shared/parseCustomerSupport.ts.
const NON_REP_TABS = new Set(
  ['Staff_Reference', 'Rep ID', 'Rep_ID', 'ABIDEMI', 'VICTORIA', 'New Customer File', '_Categories'].map((s) =>
    s.toLowerCase(),
  ),
);

const SOURCES = [
  {
    envVar: 'SHEET_ID_BANK_DEPOSIT',
    label: 'Bank Deposit Mirror',
    patterns: [
      { name: 'Bank Deposit (financial source of truth)', re: /^(\d{4}) LAND$/ },
      { name: 'Weekly Sales', re: /^(\d{4}) Weekly Sales Report$/ },
      { name: 'Customer File', re: /^(\d{4}) Customer File$/ },
    ],
  },
  {
    envVar: 'SHEET_ID_MARKETING_EXPENSE',
    label: 'Marketing Fund Expense',
    patterns: [{ name: 'Monthly expense tabs ("<Month> <Year>")', re: /^([A-Za-z]+) (\d{4})$/, yearGroup: 2 }],
  },
  {
    envVar: 'SHEET_ID_REALTOR_MANAGERS_WEEKLY',
    label: 'Marketing Team Reporting Template',
    patterns: [
      { name: 'Realtor Managers Weekly', re: /^(\d{4}) Realtors Managers Weekly Report$/ },
      { name: 'Media Team Reporting (per-year tabs)', re: /^(\d{4}) Media Team Reporting$/ },
    ],
    notes: [
      'Digital Marketing: 2027 is a NEW SECTION inside the existing "Digital Marketing" tab (anchored on a literal 2027 cell) — NOT a new tab. Auto-found once added.',
      'Media: now one tab per year ("<year> Media Team Reporting"). Each tab must hold ONLY that year — the grid has no in-cell year marker, so a tab mixing 2025+2026 would be tagged as one year.',
    ],
  },
  {
    envVar: 'SHEET_ID_CUSTOMER_SUPPORT',
    label: 'Customer Support Master',
    repTabs: true,
    notes: ['No year concept — a continuous log. New REP tabs are auto-detected (any tab that is not excluded and matches the complaint-log template).'],
  },
];

const auth = new google.auth.JWT({
  email,
  key: rawKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function listTabTitles(spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (res.data.sheets ?? []).map((s) => s.properties.title);
}

console.log(`Year-tab carryover check — ingest window ${MIN_YEAR}..${MAX_YEAR}\n`);

let problems = 0;

for (const src of SOURCES) {
  const spreadsheetId = process.env[src.envVar];
  console.log(`\n=== ${src.label}  (${src.envVar}) ===`);
  if (!spreadsheetId) {
    console.log(`  ⚠ ${src.envVar} not set — skipped`);
    continue;
  }

  let titles;
  try {
    titles = await listTabTitles(spreadsheetId);
  } catch (err) {
    console.log(`  ✗ could not read tabs: ${err?.errors?.[0]?.message ?? err?.message ?? err}`);
    problems++;
    continue;
  }

  for (const pat of src.patterns ?? []) {
    const yg = pat.yearGroup ?? 1;
    const matched = [];
    for (const t of titles) {
      const m = pat.re.exec(t.trim());
      if (!m) continue;
      const year = Number(m[yg]);
      if (inRange(year)) matched.push({ title: t, year });
    }
    const years = [...new Set(matched.map((x) => x.year))].sort();
    const has2027 = years.includes(2027);
    console.log(`  • ${pat.name}`);
    console.log(`      pattern: ${pat.re}`);
    if (matched.length === 0) {
      console.log('      matches: (none)  ✗ — no tab matches this pattern');
      problems++;
    } else {
      console.log(`      matches: ${matched.map((x) => `"${x.title}"`).join(', ')}`);
      console.log(`      years:   ${years.join(', ')}   2027 present: ${has2027 ? '✓ yes' : '— not yet'}`);
    }
  }

  if (src.repTabs) {
    const repTabs = titles.filter((t) => !NON_REP_TABS.has(t.trim().toLowerCase()));
    console.log(`  • Rep tabs that would be auto-detected (non-excluded):`);
    console.log(`      ${repTabs.map((t) => `"${t}"`).join(', ') || '(none)'}`);
    console.log(`      (each is also validated for a Date + Status-of-Complaint header at ingest)`);
  }

  for (const note of src.notes ?? []) console.log(`  ⓘ ${note}`);
}

console.log(`\n${problems === 0 ? '✓ All current-year patterns matched.' : `✗ ${problems} pattern(s) found no match — check the tab names above.`}`);
console.log('Re-run after adding a "2027 …" tab to confirm it is discovered before the real ingest runs.');

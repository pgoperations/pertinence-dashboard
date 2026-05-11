// One-shot: dump unique values + counts for the PURPOSE and LOCATION columns
// on Bank Deposit Mirror "2026 LAND". Used to draft canonical mappings before
// seeding the `locations` / `purposes` / `*_aliases` reference tables.
//
// Run: pnpm dump:canonicals

import { google } from 'googleapis';
import { writeFile } from 'node:fs/promises';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env.SHEET_ID_BANK_DEPOSIT;

if (!email || !rawKey || !sheetId) {
  console.error('Missing env: SHEETS_SERVICE_ACCOUNT_EMAIL / SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY / SHEET_ID_BANK_DEPOSIT');
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key: rawKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Columns E (PURPOSE) and F (LOCATION). Skip header by starting at row 2.
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: '2026 LAND!E2:F',
});
const rows = res.data.values ?? [];

const purposeCounts = new Map();
const locationCounts = new Map();

for (const row of rows) {
  const [purpose, location] = row;
  if (purpose && purpose.trim()) {
    purposeCounts.set(purpose, (purposeCounts.get(purpose) ?? 0) + 1);
  }
  if (location && location.trim()) {
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
  }
}

function format(label, counts) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const lines = [`## ${label} — ${counts.size} unique`];
  lines.push('');
  lines.push('| Count | Raw value |');
  lines.push('| ----: | --------- |');
  for (const [val, count] of sorted) {
    // Use JSON.stringify to make leading/trailing/internal whitespace visible.
    lines.push(`| ${count} | \`${JSON.stringify(val)}\` |`);
  }
  return lines.join('\n');
}

const out = [
  `# Bank Deposit \`2026 LAND\` — canonical mapping inputs`,
  ``,
  `Pulled ${new Date().toISOString()} via the service account. Data rows scanned: **${rows.length}**.`,
  ``,
  format('PURPOSE (column E)', purposeCounts),
  ``,
  format('LOCATION (column F)', locationCounts),
  ``,
].join('\n');

await writeFile('data/bank_deposit_canonical_inputs.md', out);
console.log(`Wrote data/bank_deposit_canonical_inputs.md`);
console.log(`PURPOSE unique: ${purposeCounts.size}`);
console.log(`LOCATION unique: ${locationCounts.size}`);
console.log(`Rows scanned: ${rows.length}`);

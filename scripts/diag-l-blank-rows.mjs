// Find rows on 2026 LAND where column L is blank but column A is non-blank.
// These are the rows that hit our `date_fallback_to_a` path. Some are recent
// tail entries the supervisor hasn't filled L for; others may be older rows
// with M/D/Y-swapped A values that shouldn't be trusted as the date source.

import { google } from 'googleapis';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env.SHEET_ID_BANK_DEPOSIT;
if (!email || !rawKey || !sheetId) {
  console.error('Missing env vars.');
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key: rawKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: '2026 LAND!A2:M',
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'SERIAL_NUMBER',
});
const rows = res.data.values ?? [];

function isBlank(v) { return v === '' || v === null || v === undefined; }

function serialToIso(s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(s) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dmyToIso(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]); let y = Number(m[3]);
  if (y < 100) y += 2000;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parse(v) { return serialToIso(v) ?? dmyToIso(v); }

console.log(`Rows where L is blank but A has a value:\n`);
console.log('  sheet#   A raw                A decoded     amount          purpose                client');
console.log('  ' + '-'.repeat(120));
let count = 0;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i] ?? [];
  const a = row[0];
  const l = row[11];
  if (!isBlank(l)) continue;
  if (isBlank(a)) continue;
  count++;
  const aIso = parse(a) ?? '(unparseable)';
  const amount = row[2] ?? 0;
  const purpose = row[4] ?? '';
  const client = row[8] ?? '';
  console.log(
    `  ${String(i + 2).padEnd(8)} ${String(a).padEnd(20).slice(0, 20)} ${aIso.padEnd(13)} ${String(amount).padStart(12)}  ${String(purpose).padEnd(22).slice(0, 22)} ${client}`,
  );
}
console.log(`\nTotal: ${count} rows`);

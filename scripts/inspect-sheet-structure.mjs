// One-shot inspector: list tabs in a Google Sheet and dump the header
// region of a chosen tab. Used to verify supervisor-shipped sheet changes
// (e.g. the Category dropdown column on Marketing Fund Expense, the new
// 2026 tab on Marketing Team Reporting Template) before any ingest code
// goes near them.
//
// Run with:
//   node --env-file=.env.local scripts/inspect-sheet-structure.mjs <SHEET_ID_ENV_VAR> [tab-name] [range-suffix]
//
// Examples:
//   node --env-file=.env.local scripts/inspect-sheet-structure.mjs SHEET_ID_MARKETING_EXPENSE
//     -> lists tabs only
//   node --env-file=.env.local scripts/inspect-sheet-structure.mjs SHEET_ID_MARKETING_EXPENSE "May 2026" A1:K20
//     -> lists tabs AND dumps that range from "May 2026"

import { google } from 'googleapis';

const [, , sheetIdEnvVar, tabName, rangeSuffix] = process.argv;

if (!sheetIdEnvVar) {
  console.error('Usage: inspect-sheet-structure.mjs <SHEET_ID_ENV_VAR> [tab-name] [range-suffix]');
  process.exit(1);
}

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env[sheetIdEnvVar];

if (!email || !rawKey || !sheetId) {
  console.error(`Missing env vars. Need SHEETS_SERVICE_ACCOUNT_EMAIL, SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY, and ${sheetIdEnvVar}.`);
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

try {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' });
  const tabs = (meta.data.sheets ?? []).map((s) => s.properties);
  console.log(`Tabs in ${sheetIdEnvVar} (${tabs.length}):`);
  for (const t of tabs) {
    console.log(`  - ${t.title}  (sheetId=${t.sheetId}, rows=${t.gridProperties?.rowCount}, cols=${t.gridProperties?.columnCount})`);
  }

  if (tabName) {
    const range = `${tabName}!${rangeSuffix ?? 'A1:N15'}`;
    console.log(`\nDump of ${range}:`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const rows = res.data.values ?? [];
    rows.forEach((row, i) => {
      console.log(`  row ${i + 1}:`, row);
    });
  }
} catch (err) {
  console.error('Inspect failed:');
  console.error(err?.errors ?? err?.message ?? err);
  process.exit(1);
}

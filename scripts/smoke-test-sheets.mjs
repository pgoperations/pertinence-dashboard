// Smoke-test for the Google Sheets service account auth path.
//
// Confirms the service-account credentials in .env.local can read from a
// sheet that's been shared with the service account email. This is the
// last manual gate before any ingest Edge Function code gets written —
// if this script prints rows, every later ingest is just plumbing.
//
// Run with: node --env-file=.env.local scripts/smoke-test-sheets.mjs

import { google } from 'googleapis';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env.SMOKE_TEST_SHEET_ID;
const range = process.env.SMOKE_TEST_RANGE;

const missing = [];
if (!email) missing.push('SHEETS_SERVICE_ACCOUNT_EMAIL');
if (!rawKey) missing.push('SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY');
if (!sheetId) missing.push('SMOKE_TEST_SHEET_ID');
if (!range) missing.push('SMOKE_TEST_RANGE');
if (missing.length) {
  console.error('Missing env vars in .env.local:', missing.join(', '));
  process.exit(1);
}

// .env files store the private key with literal \n sequences; restore real newlines.
const privateKey = rawKey.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

try {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  const rows = res.data.values ?? [];
  console.log(`OK — read ${rows.length} row(s) from ${range}:`);
  for (const row of rows) {
    console.log(row);
  }
} catch (err) {
  console.error('Sheets read failed:');
  console.error(err?.errors ?? err?.message ?? err);
  process.exit(1);
}

// One-shot: sum the AMOUNT column (col C) on `2026 LAND` straight from the
// sheet, and break it down by month and (optionally) purpose. Used to reconcile
// our ₦465.64M against the supervisor's Apps Script dashboard ₦670.2M.
//
// Run: node --env-file=.env.local scripts/sum-bank-deposit-amount.mjs

import { google } from 'googleapis';
import { writeFileSync } from 'node:fs';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env.SHEET_ID_BANK_DEPOSIT;

if (!email || !rawKey || !sheetId) {
  console.error('Missing SHEETS_SERVICE_ACCOUNT_* env vars or SHEET_ID_BANK_DEPOSIT.');
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Read A:M, the same range the ingest reads. UNFORMATTED_VALUE so we get raw numbers.
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: '2026 LAND!A2:M',
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'SERIAL_NUMBER',
});
const rows = res.data.values ?? [];

// Col indexes (0-based) — same as the ingest's COL constants.
const COL = { DATE: 0, AMOUNT: 2, PURPOSE: 4, LOCATION: 5 };

// Mirrors parseDmyTextDate in _shared/sheetsAuth.ts — rejects year > 2100
// so the 3036 typos return null and DON'T update lastValidDate.
function dmyToIsoDate(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function serialToIsoDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2100) return null; // match the text-parser guard
  const yyyy = String(y);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseSheetDate(value) {
  return serialToIsoDate(value) ?? dmyToIsoDate(value);
}

// Mirrors the ingest's section-anchor M/D/Y correction.
function collectAnchors(rows) {
  const a = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.[COL.DATE];
    if (typeof raw !== 'string') continue;
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(raw);
    if (!m) continue;
    if (Number(m[1]) <= 12) continue;
    const parsed = dmyToIsoDate(raw);
    if (!parsed) continue;
    const [y, mo] = parsed.split('-').map(Number);
    a.push({ sheetRow: i + 2, year: y, month: mo });
  }
  return a;
}

function sectionMonthFor(sheetRow, anchors) {
  if (anchors.length === 0) return null;
  let backward = null, forward = null;
  for (const a of anchors) {
    if (a.sheetRow <= sheetRow) backward = a;
    else { forward = a; break; }
  }
  if (!backward) return forward;
  if (!forward) return backward;
  return (sheetRow - backward.sheetRow) <= (forward.sheetRow - sheetRow) ? backward : forward;
}

function swapDayMonth(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, d - 1, m));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== d - 1 || dt.getUTCDate() !== m) return null;
  return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
}

function parseRowDateCorrected(raw, sheetRow, anchors) {
  if (typeof raw === 'number') {
    const iso = serialToIsoDate(raw);
    if (!iso) return null;
    const section = sectionMonthFor(sheetRow, anchors);
    if (!section) return iso;
    const [y, m] = iso.split('-').map(Number);
    if (y === section.year && m === section.month) return iso;
    const swapped = swapDayMonth(iso);
    if (swapped) {
      const [sy, sm] = swapped.split('-').map(Number);
      if (sy === section.year && sm === section.month) return swapped;
    }
    return iso;
  }
  if (typeof raw === 'string' && raw.trim()) return dmyToIsoDate(raw);
  return null;
}

function parseAmount(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.\-]/g, '');
    if (!cleaned) return null;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const fmtNaira = (n) =>
  '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let total = 0;
let totalRowsWithAmount = 0;
let totalRowsBlankAmount = 0;
const byMonth = new Map();
const byPurpose = new Map();
const byNoDate = { count: 0, total: 0 };
let unparseableDateRows = 0;
let forwardFilledRows = 0;
let mdyCorrectedRows = 0;

// Same anchor set as the ingest.
const anchors = collectAnchors(rows);

// Forward-fill mirrors ingest-bank-deposit/index.ts: non-blank but unparseable
// dates (year > 2100, etc.) flag the row as unparseable AND do NOT update
// lastValidDate.
let lastValidDate = null;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i] ?? [];
  if (!row.some((c) => c !== '' && c !== null && c !== undefined)) continue;

  const rawDate = row[COL.DATE];
  const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;
  const sheetRow = i + 2;

  let txnDate = null;
  let unparseable = false;
  if (dateIsEmpty) {
    txnDate = lastValidDate; // forward-fill
    if (txnDate) forwardFilledRows++;
  } else {
    const naive = parseSheetDate(rawDate);
    txnDate = parseRowDateCorrected(rawDate, sheetRow, anchors);
    if (txnDate === null) {
      unparseable = true;
      unparseableDateRows++;
    } else {
      if (naive && naive !== txnDate) mdyCorrectedRows++;
      lastValidDate = txnDate;
    }
  }

  const amt = parseAmount(row[COL.AMOUNT]);
  if (amt == null) {
    totalRowsBlankAmount++;
    continue;
  }
  totalRowsWithAmount++;
  total += amt;

  const purpose = (row[COL.PURPOSE] ?? '').toString().trim() || '(blank)';
  byPurpose.set(purpose, (byPurpose.get(purpose) ?? 0) + amt);

  if (txnDate) {
    const ym = txnDate.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + amt);
  } else {
    // unparseable or no last-valid yet — these become NULL txn_date in DB.
    byNoDate.count++;
    byNoDate.total += amt;
  }
  void unparseable;
}

console.log(`Rows read: ${rows.length}`);
console.log(`Rows with amount: ${totalRowsWithAmount}`);
console.log(`Rows with blank/non-numeric amount: ${totalRowsBlankAmount}`);
console.log(`Rows with unparseable date (DB stores txn_date=null): ${unparseableDateRows}`);
console.log(`Rows forward-filled from a previous valid date: ${forwardFilledRows}`);
console.log(`Rows with M/D/Y serial date corrected by section anchor: ${mdyCorrectedRows}`);

console.log(`\n=== TOTAL AMOUNT (2026 LAND, col C, all rows) ===`);
console.log(`  ${fmtNaira(total)}`);

console.log(`\n=== By month (after forward-fill, mirrors DB.txn_date) ===`);
for (const ym of [...byMonth.keys()].sort()) {
  console.log(`  ${ym}  ${fmtNaira(byMonth.get(ym))}`);
}
if (byNoDate.count > 0) {
  console.log(`  (DB txn_date=null)  ${fmtNaira(byNoDate.total)}  [${byNoDate.count} rows]`);
}

// What our dashboard's H1 2026 preset would show.
const h1Start = '2026-01';
const h1End = '2026-06';
let h1Total = 0;
for (const [ym, amt] of byMonth) {
  if (ym >= h1Start && ym <= h1End) h1Total += amt;
}

// YTD (Jan 1 to today). Today is the script's run date.
const today = new Date();
const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
let ytdTotal = 0;
// We bucketed by month only, so we approximate YTD as full months Jan..currentMonth-1
// + best-effort current month (which over-counts if today is mid-month and there
// are future-dated entries within the current month bucket).
const ytdMonthEnd = todayIso.slice(0, 7);
for (const [ym, amt] of byMonth) {
  if (ym >= '2026-01' && ym <= ytdMonthEnd) ytdTotal += amt;
}

console.log(`\n=== What our dashboard would show ===`);
console.log(`  H1 2026 (Jan 1 – Jun 30):  ${fmtNaira(h1Total)}`);
console.log(`  YTD (Jan 1 – ${todayIso}):  ${fmtNaira(ytdTotal)}  (month-level approximation)`);

console.log(`\n=== What supervisor's dashboard shows ===`);
console.log(`  All rows, no date filter:  ${fmtNaira(total)}`);
console.log(`  Gap = future-dated + unparseable / forward-fill quirks`);

console.log(`\n=== By PURPOSE (top 15 by total) ===`);
const purposes = [...byPurpose.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [p, t] of purposes) {
  console.log(`  ${fmtNaira(t).padStart(20)}  ${p}`);
}

// Second pass: rows whose forward-filled, CORRECTED date is still outside H1.
// These are the rows the section-anchor algorithm couldn't fix automatically.
const futureRows = [];
{
  let lvd = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (!row.some((c) => c !== '' && c !== null && c !== undefined)) continue;
    const rawDate = row[COL.DATE];
    const dateIsEmpty = rawDate === '' || rawDate === undefined || rawDate === null;
    let txnDate;
    if (dateIsEmpty) txnDate = lvd;
    else {
      txnDate = parseRowDateCorrected(rawDate, i + 2, anchors);
      if (txnDate) lvd = txnDate;
    }
    if (!txnDate) continue;
    if (txnDate >= '2026-01-01' && txnDate <= '2026-06-30') continue; // in H1
    const amt = parseAmount(row[COL.AMOUNT]);
    if (amt == null) continue;
    futureRows.push({
      sheetRow: i + 2,
      txnDate,
      amount: amt,
      purpose: (row[COL.PURPOSE] ?? '').toString().trim() || '(blank)',
      location: (row[COL.LOCATION] ?? '').toString().trim() || '(blank)',
      client: (row[8] ?? '').toString().trim() || '(blank)', // CLIENT NAME col I
    });
  }
}
console.log(`\n=== FUTURE-DATED rows (txn_date > ${todayIso}) ===`);
console.log(`  ${futureRows.length} rows totalling ${fmtNaira(futureRows.reduce((a, r) => a + r.amount, 0))}`);
console.log(`  (These are excluded from any date-filtered dashboard view in our app)\n`);
const futureByPurpose = new Map();
const futureByMonth = new Map();
for (const r of futureRows) {
  futureByPurpose.set(r.purpose, (futureByPurpose.get(r.purpose) ?? 0) + r.amount);
  const ym = r.txnDate.slice(0, 7);
  futureByMonth.set(ym, (futureByMonth.get(ym) ?? 0) + r.amount);
}
console.log(`  By month:`);
for (const ym of [...futureByMonth.keys()].sort()) {
  console.log(`    ${ym}  ${fmtNaira(futureByMonth.get(ym))}`);
}
console.log(`  By purpose (top 10):`);
const futurePurposes = [...futureByPurpose.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [p, t] of futurePurposes) {
  console.log(`    ${fmtNaira(t).padStart(20)}  ${p}`);
}
// CSV dump for supervisor handoff.
const csvLines = ['sheet_row,parsed_date,amount,purpose,location,client'];
for (const r of futureRows) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  csvLines.push(
    [r.sheetRow, r.txnDate, r.amount, esc(r.purpose), esc(r.location), esc(r.client)].join(','),
  );
}
writeFileSync('data/future_dated_bank_deposit_rows.csv', csvLines.join('\n') + '\n');
console.log(`\nCSV written to data/future_dated_bank_deposit_rows.csv`);

// Locate any year > 2100 rows (the section-anchor algorithm's blind spot when
// the wrongly-typed year combines with a month that doesn't match the section).
console.log(`\n=== ROWS WITH YEAR > 2100 (year-typo candidates) ===`);
for (let i = 0; i < rows.length; i++) {
  const raw = rows[i]?.[COL.DATE];
  if (raw === '' || raw === null || raw === undefined) continue;
  let y = null, m = null, d = null;
  if (typeof raw === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
  } else if (typeof raw === 'string') {
    const mt = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(raw);
    if (mt) {
      d = Number(mt[1]); m = Number(mt[2]); y = Number(mt[3]);
      if (y < 100) y += 2000;
    }
  }
  if (y === null || y <= 2100) continue;
  const amt = parseAmount(rows[i][COL.AMOUNT]);
  console.log(
    `  sheet row ${i + 2}  raw="${raw}"  parsed=${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}  ${fmtNaira(amt ?? 0).padStart(16)}  ` +
    `purpose="${rows[i][COL.PURPOSE] ?? ''}"  client="${rows[i][8] ?? ''}"`,
  );
}

// Full row list — for the supervisor to action against the source sheet.
console.log(`\n=== ALL ${futureRows.length} FUTURE-DATED ROWS (for supervisor review) ===`);
console.log(
  '  ' +
  'sheet row'.padEnd(11) +
  'parsed date'.padEnd(14) +
  'amount'.padStart(16) + '  ' +
  'purpose'.padEnd(22) +
  'location'.padEnd(18) +
  'client'
);
console.log('  ' + '-'.repeat(120));
for (const r of futureRows) {
  console.log(
    '  ' +
    String(r.sheetRow).padEnd(11) +
    r.txnDate.padEnd(14) +
    fmtNaira(r.amount).padStart(16) + '  ' +
    r.purpose.padEnd(22).slice(0, 22) +
    r.location.padEnd(18).slice(0, 18) +
    r.client
  );
}

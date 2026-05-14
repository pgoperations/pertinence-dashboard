// One-shot: dump unique values + counts from the 5 active Customer Support
// rep tabs (CATHERINE / MARIAM / MARY / YETUNDE / LOVINAL). Used to draft
// canonical mappings for the `complaint_categories` reference table before
// seeding via migration 014.
//
// Mirrors the Bank Deposit canonical dump pattern.
//
// Three columns are gathered:
//
//   * "Nature of Complaint" (col H, index 7) — REQUIRES canonical mapping.
//     Brief flagged "Documentaion" typo as a known case; the supervisor will
//     approve the canonical list + aliases from this output.
//
//   * "Channel of Complaint" (col J, index 9) — included for the supervisor
//     to eyeball. No canonical mapping planned today (channel goes straight
//     into customer_support_logs.channel as text), but if the spread shows
//     typos worth normalizing, we'll loop back.
//
//   * "Status of Complaint" (col N, index 13) — same reasoning. Goes into
//     resolution_status as text; surfaced here so the supervisor can confirm
//     values are PENDING/RESOLVED and not a long-tail of variants.
//
// Run: pnpm dump:cs-canonicals

import { google } from 'googleapis';
import { writeFile } from 'node:fs/promises';

const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
const sheetId = process.env.SHEET_ID_CUSTOMER_SUPPORT;

if (!email || !rawKey || !sheetId) {
  console.error('Missing env: SHEETS_SERVICE_ACCOUNT_EMAIL / SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY / SHEET_ID_CUSTOMER_SUPPORT');
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key: rawKey.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const REP_TABS = ['CATHERINE', 'MARIAM', 'MARY', 'YETUNDE', 'LOVINAL'];

// Indices within the rows returned by reading A2:N — cells include the empty
// col A. Reference CATHERINE row 1 header inspection (2026-05-14).
const COL = {
  NATURE_OF_COMPLAINT: 7,   // column H
  CHANNEL: 9,               // column J
  STATUS: 13,               // column N
};

// rep -> { natureCounts, channelCounts, statusCounts, dataRows }
const perRep = {};
const totalNatureCounts = new Map();
const totalChannelCounts = new Map();
const totalStatusCounts = new Map();

for (const rep of REP_TABS) {
  const range = `${rep}!A2:N`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  const rows = res.data.values ?? [];

  const natureCounts = new Map();
  const channelCounts = new Map();
  const statusCounts = new Map();

  for (const row of rows) {
    const nature = row[COL.NATURE_OF_COMPLAINT];
    const channel = row[COL.CHANNEL];
    const status = row[COL.STATUS];

    if (nature && String(nature).trim()) {
      natureCounts.set(nature, (natureCounts.get(nature) ?? 0) + 1);
      totalNatureCounts.set(nature, (totalNatureCounts.get(nature) ?? 0) + 1);
    }
    if (channel && String(channel).trim()) {
      channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
      totalChannelCounts.set(channel, (totalChannelCounts.get(channel) ?? 0) + 1);
    }
    if (status && String(status).trim()) {
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      totalStatusCounts.set(status, (totalStatusCounts.get(status) ?? 0) + 1);
    }
  }

  // Count populated complaint rows (any of the three CS fields present).
  let populated = 0;
  for (const row of rows) {
    if (
      (row[COL.NATURE_OF_COMPLAINT] && String(row[COL.NATURE_OF_COMPLAINT]).trim()) ||
      (row[COL.CHANNEL] && String(row[COL.CHANNEL]).trim()) ||
      (row[COL.STATUS] && String(row[COL.STATUS]).trim())
    ) populated++;
  }

  perRep[rep] = { natureCounts, channelCounts, statusCounts, rowsScanned: rows.length, populated };
  console.log(`${rep}: ${rows.length} rows scanned, ${populated} populated, ${natureCounts.size} unique complaints`);
}

function formatCounts(label, counts) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const lines = [`### ${label} — ${counts.size} unique`];
  lines.push('');
  lines.push('| Count | Raw value |');
  lines.push('| ----: | --------- |');
  for (const [val, count] of sorted) {
    // JSON.stringify preserves surrounding whitespace / line breaks so the
    // supervisor sees what's actually in the cell.
    lines.push(`| ${count} | \`${JSON.stringify(val)}\` |`);
  }
  return lines.join('\n');
}

const out = [];
out.push(`# Customer Support — canonical mapping inputs`);
out.push('');
out.push(`Pulled ${new Date().toISOString()} via the service account.`);
out.push('');
out.push('Tabs scanned: ' + REP_TABS.join(', ') + '.');
out.push('');
out.push(`## Per-rep populated-row counts`);
out.push('');
out.push('| Rep | Rows scanned | Populated rows | Unique complaints |');
out.push('| --- | -----------: | -------------: | ----------------: |');
for (const rep of REP_TABS) {
  const s = perRep[rep];
  out.push(`| ${rep} | ${s.rowsScanned} | ${s.populated} | ${s.natureCounts.size} |`);
}
out.push('');

out.push('## Across-rep totals');
out.push('');
out.push(formatCounts('Nature of Complaint (col H) — REQUIRES canonical mapping', totalNatureCounts));
out.push('');
out.push(formatCounts('Channel of Complaint (col J) — eyeball for normalization need', totalChannelCounts));
out.push('');
out.push(formatCounts('Status of Complaint (col N) — eyeball for normalization need', totalStatusCounts));
out.push('');

// Per-rep "Nature of Complaint" so the supervisor can see whether different
// reps use different terms for the same thing.
for (const rep of REP_TABS) {
  out.push(`## ${rep}`);
  out.push('');
  out.push(formatCounts('Nature of Complaint', perRep[rep].natureCounts));
  out.push('');
}

await writeFile('data/customer_support_canonical_inputs.md', out.join('\n'));
console.log('\nWrote data/customer_support_canonical_inputs.md');
console.log(`Total unique Nature of Complaint: ${totalNatureCounts.size}`);
console.log(`Total unique Channel: ${totalChannelCounts.size}`);
console.log(`Total unique Status: ${totalStatusCounts.size}`);

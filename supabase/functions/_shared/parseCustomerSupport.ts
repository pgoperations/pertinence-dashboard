// Customer Support rep-tab parsing helpers.
//
// One tab per active rep. Each tab carries TWO logical sections per row: the
// complaint log (columns A–N in the inspection) and a "Special Tasks" block
// (columns O–AC) that v1 ignores. The reading range here stays in the
// complaint section.
//
// Header positions verified 2026-05-14 against the CATHERINE tab — same
// shape across the 5 active reps (per Rep_ID): a leading blank spacer (col A),
// then S/N, Date, Time, Type of Customer, Customer/ Realtor Name,
// Location or Product Purchased, Nature of Complaint, Status Update,
// Channel, Team Escalated, Means of Escalation, Feedback, Status of Complaint.

// Indices within the row arrays returned by reading `A2:N` from a rep tab.
// (Col A is an empty leading spacer in the source sheet — kept in the read so
// the column letters in the comments below match human intuition.)
export const COL = {
  // 0: blank spacer (col A)
  S_N: 1,                  // B
  DATE: 2,                 // C
  TIME: 3,                 // D
  TYPE_OF_CUSTOMER: 4,     // E
  CUSTOMER_NAME: 5,        // F — "Customer/ Realtor Name"
  LOCATION_OR_PRODUCT: 6,  // G
  NATURE_OF_COMPLAINT: 7,  // H — REQUIRES canonical mapping; composite-splittable
  STATUS_UPDATE: 8,        // I
  CHANNEL: 9,              // J
  TEAM_ESCALATED: 10,      // K
  MEANS_OF_ESCALATION: 11, // L
  FEEDBACK: 12,            // M
  STATUS_OF_COMPLAINT: 13, // N
} as const;

// Header keys for the `raw_row` jsonb on customer_support_logs. Stable contract
// for downstream querying / data-quality views.
export const RAW_ROW_KEYS = [
  '_spacer',
  'S/N',
  'Date',
  'Time',
  'Type of Customer',
  'Customer/ Realtor Name',
  'Location or Product Purchased',
  'Nature of Complaint',
  'Status Update on the Complaint',
  'Channel of Complaint',
  'Team Escalated',
  'Means of Escalation',
  'Feedback from Escalation',
  'Status of Complaint',
] as const;

// The originally-seeded 5 active reps (2026-05-14). Kept for reference; the
// ingest no longer iterates this list — it DISCOVERS rep tabs dynamically so a
// newly-added rep tab is picked up without a code change (2026-06-05). Tab
// names on the source sheet are uppercase; seeded customer_service_reps.name
// values are mixed-case ("Catherine"), resolved via a lower-case lookup.
export const REP_TABS = ['CATHERINE', 'MARIAM', 'MARY', 'YETUNDE', 'LOVINAL'] as const;
export type RepTab = (typeof REP_TABS)[number];

// Tabs in the Customer Support master spreadsheet that are NOT rep complaint
// logs. Mirrors the Apps Script portal's EXCLUDED_SHEETS plus the other known
// non-rep tabs. Compared case-insensitively against the trimmed tab name.
// ABIDEMI / VICTORIA are inactive reps — excluded exactly as the portal does.
export const NON_REP_TABS = new Set(
  [
    'Staff_Reference',
    'Rep ID',
    'Rep_ID',
    'ABIDEMI',
    'VICTORIA',
    'New Customer File',
    '_Categories',
  ].map((s) => s.toLowerCase()),
);

function normHeader(h: unknown): string {
  return (h == null ? '' : String(h)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// A tab is a rep complaint log if its header row carries Date + Status-of-
// Complaint columns at the fixed template positions we parse by index. New rep
// tabs follow the same template, so this validates the layout AND screens out
// any stray non-rep tab the exclusion list missed.
export function isRepTabHeader(headerRow: unknown[]): boolean {
  const date = normHeader(headerRow[COL.DATE]);
  const status = normHeader(headerRow[COL.STATUS_OF_COMPLAINT]);
  return date.includes('date') && status.includes('status');
}

// Quote-aware comma splitter for the "Nature of Complaint" cell.
//
// Supervisor decision 2026-05-14: composite cells like
//   `Documentaion, Site Allocation`            (2 categories, comma-separated)
//   `Refund, Termination and Movement`          (2 categories)
//   `Semi-finished Delivery, Conversion to Land, Refund`  (3 categories)
// should be split into one customer_support_logs row per category because the
// supervisor's intent is "this customer lodged multiple complaints in one log
// entry". However, some single-category values legitimately contain a comma
// when wrapped in quotes, e.g.
//   `"Special Request- Sent Payment receipts, Contract of Sale or Deed of Assignment"`
// which is ONE canonical, not three. The splitter respects double-quote
// boundaries so internal commas inside quoted segments stay together.
//
// Returns an array of trimmed non-empty parts. Empty input → empty array.
// Examples:
//   splitComposite('A, B') === ['A', 'B']
//   splitComposite('"A, B"') === ['A, B']
//   splitComposite('A, "B, C"') === ['A', 'B, C']
//   splitComposite('') === []
export function splitComposite(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue; // drop the quote char itself
    }
    if (ch === ',' && !inQuote) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

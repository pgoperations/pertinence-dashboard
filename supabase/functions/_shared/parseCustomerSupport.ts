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

// The 5 active reps per Rep_ID tab inspection (2026-05-14). Tab names on the
// source sheet are uppercase; the seeded customer_service_reps.name values
// are mixed-case ("Catherine"). The ingest does a lower-case lookup so the
// case difference is handled.
export const REP_TABS = ['CATHERINE', 'MARIAM', 'MARY', 'YETUNDE', 'LOVINAL'] as const;
export type RepTab = (typeof REP_TABS)[number];

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

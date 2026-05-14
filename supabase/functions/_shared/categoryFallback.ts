// Marketing Fund Expense: category keyword fallback.
//
// The supervisor added a Category dropdown to the source sheet on 2026-05-14
// but has not backfilled past rows. Every 2026 row currently has CATEGORY
// blank. Until the supervisor catches up — and as a permanent guard against
// future blanks or typos — every row whose CATEGORY does not resolve to a
// canonical `expense_categories` row goes through `keywordMatchCategory()`
// on its Description text.
//
// Rules below are derived from descriptions actually present on April/May
// 2026 ("SettleQuick meta Ad", "Genius Float", "Realtor Airtime",
// "MarketStorm Permit", etc., inspected 2026-05-14). They are conservative —
// only patterns we are confident point to a specific canonical fire. Anything
// the rules can't match falls to 'Miscellaneous'.
//
// Every row matched by this helper carries `fallback_category` in
// `quality_flags` regardless of whether the keyword path produced a confident
// match. That's the contract: the dashboard's data-quality view filters on
// the flag, so the supervisor can grep rows that bypassed the dropdown and
// confirm or override the auto-assignment.

const KEYWORD_RULES: Array<{ pattern: RegExp; category: string }> = [
  // Brand / product specific — these win against more generic media patterns.
  { pattern: /settle\s*quick/i, category: 'SettleQuick' },
  { pattern: /\bgenius\b/i,     category: 'Genius' },

  // Audience-specific airtime / activity. Realtor Manager Airtime is a
  // distinct canonical from the broader Realtor Activity bucket, so a
  // "realtor manager" mention must be checked before plain "realtor".
  { pattern: /realtor\s*manager/i, category: 'Realtor Manager Airtime' },

  // Channel-specific canonicals.
  { pattern: /\bsms\b/i,           category: 'SMS Purchase' },
  { pattern: /\bmsme\b/i,          category: 'MSME Campaign' },
  { pattern: /stakeholder/i,       category: 'Stakeholders Meeting' },

  // Paid-media patterns. Order: specific platforms before generic "ad".
  {
    pattern: /(meta\s*ad|facebook\s*ad|instagram\s*ad|whatsapp.*\bad\b|tiktok|youtube\s*ad|tv\s*ad|radio\s*ad|digital\s*ad)/i,
    category: 'Digital Ad Campaign',
  },
  { pattern: /\bsocial\s*media\b/i, category: 'Social Media' },

  // Realtor (non-manager) activity catch-all. Comes after the manager rule.
  { pattern: /\brealtor\b/i,        category: 'Realtor Activity' },

  // Market Storm is the supervisor's recurring corporate-marketing activation
  // line item ("Market Storm", "MarketStorm Permit", "Market Storm DJ", etc.).
  // Confirmed against April 2026 rows.
  { pattern: /(market\s*storm|marketstorm)/i, category: 'Corporate Marketing' },
];

export type KeywordMatch = {
  categoryName: string;     // canonical name (e.g. 'Realtor Activity', 'Miscellaneous')
  matchedPattern: string;   // human-readable rule that fired, for debugging in raw_row / logs
};

// Returns the canonical category name for a free-text description, plus a
// short string identifying which rule fired. Always returns a value — the
// fallback of last resort is 'Miscellaneous'. Caller is responsible for
// turning the name into an `expense_category_id` via the in-memory lookup
// map and for emitting `fallback_category` in quality_flags.
export function keywordMatchCategory(description: string | null | undefined): KeywordMatch {
  const text = (description ?? '').trim();
  if (text) {
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(text)) {
        return { categoryName: rule.category, matchedPattern: rule.pattern.source };
      }
    }
  }
  return { categoryName: 'Miscellaneous', matchedPattern: 'fallback:none' };
}

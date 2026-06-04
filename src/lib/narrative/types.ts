// Rule-based narrative engine — step 8 of the roadmap.
//
// Design note (2026-06-04): narratives are generated CLIENT-SIDE from the data
// each page already loads, for the active global date range — NOT cached
// per-month in `narrative_cache`. The original brief said "cached per period,"
// but that predates the global date-range selector that now drives every
// section: a per-month cache can't answer "summarize 1 Jan – 14 Mar". Rule-based
// templating over in-memory data is instant and range-accurate, so caching buys
// nothing here. The `narrative_cache` table stays reserved for Phase 2 AI
// narratives, where generation is actually expensive.
//
// Each builder is a PURE function: (panelData, range) => SectionNarrative.
// No fetches, no side effects — trivially testable and recomputed on every
// range/refresh change via useMemo.

export type NarrativeTone = 'neutral' | 'positive' | 'caution';

export type NarrativePoint = {
  text: string;
  /** Drives the bullet marker colour. Defaults to 'neutral'. */
  tone?: NarrativeTone;
};

export type SectionNarrative = {
  /** One-sentence lead summarizing the hero metric for the range. */
  headline: string;
  /** Supporting insights — trends, top contributors, mix. */
  points: NarrativePoint[];
  /** Data-quality / honesty notes. Surfaced, never reconciled (supervisor #3). */
  caveats: NarrativePoint[];
  /** Most recent source-refresh time across the section's inputs ("as of"). */
  asOf?: string | null;
  /** True when there's no data in range — the card shows a gentle empty state. */
  empty?: boolean;
};

// Bump when the templating rules change materially. Surfaced in the card
// footnote and available if Phase 2 ever wants to invalidate cached narratives.
export const NARRATIVE_GENERATOR_VERSION = 'rule-based-v1';

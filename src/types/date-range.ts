export type IsoDate = string;

export type DateRange = {
  from: IsoDate;
  to: IsoDate;
};

export type DateRangePresetId =
  // Relative to today
  | 'this-month'
  | 'this-quarter'
  | 'last-30'
  | 'ytd'
  // Year-scoped quarters (resolved against a selected year)
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  // Year-scoped halves
  | 'h1'
  | 'h2'
  // Whole selected year, and the all-data catch-all (driven by the dropdown,
  // not rendered as preset buttons)
  | 'full-year'
  | 'all-time'
  // Anything not matching a named preset (incl. a single specific month)
  | 'custom';

// 'Special' groups the dropdown-driven presets (full-year / all-time) so they
// participate in matching/labelling but are never rendered as preset buttons.
export type DateRangePresetGroup = 'Relative' | 'Quarters' | 'Halves' | 'Special';

// Context passed to a preset resolver. Relative presets read `today`;
// year-scoped presets (quarters / halves) read `year`; 'all-time' reads
// `earliestDate` (ISO 'YYYY-MM-DD'), the dynamically-fetched earliest data date.
export type PresetResolveCtx = { today: Date; year: number; earliestDate?: string };

export type DateRangePreset = {
  id: DateRangePresetId;
  label: string;
  group: DateRangePresetGroup;
  // True for quarters / halves: their range depends on the selected year, not today.
  yearScoped: boolean;
  resolve: (ctx: PresetResolveCtx) => DateRange | null;
};

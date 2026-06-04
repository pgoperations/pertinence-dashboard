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
  // Fixed 2026 quarters
  | 'q1-2026'
  | 'q2-2026'
  | 'q3-2026'
  | 'q4-2026'
  // Fixed halves
  | 'h1-2026'
  | 'h2-2026'
  | 'h2-2025'
  // Anything not matching a named preset (incl. a single specific month)
  | 'custom';

export type DateRangePresetGroup = 'Relative' | 'Quarters' | 'Halves';

export type DateRangePreset = {
  id: DateRangePresetId;
  label: string;
  group: DateRangePresetGroup;
  resolve: (today: Date) => DateRange | null;
};

export type IsoDate = string;

export type DateRange = {
  from: IsoDate;
  to: IsoDate;
};

export type DateRangePresetId =
  | 'h1-2026'
  | 'h2-2025'
  | 'this-month'
  | 'this-quarter'
  | 'ytd'
  | 'last-30'
  | 'custom';

export type DateRangePreset = {
  id: DateRangePresetId;
  label: string;
  resolve: (today: Date) => DateRange | null;
};

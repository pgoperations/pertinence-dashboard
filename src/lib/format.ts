import { format, parseISO } from 'date-fns';

const NAIRA = '₦';

export function formatNaira(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return `${NAIRA}0`;
  return `${NAIRA}${formatNumber(value)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatNairaCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return `${NAIRA}0`;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${NAIRA}${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${NAIRA}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${NAIRA}${(value / 1_000).toFixed(1)}K`;
  return `${NAIRA}${value.toFixed(0)}`;
}

export function formatMonthShort(yyyymm: string): string {
  const d = parseISO(`${yyyymm}-01`);
  return format(d, 'MMM');
}

export function formatMonthYear(yyyymm: string): string {
  const d = parseISO(`${yyyymm}-01`);
  return format(d, 'MMM yyyy');
}

export function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(new Date(iso), "d MMM yyyy 'at' HH:mm");
}

// Source data mixes case: "OJEWUMI VICTOR" / "Ojewumi Victor" / "STAFF" / "SMR".
// Multi-token names → Title Case so the display is consistent across cards.
// Single-token sentinels / acronyms (STAFF, SMR, ASSETPLUS) stay as-typed —
// they read as labels, not personal names.
export function formatPersonName(raw: string | null | undefined): string {
  if (!raw) return '';
  if (!/\s/.test(raw)) return raw;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

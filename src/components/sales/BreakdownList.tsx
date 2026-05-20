export type BreakdownItem = {
  label: string;
  /** What's shown on the right side (already-formatted string). */
  display: string;
  /** Value used for the mini-bar width. Default 0 → no bar. */
  weight?: number;
};

export function BreakdownList({
  items,
  emptyMessage,
}: {
  items: BreakdownItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-slate-500">{emptyMessage ?? 'No data in this slice.'}</p>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.weight ?? 0));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const pct = item.weight ? (item.weight / max) * 100 : 0;
        return (
          <li key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-slate-700">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                {item.display}
              </span>
            </div>
            {item.weight !== undefined && (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

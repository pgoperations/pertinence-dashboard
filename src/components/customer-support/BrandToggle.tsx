import type { BrandFilter, CsBrand } from '../../lib/queries/customerSupport';

// Segmented control for switching the whole CS panel between PPL / RealVest / All.
// State is owned by the parent (CustomerSupportPage); this is presentation-only.
export function BrandToggle({
  brands,
  value,
  onChange,
  disabled,
}: {
  brands: CsBrand[];
  value: BrandFilter;
  onChange: (next: BrandFilter) => void;
  disabled?: boolean;
}) {
  // Surface brands in a stable order: PPL first (panel default per H1 PDF),
  // RealVest second, then "All". Anything else CS-flagged falls in alphabetically
  // ahead of "All" so future brands degrade gracefully.
  const ordered = [
    ...brands.filter((b) => b.slug === 'ppl'),
    ...brands.filter((b) => b.slug === 'realvest'),
    ...brands.filter((b) => b.slug !== 'ppl' && b.slug !== 'realvest'),
  ];

  type Opt = { id: BrandFilter; label: string };
  const opts: Opt[] = [
    ...ordered.map((b): Opt => ({ id: b.slug as BrandFilter, label: shortLabel(b) })),
    { id: 'all', label: 'All brands' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Brand filter"
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs font-medium"
    >
      {opts.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={[
              'rounded-md px-3 py-1.5 transition-colors cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              active
                ? 'bg-white text-accent shadow-sm ring-1 ring-inset ring-slate-200'
                : 'text-slate-600 hover:text-slate-900',
              disabled ? 'cursor-default opacity-60' : '',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function shortLabel(b: CsBrand): string {
  // "Pertinence Properties" is too long for the chip on mobile; the slug-based
  // shorthand "PPL" is what the supervisor uses in conversation and PDFs.
  if (b.slug === 'ppl') return 'PPL';
  if (b.slug === 'realvest') return 'RealVest';
  return b.name;
}

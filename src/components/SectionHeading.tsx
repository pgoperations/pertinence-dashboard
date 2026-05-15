import { useDateRange } from '../hooks/useDateRange';
import { formatRangeShort } from '../lib/dateRange';

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionHeading({ title, subtitle }: Props) {
  const { range } = useDateRange();
  return (
    <div className="mb-5 md:mb-6">
      <h1 className="font-heading text-xl font-semibold text-brand-900 md:text-2xl">
        {title}
      </h1>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-brand-500">
        {subtitle ? <span>{subtitle}</span> : null}
        {subtitle ? <span aria-hidden>•</span> : null}
        <span>{formatRangeShort(range)}</span>
      </div>
    </div>
  );
}

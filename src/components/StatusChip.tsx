import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'slate' | 'sky' | 'amber';

const TONE: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  sky:   'bg-sky-50  text-sky-800   ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
};

export function StatusChip({
  tone = 'slate',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

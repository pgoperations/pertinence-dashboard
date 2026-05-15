import clsx from 'clsx';
import { IconInfo } from './icons';
import type { ReactNode } from 'react';

type Tone = 'info' | 'pending' | 'ready';

const TONE: Record<Tone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export function StatusBanner({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={clsx(
        'flex gap-3 rounded-xl border p-3 md:p-4',
        TONE[tone],
      )}
    >
      <IconInfo className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {children ? <div className="mt-1 text-sm leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

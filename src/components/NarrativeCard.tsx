import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconSparkles, IconAlert, IconChevronRight } from './icons';
import type { NarrativeTone, SectionNarrative } from '../lib/narrative/types';

// Rule-based "automated insights" ticker. Sits under each section's hero
// numbers and rotates through plain-language insights derived from the loaded
// panel data — headline first, then supporting insights, then data-quality
// notes (which surface, never reconcile, per supervisor #3). One insight shows
// at a time; it auto-advances, pauses on hover/focus, and has prev/next +
// counter controls. Modelled on the CX portal's "Automated Insights" ticker.

const DOT: Record<NarrativeTone, string> = {
  neutral: 'bg-slate-300',
  positive: 'bg-accent',
  caution: 'bg-amber-400',
};

const ADVANCE_MS = 6000;
const FADE_MS = 300;

type Slide = { text: string; tone: NarrativeTone; kind: 'lead' | 'insight' | 'note' };

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function NarrativeCard({
  narrative,
  loading = false,
}: {
  narrative: SectionNarrative | null;
  loading?: boolean;
}) {
  const slides = useMemo<Slide[]>(() => {
    if (!narrative || narrative.empty) return [];
    const out: Slide[] = [];
    if (narrative.headline) out.push({ text: narrative.headline, tone: 'neutral', kind: 'lead' });
    for (const p of narrative.points) out.push({ text: p.text, tone: p.tone ?? 'neutral', kind: 'insight' });
    for (const c of narrative.caveats) out.push({ text: c.text, tone: c.tone ?? 'caution', kind: 'note' });
    return out;
  }, [narrative]);

  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade the current insight out, swap, then fade the next one in. `delta` is
  // relative (+1 next / -1 prev) so this needs no current-index dependency.
  const step = useCallback(
    (delta: number) => {
      setVisible(false);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        setIndex((i) => (i + delta + count) % count);
        setVisible(true);
      }, FADE_MS);
    },
    [count],
  );

  // Reset to the first insight whenever the data (and thus the slide set)
  // changes; cancel any in-flight fade so it can't land on a stale index.
  useEffect(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setIndex(0);
    setVisible(true);
  }, [slides]);

  // Clean up the fade timer on unmount.
  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

  // Auto-advance, unless paused, single-slide, or reduced-motion is preferred.
  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion) return;
    const id = setInterval(() => step(1), ADVANCE_MS);
    return () => clearInterval(id);
  }, [count, paused, step]);

  if (loading && !narrative) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-slate-100" />
          <span className="h-3 w-28 rounded bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="block h-3.5 w-full rounded bg-slate-100" />
          <span className="block h-3.5 w-3/5 rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (!narrative) return null;

  if (narrative.empty || count === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 md:p-5">
        <div className="flex items-center gap-2 text-slate-400">
          <IconSparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Automated insights</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">{narrative.headline}</p>
      </section>
    );
  }

  const current = slides[Math.min(index, count - 1)];

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center gap-3 border-l-[3px] border-accent p-4 md:p-5">
        <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-emphasis sm:grid">
          <IconSparkles className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-emphasis">
                Automated insights
              </span>
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent-emphasis">
                Auto
              </span>
            </div>

            {count > 1 && (
              <div className="flex shrink-0 items-center gap-1">
                <TickerButton label="Previous insight" onClick={() => step(-1)}>
                  <IconChevronRight className="h-4 w-4 rotate-180" />
                </TickerButton>
                <span className="min-w-[2.5rem] text-center text-[11px] tabular-nums text-slate-400">
                  {index + 1} / {count}
                </span>
                <TickerButton label="Next insight" onClick={() => step(1)}>
                  <IconChevronRight className="h-4 w-4" />
                </TickerButton>
              </div>
            )}
          </div>

          <div
            className={`mt-2 flex min-h-[2.5rem] items-start gap-2.5 transition duration-300 ease-in-out ${
              visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[current.tone]}`}
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-slate-700 md:text-[15px]">
              {current.kind === 'note' && (
                <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-100">
                  <IconAlert className="h-3 w-3" />
                  Note
                </span>
              )}
              <span className={current.kind === 'lead' ? 'font-medium text-slate-900' : undefined}>
                {current.text}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TickerButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {children}
    </button>
  );
}

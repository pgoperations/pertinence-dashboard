import { useEffect, useRef } from 'react';

// User-interaction signals that count as "still here". Bound on window with
// passive listeners so they never block scrolling/touch on mobile.
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

/**
 * Signs an idle user out after `timeoutMs` of no interaction. Wired once in
 * AuthProvider so it guards every authenticated page — the dashboard surfaces
 * sensitive financial data and the supervisor reviews it on a shared phone.
 *
 * Activity handlers are throttled to once a second so a busy mousemove stream
 * doesn't rearm the timer on every pixel. The timer still fires while the tab
 * is backgrounded, so a tab left open mid-session is logged out on schedule.
 */
export function useIdleTimeout({
  timeoutMs,
  onIdle,
  enabled,
}: {
  timeoutMs: number;
  onIdle: () => void;
  enabled: boolean;
}) {
  // Keep the latest callback without re-subscribing listeners every render.
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    let lastReset = 0;

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return; // throttle
      lastReset = now;
      arm();
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );
    arm();

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled, timeoutMs]);
}

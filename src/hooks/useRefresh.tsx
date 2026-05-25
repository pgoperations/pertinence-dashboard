import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// Lightweight refresh-trigger context. Each page's data-loading useEffect
// includes `counter` in its dep array, so calling `refresh()` re-runs every
// active page's load without a full reload. `refreshing` is held true for a
// short floor (600ms) so the header spinner stays visible even on fast loads.

type RefreshContextValue = {
  counter: number;
  refreshing: boolean;
  refresh: () => void;
};

const RefreshContext = createContext<RefreshContextValue | null>(null);

const SPIN_FLOOR_MS = 600;

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [counter, setCounter] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setCounter((c) => c + 1);
    setRefreshing(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setRefreshing(false);
      timeoutRef.current = null;
    }, SPIN_FLOOR_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <RefreshContext.Provider value={{ counter, refreshing, refresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh(): RefreshContextValue {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh must be used inside RefreshProvider');
  return ctx;
}

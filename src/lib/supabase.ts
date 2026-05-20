import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project values.',
  );
}

// In-memory lock replacement for the default navigator.locks-based one. The
// browser Lock API can hang indefinitely in certain Chrome profiles (extension
// interference, orphaned cross-tab locks) — observed 2026-05-20. For a
// single-tab dashboard a per-tab in-memory serializer is sufficient; the
// trade-off is that two simultaneously open tabs may race during token refresh
// (worst case: one tab gets a transient 401 and recovers via retry).
const lockTails = new Map<string, Promise<void>>();
async function inMemoryLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const prev = lockTails.get(name) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  lockTails.set(name, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (lockTails.get(name) === next) lockTails.delete(name);
  }
}

// Use sessionStorage (not the SDK default of localStorage) so the session is
// scoped to the browser tab: surviving a refresh but wiped when the tab closes.
// Closing and reopening the tab → fresh sign-in required, by design. Trade-off
// flagged 2026-05-20: duplicating to a second tab also requires re-login, since
// sessionStorage is per-tab. Acceptable for a single-tab supervisor dashboard.
export const supabase = createClient(url, anonKey, {
  auth: {
    lock: inMemoryLock,
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

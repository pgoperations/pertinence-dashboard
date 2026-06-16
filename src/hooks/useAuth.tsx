import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useIdleTimeout } from './useIdleTimeout';
import type { AuthStatus, Profile } from '../types/auth';

/** Auto sign-out after this much inactivity (data-sensitivity requirement). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * sessionStorage marker set the moment we sign out for inactivity, so the
 * sign-in page can explain *why* the user landed back there. Tab-scoped, like
 * the supabase auth session, and cleared once read.
 */
export const IDLE_SIGNOUT_FLAG = 'pg.idleSignout';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Sends a password-recovery email whose link lands on /reset-password. */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Sets a new password on the current (recovery or live) session. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`auth check timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] failed to load profile', error);
    return null;
  }
  return data as Profile | null;
}

// Derive a minimal Profile from the session itself so the UI can render
// (avatar initial, header email) even when the `profiles` row hasn't loaded.
// Used as a fallback when loadProfile times out / errors — without this, a
// fresh sign-in stalls on the sign-in page until the user refreshes (which
// re-hydrates from sessionStorage and the second loadProfile usually succeeds).
function fallbackProfileFromSession(session: Session): Profile {
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    full_name: (session.user.user_metadata?.full_name as string | undefined) ?? null,
    role: 'viewer',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let mounted = true;

    // Race loadProfile against a short timeout. The PostgREST call can stall on
    // a freshly-issued session (sessionStorage write + supabase-js lock interplay
    // observed during the first sign-in event of a tab). Falling back to a
    // session-derived profile keeps the user moving — the real profile fills in
    // on the next successful query, or on the next sign-in.
    async function resolveProfile(session: Session): Promise<Profile> {
      try {
        const p = await withTimeout(loadProfile(session.user.id), 4000);
        return p ?? fallbackProfileFromSession(session);
      } catch (err) {
        console.warn('[auth] loadProfile timed out or failed — using session fallback', err);
        return fallbackProfileFromSession(session);
      }
    }

    // If getSession() hangs (corporate proxy blocking *.supabase.co, stale refresh
    // token that the SDK retries forever, etc.) we still need the app to bail to
    // the sign-in screen instead of sitting on "Loading…" indefinitely. Race the
    // SDK call against an 8-second timeout and fall through on reject.
    withTimeout(supabase.auth.getSession(), 8000)
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          const p = await resolveProfile(data.session);
          if (!mounted) return;
          setProfile(p);
          setStatus('signed-in');
        } else {
          setStatus('signed-out');
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        console.error('[auth] getSession failed or timed out — falling through to signed-out', err);
        setSession(null);
        setProfile(null);
        setStatus('signed-out');
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        const p = await resolveProfile(newSession);
        if (!mounted) return;
        setProfile(p);
        setStatus('signed-in');
      } else {
        setProfile(null);
        setStatus('signed-out');
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Inactivity guard: only armed while signed in. On expiry, leave a marker for
  // the sign-in page then sign out — onAuthStateChange flips status to
  // signed-out and ProtectedRoute redirects to /sign-in.
  useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    enabled: status === 'signed-in',
    onIdle: () => {
      try {
        sessionStorage.setItem(IDLE_SIGNOUT_FLAG, '1');
      } catch {
        /* storage unavailable — sign out anyway */
      }
      void supabase.auth.signOut();
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      requestPasswordReset: async (email) => {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { error: error?.message ?? null };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
    }),
    [status, session, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

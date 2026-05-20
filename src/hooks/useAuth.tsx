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
import type { AuthStatus, Profile } from '../types/auth';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let mounted = true;

    // If getSession() hangs (corporate proxy blocking *.supabase.co, stale refresh
    // token that the SDK retries forever, etc.) we still need the app to bail to
    // the sign-in screen instead of sitting on "Loading…" indefinitely. Race the
    // SDK call against an 8-second timeout and fall through on reject.
    withTimeout(supabase.auth.getSession(), 8000)
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          const p = await loadProfile(data.session.user.id);
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
        const p = await loadProfile(newSession.user.id);
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

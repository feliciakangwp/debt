import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Session } from '../lib/supabaseClient';

interface AuthContextValue {
  session: Session | null;
  userEmail: string | null;
  /** True once the initial getSession() call (and, if logged in, the
   * editors lookup) has resolved — avoids flashing the login screen for
   * a split second while a real session is still being restored. */
  initializing: boolean;
  /** True while a Supabase password-reset link's recovery session is
   * active — the app shows the "set your password" screen instead of
   * the normal app (or the login screen) until it's cleared. */
  isPasswordRecovery: boolean;
  /** Whether the logged-in user's email is in the editors table. Only
   * used to hide add/edit/delete controls in the UI — the database's own
   * row-level security policies are the real enforcement. */
  isEditor: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  /** Dismisses the "set your password" screen after a successful
   * recovery-link password change, returning to the normal app. */
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isEditor, setIsEditor] = useState(false);

  const userEmail = session?.user?.email ?? null;

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!userEmail) {
      setIsEditor(false);
      return;
    }
    supabase
      .from('editors')
      .select('email')
      .eq('email', userEmail)
      .then(({ data, error }) => {
        if (!active) return;
        setIsEditor(!error && Array.isArray(data) && data.length > 0);
      });
    return () => {
      active = false;
    };
  }, [userEmail]);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const changePassword = async (newPassword: string): Promise<string | null> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? error.message : null;
  };

  const requestPasswordReset = async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    return error ? error.message : null;
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userEmail,
      initializing,
      isPasswordRecovery,
      isEditor,
      signIn,
      signOut,
      changePassword,
      requestPasswordReset,
      clearPasswordRecovery,
    }),
    [session, userEmail, initializing, isPasswordRecovery, isEditor],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

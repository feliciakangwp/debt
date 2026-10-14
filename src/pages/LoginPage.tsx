import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { signIn, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    setSubmitting(false);
    if (message) setError(message);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSubmitting(true);
    setResetError(null);
    setResetMessage(null);
    const message = await requestPasswordReset(resetEmail.trim());
    setResetSubmitting(false);
    if (message) setResetError(message);
    else setResetMessage('If that email has an account, a password-reset link is on its way.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold tracking-wide text-brand-navy">Debt Management</div>
          <div className="text-xs text-slate-500">Module</div>
        </div>

        {!showReset ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowReset(true);
                setResetEmail(email);
                setResetMessage(null);
                setResetError(null);
              }}
              className="w-full text-center text-xs font-medium text-brand-navy underline decoration-dotted hover:text-brand-gold"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter your email and we'll send you a link to set a new password.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
              <input
                type="email"
                autoComplete="username"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                placeholder="you@example.com"
                autoFocus
              />
            </div>

            {resetMessage && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {resetMessage}
              </div>
            )}
            {resetError && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                {resetError}
              </div>
            )}

            <button
              type="submit"
              disabled={resetSubmitting || !resetEmail.trim()}
              className="w-full rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetSubmitting ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="w-full text-center text-xs font-medium text-slate-500 underline decoration-dotted hover:text-brand-navy"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

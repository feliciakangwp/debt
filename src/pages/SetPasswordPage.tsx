import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SetPasswordPageProps {
  /** 'recovery': full-screen gate shown after clicking a password-reset
   * link, with no way to back out. 'change': a dismissible modal a
   * logged-in user opens on their own, e.g. to replace a temporary
   * password. */
  variant: 'recovery' | 'change';
  onDone: () => void;
  onCancel?: () => void;
}

export function SetPasswordPage({ variant, onDone, onCancel }: SetPasswordPageProps) {
  const { changePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmPassword !== '' && password !== confirmPassword;
  const canSubmit = password.length >= 8 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const message = await changePassword(password);
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    onDone();
  };

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        {variant === 'recovery'
          ? 'Set a new password for your account to continue.'
          : 'Replace your password — e.g. if you were given a temporary one.'}
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
          placeholder="At least 8 characters"
          autoFocus
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">Confirm new password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
          placeholder="Re-enter the password"
        />
        {mismatch && <p className="mt-1 text-xs text-red-600">Passwords don't match.</p>}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="flex gap-2">
        {variant === 'change' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="flex-1 rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  );

  if (variant === 'recovery') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="text-xl font-bold tracking-wide text-brand-navy">Set your password</div>
          </div>
          {form}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-3">
          <h2 className="text-lg font-semibold text-white">Change Password</h2>
          <button onClick={onCancel} className="text-white/70 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-5">{form}</div>
      </div>
    </div>
  );
}

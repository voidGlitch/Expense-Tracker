/**
 * Enhanced AuthView: Beautiful modern authentication page with responsive card,
 * subtle background gradients, and smooth toggle animations
 */
import { useState } from 'react';
import { PiggyBank, ShieldCheck, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../state/AuthContext.jsx';
import { Banner, Button, Field, TextInput } from '../components/ui.jsx';

const BLANK = { name: '', email: '', password: '' };

export default function AuthView() {
  const { signIn, signUp, bootError } = useAuth();
  const [mode, setMode] = useState('signIn');
  const [form, setForm] = useState(BLANK);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setFieldErrors({});
  };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isRegister) await signUp({ name: form.name, email: form.email, password: form.password });
      else await signIn({ email: form.email, password: form.password });
    } catch (caught) {
      setError(caught.message);
      setFieldErrors(caught.fieldErrors || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      {/* Decorative gradient blur background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 size-80 rounded-full bg-purple-500/10 dark:bg-purple-500/15 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-xl shadow-indigo-500/25 mb-2">
            <PiggyBank size={28} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Expense Manager</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Set your recurring bills once. Let your monthly budget and daily allowance manage itself.
          </p>
        </div>

        {bootError && (
          <Banner variant="warn" title="Server unreachable">
            {bootError}
          </Banner>
        )}

        {/* Card */}
        <div className="rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-1">
            {[
              ['signIn', 'Sign In'],
              ['register', 'Create Account'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                  mode === value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="space-y-4" onSubmit={submit} noValidate>
            {isRegister && (
              <Field label="Your Name" htmlFor="name" error={fieldErrors.name}>
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    id="name"
                    autoComplete="name"
                    placeholder="Jane Doe"
                    value={form.name}
                    onChange={set('name')}
                    error={fieldErrors.name}
                    className="pl-9 h-11"
                  />
                </div>
              </Field>
            )}

            <Field label="Email Address" htmlFor="email" error={fieldErrors.email}>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <TextInput
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={set('email')}
                  error={fieldErrors.email}
                  className="pl-9 h-11"
                  required
                />
              </div>
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={fieldErrors.password}
              hint={isRegister ? 'At least 8 characters with letters & numbers' : undefined}
            >
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <TextInput
                  id="password"
                  type="password"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  error={fieldErrors.password}
                  className="pl-9 h-11"
                  required
                />
              </div>
            </Field>

            {error && <Banner variant="error">{error}</Banner>}

            <Button
              type="submit"
              variant="primary"
              busy={busy}
              className="w-full h-11 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 transition-all text-sm font-semibold"
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Secure end-to-end encryption with salted bcrypt hashes</span>
        </div>
      </div>
    </div>
  );
}

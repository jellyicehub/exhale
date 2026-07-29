'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      // Supabase sets its own session cookies via @supabase/ssr — no manual cookie needed
      router.push(redirect);
      router.refresh();
    } catch (err: unknown) {
      setError(friendlyError(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }

  function friendlyError(msg: string): string {
    if (msg.toLowerCase().includes('invalid login credentials') ||
        msg.toLowerCase().includes('invalid email or password'))
      return 'Invalid email or password.';
    if (msg.toLowerCase().includes('email not confirmed'))
      return 'Please confirm your email before signing in.';
    if (msg.toLowerCase().includes('too many requests'))
      return 'Too many attempts. Please try again later.';
    return 'Sign in failed. Please try again.';
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label className="form-label" htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          className="form-input"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="form-input"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          minLength={6}
        />
      </div>

      <button
        id="login-submit"
        type="submit"
        className="btn btn-primary btn-full btn-lg"
        disabled={loading}
      >
        {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="navbar-brand-dot" />
          <span className="auth-logo-text">EXHALE</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your acidity monitoring dashboard</p>

        <Suspense fallback={
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Loading…
          </div>
        }>
          <LoginForm />
        </Suspense>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/signup">Create one</Link>
        </div>
      </div>
    </div>
  );
}

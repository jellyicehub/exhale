'use client';

export const dynamic = 'force-dynamic';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth';

const GENDERS = ['Male', 'Female', 'Other'] as const;

export default function SignupPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [age,      setAge]      = useState('');
  const [gender,   setGender]   = useState<typeof GENDERS[number]>('Male');
  const [birthday, setBirthday] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim())                        { setError('Please enter your name.'); return; }
    if (parseInt(age) < 1 || parseInt(age) > 120) { setError('Please enter a valid age.'); return; }

    setLoading(true);
    try {
      await signUp(email, password, {
        name:     name.trim(),
        age:      parseInt(age),
        gender,
        birthday,
      });
      // Supabase sets session cookies automatically
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(friendlyError(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }

  function friendlyError(msg: string): string {
    if (msg.toLowerCase().includes('user already registered') ||
        msg.toLowerCase().includes('already been registered'))
      return 'That email is already registered.';
    if (msg.toLowerCase().includes('password'))
      return 'Password must be at least 6 characters.';
    if (msg.toLowerCase().includes('invalid email'))
      return 'Please enter a valid email address.';
    return 'Sign up failed. Please try again.';
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className="auth-logo">
          <div className="navbar-brand-dot" />
          <span className="auth-logo-text">EXHALE</span>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Enter your details to get started</p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">Full name</label>
            <input id="signup-name" type="text" className="form-input"
              placeholder="Jane Smith" value={name}
              onChange={e => setName(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">Email address</label>
            <input id="signup-email" type="email" className="form-input"
              placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" className="form-input"
              placeholder="At least 6 characters" value={password}
              onChange={e => setPassword(e.target.value)} required
              autoComplete="new-password" minLength={6} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-age">Age</label>
              <input id="signup-age" type="number" className="form-input"
                placeholder="25" value={age}
                onChange={e => setAge(e.target.value)} required min={1} max={120} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-gender">Gender</label>
              <select id="signup-gender" className="form-select"
                value={gender} onChange={e => setGender(e.target.value as typeof GENDERS[number])}>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-birthday">Birthday</label>
            <input id="signup-birthday" type="date" className="form-input"
              value={birthday} onChange={e => setBirthday(e.target.value)} required />
          </div>

          <button id="signup-submit" type="submit"
            className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account…</> : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

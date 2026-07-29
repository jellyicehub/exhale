'use client';

import { useState, useEffect, FormEvent } from 'react';
import { onAuthChange, updatePassword } from '@/lib/auth';
import { getUser, updateUser } from '@/lib/users';
import type { User } from '@supabase/supabase-js';

const GENDERS = ['Male', 'Female', 'Other'] as const;

export default function ProfilePage() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name,     setName]     = useState('');
  const [age,      setAge]      = useState('');
  const [gender,   setGender]   = useState('Male');
  const [birthday, setBirthday] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState('');

  // Password form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [savingPw,    setSavingPw]    = useState(false);
  const [pwMsg,       setPwMsg]       = useState('');

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      if (u) {
        const p = await getUser(u.id);
        if (p) {
          setName(p.name);
          setAge(String(p.age ?? ''));
          setGender(p.gender ?? 'Male');
          setBirthday(p.birthday ?? '');
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg('');
    try {
      await updateUser(user.id, {
        name,
        age:      parseInt(age),
        gender:   gender as typeof GENDERS[number],
        birthday,
      });
      setProfileMsg('Profile updated successfully.');
    } catch {
      setProfileMsg('Failed to save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPw)  { setPwMsg('Passwords do not match.'); return; }
    if (newPassword.length < 6)     { setPwMsg('Password must be at least 6 characters.'); return; }
    setSavingPw(true);
    setPwMsg('');
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPw('');
      setPwMsg('Password changed successfully.');
    } catch {
      setPwMsg('Failed to change password. Please try again.');
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) return (
    <div className="loading-page">
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1>Profile</h1>
        <p>Manage your personal information and account security</p>
      </div>

      {/* Personal Information */}
      <div className="profile-section">
        <div className="profile-section-title">Personal Information</div>

        {profileMsg && (
          <div className={`alert ${profileMsg.includes('success') ? 'alert-success' : 'alert-error'}`}
               style={{ marginBottom: 'var(--space-5)' }}>
            {profileMsg}
          </div>
        )}

        <form onSubmit={handleSaveProfile}>
          <div className="profile-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="profile-name">Full name</label>
              <input id="profile-name" type="text" className="form-input"
                     value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-age">Age</label>
              <input id="profile-age" type="number" className="form-input"
                     value={age} onChange={e => setAge(e.target.value)} required min={1} max={120} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-gender">Gender</label>
              <select id="profile-gender" className="form-select"
                      value={gender} onChange={e => setGender(e.target.value)}>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-birthday">Birthday</label>
              <input id="profile-birthday" type="date" className="form-input"
                     value={birthday} onChange={e => setBirthday(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <button id="save-profile" type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? <><span className="spinner" /> Saving…</> : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Account Security */}
      <div className="profile-section">
        <div className="profile-section-title">Account</div>

        <div style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          Signed in as: <strong style={{ color: 'var(--color-text-primary)' }}>{user?.email}</strong>
        </div>

        {pwMsg && (
          <div className={`alert ${pwMsg.includes('success') ? 'alert-success' : 'alert-error'}`}
               style={{ marginBottom: 'var(--space-5)' }}>
            {pwMsg}
          </div>
        )}

        <form onSubmit={handleChangePassword} style={{ maxWidth: 360 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New password</label>
              <input id="new-password" type="password" className="form-input"
                     placeholder="At least 6 characters" value={newPassword}
                     onChange={e => setNewPassword(e.target.value)}
                     autoComplete="new-password" minLength={6} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" className="form-input"
                     placeholder="Repeat new password" value={confirmPw}
                     onChange={e => setConfirmPw(e.target.value)}
                     autoComplete="new-password" minLength={6} required />
            </div>
            <div>
              <button id="change-password" type="submit" className="btn btn-secondary" disabled={savingPw}>
                {savingPw ? <><span className="spinner" /> Updating…</> : 'Change password'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

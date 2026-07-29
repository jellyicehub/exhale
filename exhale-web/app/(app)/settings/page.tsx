'use client';

import { useState, useEffect } from 'react';
import { onAuthChange } from '@/lib/auth';
import { getActiveUser } from '@/lib/users';
import { deleteReadings } from '@/lib/readings';
import type { User } from '@supabase/supabase-js';

export default function SettingsPage() {
  const [user,        setUser]        = useState<User | null>(null);
  const [activeUser,  setActiveUser_] = useState<{ name: string | null } | null>(null);
  const [clearing,    setClearing]    = useState(false);
  const [clearMsg,    setClearMsg]    = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      const config = await getActiveUser();
      if (config?.active_user_id) {
        setActiveUser_({ name: config.active_user_name });
      }
    });
    return unsub;
  }, []);

  async function handleClearMyReadings() {
    if (!user) return;
    setClearing(true);
    setClearMsg('');
    try {
      await deleteReadings(user.id);
      setClearMsg('Your readings have been cleared.');
    } catch {
      setClearMsg('Failed to clear readings. Please try again.');
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Device status and data management</p>
      </div>

      {/* Device Status */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-title">Device Status</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', width: 120 }}>Device ID</span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-accent)' }}>
              exhale-device-01
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', width: 120 }}>Active user</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
              {activeUser?.name ?? '— Not set —'}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
            Change the active user from the <a href="/">Dashboard</a> → Active User Picker.
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card danger-zone">
        <div className="card-title">Data Management</div>

        {clearMsg && (
          <div className={`alert ${clearMsg.includes('cleared') ? 'alert-success' : 'alert-error'}`}
               style={{ marginBottom: 'var(--space-5)' }}>
            {clearMsg}
          </div>
        )}

        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Clear my readings</strong><br />
            Permanently deletes all breath readings associated with your account. This cannot be undone.
          </p>

          {!showConfirm ? (
            <button id="clear-readings-btn" type="button"
              className="btn btn-danger" onClick={() => setShowConfirm(true)}>
              Clear my readings
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-danger)' }}>
                Are you sure? This is permanent.
              </span>
              <button id="confirm-clear-readings" type="button"
                className="btn btn-danger" onClick={handleClearMyReadings} disabled={clearing}>
                {clearing ? <><span className="spinner" /> Clearing…</> : 'Yes, delete all'}
              </button>
              <button id="cancel-clear-readings" type="button"
                className="btn btn-secondary btn-sm" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

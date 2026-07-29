'use client';

import { useState, useEffect } from 'react';
import { getAllUsers, setActiveUser, getActiveUser } from '@/lib/users';
import type { UserDoc } from '@/lib/users';

export default function ActiveUserPicker() {
  const [users,        setUsers]        = useState<UserDoc[]>([]);
  const [activeId,     setActiveId]     = useState('');
  const [saving,       setSaving]       = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [allUsers, config] = await Promise.all([
          getAllUsers(),
          getActiveUser(),
        ]);
        setUsers(allUsers);
        if (config?.active_user_id) setActiveId(config.active_user_id);
      } catch (err) {
        console.error('Failed to load users/config', err);
      } finally {
        setLoadingUsers(false);
      }
    }
    load();
  }, []);

  async function handleChange(uid: string) {
    setActiveId(uid);
    setSaving(true);
    try {
      const user = users.find(u => u.id === uid);
      await setActiveUser(uid, user?.name ?? '');
    } catch (err) {
      console.error('Failed to set active user', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-picker-wrapper">
      <span className="user-picker-label">🫁 Active user on device:</span>

      {loadingUsers ? (
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Loading…</span>
      ) : users.length === 0 ? (
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No users found</span>
      ) : (
        <select
          id="active-user-picker"
          className="user-picker-select"
          value={activeId}
          onChange={e => handleChange(e.target.value)}
          disabled={saving}
        >
          <option value="">— Select a user —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} (Age {u.age})
            </option>
          ))}
        </select>
      )}

      <div
        className="user-picker-indicator"
        title={saving ? 'Saving…' : 'Device synced'}
        style={saving ? {
          background:  'var(--color-warning)',
          boxShadow:   '0 0 6px var(--color-warning)',
        } : {}}
      />
    </div>
  );
}

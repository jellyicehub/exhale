'use client';

import { useState, useEffect, useRef } from 'react';
import { onAuthChange, signOut } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { getSupabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import type { User } from '@supabase/supabase-js';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user,     setUser]     = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [loading,  setLoading]  = useState(true);
  const userRef = useRef<User | null>(null); // ref so beforeunload can read latest user

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      userRef.current = u;
      if (u) {
        try {
          const profile = await getUser(u.id);
          setUserName(profile?.name ?? u.email ?? '');
        } catch {
          setUserName(u.email ?? '');
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Auto sign-out when the tab is closed ──────────────────────────────────
  useEffect(() => {
    const handleUnload = async () => {
      // Clear the active user from device_config so the ESP32 stops uploading
      if (userRef.current) {
        try {
          await getSupabase()
            .from('device_config')
            .update({ active_user_id: null, active_user_name: null })
            .eq('id', 1);
        } catch { /* best-effort */ }
        await signOut();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // ── Realtime: sign out this tab if another user takes over the session ────
  useEffect(() => {
    if (!user) return;

    const channel = getSupabase()
      .channel('device_config_session')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_config' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          const newActiveUserId = payload.new?.active_user_id;
          // If device_config now points to a DIFFERENT user, force sign-out here
          if (newActiveUserId && newActiveUserId !== user.id) {
            console.log('[Session] Another user logged in — signing out this session.');
            await signOut();
            window.location.href = '/login?reason=another_user';
          }
        }
      )
      .subscribe();

    return () => { getSupabase().removeChannel(channel); };
  }, [user]);

  if (loading) {
    return (
      <div className="loading-page">
        <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) return null; // middleware handles redirect

  return (
    <div className="page-wrapper">
      <Navbar userName={userName} />
      <main className="main-content">{children}</main>
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthChange } from '@/lib/auth';
import { getUser } from '@/lib/users';
import Navbar from '@/components/Navbar';
import type { User } from '@supabase/supabase-js';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user,     setUser]     = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
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

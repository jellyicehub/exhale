'use client';
import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

export default function DeviceStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const { data } = await getSupabase()
          .from('device_config')
          .select('updated_at')
          .eq('device_id', 'exhale-device-01')
          .single();
          
        if (data) {
          const time = new Date(data.updated_at);
          setLastSeen(time);
          setIsOnline(Date.now() - time.getTime() < 90000); // 90 seconds threshold
        }
      } catch (err) {
        console.error("Failed to check device status", err);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '0.5rem', 
      fontSize: '0.85rem',
      background: 'var(--color-bg-elevated)',
      padding: '0.4rem 0.8rem',
      borderRadius: 'var(--radius-full)',
      border: '1px solid var(--color-border)'
    }}>
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: isOnline ? 'var(--color-success)' : 'var(--color-text-muted)',
        boxShadow: isOnline ? '0 0 8px var(--color-success)' : 'none',
        transition: 'all 0.3s ease'
      }} />
      <span style={{ color: 'var(--color-text-secondary)' }}>
        Device: <strong style={{ color: 'var(--color-text-primary)' }}>{isOnline ? 'Online' : 'Offline'}</strong>
        {!isOnline && lastSeen && ` (Last seen ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
      </span>
    </div>
  );
}
